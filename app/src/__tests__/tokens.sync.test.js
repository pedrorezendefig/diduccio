import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MARCA } from '../theme/tokens.js'

// Critério 1 da issue 7: tokens.css e o espelho tokens.js têm a mesma rampa
// brand-* e alert-*, com brand-600 igual a #D4432A.

const css = readFileSync(resolve(__dirname, '../styles/tokens.css'), 'utf8')
const raiz = css.match(/:root\s*\{([\s\S]*?)\n\}/)[1]

function rampaDoCss(prefixo) {
  const rampa = {}
  for (const [, nome, valor] of raiz.matchAll(/--((?:brand|alert)-\d+):\s*(#[0-9A-Fa-f]{6})/g)) {
    if (nome.startsWith(prefixo)) rampa[nome] = valor.toUpperCase()
  }
  return rampa
}

function rampaDoJs(prefixo) {
  return Object.fromEntries(
    Object.entries(MARCA)
      .filter(([nome]) => nome.startsWith(prefixo))
      .map(([nome, valor]) => [nome, valor.toUpperCase()]),
  )
}

describe('tokens da marca', () => {
  it('a cor da marca é o vermelho claro #D4432A nos dois arquivos', () => {
    expect(rampaDoCss('brand-')['brand-600']).toBe('#D4432A')
    expect(MARCA['brand-600'].toUpperCase()).toBe('#D4432A')
  })

  it('a rampa brand do espelho JS é igual à do tokens.css, de 50 a 900', () => {
    const doCss = rampaDoCss('brand-')
    expect(Object.keys(doCss)).toHaveLength(10)
    expect(rampaDoJs('brand-')).toEqual(doCss)
  })

  it('cada tom alert do espelho JS tem o mesmo valor do tokens.css', () => {
    const doCss = rampaDoCss('alert-')
    const doJs = rampaDoJs('alert-')
    expect(Object.keys(doJs).length).toBeGreaterThan(0)
    for (const [nome, valor] of Object.entries(doJs)) {
      expect(doCss[nome], nome).toBe(valor)
    }
  })
})
