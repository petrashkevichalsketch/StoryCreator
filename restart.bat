@echo off
chcp 65001 >nul
setlocal
title Калькулятор Лема - перезапуск с очисткой кэша
cd /d "%~dp0"

echo ==================================================
echo    КАЛЬКУЛЯТОР ЛЕМА - перезапуск с очисткой кэша
echo ==================================================
echo.
echo Лечит ошибки вида «Сервер ответил HTML вместо JSON» и «HTTP 404»
echo при нажатии кнопок: останавливает сервер, чистит кэш сборки
echo и запускает приложение заново.
echo.

rem --- Шаг 1. Останавливаем сервер на порту 3000, если он работает ---
echo Шаг 1. Останавливаю сервер...
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue; if ($c) { $c | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Write-Host ('   останавливаю процесс ' + $_); taskkill /PID $_ /T /F 2>$null | Out-Null }; Start-Sleep -Seconds 1 } else { Write-Host '   сервер не был запущен' }"

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"
if errorlevel 1 (
    echo.
    echo [ВНИМАНИЕ] Не удалось освободить порт 3000 автоматически.
    echo Закройте вручную окно "Калькулятор Лема - СЕРВЕР" и запустите restart.bat снова.
    echo.
    pause
    exit /b 1
)

rem --- Шаг 2. Удаляем кэш сборки (частая причина 404 и HTML-ошибок) ---
echo Шаг 2. Удаляю кэш сборки .next ...
if exist ".next" rmdir /s /q ".next"

echo.
echo Шаг 3. Запускаю приложение...
echo.
call start.bat
