import { Storage } from '@google-cloud/storage';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

class StorageService {
  private storage?: Storage;
  private bucket?: any;
  private useGCS: boolean = false;

  constructor() {
    this.initializeStorage();
  }

  private initializeStorage() {
    try {
      const projectId = process.env.GCS_PROJECT_ID;
      const bucketName = process.env.GCS_BUCKET_NAME;
      const keyFilePath = process.env.GCS_KEY_FILE_PATH;

      if (projectId && bucketName) {
        const config: any = { projectId };

        if (keyFilePath && fs.existsSync(keyFilePath)) {
          config.keyFilename = keyFilePath;
        }

        this.storage = new Storage(config);
        this.bucket = this.storage.bucket(bucketName);
        this.useGCS = true;
        console.log('✅ Google Cloud Storage initialized');
      } else {
        console.log('⚠️  Using local storage (GCS not configured)');
      }
    } catch (error) {
      console.error('Failed to initialize GCS:', error);
      console.log('⚠️  Falling back to local storage');
    }
  }

  async uploadImage(file: Express.Multer.File): Promise<string | null> {
    try {
      if (this.useGCS && this.bucket) {
        return await this.uploadToGCS(file);
      } else {
        return await this.uploadToLocal(file);
      }
    } catch (error) {
      console.error('Upload error:', error);
      return null;
    }
  }

  private async uploadToGCS(file: Express.Multer.File): Promise<string> {
    const filename = `locations/${Date.now()}_${file.originalname}`;
    const blob = this.bucket!.file(filename);

    const stream = blob.createWriteStream({
      metadata: {
        contentType: file.mimetype,
      },
    });

    return new Promise((resolve, reject) => {
      stream.on('error', reject);
      stream.on('finish', async () => {
        // Don't call makePublic when uniform bucket-level access is enabled
        // The bucket should be configured with public access at the bucket level
        const publicUrl = `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${filename}`;
        resolve(publicUrl);
      });
      stream.end(file.buffer);
    });
  }

  private async uploadToLocal(file: Express.Multer.File): Promise<string> {
    const uploadDir = path.join(__dirname, '../../uploads/locations');

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filename = `${Date.now()}_${file.originalname}`;
    const filePath = path.join(uploadDir, filename);

    fs.writeFileSync(filePath, file.buffer);

    return `/uploads/locations/${filename}`;
  }

  /**
   * Upload image from base64 string
   * @param base64Data - Base64 encoded image data (with or without data URI prefix)
   * @returns URL of the uploaded image or null on failure
   */
  async uploadBase64Image(base64Data: string): Promise<string | null> {
    try {
      if (!base64Data || typeof base64Data !== 'string') {
        console.error('[uploadBase64Image] Invalid input: base64Data is empty or not a string');
        return null;
      }

      console.log('[uploadBase64Image] Processing image, data length:', base64Data.length);

      // Remove data URI prefix if present (e.g., "data:image/png;base64,")
      let base64String = base64Data;
      let mimeType = 'image/png'; // default
      let extension = 'png';

      // Try to match data URI format: data:image/png;base64,xxxxx
      const dataUriMatch = base64Data.match(/^data:([^;,]+)(?:;[^,]*)?,(.+)$/s);
      if (dataUriMatch) {
        mimeType = dataUriMatch[1];
        base64String = dataUriMatch[2];
        console.log('[uploadBase64Image] Extracted from data URI - mimeType:', mimeType);
        
        // Extract extension from mime type
        const extMatch = mimeType.match(/image\/(\w+)/);
        if (extMatch) {
          extension = extMatch[1] === 'jpeg' ? 'jpg' : extMatch[1];
        }
      } else {
        // Try to detect image type from base64 header bytes
        const headerBytes = base64String.substring(0, 20);
        if (headerBytes.startsWith('/9j/')) {
          mimeType = 'image/jpeg';
          extension = 'jpg';
        } else if (headerBytes.startsWith('iVBORw')) {
          mimeType = 'image/png';
          extension = 'png';
        } else if (headerBytes.startsWith('R0lGOD')) {
          mimeType = 'image/gif';
          extension = 'gif';
        } else if (headerBytes.startsWith('UklGR')) {
          mimeType = 'image/webp';
          extension = 'webp';
        }
        console.log('[uploadBase64Image] Detected from header - mimeType:', mimeType);
      }

      // Clean up base64 string (remove whitespace, newlines)
      base64String = base64String.replace(/[\s\n\r]/g, '');

      // Convert base64 to buffer
      const buffer = Buffer.from(base64String, 'base64');
      
      if (buffer.length === 0) {
        console.error('[uploadBase64Image] Buffer is empty after base64 decode');
        return null;
      }
      
      console.log('[uploadBase64Image] Buffer size:', buffer.length, 'bytes');

      // Generate unique filename
      const uniqueId = crypto.randomBytes(8).toString('hex');
      const filename = `${Date.now()}_${uniqueId}.${extension}`;

      // Create a pseudo-file object for the upload methods
      const pseudoFile: Express.Multer.File = {
        fieldname: 'image',
        originalname: filename,
        encoding: '7bit',
        mimetype: mimeType,
        buffer: buffer,
        size: buffer.length,
        destination: '',
        filename: filename,
        path: '',
        stream: null as any,
      };

      let result: string;
      if (this.useGCS && this.bucket) {
        console.log('[uploadBase64Image] Uploading to GCS...');
        result = await this.uploadToGCS(pseudoFile);
      } else {
        console.log('[uploadBase64Image] Uploading to local storage...');
        result = await this.uploadToLocal(pseudoFile);
      }
      
      console.log('[uploadBase64Image] Upload successful:', result);
      return result;
    } catch (error) {
      console.error('[uploadBase64Image] Error:', error);
      return null;
    }
  }

  async deleteImage(imageUrl: string): Promise<boolean> {
    try {
      if (this.useGCS && this.bucket && imageUrl.includes('storage.googleapis.com')) {
        return await this.deleteFromGCS(imageUrl);
      } else {
        return await this.deleteFromLocal(imageUrl);
      }
    } catch (error) {
      console.error('Delete error:', error);
      return false;
    }
  }

  private async deleteFromGCS(imageUrl: string): Promise<boolean> {
    const bucketName = process.env.GCS_BUCKET_NAME;
    const regex = new RegExp(`https://storage\\.googleapis\\.com/${bucketName}/(.+)`);
    const match = imageUrl.match(regex);

    if (match && match[1]) {
      const filename = match[1];
      await this.bucket!.file(filename).delete();
      return true;
    }

    return false;
  }

  private async deleteFromLocal(imageUrl: string): Promise<boolean> {
    const filename = imageUrl.replace('/uploads/locations/', '');
    const filePath = path.join(__dirname, '../../uploads/locations', filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }

    return false;
  }
}

// Multer configuration
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

export default new StorageService();