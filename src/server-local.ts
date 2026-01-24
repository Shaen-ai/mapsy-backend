import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 8000;

// In-memory database for local testing
let widgetConfig = {
  defaultView: 'map',
  showHeader: true,
  headerTitle: 'Our Locations',
  mapZoomLevel: 12,
  primaryColor: '#3B82F6',
};

let locations: any[] = [
  {
    id: '1',
    name: 'Central Coffee Shop',
    address: '123 Main St, New York, NY 10001',
    phone: '(212) 555-0101',
    email: 'info@centralcoffee.com',
    website: 'https://centralcoffee.com',
    business_hours: {
      mon: '7:00 AM - 8:00 PM',
      tue: '7:00 AM - 8:00 PM',
      wed: '7:00 AM - 8:00 PM',
      thu: '7:00 AM - 8:00 PM',
      fri: '7:00 AM - 10:00 PM',
      sat: '8:00 AM - 10:00 PM',
      sun: '8:00 AM - 6:00 PM',
    },
    category: 'restaurant',
    latitude: 40.7128,
    longitude: -74.0060,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: '2',
    name: 'Tech Store Plus',
    address: '456 Broadway, New York, NY 10013',
    phone: '(212) 555-0202',
    email: 'support@techstoreplus.com',
    website: 'https://techstoreplus.com',
    business_hours: {
      mon: '9:00 AM - 9:00 PM',
      tue: '9:00 AM - 9:00 PM',
      wed: '9:00 AM - 9:00 PM',
      thu: '9:00 AM - 9:00 PM',
      fri: '9:00 AM - 9:00 PM',
      sat: '10:00 AM - 8:00 PM',
      sun: '11:00 AM - 7:00 PM',
    },
    category: 'store',
    latitude: 40.7260,
    longitude: -73.9897,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: '3',
    name: 'Downtown Dental Care',
    address: '789 Park Ave, New York, NY 10021',
    phone: '(212) 555-0303',
    email: 'appointments@downtowndental.com',
    website: 'https://downtowndental.com',
    business_hours: {
      mon: '8:00 AM - 5:00 PM',
      tue: '8:00 AM - 5:00 PM',
      wed: '8:00 AM - 5:00 PM',
      thu: '8:00 AM - 5:00 PM',
      fri: '8:00 AM - 3:00 PM',
      sat: 'Closed',
      sun: 'Closed',
    },
    category: 'service',
    latitude: 40.7655,
    longitude: -73.9668,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files for local uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes

// GET /api/locations
app.get('/api/locations', (req, res) => {
  res.json(locations);
});

// GET /api/locations/:id
app.get('/api/locations/:id', (req, res) => {
  const location = locations.find(loc => loc.id === req.params.id);
  if (!location) {
    return res.status(404).json({ error: 'Location not found' });
  }
  res.json(location);
});

// POST /api/locations
app.post('/api/locations', (req, res) => {
  const newLocation = {
    id: Date.now().toString(),
    ...req.body,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Simple geocoding simulation (in production, use Google Geocoding API)
  if (!newLocation.latitude || !newLocation.longitude) {
    newLocation.latitude = 40.7128 + Math.random() * 0.1;
    newLocation.longitude = -74.0060 + Math.random() * 0.1;
  }

  locations.push(newLocation);
  res.status(201).json(newLocation);
});

// PUT /api/locations/:id
app.put('/api/locations/:id', (req, res) => {
  const index = locations.findIndex(loc => loc.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Location not found' });
  }

  locations[index] = {
    ...locations[index],
    ...req.body,
    id: req.params.id,
    updatedAt: new Date(),
  };

  res.json(locations[index]);
});

// DELETE /api/locations/:id
app.delete('/api/locations/:id', (req, res) => {
  const index = locations.findIndex(loc => loc.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Location not found' });
  }

  locations.splice(index, 1);
  res.status(204).send();
});

// Widget configuration endpoints

// GET /api/widget-config
app.get('/api/widget-config', (req, res) => {
  res.json(widgetConfig);
});

// PUT /api/widget-config
app.put('/api/widget-config', (req, res) => {
  widgetConfig = {
    ...widgetConfig,
    ...req.body,
  };
  res.json(widgetConfig);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Mapsy API is running (Local Mode)' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📍 API available at http://localhost:${PORT}/api`);
  console.log(`⚠️  Using in-memory database (data will be lost on restart)`);
  console.log(`💡 To use MongoDB Atlas, update MONGODB_URI in backend/.env`);
});