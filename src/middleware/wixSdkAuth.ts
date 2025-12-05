import { Request, Response, NextFunction } from 'express';
import { createClient, AppStrategy } from '@wix/sdk';
import { appInstances } from '@wix/app-management';
import axios from 'axios';
import NodeCache from 'node-cache';

// Cache for verified tokens - TTL of 5 minutes (tokens are valid longer, but we want fresh data periodically)
const tokenCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

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

// Type for cached token data
interface CachedWixData {
  instanceId: string;
  appDefId?: string;
  vendorProductId?: string | null;
  instanceData: any;
}

/**
 * Verify access token and get instance data using Wix SDK
 * Results are cached for 5 minutes to avoid repeated external API calls
 */
const verifyAccessToken = async (accessToken: string, appId: string, appSecret: string): Promise<CachedWixData> => {
  // Check cache first - use token hash as key for security
  const cacheKey = `wix_token_${accessToken.slice(-20)}`; // Use last 20 chars as key
  const cached = tokenCache.get<CachedWixData>(cacheKey);

  if (cached) {
    return cached;
  }

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

    const result: CachedWixData = {
      instanceId,
      appDefId: instanceData?.instance?.appDefId || instanceData?.appDefId,
      vendorProductId: instanceData?.instance?.vendorProductId || instanceData?.vendorProductId || null,
      instanceData,
    };

    // Cache the result
    tokenCache.set(cacheKey, result);

    return result;
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

    const WIX_APP_ID = process.env.WIX_APP_ID;
    const WIX_APP_SECRET = process.env.WIX_APP_SECRET;

    if (!accessToken) {
      if (process.env.NODE_ENV !== 'production') {
        return next();
      }
      return res.status(401).json({ error: 'Authentication token required' });
    }

    if (!WIX_APP_ID || !WIX_APP_SECRET) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(500).json({ error: 'Server configuration error' });
      }
      return next();
    }

    const wixData = await verifyAccessToken(accessToken, WIX_APP_ID, WIX_APP_SECRET);

    req.wix = {
      instanceId: wixData.instanceId,
      appDefId: wixData.appDefId,
      vendorProductId: wixData.vendorProductId,
      compId,
      decodedToken: wixData.instanceData,
    };

    next();
  } catch (err: any) {
    if (process.env.NODE_ENV !== 'production') {
      return next();
    }
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }
};

/**
 * Optional middleware - only verifies token if present
 * Use this for endpoints that should work both with and without Wix authentication
 */
export const optionalWixAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization || '';
    const accessToken = authHeader.replace('Bearer ', '');

    if (!accessToken) {
      return next();
    }

    const WIX_APP_ID = process.env.WIX_APP_ID;
    const WIX_APP_SECRET = process.env.WIX_APP_SECRET;
    const compId = extractCompId(req);

    if (!WIX_APP_ID || !WIX_APP_SECRET) {
      return next();
    }

    const wixData = await verifyAccessToken(accessToken, WIX_APP_ID, WIX_APP_SECRET);

    req.wix = {
      instanceId: wixData.instanceId,
      appDefId: wixData.appDefId,
      vendorProductId: wixData.vendorProductId,
      compId,
      decodedToken: wixData.instanceData,
    };
  } catch {
    // Token invalid, continue without Wix data
  }

  next();
};
