@echo off
rem FitView launcher for Windows: installs the one dependency on first run, then starts the app.
cd /d "%~dp0"
where python >nul 2>nul || (echo Python 3.10+ is required: https://www.python.org/downloads/ & pause & exit /b 1)
python -c "import openpyxl" 2>nul || python -m pip install -r requirements.txt
python -m fitview %*
pause
