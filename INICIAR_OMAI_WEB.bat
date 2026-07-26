@echo off
title SISTEMA OMAI - Iniciando...
color 0A
echo.
echo  ============================================
echo     SISTEMA OMAI GT 100.51 - INICIO WEB
echo  ============================================
echo.
echo  [1/2] Iniciando servidor OMAI (puerto 3000)...
start "OMAI - Servidor" /min cmd /c "cd /d "%~dp0" && node SOPORTE_TECNICO\server.js"

echo  Esperando que el servidor arranque...
timeout /t 3 /nobreak > nul

echo  [2/2] Abriendo navegador...
start chrome "http://localhost:3000"

echo.
echo  ============================================
echo   SISTEMA OMAI INICIADO CORRECTAMENTE
echo  ============================================
echo.
echo  - Acceso LOCAL:  http://localhost:3000
echo.
echo  - Acceso RED LOCAL (Otras computadoras en la misma red):
echo    Abre el navegador en las otras computadoras e ingresa:
echo    http://[IP_DE_ESTE_EQUIPO]:3000
echo.
echo  ============================================
echo  IMPORTANTE: Mantener abierta la ventana del servidor.
echo.
pause

