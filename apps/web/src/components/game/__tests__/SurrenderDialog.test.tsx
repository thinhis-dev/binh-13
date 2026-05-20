import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SurrenderDialog } from '../SurrenderDialog'

describe('surrenderDialog', () => {
  it('renders a Surrender button', () => {
    render(<SurrenderDialog onSurrender={vi.fn()} />)
    expect(screen.getByRole('button', { name: /surrender/i })).toBeInTheDocument()
  })

  it('button click opens the confirmation dialog', async () => {
    const user = userEvent.setup()
    render(<SurrenderDialog onSurrender={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /surrender/i }))

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('dialog shows warning message about losing the round', async () => {
    const user = userEvent.setup()
    render(<SurrenderDialog onSurrender={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /surrender/i }))

    expect(screen.getByText(/lose this round immediately/i)).toBeInTheDocument()
  })

  it('cancel button closes the dialog without calling onSurrender', async () => {
    const user = userEvent.setup()
    const onSurrender = vi.fn()
    render(<SurrenderDialog onSurrender={onSurrender} />)

    await user.click(screen.getByRole('button', { name: /surrender/i }))
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onSurrender).not.toHaveBeenCalled()
  })

  it('confirm button calls onSurrender callback', async () => {
    const user = userEvent.setup()
    const onSurrender = vi.fn()
    render(<SurrenderDialog onSurrender={onSurrender} />)

    await user.click(screen.getByRole('button', { name: /surrender/i }))
    // Confirm button is inside the dialog — its text is "Surrender" too,
    // but it's the destructive confirm action inside alertdialog
    const confirmBtn = screen.getAllByRole('button', { name: /surrender/i }).find(
      btn => btn.closest('[role="alertdialog"]'),
    )
    await user.click(confirmBtn!)

    expect(onSurrender).toHaveBeenCalledOnce()
  })

  it('trigger button is disabled when disabled prop is true', () => {
    render(<SurrenderDialog onSurrender={vi.fn()} disabled />)
    expect(screen.getByRole('button', { name: /surrender/i })).toBeDisabled()
  })
})
