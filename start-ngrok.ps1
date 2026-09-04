Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Starting ngrok Tunnel for Letter Duel (Port 5173)..." -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Both Frontend (React) and Backend (REST + WebSockets) will be"
Write-Host "accessible globally across other laptops & mobile devices!" -ForegroundColor Yellow
Write-Host ""
ngrok http 5173
