@echo off
title CRM Atendimento
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nao encontrado.
  echo Instale a versao LTS em https://nodejs.org e depois abra este arquivo de novo.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando o que o sistema precisa. Isso acontece so na primeira vez...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo Nao foi possivel instalar. Verifique a conexao com a internet e tente de novo.
    pause
    exit /b 1
  )
)

echo.
echo Iniciando o CRM. O navegador vai abrir em http://localhost:3100
echo Para parar o sistema, feche esta janela.
echo.
start "" /b cmd /c "timeout /t 3 >nul & start "" http://localhost:3100"
call npm start
pause
