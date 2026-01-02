import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Play, Download, MapPin, Clock, Gauge, Mountain, Building2, Home, CheckCircle, Users, Accessibility, Bus, Car, FileText } from 'lucide-react';
import { MapContainer, TileLayer, GeoJSON, useMap, LayersControl } from 'react-leaflet';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { getRouteGPX, getAnalysisResults, analyzeRoute, getShapefilePreview } from '../api';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
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
  const [sitesPublicData, setSitesPublicData] = useState(null);
  const [sitesPrivateData, setSitesPrivateData] = useState(null);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [layers, setLayers] = useState({
    gpxOriginal: true,
    matchedRoads: true,
    municipalities: false,
    sitesPublic: true,
    sitesPrivate: true
  });
  const mapRef = useRef(null);
  const reportRef = useRef(null);

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

      // Load sites data
      try {
        const sitesPublicRes = await getShapefilePreview('sites_public');
        setSitesPublicData(sitesPublicRes.data);
      } catch (e) {}
      try {
        const sitesPrivateRes = await getShapefilePreview('sites_private');
        setSitesPrivateData(sitesPrivateRes.data);
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

  // PDF Generation function - captures actual page sections
  const generatePDF = async () => {
    if (!analysis) return;
    
    setGeneratingPDF(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;

      // Helper to add image from element with proper scaling
      const addElementToPDF = async (selector, yPosition = null) => {
        const element = document.querySelector(selector);
        if (!element) return 0;
        
        try {
          const canvas = await html2canvas(element, {
            useCORS: true,
            allowTaint: true,
            scale: 2,
            logging: false,
            backgroundColor: '#ffffff'
          });
          
          const imgData = canvas.toDataURL('image/png');
          const imgWidth = pageWidth - 2 * margin;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          
          return { imgData, imgWidth, imgHeight };
        } catch (e) {
          console.error('Error capturing element:', e);
          return null;
        }
      };

      // Page 1: Header + Stats + Map
      // Header
      pdf.setFillColor(30, 64, 175);
      pdf.rect(0, 0, pageWidth, 22, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text('FICHA TECNICA DE RUTA', margin, 14);
      
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      const dateStr = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
      pdf.text(dateStr, pageWidth - margin - pdf.getTextWidth(dateStr), 14);

      let yPos = 28;

      // Route title section
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(17, 24, 39);
      pdf.text(route.nombre || 'Ruta sin nombre', margin, yPos);
      yPos += 6;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(107, 114, 128);
      const subtitles = [route.municipio, route.modalidad, route.clave_mnemotecnica].filter(Boolean).join(' | ');
      pdf.text(subtitles, margin, yPos);
      yPos += 8;

      // Capture stats grid
      const statsGrid = document.querySelector('.stats-grid');
      if (statsGrid) {
        const statsResult = await addElementToPDF('.stats-grid');
        if (statsResult) {
          const scaledHeight = Math.min(statsResult.imgHeight, 25);
          pdf.addImage(statsResult.imgData, 'PNG', margin, yPos, statsResult.imgWidth, scaledHeight);
          yPos += scaledHeight + 5;
        }
      }

      // Capture the map
      const mapElement = document.querySelector('.map-container');
      if (mapElement && route.bounds) {
        // Ensure map is fitted to route
        if (mapRef.current) {
          const routeBounds = [
            [route.bounds[1], route.bounds[0]],
            [route.bounds[3], route.bounds[2]]
          ];
          mapRef.current.fitBounds(routeBounds, { padding: [20, 20], animate: false });
          await new Promise(resolve => setTimeout(resolve, 800));
        }
        
        const mapResult = await addElementToPDF('.map-container');
        if (mapResult) {
          const mapHeight = Math.min(mapResult.imgHeight, 80);
          pdf.addImage(mapResult.imgData, 'PNG', margin, yPos, mapResult.imgWidth, mapHeight);
          yPos += mapHeight + 5;
        }
      }

      // Page 2: Charts and details
      pdf.addPage();
      yPos = margin;

      // Capture chart sections
      const chartContainers = document.querySelectorAll('.chart-container');
      for (let i = 0; i < Math.min(chartContainers.length, 2); i++) {
        try {
          const canvas = await html2canvas(chartContainers[i].parentElement, {
            useCORS: true,
            scale: 2,
            logging: false,
            backgroundColor: '#ffffff'
          });
          const imgData = canvas.toDataURL('image/png');
          const imgWidth = (pageWidth - 3 * margin) / 2;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          const xPos = margin + i * (imgWidth + margin);
          pdf.addImage(imgData, 'PNG', xPos, yPos, imgWidth, Math.min(imgHeight, 60));
        } catch (e) {}
      }
      yPos += 65;

      // Capture cards (municipalities, localities)
      const cards = document.querySelectorAll('.card');
      for (let i = 0; i < Math.min(cards.length, 4); i++) {
        if (yPos + 50 > pageHeight - margin) {
          pdf.addPage();
          yPos = margin;
        }
        try {
          const canvas = await html2canvas(cards[i], {
            useCORS: true,
            scale: 2,
            logging: false,
            backgroundColor: '#ffffff'
          });
          const imgData = canvas.toDataURL('image/png');
          const imgWidth = pageWidth - 2 * margin;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          pdf.addImage(imgData, 'PNG', margin, yPos, imgWidth, Math.min(imgHeight, 70));
          yPos += Math.min(imgHeight, 70) + 5;
        } catch (e) {}
      }

      // Page for Sites with satellite zoom
      const allSites = [
        ...(sitesPublicData?.features || []).map(f => ({ ...f, siteType: 'public' })),
        ...(sitesPrivateData?.features || []).map(f => ({ ...f, siteType: 'private' }))
      ];

      if (allSites.length > 0) {
        const googleApiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
        
        pdf.addPage();
        
        // Header for sites page
        pdf.setFillColor(245, 158, 11);
        pdf.rect(0, 0, pageWidth, 18, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text('BASES / SITIOS DE TRANSPORTE', margin, 12);
        yPos = 25;

        // Switch to satellite with max zoom
        const layerControl = document.querySelector('.leaflet-control-layers');
        const satelliteRadio = layerControl?.querySelectorAll('input[type="radio"]')[1];
        if (satelliteRadio) {
          satelliteRadio.click();
          await new Promise(resolve => setTimeout(resolve, 600));
        }

        for (let idx = 0; idx < Math.min(allSites.length, 6); idx++) {
          const site = allSites[idx];
          const props = site.properties || {};
          const name = props.Name || props.name || props.NOMBRE || props.nombre || `Sitio ${idx + 1}`;
          const isPublic = site.siteType === 'public';
          const color = isPublic ? [245, 158, 11] : [239, 68, 68];
          
          let coords = site.geometry?.coordinates;
          if (!coords) continue;
          if (Array.isArray(coords[0])) coords = coords[0];
          const [lng, lat] = coords;
          if (typeof lat !== 'number' || typeof lng !== 'number') continue;

          // Each site needs about 120mm (satellite + street view)
          if (yPos + 120 > pageHeight - margin) {
            pdf.addPage();
            yPos = margin;
          }

          // Card background
          const cardHeight = googleApiKey ? 115 : 65;
          pdf.setFillColor(250, 250, 250);
          pdf.roundedRect(margin, yPos - 3, pageWidth - 2 * margin, cardHeight, 2, 2, 'F');
          
          // Color indicator
          pdf.setFillColor(...color);
          pdf.roundedRect(margin, yPos - 3, 4, cardHeight, 1, 1, 'F');

          // Site name and type
          pdf.setFontSize(11);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(17, 24, 39);
          pdf.text(name, margin + 10, yPos + 6);
          
          // Type badge
          pdf.setFillColor(...color);
          pdf.roundedRect(margin + 10 + pdf.getTextWidth(name) + 4, yPos + 1, 24, 6, 1, 1, 'F');
          pdf.setFontSize(7);
          pdf.setTextColor(255, 255, 255);
          pdf.text(isPublic ? 'PUBLICO' : 'PRIVADO', margin + 10 + pdf.getTextWidth(name) + 7, yPos + 5);

          // Coordinates
          pdf.setFontSize(8);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(100, 100, 100);
          pdf.text(`Coordenadas: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, margin + 10, yPos + 13);

          // Satellite image with zoom 20 and proper aspect ratio
          if (mapRef.current) {
            mapRef.current.setView([lat, lng], 20, { animate: false });
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            try {
              const mapEl = document.querySelector('.map-container');
              const canvas = await html2canvas(mapEl, {
                useCORS: true,
                allowTaint: true,
                scale: 2,
                logging: false
              });
              const imgData = canvas.toDataURL('image/png');
              // Maintain aspect ratio
              const origRatio = canvas.width / canvas.height;
              const imgWidth = (pageWidth - 2 * margin - 20) / 2;
              const imgHeight = imgWidth / origRatio;
              
              pdf.setFontSize(7);
              pdf.setTextColor(120, 120, 120);
              pdf.text('Vista Satelital:', margin + 10, yPos + 19);
              pdf.addImage(imgData, 'PNG', margin + 10, yPos + 21, imgWidth, Math.min(imgHeight, 40));
              
              // Google Street View image
              if (googleApiKey) {
                const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${lat},${lng}&fov=90&heading=0&pitch=0&key=${googleApiKey}`;
                
                pdf.text('Street View:', margin + 15 + imgWidth, yPos + 19);
                
                // Load Street View image
                try {
                  const response = await fetch(streetViewUrl);
                  const blob = await response.blob();
                  const reader = new FileReader();
                  const streetViewImg = await new Promise((resolve, reject) => {
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                  });
                  
                  pdf.addImage(streetViewImg, 'JPEG', margin + 15 + imgWidth, yPos + 21, imgWidth, Math.min(imgHeight, 40));
                } catch (svErr) {
                  pdf.setFontSize(7);
                  pdf.setTextColor(180, 180, 180);
                  pdf.text('Street View no disponible', margin + 20 + imgWidth, yPos + 40);
                }
              }
            } catch (e) {
              pdf.setTextColor(180, 180, 180);
              pdf.text('Imagen no disponible', margin + 50, yPos + 35);
            }
          }

          yPos += cardHeight + 8;
        }

        // Restore map
        const osmRadio = layerControl?.querySelectorAll('input[type="radio"]')[0];
        if (osmRadio) osmRadio.click();
        
        if (route.bounds && mapRef.current) {
          const routeBounds = [[route.bounds[1], route.bounds[0]], [route.bounds[3], route.bounds[2]]];
          mapRef.current.fitBounds(routeBounds, { padding: [20, 20] });
        }
      }

      // Footer on last page
      pdf.setFontSize(7);
      pdf.setTextColor(150, 150, 150);
      pdf.text('Plataforma de Analisis de Rutas GPX', margin, pageHeight - 5);

      // Save
      const fileName = `Ficha_${route.nombre?.replace(/[^a-zA-Z0-9]/g, '_') || route.id}.pdf`;
      pdf.save(fileName);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error al generar el PDF. Por favor intenta de nuevo.');
    } finally {
      setGeneratingPDF(false);
    }
  };

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
            <div style={{ display: 'flex', gap: '0.5rem' }}>
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
              {analysis && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={generatePDF}
                  disabled={generatingPDF}
                  style={{ backgroundColor: '#059669' }}
                >
                  {generatingPDF ? (
                    <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                  ) : (
                    <>
                      <FileText className="w-4 h-4" />
                      Generar Ficha PDF
                    </>
                  )}
                </button>
              )}
            </div>
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
            {sitesPublicData && (
              <label className="layer-control-item">
                <input
                  type="checkbox"
                  checked={layers.sitesPublic}
                  onChange={(e) => setLayers({ ...layers, sitesPublic: e.target.checked })}
                />
                <span className="legend-color" style={{ background: '#f59e0b', borderRadius: '50%' }} />
                <span>Bases Públicas</span>
              </label>
            )}
            {sitesPrivateData && (
              <label className="layer-control-item">
                <input
                  type="checkbox"
                  checked={layers.sitesPrivate}
                  onChange={(e) => setLayers({ ...layers, sitesPrivate: e.target.checked })}
                />
                <span className="legend-color" style={{ background: '#ef4444', borderRadius: '50%' }} />
                <span>Bases Privadas</span>
              </label>
            )}
          </div>

          <div className="map-container">
            <MapContainer
              center={[23.6345, -102.5528]}
              zoom={10}
              style={{ height: '100%', width: '100%' }}
              ref={mapRef}
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

              {/* Sites - Public Transport */}
              {layers.sitesPublic && sitesPublicData && (
                <GeoJSON
                  data={sitesPublicData}
                  pointToLayer={(feature, latlng) => {
                    return window.L.circleMarker(latlng, {
                      radius: 8,
                      fillColor: '#f59e0b',
                      color: '#b45309',
                      weight: 2,
                      opacity: 1,
                      fillOpacity: 0.9
                    });
                  }}
                  onEachFeature={(feature, layer) => {
                    const props = feature.properties;
                    const name = props.Name || props.name || props.NOMBRE || props.nombre || 'Base Pública';
                    const coords = feature.geometry.coordinates;
                    const lat = coords[1];
                    const lng = coords[0];
                    const streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
                    layer.bindPopup(`
                      <strong>🚌 ${name}</strong><br/>
                      <span style="color:#666">Transporte Público</span><br/>
                      <a href="${streetViewUrl}" target="_blank" rel="noopener" style="color:#3b82f6;font-size:12px;text-decoration:none;">
                        📍 Ver en Street View
                      </a>
                    `);
                  }}
                />
              )}

              {/* Sites - Private Transport */}
              {layers.sitesPrivate && sitesPrivateData && (
                <GeoJSON
                  data={sitesPrivateData}
                  pointToLayer={(feature, latlng) => {
                    return window.L.circleMarker(latlng, {
                      radius: 8,
                      fillColor: '#ef4444',
                      color: '#b91c1c',
                      weight: 2,
                      opacity: 1,
                      fillOpacity: 0.9
                    });
                  }}
                  onEachFeature={(feature, layer) => {
                    const props = feature.properties;
                    const name = props.Name || props.name || props.NOMBRE || props.nombre || 'Base Privada';
                    const coords = feature.geometry.coordinates;
                    const lat = coords[1];
                    const lng = coords[0];
                    const streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
                    layer.bindPopup(`
                      <strong>🚗 ${name}</strong><br/>
                      <span style="color:#666">Transporte Privado</span><br/>
                      <a href="${streetViewUrl}" target="_blank" rel="noopener" style="color:#3b82f6;font-size:12px;text-decoration:none;">
                        📍 Ver en Street View
                      </a>
                    `);
                  }}
                />
              )}
              
              {route.bounds && <FitBounds bounds={route.bounds} />}
            </MapContainer>
          </div>
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
                  <BarChart data={adminData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `${v.toFixed(1)} km`} />
                    <YAxis type="category" dataKey="name" width={70} />
                    <Tooltip formatter={(value) => `${value.toFixed(2)} km`} />
                    <Bar dataKey="km" fill="#3b82f6" label={{ position: 'right', formatter: (v) => `${v.toFixed(2)} km`, fontSize: 11 }} />
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

      {/* Confianza del Análisis - discreto al final */}
      {analysis && (
        <div style={{ marginTop: '1.5rem', padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap' }}>Confianza del análisis:</span>
            <div style={{ flex: 1, height: '6px', backgroundColor: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ 
                width: `${analysis.confianza_matching || 0}%`,
                height: '100%',
                backgroundColor: analysis.confianza_matching > 70 ? '#10b981' : analysis.confianza_matching > 40 ? '#f59e0b' : '#ef4444',
                borderRadius: '3px'
              }} />
            </div>
            <span style={{ fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
              {analysis.confianza_matching?.toFixed(1)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default RouteDetailModule;
