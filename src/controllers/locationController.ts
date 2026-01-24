import { Request, Response } from 'express';
import Location, { ILocation } from '../models/Location';
import geocodingService from '../services/geocodingService';
import storageService from '../services/storageService';
import { validationResult } from 'express-validator';

// Default locations shown when no compId is provided (first-time widget load)
const DEFAULT_LOCATIONS = [
  {
    _id: 'default-1',
    name: 'Disneyland',
    address: '1313 Disneyland Dr, Anaheim, CA 92802, USA',
    category: 'other' as const,
    latitude: 33.8121,
    longitude: -117.9190,
    phone: '+1 714-781-4636',
    website: 'https://disneyland.disney.go.com',
    business_hours: {
      mon: '8:00 AM - 12:00 AM',
      tue: '8:00 AM - 12:00 AM',
      wed: '8:00 AM - 12:00 AM',
      thu: '8:00 AM - 12:00 AM',
      fri: '8:00 AM - 12:00 AM',
      sat: '8:00 AM - 12:00 AM',
      sun: '8:00 AM - 12:00 AM'
    }
  },
  {
    _id: 'default-2',
    name: 'Eiffel Tower',
    address: 'Champ de Mars, 5 Avenue Anatole France, 75007 Paris, France',
    category: 'other' as const,
    latitude: 48.8584,
    longitude: 2.2945,
    phone: '+33 892 70 12 39',
    website: 'https://www.toureiffel.paris',
    business_hours: {
      mon: '9:30 AM - 11:45 PM',
      tue: '9:30 AM - 11:45 PM',
      wed: '9:30 AM - 11:45 PM',
      thu: '9:30 AM - 11:45 PM',
      fri: '9:30 AM - 11:45 PM',
      sat: '9:30 AM - 11:45 PM',
      sun: '9:30 AM - 11:45 PM'
    }
  },
  {
    _id: 'default-3',
    name: 'Santiago Bernabéu Stadium',
    address: 'Av. de Concha Espina, 1, 28036 Madrid, Spain',
    category: 'other' as const,
    latitude: 40.4531,
    longitude: -3.6883,
    phone: '+34 913 98 43 00',
    website: 'https://www.realmadrid.com/estadio-santiago-bernabeu',
    business_hours: {
      mon: '10:00 AM - 7:00 PM',
      tue: '10:00 AM - 7:00 PM',
      wed: '10:00 AM - 7:00 PM',
      thu: '10:00 AM - 7:00 PM',
      fri: '10:00 AM - 7:00 PM',
      sat: '10:00 AM - 7:00 PM',
      sun: '10:00 AM - 7:00 PM'
    }
  },
  {
    _id: 'default-4',
    name: 'Statue of Liberty',
    address: 'Liberty Island, New York, NY 10004, USA',
    category: 'other' as const,
    latitude: 40.6892,
    longitude: -74.0445,
    phone: '+1 212-363-3200',
    website: 'https://www.nps.gov/stli',
    business_hours: {
      mon: '9:00 AM - 5:00 PM',
      tue: '9:00 AM - 5:00 PM',
      wed: '9:00 AM - 5:00 PM',
      thu: '9:00 AM - 5:00 PM',
      fri: '9:00 AM - 5:00 PM',
      sat: '9:00 AM - 5:00 PM',
      sun: '9:00 AM - 5:00 PM'
    }
  },
  {
    _id: 'default-5',
    name: 'Jerusalem Old City',
    address: 'Old City, Jerusalem, Israel',
    category: 'other' as const,
    latitude: 31.7767,
    longitude: 35.2345,
    phone: '',
    website: 'https://www.jerusalem.com',
    business_hours: {
      mon: 'Open 24 hours',
      tue: 'Open 24 hours',
      wed: 'Open 24 hours',
      thu: 'Open 24 hours',
      fri: 'Open 24 hours',
      sat: 'Open 24 hours',
      sun: 'Open 24 hours'
    }
  }
];

