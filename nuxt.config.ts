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
  // SVG-режим: CSS-режим вставляет <style>, которые запрещены CSP движка.
  icon: { mode: 'svg', provider: 'none', clientBundle: { scan: { globInclude: ['app/**/*.{vue,ts}'] } } },
  fonts: { providers: { google: false, googleicons: false, bunny: false, fontshare: false, fontsource: false, adobe: false } },
  ui: { colorMode: true },
  colorMode: { preference: 'dark', fallback: 'dark', storageKey: 'protoledger-theme' },
  app: {
    head: {
      htmlAttrs: { lang: 'ru' },
      title: 'protoledger',
      // Тег с токеном сессии добавляет движок при отдаче index.html. Здесь его нет намеренно:
      // после гидрации Nuxt перезаписал бы настоящий токен заглушкой.
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
  hooks: {
    // Плагин цветов Nuxt UI вставляет <style>, запрещённый CSP; переменные заданы в main.css.
    'app:resolve'(app) {
      app.plugins = app.plugins.filter(p => !(typeof p === 'string' ? p : p.src).includes('@nuxt/ui/dist/runtime/plugins/colors'))
    },
  },
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
