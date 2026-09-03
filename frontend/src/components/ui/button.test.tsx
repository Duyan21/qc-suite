import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './button'

describe('Button', () => {
  it('renders its label and responds to clicks', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)

    const button = screen.getByRole('button', { name: 'Save' })
    await userEvent.click(button)

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} disabled>
        Save
      </Button>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onClick).not.toHaveBeenCalled()
  })

  it('applies the requested variant and size as data attributes', () => {
    render(
      <Button variant="destructive" size="sm">
        Delete
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Delete' })
    expect(button).toHaveAttribute('data-variant', 'destructive')
    expect(button).toHaveAttribute('data-size', 'sm')
  })
})
