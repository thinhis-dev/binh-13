import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HandArea } from '@/components/game/HandArea'
import { MOCK_HAND } from '@/lib/mockCards'

describe('handArea', () => {
  it('renders all cards in hand', () => {
    render(
      <HandArea
        cards={MOCK_HAND}
        selectedCardId={null}
        onCardClick={vi.fn()}
      />,
    )

    expect(screen.getAllByTestId('playing-card')).toHaveLength(13)
  })

  it('calls onCardClick when a card is clicked', () => {
    const handleCardClick = vi.fn()
    render(
      <HandArea
        cards={MOCK_HAND}
        selectedCardId={null}
        onCardClick={handleCardClick}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /a of spades/i }))

    expect(handleCardClick).toHaveBeenCalledWith(MOCK_HAND[0])
  })

  it('passes selected state to the selected card', () => {
    render(
      <HandArea cards={MOCK_HAND} selectedCardId="AS" onCardClick={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: /a of spades/i })).toHaveClass(
      'ring-2',
    )
  })

  it('applies droppable hover styling', () => {
    render(
      <HandArea
        cards={MOCK_HAND}
        selectedCardId={null}
        onCardClick={vi.fn()}
        isOver
      />,
    )

    expect(screen.getByTestId('hand-area')).toHaveClass('border-emerald-500')
  })

  describe('sort button', () => {
    it('renders the Sort button when hand has cards', () => {
      render(
        <HandArea
          cards={MOCK_HAND}
          selectedCardId={null}
          onCardClick={vi.fn()}
          onSort={vi.fn()}
        />,
      )

      expect(screen.getByRole('button', { name: /sort/i })).toBeInTheDocument()
    })

    it('calls onSort when Sort button is clicked', () => {
      const onSort = vi.fn()
      render(
        <HandArea
          cards={MOCK_HAND}
          selectedCardId={null}
          onCardClick={vi.fn()}
          onSort={onSort}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /sort/i }))

      expect(onSort).toHaveBeenCalledOnce()
    })

    it('does not render the Sort button when hand is empty', () => {
      render(
        <HandArea
          cards={[]}
          selectedCardId={null}
          onCardClick={vi.fn()}
          onSort={vi.fn()}
        />,
      )

      expect(
        screen.queryByRole('button', { name: /sort/i }),
      ).not.toBeInTheDocument()
    })

    it('does not render the Sort button when onSort prop is omitted', () => {
      render(
        <HandArea
          cards={MOCK_HAND}
          selectedCardId={null}
          onCardClick={vi.fn()}
        />,
      )

      expect(
        screen.queryByRole('button', { name: /sort/i }),
      ).not.toBeInTheDocument()
    })
  })
})
