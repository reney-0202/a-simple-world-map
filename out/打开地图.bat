@echo off
setlocal
title 1980 World Map - Equal Earth
cd /d "%~dp0"
echo.
echo   1980 Cold War World Map  (Equal Earth, provinces)
echo   Starting local server, your browser will open shortly...
echo.
where python >nul 2>nul
if errorlevel 1 goto nopython
python serve.py
goto done
:nopython
echo   [ERROR] python was not found in PATH.
echo   Install Python 3 (https://www.python.org/downloads/) and retry.
pause
:done
endlocal
