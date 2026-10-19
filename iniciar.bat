@echo off
cd /d "%~dp0"
if not exist node_modules call npm.cmd install
start "" "http://localhost:5173/#teste"
call npm.cmd run dev
