import React, { useState } from 'react';
import { 
  Settings, Upload, BarChart3, Map, FileDown, LayoutDashboard,
  Route, Database, Building2
} from 'lucide-react';
import ConfigModule from './modules/ConfigModule';
import RoutesModule from './modules/RoutesModule';
import AnalysisModule from './modules/AnalysisModule';
import RouteDetailModule from './modules/RouteDetailModule';
import DashboardModule from './modules/DashboardModule';
import MunicipioDashboard from './modules/MunicipioDashboard';
import ExportModule from './modules/ExportModule';

function App() {
  const [activeModule, setActiveModule] = useState('dashboard');
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedMunicipio, setSelectedMunicipio] = useState(null);

  const handleViewRoute = (route) => {
    setSelectedRoute(route);
    setActiveModule('route-detail');
  };

  const handleViewMunicipio = (municipio) => {
    setSelectedMunicipio(municipio);
    setActiveModule('municipio-dashboard');
  };

  const handleBackToRoutes = () => {
    setSelectedRoute(null);
    setActiveModule('routes');
  };

  const handleBackToDashboard = () => {
    setSelectedMunicipio(null);
    setActiveModule('dashboard');
  };

  const renderModule = () => {
    switch (activeModule) {
      case 'config':
        return <ConfigModule />;
      case 'routes':
        return <RoutesModule onViewRoute={handleViewRoute} />;
      case 'analysis':
        return <AnalysisModule onViewRoute={handleViewRoute} />;
      case 'route-detail':
        return <RouteDetailModule route={selectedRoute} onBack={handleBackToRoutes} />;
      case 'municipio-dashboard':
        return <MunicipioDashboard municipio={selectedMunicipio} onBack={handleBackToDashboard} />;
      case 'export':
        return <ExportModule />;
      case 'dashboard':
      default:
        return <DashboardModule onViewMunicipio={handleViewMunicipio} />;
    }
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Análisis Vial GPX</h1>
          <p>Plataforma de rutas de transporte</p>
        </div>
        
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeModule === 'dashboard' ? 'active' : ''}`}
            onClick={() => { setActiveModule('dashboard'); setSelectedMunicipio(null); }}
          >
            <LayoutDashboard />
            <span>Dashboard</span>
          </button>
          
          <button
            className={`nav-item ${activeModule === 'config' ? 'active' : ''}`}
            onClick={() => setActiveModule('config')}
          >
            <Database />
            <span>Configuración</span>
          </button>
          
          <button
            className={`nav-item ${activeModule === 'routes' ? 'active' : ''}`}
            onClick={() => { setActiveModule('routes'); setSelectedRoute(null); }}
          >
            <Route />
            <span>Rutas GPX</span>
          </button>
          
          <button
            className={`nav-item ${activeModule === 'analysis' ? 'active' : ''}`}
            onClick={() => setActiveModule('analysis')}
          >
            <BarChart3 />
            <span>Análisis</span>
          </button>
          
          <button
            className={`nav-item ${activeModule === 'export' ? 'active' : ''}`}
            onClick={() => setActiveModule('export')}
          >
            <FileDown />
            <span>Exportar</span>
          </button>
        </nav>
      </aside>
      
      <main className="main-content">
        {renderModule()}
      </main>
    </div>
  );
}

export default App;
