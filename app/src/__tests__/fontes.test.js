import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Critério 3 da issue 7: --font-display e --font-ui apontam para
// "Plus Jakarta Sans", e o .woff2 que o @font-face carrega existe em
// app/public/fonts/.

const app = resolve(__dirname, '../..')
const tokens = readFileSync(resolve(app, 'src/styles/tokens.css'), 'utf8')
const base = readFileSync(resolve(app, 'src/styles/base.css'), 'utf8')

function primeiraFonte(variavel) {
  const valor = tokens.match(new RegExp(`--${variavel}:\\s*([^;]+);`))[1]
  return valor.split(',')[0].trim().replace(/^["']|["']$/g, '')
}

describe('fontes do app', () => {
  it('título e texto usam Plus Jakarta Sans', () => {
    expect(primeiraFonte('font-display')).toBe('Plus Jakarta Sans')
    expect(primeiraFonte('font-ui')).toBe('Plus Jakarta Sans')
  })

  it('o arquivo .woff2 da Plus Jakarta Sans existe em public/fonts', () => {
    const faces = [...base.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)].map((m) => m[1])
    const face = faces.find((f) => /font-family:\s*"Plus Jakarta Sans"/.test(f))
    expect(face).toBeDefined()
    const url = face.match(/url\("\/(fonts\/[^"]+\.woff2)"\)/)[1]
    expect(existsSync(resolve(app, 'public', url)), url).toBe(true)
  })
})
