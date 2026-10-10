# protoledger-frontend

Интерфейс проекта [protoledger](https://github.com/protoledger/protoledger). Запуск всего продукта и описание — в основном репозитории.

Nuxt 4 (SPA, `ssr: false`), TypeScript strict, Nuxt UI, Pinia. Сборка — статические файлы, их отдаёт движок или окно настольного приложения.

## Разработка

Нужны Node.js 24 и pnpm.

```bash
pnpm install
pnpm dev:mock   # http://localhost:3000 на примере данных, движок не нужен
pnpm dev        # /api проксируется на движок 127.0.0.1:8080
pnpm lint && pnpm typecheck && pnpm test --run
pnpm generate   # статическая SPA в .output/public
```

С движком в dev-режиме токен передаёт прокси: `PROTOLEDGER_DEV_TOKEN=<токен> pnpm dev`.

## Данные: пример и движок

Экраны получают данные только через `DataSource` (`app/data/`), источник выбирает `NUXT_PUBLIC_DATA_SOURCE`:

| Значение | Что отдаёт |
|---|---|
| `live` (по умолчанию) | движок по контракту; «Границы», «Сравнение» и «Отчёт» — пример данных (эндпоинтов нет), в строке состояния отметка «пример данных» |
| `mock` | всё — пример данных, движок не нужен |

- `app/data/live.ts` — эндпоинты контракта как есть (`openapi-fetch`), токен сессии из `<meta name="protoledger-token">`.
- `app/data/live-research.ts` — модели экранов исследования из ответов движка: действия и обмен, интерпретация и предпросмотр, гипотезы с тестом, прогоны и сравнение.
- `app/data/views.ts` — модели экранов; `app/data/mock/` — пример данных в тех же формах.

## Контракт API

Описание — [`API.md`](https://github.com/protoledger/protoledger-backend/blob/main/API.md) бэкенда. Типы генерируются из `openapi.yaml` (рядом должен лежать клон backend):

```bash
pnpm api:gen                                  # ../backend/openapi.yaml → app/api/schema.d.ts
API_SPEC=путь/к/openapi.yaml pnpm api:gen
```

## Безопасность

Движок отдаёт интерфейс с CSP `default-src 'self'`, поэтому `pnpm generate` выносит встроенные скрипты в файлы (`scripts/externalize-inline-scripts.mjs`). Внешних ресурсов нет: иконки и шрифты встроены. `v-html` запрещён линтером.
