import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DriveImage, PIXEL_TRANSPARENTE } from '../components/DriveImage.jsx'

const FOTO_A = 'https://bucket.exemplo.com/fotos/a.jpg'
const FOTO_B = 'https://bucket.exemplo.com/fotos/b.jpg'

describe('DriveImage', () => {
  it('troca o src que falhou pelo pixel transparente', () => {
    render(<DriveImage source={FOTO_A} alt="foto" />)
    const img = screen.getByAltText('foto')
    expect(img).toHaveAttribute('src', FOTO_A)

    fireEvent.error(img)

    expect(img).toHaveAttribute('src', PIXEL_TRANSPARENTE)
  })

  it('mostra o src novo quando o source muda depois de uma falha', () => {
    const { rerender } = render(<DriveImage source={FOTO_A} alt="foto" />)
    fireEvent.error(screen.getByAltText('foto'))

    rerender(<DriveImage source={FOTO_B} alt="foto" />)

    expect(screen.getByAltText('foto')).toHaveAttribute('src', FOTO_B)
  })
})
