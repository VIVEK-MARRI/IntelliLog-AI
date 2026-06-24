@echo off
cd /d C:\vivek\IntelliLog-AI\frontend
SET PORT=5173
START /MIN "IntelliLogFrontend" npx vite --host 0.0.0.0 --port 5173
