#!/usr/bin/env sh
# FitView launcher for macOS / Linux: installs the one dependency on first run, then starts the app.
cd "$(dirname "$0")" || exit 1
PY=$(command -v python3 || command -v python) || { echo "Python 3.10+ is required: https://www.python.org/downloads/"; exit 1; }
"$PY" -c "import openpyxl" 2>/dev/null || "$PY" -m pip install -r requirements.txt
exec "$PY" -m fitview "$@"
