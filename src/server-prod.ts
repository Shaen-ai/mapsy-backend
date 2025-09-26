import express, { Application } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import locationRoutes from './routes/locationRoutes';
import AppConfig from './models/AppConfig';

// Load environment variables from the backend folder
dotenv.config({ path: path.join(__dirname, '../.env') });

const app: Application = express();
const PORT = process.env.PORT || 8001;

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or postman)
    if (!origin) return callback(null, true);

    // Parse allowed origins from environment variable
    const allowedOrigins = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()) || [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175'
    ];

    // Check if the origin is allowed
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // For widget endpoints, allow all origins since widgets can be embedded anywhere
      // You might want to restrict this based on specific paths
      callback(null, true); // Allow all origins for now
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files for local uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/locations', locationRoutes);

// Widget configuration endpoints
app.get('/api/widget-config', async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      // Return default config if not connected
      return res.json({
        defaultView: 'map',
        showHeader: true,
        headerTitle: 'Our Locations',
        mapZoomLevel: 12,
        primaryColor: '#3B82F6'
      });
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
    // Return default config on error
    res.json({
      defaultView: 'map',
      showHeader: true,
      headerTitle: 'Our Locations',
      mapZoomLevel: 12,
      primaryColor: '#3B82F6'
    });
  }
});

app.put('/api/widget-config', async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not available' });
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
  const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
  res.json({
    status: 'OK',
    message: 'Mapsy API is running',
    database: dbStatus
  });
});

// MongoDB connection with retry logic
const connectDB = async () => {
  const maxRetries = 5;
  let retries = 0;

  const attemptConnection = async () => {
    try {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mapsy';

      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      console.log('✅ MongoDB connected successfully');
      return true;
    } catch (error) {
      retries++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ MongoDB connection attempt ${retries} failed:`, errorMessage);

      if (retries < maxRetries) {
        console.log(`⏳ Retrying in 5 seconds... (${retries}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        return attemptConnection();
      }

      console.warn('⚠️  Running without MongoDB - using fallback mode');
      return false;
    }
  };

  return attemptConnection();
};

// Start server
const startServer = async () => {
  // Try to connect to MongoDB but don't fail if it doesn't work
  const dbConnected = await connectDB();

  if (!dbConnected) {
    console.log('📝 Note: Widget configuration will not be persisted');
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📍 API available at http://localhost:${PORT}/api`);
    if (!dbConnected) {
      console.log(`⚠️  Using fallback mode (MongoDB not connected)`);
    }
  });
};

startServer();

export default app;