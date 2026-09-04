@echo off
echo ========================================================
echo   Starting ngrok Tunnel for Letter Duel (Port 5173)...
echo ========================================================
echo.
echo Make sure your Backend (port 8001) and Frontend (port 5173)
echo are running before or while this tunnel is active.
echo.
ngrok http 5173
pause
