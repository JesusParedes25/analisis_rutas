"""
Detecta localidades urbanas/rurales atendidas por la ruta
Usa análisis de red (Dijkstra) para calcular distancia real de caminata
"""
import geopandas as gpd
from shapely.geometry import Point


class LocalityDetector:
    def __init__(self, marco_gdf, municipios_gdf=None, buffer_meters=700, network_analyzer=None):
        """
        Args:
            marco_gdf: GeoDataFrame del Marco Geoestadístico (localidades)
            municipios_gdf: GeoDataFrame de municipios (opcional)
            buffer_meters: Distancia de caminata para considerar atendida (700m por defecto)
            network_analyzer: NetworkAnalyzer para cálculo de distancia por red
        """
        # Asegurar que el marco esté en EPSG:4326
        if marco_gdf.crs != 'EPSG:4326':
            marco_gdf = marco_gdf.to_crs('EPSG:4326')
        
        self.marco_gdf = marco_gdf
        
        # También mantener versión proyectada para análisis de red
        self.marco_gdf_projected = marco_gdf.to_crs(epsg=32614)
        
        # Procesar municipios si se proporcionan
        if municipios_gdf is not None and municipios_gdf.crs != 'EPSG:4326':
            municipios_gdf = municipios_gdf.to_crs('EPSG:4326')
        self.municipios_gdf = municipios_gdf
        
        self.buffer_m = buffer_meters
        # Convertir buffer de metros a grados (aproximación)
        self.buffer_deg = buffer_meters / 111000
        
        # Network analyzer for accurate walking distance
        self.network_analyzer = network_analyzer
    
    def detect(self, gpx_linestring, use_network=True):
        """
        Detecta localidades y municipios que toca la ruta.
        
        Args:
            gpx_linestring: LineString del GPX
            use_network: Usar análisis de red para distancia de caminata
        
        Returns:
            dict con localidades por municipio, municipios_recorridos con detalles
        """
        # Use network-based service area if available
        if use_network and self.network_analyzer and self.network_analyzer.graph:
            return self._detect_with_network(gpx_linestring)
        
        # Fallback: Crear buffer euclidiano alrededor del GPX
        buffered = gpx_linestring.buffer(self.buffer_deg)
        
        # Detectar municipios si están disponibles
        municipios_data = {}
        if self.municipios_gdf is not None:
            municipios_intersect = self.municipios_gdf[
                self.municipios_gdf.geometry.intersects(buffered)
            ]
            
            for idx, row in municipios_intersect.iterrows():
                cve_mun = str(row.get('CVE_MUN', ''))
                municipios_data[cve_mun] = {
                    'cve_mun': cve_mun,
                    'nombre': row.get('NOMGEO', 'Sin nombre'),
                    'cvegeo': row.get('CVEGEO', ''),
                    'localidades_urbanas': [],
                    'localidades_rurales': []
                }
        
        # Encontrar localidades que intersectan el buffer
        intersecting = self.marco_gdf[self.marco_gdf.geometry.intersects(buffered)]
        
        if intersecting.empty and not municipios_data:
            return self._empty_result()
        
        # Procesar localidades
        for idx, row in intersecting.iterrows():
            cve_mun = str(row.get('CVE_MUN', ''))
            ambito = str(row.get('AMBITO', '')).strip()
            
            loc_data = {
                'cvegeo': row.get('CVEGEO', ''),
                'nombre': row.get('NOMGEO', 'Sin nombre'),
                'cve_mun': cve_mun,
                'ambito': ambito
            }
            
            # Si el municipio no está en municipios_data, agregarlo
            if cve_mun and cve_mun not in municipios_data:
                # Buscar nombre del municipio desde el shapefile de municipios o desde localidades
                nombre_mun = f'Municipio {cve_mun}'
                if self.municipios_gdf is not None:
                    mun_row = self.municipios_gdf[self.municipios_gdf['CVE_MUN'] == cve_mun]
                    if not mun_row.empty:
                        nombre_mun = mun_row.iloc[0].get('NOMGEO', nombre_mun)
                
                municipios_data[cve_mun] = {
                    'cve_mun': cve_mun,
                    'nombre': nombre_mun,
                    'cvegeo': '',
                    'localidades_urbanas': [],
                    'localidades_rurales': []
                }
            
            # Agregar localidad al municipio correspondiente
            if cve_mun and cve_mun in municipios_data:
                if ambito == 'Urbana':
                    municipios_data[cve_mun]['localidades_urbanas'].append(loc_data)
                elif ambito == 'Rural':
                    municipios_data[cve_mun]['localidades_rurales'].append(loc_data)
        
        # Convertir a lista ordenada
        municipios_list = sorted(municipios_data.values(), key=lambda x: x['nombre'])
        
        # Contar totales
        total_urbanas = sum(len(m['localidades_urbanas']) for m in municipios_list)
        total_rurales = sum(len(m['localidades_rurales']) for m in municipios_list)
        
        return {
            'municipios': municipios_list,
            'total_municipios': len(municipios_list),
            'total_urbanas': total_urbanas,
            'total_rurales': total_rurales,
            'total_localidades': total_urbanas + total_rurales
        }
    
    def _detect_with_network(self, gpx_linestring):
        """
        Detect localities using network-based walking distance (Dijkstra).
        A locality is considered "attended" if its centroid is within walking distance.
        """
        print(f"Detecting localities with network analysis ({self.buffer_m}m walking distance)...")
        
        # Calculate service area using Dijkstra
        service_area_nodes, node_distances = self.network_analyzer.calculate_service_area(
            gpx_linestring, max_distance=self.buffer_m
        )
        
        if not service_area_nodes:
            print("No service area found, falling back to euclidean buffer")
            buffered = gpx_linestring.buffer(self.buffer_deg)
            return self._detect_euclidean(buffered)
        
        # Get service area polygon
        service_area_polygon = self.network_analyzer.get_service_area_polygon(
            service_area_nodes, buffer_distance=50
        )
        
        if service_area_polygon is None:
            print("Could not create service area polygon, falling back to euclidean")
            buffered = gpx_linestring.buffer(self.buffer_deg)
            return self._detect_euclidean(buffered)
        
        # Find localities whose centroids are within walking distance
        municipios_data = {}
        
        # First, detect municipalities that intersect the service area
        if self.municipios_gdf is not None:
            mun_projected = self.municipios_gdf.to_crs(epsg=32614)
            municipios_intersect = mun_projected[
                mun_projected.geometry.intersects(service_area_polygon)
            ]
            
            for idx, row in municipios_intersect.iterrows():
                cve_mun = str(row.get('CVE_MUN', ''))
                municipios_data[cve_mun] = {
                    'cve_mun': cve_mun,
                    'nombre': row.get('NOMGEO', 'Sin nombre'),
                    'cvegeo': row.get('CVEGEO', ''),
                    'localidades_urbanas': [],
                    'localidades_rurales': []
                }
        
        # Find localities that intersect the service area
        localities_intersect = self.marco_gdf_projected[
            self.marco_gdf_projected.geometry.intersects(service_area_polygon)
        ]
        
        # Filter localities by checking if centroid is actually reachable
        for idx, row in localities_intersect.iterrows():
            centroid = row.geometry.centroid
            is_reachable, dist = self.network_analyzer.is_point_in_service_area(
                (centroid.x, centroid.y),
                service_area_nodes,
                node_distances,
                max_distance=self.buffer_m
            )
            
            if not is_reachable:
                continue
            
            cve_mun = str(row.get('CVE_MUN', ''))
            ambito = str(row.get('AMBITO', '')).strip()
            
            # Get original row for name (from non-projected version)
            original_row = self.marco_gdf.loc[idx] if idx in self.marco_gdf.index else row
            
            loc_data = {
                'cvegeo': original_row.get('CVEGEO', ''),
                'nombre': original_row.get('NOMGEO', 'Sin nombre'),
                'cve_mun': cve_mun,
                'ambito': ambito,
                'distancia_red_m': round(dist, 1)
            }
            
            # Add municipality if not exists
            if cve_mun and cve_mun not in municipios_data:
                nombre_mun = f'Municipio {cve_mun}'
                if self.municipios_gdf is not None:
                    mun_row = self.municipios_gdf[self.municipios_gdf['CVE_MUN'] == cve_mun]
                    if not mun_row.empty:
                        nombre_mun = mun_row.iloc[0].get('NOMGEO', nombre_mun)
                
                municipios_data[cve_mun] = {
                    'cve_mun': cve_mun,
                    'nombre': nombre_mun,
                    'cvegeo': '',
                    'localidades_urbanas': [],
                    'localidades_rurales': []
                }
            
            # Add locality to municipality
            if cve_mun and cve_mun in municipios_data:
                if ambito == 'Urbana':
                    municipios_data[cve_mun]['localidades_urbanas'].append(loc_data)
                elif ambito == 'Rural':
                    municipios_data[cve_mun]['localidades_rurales'].append(loc_data)
        
        # Convert to sorted list
        municipios_list = sorted(municipios_data.values(), key=lambda x: x['nombre'])
        
        total_urbanas = sum(len(m['localidades_urbanas']) for m in municipios_list)
        total_rurales = sum(len(m['localidades_rurales']) for m in municipios_list)
        
        print(f"Network analysis found {total_urbanas} urban and {total_rurales} rural localities")
        
        return {
            'municipios': municipios_list,
            'total_municipios': len(municipios_list),
            'total_urbanas': total_urbanas,
            'total_rurales': total_rurales,
            'total_localidades': total_urbanas + total_rurales,
            'network_analysis': True
        }
    
    def _detect_euclidean(self, buffered):
        """Fallback detection using euclidean buffer"""
        municipios_data = {}
        if self.municipios_gdf is not None:
            municipios_intersect = self.municipios_gdf[
                self.municipios_gdf.geometry.intersects(buffered)
            ]
            
            for idx, row in municipios_intersect.iterrows():
                cve_mun = str(row.get('CVE_MUN', ''))
                municipios_data[cve_mun] = {
                    'cve_mun': cve_mun,
                    'nombre': row.get('NOMGEO', 'Sin nombre'),
                    'cvegeo': row.get('CVEGEO', ''),
                    'localidades_urbanas': [],
                    'localidades_rurales': []
                }
        
        intersecting = self.marco_gdf[self.marco_gdf.geometry.intersects(buffered)]
        
        for idx, row in intersecting.iterrows():
            cve_mun = str(row.get('CVE_MUN', ''))
            ambito = str(row.get('AMBITO', '')).strip()
            
            loc_data = {
                'cvegeo': row.get('CVEGEO', ''),
                'nombre': row.get('NOMGEO', 'Sin nombre'),
                'cve_mun': cve_mun,
                'ambito': ambito
            }
            
            if cve_mun and cve_mun not in municipios_data:
                nombre_mun = f'Municipio {cve_mun}'
                if self.municipios_gdf is not None:
                    mun_row = self.municipios_gdf[self.municipios_gdf['CVE_MUN'] == cve_mun]
                    if not mun_row.empty:
                        nombre_mun = mun_row.iloc[0].get('NOMGEO', nombre_mun)
                
                municipios_data[cve_mun] = {
                    'cve_mun': cve_mun,
                    'nombre': nombre_mun,
                    'cvegeo': '',
                    'localidades_urbanas': [],
                    'localidades_rurales': []
                }
            
            if cve_mun and cve_mun in municipios_data:
                if ambito == 'Urbana':
                    municipios_data[cve_mun]['localidades_urbanas'].append(loc_data)
                elif ambito == 'Rural':
                    municipios_data[cve_mun]['localidades_rurales'].append(loc_data)
        
        municipios_list = sorted(municipios_data.values(), key=lambda x: x['nombre'])
        total_urbanas = sum(len(m['localidades_urbanas']) for m in municipios_list)
        total_rurales = sum(len(m['localidades_rurales']) for m in municipios_list)
        
        return {
            'municipios': municipios_list,
            'total_municipios': len(municipios_list),
            'total_urbanas': total_urbanas,
            'total_rurales': total_rurales,
            'total_localidades': total_urbanas + total_rurales,
            'network_analysis': False
        }
    
    def _empty_result(self):
        return {
            'municipios': [],
            'total_municipios': 0,
            'total_urbanas': 0,
            'total_rurales': 0,
            'total_localidades': 0
        }
