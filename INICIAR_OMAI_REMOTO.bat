@echo off
title SISTEMA OMAI - Servidor + Dominio Fijo (sistema-omai.ngrok.app)
color 0A
echo.
echo  ======================================================
echo    SISTEMA OMAI GT 100.51 - INICIO REMOTO GLOBAL
echo  ======================================================
echo.
echo  Dominio fijo: https://sistema-omai.ngrok.app
echo  ======================================================
echo.
echo  [1/3] Iniciando Servidor Local OMAI (Puerto 3000)...
start "OMAI - Servidor Local" cmd /k "cd /d "%~dp0" && node SOPORTE_TECNICO\server.js"

echo  Esperando 4 segundos a que el servidor inicialice...
timeout /t 4 /nobreak > nul

echo  [2/3] Iniciando Tunel con Dominio Fijo (ngrok)...
start "OMAI - Tunel ngrok" cmd /k "ngrok http --url=sistema-omai.ngrok.app 3000"

echo  [3/3] Abriendo navegador local...
timeout /t 3 /nobreak > nul
start chrome "http://localhost:3000"

echo.
echo  ======================================================
echo   SISTEMA OMAI INICIADO CORRECTAMENTE
echo  ======================================================
echo.
echo  URL FIJA PARA TODOS LOS USUARIOS:
echo.
echo     https://sistema-omai.ngrok.app
echo.
echo  Esta URL NUNCA cambia. Compartela con todos
echo  los usuarios. Funciona desde cualquier red
echo  o celular (4G/5G/WiFi).
echo.
echo  ======================================================
echo  IMPORTANTE: No cierres las ventanas de comandos.
echo  ======================================================
echo.
pause
