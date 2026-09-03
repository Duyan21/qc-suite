import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useRef } from 'react'
import { ToastProvider, useToast } from './toast'

function ToastIdentityProbe() {
  const toast = useToast()
  const identityChanges = useRef(0)
  const seen = useRef(toast)
  if (seen.current !== toast) {
    identityChanges.current += 1
    seen.current = toast
  }

  return (
    <div>
      <span data-testid="identity-changes">{identityChanges.current}</span>
      <button type="button" onClick={() => toast.success('done')}>
        Fire toast
      </button>
    </div>
  )
}

describe('ToastProvider', () => {
  it('keeps the context value referentially stable across re-renders triggered by other toasts', async () => {
    render(
      <ToastProvider>
        <ToastIdentityProbe />
      </ToastProvider>,
    )

    expect(screen.getByTestId('identity-changes')).toHaveTextContent('0')

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Fire toast' }))
    })

    // Firing a toast changes ToastProvider's internal `toasts` state, which
    // re-renders the provider — the context value itself must not change,
    // otherwise every consumer's effects depending on `toast` would refire.
    expect(screen.getByTestId('identity-changes')).toHaveTextContent('0')
  })
})

function useEffectDependingOnToast(onRun: () => void) {
  const toast = useToast()
  useEffect(() => {
    onRun()
  }, [toast, onRun])
}

function EffectProbe({ onRun }: { onRun: () => void }) {
  useEffectDependingOnToast(onRun)
  return null
}

describe('a useEffect depending on useToast()', () => {
  it('does not re-run when an unrelated toast fires elsewhere in the tree', async () => {
    let runCount = 0
    const onRun = () => {
      runCount += 1
    }

    render(
      <ToastProvider>
        <EffectProbe onRun={onRun} />
        <ToastIdentityProbe />
      </ToastProvider>,
    )

    expect(runCount).toBe(1)

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Fire toast' }))
    })

    expect(runCount).toBe(1)
  })
})
