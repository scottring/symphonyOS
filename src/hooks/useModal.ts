import { useState, useCallback } from 'react'

/**
 * Custom hook for managing modal/popover state
 *
 * Eliminates the repeated pattern of:
 * const [showModal, setShowModal] = useState(false)
 *
 * Usage:
 * const modal = useModal()
 * <button onClick={modal.open}>Open</button>
 * {modal.isOpen && <Modal onClose={modal.close} />}
 */
export function useModal(initialOpen = false) {
  const [isOpen, setIsOpen] = useState(initialOpen)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(prev => !prev), [])

  return {
    isOpen,
    open,
    close,
    toggle,
  }
}

/**
 * Extended modal hook with data payload
 *
 * Useful when the modal needs to display data about a specific item
 *
 * Usage:
 * const modal = useModalWithData<Task>()
 * <button onClick={() => modal.openWith(task)}>Edit</button>
 * {modal.isOpen && <EditModal task={modal.data} onClose={modal.close} />}
 */
export function useModalWithData<T>(initialOpen = false, initialData: T | null = null) {
  const [isOpen, setIsOpen] = useState(initialOpen)
  const [data, setData] = useState<T | null>(initialData)

  const openWith = useCallback((newData: T) => {
    setData(newData)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setData(null)
  }, [])

  const toggle = useCallback(() => {
    if (isOpen) {
      setData(null)
    }
    setIsOpen(prev => !prev)
  }, [isOpen])

  return {
    isOpen,
    data,
    openWith,
    close,
    toggle,
  }
}
