import React, { useState, useEffect, useCallback } from 'react';
import { Upload, CheckCircle, XCircle, Database, Map, Building2, MapPin, RefreshCw, Grid3X3 } from 'lucide-react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import { getConfig, uploadShapefile, getShapefilePreview, setBuffer } from '../api';
import 'leaflet/dist/leaflet.css';

function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length === 4) {
      map.fitBounds([
        [bounds[1], bounds[0]],
        [bounds[3], bounds[2]]
      ]);
    }
  }, [bounds, map]);
  return null;
}

function ConfigModule() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState({});
  const [previewType, setPreviewType] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [bufferDistance, setBufferDistance] = useState(50);
  const [message, setMessage] = useState(null);

  const loadConfig = useCallback(async () => {
    try {
      const res = await getConfig();
      setConfig(res.data);
      setBufferDistance(res.data.buffer_distance || 50);
    } catch (err) {
      console.error('Error loading config:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleFileUpload = async (type, files) => {
    if (!files || files.length === 0) return;
    
    setUploading(prev => ({ ...prev, [type]: true }));
    setMessage(null);
    
    try {
      const res = await uploadShapefile(type, Array.from(files));
      if (res.data.success) {
        setMessage({ type: 'success', text: `${getTypeLabel(type)} cargado correctamente (${res.data.features_count} elementos)` });
        loadConfig();
      } else {
        setMessage({ type: 'error', text: res.data.error || 'Error al cargar archivo' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Error al cargar archivo' });
    } finally {
      setUploading(prev => ({ ...prev, [type]: false }));
    }
  };

  const handlePreview = async (type) => {
    if (previewType === type) {
      setPreviewType(null);
      setPreviewData(null);
      return;
    }
    
    try {
      const res = await getShapefilePreview(type);
      setPreviewData(res.data);
      setPreviewType(type);
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al cargar vista previa' });
    }
  };

  const handleBufferSave = async () => {
    try {
      await setBuffer(bufferDistance);
      setMessage({ type: 'success', text: 'Buffer de búsqueda actualizado' });
      loadConfig();
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al guardar configuración' });
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'road_network': return 'Red Nacional de Caminos';
      case 'municipalities': return 'Límites Municipales';
      case 'localities': return 'Marco Geoestadístico de Localidades';
      case 'manzanas': return 'Manzanas (Censo)';
      default: return type;
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'road_network': return <Map className="w-5 h-5" />;
      case 'municipalities': return <Building2 className="w-5 h-5" />;
      case 'localities': return <MapPin className="w-5 h-5" />;
      case 'manzanas': return <Grid3X3 className="w-5 h-5" />;
      default: return <Database className="w-5 h-5" />;
    }
  };

  const getLayerStyle = (type) => {
    switch (type) {
      case 'road_network':
        return { color: '#6b7280', weight: 1, opacity: 0.7 };
      case 'municipalities':
        return { color: '#2563eb', weight: 2, fillOpacity: 0.1 };
      case 'localities':
        return { color: '#10b981', weight: 1, fillOpacity: 0.5 };
      case 'manzanas':
        return { color: '#8b5cf6', weight: 1, fillOpacity: 0.3 };
      default:
        return {};
    }
  };

  const renderShapefileCard = (type) => {
    const data = config?.[type];
    const isLoaded = data?.loaded;
    const isUploading = uploading[type];

    return (
      <div className="card" key={type}>
        <div className="card-header">
          <div className="flex items-center gap-2">
            {getTypeIcon(type)}
            <span className="card-title">{getTypeLabel(type)}</span>
          </div>
          <div className={`config-status ${isLoaded ? 'loaded' : 'not-loaded'}`}>
            {isLoaded ? (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Cargado</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4" />
                <span>No cargado</span>
              </>
            )}
          </div>
        </div>

        {isLoaded && (
          <div className="mb-4">
            <div className="metric-grid">
              <div className="metric-item">
                <div className="metric-value">{data.features_count?.toLocaleString()}</div>
                <div className="metric-label">Elementos</div>
              </div>
              <div className="metric-item">
                <div className="metric-value">{data.attributes?.length || 0}</div>
                <div className="metric-label">Atributos</div>
              </div>
            </div>
            <p className="text-center mt-2" style={{ fontSize: '0.75rem', color: '#6b7280' }}>
              Cargado: {new Date(data.uploaded_at).toLocaleDateString('es-MX')}
            </p>
          </div>
        )}

        <div className="file-upload" onClick={() => document.getElementById(`file-${type}`).click()}>
          <input
            id={`file-${type}`}
            type="file"
            multiple
            accept=".shp,.dbf,.shx,.prj,.cpg"
            style={{ display: 'none' }}
            onChange={(e) => handleFileUpload(type, e.target.files)}
          />
          {isUploading ? (
            <div className="spinner" style={{ margin: '0 auto' }} />
          ) : (
            <>
              <Upload className="file-upload-icon" />
              <p className="file-upload-text">
                {isLoaded ? 'Clic para reemplazar shapefile' : 'Clic para subir shapefile'}
              </p>
              <p className="file-upload-hint">
                Selecciona todos los archivos (.shp, .dbf, .shx, .prj)
              </p>
            </>
          )}
        </div>

        {isLoaded && (
          <button
            className="btn btn-secondary mt-2"
            style={{ width: '100%' }}
            onClick={() => handlePreview(type)}
          >
            <Map className="w-4 h-4" />
            {previewType === type ? 'Ocultar mapa' : 'Ver en mapa'}
          </button>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: '50vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  const bounds = previewData?.features?.[0]?.geometry?.coordinates 
    ? config?.[previewType]?.bounds 
    : null;

  return (
    <div>
      <div className="page-header">
        <h2>Configuración Inicial</h2>
        <p>Carga los shapefiles base necesarios para el análisis de rutas</p>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>
          {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="grid-2">
        {renderShapefileCard('road_network')}
        {renderShapefileCard('municipalities')}
      </div>
      <div className="grid-2">
        {renderShapefileCard('localities')}
        {renderShapefileCard('manzanas')}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Parámetros de Análisis</span>
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Buffer de búsqueda (metros)</label>
            <input
              type="number"
              className="form-input"
              value={bufferDistance}
              onChange={(e) => setBufferDistance(parseInt(e.target.value) || 50)}
              min={10}
              max={500}
            />
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
              Distancia máxima para asociar puntos GPX con la red vial
            </p>
          </div>
          <div className="flex items-center">
            <button className="btn btn-primary" onClick={handleBufferSave}>
              Guardar configuración
            </button>
          </div>
        </div>
      </div>

      {previewType && previewData && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Vista previa: {getTypeLabel(previewType)}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => { setPreviewType(null); setPreviewData(null); }}>
              Cerrar
            </button>
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
              <GeoJSON
                data={previewData}
                style={() => getLayerStyle(previewType)}
                pointToLayer={(feature, latlng) => {
                  return window.L.circleMarker(latlng, {
                    radius: 4,
                    fillColor: '#10b981',
                    color: '#065f46',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                  });
                }}
              />
              {bounds && <FitBounds bounds={bounds} />}
            </MapContainer>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConfigModule;
