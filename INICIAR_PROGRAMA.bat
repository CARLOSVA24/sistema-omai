@echo off
title SERVIDOR - Gestión de Patrullajes Terrestres
cd /d "%~dp0"

echo ==========================================
echo    INICIANDO SISTEMA OMAI GT 100.51
echo ==========================================
echo.

echo    (Versión Blindada y Protegida)
echo ==========================================
echo.

:: Iniciar el servidor en segundo plano o nueva ventana
echo Iniciando base de datos y servicios...
start "SERVIDOR OMAI" node "SOPORTE_TECNICO\server.js"

echo Esperando respuesta del servidor...
timeout /t 5 >nul

:: Abrir el sistema en Google Chrome
echo Abriendo navegador...
start chrome "http://localhost:3000"

echo.
echo ==========================================
echo    SISTEMA EN LINEA
echo ==========================================
echo.
echo No cierres la ventana que dice "SERVIDOR OMAI".
echo.
echo Para que otros usuarios se conecten, dales la 
echo direccion IP que aparece en la ventana negra.
echo.
pause
