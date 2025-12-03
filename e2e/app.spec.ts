import { test, expect } from '@playwright/test'

test.describe('App', () => {
  test('loads and displays the app name', async ({ page }) => {
    await page.goto('/')
    // App name appears in sidebar (desktop) or header (mobile)
    await expect(page.getByText('Symphony').first()).toBeVisible()
  })

  test('displays auth form when not logged in', async ({ page }) => {
    await page.goto('/')
    // Should show auth form with sign in/sign up
    await expect(page.getByText('Welcome Back')).toBeVisible()
    await expect(page.getByPlaceholder('Email')).toBeVisible()
    await expect(page.getByPlaceholder('Password')).toBeVisible()
  })

  test('has sign in and sign up options', async ({ page }) => {
    await page.goto('/')
    // Default is sign in mode
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
    // Can switch to sign up mode
    await expect(page.getByText("Don't have an account?")).toBeVisible()
  })
})
