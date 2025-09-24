import mongoose, { Document, Schema } from 'mongoose';

export interface IAppConfig extends Document {
  app_id: string;
  widget_config: {
    defaultView: 'map' | 'list';
    showHeader: boolean;
    headerTitle: string;
    mapZoomLevel: number;
    primaryColor: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const AppConfigSchema = new Schema<IAppConfig>(
  {
    app_id: {
      type: String,
      required: true,
      unique: true,
      default: 'mapsy-default'
    },
    widget_config: {
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
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

export default mongoose.model<IAppConfig>('AppConfig', AppConfigSchema);