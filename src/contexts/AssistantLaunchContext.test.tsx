import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  AssistantLaunchProvider,
  useAssistantLauncher,
  useAssistantLaunchRequests,
} from './AssistantLaunchContext'

const wrapper = ({ children }: { children: ReactNode }) => (
  <AssistantLaunchProvider>{children}</AssistantLaunchProvider>
)

function useBoth() {
  return { launcher: useAssistantLauncher(), requests: useAssistantLaunchRequests() }
}

describe('AssistantLaunchContext', () => {
  it('bumps nonce and delivers the seed exactly once', () => {
    const { result } = renderHook(useBoth, { wrapper })
    expect(result.current.requests.nonce).toBe(0)

    act(() => result.current.launcher.openAssistant({ message: 'plan my day', autoSend: true }))
    expect(result.current.requests.nonce).toBe(1)

    let seed: unknown
    act(() => { seed = result.current.requests.consumeSeed() })
    expect(seed).toEqual({ message: 'plan my day', autoSend: true })

    act(() => { seed = result.current.requests.consumeSeed() })
    expect(seed).toBeNull()
  })

  it('openAssistant with no seed still bumps nonce (plain open)', () => {
    const { result } = renderHook(useBoth, { wrapper })
    act(() => result.current.launcher.openAssistant())
    expect(result.current.requests.nonce).toBe(1)
    let seed: unknown = 'sentinel'
    act(() => { seed = result.current.requests.consumeSeed() })
    expect(seed).toBeNull()
  })

  it('is a safe no-op outside the provider', () => {
    const { result } = renderHook(useBoth)
    expect(() => result.current.launcher.openAssistant({ message: 'x' })).not.toThrow()
    expect(result.current.requests.nonce).toBe(0)
    expect(result.current.requests.consumeSeed()).toBeNull()
  })
})
