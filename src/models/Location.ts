import mongoose, { Document, Schema } from 'mongoose';

export interface BusinessHours {
  mon?: string;
  tue?: string;
  wed?: string;
  thu?: string;
  fri?: string;
  sat?: string;
  sun?: string;
}

export interface ILocation extends Document {
  name: string;
  address: string;
  phone?: string;
  email?: string;
  website?: string;
  business_hours?: BusinessHours;
  category: 'restaurant' | 'store' | 'office' | 'service' | 'other';
  image_url?: string;
  latitude?: number;
  longitude?: number;
  instanceId?: string;  // Wix instance ID - links location to specific Wix site
  compId?: string; // Wix component ID - allows multiple widgets per site
  createdAt: Date;
  updatedAt: Date;
}

const LocationSchema = new Schema<ILocation>(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    address: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    website: {
      type: String,
      trim: true
    },
    business_hours: {
      mon: String,
      tue: String,
      wed: String,
      thu: String,
      fri: String,
      sat: String,
      sun: String
    },
    category: {
      type: String,
      enum: ['restaurant', 'store', 'office', 'service', 'other'],
      default: 'store'
    },
    image_url: String,
    latitude: {
      type: Number,
      min: -90,
      max: 90
    },
    longitude: {
      type: Number,
      min: -180,
      max: 180
    },
    instanceId: {
      type: String,
      index: true,
      sparse: true  // Allow null for backward compatibility with existing locations
    },
    compId: {
      type: String,
      index: true,
      sparse: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Index for geospatial queries (optional)
LocationSchema.index({ latitude: 1, longitude: 1 });

// Index for instance-based queries (for Wix multi-tenancy)
LocationSchema.index({ instanceId: 1 });
LocationSchema.index({ instanceId: 1, compId: 1 });

export default mongoose.model<ILocation>('Location', LocationSchema);
