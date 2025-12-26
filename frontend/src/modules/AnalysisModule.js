import React, { useState, useEffect, useCallback } from 'react';
import { Play, PlayCircle, CheckCircle, Clock, AlertCircle, Eye, BarChart3, RefreshCw } from 'lucide-react';
import { getRoutes, analyzeRoute, analyzeBatch } from '../api';

function AnalysisModule({ onViewRoute }) {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState({});
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [message, setMessage] = useState(null);

  const loadRoutes = useCallback(async () => {
    try {
      const res = await getRoutes();
      setRoutes(res.data.routes || []);
    } catch (err) {
      console.error('Error loading routes:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  const handleAnalyze = async (routeId) => {
    setAnalyzing(prev => ({ ...prev, [routeId]: true }));
    setMessage(null);

    try {
      const res = await analyzeRoute(routeId);
      if (res.data.success) {
        setMessage({ type: 'success', text: 'Análisis completado correctamente' });
        loadRoutes();
      } else {
        setMessage({ type: 'error', text: res.data.error || 'Error en el análisis' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Error al analizar ruta' });
    } finally {
      setAnalyzing(prev => ({ ...prev, [routeId]: false }));
    }
  };

  const handleBatchAnalysis = async () => {
    const pendingRoutes = routes.filter(r => !r.analyzed);
    if (pendingRoutes.length === 0) {
      setMessage({ type: 'info', text: 'No hay rutas pendientes de análisis' });
      return;
    }

    setBatchAnalyzing(true);
    setBatchProgress({ current: 0, total: pendingRoutes.length });
    setMessage(null);

    try {
      const res = await analyzeBatch();
      setMessage({ 
        type: 'success', 
        text: `Análisis masivo completado: ${res.data.analyzed}/${res.data.total} rutas analizadas` 
      });
      loadRoutes();
    } catch (err) {
      setMessage({ type: 'error', text: 'Error en el análisis masivo' });
    } finally {
      setBatchAnalyzing(false);
      setBatchProgress({ current: 0, total: 0 });
    }
  };

  const handleReanalyzeAll = async () => {
    if (routes.length === 0) {
      setMessage({ type: 'info', text: 'No hay rutas para re-analizar' });
      return;
    }

    setBatchAnalyzing(true);
    setBatchProgress({ current: 0, total: routes.length });
    setMessage(null);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < routes.length; i++) {
      try {
        setBatchProgress({ current: i + 1, total: routes.length });
        const res = await analyzeRoute(routes[i].id);
        if (res.data.success) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (err) {
        errorCount++;
      }
    }

    setMessage({ 
      type: errorCount === 0 ? 'success' : 'warning', 
      text: `Re-análisis completado: ${successCount} exitosas, ${errorCount} errores` 
    });
    loadRoutes();
    setBatchAnalyzing(false);
    setBatchProgress({ current: 0, total: 0 });
  };

  const pendingCount = routes.filter(r => !r.analyzed).length;
  const analyzedCount = routes.filter(r => r.analyzed).length;

  return (
    <div>
      <div className="page-header">
        <h2>Análisis de Rutas</h2>
        <p>Ejecuta el análisis geoespacial de las rutas cargadas</p>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>
          {message.type === 'success' && <CheckCircle className="w-5 h-5" />}
          {message.type === 'error' && <AlertCircle className="w-5 h-5" />}
          {message.type === 'info' && <AlertCircle className="w-5 h-5" />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total de rutas</div>
          <div className="stat-value">{routes.length}</div>
        </div>
        <div className="stat-card success">
          <div className="stat-label">Analizadas</div>
          <div className="stat-value">{analyzedCount}</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-label">Pendientes</div>
          <div className="stat-value">{pendingCount}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Análisis Masivo</span>
          <div className="flex gap-2">
            <button
              className="btn btn-success"
              onClick={handleBatchAnalysis}
              disabled={batchAnalyzing || pendingCount === 0}
            >
              {batchAnalyzing ? (
                <>
                  <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                  Analizando...
                </>
              ) : (
                <>
                  <PlayCircle className="w-4 h-4" />
                  Analizar pendientes ({pendingCount})
                </>
              )}
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleReanalyzeAll}
              disabled={batchAnalyzing || routes.length === 0}
            >
              <RefreshCw className="w-4 h-4" />
              Re-analizar todas ({routes.length})
            </button>
          </div>
        </div>

        {batchAnalyzing && (
          <div>
            <p style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
              Analizando ruta {batchProgress.current} de {batchProgress.total}...
            </p>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Rutas</span>
        </div>

        {loading ? (
          <div className="text-center" style={{ padding: '2rem' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : routes.length === 0 ? (
          <div className="text-center" style={{ padding: '2rem', color: '#6b7280' }}>
            No hay rutas cargadas. Ve al módulo de Rutas GPX para cargar archivos.
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Municipio</th>
                  <th>Modalidad</th>
                  <th>Puntos</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {routes.map(route => (
                  <tr key={route.id}>
                    <td>
                      <strong>{route.nombre}</strong>
                    </td>
                    <td>{route.municipio || '-'}</td>
                    <td>{route.modalidad || '-'}</td>
                    <td>{route.points_count}</td>
                    <td>
                      {route.analyzed ? (
                        <span className="badge badge-success">
                          <CheckCircle className="w-3 h-3" style={{ marginRight: '0.25rem' }} />
                          Analizado
                        </span>
                      ) : (
                        <span className="badge badge-warning">
                          <Clock className="w-3 h-3" style={{ marginRight: '0.25rem' }} />
                          Pendiente
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          className={`btn ${route.analyzed ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                          onClick={() => handleAnalyze(route.id)}
                          disabled={analyzing[route.id]}
                        >
                          {analyzing[route.id] ? (
                            <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                          ) : (
                            <>
                              <Play className="w-3 h-3" />
                              {route.analyzed ? 'Re-analizar' : 'Analizar'}
                            </>
                          )}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => onViewRoute(route)}
                        >
                          <Eye className="w-3 h-3" />
                          Ver
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default AnalysisModule;
