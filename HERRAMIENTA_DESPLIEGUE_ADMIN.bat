
@echo off
title HERRAMIENTA DE DESPLIEGUE - SOLO ADMINISTRADOR
color 0C
cls

echo ============================================================
echo   HERRAMIENTA DE PREPARACION DE PAQUETE DE DESPLIEGUE
echo           (USO EXCLUSIVO: ADMINISTRADOR OMAI)
echo ============================================================
echo.

:: Verificacion de Password simple para el script
set /p pass="INGRESE CLAVE DE ADMINISTRADOR PARA CONTINUAR: "
if NOT "%pass%"=="admin" (
    echo.
    echo [ERROR] CLAVE INCORRECTA. ACCESO DENEGADO.
    pause
    exit
)

echo.
echo [OK] CLAVE CORRECTA. INICIANDO PROCESO DE BLINDAJE...
echo.

:: Definir carpeta de destino
set "DEST=C:\OMAI_DISTRIBUCION_LISTA"

if exist "%DEST%" (
    echo Limpiando carpeta de distribucion anterior...
    rd /s /q "%DEST%"
)

echo Creando estructura de carpetas blindada...
mkdir "%DEST%"
mkdir "%DEST%\SOPORTE_TECNICO"

:: Copiar Archivos Raiz Esenciales
echo Copiando archivos del sistema core...
copy "index.html" "%DEST%\" >nul
copy "style.css" "%DEST%\" >nul
copy "database.sqlite" "%DEST%\" >nul
copy "INICIAR_PROGRAMA.bat" "%DEST%\" >nul
copy "ESCUDOARMADA.jpg" "%DEST%\" >nul
copy "package.json" "%DEST%\" >nul

:: Copiar Carpetas Criticas
echo Copiando dependencias (esto puede tardar...)
xcopy "node_modules" "%DEST%\node_modules" /E /I /H /Y /Q >nul
xcopy "SOPORTE_TECNICO" "%DEST%\SOPORTE_TECNICO" /E /I /H /Y /Q >nul

:: ELIMINAR BASURA DE SOPORTE_TECNICO EN EL DESTINO
echo Eliminando archivos de respaldo y desarrollo...
del "%DEST%\SOPORTE_TECNICO\index_ORIGINAL.html" /q >nul
del "%DEST%\SOPORTE_TECNICO\INICIAR_PROGRAMA_ORIGINAL.bat" /q >nul

:: APLICAR ATRIBUTOS DE SEGURIDAD
echo Aplicando atributos de SOLO LECTURA e INTEGRIDAD...
attrib +r "%DEST%\index.html"
attrib +r "%DEST%\style.css"
attrib +r "%DEST%\SOPORTE_TECNICO\*.js"
attrib +r "%DEST%\SOPORTE_TECNICO\server.js"

echo.
echo ============================================================
echo   PROCESO FINALIZADO CON EXITO
echo ============================================================
echo Carpeta lista en: %DEST%
echo.
echo CARPETA LISTA PARA SER COPIADA A OTRAS COMPUTADORAS.
echo (Se han eliminado scripts de Python y archivos de desarrollo).
echo ============================================================
pause
