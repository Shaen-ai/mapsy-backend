import mongoose from 'mongoose';
import Location from '../models/Location';
import dotenv from 'dotenv';

dotenv.config();

const sampleLocations = [
  {
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
    category: 'restaurant' as const,
    latitude: 40.7128,
    longitude: -74.0060,
  },
  {
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
    category: 'store' as const,
    latitude: 40.7260,
    longitude: -73.9897,
  },
  {
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
    category: 'service' as const,
    latitude: 40.7655,
    longitude: -73.9668,
  },
];

async function seedDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mapsy');
    console.log('✅ Connected to MongoDB');

    // Clear existing locations
    await Location.deleteMany({});
    console.log('🗑️  Cleared existing locations');

    // Insert sample locations
    await Location.insertMany(sampleLocations);
    console.log('✅ Sample locations added successfully');

    console.log('🌱 Database seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();