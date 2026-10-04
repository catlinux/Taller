@echo off
chcp 65001 >nul
echo.
echo  ================================================
echo   Instalador de Taller
echo  ================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1" %*
echo.
pause
