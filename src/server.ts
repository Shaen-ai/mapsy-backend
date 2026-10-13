import express, { Application, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
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

const DEFAULT_CORS_HEADERS =
  'Content-Type, Authorization, X-Requested-With, X-Wix-Comp-Id, X-Wix-Consistent';

// Reflect Origin and requested headers so Wix editor preflights succeed
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  const requestedHeaders = req.headers['access-control-request-headers'];
  res.setHeader(
    'Access-Control-Allow-Headers',
    typeof requestedHeaders === 'string' && requestedHeaders.trim()
      ? requestedHeaders
      : DEFAULT_CORS_HEADERS
  );

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

/** Read-only: resolve stored plan from AppConfig. Never invents from vendorProductId. */
const resolveStoredPremiumPlan = async (
  preferredConfig: { premiumPlanName?: string } | null | undefined,
  instanceId?: string | null,
  compId?: string | null
): Promise<string> => {
  if (preferredConfig?.premiumPlanName) {
    return preferredConfig.premiumPlanName;
  }

  if (instanceId) {
    const byInstance = await AppConfig.findOne({
      instanceId,
      premiumPlanName: { $exists: true, $ne: null }
    }).lean();
    if (byInstance?.premiumPlanName) {
      return byInstance.premiumPlanName;
    }
  }

  if (compId) {
    const byComp = await AppConfig.findOne({
      compId,
      premiumPlanName: { $exists: true, $ne: null }
    }).lean();
    if (byComp?.premiumPlanName) {
      return byComp.premiumPlanName;
    }
  }

  return 'free';
};

// Combined endpoint - fetches both config and locations in a single request
app.get('/api/widget-data', optionalWixAuth, async (req, res) => {
  try {
    console.log('[widget-data] ========== REQUEST START ==========');
    console.log('[widget-data] Raw headers:', JSON.stringify(req.headers, null, 2));
    console.log('[widget-data] x-wix-comp-id header:', req.headers['x-wix-comp-id'] || 'NOT PRESENT');
    console.log('[widget-data] req.wix exists:', !!req.wix);
    console.log('[widget-data] req.wix:', JSON.stringify(req.wix));

    const instanceId = req.wix?.instanceId;
    const compId = req.wix?.compId;

    console.log('[widget-data] instanceId:', instanceId || 'NONE');
    console.log('[widget-data] compId:', compId || 'NONE');

    // CASE 1: No instanceId and no compId - return default data
    // Check explicitly for undefined/null, not just falsy (empty string '' is valid for instanceId in editor mode)
    if ((!instanceId || instanceId === '') && (!compId || compId === '')) {
      console.log('[widget-data] No auth, no compId - returning default data');
      res.json({
        config: {
          ...defaultWidgetConfig,
          widgetName: '',
          premiumPlanName: 'free'
        },
        locations: DEFAULT_LOCATIONS
      });
      return;
    }

    // CASE 2: Has compId but no instanceId (EDITOR MODE)
    // Fetch data by compId only, without instance authentication
    // instanceId will be empty string '' in editor mode, compId should be the actual ID
    if ((!instanceId || instanceId === '') && compId && compId !== '') {
      console.log('[widget-data] ✅ Editor mode - compId without auth:', compId);

      // Find ANY location with this compId (across all instances)
      // This allows editor to see the widget's data without authentication
      const [config, locations] = await Promise.all([
        AppConfig.findOne({ compId }).lean(),
        Location.find({ compId }).sort({ createdAt: -1 }).lean()
      ]);

      // Read-only plan from stored AppConfig (webhook is the only writer)
      const premiumPlanName = await resolveStoredPremiumPlan(config, config?.instanceId, compId);

      // Return DB result as-is — do not substitute defaults for empty/mismatched compId
      res.json({
        config: {
          ...(config?.widget_config || defaultWidgetConfig),
          widgetName: config?.widgetName || '',
          premiumPlanName
        },
        locations
      });
      return;
    }

    // CASE 3: Has instanceId (authenticated request - published site)
    const desiredKey = computeConfigKey(instanceId, compId ?? null);
    const instanceFallbackKey = computeConfigKey(instanceId, null);

    // Build keys to query for config (no mapsy-default - we don't create it)
    const keysToQuery = [desiredKey];
    if (instanceFallbackKey !== desiredKey) {
      keysToQuery.push(instanceFallbackKey);
    }

    // Prefer scoped { instanceId, compId }; fall back to all instance locations
    let locations: any[] = [];
    if (compId) {
      locations = await Location.find({ instanceId, compId }).sort({ createdAt: -1 }).lean();
      if (locations.length === 0) {
        console.log('[widget-data] No locations for compId, falling back to instanceId only');
        locations = await Location.find({ instanceId }).sort({ createdAt: -1 }).lean();
      }
    } else {
      locations = await Location.find({ instanceId }).sort({ createdAt: -1 }).lean();
    }

    const configs = await AppConfig.find({ app_id: { $in: keysToQuery } }).lean();

    // Find the best matching config (no fallback to mapsy-default)
    let config = configs.find(c => c.app_id === desiredKey)
      || configs.find(c => c.app_id === instanceFallbackKey)
      || null;

    // Read-only: plan comes only from stored AppConfig (webhook writes it)
    const premiumPlanName = await resolveStoredPremiumPlan(config, instanceId, compId);

    // Create new config if both instanceId and compId exist but no config found.
    // Do NOT set premiumPlanName — billing is webhook-only.
    if (!config && instanceId && compId) {
      console.log('[widget-data] No config found, creating new record with app_id:', desiredKey);

      const newConfig = new AppConfig({
        app_id: desiredKey,
        instanceId,
        compId,
        widget_config: defaultWidgetConfig,
        widgetName: ''
      });

      const savedConfig = await newConfig.save();
      config = savedConfig.toObject() as any;
      console.log('[widget-data] ✅ Created new config for instanceId:', instanceId, 'compId:', compId);
    }

    // Never substitute DEFAULT_LOCATIONS when we have an authenticated instance
    res.json({
      config: {
        ...(config?.widget_config || defaultWidgetConfig),
        widgetName: config?.widgetName || '',
        premiumPlanName
      },
      locations
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
    const authHeader = req.headers.authorization;

    // Editor / no instanceId: still read stored plan by compId (do not hardcode free)
    if (!instanceId) {
      const config = compId ? await AppConfig.findOne({ compId }).lean() : null;
      const premiumPlanName = await resolveStoredPremiumPlan(config, config?.instanceId, compId);

      res.json({
        ...(config?.widget_config || defaultWidgetConfig),
        widgetName: config?.widgetName || '',
        premiumPlanName,
        auth: {
          instanceId: null,
          compId: compId || null,
          instanceToken: authHeader || null,
          isAuthenticated: !!authHeader
        }
      });
      return;
    }

    const desiredKey = computeConfigKey(instanceId, compId ?? null);
    const instanceFallbackKey = computeConfigKey(instanceId, null);

    const keysToQuery = [desiredKey];
    if (instanceFallbackKey !== desiredKey) {
      keysToQuery.push(instanceFallbackKey);
    }

    const configs = await AppConfig.find({ app_id: { $in: keysToQuery } }).lean();

    // Find the best matching config (no fallback to mapsy-default)
    let config = configs.find(c => c.app_id === desiredKey)
      || configs.find(c => c.app_id === instanceFallbackKey)
      || null;

    // Read-only: plan comes only from stored AppConfig (webhook writes it)
    const premiumPlanName = await resolveStoredPremiumPlan(config, instanceId, compId);

    // Create new record if not found and we have both instanceId and compId.
    // Do NOT set premiumPlanName — billing is webhook-only.
    if (!config && instanceId && compId) {
      console.log('[widget-config] No config found, creating new record with app_id:', desiredKey);

      const newConfig = new AppConfig({
        app_id: desiredKey,
        instanceId,
        compId,
        widget_config: defaultWidgetConfig,
        widgetName: ''
      });

      const savedConfig = await newConfig.save();
      config = savedConfig.toObject() as any;
      console.log('[widget-config] ✅ Created new config for instanceId:', instanceId, 'compId:', compId);
    }

    res.json({
      ...(config?.widget_config || defaultWidgetConfig),
      widgetName: config?.widgetName || '',
      premiumPlanName,
      auth: {
        instanceId,
        compId,
        instanceToken: authHeader || null,
        isAuthenticated: !!authHeader
      }
    });
  } catch (error) {
    console.error('Error fetching widget config:', error);
    res.status(500).json({ error: 'Failed to fetch widget configuration' });
  }
});

app.put('/api/widget-config', optionalWixAuth, async (req, res) => {
  try {
    const instanceId = req.wix?.instanceId || req.body.instanceId;
    const compId = req.wix?.compId || req.headers['x-wix-comp-id'] as string;

    const { widgetName, premiumPlanName, ...widgetConfigFields } = req.body;

    /* Settings panel update with compId-only — widget fields only, never plan */
    if (compId && !instanceId) {
      console.log('[widget-config] 📝 Settings panel update with compId only:', compId);

      const updateDoc: Record<string, any> = {
        $set: {
          'widget_config': widgetConfigFields
        }
      };

      if (widgetName !== undefined) {
        updateDoc.$set.widgetName = widgetName;
      }

      // premiumPlanName is ignored — only the Laravel webhook may change the plan

      const config = await AppConfig.findOneAndUpdate(
        { compId },
        updateDoc,
        { new: true }
      );

      if (!config) {
        return res.status(404).json({ error: 'Widget configuration not found for this compId' });
      }

      console.log('[widget-config] ✅ Updated config for compId:', compId);

      return res.json({
        ...config.widget_config,
        widgetName: config.widgetName || '',
        premiumPlanName: config.premiumPlanName || 'free'
      });
    }

    /* Plan-only update — ONLY write path for premiumPlanName (Laravel webhook) */
    const isPlanOnlyUpdate =
      instanceId &&
      premiumPlanName !== undefined &&
      !compId;

    if (isPlanOnlyUpdate) {
      const validPlans = ['free', 'light', 'business', 'business-pro'];

      if (!validPlans.includes(premiumPlanName)) {
        return res.status(400).json({ error: 'Invalid premiumPlanName' });
      }

      const existingDocs = await AppConfig.find({ instanceId });

      if (existingDocs.length > 0) {
        await AppConfig.updateMany(
          { instanceId },
          { $set: { premiumPlanName } }
        );
        console.log('[widget-config] Plan-only update for existing docs:', instanceId, premiumPlanName);
      } else {
        // Instance-level doc with stable app_id so GETs can find the plan
        const newDoc = new AppConfig({
          app_id: computeConfigKey(instanceId, null),
          instanceId,
          premiumPlanName
        });
        await newDoc.save();
        console.log('[widget-config] Plan-only insert (instance-level):', instanceId, premiumPlanName);
      }

      return res.json({
        success: true,
        premiumPlanName
      });
    }

    /* Full widget-config save — widget fields only, never plan */
    const targetKey = computeConfigKey(instanceId, compId ?? null);

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

    // premiumPlanName is ignored here — only the plan-only webhook branch may change it

    const config = await AppConfig.findOneAndUpdate(
      { app_id: targetKey },
      updateDoc,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const resolvedPlan = await resolveStoredPremiumPlan(config, instanceId, compId);

    res.json({
      ...config.widget_config,
      widgetName: config.widgetName || '',
      premiumPlanName: resolvedPlan
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

// Premium status check — reads stored plan only (webhook is the only writer)
app.get('/api/premium-status', optionalWixAuth, async (req, res) => {
  try {
    const vendorProductId = req.wix?.vendorProductId || null;
    const instanceId = req.wix?.instanceId || null;
    const compId = req.wix?.compId || null;

    const premiumPlanName = await resolveStoredPremiumPlan(null, instanceId, compId);

    res.json({
      premiumPlanName,
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
