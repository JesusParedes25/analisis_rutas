"""
Extrae métricas avanzadas del GPX: elevación, velocidad, pendientes, duración
"""
import gpxpy
import io
from math import radians, cos, sin, asin, sqrt
from datetime import timedelta


class GPXExtractor:
    def __init__(self, gpx_file_or_bytes):
        """
        Args:
            gpx_file_or_bytes: Archivo GPX o bytes
        """
        if isinstance(gpx_file_or_bytes, bytes):
            self.gpx = gpxpy.parse(io.BytesIO(gpx_file_or_bytes))
        else:
            self.gpx = gpxpy.parse(gpx_file_or_bytes)
        
        self.track_points = self._extract_points()
    
    def analyze(self):
        """Retorna diccionario con todas las métricas."""
        if not self.track_points or len(self.track_points) < 2:
            return self._empty_metrics()
        
        return {
            "duracion_minutos": self._calcular_duracion(),
            "distancia_km": self._calcular_distancia(),
            "elevacion": self._analizar_elevacion(),
            "inclinacion": self._analizar_inclinacion(),
            "velocidad": self._analizar_velocidad(),
            "puntos_totales": len(self.track_points),
        }
    
    def _extract_points(self):
        """Extrae lista de puntos con (lon, lat, ele, time)."""
        points = []
        for track in self.gpx.tracks:
            for segment in track.segments:
                for point in segment.points:
                    if point.longitude and point.latitude:
                        points.append({
                            'lon': point.longitude,
                            'lat': point.latitude,
                            'ele': point.elevation if point.elevation else None,
                            'time': point.time,
                        })
        return points
    
    def _calcular_duracion(self):
        """Calcula duración en minutos."""
        times = [p['time'] for p in self.track_points if p['time']]
        if len(times) >= 2:
            delta = times[-1] - times[0]
            return int(delta.total_seconds() / 60)
        return None
    
    def _calcular_distancia(self):
        """Calcula distancia total en km usando fórmula de Haversine."""
        total_km = 0
        for i in range(len(self.track_points) - 1):
            p1 = self.track_points[i]
            p2 = self.track_points[i + 1]
            total_km += self._haversine(p1['lat'], p1['lon'], p2['lat'], p2['lon'])
        return round(total_km, 3)
    
    def _haversine(self, lat1, lon1, lat2, lon2):
        """Calcula distancia en km entre dos coordenadas."""
        R = 6371  # Radio de la Tierra en km
        dlat = radians(lat2 - lat1)
        dlon = radians(lon2 - lon1)
        a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
        c = 2 * asin(sqrt(a))
        return R * c
    
    def _analizar_elevacion(self):
        """Analiza métricas de elevación."""
        elevaciones = [p['ele'] for p in self.track_points if p['ele'] is not None]
        if not elevaciones:
            return {"minima_m": None, "maxima_m": None, "ganancia_m": None, "perdida_m": None}
        
        # Calcular ganancia y pérdida acumulada
        ganancia = 0
        perdida = 0
        for i in range(len(elevaciones) - 1):
            diff = elevaciones[i + 1] - elevaciones[i]
            if diff > 1:  # Umbral para filtrar ruido GPS
                ganancia += diff
            elif diff < -1:
                perdida += abs(diff)
        
        return {
            "minima_m": round(min(elevaciones), 1),
            "maxima_m": round(max(elevaciones), 1),
            "ganancia_m": round(ganancia, 1),
            "perdida_m": round(perdida, 1),
        }
    
    def _analizar_inclinacion(self):
        """Analiza pendientes (%) positivas y negativas."""
        pendientes_pos = []
        pendientes_neg = []
        
        for i in range(len(self.track_points) - 1):
            p1 = self.track_points[i]
            p2 = self.track_points[i + 1]
            
            if p1['ele'] is None or p2['ele'] is None:
                continue
            
            # Distancia horizontal en metros
            dist_m = self._haversine(p1['lat'], p1['lon'], p2['lat'], p2['lon']) * 1000
            if dist_m < 5:  # Filtrar segmentos muy cortos (< 5m) para evitar errores GPS
                continue
            
            # Cambio de elevación
            delta_ele = p2['ele'] - p1['ele']
            pendiente_pct = (delta_ele / dist_m) * 100
            
            # Filtrar pendientes anómalas (probablemente errores GPS)
            if abs(pendiente_pct) > 25:  # Límite máximo razonable ~25%
                continue
            
            if pendiente_pct > 0.5:
                pendientes_pos.append(pendiente_pct)
            elif pendiente_pct < -0.5:
                pendientes_neg.append(pendiente_pct)
        
        return {
            "promedio_positiva_pct": round(sum(pendientes_pos) / len(pendientes_pos), 2) if pendientes_pos else None,
            "promedio_negativa_pct": round(sum(pendientes_neg) / len(pendientes_neg), 2) if pendientes_neg else None,
            "maxima_pct": round(max(pendientes_pos + [abs(x) for x in pendientes_neg], default=0), 2),
        }
    
    def _analizar_velocidad(self):
        """Analiza velocidades (km/h)."""
        velocidades = []
        
        for i in range(len(self.track_points) - 1):
            p1 = self.track_points[i]
            p2 = self.track_points[i + 1]
            
            if not p1['time'] or not p2['time']:
                continue
            
            # Distancia en km
            dist_km = self._haversine(p1['lat'], p1['lon'], p2['lat'], p2['lon'])
            
            # Tiempo en horas
            delta_time = (p2['time'] - p1['time']).total_seconds() / 3600
            if delta_time < 0.0001:  # Evitar divisiones por cero
                continue
            
            velocidad_kmh = dist_km / delta_time
            
            # Filtrar velocidades cero o anómalas (paradas en semáforos, pasajeros, etc.)
            # Solo considerar velocidades reales de movimiento (> 0.5 km/h)
            if velocidad_kmh > 0.5 and velocidad_kmh < 150:
                velocidades.append(velocidad_kmh)
        
        if not velocidades:
            return {"promedio_kmh": None, "maxima_kmh": None}
        
        return {
            "promedio_kmh": round(sum(velocidades) / len(velocidades), 1),
            "maxima_kmh": round(max(velocidades), 1),
        }
    
    def _empty_metrics(self):
        """Retorna métricas vacías."""
        return {
            "duracion_minutos": None,
            "distancia_km": None,
            "elevacion": {
                "minima_m": None,
                "maxima_m": None,
                "ganancia_m": None,
                "perdida_m": None
            },
            "inclinacion": {
                "promedio_positiva_pct": None,
                "promedio_negativa_pct": None,
                "maxima_pct": None
            },
            "velocidad": {
                "promedio_kmh": None,
                "maxima_kmh": None
            },
            "puntos_totales": 0,
        }
    
    def get_linestring(self):
        """Retorna una geometría LineString de Shapely con los puntos del GPX."""
        from shapely.geometry import LineString
        
        if not self.track_points or len(self.track_points) < 2:
            return None
        
        coords = [(p['lon'], p['lat']) for p in self.track_points]
        return LineString(coords)
    
    def get_high_slope_points(self, threshold_pct=20):
        """
        Detecta puntos con pendientes altas (> threshold_pct).
        Retorna lista de GeoJSON features con pendiente > umbral.
        """
        high_slopes = []
        
        for i in range(len(self.track_points) - 1):
            p1 = self.track_points[i]
            p2 = self.track_points[i + 1]
            
            if p1['ele'] is None or p2['ele'] is None:
                continue
            
            dist_m = self._haversine(p1['lat'], p1['lon'], p2['lat'], p2['lon']) * 1000
            if dist_m < 5:
                continue
            
            delta_ele = p2['ele'] - p1['ele']
            pendiente_pct = abs((delta_ele / dist_m) * 100)
            
            if pendiente_pct > 25:
                continue
            
            if pendiente_pct >= threshold_pct:
                tipo = "subida" if delta_ele > 0 else "bajada"
                high_slopes.append({
                    'type': 'Feature',
                    'geometry': {
                        'type': 'Point',
                        'coordinates': [p1['lon'], p1['lat']]
                    },
                    'properties': {
                        'pendiente_pct': round(pendiente_pct, 1),
                        'tipo': tipo,
                        'elevacion_m': round(p1['ele'], 1)
                    }
                })
        
        return high_slopes
    
    def get_colored_segments_by_slope(self):
        """
        Genera segmentos de línea coloreados según pendiente.
        Retorna GeoJSON FeatureCollection con segmentos y propiedades de color.
        """
        segments = []
        
        for i in range(len(self.track_points) - 1):
            p1 = self.track_points[i]
            p2 = self.track_points[i + 1]
            
            if p1['ele'] is None or p2['ele'] is None:
                pendiente_pct = 0
            else:
                dist_m = self._haversine(p1['lat'], p1['lon'], p2['lat'], p2['lon']) * 1000
                if dist_m < 5:
                    pendiente_pct = 0
                else:
                    delta_ele = p2['ele'] - p1['ele']
                    pendiente_pct = (delta_ele / dist_m) * 100
                    
                    if abs(pendiente_pct) > 25:
                        pendiente_pct = 0
            
            # Clasificar pendiente y asignar color
            if abs(pendiente_pct) < 2:
                color = '#28a745'  # Verde: plano
                categoria = 'Plano (< 2%)'
            elif abs(pendiente_pct) < 5:
                color = '#ffc107'  # Amarillo: moderado
                categoria = 'Moderado (2-5%)'
            elif abs(pendiente_pct) < 10:
                color = '#fd7e14'  # Naranja: pronunciado
                categoria = 'Pronunciado (5-10%)'
            else:
                color = '#dc3545'  # Rojo: muy pronunciado
                categoria = 'Muy Pronunciado (>10%)'
            
            segments.append({
                'type': 'Feature',
                'geometry': {
                    'type': 'LineString',
                    'coordinates': [[p1['lon'], p1['lat']], [p2['lon'], p2['lat']]]
                },
                'properties': {
                    'pendiente_pct': round(pendiente_pct, 2),
                    'color': color,
                    'categoria': categoria
                }
            })
        
        return {
            'type': 'FeatureCollection',
            'features': segments
        }
