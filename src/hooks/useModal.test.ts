import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useModal, useModalWithData } from './useModal'

describe('useModal', () => {
  describe('initial state', () => {
    it('starts closed by default', () => {
      const { result } = renderHook(() => useModal())
      expect(result.current.isOpen).toBe(false)
    })

    it('can start open if specified', () => {
      const { result } = renderHook(() => useModal(true))
      expect(result.current.isOpen).toBe(true)
    })
  })

  describe('open', () => {
    it('opens the modal', () => {
      const { result } = renderHook(() => useModal())

      act(() => {
        result.current.open()
      })

      expect(result.current.isOpen).toBe(true)
    })
  })

  describe('close', () => {
    it('closes the modal', () => {
      const { result } = renderHook(() => useModal(true))

      act(() => {
        result.current.close()
      })

      expect(result.current.isOpen).toBe(false)
    })
  })

  describe('toggle', () => {
    it('toggles from closed to open', () => {
      const { result } = renderHook(() => useModal())

      act(() => {
        result.current.toggle()
      })

      expect(result.current.isOpen).toBe(true)
    })

    it('toggles from open to closed', () => {
      const { result } = renderHook(() => useModal(true))

      act(() => {
        result.current.toggle()
      })

      expect(result.current.isOpen).toBe(false)
    })
  })

  describe('callback stability', () => {
    it('maintains stable callbacks across renders', () => {
      const { result, rerender } = renderHook(() => useModal())

      const { open, close, toggle } = result.current
      rerender()

      expect(result.current.open).toBe(open)
      expect(result.current.close).toBe(close)
      expect(result.current.toggle).toBe(toggle)
    })
  })
})

describe('useModalWithData', () => {
  interface TestData {
    id: string
    name: string
  }

  describe('initial state', () => {
    it('starts closed with null data by default', () => {
      const { result } = renderHook(() => useModalWithData<TestData>())

      expect(result.current.isOpen).toBe(false)
      expect(result.current.data).toBeNull()
    })

    it('can start with initial data', () => {
      const initialData: TestData = { id: '1', name: 'Test' }
      const { result } = renderHook(() => useModalWithData<TestData>(true, initialData))

      expect(result.current.isOpen).toBe(true)
      expect(result.current.data).toEqual(initialData)
    })
  })

  describe('openWith', () => {
    it('opens with the provided data', () => {
      const { result } = renderHook(() => useModalWithData<TestData>())
      const testData: TestData = { id: '2', name: 'Item' }

      act(() => {
        result.current.openWith(testData)
      })

      expect(result.current.isOpen).toBe(true)
      expect(result.current.data).toEqual(testData)
    })

    it('replaces existing data when opened with new data', () => {
      const { result } = renderHook(() => useModalWithData<TestData>())
      const firstData: TestData = { id: '1', name: 'First' }
      const secondData: TestData = { id: '2', name: 'Second' }

      act(() => {
        result.current.openWith(firstData)
      })

      act(() => {
        result.current.openWith(secondData)
      })

      expect(result.current.data).toEqual(secondData)
    })
  })

  describe('close', () => {
    it('closes and clears data', () => {
      const { result } = renderHook(() => useModalWithData<TestData>())
      const testData: TestData = { id: '1', name: 'Test' }

      act(() => {
        result.current.openWith(testData)
      })

      act(() => {
        result.current.close()
      })

      expect(result.current.isOpen).toBe(false)
      expect(result.current.data).toBeNull()
    })
  })

  describe('toggle', () => {
    it('clears data when toggling closed', () => {
      const { result } = renderHook(() => useModalWithData<TestData>())
      const testData: TestData = { id: '1', name: 'Test' }

      act(() => {
        result.current.openWith(testData)
      })

      act(() => {
        result.current.toggle()
      })

      expect(result.current.isOpen).toBe(false)
      expect(result.current.data).toBeNull()
    })

    it('toggles open without setting data', () => {
      const { result } = renderHook(() => useModalWithData<TestData>())

      act(() => {
        result.current.toggle()
      })

      expect(result.current.isOpen).toBe(true)
      expect(result.current.data).toBeNull()
    })
  })
})
