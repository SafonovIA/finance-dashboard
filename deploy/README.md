# Развёртывание на одном Linux VPS

Эти файлы рассчитаны на домен с HTTPS, PostgreSQL и два локальных процесса:
Node/Vinext (`127.0.0.1:3101`) и FastAPI (`127.0.0.1:8001`). Caddy
принимает публичные запросы и отправляет их в FastAPI; API проксирует
остальные запросы локальному фронтенду. Оба внутренних порта и PostgreSQL
должны быть закрыты от Интернета.

## Подготовка

- Linux VPS (для всех трёх процессов на одном сервере разумно начать с 2 CPU,
  4 ГБ RAM и 60 ГБ диска), домен и DNS-запись A на IP сервера.
- Python 3.12, Node.js не ниже 22.13, PostgreSQL, Caddy, Git.
- Системный пользователь `finance`, каталог `/opt/finance-dashboard`, доступ
  к приватному GitHub-репозиторию. Значения путей в service-файлах нужно
  изменить, если каталог или путь к Node отличаются.
- Открыть снаружи только SSH, 80 и 443. Установить обновления безопасности.

## Приложение и база

1. Клонировать репозиторий в `/opt/finance-dashboard` и передать каталог
   пользователю `finance`.
2. Создать БД `finance_dashboard` и отдельного пользователя PostgreSQL с
   сильным паролем. Не использовать локальные `postgres:postgres` на сервере.
3. Если нужны текущие данные, сделать на локальном компьютере дамп
   `pg_dump -Fc -f finance_dashboard.dump finance_dashboard`, безопасно
   передать его на сервер и восстановить в **пустую** БД через `pg_restore`.
   Если нужны новые пустые данные, дамп не требуется.
4. Скопировать `deploy/production.env.example` в корневой `.env`, заменить
   домен, пароль БД и SMTP. Задать права `chmod 600 .env` и владельца `finance`.
   Не коммитить и не публиковать этот файл. При пароле БД со специальными
   символами его нужно URL-кодировать в `DATABASE_URL`.
5. Под пользователем `finance` выполнить:

   ```sh
   python3.12 -m venv .venv
   .venv/bin/pip install -r backend/requirements.txt
   npm ci
   npm run build:node
   .venv/bin/alembic -c backend/alembic.ini upgrade head
   ```

   `npm run build` и `npm start` относятся к прежнему Cloudflare/Sites-режиму.
   На VPS использовать только `build:node` и standalone Node-сервер.

## Автозапуск и HTTPS

1. Скопировать `deploy/finance-frontend.service` и
   `deploy/finance-api.service` в `/etc/systemd/system/`.
2. Скопировать `deploy/Caddyfile.example` в `/etc/caddy/Caddyfile`, заменив
   `budget.example.com` на ваш домен. DNS уже должен указывать на VPS;
   Caddy получит сертификат при доступных портах 80/443.
3. Выполнить `systemctl daemon-reload`, затем
   `systemctl enable --now finance-frontend finance-api caddy`.
4. Проверить `https://ваш-домен/healthz` (ответ `{"status":"ok"}`), страницу
   входа, загрузку Excel и отправку письма подтверждения. Логи:
   `journalctl -u finance-api -u finance-frontend -f`.

FastAPI должен доверять заголовкам прокси **только** от локального Caddy.
Сервис запускает Uvicorn с `--proxy-headers` и
`--forwarded-allow-ips=127.0.0.1`; иначе HTTPS-схема запросов, проверка
Origin и cookie входа будут работать неверно.

## Резервирование и обновления

Настроить регулярные `pg_dump -Fc` во внешнее хранилище, следить за свободным
местом и периодически проверять восстановление. Перед обновлением кода или
миграцией сначала сделать свежий дамп. Обновление: получить код, установить
зависимости при их изменении, собрать `npm run build:node`, выполнить
`alembic upgrade head`, перезапустить оба сервиса и проверить `/healthz`.

Перед публичным запуском также стоит добавить ограничение частоты попыток
входа и регистрацию событий безопасности. Конфигурация сервера и сценарии
восстановления должны пройти проверку на самом VPS; локальные тесты не
заменяют её.
