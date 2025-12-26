# Datos de Ejemplo

Este directorio contiene archivos de ejemplo para probar la plataforma.

## Archivos Incluidos

### sample_route.gpx
Un archivo GPX de ejemplo con una ruta en la zona de Aguascalientes.
- 21 puntos de track
- Coordenadas en la zona centro de Aguascalientes
- Incluye elevación y timestamps

### sample_metadata.csv
Archivo CSV de ejemplo para carga masiva con metadatos de rutas.
- Formato compatible con la plataforma
- Incluye campos: archivo, nombre, municipio, modalidad, operador, fecha_levantamiento

## Cómo Usar

### Prueba Individual
1. Ve al módulo de Rutas GPX
2. Selecciona "Subir individual"
3. Sube el archivo `sample_route.gpx`

### Prueba de Metadatos CSV
El archivo `sample_metadata.csv` muestra el formato esperado para la carga masiva.
Para usarlo:
1. Crea un ZIP con los archivos GPX
2. Sube el ZIP junto con el CSV

## Shapefiles de Prueba

Para pruebas completas, necesitarás shapefiles del INEGI o fuentes oficiales:

1. **Red Nacional de Caminos**
   - Descarga desde: https://www.inegi.org.mx/app/biblioteca/ficha.html?upc=889463674658
   
2. **Marco Geoestadístico (Municipios)**
   - Descarga desde: https://www.inegi.org.mx/app/biblioteca/ficha.html?upc=889463770541
   
3. **Localidades**
   - Descarga desde: https://www.inegi.org.mx/app/biblioteca/ficha.html?upc=889463776079

Filtra los shapefiles para tu estado antes de cargarlos a la plataforma.
