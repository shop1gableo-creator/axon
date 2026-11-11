@echo off
chcp 65001 >nul
title Desinstallation d'Axon
echo.
echo  Desinstaller Axon : retire l'app, les raccourcis et le branchement de Claude.
echo  TON CERVEAU (tes notes, dans ton Drive ou sur ton PC) N'EST PAS TOUCHE.
echo.
set /p OK=Continuer ? (o/n)
if /i not "%OK%"=="o" exit /b
set APP=%USERPROFILE%\Axon\app
if exist "%APP%\cli\brain.mjs" node "%APP%\cli\brain.mjs" debrancher
del "%USERPROFILE%\Desktop\Axon.lnk" 2>nul
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Axon.lnk" 2>nul
for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do del "%%D\Axon.lnk" 2>nul
rmdir /s /q "%APP%"
del "%USERPROFILE%\Axon\Guide Axon.html" 2>nul
echo.
echo  Axon est desinstalle. Tes reglages sont dans %APPDATA%\axon (supprime ce dossier si tu veux repartir de zero).
pause
