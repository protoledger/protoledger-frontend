# protoledger-frontend

Интерфейс проекта [protoledger](https://github.com/protoledger/protoledger). Запуск всего продукта и описание — в основном репозитории.

## Разработка

```bash
pnpm install
pnpm dev        # http://localhost:3000, /api проксируется на движок :8080
pnpm lint && pnpm typecheck && pnpm test
pnpm generate   # статическая SPA в .output/public
```

API: [`API.md`](https://github.com/protoledger/protoledger-backend/blob/main/API.md) бэкенда, типы генерируются из `openapi.yaml`.
