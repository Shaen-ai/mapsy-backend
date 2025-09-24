import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

// Ensure environment variables are loaded - try multiple paths
const paths = [
  path.join(__dirname, '../.env'),  // If running from src/services
  path.join(__dirname, '../../.env'), // If running from dist/services
  path.join(process.cwd(), '.env'),  // Current working directory
];

console.log('🔍 Current directory:', __dirname);
console.log('🔍 Working directory:', process.cwd());

for (const envPath of paths) {
  console.log('🔍 Trying .env at:', envPath);
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    console.log('✅ Loaded .env from:', envPath);
    break;
  }
}

interface GeocodingResult {
  latitude: number;
  longitude: number;
}

class GeocodingService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    console.log('🔑 GeocodingService initialized with key:', this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'NO KEY');
  }

  async geocodeAddress(address: string): Promise<GeocodingResult | null> {
    try {
      console.log('🗺️ Geocoding address:', address);
      console.log('🔑 Using API key:', this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'NO API KEY');

      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/geocode/json',
        {
          params: {
            address,
            key: this.apiKey
          }
        }
      );

      console.log('📍 Geocoding response status:', response.data.status);

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        const location = response.data.results[0].geometry.location;
        console.log('✅ Geocoding successful:', { lat: location.lat, lng: location.lng });
        return {
          latitude: location.lat,
          longitude: location.lng
        };
      }

      console.warn(`Geocoding failed for address: ${address}, Status: ${response.data.status}`);
      if (response.data.error_message) {
        console.error('Error message:', response.data.error_message);
      }
      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }
}

export default new GeocodingService();