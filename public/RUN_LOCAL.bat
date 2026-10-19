@echo off
title WaseetAI Frontend - Local Server
echo ============================================================
echo   WaseetAI Platform - Interactive Console & Labs
echo   Connected to Live Cloud Run Backend
echo ============================================================
echo.
echo Starting local web server...
start http://localhost:3000
powershell -NoProfile -ExecutionPolicy Bypass -Command "$port = 3000; while ($port -lt 3200) { if (-not (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue)) { break }; $port++ }; $listener = [System.Net.HttpListener]::new(); $listener.Prefixes.Add(\"http://localhost:$port/\"); $listener.Start(); Write-Host \"Server running at http://localhost:$port (Press Ctrl+C to stop)\"; while ($listener.IsListening) { $ctx = $listener.GetContext(); $path = $ctx.Request.Url.LocalPath; if ($path -eq '/') { $path = '/index.html' }; $file = Join-Path $PSScriptRoot $path.TrimStart('/'); if (Test-Path $file) { $bytes = [System.IO.File]::ReadAllBytes($file); $ext = [System.IO.Path]::GetExtension($file); $mime = switch($ext) { '.html' {'text/html; charset=utf-8'} '.css' {'text/css'} '.js' {'application/javascript'} '.mjs' {'application/javascript'} '.json' {'application/json'} '.png' {'image/png'} '.svg' {'image/svg+xml'} '.pdf' {'application/pdf'} '.wav' {'audio/wav'} default {'application/octet-stream'} }; $ctx.Response.ContentType = $mime; $ctx.Response.ContentLength64 = $bytes.Length; $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length) } else { $ctx.Response.StatusCode = 404; $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not Found'); $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length) }; $ctx.Response.Close() }"
pause
