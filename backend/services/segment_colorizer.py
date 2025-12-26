"""
Genera segmentos GeoJSON coloreados según atributos de la RNC
"""
import json


class SegmentColorizer:
    
    @staticmethod
    def colorize_by_surface(matched_segments_gdf):
        """
        Colorea segmentos según superficie (COND_PAV).
        
        Args:
            matched_segments_gdf: GeoDataFrame con segmentos matched de la RNC
        
        Returns:
            GeoJSON FeatureCollection
        """
        color_map = {
            'Con pavimento': '#28a745',  # Verde
            'Sin pavimento': '#fd7e14',  # Naranja
            'N/A': '#6c757d',            # Gris
        }
        
        features = []
        for idx, row in matched_segments_gdf.iterrows():
            superficie = row.get('COND_PAV', 'N/A')
            if not superficie or str(superficie).strip() == '':
                superficie = 'N/A'
            color = color_map.get(str(superficie), '#6c757d')
            
            features.append({
                'type': 'Feature',
                'geometry': json.loads(row.geometry.to_json()) if hasattr(row.geometry, 'to_json') else row.geometry.__geo_interface__,
                'properties': {
                    'superficie': str(superficie),
                    'color': color
                }
            })
        
        return {
            'type': 'FeatureCollection',
            'features': features
        }
    
    @staticmethod
    def colorize_by_administration(matched_segments_gdf):
        """
        Colorea segmentos según tipo de administración (ADMINISTRA).
        
        Args:
            matched_segments_gdf: GeoDataFrame con segmentos matched de la RNC
        
        Returns:
            GeoJSON FeatureCollection
        """
        color_map = {
            'Federal': '#dc3545',    # Rojo
            'Estatal': '#007bff',    # Azul
            'Municipal': '#28a745',  # Verde
            'N/A': '#6c757d',        # Gris
        }
        
        features = []
        for idx, row in matched_segments_gdf.iterrows():
            administracion = row.get('ADMINISTRA', 'N/A')
            if not administracion or str(administracion).strip() == '':
                administracion = 'N/A'
            color = color_map.get(str(administracion), '#6c757d')
            
            features.append({
                'type': 'Feature',
                'geometry': json.loads(row.geometry.to_json()) if hasattr(row.geometry, 'to_json') else row.geometry.__geo_interface__,
                'properties': {
                    'administracion': str(administracion),
                    'color': color
                }
            })
        
        return {
            'type': 'FeatureCollection',
            'features': features
        }
