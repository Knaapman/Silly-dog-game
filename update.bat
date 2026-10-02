@echo off
rem Silly Park bijwerken naar de nieuwste versie, en daarna starten. Zie INSTALL.md.
title Silly Park bijwerken
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Git is niet gevonden. Installeer Git for Windows van https://git-scm.com/download/win,
  echo  of werk bij door de ZIP opnieuw te downloaden. Zie INSTALL.md, "Bijwerken".
  echo.
  pause
  exit /b 1
)
if not exist ".git" (
  echo.
  echo  Deze map is geen Git-kopie: het spel is als ZIP gedownload.
  echo  Werk bij door de ZIP opnieuw te downloaden. Zie INSTALL.md, "Bijwerken".
  echo.
  pause
  exit /b 1
)

echo.
echo  De nieuwste versie wordt opgehaald...
echo.
git checkout main
git pull --ff-only
if errorlevel 1 (
  echo.
  echo  Bijwerken lukte niet. Is er internet? Zie INSTALL.md, "Problemen oplossen".
  echo.
  pause
  exit /b 1
)

call "%~dp0play.bat"
