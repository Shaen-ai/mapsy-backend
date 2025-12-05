import express, { Application } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import locationRoutes from './routes/locationRoutes';
import AppConfig from './models/AppConfig';
import Location from './models/Location';
import { optionalWixAuth } from './middleware/wixSdkAuth';

// Load environment variables from the backend folder
dotenv.config({ path: path.join(__dirname, '../.env') });

const app: Application = express();
const PORT = process.env.PORT || 8001;

// Middleware
// For widget endpoints, allow all origins since widgets can be embedded anywhere
app.use(cors({
  origin: (origin, callback) => {
    // Allow all origins for widget-specific endpoints
    // In production, you might want to restrict this to specific domains
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Wix-Comp-Id']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files for local uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
// Apply optional Wix authentication to all API routes
// This will verify the token if present, but allow requests without it in development
app.use('/api/locations', optionalWixAuth, locationRoutes);

// Default locations shown when no compId is provided (first-time widget load)
const DEFAULT_LOCATIONS = [
  {
    _id: 'default-1',
    name: 'Disneyland',
    address: '1313 Disneyland Dr, Anaheim, CA 92802, USA',
    category: 'other',
    latitude: 33.8121,
    longitude: -117.9190,
    phone: '+1 714-781-4636',
    website: 'https://disneyland.disney.go.com'
  },
  {
    _id: 'default-2',
    name: 'Eiffel Tower',
    address: 'Champ de Mars, 5 Avenue Anatole France, 75007 Paris, France',
    category: 'other',
    latitude: 48.8584,
    longitude: 2.2945,
    phone: '+33 892 70 12 39',
    website: 'https://www.toureiffel.paris'
  },
  {
    _id: 'default-3',
    name: 'Santiago Bernabéu Stadium',
    address: 'Av. de Concha Espina, 1, 28036 Madrid, Spain',
    category: 'other',
    latitude: 40.4531,
    longitude: -3.6883,
    phone: '+34 913 98 43 00',
    website: 'https://www.realmadrid.com/estadio-santiago-bernabeu'
  }
];

const defaultWidgetConfig = {
  defaultView: 'map',
  showHeader: true,
  headerTitle: 'Our Locations',
  mapZoomLevel: 12,
  primaryColor: '#3B82F6'
};

const computeConfigKey = (instanceValue?: string, compValue?: string | null) => {
  if (!instanceValue) {
    return 'mapsy-default';
  }
  return `mapsy-${instanceValue}${compValue ? `-${compValue}` : ''}`;
};

// Combined endpoint - fetches both config and locations in a single request
app.get('/api/widget-data', optionalWixAuth, async (req, res) => {
  try {
    const instanceId = req.wix?.instanceId;
    const compId = req.wix?.compId;

    const desiredKey = computeConfigKey(instanceId, compId ?? null);
    const instanceFallbackKey = instanceId ? computeConfigKey(instanceId, null) : null;

    // Build keys to query for config
    const keysToQuery = [desiredKey];
    if (instanceFallbackKey && instanceFallbackKey !== desiredKey) {
      keysToQuery.push(instanceFallbackKey);
    }
    keysToQuery.push('mapsy-default');

    // Run config and locations queries in parallel
    const [configs, locations] = await Promise.all([
      AppConfig.find({ app_id: { $in: keysToQuery } }).lean(),
      instanceId && compId
        ? Location.find({ instanceId, compId }).sort({ createdAt: -1 }).lean()
        : Promise.resolve(null)
    ]);

    // Find the best matching config
    let config: typeof configs[0] | null = configs.find(c => c.app_id === desiredKey)
      || configs.find(c => c.app_id === instanceFallbackKey)
      || configs.find(c => c.app_id === 'mapsy-default')
      || null;

    if (!config) {
      const newConfig = await AppConfig.create({
        app_id: 'mapsy-default',
        widget_config: defaultWidgetConfig
      });
      config = newConfig.toObject() as typeof configs[0];
    }

    // Check premium status
    let hasPremium: boolean;
    if (config!.hasPremium !== undefined) {
      hasPremium = config!.hasPremium;
    } else {
      hasPremium = !!req.wix?.vendorProductId;
    }

    res.json({
      config: {
        ...config!.widget_config,
        widgetName: config!.widgetName || '',
        hasPremium
      },
      locations: locations ?? DEFAULT_LOCATIONS
    });
  } catch (error) {
    console.error('Error fetching widget data:', error);
    res.status(500).json({ error: 'Failed to fetch widget data' });
  }
});

// Widget configuration endpoints (kept for backward compatibility)
app.get('/api/widget-config', optionalWixAuth, async (req, res) => {
  try {
    const instanceId = req.wix?.instanceId;
    const compId = req.wix?.compId;

    const desiredKey = computeConfigKey(instanceId, compId ?? null);
    const instanceFallbackKey = instanceId ? computeConfigKey(instanceId, null) : null;

    const keysToQuery = [desiredKey];
    if (instanceFallbackKey && instanceFallbackKey !== desiredKey) {
      keysToQuery.push(instanceFallbackKey);
    }
    keysToQuery.push('mapsy-default');

    const configs = await AppConfig.find({ app_id: { $in: keysToQuery } }).lean();

    let config: typeof configs[0] | null = configs.find(c => c.app_id === desiredKey)
      || configs.find(c => c.app_id === instanceFallbackKey)
      || configs.find(c => c.app_id === 'mapsy-default')
      || null;

    if (!config) {
      const newConfig = await AppConfig.create({
        app_id: 'mapsy-default',
        widget_config: defaultWidgetConfig
      });
      config = newConfig.toObject() as typeof configs[0];
    }

    let hasPremium: boolean;
    if (config!.hasPremium !== undefined) {
      hasPremium = config!.hasPremium;
    } else {
      hasPremium = !!req.wix?.vendorProductId;
    }

    res.json({
      ...config!.widget_config,
      widgetName: config!.widgetName || '',
      hasPremium
    });
  } catch (error) {
    console.error('Error fetching widget config:', error);
    res.status(500).json({ error: 'Failed to fetch widget configuration' });
  }
});

app.put('/api/widget-config', optionalWixAuth, async (req, res) => {
  try {
    const instanceId = req.wix?.instanceId;
    const compId = req.wix?.compId;
    const targetKey = computeConfigKey(instanceId, compId ?? null);

    const { widgetName, ...widgetConfigFields } = req.body;

    const updateDoc: Record<string, any> = {
      $set: {
        app_id: targetKey,
        'widget_config': {
          ...defaultWidgetConfig,
          showWidgetName: false,
          ...widgetConfigFields
        }
      }
    };

    if (instanceId) {
      updateDoc.$set.instanceId = instanceId;
    } else {
      updateDoc.$unset = { ...(updateDoc.$unset || {}), instanceId: '' };
    }

    if (compId) {
      updateDoc.$set.compId = compId;
    } else {
      updateDoc.$unset = { ...(updateDoc.$unset || {}), compId: '' };
    }

    if (widgetName !== undefined) {
      updateDoc.$set.widgetName = widgetName;
    }

    const config = await AppConfig.findOneAndUpdate(
      { app_id: targetKey },
      updateDoc,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({
      ...config.widget_config,
      widgetName: config.widgetName || ''
    });
  } catch (error) {
    console.error('Error updating widget config:', error);
    res.status(500).json({ error: 'Failed to update widget configuration' });
  }
});

// Get all widgets for an instance (used by dashboard when no compId is specified)
app.get('/api/widgets', optionalWixAuth, async (req, res) => {
  try {
    const instanceId = req.wix?.instanceId;

    if (!instanceId) {
      return res.status(400).json({ error: 'Instance ID is required' });
    }

    const widgets = await AppConfig.find({
      instanceId: instanceId,
      compId: { $exists: true, $nin: [null, ''] }
    }).select('compId widgetName widget_config createdAt updatedAt').lean();

    const widgetList = widgets.map(w => ({
      compId: w.compId,
      widgetName: w.widgetName || '',
      defaultView: w.widget_config?.defaultView || 'map',
      createdAt: w.createdAt,
      updatedAt: w.updatedAt
    }));

    res.json(widgetList);
  } catch (error) {
    console.error('Error fetching widgets:', error);
    res.status(500).json({ error: 'Failed to fetch widgets' });
  }
});

// Get auth info - returns the instance token from the request headers
app.get('/api/auth-info', optionalWixAuth, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const compId = req.wix?.compId || req.headers['x-wix-comp-id'] as string || null;
    const instanceId = req.wix?.instanceId || null;
    const instanceToken = authHeader || null;

    res.json({
      instanceId,
      compId,
      instanceToken,
      isAuthenticated: !!instanceToken
    });
  } catch (error) {
    console.error('Error getting auth info:', error);
    res.status(500).json({ error: 'Failed to get auth info' });
  }
});

// Premium status check - used by widget to determine if it should show on published site
app.get('/api/premium-status', optionalWixAuth, async (req, res) => {
  try {
    const vendorProductId = req.wix?.vendorProductId || null;
    const instanceId = req.wix?.instanceId || null;
    const hasPremium = !!vendorProductId;

    res.json({
      hasPremium,
      vendorProductId,
      instanceId
    });
  } catch (error) {
    console.error('Error checking premium status:', error);
    res.status(500).json({ error: 'Failed to check premium status' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Mapsy API is running' });
});

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mapsy');
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Start server
const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📍 API available at http://localhost:${PORT}/api`);
  });
};

startServer();
