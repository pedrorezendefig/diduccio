import { describe, it, expect } from 'vitest'
import * as permissions from '../auth/permissions.js'

describe('permissions', () => {
  it('exporta as regras de acesso por cargo', () => {
    expect(Object.keys(permissions).length).toBeGreaterThan(0)
  })
})
