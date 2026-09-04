// Centralized API and WebSocket URL builder supporting local dev and Vercel/Render deployments

function normalizeUrl(url) {
  if (!url) return '';
  let clean = url.trim().replace(/\/$/, '');
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = `https://${clean}`;
  }
  return clean;
}

// 1. Check build-time environment variable VITE_API_URL
// 2. Check localStorage fallback 'letter_duel_api_url' (useful for quick testing without rebuilding)
const envApiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL;
const localFallback = typeof window !== 'undefined' ? window.localStorage.getItem('letter_duel_api_url') : null;

export const API_BASE = normalizeUrl(envApiUrl || localFallback || '');

// Intercept global fetch so all relative '/api/...' calls route to API_BASE automatically
if (typeof window !== 'undefined') {
  if (API_BASE) {
    const originalFetch = window.fetch;
    window.fetch = function (resource, init) {
      if (typeof resource === 'string' && resource.startsWith('/api')) {
        const fullUrl = `${API_BASE}${resource}`;
        return originalFetch(fullUrl, init);
      }
      return originalFetch(resource, init);
    };
    console.log(`[Letter-Duel] API Base configured: ${API_BASE}`);
  } else {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocal) {
      console.warn(
        `[Letter-Duel] Warning: VITE_API_URL is not configured!\n` +
        `API requests are hitting ${window.location.origin} and will return 404.\n` +
        `Set VITE_API_URL in your Vercel Environment Variables, or run in DevTools Console:\n` +
        `localStorage.setItem('letter_duel_api_url', 'https://<your-backend-app>.onrender.com'); location.reload();`
      );
    }
  }
}

export function getApiUrl(endpoint) {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE}${path}`;
}

export function getWsUrl(roomCode, token) {
  const backend = API_BASE;
  if (backend) {
    const wsProtocol = backend.startsWith('https') ? 'wss:' : 'ws:';
    const host = backend.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `${wsProtocol}//${host}/ws/room/${roomCode}?token=${encodeURIComponent(token)}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws/room/${roomCode}?token=${encodeURIComponent(token)}`;
}
