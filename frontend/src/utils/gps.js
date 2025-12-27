import { getDeviceInfoString, getExternalIP, cacheDeviceInfo } from './deviceInfo';

/**
 * Professional GPS Utility - Maximum Accuracy
 * ============================================
 * 
 * Features:
 * - Always requests FRESH GPS position (no stale cache)
 * - High accuracy mode by default
 * - Progressive timeout for better readings
 * - Multiple attempts to get best accuracy
 * - Clear feedback on location quality
 */

const LOCATION_CACHE_KEY = 'gps_location_cache';
const LOCATION_CACHE_DURATION = 2 * 60 * 1000; // 2 minutes (shorter for freshness)

// Accuracy thresholds in meters
const ACCURACY = {
  ULTRA: 10,
  HIGH: 30,
  MEDIUM: 100,
  LOW: 500,
  ACCEPTABLE: 200
};

/**
 * Initialize GPS - For login/initial load
 * Tries to get best available position quickly
 */
export const initializeGPS = async () => {
  try {
    await cacheDeviceInfo();

    // Try to get a fresh GPS position first
    const location = await getFreshLocation({ timeout: 8000 });
    if (location) {
      cacheLocation(location);
      return { success: true, location };
    }
  } catch {
    // Silent fail
  }

  // Fallback to cached if very recent
  const cached = getLastKnownLocation();
  if (cached) {
    return { success: true, location: cached, source: 'cache' };
  }

  return { success: false };
};

/**
 * Get Fresh Location - ALWAYS requests new GPS reading
 * This is the professional way to get accurate location
 */
const getFreshLocation = (options = {}) => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    const timeoutMs = options.timeout || 10000;
    const timeout = setTimeout(() => {
      reject(new Error('GPS timeout'));
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeout);
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          altitudeAccuracy: position.coords.altitudeAccuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
          timestamp: new Date().toISOString(),
          source: 'gps'
        });
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
      {
        enableHighAccuracy: true,  // Force high accuracy
        timeout: timeoutMs,
        maximumAge: 0  // CRITICAL: Force fresh position, no cache
      }
    );
  });
};

/**
 * Get High Accuracy Location - Professional method
 * Uses multiple attempts to get the best possible reading
 */
export const getHighAccuracyLocation = async (options = {}) => {
  const { targetAccuracy = ACCURACY.HIGH, maxAttempts = 5, timeout = 15000 } = options;

  if (!navigator.geolocation) {
    throw new Error('Geolocation not supported');
  }

  const readings = [];
  const startTime = Date.now();

  // Progressive attempts with increasing timeout
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Check if we've exceeded total timeout
    if (Date.now() - startTime > timeout) break;

    try {
      const attemptTimeout = Math.min(3000 + (attempt * 2000), 10000);
      const result = await getFreshLocation({ timeout: attemptTimeout });

      readings.push(result);

      // If we got excellent accuracy, return immediately
      if (result.accuracy <= targetAccuracy) {
        return result;
      }

      // Wait a bit between attempts for GPS to improve
      if (attempt < maxAttempts && result.accuracy > targetAccuracy) {
        await new Promise(r => setTimeout(r, 500));
      }
    } catch {
      // Continue to next attempt
    }
  }

  if (readings.length > 0) {
    return selectBestReading(readings);
  }

  throw new Error('Could not get accurate location');
};

/**
 * Quick Location Attempt - For non-blocking operations
 * Still forces fresh position but with shorter timeout
 */
const quickLocationAttempt = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    const timeout = setTimeout(() => {
      reject(new Error('Timeout'));
    }, 5000);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeout);
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date().toISOString(),
          source: 'gps'
        });
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0  // Force fresh position
      }
    );
  });
};

/**
 * Single GPS Attempt (internal use)
 */
const singleAttempt = (options) => {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date().toISOString(),
          source: 'gps'
        });
      },
      reject,
      { ...options, maximumAge: 0 }  // Always force fresh
    );
  });
};

/**
 * Select Best Reading from Multiple Attempts
 */
const selectBestReading = (readings) => {
  if (readings.length === 0) return null;
  return readings.reduce((best, current) =>
    current.accuracy < best.accuracy ? current : best
  );
};

/**
 * Request GPS Permission (legacy compatibility)
 */
export const requestGPSPermission = async () => {
  try {
    return await quickLocationAttempt();
  } catch {
    throw new Error('Location unavailable');
  }
};

/**
 * Get Last Known Location from Cache
 */
