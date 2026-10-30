import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, extname, relative } from 'node:path'

// Critério 2 da issue 7: nenhum arquivo em app/src, app/public ou
// app/index.html contém a rampa verde antiga do ViT, nem em hexadecimal
// nem nos rgba equivalentes.

const app = resolve(__dirname, '../..')
const HEX_VERDES = [
  '#F5FAF6', '#E5F0E7', '#CDE0D0', '#ACC7B0', '#7BA482',
  '#4C8055', '#356B47', '#24503A', '#18391F', '#0F2414',
]
// rgba(76,128,85,...) é o #4C8055 e rgba(53,107,71,...) é o #356B47.
const RGBA_VERDE = /rgba?\(\s*(?:76\s*,\s*128\s*,\s*85|53\s*,\s*107\s*,\s*71)\s*[,)]/i
const TEXTO = new Set(['.js', '.jsx', '.css', '.html', '.svg', '.json', '.webmanifest'])
const ESTE_ARQUIVO = resolve(__filename)

function arquivos(caminho) {
  if (statSync(caminho).isFile()) return [caminho]
  return readdirSync(caminho).flatMap((nome) => arquivos(join(caminho, nome)))
}

function achados() {
  const lista = []
  const alvos = ['src', 'public', 'index.html'].map((p) => join(app, p))
  for (const arquivo of alvos.flatMap(arquivos)) {
    if (arquivo === ESTE_ARQUIVO || !TEXTO.has(extname(arquivo))) continue
    const linhas = readFileSync(arquivo, 'utf8').split('\n')
    linhas.forEach((linha, i) => {
      const maiuscula = linha.toUpperCase()
      if (HEX_VERDES.some((hex) => maiuscula.includes(hex)) || RGBA_VERDE.test(linha)) {
        lista.push(`${relative(app, arquivo)}:${i + 1}`)
      }
    })
  }
  return lista
}

describe('rampa verde antiga', () => {
  it('nenhuma cor da rampa verde do ViT sobra no app', () => {
    expect(achados()).toEqual([])
  })
})
