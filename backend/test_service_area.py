import sys
sys.path.insert(0, '.')

from services.service_area_analyzer import ServiceAreaAnalyzer
from services.gpx_extractor import GPXExtractor
from shapely.ops import unary_union
import json
import os
import time

data_folder = 'data'

print("=" * 60)
print("TESTING NETWORK-BASED SERVICE AREA ANALYSIS")
print("=" * 60)

# Initialize analyzer (this builds the network graph)
print("\nInitializing ServiceAreaAnalyzer with NetworkX graph...")
start = time.time()
analyzer = ServiceAreaAnalyzer(data_folder)
print(f"Initialization took {time.time() - start:.2f} seconds")

# Check if network analyzer is available
if analyzer.network_analyzer:
    print(f"Network graph: {analyzer.network_analyzer.graph.number_of_nodes()} nodes, {analyzer.network_analyzer.graph.number_of_edges()} edges")
else:
    print("WARNING: Network analyzer not available!")

# Load a single route for testing
with open('data/routes.json', 'r', encoding='utf-8') as f:
    routes_data = json.load(f)

route = routes_data['routes'][0]
print(f"\nTesting with route: {route['nombre']}")

gpx_path = f"data/gpx/{route['id']}.gpx"
with open(gpx_path, 'rb') as f:
    gpx_bytes = f.read()

extractor = GPXExtractor(gpx_bytes)
extractor.analyze()
linestring = extractor.get_linestring()

# Test with NETWORK analysis
print("\n" + "-" * 40)
print("NETWORK-BASED ANALYSIS (Dijkstra)")
print("-" * 40)
start = time.time()
result_network = analyzer.analyze(linestring, buffer_distance_m=700, use_network=True)
print(f"Network analysis took {time.time() - start:.2f} seconds")
print(f"  Success: {result_network.get('success')}")
print(f"  Manzanas: {result_network.get('stats', {}).get('manzanas_count')}")
print(f"  Poblacion: {result_network.get('stats', {}).get('poblacion_total')}")
print(f"  Network used: {result_network.get('stats', {}).get('network_analysis')}")

# Test with EUCLIDEAN buffer (for comparison)
print("\n" + "-" * 40)
print("EUCLIDEAN BUFFER ANALYSIS (for comparison)")
print("-" * 40)
start = time.time()
result_euclidean = analyzer.analyze(linestring, buffer_distance_m=700, use_network=False)
print(f"Euclidean analysis took {time.time() - start:.2f} seconds")
print(f"  Success: {result_euclidean.get('success')}")
print(f"  Manzanas: {result_euclidean.get('stats', {}).get('manzanas_count')}")
print(f"  Poblacion: {result_euclidean.get('stats', {}).get('poblacion_total')}")

# Comparison
print("\n" + "=" * 60)
print("COMPARISON")
print("=" * 60)
net_manz = result_network.get('stats', {}).get('manzanas_count', 0)
euc_manz = result_euclidean.get('stats', {}).get('manzanas_count', 0)
net_pob = result_network.get('stats', {}).get('poblacion_total', 0)
euc_pob = result_euclidean.get('stats', {}).get('poblacion_total', 0)

print(f"Manzanas - Network: {net_manz}, Euclidean: {euc_manz}, Diff: {euc_manz - net_manz}")
print(f"Poblacion - Network: {net_pob}, Euclidean: {euc_pob}, Diff: {euc_pob - net_pob}")
