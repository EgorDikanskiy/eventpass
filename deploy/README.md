# EventPass на VPS

EventPass запускается через существующий Docker Compose. Фронтенд и API доступны через Nginx внутри контейнера `frontend`. Compose публикует его только на `127.0.0.1:8090`. На VPS публичный HTTPS принимает Caddy и передаёт запросы этому контейнеру. Один Caddy может обслуживать несколько проектов на разных доменах.

## DNS и сервер

В DNS-зоне добавьте запись A для домена или поддомена EventPass со значением публичного IPv4 сервера. Добавляйте AAAA, если у VPS настроен входящий IPv6 на портах 80 и 443. Убедитесь, что записи нужного имени указывают на VPS.

На сервере понадобятся [Docker Engine и Compose](https://docs.docker.com/engine/install/) и [Caddy](https://caddyserver.com/docs/install). Для публичного сайта разрешите входящие TCP-подключения на 80 и 443 в панели VPS и в файрволе сервера. Сохраните доступ по SSH.

## Запуск

Передайте исходники на VPS и выполните команды из корня EventPass. Замените `events.example.com` на своё имя. Команда создаёт `.env` только при первом запуске и генерирует отдельные пароли для PostgreSQL, RabbitMQ и S3.

```bash
(
  set -C
  umask 077
  {
    printf '%s\n' 'FRONTEND_URL=https://events.example.com' 'FRONTEND_PORT=8090'
    for variable in POSTGRES_PASSWORD RABBITMQ_PASSWORD S3_SECRET_KEY; do
      printf '%s=%s\n' "$variable" "$(openssl rand -hex 32)"
    done
  } > .env
)
docker compose config --quiet
docker compose up --build -d --wait
curl --fail http://127.0.0.1:8090/api/health
```

Добавьте блок в конфигурацию Caddy. Подставьте тот же домен и порт. Если веб-прокси уже обслуживает другие проекты, добавьте маршрут в его конфигурацию.

```caddyfile
events.example.com {
    reverse_proxy 127.0.0.1:8090
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
curl --fail https://events.example.com/api/health
```

Сертификат выпускается после того, как домен указывает на VPS и порты доступны извне.

## Почта

По умолчанию письма попадают в Mailpit на VPS. Для проверки откройте SSH-туннель с компьютера и перейдите на [localhost:18025](http://localhost:18025).

```bash
ssh -N -L 18025:127.0.0.1:8025 user@server
```

Для отправки писем участникам добавьте в `.env` параметры SMTP, предоставленные почтовым сервисом. Пример для STARTTLS:

```dotenv
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_STARTTLS=true
SMTP_FROM=eventpass@example.com
SMTP_USERNAME=eventpass@example.com
SMTP_PASSWORD='пароль приложения'
```

Примените настройки через `docker compose up -d --wait`, затем проверьте доставку письма при регистрации и переход по ссылке из него.

При обновлении исходников используйте `docker compose up --build -d --wait`. Сохраняйте файл `.env` и именованные тома PostgreSQL, RabbitMQ и S3 при повторных запусках.
