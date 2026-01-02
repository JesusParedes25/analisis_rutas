import os
import json
import math
import numpy as np
from datetime import datetime
from shapely.geometry import Point, LineString, MultiLineString
from shapely.ops import nearest_points
import geopandas as gpd

from services.gpx_extractor import GPXExtractor
from services.map_matcher import MapMatcher
from services.road_analyzer import RoadAnalyzer
from services.locality_detector import LocalityDetector
from services.segment_colorizer import SegmentColorizer
from services.service_area_analyzer import ServiceAreaAnalyzer
from services.network_analyzer import get_network_analyzer

class AnalysisService:
    def __init__(self, data_folder, results_folder):
        self.data_folder = data_folder
        self.results_folder = results_folder
        self.gpx_folder = os.path.join(data_folder, 'gpx')
        
        os.makedirs(results_folder, exist_ok=True)
    
    def analyze_route(self, route, config):
        """Perform complete analysis of a route using the new services"""
        route_id = route['id']
        
        try:
            # Load the GPX file
            gpx_path = os.path.join(self.gpx_folder, f"{route_id}.gpx")
            if not os.path.exists(gpx_path):
                return {'success': False, 'error': f'GPX file not found: {gpx_path}'}
            
            # 1. Extract GPX metrics using GPXExtractor
            with open(gpx_path, 'rb') as f:
                gpx_bytes = f.read()
            
            extractor = GPXExtractor(gpx_bytes)
            gpx_metrics = extractor.analyze()
            gpx_linestring = extractor.get_linestring()
            
            if gpx_linestring is None or len(list(gpx_linestring.coords)) < 2:
                return {'success': False, 'error': 'Route has less than 2 points'}
            
            # 2. Load shapefiles
            road_network = self._load_shapefile('road_network')
            municipalities = self._load_shapefile('municipalities')
            localities = self._load_shapefile('localities')
            
            # 3. Map-matching using MapMatcher
            buffer_distance = config.get('buffer_distance', 50)
            matched_result = {'matched_segments': [], 'confidence': 0, 'match_rate_pct': 0, 'aligned_geometry': gpx_linestring}
            road_stats = {'superficie': {}, 'administracion': {}, 'tipo_vialidad': {}}
            matched_segments_gdf = None
            
            if road_network is not None:
                matcher = MapMatcher(gpx_linestring, road_network, buffer_distance)
                matched_result = matcher.match()
                
                # 4. Analyze road attributes using RoadAnalyzer
                if matched_result['matched_segments']:
                    analyzer = RoadAnalyzer(road_network)
                    road_stats = analyzer.analyze(matched_result['matched_segments'], gpx_linestring)
                    
                    # Get matched segments GeoDataFrame for colorization
                    unique_indices = list(set([s['index'] for s in matched_result['matched_segments']]))
                    matched_segments_gdf = road_network.loc[unique_indices]
            
            # 5. Detect localities and municipalities using LocalityDetector with network analysis
            locality_result = {'municipios': [], 'total_municipios': 0, 'total_urbanas': 0, 'total_rurales': 0}
            
            # Get network analyzer for accurate walking distance calculation
            try:
                network_analyzer = get_network_analyzer(self.data_folder)
            except Exception as e:
                print(f"Warning: Could not initialize network analyzer: {e}")
                network_analyzer = None
            
            if localities is not None:
                detector = LocalityDetector(localities, municipalities, buffer_meters=700, network_analyzer=network_analyzer)
                locality_result = detector.detect(gpx_linestring, use_network=True)
            elif municipalities is not None:
                # If no localities but we have municipalities, detect them directly
                detector = LocalityDetector(municipalities, municipalities, buffer_meters=700, network_analyzer=network_analyzer)
                locality_result = detector.detect(gpx_linestring, use_network=True)
            
            # 6. Generate colored segments for visualization
            colored_by_surface = None
            colored_by_admin = None
            colored_by_slope = extractor.get_colored_segments_by_slope()
            
            if matched_segments_gdf is not None and len(matched_segments_gdf) > 0:
                colored_by_surface = SegmentColorizer.colorize_by_surface(matched_segments_gdf)
                colored_by_admin = SegmentColorizer.colorize_by_administration(matched_segments_gdf)
            
            # 7. Service area analysis (manzanas within 700m walking distance)
            service_area_result = {'success': False, 'stats': {}}
            try:
                service_analyzer = ServiceAreaAnalyzer(self.data_folder)
                service_area_result = service_analyzer.analyze(gpx_linestring, buffer_distance_m=700)
            except Exception as e:
                print(f"Service area analysis error: {e}")
            
            # Compile analysis results
            analysis = {
                # GPX Metrics
                'duracion_min': gpx_metrics.get('duracion_minutos'),
                'distancia_km': gpx_metrics.get('distancia_km'),
                'distancia_rnc_km': road_stats.get('distancia_rnc_km', gpx_metrics.get('distancia_km')),
                'puntos_totales': gpx_metrics.get('puntos_totales', 0),
                
                # Velocity
                'velocidad_promedio_kmh': gpx_metrics.get('velocidad', {}).get('promedio_kmh'),
                'velocidad_maxima_kmh': gpx_metrics.get('velocidad', {}).get('maxima_kmh'),
                
                # Elevation
                'elevacion_min_m': gpx_metrics.get('elevacion', {}).get('minima_m'),
                'elevacion_max_m': gpx_metrics.get('elevacion', {}).get('maxima_m'),
                'ganancia_elevacion_m': gpx_metrics.get('elevacion', {}).get('ganancia_m'),
                'perdida_elevacion_m': gpx_metrics.get('elevacion', {}).get('perdida_m'),
                
                # Slopes
                'pendiente_promedio_subida': gpx_metrics.get('inclinacion', {}).get('promedio_positiva_pct'),
                'pendiente_promedio_bajada': gpx_metrics.get('inclinacion', {}).get('promedio_negativa_pct'),
                'pendiente_maxima': gpx_metrics.get('inclinacion', {}).get('maxima_pct'),
                
                # Road stats from RNC
                'superficie': road_stats.get('superficie', {}),
                'administracion': road_stats.get('administracion', {}),
                'tipo_vialidad': road_stats.get('tipo_vialidad', {}),
                
                # Localities and municipalities
                'municipios_atravesados': locality_result.get('municipios', []),
                'num_municipios': locality_result.get('total_municipios', 0),
                'localidades_urbanas': locality_result.get('total_urbanas', 0),
                'localidades_rurales': locality_result.get('total_rurales', 0),
                'total_localidades': locality_result.get('total_localidades', 0),
                
                # Map matching metrics
                'confianza_matching': matched_result.get('confidence', 0),
                'match_rate_pct': matched_result.get('match_rate_pct', 0),
                'distancia_promedio_match_m': matched_result.get('distance_avg_m'),
                'puntos_sin_match': matched_result.get('unmatched_points', 0),
                
                # Service area analysis (population coverage)
                'area_servicio': service_area_result.get('stats', {})
            }
            
            # Save results with visualization data
            self._save_results(route_id, analysis, matched_result, {
                'colored_by_surface': colored_by_surface,
                'colored_by_admin': colored_by_admin,
                'colored_by_slope': colored_by_slope
            })
            
            return {
                'success': True,
                'analysis': analysis
            }
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': str(e)}
    
    def _calculate_basic_metrics(self, points):
        """Calculate basic route metrics"""
        total_distance = 0
        total_time = 0
        speeds = []
        elevations = []
        elevation_gains = []
        elevation_losses = []
        slopes_up = []
        slopes_down = []
        
        prev_point = None
        prev_time = None
        
        for point in points:
            if point.get('ele') is not None:
                elevations.append(point['ele'])
            
            if prev_point:
                # Calculate distance using Haversine formula
                dist = self._haversine(
                    prev_point['lat'], prev_point['lon'],
                    point['lat'], point['lon']
                )
                total_distance += dist
                
                # Calculate time difference
                if point.get('time') and prev_point.get('time'):
                    try:
                        t1 = datetime.fromisoformat(prev_point['time'].replace('Z', '+00:00'))
                        t2 = datetime.fromisoformat(point['time'].replace('Z', '+00:00'))
                        time_diff = (t2 - t1).total_seconds()
                        
                        if time_diff > 0:
                            total_time += time_diff
                            speed = (dist / time_diff) * 3600  # km/h
                            if speed < 200:  # Filter unrealistic speeds
                                speeds.append(speed)
                    except:
                        pass
                
                # Calculate elevation changes
                if point.get('ele') is not None and prev_point.get('ele') is not None:
                    ele_diff = point['ele'] - prev_point['ele']
                    if ele_diff > 0:
                        elevation_gains.append(ele_diff)
                        if dist > 0:
                            slope = (ele_diff / (dist * 1000)) * 100
                            slopes_up.append(slope)
                    elif ele_diff < 0:
                        elevation_losses.append(abs(ele_diff))
                        if dist > 0:
                            slope = (abs(ele_diff) / (dist * 1000)) * 100
                            slopes_down.append(slope)
            
            prev_point = point
        
        return {
            'distance_km': round(total_distance, 3),
            'duration_min': round(total_time / 60, 2) if total_time > 0 else 0,
            'avg_speed_kmh': round(np.mean(speeds), 2) if speeds else 0,
            'max_speed_kmh': round(max(speeds), 2) if speeds else 0,
            'elevation_min': round(min(elevations), 1) if elevations else 0,
            'elevation_max': round(max(elevations), 1) if elevations else 0,
            'elevation_gain': round(sum(elevation_gains), 1) if elevation_gains else 0,
            'elevation_loss': round(sum(elevation_losses), 1) if elevation_losses else 0,
            'avg_slope_up': round(np.mean(slopes_up), 2) if slopes_up else 0,
            'avg_slope_down': round(np.mean(slopes_down), 2) if slopes_down else 0
        }
    
    def _haversine(self, lat1, lon1, lat2, lon2):
        """Calculate distance in km between two points using Haversine formula"""
        R = 6371  # Earth's radius in km
        
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat = math.radians(lat2 - lat1)
        delta_lon = math.radians(lon2 - lon1)
        
        a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        
        return R * c
    
    def _load_shapefile(self, shapefile_type):
        """Load a shapefile as GeoDataFrame with proper encoding"""
        shp_path = os.path.join(self.data_folder, 'shapefiles', shapefile_type, f'{shapefile_type}.shp')
        
        if not os.path.exists(shp_path):
            return None
        
        # Try multiple encodings for Spanish characters
        encodings = ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']
        for encoding in encodings:
            try:
                gdf = gpd.read_file(shp_path, encoding=encoding)
                # Test if encoding worked by checking for garbled characters
                sample = str(gdf.iloc[0].to_dict()) if len(gdf) > 0 else ''
                if 'Ã' not in sample:  # Common sign of wrong encoding
                    return gdf
            except Exception:
                continue
        
        # Fallback
        return gpd.read_file(shp_path)
    
    def _map_matching(self, route_line, road_network, buffer_distance):
        """Match GPX track to road network"""
        if road_network is None:
            return {
                'matched_segments': None,
                'matched_line': None,
                'confidence': 0,
                'matched_distance_km': 0
            }
        
        # Convert buffer distance from meters to degrees (approximate)
        buffer_deg = buffer_distance / 111000
        
        # Create buffer around route
        route_buffer = route_line.buffer(buffer_deg)
        
        # Find road segments within buffer
        road_network_copy = road_network.copy()
        road_network_copy['intersects'] = road_network_copy.geometry.intersects(route_buffer)
        nearby_roads = road_network_copy[road_network_copy['intersects']].copy()
        
        if len(nearby_roads) == 0:
            return {
                'matched_segments': None,
                'matched_line': None,
                'confidence': 0,
                'matched_distance_km': 0
            }
        
        # Calculate matched distance
        matched_lines = []
        for idx, road in nearby_roads.iterrows():
            try:
                intersection = road.geometry.intersection(route_buffer)
                if not intersection.is_empty:
                    matched_lines.append(intersection)
            except:
                pass
        
        # Calculate total matched distance
        matched_distance = 0
        for line in matched_lines:
            if hasattr(line, 'length'):
                matched_distance += line.length * 111  # Approximate conversion to km
        
        # Calculate confidence based on how much of the route is matched
        route_length = route_line.length * 111
        confidence = min(100, (matched_distance / route_length * 100)) if route_length > 0 else 0
        
        return {
            'matched_segments': nearby_roads,
            'matched_line': matched_lines,
            'confidence': round(confidence, 1),
            'matched_distance_km': round(matched_distance, 3)
        }
    
    def _calculate_road_stats(self, matched_segments):
        """Calculate statistics from matched road segments"""
        surface_stats = {'pavimentado_km': 0, 'terraceria_km': 0, 'na_km': 0}
        admin_stats = {'federal_km': 0, 'estatal_km': 0, 'municipal_km': 0, 'na_km': 0}
        
        # Find relevant columns
        surface_col = self._find_name_column(matched_segments, [
            'CONDICION', 'TIPO_SUPER', 'SUPERFICIE', 'condicion', 'tipo_super',
            'TIPO_PAVIM', 'PAVIMENTO', 'RECUBRIMIE', 'tipo_pav'
        ])
        
        admin_col = self._find_name_column(matched_segments, [
            'ADMINISTRA', 'TIPO_ADMIN', 'JURISDICCI', 'administra', 'tipo_admin',
            'COMPETENCI', 'TIPO_VIA', 'JERARQUIA', 'jerarquia'
        ])
        
        for idx, segment in matched_segments.iterrows():
            try:
                length_km = segment.geometry.length * 111  # Approximate km
                
                # Surface classification
                if surface_col:
                    surface_val = str(segment.get(surface_col, '')).lower()
                    if any(s in surface_val for s in ['paviment', 'asfalto', 'concreto', 'pavimentad', 'revestid']):
                        surface_stats['pavimentado_km'] += length_km
                    elif any(s in surface_val for s in ['terraceria', 'tierra', 'brecha', 'terr', 'sin pavimento']):
                        surface_stats['terraceria_km'] += length_km
                    else:
                        surface_stats['na_km'] += length_km
                else:
                    surface_stats['na_km'] += length_km
                
                # Admin classification
                if admin_col:
                    admin_val = str(segment.get(admin_col, '')).lower()
                    if any(a in admin_val for a in ['federal', 'federales', 'fed']):
                        admin_stats['federal_km'] += length_km
                    elif any(a in admin_val for a in ['estatal', 'estatales', 'est']):
                        admin_stats['estatal_km'] += length_km
                    elif any(a in admin_val for a in ['municipal', 'municipales', 'mun', 'local']):
                        admin_stats['municipal_km'] += length_km
                    else:
                        admin_stats['na_km'] += length_km
                else:
                    admin_stats['na_km'] += length_km
                    
            except Exception as e:
                pass
        
        # Round values
        for key in surface_stats:
            surface_stats[key] = round(surface_stats[key], 3)
        for key in admin_stats:
            admin_stats[key] = round(admin_stats[key], 3)
        
        return surface_stats, admin_stats
    
    def _find_name_column(self, gdf, possible_names):
        """Find a column from a list of possible names"""
        if gdf is None:
            return None
        
        columns = [c.upper() for c in gdf.columns]
        for name in possible_names:
            if name.upper() in columns:
                idx = columns.index(name.upper())
                return gdf.columns[idx]
        return None
    
    def _find_intersecting_features(self, route_line, gdf, name_col, id_col):
        """Find features that intersect with route"""
        if gdf is None:
            return []
        
        features = []
        route_buffer = route_line.buffer(0.001)  # Small buffer
        
        for idx, feature in gdf.iterrows():
            try:
                if feature.geometry.intersects(route_buffer):
                    name = feature.get(name_col, '') if name_col else ''
                    feature_id = feature.get(id_col, '') if id_col else ''
                    features.append({
                        'nombre': str(name),
                        'clave': str(feature_id)
                    })
            except:
                pass
        
        return features
    
    def _find_nearby_localities(self, route_line, localities_gdf, buffer_distance):
        """Find localities near the route"""
        if localities_gdf is None:
            return {'urbanas': [], 'rurales': [], 'total': []}
        
        buffer_deg = buffer_distance / 111000
        route_buffer = route_line.buffer(buffer_deg)
        
        # Find column names
        name_col = self._find_name_column(localities_gdf, [
            'NOM_LOC', 'NOMBRE', 'NOMGEO', 'nombre', 'name', 'LOCALIDAD'
        ])
        type_col = self._find_name_column(localities_gdf, [
            'AMBITO', 'TIPO', 'TIPO_LOC', 'tipo', 'ambito', 'URBAN_RURA'
        ])
        mun_col = self._find_name_column(localities_gdf, [
            'CVE_MUN', 'CVEGEO', 'NOM_MUN', 'municipio', 'MUNICIPIO'
        ])
        
        urbanas = []
        rurales = []
        total = []
        
        for idx, loc in localities_gdf.iterrows():
            try:
                if loc.geometry.intersects(route_buffer) or loc.geometry.within(route_buffer):
                    name = str(loc.get(name_col, '')) if name_col else f'Localidad {idx}'
                    mun = str(loc.get(mun_col, '')) if mun_col else ''
                    
                    # Determine type
                    loc_type = 'rural'
                    if type_col:
                        type_val = str(loc.get(type_col, '')).lower()
                        if any(u in type_val for u in ['urban', 'urbana', 'u', '1']):
                            loc_type = 'urbana'
                    
                    loc_info = {
                        'nombre': name,
                        'municipio': mun,
                        'tipo': loc_type
                    }
                    
                    total.append(loc_info)
                    if loc_type == 'urbana':
                        urbanas.append(loc_info)
                    else:
                        rurales.append(loc_info)
            except:
                pass
        
        return {
            'urbanas': urbanas,
            'rurales': rurales,
            'total': total
        }
    
    def _save_results(self, route_id, analysis, matched_result, visualization_data=None):
        """Save analysis results to file"""
        results_path = os.path.join(self.results_folder, f'{route_id}_results.json')
        
        # Convert aligned geometry to GeoJSON if available
        aligned_geojson = None
        if matched_result.get('aligned_geometry') is not None:
            try:
                aligned_geojson = {
                    'type': 'Feature',
                    'geometry': matched_result['aligned_geometry'].__geo_interface__,
                    'properties': {
                        'confidence': matched_result.get('confidence', 0),
                        'match_rate_pct': matched_result.get('match_rate_pct', 0)
                    }
                }
            except:
                pass
        
        results = {
            'route_id': route_id,
            'analysis': analysis,
            'aligned_geojson': aligned_geojson,
            'visualization': visualization_data or {},
            'analyzed_at': datetime.now().isoformat()
        }
        
        with open(results_path, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2, default=str)
    
    def get_results(self, route_id):
        """Get analysis results for a route"""
        results_path = os.path.join(self.results_folder, f'{route_id}_results.json')
        
        if not os.path.exists(results_path):
            return None
        
        with open(results_path, 'r', encoding='utf-8') as f:
            return json.load(f)
