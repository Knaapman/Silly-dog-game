@echo off
rem Silly Park starten: dubbelklik op dit bestand. Zie INSTALL.md.
title Silly Park
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is niet gevonden.
  echo  Installeer eerst Node.js LTS van https://nodejs.org en start de pc opnieuw op.
  echo  Zie INSTALL.md, stap 1.
  echo.
  pause
  exit /b 1
)

echo.
echo  Silly Park wordt klaargezet. De eerste keer duurt dit een paar minuten.
echo  Laat dit venster open zolang er gespeeld wordt: sluiten = stoppen.
echo.
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo  Er ging iets mis bij het klaarzetten. Is er internet? Zie INSTALL.md, "Problemen oplossen".
  echo.
  pause
  exit /b 1
)

call npm run play
echo.
echo  Het spel is gestopt.
pause
