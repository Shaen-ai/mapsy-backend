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
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Index for geospatial queries (optional)
LocationSchema.index({ latitude: 1, longitude: 1 });

export default mongoose.model<ILocation>('Location', LocationSchema);