import axios from 'axios';

const API_HOST = window.location.hostname;
const API = axios.create({
    baseURL: `http://${API_HOST}:5000/api/v1`,
});

// Automatically attach token to every request
API.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// ── Dashboard ────────────────────────────
export const getLifecycleMonitoring = () => API.get('/dashboard/lifecycle-monitoring');

// ── Auth ──────────────────────────────────
export const loginUser           = (data) => API.post('/auth/login', data);
export const logoutUser          = ()     => API.post('/auth/logout');
export const getSessionsUser     = ()     => API.get('/auth/sessions');
export const logoutAllUser       = ()     => API.post('/auth/logout-all');
export const refreshTokenUser    = (data) => API.post('/auth/refresh', data);

// ── Plantings ─────────────────────────────
// params: { status, limit } — use status='active' for harvest/activity dropdowns
export const getPlantings   = (params = {}) => API.get('/plantings',  { params: { limit: 100, ...params } });
export const getPlantingById = (id)           => API.get(`/plantings/${id}`);
export const createPlanting  = (data)         => API.post('/plantings', data);
export const updatePlanting  = (id, data)     => API.put(`/plantings/${id}`, data);
export const deletePlanting  = (id)           => API.delete(`/plantings/${id}`);

// ── Varieties (catalog) ───────────────────
export const getVarieties = (params = {}) => API.get('/varieties', { params });

// ── Activities ────────────────────────────
// params: { planting_id, limit }
export const getActivities   = (params = {}) => API.get('/activities', { params: { limit: 100, ...params } });
export const getActivityById  = (id)           => API.get(`/activities/${id}`);
export const createActivity   = (data)         => API.post('/activities', data);
export const updateActivity   = (id, data)     => API.put(`/activities/${id}`, data);
export const deleteActivity   = (id)           => API.delete(`/activities/${id}`);

// ── Harvests ──────────────────────────────
export const getHarvests   = (params = {}) => API.get('/harvests',   { params: { limit: 100, ...params } });
export const getHarvestById = (id)           => API.get(`/harvests/${id}`);
export const createHarvest  = (data)         => API.post('/harvests', data);
export const updateHarvest  = (id, data)     => API.put(`/harvests/${id}`, data);
export const deleteHarvest  = (id)           => API.delete(`/harvests/${id}`);

// ── Weather Proxy ─────────────────────────
// Fetches weather via backend proxy (caches 30 min server-side)
export const getWeather = (location) => API.get('/weather', { params: { location } });

// ── Notifications ─────────────────────────
export const getNotifications          = ()     => API.get('/notifications');
export const markNotificationRead      = (id)   => API.patch(`/notifications/${id}/read`);
export const markAllNotificationsRead  = (group) => API.patch('/notifications/read-all', null, { params: { group } });
export const deleteNotification        = (id)   => API.delete(`/notifications/${id}`);

// ── Exports ───────────────────────────────
export const exportPlantingsCSV = (params = {}) => API.get('/plantings/export/csv', { params, responseType: 'blob' });
export const exportPlantingsPDF = (params = {}) => API.get('/plantings/export/pdf', { params, responseType: 'blob' });
export const exportPlantingPDF  = (id)          => API.get(`/plantings/${id}/export/pdf`, { responseType: 'blob' });

export default API;