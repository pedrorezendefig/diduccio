import { describe, it, expect } from 'vitest'
import { chaveDaConta, origemDe } from '../../supabase/functions/entrar/chaves.ts'

// O limite de tentativas do login (Edge Function `entrar`) conta por conta.
// Quem chuta senha não pode zerar o contador escrevendo o mesmo CPF ou e-mail
// de outro jeito (issue #4).
describe('contador de tentativas por conta', () => {
  it('três variações do mesmo CPF somam no mesmo contador', async () => {
    const chaves = await Promise.all([
      chaveDaConta('123.456.789-09', null),
      chaveDaConta('12345678909', null),
      chaveDaConta('123 456 789 09', null),
    ])
    expect(new Set(chaves).size).toBe(1)
  })

  it('variações de caixa e espaço do mesmo e-mail somam no mesmo contador', async () => {
    const chaves = await Promise.all([
      chaveDaConta('ana@x.com', null),
      chaveDaConta('  ANA@X.com ', null),
    ])
    expect(new Set(chaves).size).toBe(1)
  })

  it('com a conta resolvida, o CPF e o e-mail da mesma pessoa somam no mesmo contador', async () => {
    const chaves = await Promise.all([
      chaveDaConta('123.456.789-09', 'ana@x.com'),
      chaveDaConta(' Ana@X.com', 'ana@x.com'),
    ])
    expect(new Set(chaves).size).toBe(1)
  })

  it('contas diferentes não dividem o contador', async () => {
    const [a, b] = await Promise.all([
      chaveDaConta('12345678909', null),
      chaveDaConta('98765432100', null),
    ])
    expect(a).not.toBe(b)
  })
})

// A origem conta as tentativas por IP. O cliente escreve o que quiser no
// começo do `x-forwarded-for`; quem acrescenta o último valor é o proxy.
describe('origem das tentativas', () => {
  it('vem do último valor do x-forwarded-for, que o proxy acrescenta', () => {
    const headers = new Headers({ 'x-forwarded-for': '6.6.6.6, 203.0.113.7' })
    expect(origemDe(headers)).toBe('203.0.113.7')
  })

  it('trocar o valor que o cliente forja não muda a origem', () => {
    const a = new Headers({ 'x-forwarded-for': '1.1.1.1, 203.0.113.7' })
    const b = new Headers({ 'x-forwarded-for': '2.2.2.2, 203.0.113.7' })
    expect(origemDe(a)).toBe(origemDe(b))
  })
})
