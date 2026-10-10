import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  ignores: ['app/api/schema.d.ts'],
}, {
  rules: {
    // Строки из данных только интерполяцией: защита от внедрения разметки.
    'vue/no-v-html': 'error',
  },
})
