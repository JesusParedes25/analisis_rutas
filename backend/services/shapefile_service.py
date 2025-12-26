import os
import geopandas as gpd
import json
from werkzeug.utils import secure_filename
import tempfile
import shutil

class ShapefileService:
    def __init__(self, data_folder):
        self.data_folder = data_folder
        self.shapefiles_folder = os.path.join(data_folder, 'shapefiles')
        os.makedirs(self.shapefiles_folder, exist_ok=True)
    
    def save_shapefile(self, files, shapefile_type):
        """Save uploaded shapefile components"""
        # Create temp directory for uploaded files
        temp_dir = tempfile.mkdtemp()
        shp_file = None
        
        try:
            # Get base name from .shp file to ensure all files have matching names
            base_name = None
            for file in files:
                if file.filename.lower().endswith('.shp'):
                    # Use simple name without secure_filename to preserve matching
                    base_name = os.path.splitext(file.filename)[0]
                    break
            
            if not base_name:
                return {'success': False, 'error': 'No .shp file found in upload'}
            
            # Save all uploaded files with consistent naming
            for file in files:
                original_ext = os.path.splitext(file.filename)[1].lower()
                # Use a simple base name to avoid encoding issues in filenames
                new_filename = f"data{original_ext}"
                filepath = os.path.join(temp_dir, new_filename)
                file.save(filepath)
                
                if original_ext == '.shp':
                    shp_file = filepath
            
            if not shp_file:
                return {'success': False, 'error': 'No .shp file found in upload'}
            
            # Remove .cpg file if exists (it may specify wrong encoding)
            cpg_file = os.path.join(temp_dir, 'data.cpg')
            if os.path.exists(cpg_file):
                os.remove(cpg_file)
            
            # Create .cpg file with Latin-1 encoding (common for Mexican government data)
            with open(cpg_file, 'w') as f:
                f.write('LATIN1')
            
            # Read shapefile
            gdf = None
            last_error = None
            try:
                gdf = gpd.read_file(shp_file)
            except Exception as e:
                last_error = str(e)
            
            if gdf is None:
                return {'success': False, 'error': f'Could not read shapefile: {last_error}'}
            
            # Ensure WGS84 projection
            if gdf.crs is None:
                gdf.set_crs(epsg=4326, inplace=True)
            elif gdf.crs.to_epsg() != 4326:
                gdf = gdf.to_crs(epsg=4326)
            
            # Validate based on type
            validation = self._validate_shapefile(gdf, shapefile_type)
            if not validation['valid']:
                return {'success': False, 'error': validation['error']}
            
            # Save to permanent location
            dest_folder = os.path.join(self.shapefiles_folder, shapefile_type)
            if os.path.exists(dest_folder):
                shutil.rmtree(dest_folder)
            os.makedirs(dest_folder)
            
            dest_path = os.path.join(dest_folder, f'{shapefile_type}.shp')
            gdf.to_file(dest_path)
            
            # Get bounds
            bounds = gdf.total_bounds.tolist()
            
            return {
                'success': True,
                'filename': os.path.basename(shp_file),
                'features_count': len(gdf),
                'bounds': bounds,
                'attributes': list(gdf.columns),
                'crs': str(gdf.crs)
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
        finally:
            # Cleanup temp directory
            shutil.rmtree(temp_dir, ignore_errors=True)
    
    def _validate_shapefile(self, gdf, shapefile_type):
        """Validate shapefile structure based on type"""
        if len(gdf) == 0:
            return {'valid': False, 'error': 'Shapefile is empty'}
        
        if shapefile_type == 'road_network':
            # Should be LineString geometry
            geom_types = gdf.geometry.geom_type.unique()
            valid_types = ['LineString', 'MultiLineString']
            if not any(gt in valid_types for gt in geom_types):
                return {'valid': False, 'error': f'Road network should contain LineString geometries, found: {geom_types}'}
        
        elif shapefile_type == 'municipalities':
            # Should be Polygon geometry
            geom_types = gdf.geometry.geom_type.unique()
            valid_types = ['Polygon', 'MultiPolygon']
            if not any(gt in valid_types for gt in geom_types):
                return {'valid': False, 'error': f'Municipalities should contain Polygon geometries, found: {geom_types}'}
        
        elif shapefile_type == 'localities':
            # Can be Point or Polygon
            pass
        
        return {'valid': True}
    
    def _read_with_encoding(self, shp_path):
        """Read shapefile trying multiple encodings"""
        encodings = ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']
        for encoding in encodings:
            try:
                return gpd.read_file(shp_path, encoding=encoding)
            except Exception:
                continue
        # Last resort - try without encoding param
        return gpd.read_file(shp_path)
    
    def get_geojson(self, shapefile_type, simplify=True):
        """Get shapefile as GeoJSON"""
        shp_path = os.path.join(self.shapefiles_folder, shapefile_type, f'{shapefile_type}.shp')
        
        if not os.path.exists(shp_path):
            raise FileNotFoundError(f'Shapefile not found: {shapefile_type}')
        
        gdf = self._read_with_encoding(shp_path)
        
        # Simplify geometry for web display if needed
        if simplify and len(gdf) > 1000:
            gdf['geometry'] = gdf.geometry.simplify(0.001)
        
        return json.loads(gdf.to_json())
    
    def get_geodataframe(self, shapefile_type):
        """Get shapefile as GeoDataFrame"""
        shp_path = os.path.join(self.shapefiles_folder, shapefile_type, f'{shapefile_type}.shp')
        
        if not os.path.exists(shp_path):
            return None
        
        return self._read_with_encoding(shp_path)
    
    def is_loaded(self, shapefile_type):
        """Check if shapefile is loaded"""
        shp_path = os.path.join(self.shapefiles_folder, shapefile_type, f'{shapefile_type}.shp')
        return os.path.exists(shp_path)
    
    def get_municipios_list(self):
        """Get list of municipios from NOMGEO field in municipalities shapefile"""
        gdf = self.get_geodataframe('municipalities')
        
        if gdf is None:
            return []
        
        # Try common column names for municipality name
        name_columns = ['NOMGEO', 'NOM_MUN', 'NOMBRE', 'NAME', 'NOM_ENT', 'MUNICIPIO']
        
        for col in name_columns:
            if col in gdf.columns:
                municipios = gdf[col].dropna().unique().tolist()
                municipios.sort()
                return municipios
        
        # If no known column found, return empty list
        return []
