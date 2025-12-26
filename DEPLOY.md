# Guía de Despliegue - Plataforma GPX

## Requisitos en el servidor
- Docker y Docker Compose instalados
- Puerto 5001 disponible

## Paso 1: Instalar Docker (si no está instalado)

```bash
# En Rocky Linux
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install docker-ce docker-ce-cli containerd.io docker-compose-plugin -y
sudo systemctl start docker
sudo systemctl enable docker
```

## Paso 2: Subir archivos al servidor

Desde tu máquina local, comprime la carpeta del proyecto:

```bash
# En Windows (PowerShell), desde la carpeta padre:
Compress-Archive -Path "gpx_platform" -DestinationPath "gpx_platform.zip"
```

Sube el archivo al servidor usando SCP o el administrador de archivos de Hostinger.

## Paso 3: En el servidor

```bash
# Crear directorio para la aplicación
mkdir -p /opt/gpx-platform
cd /opt/gpx-platform

# Descomprimir (si subiste zip)
unzip gpx_platform.zip
cd gpx_platform

# O si usaste scp directamente con la carpeta
```

## Paso 4: Verificar que los datos estén en su lugar

```bash
# La estructura debe ser:
# /opt/gpx-platform/gpx_platform/
#   ├── backend/
#   │   └── data/
#   │       ├── gpx/          <- Archivos GPX
#   │       ├── shapefiles/   <- Shapefiles
#   │       ├── routes.json   <- Configuración de rutas
#   │       └── config.json   <- Configuración general
#   ├── frontend/
#   ├── docker-compose.yml
#   └── ...

ls -la backend/data/
ls -la backend/data/gpx/
ls -la backend/data/shapefiles/
```

## Paso 5: Construir y ejecutar

```bash
# Construir las imágenes
sudo docker compose build

# Ejecutar en segundo plano
sudo docker compose up -d

# Ver logs
sudo docker compose logs -f
```

## Paso 6: Abrir puerto en firewall

```bash
# Rocky Linux con firewalld
sudo firewall-cmd --permanent --add-port=5001/tcp
sudo firewall-cmd --reload
```

## Paso 7: Verificar

Abre en tu navegador:
```
http://srv885729.hstgr.cloud:5001
```

## Comandos útiles

```bash
# Ver estado de contenedores
sudo docker compose ps

# Reiniciar servicios
sudo docker compose restart

# Detener servicios
sudo docker compose down

# Ver logs del backend
sudo docker compose logs backend

# Ver logs del frontend
sudo docker compose logs frontend

# Reconstruir después de cambios
sudo docker compose down
sudo docker compose build --no-cache
sudo docker compose up -d
```

## Solución de problemas

### Error: Puerto 5001 en uso
```bash
sudo netstat -tlnp | grep 5001
# Cambiar puerto en docker-compose.yml si es necesario
```

### Error: Permisos de Docker
```bash
sudo usermod -aG docker $USER
# Cerrar sesión y volver a entrar
```

### Los datos no aparecen
Verificar que los archivos estén en `backend/data/`:
```bash
ls -la backend/data/gpx/
ls -la backend/data/shapefiles/
cat backend/data/routes.json | head -50
```
