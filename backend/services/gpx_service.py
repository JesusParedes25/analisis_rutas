import os
import gpxpy
import json
import uuid
import zipfile
import tempfile
import shutil
import csv
from datetime import datetime
from werkzeug.utils import secure_filename

class GPXService:
    def __init__(self, upload_folder, data_folder):
        self.upload_folder = upload_folder
        self.data_folder = data_folder
        self.gpx_folder = os.path.join(data_folder, 'gpx')
        os.makedirs(self.gpx_folder, exist_ok=True)
    
    def save_gpx(self, file, metadata=None):
        """Save a single GPX file"""
        if not file.filename.lower().endswith('.gpx'):
            return {'success': False, 'error': 'File must be a GPX file'}
        
        route_id = str(uuid.uuid4())[:8]
        filename = secure_filename(file.filename)
        
        # Save GPX file
        gpx_path = os.path.join(self.gpx_folder, f'{route_id}.gpx')
        file.save(gpx_path)
        
        # Parse GPX to get basic info
        try:
            gpx_info = self._parse_gpx(gpx_path)
        except Exception as e:
            os.remove(gpx_path)
            return {'success': False, 'error': f'Error parsing GPX: {str(e)}'}
        
        route = {
            'id': route_id,
            'filename': filename,
            'nombre': metadata.get('nombre') or filename.replace('.gpx', ''),
            'municipio': metadata.get('municipio', ''),
            'modalidad': metadata.get('modalidad', ''),
            'clave_mnemotecnica': metadata.get('clave_mnemotecnica', ''),
            'uploaded_at': datetime.now().isoformat(),
            'analyzed': False,
            'points_count': gpx_info['points_count'],
            'bounds': gpx_info['bounds']
        }
        
        return {'success': True, 'route': route}
    
    def save_gpx_batch(self, zip_file, csv_file=None, default_metadata=None):
        """Save multiple GPX files from a ZIP"""
        temp_dir = tempfile.mkdtemp()
        routes = []
        errors = []
        
        if default_metadata is None:
            default_metadata = {}
        
        try:
            # Extract ZIP
            zip_path = os.path.join(temp_dir, 'upload.zip')
            zip_file.save(zip_path)
            
            with zipfile.ZipFile(zip_path, 'r') as z:
                z.extractall(temp_dir)
            
            # Parse CSV metadata if provided
            metadata_map = {}
            if csv_file:
                csv_path = os.path.join(temp_dir, 'metadata.csv')
                csv_file.save(csv_path)
                metadata_map = self._parse_metadata_csv(csv_path)
            
            # Find and process GPX files
            for root, dirs, files in os.walk(temp_dir):
                for filename in files:
                    if filename.lower().endswith('.gpx'):
                        filepath = os.path.join(root, filename)
                        
                        # Get metadata for this file
                        base_name = filename.replace('.gpx', '').replace('.GPX', '')
                        # Merge: CSV metadata overrides default metadata
                        metadata = {**default_metadata, **metadata_map.get(base_name, {})}
                        
                        route_id = str(uuid.uuid4())[:8]
                        
                        # Copy GPX to data folder
                        dest_path = os.path.join(self.gpx_folder, f'{route_id}.gpx')
                        shutil.copy(filepath, dest_path)
                        
                        try:
                            gpx_info = self._parse_gpx(dest_path)
                            
                            route = {
                                'id': route_id,
                                'filename': filename,
                                'nombre': metadata.get('nombre') or base_name,
                                'municipio': metadata.get('municipio', ''),
                                'modalidad': metadata.get('modalidad', ''),
                                'clave_mnemotecnica': metadata.get('clave_mnemotecnica', ''),
                                'uploaded_at': datetime.now().isoformat(),
                                'analyzed': False,
                                'points_count': gpx_info['points_count'],
                                'bounds': gpx_info['bounds']
                            }
                            routes.append(route)
                        except Exception as e:
                            errors.append({'filename': filename, 'error': str(e)})
                            os.remove(dest_path)
            
            return {
                'success': True,
                'routes': routes,
                'total': len(routes),
                'errors': errors
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e), 'routes': []}
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)
    
    def _parse_metadata_csv(self, csv_path):
        """Parse CSV file with route metadata"""
        metadata_map = {}
        
        try:
            with open(csv_path, 'r', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    # Try different column names for filename
                    filename = row.get('archivo') or row.get('filename') or row.get('nombre_archivo', '')
                    filename = filename.replace('.gpx', '').replace('.GPX', '')
                    
                    if filename:
                        metadata_map[filename] = {
                            'nombre': row.get('nombre') or row.get('name', ''),
                            'municipio': row.get('municipio') or row.get('municipality', ''),
                            'modalidad': row.get('modalidad') or row.get('modality', ''),
                            'clave_mnemotecnica': row.get('clave_mnemotecnica') or row.get('clave', '')
                        }
        except Exception as e:
            print(f'Error parsing CSV: {e}')
        
        return metadata_map
    
    def _parse_gpx(self, gpx_path):
        """Parse GPX file and extract basic info"""
        with open(gpx_path, 'r', encoding='utf-8') as f:
            gpx = gpxpy.parse(f)
        
        points = []
        for track in gpx.tracks:
            for segment in track.segments:
                for point in segment.points:
                    points.append({
                        'lat': point.latitude,
                        'lon': point.longitude,
                        'ele': point.elevation,
                        'time': point.time.isoformat() if point.time else None
                    })
        
        # Also check waypoints if no tracks
        if not points:
            for waypoint in gpx.waypoints:
                points.append({
                    'lat': waypoint.latitude,
                    'lon': waypoint.longitude,
                    'ele': waypoint.elevation,
                    'time': waypoint.time.isoformat() if waypoint.time else None
                })
        
        # Also check routes
        if not points:
            for route in gpx.routes:
                for point in route.points:
                    points.append({
                        'lat': point.latitude,
                        'lon': point.longitude,
                        'ele': point.elevation,
                        'time': point.time.isoformat() if point.time else None
                    })
        
        if not points:
            raise ValueError('GPX file contains no track points, waypoints, or routes')
        
        # Calculate bounds
        lats = [p['lat'] for p in points]
        lons = [p['lon'] for p in points]
        bounds = [min(lons), min(lats), max(lons), max(lats)]
        
        return {
            'points': points,
            'points_count': len(points),
            'bounds': bounds
        }
    
    def get_gpx_geojson(self, route_id):
        """Get GPX as GeoJSON LineString"""
        gpx_path = os.path.join(self.gpx_folder, f'{route_id}.gpx')
        
        if not os.path.exists(gpx_path):
            raise FileNotFoundError(f'GPX file not found: {route_id}')
        
        gpx_info = self._parse_gpx(gpx_path)
        points = gpx_info['points']
        
        # Create GeoJSON
        coordinates = [[p['lon'], p['lat']] for p in points]
        
        geojson = {
            'type': 'FeatureCollection',
            'features': [{
                'type': 'Feature',
                'properties': {
                    'route_id': route_id,
                    'points_count': len(points)
                },
                'geometry': {
                    'type': 'LineString',
                    'coordinates': coordinates
                }
            }]
        }
        
        return geojson
    
    def get_gpx_points(self, route_id):
        """Get GPX points for analysis"""
        gpx_path = os.path.join(self.gpx_folder, f'{route_id}.gpx')
        
        if not os.path.exists(gpx_path):
            raise FileNotFoundError(f'GPX file not found: {route_id}')
        
        return self._parse_gpx(gpx_path)
    
    def delete_gpx(self, route_id):
        """Delete a GPX file"""
        gpx_path = os.path.join(self.gpx_folder, f'{route_id}.gpx')
        if os.path.exists(gpx_path):
            os.remove(gpx_path)
