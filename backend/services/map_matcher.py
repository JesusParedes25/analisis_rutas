"""
Alinea el GPX a la Red Nacional de Caminos usando búsqueda espacial
"""
import geopandas as gpd
from shapely.geometry import LineString, Point
from shapely.ops import nearest_points
import numpy as np


class MapMatcher:
    def __init__(self, gpx_linestring, rnc_gdf, buffer_tolerance_m=50):
        """
        Args:
            gpx_linestring: LineString del GPX (EPSG:4326)
            rnc_gdf: GeoDataFrame de la Red Nacional de Caminos
            buffer_tolerance_m: Distancia máxima para buscar segmentos viales
        """
        self.gpx = gpx_linestring
        
        # Asegurar que el RNC esté en EPSG:4326
        if rnc_gdf.crs != 'EPSG:4326':
            rnc_gdf = rnc_gdf.to_crs('EPSG:4326')
        
        self.rnc_gdf = rnc_gdf
        self.buffer_m = buffer_tolerance_m
        
        # Convertir buffer de metros a grados (aproximación en zona centro de México)
        self.buffer_deg = buffer_tolerance_m / 111000
    
    def match(self):
        """
        Alinea el GPX a la red vial.
        
        Returns:
            dict con:
                - matched_segments: lista de segmentos RNC usados
                - confidence: 0-100 (%)
                - distance_avg_m: distancia promedio al camino
                - unmatched_points: número de puntos sin match
        """
        # Extraer puntos del GPX
        gpx_points = [Point(coord) for coord in self.gpx.coords]
        total_points = len(gpx_points)
        
        matched_segments = []
        distances = []
        unmatched_count = 0
        
        # Crear spatial index para búsquedas rápidas
        sindex = self.rnc_gdf.sindex
        
        for i, point in enumerate(gpx_points):
            # Buscar segmentos candidatos cercanos
            buffer_geom = point.buffer(self.buffer_deg)
            possible_matches_idx = list(sindex.intersection(buffer_geom.bounds))
            
            if not possible_matches_idx:
                unmatched_count += 1
                continue
            
            # De los candidatos, encontrar el más cercano
            candidates = self.rnc_gdf.iloc[possible_matches_idx]
            
            min_dist = float('inf')
            best_match = None
            
            for idx, row in candidates.iterrows():
                dist = point.distance(row.geometry)
                if dist < min_dist:
                    min_dist = dist
                    best_match = idx
            
            # Convertir distancia de grados a metros (aproximado)
            dist_m = min_dist * 111000
            
            if dist_m <= self.buffer_m and best_match is not None:
                matched_segments.append({
                    'index': best_match,
                    'distance_m': dist_m,
                    'orden': i
                })
                distances.append(dist_m)
            else:
                unmatched_count += 1
        
        # Calcular métricas de confianza
        if distances:
            distance_avg_m = np.mean(distances)
            confidence = max(0, 100 - (distance_avg_m / self.buffer_m * 100))
        else:
            distance_avg_m = None
            confidence = 0
        
        # Generar geometría alineada
        aligned_linestring = self._build_aligned_geometry(matched_segments)
        
        return {
            'matched_segments': matched_segments,
            'aligned_geometry': aligned_linestring,
            'confidence': round(confidence, 1),
            'distance_avg_m': round(distance_avg_m, 1) if distance_avg_m else None,
            'unmatched_points': unmatched_count,
            'total_points': total_points,
            'match_rate_pct': round((1 - unmatched_count / total_points) * 100, 1) if total_points > 0 else 0
        }
    
    def _build_aligned_geometry(self, matched_segments):
        """
        Construye una geometría LineString alineada simplificada.
        Toma puntos snapeados a la red vial.
        """
        if not matched_segments:
            return self.gpx
        
        # Obtener puntos del GPX original
        gpx_points = [Point(coord) for coord in self.gpx.coords]
        
        # Para cada punto del GPX, encontrar el punto más cercano en el segmento matcheado
        aligned_coords = []
        
        for seg_info in matched_segments:
            idx = seg_info['index']
            orden = seg_info['orden']
            
            if orden >= len(gpx_points):
                continue
                
            gpx_point = gpx_points[orden]
            segment_geom = self.rnc_gdf.loc[idx, 'geometry']
            
            # Proyectar el punto GPX sobre el segmento de carretera
            try:
                # Encontrar el punto más cercano en el segmento
                if segment_geom.geom_type == 'LineString':
                    distance = gpx_point.distance(segment_geom)
                    closest_point = segment_geom.interpolate(segment_geom.project(gpx_point))
                    aligned_coords.append(closest_point.coords[0])
                elif segment_geom.geom_type == 'MultiLineString':
                    min_dist = float('inf')
                    best_point = None
                    for line in segment_geom.geoms:
                        dist = gpx_point.distance(line)
                        if dist < min_dist:
                            min_dist = dist
                            best_point = line.interpolate(line.project(gpx_point))
                    if best_point:
                        aligned_coords.append(best_point.coords[0])
            except:
                # Si hay error, usar el punto original
                aligned_coords.append(gpx_point.coords[0])
        
        if len(aligned_coords) < 2:
            return self.gpx
        
        # Eliminar duplicados consecutivos
        unique_coords = [aligned_coords[0]]
        for coord in aligned_coords[1:]:
            if coord != unique_coords[-1]:
                unique_coords.append(coord)
        
        if len(unique_coords) < 2:
            return self.gpx
        
        return LineString(unique_coords)
