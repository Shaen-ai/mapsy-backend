import mongoose, { Document, Schema } from 'mongoose';

export type PremiumPlanName = 'free' | 'light' | 'business' | 'business-pro';

export interface IAppConfig extends Document {
  app_id: string;
  instanceId?: string;
  compId?: string;
  widgetName?: string;
  premiumPlanName?: PremiumPlanName;
  widget_config: {
    defaultView: 'map' | 'list';
    showHeader: boolean;
    headerTitle: string;
    mapZoomLevel: number;
    primaryColor: string;
    showWidgetName: boolean;
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
      default: 'mapsy-default',
      index: true
    },
    instanceId: {
      type: String,
      index: true,
      sparse: true
    },
    compId: {
      type: String,
      index: true,
      sparse: true
    },
    widgetName: {
      type: String,
      default: ''
    },
    premiumPlanName: {
      type: String,
      enum: ['free', 'light', 'business', 'business-pro'],
      default: undefined
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
      },
      showWidgetName: {
        type: Boolean,
        default: false
      }
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

export default mongoose.model<IAppConfig>('AppConfig', AppConfigSchema);
