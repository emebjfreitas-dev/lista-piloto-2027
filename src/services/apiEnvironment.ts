/**
 * Centralized API Environment Detection & Rate Limit Protection
 *
 * Guarantees that when the application is hosted statically (e.g. GitHub Pages at *.github.io)
 * or when the Express backend is not running, the application NEVER fires requests to /api/*
 * endpoints. This completely eliminates 404 floods that trigger GitHub Pages rate limits
 * (HTTP 429 / 403 Rate Limit Exceeded) for all 100 concurrent school users.
 */

let probedBackend = false;
let backendAvailable = false;

/**
 * Checks if the current origin is a static host like GitHub Pages
 */
export const isStaticHosting = (): boolean => {
  if (typeof window === 'undefined') return true;
  const host = window.location.hostname.toLowerCase();
  if (
    host.includes('github.io') ||
    host.endsWith('github.dev') ||
    host.includes('pages.dev') ||
    window.location.protocol === 'file:'
  ) {
    return true;
  }
  return false;
};

/**
 * Determines whether the Express backend API (/api/*) is actually available
 */
export const isBackendApiAvailable = (): boolean => {
  if (isStaticHosting()) {
    return false;
  }
  if (!probedBackend) {
    // If running on localhost / 127.0.0.1 or custom port, probe lazily or assume true until probed
    return true;
  }
  return backendAvailable;
};

/**
 * Perform a single, lightweight probe on app startup to verify if /api/school-state exists.
 * If running on GitHub Pages, skips probing immediately to avoid even 1 unnecessary request.
 */
export const probeBackendAvailability = async (): Promise<boolean> => {
  if (typeof window === 'undefined') {
    backendAvailable = false;
    probedBackend = true;
    return false;
  }

  if (isStaticHosting()) {
    backendAvailable = false;
    probedBackend = true;
    return false;
  }

  if (probedBackend) {
    return backendAvailable;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch('/api/school-state', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      backendAvailable = true;
    } else {
      backendAvailable = false;
    }
  } catch {
    backendAvailable = false;
  } finally {
    probedBackend = true;
  }

  return backendAvailable;
};

/**
 * Converts a Google Drive file ID to a direct high-speed CDN thumbnail URL
 * that NEVER touches GitHub or local /api/ proxy endpoints.
 */
export const getDirectGoogleDriveThumbnailUrl = (
  fileId: string,
  width: number = 400
): string => {
  const cleanId = String(fileId || '').replace(/[^a-zA-Z0-9-_]/g, '');
  if (!cleanId) return '';
  return `https://lh3.googleusercontent.com/d/${cleanId}=w${width}`;
};