export class LocationController {
  // Get all locations
  async getAll(req: Request, res: Response) {
    try {
      const filter: any = {};

      if (req.wix && req.wix.instanceId) {
        filter.instanceId = req.wix.instanceId;
        const compId = req.wix.compId;
        if (compId) {
          filter.compId = compId;
        } else {
          // No compId provided - return default locations for preview/first-time load
          return res.json(DEFAULT_LOCATIONS);
        }
      } else {
        // No instance ID - dashboard access
        filter.instanceId = { $exists: false };
      }

      const locations = await Location.find(filter).sort({ createdAt: -1 }).lean();
      return res.json(locations);
    } catch (error) {
      console.error('Error fetching locations:', error);
      res.status(500).json({ error: 'Failed to fetch locations' });
    }
  }

  // Get single location
  async getOne(req: Request, res: Response) {
    try {
      const location = await Location.findById(req.params.id).lean();

      if (!location) {
        return res.status(404).json({ error: 'Location not found' });
      }

      if (req.wix && req.wix.instanceId) {
        if (location.instanceId && location.instanceId !== req.wix.instanceId) {
          return res.status(403).json({ error: 'Access denied - location belongs to different instance' });
        }

        if (req.wix.compId) {
          if (location.compId && location.compId !== req.wix.compId) {
            return res.status(403).json({ error: 'Access denied - location belongs to different component' });
          }
        } else if (location.compId) {
          return res.status(403).json({ error: 'Access denied - component ID required' });
        }
      }

      res.json(location);
    } catch (error) {
      console.error('Error fetching location:', error);
      res.status(500).json({ error: 'Failed to fetch location' });
    }
  }

  // Create new location
  async create(req: Request, res: Response) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const locationData: Partial<ILocation> = {
        name: req.body.name,
        address: req.body.address,
        phone: req.body.phone,
        email: req.body.email,
        website: req.body.website,
        category: req.body.category || 'store',
        business_hours: req.body.business_hours
      };

      if (req.wix && req.wix.instanceId) {
        locationData.instanceId = req.wix.instanceId;
        if (req.wix.compId) {
          locationData.compId = req.wix.compId;
        }
      }

      // Handle image upload - supports both multipart form-data and base64 in JSON body
      // Also check for 'image_url' field (some frontends may send it with this name)
      const imageField = req.body.image || req.body.image_url;
      
      if (req.file) {
        console.log('[create] Processing multipart file upload');
        const imageUrl = await storageService.uploadImage(req.file);
        if (imageUrl) {
          locationData.image_url = imageUrl;
          console.log('[create] Image uploaded successfully:', imageUrl);
        }
      } else if (imageField && typeof imageField === 'string') {
        // Check if it's base64 data or an existing URL
        if (imageField.startsWith('data:') || (!imageField.startsWith('http') && !imageField.startsWith('/'))) {
          // Handle base64 image from JSON body
          console.log('[create] Processing base64 image upload');
          const imageUrl = await storageService.uploadBase64Image(imageField);
          if (imageUrl) {
            locationData.image_url = imageUrl;
            console.log('[create] Base64 image uploaded successfully:', imageUrl);
          } else {
            console.error('[create] Failed to upload base64 image');
          }
        } else {
          // It's an existing URL, use it directly
          console.log('[create] Using existing image URL:', imageField);
          locationData.image_url = imageField;
        }
      }

      if (locationData.address) {
        const coordinates = await geocodingService.geocodeAddress(locationData.address);
        if (coordinates) {
          locationData.latitude = coordinates.latitude;
          locationData.longitude = coordinates.longitude;
        }
      }

      const location = new Location(locationData);
      await location.save();

