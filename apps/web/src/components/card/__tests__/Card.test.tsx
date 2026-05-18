import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Card } from '@/components/card/Card'
import { SUIT_SYMBOL } from '@/lib/cards'
import { MOCK_HAND } from '@/lib/mockCards'

describe('card', () => {
  it('renders rank and suit symbol', () => {
    render(<Card card={MOCK_HAND[0]} />)

    expect(screen.getAllByText('A')).toHaveLength(2)
    expect(screen.getAllByText(SUIT_SYMBOL.S).length).toBeGreaterThan(0)
  })

  it('applies red styling for hearts', () => {
    render(<Card card={MOCK_HAND[1]} />)

    expect(screen.getByRole('img', { name: /k of hearts/i })).toHaveClass(
      'text-red-600',
    )
  })

  it('adds selected highlight styling', () => {
    render(<Card card={MOCK_HAND[0]} selected />)

    expect(screen.getByRole('img', { name: /a of spades/i })).toHaveClass(
      'ring-2',
    )
  })

  it('fires onClick when clicked', () => {
    const handleClick = vi.fn()
    render(<Card card={MOCK_HAND[0]} onClick={handleClick} />)

    fireEvent.click(screen.getByRole('button', { name: /a of spades/i }))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('renders as a non-interactive image element when no onClick is provided', () => {
    render(<Card card={MOCK_HAND[0]} />)

    expect(screen.queryByRole('button')).toBeNull()
    expect(
      screen.getByRole('img', { name: /a of spades/i }),
    ).toBeInTheDocument()
  })

  it('is wrapped with React.memo to prevent unnecessary re-renders', () => {
    expect((Card as { $$typeof?: symbol }).$$typeof).toBe(
      Symbol.for('react.memo'),
    )
  })

  it('applies green ring when highlight="win"', () => {
    render(<Card card={MOCK_HAND[0]} highlight="win" />)

    expect(screen.getByRole('img', { name: /a of spades/i })).toHaveClass(
      'ring-green-500',
    )
  })

  it('applies red ring when highlight="lose"', () => {
    render(<Card card={MOCK_HAND[0]} highlight="lose" />)

    expect(screen.getByRole('img', { name: /a of spades/i })).toHaveClass(
      'ring-red-500',
    )
  })

  it('applies no highlight ring when highlight is omitted', () => {
    render(<Card card={MOCK_HAND[0]} />)

    const el = screen.getByRole('img', { name: /a of spades/i })
    expect(el).not.toHaveClass('ring-green-500')
    expect(el).not.toHaveClass('ring-red-500')
  })

  it('highlight ring coexists with selected ring — highlight takes visual precedence', () => {
    render(<Card card={MOCK_HAND[0]} highlight="win" selected />)

    const el = screen.getByRole('img', { name: /a of spades/i })
    // tailwind-merge keeps the last ring-color class; highlight is applied after
    // selected so ring-green-500 wins visually
    expect(el).toHaveClass('ring-green-500')
  })
})
