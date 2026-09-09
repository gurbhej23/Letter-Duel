// Centralized API and WebSocket URL builder supporting local dev, Vercel, and Render deployments

const PRODUCTION_DEFAULT_BACKEND = 'https://letter-duel-backend.onrender.com';

function normalizeUrl(url) {
  if (!url) return '';
  let clean = url.trim().replace(/\/$/, '');
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = `https://${clean}`;
  }
  return clean;
}

function resolveApiBase() {
  // 1. Build-time environment variable (highest priority)
  const envApiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL;
  if (envApiUrl && envApiUrl.trim()) {
    return normalizeUrl(envApiUrl);
  }

  // 2. LocalStorage override (for dev/testing)
  if (typeof window !== 'undefined') {
    const localFallback = window.localStorage.getItem('letter_duel_api_url');
    if (localFallback && localFallback.trim()) {
      return normalizeUrl(localFallback);
    }
  }

  // 3. If running in browser:
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isDev = Boolean(import.meta.env.DEV);
    const isTunnelOrLocal =
      isDev ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.ngrok-free.dev') ||
      hostname.endsWith('.ngrok-free.app') ||
      hostname.endsWith('.ngrok.io') ||
      hostname.endsWith('.loca.lt') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.');

    // Local dev or dev tunnel: use relative paths so Vite proxy forwards to local backend
    if (isTunnelOrLocal) {
      return '';
    }

    // Production (Vercel / live domain): fallback to deployed backend
    return normalizeUrl(PRODUCTION_DEFAULT_BACKEND);
  }

  return '';
}

export const API_BASE = resolveApiBase();

// Intercept global fetch so all relative '/api/...' calls route to API_BASE automatically
if (typeof window !== 'undefined' && API_BASE) {
  const originalFetch = window.fetch;
  window.fetch = function (resource, init) {
    if (typeof resource === 'string' && resource.startsWith('/api')) {
      const fullUrl = `${API_BASE}${resource}`;
      return originalFetch(fullUrl, init);
    }
    if (resource instanceof URL && resource.pathname.startsWith('/api')) {
      return originalFetch(new URL(`${API_BASE}${resource.pathname}${resource.search}`), init);
    }
    if (typeof Request !== 'undefined' && resource instanceof Request && resource.url) {
      try {
        const urlObj = new URL(resource.url, window.location.origin);
        if (urlObj.pathname.startsWith('/api')) {
          const targetUrl = `${API_BASE}${urlObj.pathname}${urlObj.search}`;
          return originalFetch(new Request(targetUrl, resource));
        }
      } catch {
        // pass through to originalFetch
      }
    }
    return originalFetch(resource, init);
  };
}

export function getApiUrl(endpoint) {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE}${path}`;
}

export function getWsUrl(roomCode, token) {
  const cleanCode = (roomCode || '').trim().toUpperCase();
  const cleanToken = (token || '').trim();
  const backend = API_BASE;

  if (backend) {
    const wsProtocol = backend.startsWith('https') ? 'wss:' : 'ws:';
    const host = backend.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `${wsProtocol}//${host}/ws/room/${cleanCode}?token=${encodeURIComponent(cleanToken)}`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws/room/${cleanCode}?token=${encodeURIComponent(cleanToken)}`;
}

export async function apiFetch(endpoint, options = {}) {
  const url = getApiUrl(endpoint);
  return fetch(url, options);
}
