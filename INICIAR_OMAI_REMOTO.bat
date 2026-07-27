@echo off
title SISTEMA OMAI - Servidor Local + Tunel Remoto (sistema-omai.loca.lt)
color 0B
echo.
echo  ======================================================
echo    SISTEMA OMAI GT 100.51 - INICIO REMOTO GLOBAL
echo  ======================================================
echo.
echo  [1/3] Iniciando Servidor Local OMAI (Puerto 3000)...
start "OMAI - Servidor Local" cmd /k "cd /d "%~dp0" && node SOPORTE_TECNICO\server.js"

echo  Esperando 3 segundos a que el servidor inicialice...
timeout /t 3 /nobreak > nul

echo  [2/3] Iniciando Tunel Remoto Personalizado (sistema-omai)...
start "OMAI - Tunel Remoto" cmd /k "cd /d "%~dp0" && npx localtunnel --port 3000 --subdomain sistema-omai"

echo  [3/3] Abriendo navegador local...
timeout /t 2 /nobreak > nul
start chrome "http://localhost:3000"

echo.
echo  ======================================================
echo   SISTEMA OMAI Y TUNEL REMOTO INICIADOS
echo  ======================================================
echo.
echo  1. La direccion personalizada reservada es:
echo     https://sistema-omai.loca.lt
echo.
echo  2. Revisa la ventana "OMAI - Tunel Remoto" para verificar
echo     que diga: url: https://sistema-omai.loca.lt
echo.
echo  3. Comparte esa direccion URL con todos tus usuarios.
echo     Funciona desde cualquier celular (4G/5G) o red.
echo.
echo  ======================================================
echo  IMPORTANTE: No cierres las ventanas de comandos.
echo.
pause
