/* API helper — all requests include credentials for cookie auth */

const BASE = process.env.NEXT_PUBLIC_API_URL || '';

// Custom event for auth failures — AuthContext listens for this
const AUTH_ERROR_EVENT = 'auth:unauthorized';

function dispatchAuthError() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_ERROR_EVENT));
  }
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (res.status === 401) {
    // Only dispatch auth error for non-auth routes
    // Auth routes (login, me) should just throw so the caller handles it
    if (!path.includes('/auth/login') && !path.includes('/auth/me')) {
      dispatchAuthError();
    }
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Request failed: ${res.status}`);
  }

  return res.json();
}

// Special request for file downloads (CSV export)
async function downloadRequest(path, filename) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
  });

  if (res.status === 401) {
    dispatchAuthError();
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Export failed: ${res.status}`);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'export.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export const AUTH_ERROR_EVENT_NAME = AUTH_ERROR_EVENT;

export const api = {
  // Auth
  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/auth/me'),

  // Engines
  engines: (params) => request(`/api/engines/?${new URLSearchParams(params || {})}`),
  engineLookup: (qr) => request(`/api/engines/lookup?qr=${encodeURIComponent(qr)}`),
  engineHistory: (id) => request(`/api/engines/${id}/history`),
  variants: () => request('/api/engines/variants'),
  searchEngines: (q, status, variant) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status_filter', status);
    if (variant) params.set('variant', variant);
    return request(`/api/engines/?${params}`);
  },
  engineSummary: () => request('/api/engines/stats/summary'),
  updateVariant: (id, data) => request(`/api/engines/variants/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Scan operations
  putAway: (data) => request('/api/scan/put-away', { method: 'POST', body: JSON.stringify(data) }),
  retrieval: (data) => request('/api/scan/retrieval', { method: 'POST', body: JSON.stringify(data) }),
  verifyVin: (data) => request('/api/scan/verify-vin', { method: 'POST', body: JSON.stringify(data) }),

  // Dashboard
  stats: () => request('/api/dashboard/stats'),
  movements: (limit) => request(`/api/dashboard/movements?limit=${limit || 50}`),
  incidents: (resolved) =>
    request(`/api/dashboard/incidents${resolved !== undefined ? `?resolved=${resolved}` : ''}`),
  resolveIncident: (id) => request(`/api/dashboard/incidents/${id}/resolve`, { method: 'POST' }),
  auditLogs: (limit) => request(`/api/dashboard/audit-logs?limit=${limit || 100}`),
  locations: (zone) => request(`/api/dashboard/locations${zone ? `?zone=${zone}` : ''}`),
  analytics: () => request('/api/dashboard/analytics'),
  vehicles: () => request('/api/dashboard/vehicles'),
  activity: (limit) => request(`/api/dashboard/activity?limit=${limit || 20}`),

  // User Management (RBAC)
  listUsers: () => request('/api/auth/users'),
  createUser: (data) => request('/api/auth/users', { method: 'POST', body: JSON.stringify(data) }),
  deleteUser: (id) => request(`/api/auth/users/${id}`, { method: 'DELETE' }),
  changePassword: (id, password) => request(`/api/auth/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),

  // Engine & Product (Variant) Registration
  registerEngine: (data) => request('/api/engines/', { method: 'POST', body: JSON.stringify(data) }),
  registerVariant: (data) => request('/api/engines/variants', { method: 'POST', body: JSON.stringify(data) }),

  // Map / Location Management
  createLocation: (data) => request('/api/dashboard/locations', { method: 'POST', body: JSON.stringify(data) }),
  updateLocation: (id, data) => request(`/api/dashboard/locations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLocation: (id) => request(`/api/dashboard/locations/${id}`, { method: 'DELETE' }),
  createLocationsBulk: (data) => request('/api/dashboard/locations/bulk', { method: 'POST', body: JSON.stringify(data) }),

  // Warehouse Sections
  listSections: () => request('/api/dashboard/sections'),
  createSection: (data) => request('/api/dashboard/sections', { method: 'POST', body: JSON.stringify(data) }),
  updateSection: (id, data) => request(`/api/dashboard/sections/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSection: (id) => request(`/api/dashboard/sections/${id}`, { method: 'DELETE' }),

  // Export
  exportEngines: () => downloadRequest('/api/dashboard/export/engines', `engines_${new Date().toISOString().slice(0,10)}.csv`),
  exportMovements: () => downloadRequest('/api/dashboard/export/movements', `movements_${new Date().toISOString().slice(0,10)}.csv`),
  exportAuditLogs: () => downloadRequest('/api/dashboard/export/audit-logs', `audit_logs_${new Date().toISOString().slice(0,10)}.csv`),
  exportLocations: () => downloadRequest('/api/dashboard/export/locations', `locations_${new Date().toISOString().slice(0,10)}.csv`),
};
