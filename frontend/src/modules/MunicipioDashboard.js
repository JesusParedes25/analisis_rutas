import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, Route, Clock, Gauge, MapPin, Home, Building2, Users, Accessibility, Maximize2, X } from 'lucide-react';
import { MapContainer, TileLayer, GeoJSON, useMap, LayersControl } from 'react-leaflet';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } from 'recharts';
import { getMunicipioDashboard, getRoutes, getRouteGPX, getShapefilePreview } from '../api';
import 'leaflet/dist/leaflet.css';

// Route colors for different routes
const ROUTE_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
const ROUTE_DASH_ARRAYS = ['', '10, 5', '5, 5', '15, 10, 5, 10', '20, 5', ''];

// Component to fit map bounds to routes
function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length === 2) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [map, bounds]);
  return null;
}

// Component to invalidate map size when fullscreen changes
function InvalidateSize({ isFullscreen }) {
  const map = useMap();
  useEffect(() => {
    // Small delay to ensure DOM has updated
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 100);
    return () => clearTimeout(timer);
  }, [map, isFullscreen]);
  return null;
}

function MunicipioDashboard({ municipio, onBack }) {
  const [stats, setStats] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [routesGeoJSON, setRoutesGeoJSON] = useState(null);
  const [localitiesGeoJSON, setLocalitiesGeoJSON] = useState(null);
  const [municipalBoundary, setMunicipalBoundary] = useState(null);
  const [unservedManzanas, setUnservedManzanas] = useState(null);
  const [servedManzanas, setServedManzanas] = useState(null);
  const [loading, setLoading] = useState(true);
  const [visibleRoutes, setVisibleRoutes] = useState({});  // Track which routes are visible
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);

  const loadData = useCallback(async () => {
    if (!municipio) return;
    
    try {
      const [statsRes, routesRes] = await Promise.all([
        getMunicipioDashboard(municipio),
        getRoutes({ municipio, analyzed: 'true' })
      ]);
      
      setStats(statsRes.data);
      setRoutes(routesRes.data.routes || []);
      
      // Initialize all routes as visible
      const initialVisibility = {};
      (routesRes.data.routes || []).forEach(r => { initialVisibility[r.id] = true; });
      setVisibleRoutes(initialVisibility);

      // Load GPX data for map with route index for different colors
      if (routesRes.data.routes?.length > 0) {
        const gpxFeatures = [];
        for (let i = 0; i < routesRes.data.routes.length; i++) {
          const route = routesRes.data.routes[i];
          try {
            const gpxRes = await getRouteGPX(route.id);
            if (gpxRes.data?.features) {
              gpxRes.data.features.forEach(f => {
                f.properties = { ...f.properties, routeName: route.nombre, routeIndex: i };
              });
              gpxFeatures.push(...gpxRes.data.features);
            }
          } catch (e) {}
        }
        if (gpxFeatures.length > 0) {
          setRoutesGeoJSON({ type: 'FeatureCollection', features: gpxFeatures });
        }
      }

      // Load localities for map
      try {
        const localitiesRes = await getShapefilePreview('localities');
        if (localitiesRes.data?.features) {
          setLocalitiesGeoJSON(localitiesRes.data);
        }
      } catch (e) {
        console.error('Error loading localities:', e);
      }

      // Load municipal boundary
      try {
        const municipiosRes = await getShapefilePreview('municipalities');
        if (municipiosRes.data?.features) {
          const boundary = municipiosRes.data.features.find(f => 
            f.properties?.NOMGEO === municipio
          );
          if (boundary) {
            setMunicipalBoundary({ type: 'FeatureCollection', features: [boundary] });
          }
        }
      } catch (e) {
        console.error('Error loading municipal boundary:', e);
      }

      // Load manzanas for map (served and unserved)
      try {
        const [unservedRes, servedRes] = await Promise.all([
          fetch(`http://localhost:5000/api/dashboard/municipio/${encodeURIComponent(municipio)}/unserved-manzanas`),
          fetch(`http://localhost:5000/api/dashboard/municipio/${encodeURIComponent(municipio)}/served-manzanas`)
        ]);
        
        if (unservedRes.ok) {
          const unservedData = await unservedRes.json();
          if (unservedData?.features?.length > 0) {
            setUnservedManzanas(unservedData);
          }
        }
        if (servedRes.ok) {
          const servedData = await servedRes.json();
          if (servedData?.features?.length > 0) {
            setServedManzanas(servedData);
          }
        }
      } catch (e) {
        console.error('Error loading manzanas:', e);
      }
    } catch (err) {
      console.error('Error loading municipio data:', err);
    } finally {
      setLoading(false);
    }
  }, [municipio]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const surfaceData = stats ? [
    { name: 'Pavimentado', value: stats.surface_distribution?.pavimentado || 0, color: '#3b82f6' },
    { name: 'Terracería', value: stats.surface_distribution?.terraceria || 0, color: '#f59e0b' },
    { name: 'N/A', value: stats.surface_distribution?.na || 0, color: '#9ca3af' }
  ].filter(d => d.value > 0) : [];

  const adminTotal = stats ? 
    (stats.admin_distribution?.federal || 0) + 
    (stats.admin_distribution?.estatal || 0) + 
    (stats.admin_distribution?.municipal || 0) + 
    (stats.admin_distribution?.na || 0) : 0;

  const adminData = stats ? [
    { name: 'Federal', km: stats.admin_distribution?.federal || 0, pct: adminTotal > 0 ? ((stats.admin_distribution?.federal || 0) / adminTotal * 100).toFixed(1) : 0 },
    { name: 'Estatal', km: stats.admin_distribution?.estatal || 0, pct: adminTotal > 0 ? ((stats.admin_distribution?.estatal || 0) / adminTotal * 100).toFixed(1) : 0 },
    { name: 'Municipal', km: stats.admin_distribution?.municipal || 0, pct: adminTotal > 0 ? ((stats.admin_distribution?.municipal || 0) / adminTotal * 100).toFixed(1) : 0 },
    { name: 'N/A', km: stats.admin_distribution?.na || 0, pct: adminTotal > 0 ? ((stats.admin_distribution?.na || 0) / adminTotal * 100).toFixed(1) : 0 }
  ].filter(d => d.km > 0) : [];

  const surfacePercentage = stats?.total_km > 0 ? {
    pavimentado: ((stats.surface_distribution?.pavimentado || 0) / stats.total_km * 100).toFixed(1),
    terraceria: ((stats.surface_distribution?.terraceria || 0) / stats.total_km * 100).toFixed(1)
  } : { pavimentado: 0, terraceria: 0 };

  // Calculate bounds from routes GeoJSON
  const mapBounds = useMemo(() => {
    if (!routesGeoJSON?.features?.length) return null;
    
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;
    
    routesGeoJSON.features.forEach(feature => {
      if (feature.geometry?.coordinates) {
        const coords = feature.geometry.type === 'LineString' 
          ? feature.geometry.coordinates 
          : feature.geometry.coordinates.flat();
        
        coords.forEach(coord => {
          if (Array.isArray(coord) && coord.length >= 2) {
            const [lng, lat] = coord;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
          }
        });
      }
    });
    
    if (minLat !== Infinity) {
      return [[minLat, minLng], [maxLat, maxLng]];
    }
    return null;
  }, [routesGeoJSON]);

  // Collect localities ONLY from the selected municipality (for dashboard report)
  const uniqueLocalities = useMemo(() => {
    const urbanas = new Map();
    const rurales = new Map();
    
    routes.forEach(route => {
      const analysis = route.analysis || {};
      (analysis.municipios_atravesados || []).forEach(mun => {
        if (mun.nombre?.toUpperCase() === municipio?.toUpperCase()) {
          (mun.localidades_urbanas || []).forEach(loc => {
            const id = loc.cvegeo || loc.nombre;
            if (!urbanas.has(id)) {
              urbanas.set(id, loc.nombre);
            }
          });
          (mun.localidades_rurales || []).forEach(loc => {
            const id = loc.cvegeo || loc.nombre;
            if (!rurales.has(id)) {
              rurales.set(id, loc.nombre);
            }
          });
        }
      });
    });
    
    return {
      urbanas: Array.from(urbanas.values()).sort(),
      rurales: Array.from(rurales.values()).sort()
    };
  }, [routes, municipio]);

  // Filter localities to only show those from the selected municipality
  const filteredLocalitiesGeoJSON = useMemo(() => {
    if (!localitiesGeoJSON?.features || !municipio) return null;
    
    // Get the list of locality names we're serving in this municipality
    const servedLocalityNames = new Set([
      ...uniqueLocalities.urbanas.map(n => n.toUpperCase()),
      ...uniqueLocalities.rurales.map(n => n.toUpperCase())
    ]);
    
    // Filter localities that belong to this municipality or are in our served list
    const filtered = localitiesGeoJSON.features.filter(f => {
      const nomgeo = f.properties?.NOMGEO?.toUpperCase();
      const nomMun = f.properties?.NOM_MUN?.toUpperCase();
      
      return servedLocalityNames.has(nomgeo) || nomMun === municipio.toUpperCase();
    });
    
    return filtered.length > 0 ? { type: 'FeatureCollection', features: filtered } : null;
  }, [localitiesGeoJSON, municipio, uniqueLocalities]);

  // Collect ALL municipalities traversed by routes (for reference info)
  const municipiosAtravesados = useMemo(() => {
    const municipios = new Map();
    
    routes.forEach(route => {
      const analysis = route.analysis || {};
      (analysis.municipios_atravesados || []).forEach(mun => {
        const munId = mun.clave || mun.nombre;
        if (!municipios.has(munId)) {
          municipios.set(munId, {
            nombre: mun.nombre,
            clave: mun.clave,
            urbanas: mun.localidades_urbanas?.length || 0,
            rurales: mun.localidades_rurales?.length || 0
          });
        }
      });
    });
    
    return Array.from(municipios.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [routes]);

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
        <button className="btn btn-secondary mb-2" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
          Volver al dashboard
        </button>
        <h2>
          <Building2 className="w-6 h-6" style={{ display: 'inline', marginRight: '0.5rem' }} />
          {municipio}
        </h2>
        <p>Estadísticas agregadas de rutas del municipio</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-label">Total de Rutas</div>
          <div className="stat-value">{stats?.total_routes || 0}</div>
          <div className="stat-sublabel">{stats?.analyzed_routes || 0} analizadas</div>
        </div>
        <div className="stat-card success">
          <div className="stat-label">Distancia Total</div>
          <div className="stat-value">{(stats?.total_km || 0).toFixed(1)} km</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-label">Localidades Atendidas</div>
          <div className="stat-value">{uniqueLocalities.urbanas.length + uniqueLocalities.rurales.length}</div>
          <div className="stat-sublabel">{uniqueLocalities.urbanas.length} urbanas, {uniqueLocalities.rurales.length} rurales</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">% Pavimentado</div>
          <div className="stat-value">{surfacePercentage.pavimentado}%</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">% Terracería</div>
          <div className="stat-value">{surfacePercentage.terraceria}%</div>
        </div>
      </div>

      <div className={isMapFullscreen ? '' : 'grid-2'}>
        <div 
          className="card" 
          style={isMapFullscreen ? {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            margin: 0,
            borderRadius: 0,
            display: 'flex',
            flexDirection: 'column'
          } : {}}
        >
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="card-title">Rutas del Municipio</span>
            <button
              onClick={() => setIsMapFullscreen(!isMapFullscreen)}
              style={{
                background: 'none',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                padding: '0.25rem 0.5rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontSize: '0.75rem',
                color: '#374151'
              }}
              title={isMapFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            >
              {isMapFullscreen ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              {isMapFullscreen ? 'Cerrar' : 'Maximizar'}
            </button>
          </div>
          <div className="map-container" style={{ height: isMapFullscreen ? 'calc(100vh - 180px)' : '400px', flex: isMapFullscreen ? 1 : 'none' }}>
            <MapContainer
              center={[23.6345, -102.5528]}
              zoom={10}
              style={{ height: '100%', width: '100%' }}
            >
              <LayersControl position="topright">
                <LayersControl.BaseLayer checked name="OpenStreetMap">
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                </LayersControl.BaseLayer>
                <LayersControl.BaseLayer name="Satélite">
                  <TileLayer
                    attribution='&copy; Esri'
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  />
                </LayersControl.BaseLayer>
              </LayersControl>
              
              {mapBounds && <FitBounds bounds={mapBounds} />}
              <InvalidateSize isFullscreen={isMapFullscreen} />
              
              {/* Municipal boundary - background */}
              {municipalBoundary && (
                <GeoJSON
                  key="boundary"
                  data={municipalBoundary}
                  style={() => ({
                    fillColor: '#f3f4f6',
                    color: '#374151',
                    weight: 3,
                    opacity: 1,
                    fillOpacity: 0.1,
                    dashArray: '5, 5'
                  })}
                />
              )}
              
              {/* Served manzanas layer - GREEN */}
              {servedManzanas && (
                <GeoJSON
                  key="served-manzanas"
                  data={servedManzanas}
                  style={() => ({
                    fillColor: '#10b981',
                    color: '#059669',
                    weight: 1,
                    opacity: 0.8,
                    fillOpacity: 0.5
                  })}
                  onEachFeature={(feature, layer) => {
                    const poblacion = feature.properties?.poblacion || 0;
                    layer.bindPopup(`
                      <strong style="color: #059669">Zona Atendida</strong><br/>
                      Población: ${poblacion.toLocaleString()}
                    `);
                  }}
                />
              )}

              {/* Unserved manzanas layer - RED */}
              {unservedManzanas && (
                <GeoJSON
                  key="unserved-manzanas"
                  data={unservedManzanas}
                  style={() => ({
                    fillColor: '#ef4444',
                    color: '#dc2626',
                    weight: 1,
                    opacity: 0.8,
                    fillOpacity: 0.5
                  })}
                  onEachFeature={(feature, layer) => {
                    const poblacion = feature.properties?.poblacion || 0;
                    layer.bindPopup(`
                      <strong style="color: #dc2626">Zona No Atendida</strong><br/>
                      Población: ${poblacion.toLocaleString()}
                    `);
                  }}
                />
              )}

              {/* Localities layer - OUTLINE ONLY (yellow urban, pink rural) */}
              {filteredLocalitiesGeoJSON && (
                <GeoJSON
                  key="localities"
                  data={filteredLocalitiesGeoJSON}
                  style={(feature) => {
                    const isUrbana = feature.properties?.AMBITO === 'Urbana';
                    return {
                      fillColor: 'transparent',
                      color: isUrbana ? '#eab308' : '#ec4899',
                      weight: 3,
                      opacity: 1,
                      fillOpacity: 0
                    };
                  }}
                  onEachFeature={(feature, layer) => {
                    const isUrbana = feature.properties?.AMBITO === 'Urbana';
                    layer.bindPopup(`
                      <strong>${feature.properties?.NOMGEO || 'Sin nombre'}</strong><br/>
                      <span style="color: ${isUrbana ? '#eab308' : '#ec4899'}">
                        ${isUrbana ? '🏙️ Urbana' : '🏡 Rural'}
                      </span>
                    `);
                  }}
                />
              )}

              {/* Routes layer - different colors per route */}
              {routesGeoJSON && (() => {
                // Filter routes based on visibility
                const visibleFeatures = routesGeoJSON.features.filter(f => {
                  const routeId = routes[f.properties?.routeIndex]?.id;
                  return visibleRoutes[routeId] !== false;
                });
                if (visibleFeatures.length === 0) return null;
                return (
                  <GeoJSON
                    key={`routes-${Object.values(visibleRoutes).join('-')}`}
                    data={{ type: 'FeatureCollection', features: visibleFeatures }}
                    style={() => ({
                      color: '#3b82f6',
                      weight: 4,
                      opacity: 0.9
                    })}
                    onEachFeature={(feature, layer) => {
                      if (feature.properties?.routeName) {
                        layer.bindPopup(`<strong style="color: #3b82f6">${feature.properties.routeName}</strong>`);
                      }
                    }}
                  />
                );
              })()}
            </MapContainer>
          </div>
          
          {/* Map legend */}
          <div style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', borderTop: '1px solid #e5e7eb' }}>
            <span><span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#10b981', marginRight: '4px' }}></span> Atendidas</span>
            <span><span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#ef4444', marginRight: '4px' }}></span> No atendidas</span>
            <span><span style={{ display: 'inline-block', width: '12px', height: '3px', backgroundColor: '#eab308', marginRight: '4px' }}></span> Urbanas</span>
            <span><span style={{ display: 'inline-block', width: '12px', height: '3px', backgroundColor: '#ec4899', marginRight: '4px' }}></span> Rurales</span>
            <span><span style={{ display: 'inline-block', width: '12px', height: '3px', backgroundColor: '#3b82f6', marginRight: '4px' }}></span> Rutas</span>
          </div>
          
          {/* Route toggles */}
          {routes.length > 0 && (
            <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>Mostrar/Ocultar Rutas:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {routes.map(route => (
                  <label 
                    key={route.id} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.25rem', 
                      fontSize: '0.7rem',
                      padding: '0.25rem 0.5rem',
                      backgroundColor: visibleRoutes[route.id] ? '#dbeafe' : '#f3f4f6',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      border: visibleRoutes[route.id] ? '1px solid #3b82f6' : '1px solid #d1d5db'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={visibleRoutes[route.id] !== false}
                      onChange={(e) => setVisibleRoutes(prev => ({ ...prev, [route.id]: e.target.checked }))}
                      style={{ margin: 0 }}
                    />
                    <span style={{ color: visibleRoutes[route.id] ? '#1d4ed8' : '#6b7280' }}>
                      {route.nombre}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
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
                      innerRadius={35}
                      outerRadius={65}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, value }) => `${value.toFixed(1)} km`}
                      labelLine={true}
                    >
                      {surfaceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `${value.toFixed(2)} km`} />
                    <Legend formatter={(value, entry) => `${value}: ${entry.payload.value.toFixed(1)} km`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-center" style={{ color: '#6b7280', padding: '1rem' }}>Sin datos</p>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Distribución por Administración</span>
            </div>
            {adminData.length > 0 ? (
              <div className="chart-container" style={{ height: '200px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={adminData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value, name, props) => [
                      `${value.toFixed(2)} km (${props.payload.pct}%)`, 
                      'Distancia'
                    ]} />
                    <Bar dataKey="km" fill="#10b981">
                      <LabelList dataKey="pct" position="top" formatter={(v) => `${v}%`} style={{ fontSize: '0.75rem', fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-center" style={{ color: '#6b7280', padding: '1rem' }}>Sin datos</p>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Lista de Rutas</span>
        </div>
        {routes.length > 0 ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Modalidad</th>
                  <th>Distancia</th>
                  <th>Vel. Máx</th>
                  <th>Incl. Máx</th>
                  <th>Localidades</th>
                </tr>
              </thead>
              <tbody>
                {routes.map(route => (
                  <tr key={route.id}>
                    <td><strong>{route.nombre}</strong></td>
                    <td>{route.modalidad || '-'}</td>
                    <td>{(route.analysis?.distancia_rnc_km || route.analysis?.distancia_km)?.toFixed(2) || '-'} km</td>
                    <td>{route.analysis?.velocidad_maxima_kmh?.toFixed(1) || '-'} km/h</td>
                    <td>{route.analysis?.pendiente_maxima?.toFixed(1) || '-'}%</td>
                    <td>
                      <span className="badge badge-info" style={{ marginRight: '0.25rem' }}>
                        {route.analysis?.localidades_urbanas || 0} urb
                      </span>
                      <span className="badge badge-warning">
                        {route.analysis?.localidades_rurales || 0} rur
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center" style={{ color: '#6b7280', padding: '2rem' }}>
            No hay rutas analizadas en este municipio
          </p>
        )}
      </div>

      {/* Localidades Atendidas del Municipio */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <Home className="w-4 h-4" style={{ display: 'inline', marginRight: '0.5rem' }} />
            Localidades Atendidas en {municipio} ({uniqueLocalities.urbanas.length + uniqueLocalities.rurales.length})
          </span>
        </div>
        <div style={{ padding: '1rem' }}>
          {/* Info about other municipalities traversed */}
          {municipiosAtravesados.length > 1 && (
            <div style={{ marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#f0f9ff', borderRadius: '6px', fontSize: '0.8rem', color: '#0369a1' }}>
              <strong>Nota:</strong> Las rutas atraviesan {municipiosAtravesados.length} municipios en total. 
              Este reporte muestra solo localidades de {municipio}.
            </div>
          )}
          
          <div className="grid-2" style={{ gap: '1.5rem' }}>
            <div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', color: '#059669' }}>
                🏙️ Urbanas ({uniqueLocalities.urbanas.length})
              </h4>
              {uniqueLocalities.urbanas.length > 0 ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '250px', overflowY: 'auto' }}>
                  {uniqueLocalities.urbanas.map((nombre, idx) => (
                    <li key={idx} style={{ fontSize: '0.85rem', padding: '0.25rem 0', borderBottom: '1px solid #e5e7eb' }}>
                      {nombre}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>Sin localidades urbanas atendidas</p>
              )}
            </div>
            <div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', color: '#d97706' }}>
                🏡 Rurales ({uniqueLocalities.rurales.length})
              </h4>
              {uniqueLocalities.rurales.length > 0 ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '250px', overflowY: 'auto' }}>
                  {uniqueLocalities.rurales.map((nombre, idx) => (
                    <li key={idx} style={{ fontSize: '0.85rem', padding: '0.25rem 0', borderBottom: '1px solid #e5e7eb' }}>
                      {nombre}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>Sin localidades rurales atendidas</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Population Coverage Analysis */}
      {stats?.area_servicio && stats.area_servicio.poblacion_total > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Users className="w-4 h-4" style={{ display: 'inline', marginRight: '0.5rem' }} />
              Análisis de Cobertura Poblacional
            </span>
          </div>
          
          {/* Coverage Comparison - FIRST */}
          {stats.area_servicio?.municipio_total && (
            <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px', margin: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', textAlign: 'center' }}>
                <div style={{ padding: '1rem', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.5rem' }}>Total Municipio</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                    {stats.area_servicio.municipio_total.poblacion_total?.toLocaleString('en-US')}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                    {stats.area_servicio.municipio_total.manzanas_count?.toLocaleString('en-US')} manzanas
                  </div>
                </div>
                <div style={{ padding: '1rem', backgroundColor: '#ecfdf5', borderRadius: '8px', border: '2px solid #10b981' }}>
                  <div style={{ fontSize: '0.8rem', color: '#059669', marginBottom: '0.5rem' }}>Población Atendida</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669' }}>
                    {stats.area_servicio.poblacion_total?.toLocaleString('en-US')}
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#10b981' }}>
                    {((stats.area_servicio.poblacion_total / stats.area_servicio.municipio_total.poblacion_total) * 100).toFixed(1)}%
                  </div>
                </div>
                <div style={{ padding: '1rem', backgroundColor: '#fef2f2', borderRadius: '8px', border: '2px solid #ef4444' }}>
                  <div style={{ fontSize: '0.8rem', color: '#dc2626', marginBottom: '0.5rem' }}>Población No Atendida</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc2626' }}>
                    {stats.area_no_atendida?.poblacion_total?.toLocaleString('en-US') || 0}
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#ef4444' }}>
                    {((stats.area_no_atendida?.poblacion_total || 0) / stats.area_servicio.municipio_total.poblacion_total * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Two columns: Served (left) and Unserved (right) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', padding: '0 1rem 1rem' }}>
            
            {/* LEFT: Población Atendida */}
            <div style={{ backgroundColor: '#ecfdf5', borderRadius: '8px', padding: '1rem', border: '1px solid #a7f3d0' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 600, color: '#059669', marginBottom: '1rem', textAlign: 'center' }}>
                ✅ Población en Área de Servicio
              </h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                <div style={{ backgroundColor: 'white', padding: '0.5rem', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Mujeres</div>
                  <div style={{ fontSize: '1rem', fontWeight: 600 }}>{stats.area_servicio.poblacion_femenina?.toLocaleString('en-US')}</div>
                </div>
                <div style={{ backgroundColor: 'white', padding: '0.5rem', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Hombres</div>
                  <div style={{ fontSize: '1rem', fontWeight: 600 }}>{stats.area_servicio.poblacion_masculina?.toLocaleString('en-US')}</div>
                </div>
                <div style={{ backgroundColor: 'white', padding: '0.5rem', borderRadius: '6px', textAlign: 'center', gridColumn: 'span 2' }}>
                  <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Con Discapacidad</div>
                  <div style={{ fontSize: '1rem', fontWeight: 600 }}>{stats.area_servicio.discapacidad?.total?.toLocaleString('en-US') || 0} ({stats.area_servicio.discapacidad?.porcentaje || 0}%)</div>
                </div>
              </div>

              {/* Pyramid for served - GREEN theme */}
              <h5 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', textAlign: 'center' }}>Pirámide Poblacional</h5>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.7rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ width: '10px', height: '10px', backgroundColor: '#3b82f6', borderRadius: '2px' }}></span>
                  ♂
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ width: '10px', height: '10px', backgroundColor: '#ec4899', borderRadius: '2px' }}></span>
                  ♀
                </span>
              </div>
              {stats.area_servicio.piramide_poblacional && (() => {
                const piramide = stats.area_servicio.piramide_poblacional;
                const poblacionTotal = stats.area_servicio.poblacion_total || 1;
                const hombresTotal = stats.area_servicio.poblacion_masculina || 0;
                const mujeresTotal = stats.area_servicio.poblacion_femenina || 0;
                const ratioH = hombresTotal / poblacionTotal;
                const ratioM = mujeresTotal / poblacionTotal;
                
                const data = [
                  { grupo: '60+', hombres: Math.round((piramide['60+']?.total || 0) * ratioH), mujeres: Math.round((piramide['60+']?.total || 0) * ratioM) },
                  { grupo: '30-59', hombres: Math.round((piramide['30-59']?.total || 0) * ratioH), mujeres: Math.round((piramide['30-59']?.total || 0) * ratioM) },
                  { grupo: '15-29', hombres: Math.round((piramide['15-29']?.total || 0) * ratioH), mujeres: Math.round((piramide['15-29']?.total || 0) * ratioM) },
                  { grupo: '0-14', hombres: Math.round((piramide['0-14']?.total || 0) * ratioH), mujeres: Math.round((piramide['0-14']?.total || 0) * ratioM) }
                ];
                const maxValue = Math.max(...data.flatMap(d => [d.hombres, d.mujeres]));
                
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {data.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', height: '22px' }}>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', paddingRight: '2px' }}>
                          <div style={{ width: `${(item.hombres / maxValue) * 100}%`, backgroundColor: '#3b82f6', height: '18px', borderRadius: '2px 0 0 2px', minWidth: item.hombres > 0 ? '2px' : '0', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: '2px' }}>
                            <span style={{ fontSize: '0.6rem', color: 'white' }}>{item.hombres > 1000 ? `${(item.hombres/1000).toFixed(1)}k` : item.hombres}</span>
                          </div>
                        </div>
                        <div style={{ width: '45px', textAlign: 'center', fontSize: '0.65rem', fontWeight: 500, flexShrink: 0 }}>{item.grupo}</div>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start', paddingLeft: '2px' }}>
                          <div style={{ width: `${(item.mujeres / maxValue) * 100}%`, backgroundColor: '#ec4899', height: '18px', borderRadius: '0 2px 2px 0', minWidth: item.mujeres > 0 ? '2px' : '0', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '2px' }}>
                            <span style={{ fontSize: '0.6rem', color: 'white' }}>{item.mujeres > 1000 ? `${(item.mujeres/1000).toFixed(1)}k` : item.mujeres}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* RIGHT: Población No Atendida */}
            <div style={{ backgroundColor: '#fef2f2', borderRadius: '8px', padding: '1rem', border: '1px solid #fecaca' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 600, color: '#dc2626', marginBottom: '1rem', textAlign: 'center' }}>
                ❌ Población Fuera del Área de Servicio
              </h4>
              
              {stats.area_no_atendida && stats.area_no_atendida.poblacion_total > 0 ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                    <div style={{ backgroundColor: 'white', padding: '0.5rem', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Mujeres</div>
                      <div style={{ fontSize: '1rem', fontWeight: 600 }}>{stats.area_no_atendida.poblacion_femenina?.toLocaleString('en-US')}</div>
                    </div>
                    <div style={{ backgroundColor: 'white', padding: '0.5rem', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Hombres</div>
                      <div style={{ fontSize: '1rem', fontWeight: 600 }}>{stats.area_no_atendida.poblacion_masculina?.toLocaleString('en-US')}</div>
                    </div>
                    <div style={{ backgroundColor: 'white', padding: '0.5rem', borderRadius: '6px', textAlign: 'center', gridColumn: 'span 2' }}>
                      <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Con Discapacidad</div>
                      <div style={{ fontSize: '1rem', fontWeight: 600 }}>{stats.area_no_atendida.discapacidad?.total?.toLocaleString('en-US') || 0} ({stats.area_no_atendida.discapacidad?.porcentaje || 0}%)</div>
                    </div>
                  </div>

                  {/* Pyramid for unserved - RED theme (same format as served) */}
                  <h5 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', textAlign: 'center' }}>Pirámide Poblacional</h5>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.7rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <span style={{ width: '10px', height: '10px', backgroundColor: '#ef4444', borderRadius: '2px' }}></span>
                      ♂
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <span style={{ width: '10px', height: '10px', backgroundColor: '#f87171', borderRadius: '2px' }}></span>
                      ♀
                    </span>
                  </div>
                  {stats.area_no_atendida.piramide_poblacional && (() => {
                    const piramide = stats.area_no_atendida.piramide_poblacional;
                    const poblacionTotal = stats.area_no_atendida.poblacion_total || 1;
                    const hombresTotal = stats.area_no_atendida.poblacion_masculina || 0;
                    const mujeresTotal = stats.area_no_atendida.poblacion_femenina || 0;
                    const ratioH = hombresTotal / poblacionTotal;
                    const ratioM = mujeresTotal / poblacionTotal;
                    
                    const data = [
                      { grupo: '60+', hombres: Math.round((piramide['60+']?.total || 0) * ratioH), mujeres: Math.round((piramide['60+']?.total || 0) * ratioM) },
                      { grupo: '30-59', hombres: Math.round((piramide['30-59']?.total || 0) * ratioH), mujeres: Math.round((piramide['30-59']?.total || 0) * ratioM) },
                      { grupo: '15-29', hombres: Math.round((piramide['15-29']?.total || 0) * ratioH), mujeres: Math.round((piramide['15-29']?.total || 0) * ratioM) },
                      { grupo: '0-14', hombres: Math.round((piramide['0-14']?.total || 0) * ratioH), mujeres: Math.round((piramide['0-14']?.total || 0) * ratioM) }
                    ];
                    const maxValue = Math.max(...data.flatMap(d => [d.hombres, d.mujeres]));
                    
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {data.map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', height: '22px' }}>
                            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', paddingRight: '2px' }}>
                              <div style={{ width: `${(item.hombres / maxValue) * 100}%`, backgroundColor: '#ef4444', height: '18px', borderRadius: '2px 0 0 2px', minWidth: item.hombres > 0 ? '2px' : '0', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: '2px' }}>
                                <span style={{ fontSize: '0.6rem', color: 'white' }}>{item.hombres > 1000 ? `${(item.hombres/1000).toFixed(1)}k` : item.hombres}</span>
                              </div>
                            </div>
                            <div style={{ width: '45px', textAlign: 'center', fontSize: '0.65rem', fontWeight: 500, flexShrink: 0 }}>{item.grupo}</div>
                            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start', paddingLeft: '2px' }}>
                              <div style={{ width: `${(item.mujeres / maxValue) * 100}%`, backgroundColor: '#f87171', height: '18px', borderRadius: '0 2px 2px 0', minWidth: item.mujeres > 0 ? '2px' : '0', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '2px' }}>
                                <span style={{ fontSize: '0.6rem', color: 'white' }}>{item.mujeres > 1000 ? `${(item.mujeres/1000).toFixed(1)}k` : item.mujeres}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div style={{ textAlign: 'center', color: '#10b981', padding: '2rem' }}>
                  <span style={{ fontSize: '2rem' }}>🎉</span>
                  <p style={{ marginTop: '0.5rem', fontWeight: 600 }}>¡Cobertura total!</p>
                  <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>Toda la población del municipio está dentro del área de servicio</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MunicipioDashboard;
