from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import json
from datetime import datetime
from werkzeug.utils import secure_filename

from services.shapefile_service import ShapefileService
from services.gpx_service import GPXService
from services.analysis_service import AnalysisService
from services.export_service import ExportService
from services.service_area_analyzer import ServiceAreaAnalyzer
from services.gpx_extractor import GPXExtractor
from shapely.ops import unary_union

app = Flask(__name__)
CORS(app)

# Configuration
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
DATA_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
RESULTS_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'results')

for folder in [UPLOAD_FOLDER, DATA_FOLDER, RESULTS_FOLDER]:
    os.makedirs(folder, exist_ok=True)
    os.makedirs(os.path.join(folder, 'shapefiles'), exist_ok=True)
    os.makedirs(os.path.join(folder, 'gpx'), exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['DATA_FOLDER'] = DATA_FOLDER
app.config['RESULTS_FOLDER'] = RESULTS_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024 * 1024  # 2GB max for large shapefiles

# Cache for manzanas GeoJSON (by municipio)
_unserved_manzanas_cache = {}
_served_manzanas_cache = {}

# Initialize services
shapefile_service = ShapefileService(DATA_FOLDER)
gpx_service = GPXService(UPLOAD_FOLDER, DATA_FOLDER)
analysis_service = AnalysisService(DATA_FOLDER, RESULTS_FOLDER)
export_service = ExportService(RESULTS_FOLDER)

# Database file for routes metadata
ROUTES_DB = os.path.join(DATA_FOLDER, 'routes.json')
CONFIG_DB = os.path.join(DATA_FOLDER, 'config.json')

def load_routes_db():
    if os.path.exists(ROUTES_DB):
        with open(ROUTES_DB, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'routes': []}

def save_routes_db(data):
    with open(ROUTES_DB, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)

def load_config():
    if os.path.exists(CONFIG_DB):
        with open(CONFIG_DB, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {
        'road_network': None,
        'municipalities': None,
        'localities': None,
        'buffer_distance': 50
    }

def save_config(config):
    with open(CONFIG_DB, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)

# ============== CONFIGURATION ENDPOINTS ==============

@app.route('/api/config', methods=['GET'])
def get_config():
    """Get current configuration status"""
    config = load_config()
    return jsonify(config)

@app.route('/api/config/buffer', methods=['POST'])
def set_buffer():
    """Set map-matching buffer distance"""
    data = request.json
    config = load_config()
    config['buffer_distance'] = data.get('buffer_distance', 50)
    save_config(config)
    return jsonify({'success': True, 'buffer_distance': config['buffer_distance']})

@app.route('/api/config/shapefile/<shapefile_type>', methods=['POST'])
def upload_shapefile(shapefile_type):
    """Upload a base shapefile (road_network, municipalities, localities, manzanas, sites)"""
    valid_types = ['road_network', 'municipalities', 'localities', 'manzanas', 'sites_public', 'sites_private']
    if shapefile_type not in valid_types:
        return jsonify({'error': 'Invalid shapefile type'}), 400
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    files = request.files.getlist('file')
    
    try:
        result = shapefile_service.save_shapefile(files, shapefile_type)
        
        if result['success']:
            config = load_config()
            config[shapefile_type] = {
                'loaded': True,
                'filename': result['filename'],
                'features_count': result['features_count'],
                'bounds': result['bounds'],
                'attributes': result['attributes'],
                'uploaded_at': datetime.now().isoformat()
            }
            save_config(config)
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/config/shapefile/<shapefile_type>/preview', methods=['GET'])
def preview_shapefile(shapefile_type):
    """Get GeoJSON preview of a shapefile"""
    valid_types = ['road_network', 'municipalities', 'localities', 'manzanas', 'sites_public', 'sites_private']
    if shapefile_type not in valid_types:
        return jsonify({'error': 'Invalid shapefile type'}), 400
    
    config = load_config()
    if not config.get(shapefile_type) or not config[shapefile_type].get('loaded'):
        return jsonify({'error': 'Shapefile not loaded'}), 404
    
    try:
        geojson = shapefile_service.get_geojson(shapefile_type)
        return jsonify(geojson)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/config/municipios', methods=['GET'])
def get_municipios_from_shapefile():
    """Get list of municipios from the municipalities shapefile NOMGEO field"""
    config = load_config()
    if not config.get('municipalities') or not config['municipalities'].get('loaded'):
        return jsonify({'municipios': [], 'error': 'Shapefile de municipios no cargado'}), 200
    
    try:
        municipios = shapefile_service.get_municipios_list()
        return jsonify({'municipios': municipios, 'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============== ROUTES ENDPOINTS ==============

@app.route('/api/routes', methods=['GET'])
def get_routes():
    """Get all routes with optional filters"""
    db = load_routes_db()
    routes = db['routes']
    
    # Apply filters
    municipio = request.args.get('municipio')
    modalidad = request.args.get('modalidad')
    analyzed = request.args.get('analyzed')
    
    if municipio:
        routes = [r for r in routes if r.get('municipio') == municipio]
    if modalidad:
        routes = [r for r in routes if r.get('modalidad') == modalidad]
    if analyzed is not None:
        is_analyzed = analyzed.lower() == 'true'
        routes = [r for r in routes if r.get('analyzed', False) == is_analyzed]
    
    return jsonify({'routes': routes, 'total': len(routes)})

@app.route('/api/routes/<route_id>', methods=['GET'])
def get_route(route_id):
    """Get a specific route by ID"""
    db = load_routes_db()
    route = next((r for r in db['routes'] if r['id'] == route_id), None)
    
    if not route:
        return jsonify({'error': 'Route not found'}), 404
    
    return jsonify(route)

@app.route('/api/routes', methods=['POST'])
def upload_route():
    """Upload a single GPX file with metadata"""
    if 'file' not in request.files:
        return jsonify({'error': 'No GPX file provided'}), 400
    
    file = request.files['file']
    
    metadata = {
        'nombre': request.form.get('nombre', ''),
        'municipio': request.form.get('municipio', ''),
        'modalidad': request.form.get('modalidad', ''),
        'clave_mnemotecnica': request.form.get('clave_mnemotecnica', '')
    }
    
    try:
        result = gpx_service.save_gpx(file, metadata)
        
        if result['success']:
            db = load_routes_db()
            db['routes'].append(result['route'])
            save_routes_db(db)
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/routes/batch', methods=['POST'])
def upload_routes_batch():
    """Upload multiple GPX files via ZIP with optional CSV metadata"""
    if 'file' not in request.files:
        return jsonify({'error': 'No ZIP file provided'}), 400
    
    zip_file = request.files['file']
    csv_file = request.files.get('metadata')
    
    try:
        result = gpx_service.save_gpx_batch(zip_file, csv_file)
        
        if result['success']:
            db = load_routes_db()
            db['routes'].extend(result['routes'])
            save_routes_db(db)
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/routes/<route_id>', methods=['PUT'])
def update_route(route_id):
    """Update route metadata"""
    db = load_routes_db()
    route_idx = next((i for i, r in enumerate(db['routes']) if r['id'] == route_id), None)
    
    if route_idx is None:
        return jsonify({'error': 'Route not found'}), 404
    
    data = request.json
    route = db['routes'][route_idx]
    
    # Update allowed fields
    if 'nombre' in data:
        route['nombre'] = data['nombre']
    if 'municipio' in data:
        route['municipio'] = data['municipio']
    if 'modalidad' in data:
        route['modalidad'] = data['modalidad']
    if 'clave_mnemotecnica' in data:
        route['clave_mnemotecnica'] = data['clave_mnemotecnica']
    
    db['routes'][route_idx] = route
    save_routes_db(db)
    
    return jsonify({'success': True, 'route': route})

@app.route('/api/routes/<route_id>', methods=['DELETE'])
def delete_route(route_id):
    """Delete a route"""
    db = load_routes_db()
    route = next((r for r in db['routes'] if r['id'] == route_id), None)
    
    if not route:
        return jsonify({'error': 'Route not found'}), 404
    
    db['routes'] = [r for r in db['routes'] if r['id'] != route_id]
    save_routes_db(db)
    
    # Delete associated files
    gpx_service.delete_gpx(route_id)
    
    return jsonify({'success': True})

@app.route('/api/routes/<route_id>/gpx', methods=['GET'])
def get_route_gpx(route_id):
    """Get GPX file as GeoJSON for map display"""
    db = load_routes_db()
    route = next((r for r in db['routes'] if r['id'] == route_id), None)
    
    if not route:
        return jsonify({'error': 'Route not found'}), 404
    
    try:
        geojson = gpx_service.get_gpx_geojson(route_id)
        return jsonify(geojson)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============== ANALYSIS ENDPOINTS ==============

@app.route('/api/analysis/<route_id>', methods=['POST'])
def analyze_route(route_id):
    """Analyze a single route"""
    db = load_routes_db()
    route = next((r for r in db['routes'] if r['id'] == route_id), None)
    
    if not route:
        return jsonify({'error': 'Route not found'}), 404
    
    config = load_config()
    
    try:
        result = analysis_service.analyze_route(route, config)
        
        if result['success']:
            # Update route with analysis results
            for r in db['routes']:
                if r['id'] == route_id:
                    r['analyzed'] = True
                    r['analysis'] = result['analysis']
                    r['analyzed_at'] = datetime.now().isoformat()
                    break
            save_routes_db(db)
        
        return jsonify(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/analysis/<route_id>/results', methods=['GET'])
def get_analysis_results(route_id):
    """Get analysis results for a route"""
    db = load_routes_db()
    route = next((r for r in db['routes'] if r['id'] == route_id), None)
    
    if not route:
        return jsonify({'error': 'Route not found'}), 404
    
    if not route.get('analyzed'):
        return jsonify({'error': 'Route not analyzed yet'}), 404
    
    try:
        results = analysis_service.get_results(route_id)
        return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/analysis/batch', methods=['POST'])
def analyze_batch():
    """Analyze all pending routes"""
    db = load_routes_db()
    pending_routes = [r for r in db['routes'] if not r.get('analyzed', False)]
    
    if not pending_routes:
        return jsonify({'success': True, 'message': 'No pending routes', 'analyzed': 0})
    
    config = load_config()
    results = []
    
    for route in pending_routes:
        try:
            result = analysis_service.analyze_route(route, config)
            if result['success']:
                for r in db['routes']:
                    if r['id'] == route['id']:
                        r['analyzed'] = True
                        r['analysis'] = result['analysis']
                        r['analyzed_at'] = datetime.now().isoformat()
                        break
                results.append({'id': route['id'], 'success': True})
            else:
                results.append({'id': route['id'], 'success': False, 'error': result.get('error')})
        except Exception as e:
            results.append({'id': route['id'], 'success': False, 'error': str(e)})
    
    save_routes_db(db)
    
    return jsonify({
        'success': True,
        'total': len(pending_routes),
        'analyzed': len([r for r in results if r['success']]),
        'results': results
    })

# ============== DASHBOARD ENDPOINTS ==============

@app.route('/api/dashboard/global', methods=['GET'])
def get_global_dashboard():
    """Get global statistics"""
    db = load_routes_db()
    routes = db['routes']
    analyzed_routes = [r for r in routes if r.get('analyzed', False)]
    
    stats = {
        'total_routes': len(routes),
        'analyzed_routes': len(analyzed_routes),
        'pending_routes': len(routes) - len(analyzed_routes),
        'total_km': 0,
        'municipalities_with_routes': len(set(r.get('municipio') for r in routes if r.get('municipio'))),
        'routes_by_modalidad': {},
        'surface_distribution': {'pavimentado': 0, 'terraceria': 0, 'na': 0},
        'admin_distribution': {'federal': 0, 'estatal': 0, 'municipal': 0, 'na': 0}
    }
    
    for route in analyzed_routes:
        analysis = route.get('analysis', {})
        # Usar distancia_rnc_km (distancia alineada a RNC) como base para totales
        stats['total_km'] += analysis.get('distancia_rnc_km', analysis.get('distancia_km', 0))
        
        modalidad = route.get('modalidad', 'Sin especificar')
        stats['routes_by_modalidad'][modalidad] = stats['routes_by_modalidad'].get(modalidad, 0) + 1
        
        surface = analysis.get('superficie', {})
        stats['surface_distribution']['pavimentado'] += surface.get('Con pavimento', 0) + surface.get('pavimentado_km', 0)
        stats['surface_distribution']['terraceria'] += surface.get('Sin pavimento', 0) + surface.get('terraceria_km', 0)
        stats['surface_distribution']['na'] += surface.get('N/A', 0) + surface.get('na_km', 0)
        
        admin = analysis.get('administracion', {})
        stats['admin_distribution']['federal'] += admin.get('Federal', 0) + admin.get('federal_km', 0)
        stats['admin_distribution']['estatal'] += admin.get('Estatal', 0) + admin.get('estatal_km', 0)
        stats['admin_distribution']['municipal'] += admin.get('Municipal', 0) + admin.get('municipal_km', 0)
        stats['admin_distribution']['na'] += admin.get('N/A', 0) + admin.get('na_km', 0)
    
    return jsonify(stats)

def _calculate_combined_service_area(analyzed_routes, municipio_name=None):
    """Calculate combined service area for multiple routes with deduplicated manzanas"""
    if not analyzed_routes:
        return {
            'poblacion_total': 0,
            'poblacion_femenina': 0,
            'poblacion_masculina': 0,
            'manzanas_count': 0,
            'piramide_poblacional': {
                '0-14': {'total': 0, 'label': '0-14 años'},
                '15-29': {'total': 0, 'label': '15-29 años'},
                '30-59': {'total': 0, 'label': '30-59 años'},
                '60+': {'total': 0, 'label': '60 años y más'}
            },
            'discapacidad': {'total': 0, 'porcentaje': 0}
        }
    
    try:
        # Collect all route geometries
        geometries = []
        gpx_folder = os.path.join(DATA_FOLDER, 'gpx')
        
        for route in analyzed_routes:
            gpx_path = os.path.join(gpx_folder, f"{route['id']}.gpx")
            if os.path.exists(gpx_path):
                try:
                    with open(gpx_path, 'rb') as f:
                        gpx_bytes = f.read()
                    extractor = GPXExtractor(gpx_bytes)
                    extractor.analyze()
                    linestring = extractor.get_linestring()
                    if linestring:
                        geometries.append(linestring)
                except:
                    pass
        
        if not geometries:
            return {
                'poblacion_total': 0,
                'poblacion_femenina': 0,
                'poblacion_masculina': 0,
                'manzanas_count': 0,
                'piramide_poblacional': {
                    '0-14': {'total': 0, 'label': '0-14 años'},
                    '15-29': {'total': 0, 'label': '15-29 años'},
                    '30-59': {'total': 0, 'label': '30-59 años'},
                    '60+': {'total': 0, 'label': '60 años y más'}
                },
                'discapacidad': {'total': 0, 'porcentaje': 0}
            }
        
        # Merge all geometries into one
        combined_geometry = unary_union(geometries)
        
        # Run service area analysis on combined geometry (filtered by municipality)
        service_analyzer = ServiceAreaAnalyzer(DATA_FOLDER)
        result = service_analyzer.analyze(combined_geometry, buffer_distance_m=700, municipio_name=municipio_name)
        
        # Return both served and unserved stats
        return {
            'served': result.get('stats', {}),
            'unserved': result.get('unserved_stats', {}),
            'unserved_manzanas_gdf': result.get('unserved_manzanas_gdf'),
            'served_manzanas_gdf': result.get('served_manzanas_gdf')
        }
        
    except Exception as e:
        print(f"Error calculating combined service area: {e}")
        empty_stats = {
            'poblacion_total': 0,
            'poblacion_femenina': 0,
            'poblacion_masculina': 0,
            'manzanas_count': 0,
            'piramide_poblacional': {
                '0-14': {'total': 0, 'label': '0-14 años'},
                '15-29': {'total': 0, 'label': '15-29 años'},
                '30-59': {'total': 0, 'label': '30-59 años'},
                '60+': {'total': 0, 'label': '60 años y más'}
            },
            'discapacidad': {'total': 0, 'porcentaje': 0}
        }
        return {'served': empty_stats, 'unserved': empty_stats, 'unserved_manzanas_gdf': None}

@app.route('/api/dashboard/municipio/<municipio>', methods=['GET'])
def get_municipio_dashboard(municipio):
    """Get statistics for a specific municipality"""
    db = load_routes_db()
    routes = [r for r in db['routes'] if r.get('municipio') == municipio]
    analyzed_routes = [r for r in routes if r.get('analyzed', False)]
    
    stats = {
        'municipio': municipio,
        'total_routes': len(routes),
        'analyzed_routes': len(analyzed_routes),
        'total_km': 0,
        'avg_distance_km': 0,
        'avg_duration_min': 0,
        'avg_speed_kmh': 0,
        'total_localidades': set(),
        'localidades_urbanas': set(),
        'localidades_rurales': set(),
        'surface_distribution': {'pavimentado': 0, 'terraceria': 0, 'na': 0},
        'admin_distribution': {'federal': 0, 'estatal': 0, 'municipal': 0, 'na': 0}
    }
    
    total_duration = 0
    total_speed = 0
    
    for route in analyzed_routes:
        analysis = route.get('analysis', {})
        # Usar distancia_rnc_km (distancia alineada a RNC) como base para totales
        stats['total_km'] += analysis.get('distancia_rnc_km', analysis.get('distancia_km', 0))
        total_duration += analysis.get('duracion_min', 0)
        total_speed += analysis.get('velocidad_promedio_kmh', 0)
        
        # Handle old format (localidades array)
        for loc in analysis.get('localidades', []):
            # Usar cvegeo como ID único para evitar duplicados
            loc_id = loc.get('cvegeo') or loc.get('nombre')
            stats['total_localidades'].add(loc_id)
            if loc.get('tipo') == 'urbana':
                stats['localidades_urbanas'].add(loc_id)
            else:
                stats['localidades_rurales'].add(loc_id)
        
        # Handle new format (municipios_atravesados with nested localities)
        for mun in analysis.get('municipios_atravesados', []):
            for loc in mun.get('localidades_urbanas', []):
                # Usar cvegeo como ID único para evitar duplicados entre rutas
                loc_id = loc.get('cvegeo') or loc.get('nombre')
                stats['total_localidades'].add(loc_id)
                stats['localidades_urbanas'].add(loc_id)
            for loc in mun.get('localidades_rurales', []):
                loc_id = loc.get('cvegeo') or loc.get('nombre')
                stats['total_localidades'].add(loc_id)
                stats['localidades_rurales'].add(loc_id)
        
        surface = analysis.get('superficie', {})
        stats['surface_distribution']['pavimentado'] += surface.get('Con pavimento', 0) + surface.get('pavimentado_km', 0)
        stats['surface_distribution']['terraceria'] += surface.get('Sin pavimento', 0) + surface.get('terraceria_km', 0)
        stats['surface_distribution']['na'] += surface.get('N/A', 0) + surface.get('na_km', 0)
        
        admin = analysis.get('administracion', {})
        stats['admin_distribution']['federal'] += admin.get('Federal', 0) + admin.get('federal_km', 0)
        stats['admin_distribution']['estatal'] += admin.get('Estatal', 0) + admin.get('estatal_km', 0)
        stats['admin_distribution']['municipal'] += admin.get('Municipal', 0) + admin.get('municipal_km', 0)
        stats['admin_distribution']['na'] += admin.get('N/A', 0) + admin.get('na_km', 0)
    
    if analyzed_routes:
        stats['avg_distance_km'] = stats['total_km'] / len(analyzed_routes)
        stats['avg_duration_min'] = total_duration / len(analyzed_routes)
        stats['avg_speed_kmh'] = total_speed / len(analyzed_routes)
    
    stats['total_localidades'] = len(stats['total_localidades'])
    stats['localidades_urbanas'] = len(stats['localidades_urbanas'])
    stats['localidades_rurales'] = len(stats['localidades_rurales'])
    
    # Calculate combined service area for all routes (deduplicated manzanas, filtered by municipio)
    service_area_result = _calculate_combined_service_area(analyzed_routes, municipio_name=municipio)
    
    # Separate served and unserved stats
    stats['area_servicio'] = service_area_result.get('served', {})
    stats['area_no_atendida'] = service_area_result.get('unserved', {})
    
    # Store manzanas GeoJSON in cache for map endpoints
    unserved_gdf = service_area_result.get('unserved_manzanas_gdf')
    if unserved_gdf is not None and len(unserved_gdf) > 0:
        unserved_gdf_wgs = unserved_gdf.to_crs(epsg=4326)
        _unserved_manzanas_cache[municipio] = unserved_gdf_wgs
    
    served_gdf = service_area_result.get('served_manzanas_gdf')
    if served_gdf is not None and len(served_gdf) > 0:
        served_gdf_wgs = served_gdf.to_crs(epsg=4326)
        _served_manzanas_cache[municipio] = served_gdf_wgs
    
    return jsonify(stats)

@app.route('/api/dashboard/municipios', methods=['GET'])
def get_municipios_list():
    """Get list of municipalities with routes"""
    db = load_routes_db()
    municipios = {}
    
    for route in db['routes']:
        mun = route.get('municipio', 'Sin especificar')
        if mun not in municipios:
            municipios[mun] = {'total': 0, 'analyzed': 0}
        municipios[mun]['total'] += 1
        if route.get('analyzed', False):
            municipios[mun]['analyzed'] += 1
    
    return jsonify({'municipios': municipios})

def _manzanas_gdf_to_geojson(gdf):
    """Convert manzanas GeoDataFrame to GeoJSON"""
    if gdf is None or len(gdf) == 0:
        return {'type': 'FeatureCollection', 'features': []}
    
    features = []
    cols = list(gdf.columns)
    
    for idx, row in gdf.iterrows():
        poblacion = 0
        try:
            poblacion = int(float(str(row[cols[6]]).replace(',', '').replace('*', '0') or 0))
        except:
            pass
        
        feature = {
            'type': 'Feature',
            'geometry': row.geometry.__geo_interface__,
            'properties': {
                'poblacion': poblacion,
                'cvegeo': str(row.get('CVEGEO', '')) if 'CVEGEO' in cols else ''
            }
        }
        features.append(feature)
    
    return {'type': 'FeatureCollection', 'features': features}

@app.route('/api/dashboard/municipio/<municipio>/unserved-manzanas', methods=['GET'])
def get_unserved_manzanas_geojson(municipio):
    """Get GeoJSON of unserved manzanas in municipality for map display"""
    if municipio not in _unserved_manzanas_cache:
        return jsonify({'type': 'FeatureCollection', 'features': []})
    
    return jsonify(_manzanas_gdf_to_geojson(_unserved_manzanas_cache[municipio]))

@app.route('/api/dashboard/municipio/<municipio>/served-manzanas', methods=['GET'])
def get_served_manzanas_geojson(municipio):
    """Get GeoJSON of served manzanas in municipality for map display"""
    if municipio not in _served_manzanas_cache:
        return jsonify({'type': 'FeatureCollection', 'features': []})
    
    return jsonify(_manzanas_gdf_to_geojson(_served_manzanas_cache[municipio]))

# ============== EXPORT ENDPOINTS ==============

@app.route('/api/export/route/<route_id>/json', methods=['GET'])
def export_route_json(route_id):
    """Export route analysis as JSON"""
    db = load_routes_db()
    route = next((r for r in db['routes'] if r['id'] == route_id), None)
    
    if not route:
        return jsonify({'error': 'Route not found'}), 404
    
    return jsonify(route)

@app.route('/api/export/route/<route_id>/shapefile', methods=['GET'])
def export_route_shapefile(route_id):
    """Export route as shapefile with attributes"""
    db = load_routes_db()
    route = next((r for r in db['routes'] if r['id'] == route_id), None)
    
    if not route:
        return jsonify({'error': 'Route not found'}), 404
    
    try:
        filepath = export_service.export_shapefile(route)
        return send_file(filepath, as_attachment=True)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/export/routes/csv', methods=['GET'])
def export_routes_csv():
    """Export all routes summary as CSV"""
    db = load_routes_db()
    
    try:
        filepath = export_service.export_csv(db['routes'])
        return send_file(filepath, as_attachment=True, download_name='rutas_resumen.csv')
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/export/routes/excel', methods=['GET'])
def export_routes_excel():
    """Export all routes summary as Excel"""
    db = load_routes_db()
    
    try:
        filepath = export_service.export_excel(db['routes'])
        return send_file(filepath, as_attachment=True, download_name='rutas_resumen.xlsx')
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
