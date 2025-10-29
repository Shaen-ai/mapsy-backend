import { Request, Response } from 'express';
import Location, { ILocation } from '../models/Location';
import geocodingService from '../services/geocodingService';
import storageService from '../services/storageService';
import { validationResult } from 'express-validator';

export class LocationController {
  // Get all locations
  async getAll(req: Request, res: Response) {
    try {
      // Build query filter
      const filter: any = {};

      // If request has Wix instance ID, filter by it
      if (req.wix && req.wix.instanceId) {
        filter.instanceId = req.wix.instanceId;
        console.log('[Locations] Request from Wix instance:', req.wix.instanceId);
        const compId = req.wix.compId;
        if (compId) {
          filter.compId = compId;
          console.log('[Locations] Component ID filter:', compId);
        } else {
          filter.$or = [
            { compId: { $exists: false } },
            { compId: null },
          ];
          console.log('[Locations] No component ID provided. Falling back to non-component scoped data.');
        }
      } else {
        // No instance ID - dashboard access (show locations without instanceId for backward compatibility)
        // Or could show all locations - depending on your needs
        console.log('[Locations] Request without instance ID (dashboard access)');
        filter.instanceId = { $exists: false }; // Only show locations not associated with any instance
      }

      const locations = await Location.find(filter).sort({ createdAt: -1 });
      console.log(`[Locations] Returning ${locations.length} locations for filter:`, filter);
      res.json(locations);
    } catch (error) {
      console.error('Error fetching locations:', error);
      res.status(500).json({ error: 'Failed to fetch locations' });
    }
  }

  // Get single location
  async getOne(req: Request, res: Response) {
    try {
      const location = await Location.findById(req.params.id);

      if (!location) {
        return res.status(404).json({ error: 'Location not found' });
      }

      // Check if location belongs to this instance (for Wix requests)
      if (req.wix && req.wix.instanceId) {
        if (location.instanceId && location.instanceId !== req.wix.instanceId) {
          console.log('[Location Get] Access denied - location belongs to different instance');
          return res.status(403).json({ error: 'Access denied - location belongs to different instance' });
        }

        if (req.wix.compId) {
          if (location.compId && location.compId !== req.wix.compId) {
            console.log('[Location Get] Access denied - location belongs to different component');
            return res.status(403).json({ error: 'Access denied - location belongs to different component' });
          }
        } else if (location.compId) {
          console.log('[Location Get] Access denied - request missing component scope');
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

      // Associate location with Wix instance if available
      if (req.wix && req.wix.instanceId) {
        locationData.instanceId = req.wix.instanceId;
        console.log('[Location Create] Associating with instance:', req.wix.instanceId);
        if (req.wix.compId) {
          locationData.compId = req.wix.compId;
          console.log('[Location Create] Associating with component:', req.wix.compId);
        } else {
          console.warn('[Location Create] Wix request missing component ID - record will be scoped to instance only');
        }
      }

      // Handle image upload
      if (req.file) {
        const imageUrl = await storageService.uploadImage(req.file);
        if (imageUrl) {
          locationData.image_url = imageUrl;
        }
      }

      // Geocode the address
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

      // Check if location belongs to this instance
      if (req.wix && req.wix.instanceId) {
        if (location.instanceId && location.instanceId !== req.wix.instanceId) {
          console.log('[Location Update] Access denied - location belongs to different instance');
          return res.status(403).json({ error: 'Access denied - location belongs to different instance' });
        }

        if (req.wix.compId) {
          if (location.compId && location.compId !== req.wix.compId) {
            console.log('[Location Update] Access denied - location belongs to different component');
            return res.status(403).json({ error: 'Access denied - location belongs to different component' });
          }
        } else if (location.compId) {
          console.log('[Location Update] Access denied - component scope required');
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

      // Handle image upload
      if (req.file) {
        // Delete old image if exists
        if (location.image_url) {
          await storageService.deleteImage(location.image_url);
        }

        const imageUrl = await storageService.uploadImage(req.file);
        if (imageUrl) {
          updateData.image_url = imageUrl;
        }
      }

      // Re-geocode if address changed or if coordinates are missing
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

      // Check if location belongs to this instance
      if (req.wix && req.wix.instanceId) {
        if (location.instanceId && location.instanceId !== req.wix.instanceId) {
          console.log('[Location Delete] Access denied - location belongs to different instance');
          return res.status(403).json({ error: 'Access denied - location belongs to different instance' });
        }

        if (req.wix.compId) {
          if (location.compId && location.compId !== req.wix.compId) {
            console.log('[Location Delete] Access denied - location belongs to different component');
            return res.status(403).json({ error: 'Access denied - location belongs to different component' });
          }
        } else if (location.compId) {
          console.log('[Location Delete] Access denied - component scope required');
          return res.status(403).json({ error: 'Access denied - component ID required' });
        }
      }

      // Delete image if exists
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
