import React, { useState, useEffect } from 'react';
import { Download, FileJson, FileSpreadsheet, Map, CheckCircle, AlertCircle } from 'lucide-react';
import { getRoutes, exportRouteJSON, exportRouteShapefile, exportRoutesCSV, exportRoutesExcel } from '../api';

function ExportModule() {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState({});
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadRoutes();
  }, []);

  const loadRoutes = async () => {
    try {
      const res = await getRoutes({ analyzed: 'true' });
      setRoutes(res.data.routes || []);
    } catch (err) {
      console.error('Error loading routes:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportJSON = async (routeId, routeName) => {
    setExporting(prev => ({ ...prev, [`json-${routeId}`]: true }));
    try {
      const res = await exportRouteJSON(routeId);
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `${routeName || routeId}_analysis.json`);
      setMessage({ type: 'success', text: 'JSON exportado correctamente' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al exportar JSON' });
    } finally {
      setExporting(prev => ({ ...prev, [`json-${routeId}`]: false }));
    }
  };

  const handleExportShapefile = async (routeId, routeName) => {
    setExporting(prev => ({ ...prev, [`shp-${routeId}`]: true }));
    try {
      const res = await exportRouteShapefile(routeId);
      downloadBlob(res.data, `ruta_${routeName || routeId}.zip`);
      setMessage({ type: 'success', text: 'Shapefile exportado correctamente' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al exportar Shapefile' });
    } finally {
      setExporting(prev => ({ ...prev, [`shp-${routeId}`]: false }));
    }
  };

  const handleExportAllCSV = async () => {
    setExporting(prev => ({ ...prev, csv: true }));
    try {
      const res = await exportRoutesCSV();
      downloadBlob(res.data, 'rutas_resumen.csv');
      setMessage({ type: 'success', text: 'CSV exportado correctamente' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al exportar CSV' });
    } finally {
      setExporting(prev => ({ ...prev, csv: false }));
    }
  };

  const handleExportAllExcel = async () => {
    setExporting(prev => ({ ...prev, excel: true }));
    try {
      const res = await exportRoutesExcel();
      downloadBlob(res.data, 'rutas_resumen.xlsx');
      setMessage({ type: 'success', text: 'Excel exportado correctamente' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al exportar Excel' });
    } finally {
      setExporting(prev => ({ ...prev, excel: false }));
    }
  };

  const downloadBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

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
        <h2>Exportar Datos</h2>
        <p>Descarga los resultados del análisis en diferentes formatos</p>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>
          {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Exportación Masiva</span>
        </div>
        <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
          Descarga un resumen de todas las rutas analizadas en formato tabular.
        </p>
        <div className="flex gap-2">
          <button
            className="btn btn-primary"
            onClick={handleExportAllCSV}
            disabled={exporting.csv || routes.length === 0}
          >
            {exporting.csv ? (
              <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4" />
                Descargar CSV
              </>
            )}
          </button>
          <button
            className="btn btn-success"
            onClick={handleExportAllExcel}
            disabled={exporting.excel || routes.length === 0}
          >
            {exporting.excel ? (
              <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4" />
                Descargar Excel
              </>
            )}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Exportación Individual ({routes.length} rutas analizadas)</span>
        </div>
        
        {routes.length === 0 ? (
          <p className="text-center" style={{ color: '#6b7280', padding: '2rem' }}>
            No hay rutas analizadas para exportar. Primero analiza algunas rutas.
          </p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Municipio</th>
                  <th>Distancia</th>
                  <th>Exportar JSON</th>
                  <th>Exportar Shapefile</th>
                </tr>
              </thead>
              <tbody>
                {routes.map(route => (
                  <tr key={route.id}>
                    <td><strong>{route.nombre}</strong></td>
                    <td>{route.municipio || '-'}</td>
                    <td>{route.analysis?.distancia_km?.toFixed(2) || '-'} km</td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleExportJSON(route.id, route.nombre)}
                        disabled={exporting[`json-${route.id}`]}
                      >
                        {exporting[`json-${route.id}`] ? (
                          <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                        ) : (
                          <>
                            <FileJson className="w-3 h-3" />
                            JSON
                          </>
                        )}
                      </button>
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleExportShapefile(route.id, route.nombre)}
                        disabled={exporting[`shp-${route.id}`]}
                      >
                        {exporting[`shp-${route.id}`] ? (
                          <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                        ) : (
                          <>
                            <Map className="w-3 h-3" />
                            Shapefile
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Información de Formatos</span>
        </div>
        <div className="grid-3">
          <div style={{ padding: '1rem', background: '#f9fafb', borderRadius: '8px' }}>
            <FileJson className="w-6 h-6" style={{ color: '#3b82f6', marginBottom: '0.5rem' }} />
            <h4 style={{ fontWeight: 600, marginBottom: '0.5rem' }}>JSON</h4>
            <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
              Formato estructurado con todas las métricas del análisis. Ideal para integración con otros sistemas.
            </p>
          </div>
          <div style={{ padding: '1rem', background: '#f9fafb', borderRadius: '8px' }}>
            <Map className="w-6 h-6" style={{ color: '#10b981', marginBottom: '0.5rem' }} />
            <h4 style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Shapefile</h4>
            <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
              Formato geoespacial con la geometría de la ruta y atributos en la tabla. Compatible con QGIS, ArcGIS.
            </p>
          </div>
          <div style={{ padding: '1rem', background: '#f9fafb', borderRadius: '8px' }}>
            <FileSpreadsheet className="w-6 h-6" style={{ color: '#f59e0b', marginBottom: '0.5rem' }} />
            <h4 style={{ fontWeight: 600, marginBottom: '0.5rem' }}>CSV / Excel</h4>
            <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
              Tabla resumen con todas las rutas y sus métricas. Ideal para reportes y análisis adicionales.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExportModule;
