import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

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

type WixInstancePayload = {
  instanceId?: string;
  compId?: string;
  [key: string]: any;
};

type DecodedInstance = {
  payload: WixInstancePayload;
  instanceId: string;
  signatureValid: boolean;
};

const normalizeBase64 = (segment: string) => {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (normalized.length % 4)) % 4;
  return normalized + '='.repeat(padding);
};

const tryDecodePayload = (segment: string): WixInstancePayload | null => {
  try {
    const decoded = Buffer.from(normalizeBase64(segment), 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (err) {
    // Ignore decode errors – we'll try alternate ordering
  }
  return null;
};

const decodeWixInstanceToken = (token: string, secret?: string): DecodedInstance => {
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid Wix instance token format');
  }

  // Wix instance token can be either payload.signature or signature.payload depending on context
  // Detect which segment is JSON by attempting to decode both orders
  let payloadSegment: string | null = null;
  let signatureSegment: string | null = null;
  let payload: WixInstancePayload | null = null;

  const [first, second] = parts;
  const firstDecoded = tryDecodePayload(first);
  if (firstDecoded) {
    payloadSegment = first;
    signatureSegment = second;
    payload = firstDecoded;
  } else {
    const secondDecoded = tryDecodePayload(second);
    if (secondDecoded) {
      payloadSegment = second;
      signatureSegment = first;
      payload = secondDecoded;
    }
  }

  if (!payloadSegment || !payload) {
    throw new Error('Unable to decode Wix instance token payload');
  }

  let signatureValid = false;

  if (secret && signatureSegment) {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadSegment)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    try {
      const providedSig = Buffer.from(normalizeBase64(signatureSegment), 'base64');
      const expectedSig = Buffer.from(normalizeBase64(expectedSignature), 'base64');

      if (providedSig.length === expectedSig.length && crypto.timingSafeEqual(providedSig, expectedSig)) {
        signatureValid = true;
      } else {
        throw new Error('Signature mismatch');
      }
    } catch (err) {
      throw new Error('Invalid Wix instance token signature');
    }
  }

  const instanceId =
    payload.instanceId ||
    (typeof payload.instance === 'string' ? payload.instance : payload?.instance?.instanceId);
  if (!instanceId) {
    throw new Error('Wix instance payload missing instanceId');
  }

  return {
    payload,
    instanceId,
    signatureValid: secret ? signatureValid : false,
  };
};

const extractCompId = (req: Request): string | undefined => {
  const headerCompId = req.headers['x-wix-comp-id'];
  if (typeof headerCompId === 'string') {
    return headerCompId;
  }
  if (Array.isArray(headerCompId)) {
    return headerCompId[0];
  }

  const queryCompId = req.query.compId;
  const queryCompIdAlt = req.query.comp_id || req.query['comp-id'];
  if (typeof queryCompId === 'string') {
    return queryCompId;
  }
  if (typeof queryCompIdAlt === 'string') {
    return queryCompIdAlt;
  }

  if (req.body && typeof req.body.compId === 'string') {
    return req.body.compId;
  }

  return undefined;
};

/**
 * Middleware to verify Wix instance token
 * This validates the JWT token sent from the Wix widget
 */
export const verifyWixInstance = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    const compId = extractCompId(req);

    // Get Wix App Secret from environment
    const WIX_APP_SECRET = process.env.WIX_APP_SECRET;

    if (!token) {
      console.warn('[WixAuth] No token provided');
      // In development, allow requests without token
      if (process.env.NODE_ENV !== 'production') {
        return next();
      }
      return res.status(401).json({ error: 'Authentication token required' });
    }

    let decoded: DecodedInstance;

    if (!WIX_APP_SECRET) {
      console.warn('[WixAuth] WIX_APP_SECRET not configured - performing unsigned decode');
      decoded = decodeWixInstanceToken(token);
      // In production, treat missing secret as server misconfiguration
      if (process.env.NODE_ENV === 'production') {
        return res.status(500).json({ error: 'Server configuration error' });
      }
    } else {
      decoded = decodeWixInstanceToken(token, WIX_APP_SECRET);
    }
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
      decodedToken: decoded.payload,
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
    const compId = extractCompId(req);

    const decoded = decodeWixInstanceToken(token, WIX_APP_SECRET);

    req.wix = {
      instanceId: decoded.instanceId,
      compId,
      decodedToken: decoded.payload,
    };

    console.log('[WixAuth] Optional auth - token verified for instance:', decoded.instanceId);
  } catch (err) {
    // Token invalid, but that's okay for optional auth
    console.log('[WixAuth] Optional auth - invalid token, continuing without Wix data');
  }

  next();
};
