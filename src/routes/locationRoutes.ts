import { Router } from 'express';
import locationController from '../controllers/locationController';
import { upload } from '../services/storageService';
import { validateLocation } from '../middleware/validators';

const router = Router();

// GET /api/locations
router.get('/', locationController.getAll);

// GET /api/locations/:id
router.get('/:id', locationController.getOne);

// POST /api/locations
router.post(
  '/',
  upload.single('image'),
  validateLocation,
  locationController.create
);

// PUT /api/locations/:id
router.put(
  '/:id',
  upload.single('image'),
  validateLocation,
  locationController.update
);

// POST /api/locations/:id (for method override support)
router.post(
  '/:id',
  upload.single('image'),
  validateLocation,
  locationController.update
);

// DELETE /api/locations/:id
router.delete('/:id', locationController.delete);

export default router;