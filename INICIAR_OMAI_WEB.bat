@echo off
title SISTEMA OMAI - Iniciando...
color 0A
echo.
echo  ============================================
echo     SISTEMA OMAI GT 100.51 - INICIO WEB
echo  ============================================
echo.
echo  [1/2] Iniciando servidor OMAI (puerto 3000)...
start "OMAI - Servidor" /min cmd /c "cd /d ""c:\Users\hp\OneDrive\Escritorio\CARLOS VALLEJO\CREACION DE PAGINAS WEB\SISTEMA OMAI"" && node SOPORTE_TECNICO\server.js"

echo  Esperando que el servidor arranque...
timeout /t 4 /nobreak > nul

echo  [2/2] Iniciando tunel ngrok (URL FIJA)...
start "OMAI - Tunel ngrok" /min cmd /c "set PATH=%%PATH%%;C:\Program Files\ngrok && ngrok http 3000 --domain=unarmored-unmoved-persuaded.ngrok-free.dev"

timeout /t 3 /nobreak > nul

echo.
echo  ============================================
echo   SISTEMA OMAI INICIADO CORRECTAMENTE
echo  ============================================
echo.
echo  Acceso LOCAL:  http://localhost:3000
echo.
echo  *** URL FIJA - ACCESO DESDE INTERNET ***
echo.
echo     https://unarmored-unmoved-persuaded.ngrok-free.dev
echo.
echo  (Acceso directo seguro via ngrok)
echo.
echo  IMPORTANTE: Mantener esta ventana abierta.
echo  Si la cierras, el tunel se desconectara.
echo.
pause
