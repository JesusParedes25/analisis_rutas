"""Test script to debug analysis services"""
import os
import json
import geopandas as gpd

# Load route
with open('data/routes.json', 'r', encoding='utf-8') as f:
    db = json.load(f)

routes = db.get('routes', [])
print(f"Total routes: {len(routes)}")

if not routes:
    print("No routes found")
    exit()

route = routes[0]
route_id = route.get('id')
print(f"Testing route: {route_id}")

# Test GPX Extractor
gpx_path = f'data/gpx/{route_id}.gpx'
print(f"GPX path: {gpx_path}, exists: {os.path.exists(gpx_path)}")

from services.gpx_extractor import GPXExtractor

with open(gpx_path, 'rb') as f:
    extractor = GPXExtractor(f.read())

metrics = extractor.analyze()
print(f"\n=== GPX Metrics ===")
print(f"Distance: {metrics.get('distancia_km')} km")
print(f"Duration: {metrics.get('duracion_minutos')} min")
print(f"Points: {metrics.get('puntos_totales')}")
print(f"Elevation: {metrics.get('elevacion')}")
print(f"Velocity: {metrics.get('velocidad')}")

linestring = extractor.get_linestring()
print(f"LineString coords: {len(list(linestring.coords))}")
print(f"Bounds: {linestring.bounds}")

# Test Map Matcher
print("\n=== Map Matching ===")
road_path = 'data/shapefiles/road_network/road_network.shp'
if os.path.exists(road_path):
    road_gdf = gpd.read_file(road_path)
    print(f"Road network loaded: {len(road_gdf)} segments")
    
    from services.map_matcher import MapMatcher
    matcher = MapMatcher(linestring, road_gdf, buffer_tolerance_m=50)
    match_result = matcher.match()
    
    print(f"Matched segments: {len(match_result.get('matched_segments', []))}")
    print(f"Confidence: {match_result.get('confidence')}%")
    print(f"Match rate: {match_result.get('match_rate_pct')}%")
    print(f"Unmatched points: {match_result.get('unmatched_points')}")
    
    # Test Road Analyzer
    print("\n=== Road Analysis ===")
    from services.road_analyzer import RoadAnalyzer
    analyzer = RoadAnalyzer(road_gdf)
    road_stats = analyzer.analyze(match_result.get('matched_segments', []), linestring)
    print(f"Superficie: {road_stats.get('superficie')}")
    print(f"Administracion: {road_stats.get('administracion')}")
else:
    print("Road network not found")

# Test Locality Detector
print("\n=== Locality Detection ===")
localities_path = 'data/shapefiles/localities/localities.shp'
municipalities_path = 'data/shapefiles/municipalities/municipalities.shp'

if os.path.exists(localities_path):
    localities_gdf = gpd.read_file(localities_path)
    print(f"Localities loaded: {len(localities_gdf)}")
    print(f"Localities columns: {list(localities_gdf.columns)}")
else:
    localities_gdf = None
    print("Localities not found")

if os.path.exists(municipalities_path):
    municipalities_gdf = gpd.read_file(municipalities_path)
    print(f"Municipalities loaded: {len(municipalities_gdf)}")
    print(f"Municipalities columns: {list(municipalities_gdf.columns)}")
else:
    municipalities_gdf = None
    print("Municipalities not found")

if localities_gdf is not None:
    from services.locality_detector import LocalityDetector
    detector = LocalityDetector(localities_gdf, municipalities_gdf, buffer_meters=500)
    locality_result = detector.detect(linestring)
    
    print(f"Municipios: {locality_result.get('total_municipios')}")
    print(f"Urbanas: {locality_result.get('total_urbanas')}")
    print(f"Rurales: {locality_result.get('total_rurales')}")
    print(f"Total localidades: {locality_result.get('total_localidades')}")
    
    if locality_result.get('municipios'):
        for mun in locality_result['municipios'][:3]:
            print(f"  - {mun.get('nombre')}: {len(mun.get('localidades_urbanas', []))} urbanas, {len(mun.get('localidades_rurales', []))} rurales")

print("\n=== Test Complete ===")