      res.status(201).json(location);
    } catch (error) {
      console.error('Error creating location:', error);
      res.status(500).json({ error: 'Failed to create location' });
    }
  }

  // Update location
  async update(req: Request, res: Response) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const location = await Location.findById(req.params.id);

      if (!location) {
        return res.status(404).json({ error: 'Location not found' });
      }

      if (req.wix && req.wix.instanceId) {
        if (location.instanceId && location.instanceId !== req.wix.instanceId) {
          return res.status(403).json({ error: 'Access denied - location belongs to different instance' });
        }

        if (req.wix.compId) {
          if (location.compId && location.compId !== req.wix.compId) {
            return res.status(403).json({ error: 'Access denied - location belongs to different component' });
          }
        } else if (location.compId) {
          return res.status(403).json({ error: 'Access denied - component ID required' });
        }
      }

      const updateData: Partial<ILocation> = {
        name: req.body.name || location.name,
        address: req.body.address || location.address,
        phone: req.body.phone,
        email: req.body.email,
        website: req.body.website,
        category: req.body.category || location.category,
        business_hours: req.body.business_hours || location.business_hours
      };

      // Handle image upload - supports both multipart form-data and base64 in JSON body
      // Also check for 'image_url' field (some frontends may send it with this name)
      const imageField = req.body.image || req.body.image_url;
      
      console.log('[update] Image handling - req.file:', !!req.file, 'imageField:', imageField ? imageField.substring(0, 50) + '...' : 'none');
      
      if (req.file) {
        console.log('[update] Processing multipart file upload');
        if (location.image_url) {
          await storageService.deleteImage(location.image_url);
        }

        const imageUrl = await storageService.uploadImage(req.file);
        if (imageUrl) {
          updateData.image_url = imageUrl;
          console.log('[update] Image uploaded successfully:', imageUrl);
        }
      } else if (imageField && typeof imageField === 'string') {
        // Check if it's base64 data (starts with 'data:' or is raw base64)
        const isBase64 = imageField.startsWith('data:') || 
                         (!imageField.startsWith('http') && !imageField.startsWith('/') && imageField.length > 100);
        
        if (isBase64) {
          console.log('[update] Processing base64 image upload');
          if (location.image_url) {
            await storageService.deleteImage(location.image_url);
          }

          const imageUrl = await storageService.uploadBase64Image(imageField);
          if (imageUrl) {
            updateData.image_url = imageUrl;
            console.log('[update] Base64 image uploaded successfully:', imageUrl);
          } else {
            console.error('[update] Failed to upload base64 image');
          }
        } else if (imageField.startsWith('http') || imageField.startsWith('/')) {
          // It's an existing URL - preserve it if different from current
          if (imageField !== location.image_url) {
            console.log('[update] Updating to new image URL:', imageField);
            updateData.image_url = imageField;
          } else {
            console.log('[update] Keeping existing image URL');
          }
        }
      }

      if (updateData.address && (updateData.address !== location.address || !location.latitude || !location.longitude)) {
        const coordinates = await geocodingService.geocodeAddress(updateData.address);
        if (coordinates) {
          updateData.latitude = coordinates.latitude;
          updateData.longitude = coordinates.longitude;
        }
      }

      const updatedLocation = await Location.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true }
      );

      res.json(updatedLocation);
    } catch (error) {
      console.error('Error updating location:', error);
      res.status(500).json({ error: 'Failed to update location' });
    }
  }

  // Delete location
  async delete(req: Request, res: Response) {
    try {
      const location = await Location.findById(req.params.id);

      if (!location) {
        return res.status(404).json({ error: 'Location not found' });
      }

      if (req.wix && req.wix.instanceId) {
        if (location.instanceId && location.instanceId !== req.wix.instanceId) {
          return res.status(403).json({ error: 'Access denied - location belongs to different instance' });
        }

        if (req.wix.compId) {
          if (location.compId && location.compId !== req.wix.compId) {
            return res.status(403).json({ error: 'Access denied - location belongs to different component' });
          }
        } else if (location.compId) {
          return res.status(403).json({ error: 'Access denied - component ID required' });
        }
      }

      if (location.image_url) {
        await storageService.deleteImage(location.image_url);
      }

      await Location.findByIdAndDelete(req.params.id);

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting location:', error);
      res.status(500).json({ error: 'Failed to delete location' });
    }
  }
}

export default new LocationController();
