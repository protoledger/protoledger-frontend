const devToken = process.env.PROTOLEDGER_DEV_TOKEN ?? ''

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  // SPA: статическая сборка (pnpm generate), её отдаёт движок или оборачивает Tauri.
  ssr: false,
  devtools: { enabled: false },
  telemetry: false,
  typescript: { strict: true, typeCheck: false },
  modules: ['@nuxt/eslint', '@nuxt/ui', '@pinia/nuxt'],
  css: ['~/assets/css/main.css'],
  // Иконки и шрифты только локальные: интерфейс работает офлайн.
  icon: { provider: 'none', clientBundle: { scan: true } },
  fonts: { providers: { google: false, googleicons: false, bunny: false, fontshare: false, fontsource: false, adobe: false } },
  ui: { colorMode: true },
  colorMode: { preference: 'dark', fallback: 'dark', storageKey: 'protoledger-theme' },
  app: {
    head: {
      htmlAttrs: { lang: 'ru' },
      title: 'protoledger',
      // Движок подставляет токен сессии при отдаче index.html.
      meta: [{ name: 'protoledger-token', content: '__PROTOLEDGER_TOKEN__' }],
    },
  },
  runtimeConfig: {
    public: {
      // mock — пример данных; live — движок по контракту, экраны вне контракта остаются на примере.
      dataSource: 'live',
    },
  },
  // Встроенная importmap запрещена CSP движка (script-src 'self').
  experimental: { entryImportMap: false },
  nitro: {
    devProxy: {
      '/api': {
        target: 'http://127.0.0.1:8080/api',
        changeOrigin: true,
        headers: devToken ? { 'X-Protoledger-Token': devToken } : {},
      },
    },
  },
})
