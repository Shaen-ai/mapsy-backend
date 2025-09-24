import mongoose, { Document, Schema } from 'mongoose';

export interface IWidgetConfig extends Document {
  defaultView: 'map' | 'list';
  showHeader: boolean;
  headerTitle?: string;
  mapZoomLevel?: number;
  primaryColor?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WidgetConfigSchema = new Schema<IWidgetConfig>(
  {
    defaultView: {
      type: String,
      enum: ['map', 'list'],
      default: 'map'
    },
    showHeader: {
      type: Boolean,
      default: true
    },
    headerTitle: {
      type: String,
      default: 'Our Locations'
    },
    mapZoomLevel: {
      type: Number,
      default: 12,
      min: 1,
      max: 20
    },
    primaryColor: {
      type: String,
      default: '#3B82F6'
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

export default mongoose.model<IWidgetConfig>('WidgetConfig', WidgetConfigSchema);