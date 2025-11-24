import { Request, Response, NextFunction } from 'express';
import { createClient, AppStrategy } from '@wix/sdk';
import { appInstances } from '@wix/app-management';
import axios from 'axios';

// Extend Express Request to include Wix data
declare global {
  namespace Express {
    interface Request {
      wix?: {
        instanceId: string;
        appDefId?: string;
        vendorProductId?: string | null;
        compId?: string;
        decodedToken: any;
      };
    }
  }
}

/**
 * Extract component ID from request headers, query params, or body
 */
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
 * Verify access token and get instance data using Wix SDK
 */
const verifyAccessToken = async (accessToken: string, appId: string, appSecret: string) => {
  try {
    // Step 1: Verify token and get instanceId using Wix token-info endpoint
    const tokenInfoResponse = await axios.post(
      'https://www.wixapis.com/oauth2/token-info',
      { token: accessToken }
    );

    const instanceId = tokenInfoResponse.data.instanceId;

    if (!instanceId) {
      throw new Error('No instanceId found in token response');
    }

    console.log('[WixSDK] Token verified, Instance ID:', instanceId);

    // Step 2: Create elevated client to get full app instance data
    const elevatedClient = createClient({
      auth: await AppStrategy({
        appId,
        appSecret,
        accessToken,
      }).elevated(),
      modules: {
        appInstances,
      },
    });

    // Step 3: Get app instance details
    const instanceResponse = await elevatedClient.appInstances.getAppInstance();
    const instanceData: any = instanceResponse;

    console.log('[WixSDK] App instance data retrieved:', instanceData);

    return {
      instanceId,
      appDefId: instanceData?.instance?.appDefId || instanceData?.appDefId,
      vendorProductId: instanceData?.instance?.vendorProductId || instanceData?.vendorProductId || null,
      instanceData,
    };
  } catch (error: any) {
    console.error('[WixSDK] Token verification failed:', error.message);
    throw error;
  }
};

/**
 * Middleware to verify Wix access token using official Wix SDK
 * This validates the token via Wix OAuth2 token-info endpoint
 */
export const verifyWixInstance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization || '';
    const accessToken = authHeader.replace('Bearer ', '');
    const compId = extractCompId(req);

    // Get Wix credentials from environment
    const WIX_APP_ID = process.env.WIX_APP_ID;
    const WIX_APP_SECRET = process.env.WIX_APP_SECRET;

    if (!accessToken) {
      console.warn('[WixSDK] No access token provided');
      // In development, allow requests without token
      if (process.env.NODE_ENV !== 'production') {
        return next();
      }
      return res.status(401).json({ error: 'Authentication token required' });
    }

    if (!WIX_APP_ID || !WIX_APP_SECRET) {
      console.error('[WixSDK] WIX_APP_ID or WIX_APP_SECRET not configured');
      if (process.env.NODE_ENV === 'production') {
        return res.status(500).json({ error: 'Server configuration error' });
      }
      // In development, log warning but continue
      console.warn('[WixSDK] Development mode - allowing request despite missing credentials');
      return next();
    }

    // Verify token and get instance data
    const wixData = await verifyAccessToken(accessToken, WIX_APP_ID, WIX_APP_SECRET);

    console.log('[WixSDK] Authentication successful');
    console.log('[WixSDK] Instance ID:', wixData.instanceId);
    console.log('[WixSDK] App Def ID:', wixData.appDefId || 'N/A');
    console.log('[WixSDK] Vendor Product ID (Plan):', wixData.vendorProductId || 'N/A');
    if (compId) {
      console.log('[WixSDK] Component ID:', compId);
    }

    // Attach Wix data to request object for use in controllers
    req.wix = {
      instanceId: wixData.instanceId,
      appDefId: wixData.appDefId,
      vendorProductId: wixData.vendorProductId,
      compId,
      decodedToken: wixData.instanceData,
    };

    next();
  } catch (err: any) {
    console.error('[WixSDK] Authentication failed:', err.message);

    // In development, log error but allow request
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[WixSDK] Development mode - allowing request despite authentication failure');
      return next();
    }

    return res.status(401).json({ error: 'Invalid or expired access token' });
  }
};

/**
 * Optional middleware - only verifies token if present
 * Use this for endpoints that should work both with and without Wix authentication
 */
export const optionalWixAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization || '';
    const accessToken = authHeader.replace('Bearer ', '');

    if (!accessToken) {
      // No token provided, continue without Wix data
      return next();
    }

    const WIX_APP_ID = process.env.WIX_APP_ID;
    const WIX_APP_SECRET = process.env.WIX_APP_SECRET;
    const compId = extractCompId(req);

    if (!WIX_APP_ID || !WIX_APP_SECRET) {
      console.warn('[WixSDK] Optional auth - credentials not configured, continuing without auth');
      return next();
    }

    // Verify token and get instance data
    const wixData = await verifyAccessToken(accessToken, WIX_APP_ID, WIX_APP_SECRET);

    req.wix = {
      instanceId: wixData.instanceId,
      appDefId: wixData.appDefId,
      vendorProductId: wixData.vendorProductId,
      compId,
      decodedToken: wixData.instanceData,
    };

    console.log('[WixSDK] Optional auth - token verified for instance:', wixData.instanceId);
    console.log('[WixSDK] Optional auth - appDefId:', wixData.appDefId || 'N/A');
    console.log('[WixSDK] Optional auth - vendorProductId:', wixData.vendorProductId || 'N/A');
  } catch (err: any) {
    // Token invalid, but that's okay for optional auth
    console.log('[WixSDK] Optional auth - invalid token, continuing without Wix data:', err.message);
  }

  next();
};
