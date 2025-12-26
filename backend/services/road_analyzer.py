"""
Analiza atributos de la Red Nacional de Caminos (superficie, administración, tipo)
"""
from collections import defaultdict
import pandas as pd


class RoadAnalyzer:
    def __init__(self, rnc_gdf):
        """
        Args:
            rnc_gdf: GeoDataFrame de la Red Nacional de Caminos
        """
        # Asegurar que el RNC esté en EPSG:4326
        if rnc_gdf.crs != 'EPSG:4326':
            rnc_gdf = rnc_gdf.to_crs('EPSG:4326')
            
        self.rnc_gdf = rnc_gdf
    
    def analyze(self, matched_segments, gpx_linestring):
        """
        Cruza segmentos matcheados con atributos de RNC.
        Calcula distancia basada en los segmentos RNC alineados.
        
        Args:
            matched_segments: lista de segmentos del map matching
            gpx_linestring: geometría original del GPX
        
        Returns:
            dict con kilometrajes por categoría basados en distancia RNC
        """
        # Obtener índices únicos de segmentos usados
        unique_indices = list(set([s['index'] for s in matched_segments]))
        
        if not unique_indices:
            return self._empty_stats()
        
        # Contar uso de cada segmento
        segment_usage = defaultdict(int)
        for seg in matched_segments:
            segment_usage[seg['index']] += 1
        
        total_points = len(matched_segments)
        
        # Contadores
        superficie = defaultdict(float)
        administracion = defaultdict(float)
        tipo_vialidad = defaultdict(float)
        
        # Contadores de N/A para tracking
        na_superficie_km = 0
        na_administracion_km = 0
        
        # Primero calcular la distancia total RNC (suma de longitudes de segmentos únicos)
        distancia_rnc_km = 0
        segment_lengths = {}
        
        for idx in segment_usage.keys():
            row = self.rnc_gdf.loc[idx]
            # Longitud real del segmento RNC en km
            segment_length_km = row.geometry.length * 111  # Aproximación grados a km
            segment_lengths[idx] = segment_length_km
            distancia_rnc_km += segment_length_km
        
        # Ahora distribuir proporcionalmente según longitud de cada segmento
        for idx, count in segment_usage.items():
            row = self.rnc_gdf.loc[idx]
            segment_length_km = segment_lengths[idx]
            
            # Proporción basada en longitud del segmento respecto al total RNC
            km_segmento = segment_length_km
            
            # Superficie - N/A se suma a "Con pavimento", solo "Sin pavimento" es terracería
            sup = row.get('COND_PAV', 'N/A')
            if not sup or pd.isna(sup) or str(sup).strip() in ['N/A', 'n/a', '']:
                na_superficie_km += km_segmento
                sup = 'Con pavimento'  # N/A se asigna a Pavimentado
            superficie[str(sup)] += km_segmento
            
            # Administración (N/A se suma a "Municipal")
            admin = row.get('ADMINISTRA', 'N/A')
            if not admin or pd.isna(admin) or str(admin).strip() in ['N/A', 'n/a', '']:
                na_administracion_km += km_segmento
                admin = 'Municipal'  # Reasignar a Municipal
            administracion[str(admin)] += km_segmento
            
            # Tipo de vialidad
            tipo = row.get('TIPO_VIAL', 'N/A')
            if not tipo or pd.isna(tipo):
                tipo = 'N/A'
            tipo_vialidad[str(tipo)] += km_segmento
        
        return {
            'distancia_rnc_km': round(distancia_rnc_km, 3),
            'superficie': {k: round(v, 3) for k, v in superficie.items()},
            'administracion': {k: round(v, 3) for k, v in administracion.items()},
            'tipo_vialidad': {k: round(v, 3) for k, v in tipo_vialidad.items()},
            'na_info': {
                'superficie_na_km': round(na_superficie_km, 3),
                'administracion_na_km': round(na_administracion_km, 3)
            }
        }
    
    def _normalizar_superficie(self, valor):
        """Normaliza valores de COND_PAV."""
        if not valor or pd.isna(valor):
            return 'desconocido'
        valor_str = str(valor).lower()
        if 'pavimento' in valor_str or 'con' in valor_str:
            return 'pavimentado'
        elif 'sin' in valor_str:
            return 'sin_pavimento'
        else:
            return 'desconocido'
    
    def _normalizar_administracion(self, valor):
        """Normaliza valores de ADMINISTRA."""
        if not valor or pd.isna(valor) or valor in ['N/A', 'N/D']:
            return 'desconocido'
        valor_str = str(valor).lower()
        if 'federal' in valor_str:
            return 'federal'
        elif 'estatal' in valor_str:
            return 'estatal'
        elif 'municipal' in valor_str:
            return 'municipal'
        else:
            return 'desconocido'
    
    def _empty_stats(self):
        return {
            'superficie': {},
            'administracion': {},
            'tipo_vialidad': {},
            'na_info': {
                'superficie_na_km': 0,
                'administracion_na_km': 0
            }
        }
