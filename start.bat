@echo off
chcp 65001 >nul
setlocal
title Калькулятор Лема
cd /d "%~dp0"

echo ==================================================
echo    КАЛЬКУЛЯТОР ЛЕМА - локальный запуск
echo ==================================================
echo.

rem --- 1. Проверяем, что установлен Node.js ---
where node >nul 2>nul
if errorlevel 1 (
    echo [ОШИБКА] Node.js не найден.
    echo Установите Node.js LTS ^(версия 20 или новее^) с сайта https://nodejs.org/
    echo и запустите start.bat ещё раз.
    echo.
    pause
    exit /b 1
)

rem --- 2. Если приложение уже запущено - просто открываем браузер ---
powershell -NoProfile -Command "try{ Invoke-WebRequest -Uri 'http://localhost:3000/api/state' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 }catch{ exit 1 }"
if not errorlevel 1 (
    echo Приложение уже запущено - открываю браузер...
    start "" "http://localhost:3000"
    timeout /t 2 >nul
    exit /b 0
)

rem --- 3. Первый запуск: ставим зависимости и клиент базы данных ---
if not exist "node_modules" (
    echo Первый запуск: устанавливаю зависимости. Это займёт несколько минут...
    echo.
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo [ОШИБКА] Не удалось установить зависимости. Проверьте интернет и запустите start.bat снова.
        pause
        exit /b 1
    )
    call npx prisma generate
    if errorlevel 1 (
        echo.
        echo [ОШИБКА] Не удалось сгенерировать клиент базы данных.
        pause
        exit /b 1
    )
)

if not exist "db\custom.db" (
    echo Создаю базу данных...
    call npx prisma db push
    if errorlevel 1 (
        echo.
        echo [ОШИБКА] Не удалось создать базу данных.
        pause
        exit /b 1
    )
)

rem --- 3а. Синхронизация схемы базы после обновления файлов проекта ---
rem prisma db push идемпотентен: если схема актуальна - завершается за секунду.
rem Применяет новые поля (например, флаг правки автора) и обновляет клиент БД.
echo Проверяю актуальность схемы базы данных...
call npx prisma db push
if errorlevel 1 (
    echo.
    echo [ВНИМАНИЕ] Не удалось обновить схему базы данных.
    echo Если база занята - закройте окно сервера и запустите start.bat снова.
    echo.
)

rem --- 4. Запускаем сервер в отдельном свернутом окне ---
echo Запускаю сервер...
start "Калькулятор Лема - СЕРВЕР (закройте это окно, чтобы остановить приложение)" /min cmd /k "npx next dev -p 3000"

rem --- 5. Через 3 секунды открываем браузер ---
echo Через 3 секунды открою браузер...
timeout /t 3 /nobreak >nul

rem Пока страница загружается (при первом запуске дольше), ждём готовности
rem сервера и открываем браузер сразу, как только он ответит.
powershell -NoProfile -Command "$u='http://localhost:3000/api/state'; for($i=0;$i -lt 120;$i++){ try{ $r=Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -eq 200){ break } }catch{}; Start-Sleep -Milliseconds 500 }; Start-Process 'http://localhost:3000'"

echo.
echo Готово! Приложение открыто на http://localhost:3000
echo.
echo   * Сервер работает в свернутом окне "Калькулятор Лема - СЕРВЕР".
echo   * Чтобы остановить приложение - закройте это окно сервера.
echo   * Если страница не открылась - подождите немного и обновите браузер:
echo     при первом запуске сборка может занять до минуты.
echo.
timeout /t 10 >nul
exit /b 0
