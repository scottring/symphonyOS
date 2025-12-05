import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AuthForm } from './AuthForm'

// Mock the useAuth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    signInWithEmail: mockSignInWithEmail,
    signUpWithEmail: mockSignUpWithEmail,
  }),
}))

const mockSignInWithEmail = vi.fn()
const mockSignUpWithEmail = vi.fn()

describe('AuthForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignInWithEmail.mockResolvedValue({ error: null })
    mockSignUpWithEmail.mockResolvedValue({ error: null })
  })

  describe('rendering', () => {
    it('renders sign in form by default', () => {
      render(<AuthForm />)

      expect(screen.getByText('Welcome Back')).toBeInTheDocument()
      expect(screen.getByLabelText('Email')).toBeInTheDocument()
      expect(screen.getByLabelText('Password')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument()
    })

    it('renders Symphony branding', () => {
      render(<AuthForm />)

      expect(screen.getByText('Symphony')).toBeInTheDocument()
      expect(screen.getByText('Your personal operating system')).toBeInTheDocument()
      expect(screen.getByAltText('Symphony Logo')).toBeInTheDocument()
    })

    it('renders toggle to sign up', () => {
      render(<AuthForm />)

      expect(screen.getByText("Don't have an account?")).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sign Up' })).toBeInTheDocument()
    })

    it('renders footer text', () => {
      render(<AuthForm />)

      expect(screen.getByText('Organize your life with clarity and purpose')).toBeInTheDocument()
    })
  })

  describe('mode toggling', () => {
    it('switches to sign up mode when clicking Sign Up', () => {
      render(<AuthForm />)

      fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }))

      // Header shows "Create Account"
      expect(screen.getByRole('heading', { name: 'Create Account' })).toBeInTheDocument()
      // Submit button shows "Create Account"
      expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument()
      expect(screen.getByText('Already have an account?')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument()
    })

    it('switches back to sign in mode when clicking Sign In', () => {
      render(<AuthForm />)

      // Switch to sign up
      fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }))
      expect(screen.getByRole('heading', { name: 'Create Account' })).toBeInTheDocument()

      // Switch back to sign in
      fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))
      expect(screen.getByRole('heading', { name: 'Welcome Back' })).toBeInTheDocument()
    })
  })

  describe('form input', () => {
    it('updates email field value', () => {
      render(<AuthForm />)

      const emailInput = screen.getByLabelText('Email') as HTMLInputElement
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } })

      expect(emailInput.value).toBe('test@example.com')
    })

    it('updates password field value', () => {
      render(<AuthForm />)

      const passwordInput = screen.getByLabelText('Password') as HTMLInputElement
      fireEvent.change(passwordInput, { target: { value: 'password123' } })

      expect(passwordInput.value).toBe('password123')
    })

    it('email field has correct type and placeholder', () => {
      render(<AuthForm />)

      const emailInput = screen.getByLabelText('Email')
      expect(emailInput).toHaveAttribute('type', 'email')
      expect(emailInput).toHaveAttribute('placeholder', 'you@example.com')
    })

    it('password field has correct type and placeholder', () => {
      render(<AuthForm />)

      const passwordInput = screen.getByLabelText('Password')
      expect(passwordInput).toHaveAttribute('type', 'password')
      expect(passwordInput).toHaveAttribute('placeholder', 'At least 6 characters')
    })

    it('password field has minLength of 6', () => {
      render(<AuthForm />)

      const passwordInput = screen.getByLabelText('Password')
      expect(passwordInput).toHaveAttribute('minLength', '6')
    })
  })

  describe('sign in submission', () => {
    it('calls signInWithEmail on form submit', async () => {
      render(<AuthForm />)

      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

      await waitFor(() => {
        expect(mockSignInWithEmail).toHaveBeenCalledWith('test@example.com', 'password123')
      })
    })

    it('shows loading state during submission', async () => {
      let resolveSignIn: (value: { error: null }) => void
      mockSignInWithEmail.mockImplementation(
        () => new Promise((resolve) => { resolveSignIn = resolve })
      )

      render(<AuthForm />)

      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

      expect(screen.getByText('Signing in...')).toBeInTheDocument()

      // Resolve the promise and wait for state update to complete
      resolveSignIn!({ error: null })
      await waitFor(() => {
        expect(screen.queryByText('Signing in...')).not.toBeInTheDocument()
      })
    })

    it('disables button during loading', async () => {
      let resolveSignIn: (value: { error: null }) => void
      mockSignInWithEmail.mockImplementation(
        () => new Promise((resolve) => { resolveSignIn = resolve })
      )

      render(<AuthForm />)

      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

      const submitButton = screen.getByRole('button', { name: /Signing in/i })
      expect(submitButton).toBeDisabled()

      // Resolve the promise and wait for state update to complete
      resolveSignIn!({ error: null })
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Sign In' })).not.toBeDisabled()
      })
    })

    it('shows error message on sign in failure', async () => {
      mockSignInWithEmail.mockResolvedValue({ error: { message: 'Invalid credentials' } })

      render(<AuthForm />)

      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
      fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
      })
    })
  })

  describe('sign up submission', () => {
    it('calls signUpWithEmail on form submit in sign up mode', async () => {
      render(<AuthForm />)

      fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }))
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'newpassword123' } })
      fireEvent.click(screen.getByRole('button', { name: 'Create Account' }))

      await waitFor(() => {
        expect(mockSignUpWithEmail).toHaveBeenCalledWith('new@example.com', 'newpassword123')
      })
    })

    it('shows success message on successful sign up', async () => {
      mockSignUpWithEmail.mockResolvedValue({ error: null })

      render(<AuthForm />)

      fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }))
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'newpassword123' } })
      fireEvent.click(screen.getByRole('button', { name: 'Create Account' }))

      await waitFor(() => {
        expect(screen.getByText('Check your email for a confirmation link!')).toBeInTheDocument()
      })
    })

    it('shows error message on sign up failure', async () => {
      mockSignUpWithEmail.mockResolvedValue({ error: { message: 'Email already taken' } })

      render(<AuthForm />)

      fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }))
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'existing@example.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: 'Create Account' }))

      await waitFor(() => {
        expect(screen.getByText('Email already taken')).toBeInTheDocument()
      })
    })
  })

  describe('error styling', () => {
    it('applies success styling for confirmation message', async () => {
      mockSignUpWithEmail.mockResolvedValue({ error: null })

      render(<AuthForm />)

      fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }))
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'newpassword123' } })
      fireEvent.click(screen.getByRole('button', { name: 'Create Account' }))

      await waitFor(() => {
        const message = screen.getByText('Check your email for a confirmation link!')
        expect(message.closest('div')).toHaveClass('bg-success-50')
      })
    })

    it('applies error styling for error messages', async () => {
      mockSignInWithEmail.mockResolvedValue({ error: { message: 'Invalid credentials' } })

      render(<AuthForm />)

      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
      fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

      await waitFor(() => {
        const message = screen.getByText('Invalid credentials')
        expect(message.closest('div')).toHaveClass('bg-danger-50')
      })
    })
  })
})
