/* eslint-disable react-refresh/only-export-components */
import type { ReactElement } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { DomainProvider } from '@/hooks/useDomain'
import { DomainGateProvider } from '@/components/domain/DomainGate'
import { PlaceProvider } from '@/hooks/usePlace'

// Add any providers that wrap your app here
function AllTheProviders({ children }: { children: React.ReactNode }) {
  return (
    <BrowserRouter>
      <PlaceProvider>
        <DomainProvider>
          <DomainGateProvider>{children}</DomainGateProvider>
        </DomainProvider>
      </PlaceProvider>
    </BrowserRouter>
  )
}

function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return {
    user: userEvent.setup(),
    ...render(ui, { wrapper: AllTheProviders, ...options }),
  }
}

export * from '@testing-library/react'
export { customRender as render }
