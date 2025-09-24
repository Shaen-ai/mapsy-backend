import { Storage } from '@google-cloud/storage';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

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
    fileSize: 5 * 1024 * 1024 // 5MB limit
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