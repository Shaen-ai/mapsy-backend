import { Request, Response } from 'express';
import Location, { ILocation } from '../models/Location';
import geocodingService from '../services/geocodingService';
import storageService from '../services/storageService';
import { validationResult } from 'express-validator';

export class LocationController {
  // Get all locations
  async getAll(req: Request, res: Response) {
    try {
      const locations = await Location.find().sort({ createdAt: -1 });
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