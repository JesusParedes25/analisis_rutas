import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Play, Download, MapPin, Clock, Gauge, Mountain, Building2, Home, CheckCircle, Users, Accessibility } from 'lucide-react';
import { MapContainer, TileLayer, GeoJSON, useMap, LayersControl } from 'react-leaflet';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { getRouteGPX, getAnalysisResults, analyzeRoute, getShapefilePreview } from '../api';
import 'leaflet/dist/leaflet.css';

const { Overlay } = LayersControl;

function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length === 4) {
      map.fitBounds([
        [bounds[1], bounds[0]],
        [bounds[3], bounds[2]]
      ], { padding: [20, 20] });
    }
  }, [bounds, map]);
  return null;
}

function RouteDetailModule({ route, onBack }) {
  const [gpxData, setGpxData] = useState(null);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [matchedData, setMatchedData] = useState(null);
  const [municipiosData, setMunicipiosData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [layers, setLayers] = useState({
    gpxOriginal: true,
    matchedRoads: true,
    municipalities: false,
    localities: false
  });

  const loadData = useCallback(async () => {
    if (!route) return;
    
    setLoading(true);
    try {
      const gpxRes = await getRouteGPX(route.id);
      setGpxData(gpxRes.data);

      if (route.analyzed) {
        const analysisRes = await getAnalysisResults(route.id);
        setAnalysisResults(analysisRes.data);
        if (analysisRes.data?.matched_geojson) {
          setMatchedData(analysisRes.data.matched_geojson);
        }
      }

      try {
        const munRes = await getShapefilePreview('municipalities');
        setMunicipiosData(munRes.data);
      } catch (e) {}
    } catch (err) {
      console.error('Error loading route data:', err);
    } finally {
      setLoading(false);
    }
  }, [route]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const res = await analyzeRoute(route.id);
      if (res.data.success) {
        route.analyzed = true;
        route.analysis = res.data.analysis;
        loadData();
      }
    } catch (err) {
      console.error('Error analyzing route:', err);
    } finally {
      setAnalyzing(false);
    }
  };

  const analysis = route?.analysis || analysisResults?.analysis;

  const surfaceData = analysis ? [
    { name: 'Pavimentado', value: analysis.superficie?.['Con pavimento'] || analysis.superficie?.pavimentado_km || 0, color: '#3b82f6' },
    { name: 'Terracería', value: analysis.superficie?.['Sin pavimento'] || analysis.superficie?.terraceria_km || 0, color: '#f59e0b' },
    { name: 'N/A', value: analysis.superficie?.['N/A'] || analysis.superficie?.na_km || 0, color: '#9ca3af' }
  ].filter(d => d.value > 0) : [];

  const adminData = analysis ? [
    { name: 'Federal', km: analysis.administracion?.Federal || analysis.administracion?.federal_km || 0 },
    { name: 'Estatal', km: analysis.administracion?.Estatal || analysis.administracion?.estatal_km || 0 },
    { name: 'Municipal', km: analysis.administracion?.Municipal || analysis.administracion?.municipal_km || 0 },
    { name: 'N/A', km: analysis.administracion?.['N/A'] || analysis.administracion?.na_km || 0 }
  ].filter(d => d.km > 0) : [];

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
          Volver a rutas
        </button>
        <h2>{route.nombre}</h2>
        <p>
          {route.municipio && <span>{route.municipio} • </span>}
          {route.modalidad && <span>{route.modalidad} • </span>}
          {route.clave_mnemotecnica && <span>{route.clave_mnemotecnica}</span>}
        </p>
      </div>

      <div className={`alert ${route.analyzed ? 'alert-info' : 'alert-warning'}`}>
          {route.analyzed ? <CheckCircle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
          <div className="flex items-center justify-between" style={{ flex: 1 }}>
            <span>{route.analyzed ? 'Ruta analizada' : 'Esta ruta no ha sido analizada aún'}</span>
            <button
              className={`btn ${route.analyzed ? 'btn-secondary' : 'btn-primary'} btn-sm`}
              onClick={handleAnalyze}
              disabled={analyzing}
            >
              {analyzing ? (
                <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  {route.analyzed ? 'Re-analizar' : 'Analizar ahora'}
                </>
              )}
            </button>
          </div>
        </div>

      {analysis && (
        <div className="stats-grid">
          <div className="stat-card primary">
            <div className="stat-label">Distancia Total</div>
            <div className="stat-value">{analysis.distancia_km?.toFixed(2)} km</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Duración</div>
            <div className="stat-value">{analysis.duracion_min?.toFixed(0)} min</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Vel. Promedio</div>
            <div className="stat-value">{analysis.velocidad_promedio_kmh?.toFixed(1)} km/h</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Vel. Máxima</div>
            <div className="stat-value">{analysis.velocidad_maxima_kmh?.toFixed(1)} km/h</div>
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Mapa de la Ruta</span>
          </div>
          
          <div className="layer-controls">
            <label className="layer-control-item">
              <input
                type="checkbox"
                checked={layers.gpxOriginal}
                onChange={(e) => setLayers({ ...layers, gpxOriginal: e.target.checked })}
              />
              <span className="legend-color" style={{ background: '#ef4444' }} />
              <span>GPX Original</span>
            </label>
            {matchedData && (
              <label className="layer-control-item">
                <input
                  type="checkbox"
                  checked={layers.matchedRoads}
                  onChange={(e) => setLayers({ ...layers, matchedRoads: e.target.checked })}
                />
                <span className="legend-color" style={{ background: '#3b82f6' }} />
                <span>Vías Coincidentes</span>
              </label>
            )}
            {municipiosData && (
              <label className="layer-control-item">
                <input
                  type="checkbox"
                  checked={layers.municipalities}
                  onChange={(e) => setLayers({ ...layers, municipalities: e.target.checked })}
                />
                <span className="legend-color" style={{ background: '#10b981' }} />
                <span>Municipios</span>
              </label>
            )}
          </div>

          <div className="map-container">
            <MapContainer
              center={[23.6345, -102.5528]}
              zoom={10}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              
              {layers.municipalities && municipiosData && (
                <GeoJSON
                  data={municipiosData}
                  style={() => ({
                    color: '#10b981',
                    weight: 1,
                    fillOpacity: 0.1
                  })}
                />
              )}
              
              {layers.matchedRoads && matchedData && (
                <GeoJSON
                  data={matchedData}
                  style={() => ({
                    color: '#3b82f6',
                    weight: 4,
                    opacity: 0.7
                  })}
                />
              )}
              
              {layers.gpxOriginal && gpxData && (
                <GeoJSON
                  data={gpxData}
                  style={() => ({
                    color: '#ef4444',
                    weight: 3,
                    opacity: 0.9
                  })}
                />
              )}
              
              {route.bounds && <FitBounds bounds={route.bounds} />}
            </MapContainer>
          </div>
        </div>

        {analysis && (
          <div>
            <div className="card">
              <div className="card-header">
                <span className="card-title">Métricas de Elevación</span>
              </div>
              <div className="metric-grid">
                <div className="metric-item">
                  <Mountain className="w-5 h-5" style={{ color: '#3b82f6', margin: '0 auto 0.5rem' }} />
                  <div className="metric-value">{analysis.elevacion_min_m?.toFixed(0)}</div>
                  <div className="metric-label">Elevación Mín (m)</div>
                </div>
                <div className="metric-item">
                  <Mountain className="w-5 h-5" style={{ color: '#ef4444', margin: '0 auto 0.5rem' }} />
                  <div className="metric-value">{analysis.elevacion_max_m?.toFixed(0)}</div>
                  <div className="metric-label">Elevación Máx (m)</div>
                </div>
                <div className="metric-item">
                  <div className="metric-value" style={{ color: '#10b981' }}>+{analysis.ganancia_elevacion_m?.toFixed(0)}</div>
                  <div className="metric-label">Ganancia (m)</div>
                </div>
                <div className="metric-item">
                  <div className="metric-value" style={{ color: '#ef4444' }}>-{analysis.perdida_elevacion_m?.toFixed(0)}</div>
                  <div className="metric-label">Pérdida (m)</div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">Confianza del Análisis</span>
              </div>
              <div className="progress-bar" style={{ height: '12px' }}>
                <div 
                  className="progress-fill" 
                  style={{ 
                    width: `${analysis.confianza_matching || 0}%`,
                    background: analysis.confianza_matching > 70 ? '#10b981' : analysis.confianza_matching > 40 ? '#f59e0b' : '#ef4444'
                  }} 
                />
              </div>
              <p className="text-center mt-1" style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                {analysis.confianza_matching?.toFixed(1)}% de coincidencia con la red vial
              </p>
            </div>
          </div>
        )}
      </div>

      {analysis && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Distribución por Superficie</span>
            </div>
            {surfaceData.length > 0 ? (
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={surfaceData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value.toFixed(2)} km`}
                    >
                      {surfaceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `${value.toFixed(2)} km`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-center" style={{ color: '#6b7280', padding: '2rem' }}>
                Sin datos de superficie disponibles
              </p>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Distribución por Administración Vial</span>
            </div>
            {adminData.length > 0 ? (
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={adminData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value) => `${value.toFixed(2)} km`} />
                    <Bar dataKey="km" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-center" style={{ color: '#6b7280', padding: '2rem' }}>
                Sin datos de administración disponibles
              </p>
            )}
          </div>
        </div>
      )}

      {analysis && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <Building2 className="w-4 h-4" style={{ display: 'inline', marginRight: '0.5rem' }} />
                Municipios Atravesados ({analysis.num_municipios})
              </span>
            </div>
            {analysis.municipios_atravesados?.length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {analysis.municipios_atravesados.map((mun, idx) => (
                  <li key={idx} className="flex items-center gap-2" style={{ padding: '0.5rem 0', borderBottom: '1px solid #e5e7eb' }}>
                    <MapPin className="w-4 h-4" style={{ color: '#3b82f6' }} />
                    <span>{mun.nombre}</span>
                    {mun.clave && <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>({mun.clave})</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: '#6b7280' }}>No se detectaron municipios</p>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <Home className="w-4 h-4" style={{ display: 'inline', marginRight: '0.5rem' }} />
                Localidades Atendidas ({analysis.total_localidades || (analysis.localidades_urbanas + analysis.localidades_rurales)})
              </span>
            </div>
            <div className="grid-2" style={{ gap: '1rem' }}>
              <div>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#059669' }}>
                  Urbanas ({analysis.localidades_urbanas})
                </h4>
                {analysis.municipios_atravesados?.flatMap(m => m.localidades_urbanas || []).slice(0, 5).map((loc, idx) => (
                  <p key={idx} style={{ fontSize: '0.8rem', color: '#374151', marginBottom: '0.25rem' }}>
                    • {loc.nombre}
                  </p>
                ))}
              </div>
              <div>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#d97706' }}>
                  Rurales ({analysis.localidades_rurales})
                </h4>
                {analysis.municipios_atravesados?.flatMap(m => m.localidades_rurales || []).slice(0, 5).map((loc, idx) => (
                  <p key={idx} style={{ fontSize: '0.8rem', color: '#374151', marginBottom: '0.25rem' }}>
                    • {loc.nombre}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Service Area Analysis - Population Coverage */}
      {analysis?.area_servicio && analysis.area_servicio.poblacion_total > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Users className="w-4 h-4" style={{ display: 'inline', marginRight: '0.5rem' }} />
              Área de Servicio (700m de caminata)
            </span>
          </div>
          
          <div className="stats-grid" style={{ marginBottom: '1rem' }}>
            <div className="stat-card">
              <div className="stat-label">Población Atendida</div>
              <div className="stat-value">{analysis.area_servicio.poblacion_total?.toLocaleString()}</div>
              <div className="stat-sublabel">{analysis.area_servicio.manzanas_count} manzanas</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Mujeres</div>
              <div className="stat-value">{analysis.area_servicio.poblacion_femenina?.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Hombres</div>
              <div className="stat-value">{analysis.area_servicio.poblacion_masculina?.toLocaleString()}</div>
            </div>
            <div className="stat-card warning">
              <div className="stat-label">
                <Accessibility className="w-4 h-4" style={{ display: 'inline', marginRight: '0.25rem' }} />
                Con Discapacidad
              </div>
              <div className="stat-value">{analysis.area_servicio.discapacidad?.total?.toLocaleString() || 0}</div>
              <div className="stat-sublabel">{analysis.area_servicio.discapacidad?.porcentaje || 0}%</div>
            </div>
          </div>

          <div className="grid-2" style={{ gap: '1.5rem' }}>
          {/* Population Pyramid - Men left (blue), Women right (pink) */}
          <div>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', textAlign: 'center' }}>
              Pirámide Poblacional
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.75rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ width: '12px', height: '12px', backgroundColor: '#3b82f6', borderRadius: '2px' }}></span>
                ♂ Hombres
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ width: '12px', height: '12px', backgroundColor: '#ec4899', borderRadius: '2px' }}></span>
                ♀ Mujeres
              </span>
            </div>
            {analysis.area_servicio.piramide_poblacional && (() => {
              const piramide = analysis.area_servicio.piramide_poblacional;
              const poblacionTotal = analysis.area_servicio.poblacion_total || 1;
              const hombresTotal = analysis.area_servicio.poblacion_masculina || 0;
              const mujeresTotal = analysis.area_servicio.poblacion_femenina || 0;
              
              const ratioH = hombresTotal / poblacionTotal;
              const ratioM = mujeresTotal / poblacionTotal;
              
              const data = [
                { grupo: '60+ años', hombres: Math.round((piramide['60+']?.total || 0) * ratioH), mujeres: Math.round((piramide['60+']?.total || 0) * ratioM) },
                { grupo: '30-59 años', hombres: Math.round((piramide['30-59']?.total || 0) * ratioH), mujeres: Math.round((piramide['30-59']?.total || 0) * ratioM) },
                { grupo: '15-29 años', hombres: Math.round((piramide['15-29']?.total || 0) * ratioH), mujeres: Math.round((piramide['15-29']?.total || 0) * ratioM) },
                { grupo: '0-14 años', hombres: Math.round((piramide['0-14']?.total || 0) * ratioH), mujeres: Math.round((piramide['0-14']?.total || 0) * ratioM) }
              ];
              
              const maxValue = Math.max(...data.flatMap(d => [d.hombres, d.mujeres]));
              
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {data.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', height: '28px' }}>
                      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', paddingRight: '4px' }}>
                        <div style={{ 
                          width: `${(item.hombres / maxValue) * 100}%`, 
                          backgroundColor: '#3b82f6', 
                          height: '20px',
                          borderRadius: '2px 0 0 2px',
                          minWidth: item.hombres > 0 ? '2px' : '0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-start',
                          paddingLeft: '4px'
                        }}>
                          <span style={{ fontSize: '0.65rem', color: 'white', whiteSpace: 'nowrap' }}>
                            {item.hombres > 1000 ? `${(item.hombres/1000).toFixed(1)}k` : item.hombres}
                          </span>
                        </div>
                      </div>
                      <div style={{ width: '70px', textAlign: 'center', fontSize: '0.7rem', fontWeight: 500, flexShrink: 0 }}>
                        {item.grupo}
                      </div>
                      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start', paddingLeft: '4px' }}>
                        <div style={{ 
                          width: `${(item.mujeres / maxValue) * 100}%`, 
                          backgroundColor: '#ec4899', 
                          height: '20px',
                          borderRadius: '0 2px 2px 0',
                          minWidth: item.mujeres > 0 ? '2px' : '0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          paddingRight: '4px'
                        }}>
                          <span style={{ fontSize: '0.65rem', color: 'white', whiteSpace: 'nowrap' }}>
                            {item.mujeres > 1000 ? `${(item.mujeres/1000).toFixed(1)}k` : item.mujeres}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Age Distribution Pie Chart */}
          <div>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', textAlign: 'center' }}>
              Distribución por Rango de Edad
            </h4>
            {analysis.area_servicio.piramide_poblacional && (() => {
              const piramide = analysis.area_servicio.piramide_poblacional;
              const total = (piramide['0-14']?.total || 0) + (piramide['15-29']?.total || 0) + 
                           (piramide['30-59']?.total || 0) + (piramide['60+']?.total || 0);
              
              const data = [
                { name: '0-14 años', value: piramide['0-14']?.total || 0, color: '#10b981' },
                { name: '15-29 años', value: piramide['15-29']?.total || 0, color: '#3b82f6' },
                { name: '30-59 años', value: piramide['30-59']?.total || 0, color: '#f59e0b' },
                { name: '60+ años', value: piramide['60+']?.total || 0, color: '#ef4444' }
              ].filter(d => d.value > 0);
              
              return (
                <div className="chart-container" style={{ height: '200px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={60}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ value }) => `${((value / total) * 100).toFixed(1)}%`}
                      >
                        {data.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value, name) => [value.toLocaleString(), name]} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RouteDetailModule;
