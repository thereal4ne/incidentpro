@echo off
echo ==========================================
echo   Starting IncidentPro...
echo ==========================================

echo [1/4] Starting Django server...
start cmd /k "cd /d %~dp0 && python manage.py runserver"

echo [2/4] Starting Redis (Docker)...
docker start redis-server

echo [3/4] Starting Celery worker...
start cmd /k "cd /d %~dp0 && python -m celery -A cicdproject worker --loglevel=info --pool=solo"

echo [4/4] Starting React frontend...
start cmd /k "cd /d %~dp0frontend && npm start"

echo ==========================================
echo   All servers started successfully!
echo   Django  → http://127.0.0.1:8000
echo   React   → http://localhost:3000
echo ==========================================