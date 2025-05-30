@echo off
echo Starting Ally Agent Demo Servers...
echo.

echo Starting Express Web Server (port 3000)...
start "Express Server" cmd /k "npm start"

timeout /t 3 >nul

echo Starting FastAPI Server (port 8080)...
start "FastAPI Server" cmd /k "python -m uvicorn api_server:app --port 8080 --reload"

timeout /t 3 >nul

echo Starting Streamlit App (port 8501)...
start "Streamlit App" cmd /k "streamlit run agent.py"

echo.
echo All servers started!
echo - Web UI: http://localhost:3000
echo - API Server: http://localhost:8080
echo - Streamlit Chat: http://localhost:8501
echo.
pause 