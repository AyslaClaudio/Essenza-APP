@echo off
chcp 65001 >nul
title Robo WhatsApp - ESSENZA Pizzaria
cd /d "%~dp0"

echo ============================================================
echo   ROBO DE WHATSAPP - ESSENZA PIZZARIA
echo ============================================================
echo.
echo   Iniciando... aguarde a mensagem:
echo   "WhatsApp conectado com sucesso!"
echo.
echo   IMPORTANTE:
echo   - Deixe esta janela ABERTA enquanto quiser o robo no ar.
echo   - Para PARAR o robo, feche esta janela.
echo   - Se pedir QR Code, escaneie com o WhatsApp da pizzaria
echo     (Aparelhos conectados ^> Conectar um aparelho).
echo.
echo ============================================================
echo.

call npm run chatbot

echo.
echo ============================================================
echo   O robo foi encerrado. Feche esta janela ou tecle algo
echo   para tentar iniciar de novo.
echo ============================================================
pause
