// CSP движка — default-src 'self': встроенные <script> запрещены.
// После nuxt generate переносим исполняемые встроенные скрипты в файлы, порядок выполнения сохраняется.
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.argv[2] ?? '.output/public'
const assets = '_nuxt'
const inline = /<script(?![^>]*\bsrc=)(?![^>]*type="application\/json")([^>]*)>([\s\S]*?)<\/script>/g

async function htmlFiles(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await htmlFiles(p))
    else if (entry.name.endsWith('.html')) out.push(p)
  }
  return out
}

let moved = 0
for (const file of await htmlFiles(root)) {
  const html = await readFile(file, 'utf8')
  const pending = []
  const result = html.replace(inline, (whole, attrs, code) => {
    if (/type="importmap"/.test(attrs)) throw new Error(`${file}: встроенная importmap несовместима с CSP`)
    if (!code.trim()) return whole
    const name = `inline-${createHash('sha256').update(code).digest('hex').slice(0, 12)}.js`
    pending.push(writeFile(join(root, assets, name), code))
    moved++
    return `<script src="/${assets}/${name}"></script>`
  })
  await Promise.all(pending)
  await writeFile(file, result)
}
console.log(`встроенных скриптов вынесено: ${moved}`)
