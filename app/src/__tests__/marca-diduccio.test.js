import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, extname, relative, sep } from 'node:path'

// Issue 8: o app se apresenta como Diduccio. Nenhum texto que o morador, o
// porteiro ou o síndico veem (telas, título da aba, manifest, PDFs, demo)
// pode citar a marca de origem. Comentário de código pode: ele é tirado
// antes da busca.

const app = resolve(__dirname, '../..')
const MARCA_ANTIGA = /ViT(?![a-z])|VITTA|Vitta/
const TEXTO = new Set(['.js', '.jsx', '.css', '.html', '.svg', '.json', '.webmanifest'])
const TESTES = `${sep}__tests__${sep}`

function arquivos(caminho) {
  if (statSync(caminho).isFile()) return [caminho]
  return readdirSync(caminho).flatMap((nome) => arquivos(join(caminho, nome)))
}

// Troca o comentário por espaços do mesmo tamanho, preservando as quebras de
// linha, para o número da linha do achado continuar certo.
function semComentarios(codigo) {
  const branco = (trecho) => trecho.replace(/[^\n]/g, ' ')
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, branco)
    .replace(/<!--[\s\S]*?-->/g, branco)
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (trecho, antes) => antes + branco(trecho.slice(antes.length)))
}

function achados() {
  const lista = []
  const alvos = ['src', 'public', 'index.html'].map((p) => join(app, p))
  for (const arquivo of alvos.flatMap(arquivos)) {
    if (arquivo.includes(TESTES) || !TEXTO.has(extname(arquivo))) continue
    const linhas = semComentarios(readFileSync(arquivo, 'utf8')).split('\n')
    linhas.forEach((linha, i) => {
      if (MARCA_ANTIGA.test(linha)) lista.push(`${relative(app, arquivo)}:${i + 1}: ${linha.trim()}`)
    })
  }
  return lista
}

describe('marca Diduccio', () => {
  it('nenhum texto visível do app mostra ViT ou VITTA', () => {
    expect(achados()).toEqual([])
  })
})
