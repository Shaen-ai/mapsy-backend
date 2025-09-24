import { body } from 'express-validator';

export const validateLocation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 255 })
    .withMessage('Name must be less than 255 characters'),

  body('address')
    .trim()
    .notEmpty()
    .withMessage('Address is required')
    .isLength({ max: 500 })
    .withMessage('Address must be less than 500 characters'),

  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage('Phone must be less than 50 characters'),

  body('email')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),

  body('website')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isURL()
    .withMessage('Invalid URL format'),

  body('category')
    .optional()
    .isIn(['restaurant', 'store', 'office', 'service', 'other'])
    .withMessage('Invalid category'),

  body('business_hours')
    .optional()
    .isObject()
    .withMessage('Business hours must be an object'),

  body('business_hours.mon').optional().isString(),
  body('business_hours.tue').optional().isString(),
  body('business_hours.wed').optional().isString(),
  body('business_hours.thu').optional().isString(),
  body('business_hours.fri').optional().isString(),
  body('business_hours.sat').optional().isString(),
  body('business_hours.sun').optional().isString(),
];