export const getLastKnownLocation = () => {
  try {
    const cached = localStorage.getItem(LOCATION_CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached);
      const age = Date.now() - new Date(data.timestamp).getTime();
      if (age < LOCATION_CACHE_DURATION) {
        return { ...data, fromCache: true };
      }
    }
  } catch {
    // Silent fail
  }
  return null;
};

/**
 * Get Location Silently - For background use
 * Still prioritizes fresh GPS over cache
 */
export const getLocationSilently = async () => {
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' });

    if (result.state === 'granted') {
      try {
        return await getFreshLocation({ timeout: 8000 });
      } catch {
        // Fall through to cache
      }
    }
  } catch {
    // Permissions API not supported, try directly
    try {
      return await getFreshLocation({ timeout: 8000 });
    } catch {
      // Fall through to cache
    }
  }

  // Only use cache as last resort
  const cached = getLastKnownLocation();
  if (cached) return cached;

  return null;
};

/**
 * Cache Location (internal)
 */
const cacheLocation = (location) => {
  try {
    localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify({
      ...location,
      timestamp: location.timestamp || new Date().toISOString()
    }));
  } catch {
    // Silent fail
  }
};

/**
 * Get Location from IP (Only as emergency fallback)
 * Note: IP location is VERY inaccurate (city level, ~5km)
 */
export const getIPBasedLocation = async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch('https://ipapi.co/json/', { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      return {
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: 5000, // IP is city-level accuracy ~5km
        city: data.city,
        country: data.country_name,
        source: 'ip',
        timestamp: new Date().toISOString()
      };
    }
  } catch {
    // Silent fail
  }
  return null;
};

/**
 * Watch GPS Position - Continuous real-time tracking
 * Uses maximum accuracy settings
 */
export const watchGPSPosition = (callback, errorCallback) => {
  if (!navigator.geolocation) {
    errorCallback?.(new Error('Geolocation not supported'));
    return null;
  }

  return navigator.geolocation.watchPosition(
    (position) => {
      const location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        altitude: position.coords.altitude,
        heading: position.coords.heading,
        speed: position.coords.speed,
        timestamp: new Date().toISOString(),
        source: 'gps'
      };
      cacheLocation(location);
      callback(location);
    },
    (error) => {
      errorCallback?.(error);
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0  // Always fresh positions
    }
  );
};

/**
 * Stop Watching GPS
 */
export const stopWatchingGPS = (watchId) => {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
  }
};

/**
 * Calculate Distance (Haversine Formula)
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRad = (value) => (value * Math.PI) / 180;

/**
 * Get Full Tracking Data for API Calls
 */
export const getTrackingData = async () => {
  const location = await getLocationSilently();
  const deviceInfo = await getDeviceInfoString();
  const externalIP = await getExternalIP();

  return {
    latitude: location?.latitude || null,
    longitude: location?.longitude || null,
    accuracy: location?.accuracy || null,
    locationSource: location?.source || 'unknown',
    deviceInfo,
    externalIP
  };
};

/**
 * Clear Location Cache (For Logout)
 */
export const clearLocationCache = () => {
  try {
    localStorage.removeItem(LOCATION_CACHE_KEY);
  } catch {
    // Silent fail
  }
};

/**
 * Verify Location Accuracy
 */
export const verifyLocationAccuracy = (location, requiredAccuracy = ACCURACY.MEDIUM) => {
  if (!location || !location.accuracy) return false;
  return location.accuracy <= requiredAccuracy;
};

/**
 * Get Accuracy Summary (For UI display)
 */
export const getAccuracySummary = (accuracy) => {
  if (!accuracy) return { level: 'UNKNOWN', label: 'غير معروف', color: 'gray', icon: '?' };

  if (accuracy <= ACCURACY.ULTRA) {
    return { level: 'ULTRA', label: 'دقة متناهية', color: 'green', icon: '🎯' };
  }
  if (accuracy <= ACCURACY.HIGH) {
    return { level: 'HIGH', label: 'دقة عالية', color: 'green', icon: '✓' };
  }
  if (accuracy <= ACCURACY.MEDIUM) {
    return { level: 'MEDIUM', label: 'دقة متوسطة', color: 'yellow', icon: '⚠' };
  }
  if (accuracy <= ACCURACY.LOW) {
    return { level: 'LOW', label: 'دقة منخفضة', color: 'orange', icon: '!' };
  }
  return { level: 'VERY_LOW', label: 'دقة ضعيفة', color: 'red', icon: '✗' };
};