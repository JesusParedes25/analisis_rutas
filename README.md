# Plataforma de Análisis Vial de Rutas GPX

Plataforma web para el análisis geoespacial de rutas de transporte. Procesa archivos GPX, los cruza con la Red Nacional de Caminos y límites municipales, y genera estadísticas detalladas sobre las características viales de cada ruta.

## Características

- **Configuración de Shapefiles Base**: Carga Red Nacional de Caminos, límites municipales y localidades
- **Gestión de Rutas GPX**: Carga individual o masiva de archivos GPX con metadatos
- **Análisis Geoespacial**: Map-matching, cálculo de métricas, detección de municipios y localidades
- **Visualización**: Mapas interactivos con Leaflet, gráficas de distribución, dashboards
- **Exportación**: JSON, Shapefile, CSV y Excel

## Requisitos

### Para desarrollo local
- Python 3.9+
- Node.js 16+
- GDAL (para procesamiento de shapefiles)

### Para Docker
- Docker
- Docker Compose

## Instalación

### Opción 1: Desarrollo Local

#### Backend (Python/Flask)

```bash
cd backend

# Crear entorno virtual
python -m venv venv

# Activar entorno virtual
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Ejecutar servidor
python app.py
```

El backend estará disponible en `http://localhost:5000`

#### Frontend (React)

```bash
cd frontend

# Instalar dependencias
npm install

# Ejecutar en modo desarrollo
npm start
```

El frontend estará disponible en `http://localhost:3000`

### Opción 2: Docker

```bash
# Construir y ejecutar contenedores
docker-compose up --build

# O en segundo plano
docker-compose up -d --build
```

La aplicación estará disponible en:
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:5000`

## Uso

### 1. Configuración Inicial

1. Accede al módulo de **Configuración**
2. Carga los tres shapefiles base:
   - **Red Nacional de Caminos**: Shapefile de líneas con atributos de superficie y administración
   - **Límites Municipales**: Shapefile de polígonos con nombres y claves de municipios
   - **Marco Geoestadístico de Localidades**: Shapefile de puntos/polígonos con localidades
3. Configura el buffer de búsqueda (por defecto 50 metros)

### 2. Carga de Rutas GPX

#### Individual
1. Ve al módulo de **Rutas GPX**
2. Completa los campos opcionales (nombre, municipio, modalidad, etc.)
3. Selecciona el archivo GPX

#### Masiva
1. Prepara un archivo ZIP con los GPX
2. Opcionalmente, crea un CSV con metadatos (columnas: archivo, nombre, municipio, modalidad, operador, fecha_levantamiento)
3. Sube ambos archivos

### 3. Análisis

1. Ve al módulo de **Análisis**
2. Analiza rutas individualmente o usa "Analizar todas las pendientes"
3. El análisis incluye:
   - Métricas básicas (distancia, duración, velocidad)
   - Métricas de elevación
   - Map-matching con la red vial
   - Distribución por superficie (pavimentado/terracería)
   - Distribución por administración (federal/estatal/municipal)
   - Municipios atravesados
   - Localidades atendidas

### 4. Visualización

- **Dashboard General**: Estadísticas globales, mapa con todas las rutas
- **Dashboard por Municipio**: Estadísticas agregadas de rutas por municipio
- **Detalle de Ruta**: Mapa interactivo, métricas completas, gráficas

### 5. Exportación

- **JSON**: Todas las métricas en formato estructurado
- **Shapefile**: Geometría de la ruta con atributos en la tabla
- **CSV/Excel**: Tabla resumen de todas las rutas

## Estructura del Proyecto

```
gpx_platform/
├── backend/
│   ├── app.py                 # Aplicación Flask principal
│   ├── requirements.txt       # Dependencias Python
│   └── services/
│       ├── shapefile_service.py   # Manejo de shapefiles
│       ├── gpx_service.py         # Procesamiento GPX
│       ├── analysis_service.py    # Análisis geoespacial
│       └── export_service.py      # Exportación de datos
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── App.js             # Componente principal
│   │   ├── api.js             # Cliente API
│   │   ├── index.css          # Estilos globales
│   │   └── modules/           # Módulos de la aplicación
│   │       ├── ConfigModule.js
│   │       ├── RoutesModule.js
│   │       ├── AnalysisModule.js
│   │       ├── RouteDetailModule.js
│   │       ├── DashboardModule.js
│   │       ├── MunicipioDashboard.js
│   │       └── ExportModule.js
│   └── package.json
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
├── nginx.conf
└── README.md
```

## Atributos de Shapefiles

### Red Nacional de Caminos
La plataforma busca automáticamente estos atributos para clasificación:
- **Superficie**: CONDICION, TIPO_SUPER, SUPERFICIE, TIPO_PAVIM, PAVIMENTO, RECUBRIMIE
- **Administración**: ADMINISTRA, TIPO_ADMIN, JURISDICCI, COMPETENCI, TIPO_VIA, JERARQUIA

### Límites Municipales
- **Nombre**: NOMGEO, NOM_MUN, NOMBRE
- **Clave**: CVE_MUN, CVEGEO, CVE_ENT

### Localidades
- **Nombre**: NOM_LOC, NOMBRE, NOMGEO, LOCALIDAD
- **Tipo**: AMBITO, TIPO, TIPO_LOC, URBAN_RURA
- **Municipio**: CVE_MUN, CVEGEO, NOM_MUN

## API Endpoints

### Configuración
- `GET /api/config` - Obtener configuración actual
- `POST /api/config/buffer` - Configurar buffer de búsqueda
- `POST /api/config/shapefile/{type}` - Subir shapefile
- `GET /api/config/shapefile/{type}/preview` - Vista previa GeoJSON

### Rutas
- `GET /api/routes` - Listar rutas (con filtros)
- `POST /api/routes` - Subir ruta individual
- `POST /api/routes/batch` - Subir rutas masivas
- `GET /api/routes/{id}` - Obtener ruta
- `DELETE /api/routes/{id}` - Eliminar ruta
- `GET /api/routes/{id}/gpx` - Obtener GPX como GeoJSON

### Análisis
- `POST /api/analysis/{id}` - Analizar ruta
- `GET /api/analysis/{id}/results` - Obtener resultados
- `POST /api/analysis/batch` - Analizar todas las pendientes

### Dashboard
- `GET /api/dashboard/global` - Estadísticas globales
- `GET /api/dashboard/municipio/{name}` - Estadísticas por municipio
- `GET /api/dashboard/municipios` - Lista de municipios

### Exportación
- `GET /api/export/route/{id}/json` - Exportar JSON
- `GET /api/export/route/{id}/shapefile` - Exportar Shapefile
- `GET /api/export/routes/csv` - Exportar CSV
- `GET /api/export/routes/excel` - Exportar Excel

## Notas Técnicas

- Todos los archivos geográficos trabajan en proyección WGS84 (EPSG:4326)
- El map-matching usa un buffer configurable (default: 50m)
- Los shapefiles se almacenan en el servidor
- La plataforma funciona offline una vez cargados los shapefiles base

## Solución de Problemas

### Error al cargar shapefiles
- Asegúrate de seleccionar todos los archivos componentes (.shp, .dbf, .shx, .prj)
- Verifica que el shapefile tenga geometrías válidas

### Error en análisis
- Verifica que los shapefiles base estén cargados
- Revisa que el GPX tenga puntos de track válidos

### Rendimiento lento
- Para análisis masivo, usa archivos GPX con menos puntos si es posible
- Considera simplificar los shapefiles base si tienen muchos elementos

## Licencia

MIT License
