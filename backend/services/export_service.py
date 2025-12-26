import os
import json
import tempfile
import zipfile
import pandas as pd
import geopandas as gpd
from shapely.geometry import LineString

class ExportService:
    def __init__(self, results_folder):
        self.results_folder = results_folder
        self.exports_folder = os.path.join(results_folder, 'exports')
        os.makedirs(self.exports_folder, exist_ok=True)
    
    def export_shapefile(self, route):
        """Export route as shapefile with attributes"""
        route_id = route['id']
        
        # Load results
        results_path = os.path.join(self.results_folder, f'{route_id}_results.json')
        if not os.path.exists(results_path):
            raise FileNotFoundError('Analysis results not found')
        
        with open(results_path, 'r', encoding='utf-8') as f:
            results = json.load(f)
        
        # Get GPX coordinates
        gpx_folder = os.path.join(os.path.dirname(self.results_folder), 'data', 'gpx')
        gpx_path = os.path.join(gpx_folder, f'{route_id}.gpx')
        
        if not os.path.exists(gpx_path):
            raise FileNotFoundError('GPX file not found')
        
        # Parse GPX
        import gpxpy
        with open(gpx_path, 'r', encoding='utf-8') as f:
            gpx = gpxpy.parse(f)
        
        coords = []
        for track in gpx.tracks:
            for segment in track.segments:
                for point in segment.points:
                    coords.append((point.longitude, point.latitude))
        
        if not coords:
            raise ValueError('No coordinates found in GPX')
        
        # Create GeoDataFrame
        line = LineString(coords)
        analysis = results.get('analysis', {})
        
        gdf = gpd.GeoDataFrame({
            'id': [route_id],
            'nombre': [route.get('nombre', '')],
            'municipio': [route.get('municipio', '')],
            'modalidad': [route.get('modalidad', '')],
            'clave_mnem': [route.get('clave_mnemotecnica', '')],
            'dist_km': [analysis.get('distancia_km', 0)],
            'dur_min': [analysis.get('duracion_min', 0)],
            'vel_prom': [analysis.get('velocidad_promedio_kmh', 0)],
            'vel_max': [analysis.get('velocidad_maxima_kmh', 0)],
            'ele_min': [analysis.get('elevacion_min_m', 0)],
            'ele_max': [analysis.get('elevacion_max_m', 0)],
            'ele_gain': [analysis.get('ganancia_elevacion_m', 0)],
            'ele_loss': [analysis.get('perdida_elevacion_m', 0)],
            'pav_km': [analysis.get('superficie', {}).get('pavimentado_km', 0)],
            'terr_km': [analysis.get('superficie', {}).get('terraceria_km', 0)],
            'fed_km': [analysis.get('administracion', {}).get('federal_km', 0)],
            'est_km': [analysis.get('administracion', {}).get('estatal_km', 0)],
            'mun_km': [analysis.get('administracion', {}).get('municipal_km', 0)],
            'n_mun': [analysis.get('num_municipios', 0)],
            'n_loc_urb': [analysis.get('localidades_urbanas', 0)],
            'n_loc_rur': [analysis.get('localidades_rurales', 0)],
            'confianza': [analysis.get('confianza_matching', 0)]
        }, geometry=[line], crs='EPSG:4326')
        
        # Export to shapefile
        export_folder = os.path.join(self.exports_folder, f'route_{route_id}')
        os.makedirs(export_folder, exist_ok=True)
        
        shp_path = os.path.join(export_folder, f'ruta_{route_id}.shp')
        gdf.to_file(shp_path)
        
        # Create ZIP with all shapefile components
        zip_path = os.path.join(self.exports_folder, f'ruta_{route_id}.zip')
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            for file in os.listdir(export_folder):
                filepath = os.path.join(export_folder, file)
                zipf.write(filepath, file)
        
        return zip_path
    
    def export_csv(self, routes):
        """Export all routes summary as CSV"""
        data = []
        
        for route in routes:
            analysis = route.get('analysis', {})
            superficie = analysis.get('superficie', {})
            admin = analysis.get('administracion', {})
            
            data.append({
                'ID': route.get('id', ''),
                'Nombre': route.get('nombre', ''),
                'Municipio': route.get('municipio', ''),
                'Modalidad': route.get('modalidad', ''),
                'Clave Mnemotécnica': route.get('clave_mnemotecnica', ''),
                'Analizado': 'Sí' if route.get('analyzed', False) else 'No',
                'Distancia (km)': analysis.get('distancia_km', ''),
                'Duración (min)': analysis.get('duracion_min', ''),
                'Velocidad Promedio (km/h)': analysis.get('velocidad_promedio_kmh', ''),
                'Velocidad Máxima (km/h)': analysis.get('velocidad_maxima_kmh', ''),
                'Elevación Mínima (m)': analysis.get('elevacion_min_m', ''),
                'Elevación Máxima (m)': analysis.get('elevacion_max_m', ''),
                'Ganancia Elevación (m)': analysis.get('ganancia_elevacion_m', ''),
                'Pérdida Elevación (m)': analysis.get('perdida_elevacion_m', ''),
                'Pavimentado (km)': superficie.get('pavimentado_km', ''),
                'Terracería (km)': superficie.get('terraceria_km', ''),
                'Federal (km)': admin.get('federal_km', ''),
                'Estatal (km)': admin.get('estatal_km', ''),
                'Municipal (km)': admin.get('municipal_km', ''),
                'Municipios Atravesados': analysis.get('num_municipios', ''),
                'Localidades Urbanas': analysis.get('localidades_urbanas', ''),
                'Localidades Rurales': analysis.get('localidades_rurales', ''),
                'Confianza Matching (%)': analysis.get('confianza_matching', '')
            })
        
        df = pd.DataFrame(data)
        csv_path = os.path.join(self.exports_folder, 'rutas_resumen.csv')
        df.to_csv(csv_path, index=False, encoding='utf-8-sig')
        
        return csv_path
    
    def export_excel(self, routes):
        """Export all routes summary as Excel"""
        data = []
        
        for route in routes:
            analysis = route.get('analysis', {})
            superficie = analysis.get('superficie', {})
            admin = analysis.get('administracion', {})
            
            data.append({
                'ID': route.get('id', ''),
                'Nombre': route.get('nombre', ''),
                'Municipio': route.get('municipio', ''),
                'Modalidad': route.get('modalidad', ''),
                'Clave Mnemotécnica': route.get('clave_mnemotecnica', ''),
                'Analizado': 'Sí' if route.get('analyzed', False) else 'No',
                'Distancia (km)': analysis.get('distancia_km', ''),
                'Duración (min)': analysis.get('duracion_min', ''),
                'Velocidad Promedio (km/h)': analysis.get('velocidad_promedio_kmh', ''),
                'Velocidad Máxima (km/h)': analysis.get('velocidad_maxima_kmh', ''),
                'Elevación Mínima (m)': analysis.get('elevacion_min_m', ''),
                'Elevación Máxima (m)': analysis.get('elevacion_max_m', ''),
                'Ganancia Elevación (m)': analysis.get('ganancia_elevacion_m', ''),
                'Pérdida Elevación (m)': analysis.get('perdida_elevacion_m', ''),
                'Pavimentado (km)': superficie.get('pavimentado_km', ''),
                'Terracería (km)': superficie.get('terraceria_km', ''),
                'Federal (km)': admin.get('federal_km', ''),
                'Estatal (km)': admin.get('estatal_km', ''),
                'Municipal (km)': admin.get('municipal_km', ''),
                'Municipios Atravesados': analysis.get('num_municipios', ''),
                'Localidades Urbanas': analysis.get('localidades_urbanas', ''),
                'Localidades Rurales': analysis.get('localidades_rurales', ''),
                'Confianza Matching (%)': analysis.get('confianza_matching', '')
            })
        
        df = pd.DataFrame(data)
        excel_path = os.path.join(self.exports_folder, 'rutas_resumen.xlsx')
        df.to_excel(excel_path, index=False, engine='openpyxl')
        
        return excel_path
