import express, { Application } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import locationRoutes from './routes/locationRoutes';
import AppConfig from './models/AppConfig';
import { optionalWixAuth } from './middleware/wixAuth';

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

// Widget configuration endpoints
app.get('/api/widget-config', optionalWixAuth, async (req, res) => {
  try {
    // Log Wix instance data if available
    if (req.wix) {
      console.log('[Widget Config] Request from Wix instance:', req.wix.instanceId);
      if (req.wix.compId) {
        console.log('[Widget Config] Component ID:', req.wix.compId);
      }
    }

    let config = await AppConfig.findOne({ app_id: 'mapsy-default' });

    if (!config) {
      // Create default config if it doesn't exist
      config = await AppConfig.create({
        app_id: 'mapsy-default',
        widget_config: {
          defaultView: 'map',
          showHeader: true,
          headerTitle: 'Our Locations',
          mapZoomLevel: 12,
          primaryColor: '#3B82F6'
        }
      });
    }

    res.json(config.widget_config);
  } catch (error) {
    console.error('Error fetching widget config:', error);
    res.status(500).json({ error: 'Failed to fetch widget configuration' });
  }
});

app.put('/api/widget-config', optionalWixAuth, async (req, res) => {
  try {
    // Log Wix instance data if available
    if (req.wix) {
      console.log('[Widget Config Update] Request from Wix instance:', req.wix.instanceId);
      if (req.wix.compId) {
        console.log('[Widget Config Update] Component ID:', req.wix.compId);
      }
    }

    const config = await AppConfig.findOneAndUpdate(
      { app_id: 'mapsy-default' },
      {
        $set: {
          'widget_config': {
            ...req.body
          }
        }
      },
      { new: true, upsert: true }
    );

    res.json(config.widget_config);
  } catch (error) {
    console.error('Error updating widget config:', error);
    res.status(500).json({ error: 'Failed to update widget configuration' });
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