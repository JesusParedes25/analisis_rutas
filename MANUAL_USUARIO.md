# Manual de Usuario - Plataforma de Análisis Vial GPX

## Introducción

Esta plataforma permite analizar rutas de transporte capturadas en formato GPX, cruzándolas con información vial oficial para generar estadísticas detalladas sobre las características de cada ruta.

---

## Primeros Pasos

### Requisitos Previos

Antes de comenzar a usar la plataforma, necesitas tener preparados:

1. **Shapefiles Base** (se configuran una sola vez):
   - Red Nacional de Caminos del estado
   - Límites municipales
   - Marco geoestadístico de localidades

2. **Archivos GPX** de las rutas a analizar

---

## Módulo de Configuración

### Carga de Shapefiles Base

1. Haz clic en **"Configuración"** en el menú lateral
2. Para cada tipo de shapefile:
   - Haz clic en el área de carga
   - Selecciona **todos los archivos** del shapefile (.shp, .dbf, .shx, .prj)
   - Espera a que se procese

3. Verifica que aparezca el indicador verde "Cargado" junto a cada shapefile

### Vista Previa en Mapa

- Después de cargar un shapefile, puedes hacer clic en **"Ver en mapa"** para visualizar los datos
- Esto te permite confirmar que el shapefile se cargó correctamente

### Configuración del Buffer

- El **buffer de búsqueda** determina la distancia máxima (en metros) para asociar puntos GPX con la red vial
- El valor predeterminado es 50 metros
- Valores más altos capturan más coincidencias pero pueden ser menos precisos

---

## Módulo de Rutas GPX

### Carga Individual

1. Ve a **"Rutas GPX"** en el menú
2. Selecciona la pestaña **"Subir individual"**
3. Completa los campos opcionales:
   - **Nombre de la ruta**: Identificador descriptivo
   - **Municipio**: Municipio al que pertenece la ruta
   - **Modalidad**: Tipo de transporte (Urbano, Suburbano, Foráneo, etc.)
   - **Operador**: Nombre del operador de transporte
   - **Fecha de levantamiento**: Cuándo se capturó la ruta

4. Haz clic en el área de carga y selecciona el archivo GPX

### Carga Masiva

1. Selecciona la pestaña **"Subida masiva"**
2. Prepara tus archivos:
   - Un archivo **ZIP** con todos los GPX
   - Opcionalmente, un archivo **CSV** con metadatos

3. El CSV debe tener las siguientes columnas:
   ```
   archivo,nombre,municipio,modalidad,operador,fecha_levantamiento
   ruta1.gpx,Ruta Centro-Norte,Aguascalientes,Urbano,Transportes Unidos,2024-01-15
   ruta2.gpx,Ruta Sur,Jesús María,Suburbano,Línea Azul,2024-01-16
   ```

4. Selecciona ambos archivos y súbelos

### Gestión de Rutas

- Usa los **filtros** para buscar rutas por municipio, modalidad o estado de análisis
- El botón **Ver** te lleva al detalle de cada ruta
- El botón **Eliminar** borra la ruta (solicita confirmación)

---

## Módulo de Análisis

### Análisis Individual

1. Ve a **"Análisis"** en el menú
2. Localiza la ruta que deseas analizar
3. Haz clic en el botón **"Analizar"**
4. Espera a que se complete el proceso

### Análisis Masivo

1. Haz clic en **"Analizar todas las pendientes"**
2. El sistema procesará todas las rutas no analizadas
3. Un indicador de progreso te mostrará el avance

### Qué Incluye el Análisis

- **Métricas básicas**: Distancia, duración, velocidad promedio y máxima
- **Elevación**: Mínima, máxima, ganancia y pérdida
- **Superficie**: Kilómetros en vías pavimentadas vs terracería
- **Administración**: Kilómetros en vías federales, estatales y municipales
- **Territorio**: Municipios atravesados y localidades atendidas
- **Confianza**: Porcentaje de coincidencia con la red vial

---

## Visualización de Resultados

### Vista de Ruta Individual

Al hacer clic en **"Ver"** de cualquier ruta:

1. **Panel superior**: Métricas principales (distancia, duración, velocidades)
2. **Mapa interactivo**: 
   - Línea roja: GPX original
   - Línea azul: Vías coincidentes de la red vial
   - Controles para mostrar/ocultar capas

3. **Métricas de elevación**: Alturas y desniveles
4. **Confianza del análisis**: Barra de progreso indicando qué tan bien se ajustó el GPX
5. **Gráficas de distribución**: Por superficie y por administración vial
6. **Listas**: Municipios atravesados y localidades atendidas

### Dashboard General

Muestra estadísticas globales:
- Total de rutas y kilómetros analizados
- Municipios con rutas
- Mapa con todas las rutas
- Distribuciones por superficie y modalidad
- Tabla resumen por municipio

### Dashboard por Municipio

Al hacer clic en **"Ver detalle"** de un municipio:
- Estadísticas agregadas de todas las rutas del municipio
- Promedios de distancia, duración y velocidad
- Localidades atendidas
- Mapa con las rutas del municipio
- Gráficas de distribución

---

## Módulo de Exportación

### Exportación Masiva

- **CSV**: Tabla con todas las rutas y métricas, compatible con Excel
- **Excel**: Formato .xlsx con formato de tabla

### Exportación Individual

Para cada ruta analizada:

- **JSON**: Todas las métricas en formato estructurado
- **Shapefile**: Geometría de la ruta como línea, con atributos en la tabla

---

## Interpretación de Resultados

### Confianza del Análisis

- **> 70%**: Excelente ajuste, los datos de superficie y administración son confiables
- **40-70%**: Ajuste moderado, revisar manualmente si hay secciones fuera de la red vial
- **< 40%**: Bajo ajuste, posiblemente la ruta incluye caminos no mapeados

### Superficie

- **Pavimentado**: Vías con recubrimiento de asfalto o concreto
- **Terracería**: Vías de tierra, brecha o sin pavimentar
- **N/A**: Segmentos donde no se pudo determinar el tipo

### Administración Vial

- **Federal**: Carreteras federales y autopistas
- **Estatal**: Carreteras estatales
- **Municipal**: Calles urbanas y caminos locales
- **N/A**: Segmentos sin clasificación

---

## Solución de Problemas

### "Shapefile no válido"
- Verifica que seleccionaste todos los archivos componentes
- El archivo .shp es obligatorio, junto con .dbf y .shx

### "Error al parsear GPX"
- El archivo GPX debe contener puntos de track válidos
- Verifica que el archivo no esté corrupto

### "Sin datos de superficie/administración"
- La Red Nacional de Caminos puede no tener estos atributos completos
- Los segmentos sin datos se clasifican como "N/A"

### Análisis muy lento
- GPX con miles de puntos toman más tiempo
- El análisis masivo procesa una ruta a la vez

---

## Consejos de Uso

1. **Prepara tus shapefiles**: Asegúrate de que tengan los atributos correctos antes de cargarlos
2. **Nombra tus rutas**: Usa nombres descriptivos para facilitar la búsqueda
3. **Asigna municipios**: Facilita el filtrado y la generación de estadísticas
4. **Exporta regularmente**: Guarda respaldos de tus análisis en CSV o Excel
5. **Revisa la confianza**: Un análisis con baja confianza puede requerir revisión manual

---

## Soporte

Si encuentras problemas técnicos, verifica:
1. Que los shapefiles base estén correctamente cargados
2. Que los archivos GPX sean válidos
3. Que tengas conexión al servidor backend

Para más información técnica, consulta el archivo README.md del proyecto.
