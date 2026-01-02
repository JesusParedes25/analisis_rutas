import React, { useState, useEffect, useCallback } from 'react';
import { Upload, Search, Trash2, Eye, CheckCircle, Clock, FileArchive, FileSpreadsheet, Edit2, X, Save } from 'lucide-react';
import { getRoutes, uploadRoute, uploadRoutesBatch, deleteRoute, updateRoute, getMunicipiosFromShapefile } from '../api';

function RoutesModule({ onViewRoute }) {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMode, setUploadMode] = useState('single');
  const [filters, setFilters] = useState({ municipio: '', modalidad: '', analyzed: '' });
  const [municipios, setMunicipios] = useState([]);
  const [message, setMessage] = useState(null);
  const [formData, setFormData] = useState({
    nombre: '',
    municipio: '',
    modalidad: '',
    clave_mnemotecnica: ''
  });
  const [batchFormData, setBatchFormData] = useState({
    municipio: '',
    modalidad: '',
    clave_mnemotecnica: ''
  });
  const [editingRoute, setEditingRoute] = useState(null);
  const [editFormData, setEditFormData] = useState({
    nombre: '',
    municipio: '',
    modalidad: '',
    clave_mnemotecnica: ''
  });
  const [saving, setSaving] = useState(false);

  const loadRoutes = useCallback(async () => {
    try {
      const res = await getRoutes(filters);
      setRoutes(res.data.routes || []);
    } catch (err) {
      console.error('Error loading routes:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadMunicipios = async () => {
    try {
      const res = await getMunicipiosFromShapefile();
      setMunicipios(res.data.municipios || []);
    } catch (err) {
      console.error('Error loading municipios:', err);
    }
  };

  useEffect(() => {
    loadRoutes();
    loadMunicipios();
  }, [loadRoutes]);

  const handleSingleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setMessage(null);

    try {
      const res = await uploadRoute(file, formData);
      if (res.data.success) {
        setMessage({ type: 'success', text: `Ruta "${res.data.route.nombre}" cargada correctamente` });
        setFormData({ nombre: '', municipio: '', modalidad: '', clave_mnemotecnica: '' });
        loadRoutes();
        loadMunicipios();
      } else {
        setMessage({ type: 'error', text: res.data.error });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Error al cargar archivo' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleBatchUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let zipFile = null;
    let csvFile = null;

    for (const file of files) {
      if (file.name.endsWith('.zip')) zipFile = file;
      if (file.name.endsWith('.csv')) csvFile = file;
    }

    if (!zipFile) {
      setMessage({ type: 'error', text: 'Debes seleccionar un archivo ZIP' });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const res = await uploadRoutesBatch(zipFile, csvFile, batchFormData);
      if (res.data.success) {
        const errorCount = res.data.errors?.length || 0;
        setMessage({ 
          type: 'success', 
          text: `${res.data.total} rutas cargadas correctamente${errorCount > 0 ? ` (${errorCount} errores)` : ''}` 
        });
        loadRoutes();
        loadMunicipios();
      } else {
        setMessage({ type: 'error', text: res.data.error });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Error al cargar archivos' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (routeId) => {
    if (!window.confirm('¿Estás seguro de eliminar esta ruta?')) return;

    try {
      await deleteRoute(routeId);
      setMessage({ type: 'success', text: 'Ruta eliminada' });
      loadRoutes();
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al eliminar ruta' });
    }
  };

  const handleEdit = (route) => {
    setEditingRoute(route);
    setEditFormData({
      nombre: route.nombre || '',
      municipio: route.municipio || '',
      modalidad: route.modalidad || '',
      clave_mnemotecnica: route.clave_mnemotecnica || ''
    });
  };

  const handleSaveEdit = async () => {
    if (!editingRoute) return;
    setSaving(true);
    try {
      const res = await updateRoute(editingRoute.id, editFormData);
      if (res.data.success) {
        setMessage({ type: 'success', text: 'Ruta actualizada correctamente' });
        setEditingRoute(null);
        loadRoutes();
      } else {
        setMessage({ type: 'error', text: res.data.error });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al actualizar ruta' });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingRoute(null);
    setEditFormData({
      nombre: '',
      municipio: '',
      modalidad: '',
      clave_mnemotecnica: ''
    });
  };

  const modalidades = ['Público', 'Escolar', 'Turístico', 'Empleados'];

  return (
    <div>
      <div className="page-header">
        <h2>Gestión de Rutas GPX</h2>
        <p>Carga y administra las rutas de transporte para su análisis</p>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>
          <span>{message.text}</span>
        </div>
      )}

      <div className="card">
        <div className="tabs">
          <button
            className={`tab ${uploadMode === 'single' ? 'active' : ''}`}
            onClick={() => setUploadMode('single')}
          >
            <Upload className="w-4 h-4" style={{ display: 'inline', marginRight: '0.5rem' }} />
            Subir individual
          </button>
          <button
            className={`tab ${uploadMode === 'batch' ? 'active' : ''}`}
            onClick={() => setUploadMode('batch')}
          >
            <FileArchive className="w-4 h-4" style={{ display: 'inline', marginRight: '0.5rem' }} />
            Subida masiva
          </button>
        </div>

        {uploadMode === 'single' ? (
          <div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Nombre de la ruta</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Ruta Centro-Norte"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Municipio</label>
                <select
                  className="form-select"
                  value={formData.municipio}
                  onChange={(e) => setFormData({ ...formData, municipio: e.target.value })}
                >
                  <option value="">Seleccionar municipio...</option>
                  {municipios.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Modalidad</label>
                <select
                  className="form-select"
                  value={formData.modalidad}
                  onChange={(e) => setFormData({ ...formData, modalidad: e.target.value })}
                >
                  <option value="">Seleccionar...</option>
                  {modalidades.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Clave Mnemotécnica</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.clave_mnemotecnica}
                  onChange={(e) => setFormData({ ...formData, clave_mnemotecnica: e.target.value })}
                  placeholder="Ej: RUT-001"
                />
              </div>
              </div>
            
            <div className="file-upload" onClick={() => document.getElementById('gpx-single').click()}>
              <input
                id="gpx-single"
                type="file"
                accept=".gpx"
                style={{ display: 'none' }}
                onChange={handleSingleUpload}
              />
              {uploading ? (
                <div className="spinner" style={{ margin: '0 auto' }} />
              ) : (
                <>
                  <Upload className="file-upload-icon" />
                  <p className="file-upload-text">Clic para seleccionar archivo GPX</p>
                  <p className="file-upload-hint">Formatos aceptados: .gpx</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div className="alert alert-info mb-2">
              <FileSpreadsheet className="w-5 h-5" />
              <div>
                <strong>Subida masiva:</strong> Selecciona metadatos para aplicar a todas las rutas del ZIP.
                <br />
                <small>Opcionalmente, agrega un CSV para especificar metadatos individuales por archivo.</small>
              </div>
            </div>
            
            <div className="form-grid mb-3">
              <div className="form-group">
                <label className="form-label">Municipio (aplica a todas)</label>
                <select
                  className="form-select"
                  value={batchFormData.municipio}
                  onChange={(e) => setBatchFormData({ ...batchFormData, municipio: e.target.value })}
                >
                  <option value="">Seleccionar municipio...</option>
                  {municipios.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Modalidad (aplica a todas)</label>
                <select
                  className="form-select"
                  value={batchFormData.modalidad}
                  onChange={(e) => setBatchFormData({ ...batchFormData, modalidad: e.target.value })}
                >
                  <option value="">Seleccionar...</option>
                  {modalidades.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Clave Mnemotécnica</label>
                <input
                  type="text"
                  className="form-input"
                  value={batchFormData.clave_mnemotecnica}
                  onChange={(e) => setBatchFormData({ ...batchFormData, clave_mnemotecnica: e.target.value })}
                  placeholder="Ej: RUT-LOTE-001"
                />
              </div>
            </div>
            
            <div className="file-upload" onClick={() => document.getElementById('gpx-batch').click()}>
              <input
                id="gpx-batch"
                type="file"
                accept=".zip,.csv"
                multiple
                style={{ display: 'none' }}
                onChange={handleBatchUpload}
              />
              {uploading ? (
                <div className="spinner" style={{ margin: '0 auto' }} />
              ) : (
                <>
                  <FileArchive className="file-upload-icon" />
                  <p className="file-upload-text">Clic para seleccionar archivos</p>
                  <p className="file-upload-hint">ZIP con GPX + CSV opcional con metadatos</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Rutas cargadas ({routes.length})</span>
        </div>

        <div className="filter-bar">
          <div className="form-group mb-0">
            <select
              className="form-select"
              value={filters.municipio}
              onChange={(e) => setFilters({ ...filters, municipio: e.target.value })}
            >
              <option value="">Todos los municipios</option>
              {municipios.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="form-group mb-0">
            <select
              className="form-select"
              value={filters.modalidad}
              onChange={(e) => setFilters({ ...filters, modalidad: e.target.value })}
            >
              <option value="">Todas las modalidades</option>
              {modalidades.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="form-group mb-0">
            <select
              className="form-select"
              value={filters.analyzed}
              onChange={(e) => setFilters({ ...filters, analyzed: e.target.value })}
            >
              <option value="">Todos los estados</option>
              <option value="true">Analizadas</option>
              <option value="false">Pendientes</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="text-center" style={{ padding: '2rem' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : routes.length === 0 ? (
          <div className="text-center" style={{ padding: '2rem', color: '#6b7280' }}>
            No hay rutas cargadas
          </div>
        ) : (
          <div>
            {routes.map(route => (
              <div key={route.id} className="route-item">
                <div className="route-info">
                  <div className="route-name">{route.nombre}</div>
                  <div className="route-meta">
                    {route.municipio && <span>{route.municipio} • </span>}
                    {route.modalidad && <span>{route.modalidad} • </span>}
                    <span>{route.points_count} puntos</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
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
                  <div className="route-actions">
                    <button
                      className="btn btn-secondary btn-sm btn-icon"
                      onClick={() => onViewRoute(route)}
                      title="Ver detalles"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      className="btn btn-primary btn-sm btn-icon"
                      onClick={() => handleEdit(route)}
                      title="Editar"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      className="btn btn-danger btn-sm btn-icon"
                      onClick={() => handleDelete(route.id)}
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de edición */}
      {editingRoute && (
        <div className="modal-overlay" onClick={handleCancelEdit}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Editar Ruta</h3>
              <button className="btn btn-icon" onClick={handleCancelEdit}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nombre de la ruta</label>
                <input
                  type="text"
                  className="form-input"
                  value={editFormData.nombre}
                  onChange={(e) => setEditFormData({ ...editFormData, nombre: e.target.value })}
                  placeholder="Ej: Ruta Centro-Norte"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Municipio</label>
                <select
                  className="form-select"
                  value={editFormData.municipio}
                  onChange={(e) => setEditFormData({ ...editFormData, municipio: e.target.value })}
                >
                  <option value="">Seleccionar municipio...</option>
                  {municipios.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Modalidad</label>
                <select
                  className="form-select"
                  value={editFormData.modalidad}
                  onChange={(e) => setEditFormData({ ...editFormData, modalidad: e.target.value })}
                >
                  <option value="">Seleccionar...</option>
                  {modalidades.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Clave Mnemotécnica</label>
                <input
                  type="text"
                  className="form-input"
                  value={editFormData.clave_mnemotecnica}
                  onChange={(e) => setEditFormData({ ...editFormData, clave_mnemotecnica: e.target.value })}
                  placeholder="Ej: RUT-001"
                />
              </div>
              </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCancelEdit}>
                Cancelar
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleSaveEdit}
                disabled={saving}
              >
                {saving ? (
                  <span className="spinner" style={{ width: '1rem', height: '1rem' }} />
                ) : (
                  <><Save className="w-4 h-4" style={{ marginRight: '0.5rem' }} /> Guardar</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RoutesModule;
