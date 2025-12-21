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
  // Debug: Log all request details
  console.log('[extractCompId] ========== DEBUG ==========');
  console.log('[extractCompId] Request URL:', req.url);
  console.log('[extractCompId] Request method:', req.method);
  console.log('[extractCompId] All headers:', JSON.stringify(req.headers, null, 2));

  // Check x-wix-comp-id header (Express normalizes header names to lowercase)
  const headerCompId = req.headers['x-wix-comp-id'];
  console.log('[extractCompId] x-wix-comp-id header value:', headerCompId, '(type:', typeof headerCompId, ')');

  if (typeof headerCompId === 'string' && headerCompId.trim()) {
    console.log('[extractCompId] ✅ Found comp-id in header:', headerCompId);
    return headerCompId.trim();
  }
  if (Array.isArray(headerCompId) && headerCompId.length > 0 && headerCompId[0]) {
    console.log('[extractCompId] ✅ Found comp-id in header (array):', headerCompId[0]);
    return headerCompId[0].trim();
  }

  // Check query params as fallback
  const queryCompId = req.query.compId;
  const queryCompIdAlt = req.query.comp_id || req.query['comp-id'];
  if (typeof queryCompId === 'string' && queryCompId.trim()) {
    console.log('[extractCompId] ✅ Found comp-id in query (compId):', queryCompId);
    return queryCompId.trim();
  }
  if (typeof queryCompIdAlt === 'string' && queryCompIdAlt.trim()) {
    console.log('[extractCompId] ✅ Found comp-id in query (alt):', queryCompIdAlt);
    return queryCompIdAlt.trim();
  }

  // Check body as last fallback
  if (req.body && typeof req.body.compId === 'string' && req.body.compId.trim()) {
    console.log('[extractCompId] ✅ Found comp-id in body:', req.body.compId);
    return req.body.compId.trim();
  }

  console.log('[extractCompId] ❌ No comp-id found anywhere');
  console.log('[extractCompId] ================================');
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
 *
 * NEW: Also extracts comp-id even without auth (for editor mode)
 */
export const optionalWixAuth = async (req: Request, _res: Response, next: NextFunction) => {
  // Extract compId FIRST, before try block, so it's available in catch
  const compId = extractCompId(req);

  try {
    const authHeader = req.headers.authorization || '';
    const accessToken = authHeader.replace('Bearer ', '');

    // If no auth token, but comp-id exists (editor mode), attach comp-id only
    if (!accessToken) {
      if (compId) {
        req.wix = {
          instanceId: '', // Empty instanceId for editor mode
          compId,
          decodedToken: null,
        };
      }
      return next();
    }

    const WIX_APP_ID = process.env.WIX_APP_ID;
    const WIX_APP_SECRET = process.env.WIX_APP_SECRET;

    if (!WIX_APP_ID || !WIX_APP_SECRET) {
      // Still attach comp-id if available
      if (compId) {
        req.wix = {
          instanceId: '',
          compId,
          decodedToken: null,
        };
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
  } catch {
    // Token verification failed (editor mode with invalid token)
    // Fallback to compId-only mode
    if (compId) {
      req.wix = {
        instanceId: '',
        compId,
        decodedToken: null,
      };
    }
  }

  next();
};
