# Подключение бэкенда

Для запуска всего приложения выполните `docker compose up --build -d` из корня проекта. Nginx отдаёт фронтенд в HTTP-режиме на порту 8090 и проксирует запросы FastAPI. Mailpit принимает письма на порту 8025.

Для разработки интерфейса можно использовать Vite отдельно от Compose.

## Шаг 1. Включить HTTP-режим

Создайте `.env.local` (он в `.gitignore`):

```env
VITE_API_MODE=http
VITE_API_URL=/api
VITE_PROXY_TARGET=http://localhost:8090
```

- `VITE_API_URL=/api` + `VITE_PROXY_TARGET` — dev-сервер Vite проксирует `/api/*` на бэкенд, поэтому CORS настраивать не нужно. Если бэкенд ждёт пути без префикса `/api`, добавьте в `vite.config.ts` в прокси `rewrite: (path) => path.replace(/^\/api/, '')`.
- Для продакшена `VITE_API_URL` можно задать полным адресом: `https://api.eventpass.ru`.

Перезапустите `npm run dev`. Кнопка «Демо» в этом режиме исчезает.

## Проверка

Swagger UI доступен по `/api/docs`. Контракт фронтенда описан в [API.md](API.md). Для тестирования браузера и API на запущенном стеке выполните `npm test`. Моковый режим по-прежнему доступен при `VITE_API_MODE=mock`.
