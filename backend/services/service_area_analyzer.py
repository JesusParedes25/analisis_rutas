import geopandas as gpd
import pandas as pd
from shapely.geometry import LineString, MultiLineString, Point
from shapely.ops import unary_union
import os

from .network_analyzer import get_network_analyzer

class ServiceAreaAnalyzer:
    """Analyzes service area coverage using road network and Dijkstra algorithm"""
    
    def __init__(self, data_folder):
        self.data_folder = data_folder
        self.manzanas_gdf = None
        self.rnc_gdf = None
        self.municipios_gdf = None
        self.network_analyzer = None
        self._load_data()
        
        # Initialize network analyzer
        try:
            self.network_analyzer = get_network_analyzer(data_folder)
        except Exception as e:
            print(f"Warning: Could not initialize network analyzer: {e}")
    
    def _load_data(self):
        """Load manzanas and RNC shapefiles"""
        manzanas_path = os.path.join(self.data_folder, 'shapefiles', 'manzanas', 'manzanas.shp')
        rnc_path = os.path.join(self.data_folder, 'shapefiles', 'road_network', 'road_network.shp')
        
        if os.path.exists(manzanas_path):
            try:
                self.manzanas_gdf = gpd.read_file(manzanas_path)
                # Ensure projected CRS for distance calculations
                if self.manzanas_gdf.crs and self.manzanas_gdf.crs.is_geographic:
                    self.manzanas_gdf = self.manzanas_gdf.to_crs(epsg=32614)  # UTM zone 14N for Mexico
            except Exception as e:
                print(f"Error loading manzanas: {e}")
        
        if os.path.exists(rnc_path):
            try:
                self.rnc_gdf = gpd.read_file(rnc_path)
                if self.rnc_gdf.crs and self.rnc_gdf.crs.is_geographic:
                    self.rnc_gdf = self.rnc_gdf.to_crs(epsg=32614)
            except Exception as e:
                print(f"Error loading RNC: {e}")
        
        # Load municipios shapefile for filtering
        municipios_path = os.path.join(self.data_folder, 'shapefiles', 'municipalities', 'municipalities.shp')
        if os.path.exists(municipios_path):
            try:
                self.municipios_gdf = gpd.read_file(municipios_path)
                if self.municipios_gdf.crs and self.municipios_gdf.crs.is_geographic:
                    self.municipios_gdf = self.municipios_gdf.to_crs(epsg=32614)
            except Exception as e:
                print(f"Error loading municipios: {e}")
    
    def analyze(self, route_geometry, buffer_distance_m=700, municipio_name=None, use_network=True):
        """
        Analyze service area for a route using network-based walking distance.
        
        Args:
            route_geometry: LineString or MultiLineString of the route
            buffer_distance_m: Walking distance buffer in meters (default 700m)
            municipio_name: Optional municipality name to filter manzanas
            use_network: Use network analysis (Dijkstra) for accurate walking distance
        
        Returns:
            dict with population statistics and visualization data
        """
        if self.manzanas_gdf is None:
            return self._empty_result("Manzanas shapefile not loaded")
        
        try:
            # Convert route to projected CRS
            route_gdf = gpd.GeoDataFrame(geometry=[route_geometry], crs='EPSG:4326')
            route_projected = route_gdf.to_crs(epsg=32614).geometry[0]
            
            # Use network-based service area calculation if available
            if use_network and self.network_analyzer and self.network_analyzer.graph:
                manzanas_in_buffer = self._analyze_with_network(
                    route_geometry, route_projected, buffer_distance_m
                )
            else:
                # Fallback to euclidean buffer
                print("Using euclidean buffer (network analyzer not available)")
                route_buffer = route_projected.buffer(buffer_distance_m)
                manzanas_in_buffer = self.manzanas_gdf[self.manzanas_gdf.intersects(route_buffer)].copy()
            
            # Filter by municipality if specified
            if municipio_name and self.municipios_gdf is not None:
                municipio_geom = self._get_municipio_geometry(municipio_name)
                if municipio_geom is not None:
                    manzanas_in_buffer = manzanas_in_buffer[manzanas_in_buffer.intersects(municipio_geom)]
            
            if len(manzanas_in_buffer) == 0:
                return self._empty_result("No manzanas found within service area")
            
            # Aggregate population statistics for SERVED area
            stats = self._aggregate_population(manzanas_in_buffer)
            stats['manzanas_count'] = len(manzanas_in_buffer)
            stats['buffer_distance_m'] = buffer_distance_m
            stats['network_analysis'] = use_network and self.network_analyzer is not None
            
            # Calculate UNSERVED population in the municipality
            unserved_stats = None
            unserved_manzanas_gdf = None
            if municipio_name and self.municipios_gdf is not None:
                municipio_geom = self._get_municipio_geometry(municipio_name)
                if municipio_geom is not None:
                    # Get all manzanas in the municipality
                    all_manzanas_in_municipio = self.manzanas_gdf[
                        self.manzanas_gdf.intersects(municipio_geom)
                    ].copy()
                    
                    # Get unserved manzanas (in municipality but NOT in service area)
                    served_indices = set(manzanas_in_buffer.index)
                    unserved_manzanas_gdf = all_manzanas_in_municipio[
                        ~all_manzanas_in_municipio.index.isin(served_indices)
                    ].copy()
                    
                    if len(unserved_manzanas_gdf) > 0:
                        unserved_stats = self._aggregate_population(unserved_manzanas_gdf)
                        unserved_stats['manzanas_count'] = len(unserved_manzanas_gdf)
                    else:
                        unserved_stats = self._empty_stats()
                        unserved_stats['manzanas_count'] = 0
                    
                    # Total municipality stats
                    total_stats = self._aggregate_population(all_manzanas_in_municipio)
                    total_stats['manzanas_count'] = len(all_manzanas_in_municipio)
                    stats['municipio_total'] = total_stats
            
            return {
                'success': True,
                'stats': stats,
                'unserved_stats': unserved_stats,
                'unserved_manzanas_gdf': unserved_manzanas_gdf,
                'served_manzanas_gdf': manzanas_in_buffer
            }
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return self._empty_result(str(e))
    
    def _analyze_with_network(self, route_geometry, route_projected, buffer_distance_m):
        """
        Analyze service area using network-based Dijkstra algorithm.
        Finds manzanas whose centroids are within walking distance on the road network.
        Also includes manzanas that the route directly passes through.
        """
        print(f"Calculating network-based service area ({buffer_distance_m}m walking distance)...")
        
        # FIRST: Get manzanas that the route DIRECTLY intersects (always served)
        # Use a small buffer around the route to catch manzanas the route passes through
        route_direct_buffer = route_projected.buffer(50)  # 50m buffer around route
        manzanas_direct = self.manzanas_gdf[
            self.manzanas_gdf.intersects(route_direct_buffer)
        ].copy()
        direct_indices = set(manzanas_direct.index)
        print(f"Route directly passes through {len(direct_indices)} manzanas")
        
        # Calculate service area nodes using Dijkstra
        service_area_nodes, node_distances = self.network_analyzer.calculate_service_area(
            route_geometry, max_distance=buffer_distance_m
        )
        
        if not service_area_nodes:
            print("No service area nodes found, using only direct intersection")
            return manzanas_direct
        
        # Get service area polygon
        service_area_polygon = self.network_analyzer.get_service_area_polygon(
            service_area_nodes, buffer_distance=50
        )
        
        if service_area_polygon is None:
            print("Could not create service area polygon, using only direct intersection")
            return manzanas_direct
        
        # Find manzanas that intersect with the network-based service area
        manzanas_in_service_area = self.manzanas_gdf[
            self.manzanas_gdf.intersects(service_area_polygon)
        ].copy()
        
        # Filter by centroid reachability, but ALWAYS include direct intersection manzanas
        filtered_indices = set(direct_indices)  # Start with direct intersections
        
        for idx, row in manzanas_in_service_area.iterrows():
            if idx in direct_indices:
                continue  # Already included
            centroid = row.geometry.centroid
            is_reachable, dist = self.network_analyzer.is_point_in_service_area(
                (centroid.x, centroid.y), 
                service_area_nodes, 
                node_distances,
                max_distance=buffer_distance_m
            )
            if is_reachable:
                filtered_indices.add(idx)
        
        result = self.manzanas_gdf.loc[list(filtered_indices)].copy()
        print(f"Network analysis found {len(result)} manzanas ({len(direct_indices)} direct + {len(result) - len(direct_indices)} network)")
        
        return result
    
    def _aggregate_population(self, manzanas_gdf):
        """Aggregate population statistics from manzanas"""
        # Get actual column names by index (more reliable than garbled names)
        cols = list(manzanas_gdf.columns)
        
        # Column indices based on census manzanas structure:
        # 6: Poblacion total, 7: Pob femenina, 9: Pob masculina
        # 11: 0-14, 13: 15-29, 15: 30-59, 17: 60+, 19: discapacidad
        col_mapping = {
            'poblacion_total': cols[6] if len(cols) > 6 else None,
            'poblacion_fem': cols[7] if len(cols) > 7 else None,
            'poblacion_masc': cols[9] if len(cols) > 9 else None,
            'pob_0_14': cols[11] if len(cols) > 11 else None,
            'pob_15_29': cols[13] if len(cols) > 13 else None,
            'pob_30_59': cols[15] if len(cols) > 15 else None,
            'pob_60_mas': cols[17] if len(cols) > 17 else None,
            'pob_discapacidad': cols[19] if len(cols) > 19 else None,
        }
        
        stats = {
            'poblacion_total': 0,
            'poblacion_femenina': 0,
            'poblacion_masculina': 0,
            'piramide_poblacional': {
                '0-14': {'total': 0, 'label': '0-14 años'},
                '15-29': {'total': 0, 'label': '15-29 años'},
                '30-59': {'total': 0, 'label': '30-59 años'},
                '60+': {'total': 0, 'label': '60 años y más'}
            },
            'discapacidad': {
                'total': 0,
                'porcentaje': 0
            }
        }
        
        # Helper to convert value to int
        def to_int(val):
            if val is None or val == '*' or val == '':
                return 0
            try:
                return int(float(str(val).replace(',', '')))
            except:
                return 0
        
        # Aggregate each column
        for _, row in manzanas_gdf.iterrows():
            # Total population
            if col_mapping['poblacion_total'] in row.index:
                stats['poblacion_total'] += to_int(row[col_mapping['poblacion_total']])
            
            # By gender
            if col_mapping['poblacion_fem'] in row.index:
                stats['poblacion_femenina'] += to_int(row[col_mapping['poblacion_fem']])
            if col_mapping['poblacion_masc'] in row.index:
                stats['poblacion_masculina'] += to_int(row[col_mapping['poblacion_masc']])
            
            # Age groups
            if col_mapping['pob_0_14'] in row.index:
                stats['piramide_poblacional']['0-14']['total'] += to_int(row[col_mapping['pob_0_14']])
            if col_mapping['pob_15_29'] in row.index:
                stats['piramide_poblacional']['15-29']['total'] += to_int(row[col_mapping['pob_15_29']])
            if col_mapping['pob_30_59'] in row.index:
                stats['piramide_poblacional']['30-59']['total'] += to_int(row[col_mapping['pob_30_59']])
            if col_mapping['pob_60_mas'] in row.index:
                stats['piramide_poblacional']['60+']['total'] += to_int(row[col_mapping['pob_60_mas']])
            
            # Disability
            if col_mapping['pob_discapacidad'] in row.index:
                stats['discapacidad']['total'] += to_int(row[col_mapping['pob_discapacidad']])
        
        # Calculate disability percentage
        if stats['poblacion_total'] > 0:
            stats['discapacidad']['porcentaje'] = round(
                stats['discapacidad']['total'] / stats['poblacion_total'] * 100, 2
            )
        
        return stats
    
    def _get_municipio_geometry(self, municipio_name):
        """Get the geometry of a municipality by name"""
        if self.municipios_gdf is None:
            return None
        
        # Try different column names for municipality name
        name_columns = ['NOMGEO', 'NOM_MUN', 'NOMBRE', 'NAME', 'nombre', 'name']
        
        for col in name_columns:
            if col in self.municipios_gdf.columns:
                # Case-insensitive match
                matches = self.municipios_gdf[
                    self.municipios_gdf[col].str.upper() == municipio_name.upper()
                ]
                if len(matches) > 0:
                    return matches.geometry.unary_union
        
        return None
    
    def _empty_stats(self):
        """Return empty stats structure"""
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
            'discapacidad': {
                'total': 0,
                'porcentaje': 0
            }
        }
    
    def _empty_result(self, error_msg):
        """Return empty result structure"""
        return {
            'success': False,
            'error': error_msg,
            'stats': self._empty_stats(),
            'unserved_stats': None
        }
