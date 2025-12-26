"""
Network Analyzer for Service Area Calculation using Dijkstra's Algorithm
Calculates true walking distance on the RNC (Red Nacional de Caminos)
"""

import os
import numpy as np
import geopandas as gpd
import networkx as nx
from shapely.geometry import Point, LineString, MultiLineString
from shapely.ops import unary_union, nearest_points
from scipy.spatial import cKDTree


class NetworkAnalyzer:
    def __init__(self, data_folder):
        self.data_folder = data_folder
        self.graph = None
        self.rnc_gdf = None
        self.node_coords = {}  # node_id -> (x, y)
        self.coord_tree = None  # KDTree for fast nearest node lookup
        self.node_ids = []  # ordered list of node IDs matching tree
        
        self._load_and_build_network()
    
    def _load_and_build_network(self):
        """Load RNC shapefile and build NetworkX graph"""
        rnc_path = os.path.join(self.data_folder, 'shapefiles', 'road_network', 'road_network.shp')
        
        if not os.path.exists(rnc_path):
            print(f"RNC shapefile not found: {rnc_path}")
            return
        
        print("Loading RNC shapefile...")
        self.rnc_gdf = gpd.read_file(rnc_path)
        
        # Project to UTM for accurate distance calculations
        if self.rnc_gdf.crs and self.rnc_gdf.crs.is_geographic:
            self.rnc_gdf = self.rnc_gdf.to_crs(epsg=32614)
        
        print(f"Building network graph from {len(self.rnc_gdf)} road segments...")
        self.graph = nx.Graph()
        
        # Build graph from road segments
        for idx, row in self.rnc_gdf.iterrows():
            node_start = row['UNION_INI']
            node_end = row['UNION_FIN']
            length = row['LONGITUD']  # Already in meters
            
            # Get geometry coordinates for node positions
            geom = row.geometry
            if geom is None:
                continue
                
            if isinstance(geom, MultiLineString):
                coords = list(geom.geoms[0].coords)
            else:
                coords = list(geom.coords)
            
            if len(coords) < 2:
                continue
            
            start_coord = coords[0]
            end_coord = coords[-1]
            
            # Store node coordinates
            if node_start not in self.node_coords:
                self.node_coords[node_start] = start_coord
            if node_end not in self.node_coords:
                self.node_coords[node_end] = end_coord
            
            # Add edge with length as weight
            self.graph.add_edge(node_start, node_end, weight=length, geometry=geom)
        
        print(f"Graph built: {self.graph.number_of_nodes()} nodes, {self.graph.number_of_edges()} edges")
        
        # Build KDTree for fast nearest node lookup
        self._build_spatial_index()
    
    def _build_spatial_index(self):
        """Build KDTree for fast nearest node lookup"""
        self.node_ids = list(self.node_coords.keys())
        coords = [self.node_coords[nid] for nid in self.node_ids]
        self.coord_tree = cKDTree(coords)
        print(f"Spatial index built for {len(self.node_ids)} nodes")
    
    def find_nearest_node(self, point):
        """Find the nearest network node to a point"""
        if self.coord_tree is None:
            return None
        
        if isinstance(point, Point):
            coords = (point.x, point.y)
        else:
            coords = point
        
        dist, idx = self.coord_tree.query(coords)
        return self.node_ids[idx], dist
    
    def find_nearest_nodes_on_route(self, route_geometry, sample_distance=100):
        """
        Find network nodes along a route by sampling points
        
        Args:
            route_geometry: LineString or MultiLineString of the route
            sample_distance: Distance between sample points in meters
        
        Returns:
            List of (node_id, distance_to_node) tuples
        """
        if self.coord_tree is None:
            return []
        
        # Convert route to projected CRS if needed
        if isinstance(route_geometry, (LineString, MultiLineString)):
            route_gdf = gpd.GeoDataFrame(geometry=[route_geometry], crs='EPSG:4326')
            route_projected = route_gdf.to_crs(epsg=32614).geometry[0]
        else:
            route_projected = route_geometry
        
        # Sample points along the route
        if isinstance(route_projected, MultiLineString):
            route_line = unary_union(route_projected)
        else:
            route_line = route_projected
        
        total_length = route_line.length
        num_samples = max(int(total_length / sample_distance), 10)
        
        nodes_found = set()
        for i in range(num_samples + 1):
            fraction = i / num_samples
            point = route_line.interpolate(fraction, normalized=True)
            node_id, dist = self.find_nearest_node((point.x, point.y))
            
            # Only include nodes within reasonable distance (500m) of route
            if dist < 500:
                nodes_found.add(node_id)
        
        return list(nodes_found)
    
    def calculate_service_area(self, route_geometry, max_distance=700):
        """
        Calculate service area using Dijkstra's algorithm
        
        Args:
            route_geometry: LineString or MultiLineString of the route
            max_distance: Maximum walking distance in meters (default 700m)
        
        Returns:
            set of node IDs within the service area
            dict of node_id -> distance from route
        """
        if self.graph is None:
            return set(), {}
        
        # Find nodes on/near the route
        route_nodes = self.find_nearest_nodes_on_route(route_geometry)
        
        if not route_nodes:
            print("No route nodes found on network")
            return set(), {}
        
        print(f"Found {len(route_nodes)} nodes on/near route")
        
        # Use multi-source Dijkstra from all route nodes
        # This finds shortest path from ANY route node to all other nodes
        all_reachable = {}
        
        for source_node in route_nodes:
            if source_node not in self.graph:
                continue
            
            # Single-source Dijkstra with cutoff
            try:
                distances = nx.single_source_dijkstra_path_length(
                    self.graph, 
                    source_node, 
                    cutoff=max_distance,
                    weight='weight'
                )
                
                # Keep minimum distance to each node
                for node, dist in distances.items():
                    if node not in all_reachable or dist < all_reachable[node]:
                        all_reachable[node] = dist
            except nx.NetworkXError:
                continue
        
        service_area_nodes = set(all_reachable.keys())
        print(f"Service area contains {len(service_area_nodes)} nodes within {max_distance}m")
        
        return service_area_nodes, all_reachable
    
    def get_service_area_polygon(self, service_area_nodes, buffer_distance=50):
        """
        Create a polygon representing the service area
        
        Args:
            service_area_nodes: Set of node IDs in the service area
            buffer_distance: Buffer around nodes/edges in meters
        
        Returns:
            Shapely Polygon/MultiPolygon of the service area
        """
        if not service_area_nodes:
            return None
        
        # Collect all edges within the service area
        geometries = []
        
        for u, v, data in self.graph.edges(data=True):
            if u in service_area_nodes and v in service_area_nodes:
                if 'geometry' in data and data['geometry'] is not None:
                    geometries.append(data['geometry'])
        
        # Also add node points
        for node_id in service_area_nodes:
            if node_id in self.node_coords:
                geometries.append(Point(self.node_coords[node_id]))
        
        if not geometries:
            return None
        
        # Merge and buffer
        merged = unary_union(geometries)
        buffered = merged.buffer(buffer_distance)
        
        return buffered
    
    def is_point_in_service_area(self, point, service_area_nodes, node_distances, max_distance=700):
        """
        Check if a point is within the service area
        
        Args:
            point: (x, y) tuple or Point
            service_area_nodes: Set of node IDs in service area
            node_distances: Dict of node_id -> distance from route
            max_distance: Maximum walking distance
        
        Returns:
            bool, distance to nearest service area point
        """
        nearest_node, dist_to_node = self.find_nearest_node(point)
        
        if nearest_node in service_area_nodes:
            # Total distance = distance to network + distance on network
            network_dist = node_distances.get(nearest_node, 0)
            total_dist = dist_to_node + network_dist
            return total_dist <= max_distance, total_dist
        
        return False, float('inf')


# Singleton instance for reuse
_network_analyzer_instance = None

def get_network_analyzer(data_folder):
    """Get or create NetworkAnalyzer singleton"""
    global _network_analyzer_instance
    if _network_analyzer_instance is None:
        _network_analyzer_instance = NetworkAnalyzer(data_folder)
    return _network_analyzer_instance
