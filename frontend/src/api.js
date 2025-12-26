import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 300000,
});

// Configuration
export const getConfig = () => api.get('/config');
export const setBuffer = (bufferDistance) => api.post('/config/buffer', { buffer_distance: bufferDistance });
export const uploadShapefile = (type, files, onProgress) => {
  const formData = new FormData();
  files.forEach(file => formData.append('file', file));
  return api.post(`/config/shapefile/${type}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress,
    timeout: 600000, // 10 minutes for large shapefiles
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });
};
export const getShapefilePreview = (type) => api.get(`/config/shapefile/${type}/preview`);
export const getMunicipiosFromShapefile = () => api.get('/config/municipios');

// Routes
export const getRoutes = (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.municipio) params.append('municipio', filters.municipio);
  if (filters.modalidad) params.append('modalidad', filters.modalidad);
  if (filters.analyzed !== undefined) params.append('analyzed', filters.analyzed);
  return api.get(`/routes?${params.toString()}`);
};
export const getRoute = (id) => api.get(`/routes/${id}`);
export const uploadRoute = (file, metadata, onProgress) => {
  const formData = new FormData();
  formData.append('file', file);
  Object.keys(metadata).forEach(key => {
    if (metadata[key]) formData.append(key, metadata[key]);
  });
  return api.post('/routes', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress
  });
};
export const uploadRoutesBatch = (zipFile, csvFile, onProgress) => {
  const formData = new FormData();
  formData.append('file', zipFile);
  if (csvFile) formData.append('metadata', csvFile);
  return api.post('/routes/batch', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress
  });
};
export const updateRoute = (id, data) => api.put(`/routes/${id}`, data);
export const deleteRoute = (id) => api.delete(`/routes/${id}`);
export const getRouteGPX = (id) => api.get(`/routes/${id}/gpx`);

// Analysis
export const analyzeRoute = (id) => api.post(`/analysis/${id}`);
export const getAnalysisResults = (id) => api.get(`/analysis/${id}/results`);
export const analyzeBatch = () => api.post('/analysis/batch');

// Dashboard
export const getGlobalDashboard = () => api.get('/dashboard/global');
export const getMunicipioDashboard = (municipio) => api.get(`/dashboard/municipio/${encodeURIComponent(municipio)}`);
export const getMunicipiosList = () => api.get('/dashboard/municipios');

// Export
export const exportRouteJSON = (id) => api.get(`/export/route/${id}/json`);
export const exportRouteShapefile = (id) => api.get(`/export/route/${id}/shapefile`, { responseType: 'blob' });
export const exportRoutesCSV = () => api.get('/export/routes/csv', { responseType: 'blob' });
export const exportRoutesExcel = () => api.get('/export/routes/excel', { responseType: 'blob' });

export default api;
