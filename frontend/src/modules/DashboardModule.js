import React, { useState, useEffect, useCallback } from 'react';
import { Route, MapPin, Clock, Gauge, Building2, CheckCircle, AlertCircle } from 'lucide-react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { getGlobalDashboard, getMunicipiosList, getRoutes, getRouteGPX, getConfig } from '../api';
import 'leaflet/dist/leaflet.css';

function DashboardModule({ onViewMunicipio }) {
  const [stats, setStats] = useState(null);
  const [municipios, setMunicipios] = useState({});
  const [routes, setRoutes] = useState([]);
  const [routesGeoJSON, setRoutesGeoJSON] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [statsRes, munRes, routesRes, configRes] = await Promise.all([
        getGlobalDashboard(),
        getMunicipiosList(),
        getRoutes({ analyzed: 'true' }),
        getConfig()
      ]);
      
      setStats(statsRes.data);
      setMunicipios(munRes.data.municipios || {});
      setRoutes(routesRes.data.routes || []);
      setConfig(configRes.data);

      // Load GPX data for map
      if (routesRes.data.routes?.length > 0) {
        const gpxFeatures = [];
        for (const route of routesRes.data.routes.slice(0, 50)) {
          try {
            const gpxRes = await getRouteGPX(route.id);
            if (gpxRes.data?.features) {
              gpxRes.data.features.forEach(f => {
                f.properties = { ...f.properties, routeName: route.nombre, municipio: route.municipio };
              });
              gpxFeatures.push(...gpxRes.data.features);
            }
          } catch (e) {}
        }
        if (gpxFeatures.length > 0) {
          setRoutesGeoJSON({ type: 'FeatureCollection', features: gpxFeatures });
        }
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const configComplete = config?.road_network?.loaded && config?.municipalities?.loaded && config?.localities?.loaded;

  const surfaceData = stats ? [
    { name: 'Pavimentado', value: stats.surface_distribution?.pavimentado || 0, color: '#3b82f6' },
    { name: 'Terracería', value: stats.surface_distribution?.terraceria || 0, color: '#f59e0b' },
    { name: 'N/A', value: stats.surface_distribution?.na || 0, color: '#9ca3af' }
  ].filter(d => d.value > 0) : [];

  const adminData = stats ? [
    { name: 'Federal', km: stats.admin_distribution?.federal || 0 },
    { name: 'Estatal', km: stats.admin_distribution?.estatal || 0 },
    { name: 'Municipal', km: stats.admin_distribution?.municipal || 0 },
    { name: 'N/A', km: stats.admin_distribution?.na || 0 }
  ].filter(d => d.km > 0) : [];

  const modalidadData = stats?.routes_by_modalidad ? 
    Object.entries(stats.routes_by_modalidad).map(([name, value]) => ({ name: name || 'Sin especificar', value })) : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: '50vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard General</h2>
        <p>Resumen global del análisis de rutas de transporte</p>
      </div>

      {!configComplete && (
        <div className="alert alert-warning">
          <AlertCircle className="w-5 h-5" />
          <span>
            Configuración incompleta. Ve al módulo de Configuración para cargar los shapefiles base.
          </span>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-label">Total de Rutas</div>
          <div className="stat-value">{stats?.total_routes || 0}</div>
          <div className="stat-sublabel">{stats?.analyzed_routes || 0} analizadas</div>
        </div>
        <div className="stat-card success">
          <div className="stat-label">Kilómetros Analizados</div>
          <div className="stat-value">{(stats?.total_km || 0).toFixed(1)}</div>
          <div className="stat-sublabel">km totales</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-label">Municipios con Rutas</div>
          <div className="stat-value">{stats?.municipalities_with_routes || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Rutas Pendientes</div>
          <div className="stat-value">{stats?.pending_routes || 0}</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Mapa de Rutas Analizadas</span>
          </div>
          <div className="map-container">
            <MapContainer
              center={[23.6345, -102.5528]}
              zoom={5}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {routesGeoJSON && (
                <GeoJSON
                  data={routesGeoJSON}
                  style={() => ({
                    color: '#3b82f6',
                    weight: 2,
                    opacity: 0.7
                  })}
                  onEachFeature={(feature, layer) => {
                    if (feature.properties) {
                      layer.bindPopup(`
                        <strong>${feature.properties.routeName || 'Ruta'}</strong><br/>
                        ${feature.properties.municipio || ''}
                      `);
                    }
                  }}
                />
              )}
            </MapContainer>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Distribución por Superficie</span>
            </div>
            {surfaceData.length > 0 ? (
              <div className="chart-container" style={{ height: '200px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={surfaceData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {surfaceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `${value.toFixed(2)} km`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-center" style={{ color: '#6b7280', padding: '2rem' }}>Sin datos</p>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Rutas por Modalidad</span>
            </div>
            {modalidadData.length > 0 ? (
              <div className="chart-container" style={{ height: '200px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={modalidadData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={80} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-center" style={{ color: '#6b7280', padding: '2rem' }}>Sin datos</p>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <Building2 className="w-4 h-4" style={{ display: 'inline', marginRight: '0.5rem' }} />
            Resumen por Municipio
          </span>
        </div>
        
        {Object.keys(municipios).length > 0 ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Municipio</th>
                  <th>Total Rutas</th>
                  <th>Analizadas</th>
                  <th>Progreso</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(municipios)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([name, data]) => (
                    <tr key={name}>
                      <td><strong>{name || 'Sin especificar'}</strong></td>
                      <td>{data.total}</td>
                      <td>
                        <span className="badge badge-success">
                          <CheckCircle className="w-3 h-3" style={{ marginRight: '0.25rem' }} />
                          {data.analyzed}
                        </span>
                      </td>
                      <td>
                        <div className="progress-bar" style={{ width: '100px' }}>
                          <div 
                            className="progress-fill" 
                            style={{ width: `${(data.analyzed / data.total) * 100}%` }} 
                          />
                        </div>
                      </td>
                      <td>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => onViewMunicipio(name)}
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center" style={{ color: '#6b7280', padding: '2rem' }}>
            No hay rutas cargadas. Ve al módulo de Rutas GPX para comenzar.
          </p>
        )}
      </div>
    </div>
  );
}

export default DashboardModule;
