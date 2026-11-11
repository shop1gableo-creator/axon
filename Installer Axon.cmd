@echo off
chcp 65001 >nul
title Installation d'Axon
echo.
echo  Installation d'Axon : une fenetre va faire tout le travail. Ne la ferme pas.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\installer.ps1"
if errorlevel 1 (
  echo.
  echo  L'installation s'est arretee. Lis le message ci-dessus, puis relance Installer Axon.cmd.
)
echo.
pause
