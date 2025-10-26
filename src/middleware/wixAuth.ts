import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extend Express Request to include Wix data
declare global {
  namespace Express {
    interface Request {
      wix?: {
        instanceId: string;
        compId?: string;
        decodedToken: any;
      };
    }
  }
}

/**
 * Middleware to verify Wix instance token
 * This validates the JWT token sent from the Wix widget
 */
export const verifyWixInstance = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    const compId = req.headers['x-wix-comp-id'] as string;

    // Get Wix App Secret from environment
    const WIX_APP_SECRET = process.env.WIX_APP_SECRET;

    if (!WIX_APP_SECRET) {
      console.warn('[WixAuth] WIX_APP_SECRET not configured - skipping verification');
      // In development, allow requests without token
      if (process.env.NODE_ENV !== 'production') {
        return next();
      }
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!token) {
      console.warn('[WixAuth] No token provided');
      // In development, allow requests without token
      if (process.env.NODE_ENV !== 'production') {
        return next();
      }
      return res.status(401).json({ error: 'Authentication token required' });
    }

    // Decode and verify the JWT token using Wix app secret
    const decoded = jwt.verify(token, WIX_APP_SECRET) as any;
    const instanceId = decoded.instanceId;

    console.log('[WixAuth] Token verified successfully');
    console.log('[WixAuth] Instance ID:', instanceId);
    if (compId) {
      console.log('[WixAuth] Component ID:', compId);
    }

    // Attach Wix data to request object for use in controllers
    req.wix = {
      instanceId,
      compId,
      decodedToken: decoded,
    };

    next();
  } catch (err) {
    console.error('[WixAuth] Token verification failed:', err);

    // In development, log error but allow request
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[WixAuth] Development mode - allowing request despite invalid token');
      return next();
    }

    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Optional middleware - only verifies token if present
 * Use this for endpoints that should work both with and without Wix
 */
export const optionalWixAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      // No token provided, continue without Wix data
      return next();
    }

    const WIX_APP_SECRET = process.env.WIX_APP_SECRET;
    if (!WIX_APP_SECRET) {
      // No secret configured, continue without verification
      return next();
    }

    const compId = req.headers['x-wix-comp-id'] as string;
    const decoded = jwt.verify(token, WIX_APP_SECRET) as any;

    req.wix = {
      instanceId: decoded.instanceId,
      compId,
      decodedToken: decoded,
    };

    console.log('[WixAuth] Optional auth - token verified for instance:', decoded.instanceId);
  } catch (err) {
    // Token invalid, but that's okay for optional auth
    console.log('[WixAuth] Optional auth - invalid token, continuing without Wix data');
  }

  next();
};
