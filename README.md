# SISTEMA OMAI - GT 100.51

## Descripción
El **SISTEMA OMAI - GT 100.51** es una plataforma de mando, control y gestión operacional desarrollada para el uso oficial de la Armada del Ecuador. Este sistema integra la administración de personal, operaciones, logística e inteligencia, facilitando la toma de decisiones mediante visualización geoespacial y control estadístico de incidentes y patrullajes.

## Estructura del Proyecto
- **Frontend**: Desarrollado en HTML5, CSS3 y JavaScript. Utiliza librerías como Leaflet para visualización de mapas y herramientas de dibujo geográfico, jsPDF/AutoTable para la exportación de reportes a PDF, y SheetJS para exportaciones a Excel.
- **Backend**: Servidor local empaquetado en un archivo ejecutable (`SISTEMA_OMAI.exe`) que inicializa el aplicativo y expone la API y el cliente web en el puerto `3000`. También incluye una carpeta de código fuente `SISTEMA_BACKEND` para desarrollo.
- **Base de Datos**: Emplea SQLite (`database.sqlite`) para el almacenamiento seguro, rápido y local de la información.

## Requisitos del Sistema
- **Sistema Operativo**: Windows (requerido para ejecutar el `.exe` principal y el script `.bat`).
- **Navegador**: Navegador web moderno como Google Chrome, Microsoft Edge o Mozilla Firefox.

## Instrucciones de Instalación y Ejecución
1. **Iniciar el Servidor**: En la carpeta principal del proyecto, haz doble clic en el archivo `INICIAR_PROGRAMA.bat`.
   - Este script ejecutará en segundo plano el servicio de la base de datos y la aplicación (`SISTEMA_OMAI.exe`).
   - Mantén abierta la ventana negra de la consola ("SERVIDOR OMAI"). Si la cierras, el sistema se apagará.
2. **Acceso Local**: El script abrirá automáticamente tu navegador en la dirección:
   ```text
   http://localhost:3000
   ```
3. **Acceso en Red**: Para que otros usuarios de la misma red local (LAN o WiFi) puedan utilizar la plataforma, deben ingresar a su navegador y escribir la dirección IP del equipo donde se está ejecutando el sistema, seguida del puerto `3000`. Ejemplo:
   ```text
   http://192.168.1.X:3000
   ```

## Roles y Niveles de Acceso
El sistema cuenta con un control de acceso basado en roles (RBAC) que habilita distintas funciones dependiendo del usuario conectado:
- ADMINISTRADOR
- JEFE OMAI
- PERSONAL OMAI
- LOGISTICA OMAI
- INTELIGENCIA OMAI
- CMDTE GT 51

*Nota: El Administrador puede gestionar las contraseñas de todos los roles desde el módulo de "Administración".*

## Autoría y Propiedad Intelectual
- **Autor y Desarrollador**: CPCB-SU Carlos Vallejo Ortega
- **Versión**: 1.0.0 — 2026
- **Uso Oficial**: Este sistema es de uso exclusivo de la Armada del Ecuador. Queda estrictamente prohibida su reproducción total o parcial y uso fuera del ámbito institucional autorizado.
