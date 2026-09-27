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

Перед публичным запуском также стоит добавить регистрацию событий
безопасности и проверить ограничение частоты попыток входа. Конфигурация сервера и сценарии
восстановления должны пройти проверку на самом VPS; локальные тесты не
заменяют её.

## FirstVDS с уже установленным ISPmanager/Nginx

Не отключайте Nginx и службы ISPmanager ради Caddy: они могут обслуживать
панель управления. Для `safonov.gosha2016.fvds.ru` используется отдельный
vhost `deploy/firstvds-nginx.conf`, а существующие конфигурации не меняются.
В нём есть ограничение частоты запросов к `/api/auth/` и лимит загрузки 16 МБ.

На VPS с 1 ГБ ОЗУ добавлен отдельный swap-файл `/swap-finance` (2 ГБ) и
`deploy/finance-swap.service`. Это запас на время сборки, не замена увеличению
ОЗУ. Node.js установлен отдельно в `/opt/node-v24.21.0-linux-x64`;
`finance-frontend.service` использует этот путь. PostgreSQL использует роль
`finance` через локальный Unix-сокет, поэтому строка подключения на этом VPS —
`postgresql+psycopg:///finance_dashboard`, без пароля и сетевого порта.

Сертификат выдаётся Certbot через webroot `/var/www/finance-acme`:

```sh
certbot certonly --webroot -w /var/www/finance-acme \
  -d safonov.gosha2016.fvds.ru \
  --email safonov.gosha2016@yandex.ru \
  --agree-tos --non-interactive --no-eff-email
```

До выдачи сертификата загружается только `deploy/firstvds-acme.conf`;
он отдаёт ACME-проверку, а остальное — 503. После выдачи его заменяют на
`deploy/firstvds-nginx.conf`, проверяют `nginx -t` и перезагружают Nginx.
Certbot timer и `deploy/finance-cert-renew.sh` обновляют сертификат и
перезагружают Nginx после продления. Для общего домена `fvds.ru` возможен
лимит выдачи Let's Encrypt, не связанный с ошибкой настройки приложения.
На текущем VPS `deploy/finance-https-activation.timer` повторяет попытку
ежечасно в 32 минуты UTC, пока сертификат не получен и Nginx-vhost не
активирован. Проверить результат: `systemctl status finance-https-activation`
и `curl -I https://safonov.gosha2016.fvds.ru/login`.
