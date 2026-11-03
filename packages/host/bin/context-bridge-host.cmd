@echo off
rem Fallback launcher using node from PATH (development). Chrome uses the launcher that
rem scripts\install-host.ps1 generates in <vault>\host\, which has node's absolute path.
node "%~dp0..\dist\main.js" %*
