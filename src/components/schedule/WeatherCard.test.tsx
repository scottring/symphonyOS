import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WeatherCard } from './WeatherCard'

const useWeatherMock = vi.fn()
vi.mock('@/hooks/useWeather', () => ({ useWeather: () => useWeatherMock() }))
afterEach(() => useWeatherMock.mockReset())

describe('WeatherCard', () => {
  it('shows unavailable on error', () => {
    useWeatherMock.mockReturnValue({ weather: null, loading: false, error: 'api: Timeout', requestLocation: vi.fn() })
    render(<WeatherCard />)
    expect(screen.getByText(/weather unavailable/i)).toBeInTheDocument()
  })
  it('shows a skeleton while loading', () => {
    useWeatherMock.mockReturnValue({ weather: null, loading: true, error: null, requestLocation: vi.fn() })
    render(<WeatherCard />)
    expect(screen.getByTestId('weather-skeleton')).toBeInTheDocument()
  })
  it('renders temp, condition, high/low when populated', () => {
    useWeatherMock.mockReturnValue({
      weather: { currentTemp: 72, weatherCode: 0, condition: 'Clear', highTemp: 76, lowTemp: 54, hourlyForecast: [] },
      loading: false, error: null, requestLocation: vi.fn(),
    })
    render(<WeatherCard />)
    expect(screen.getByText('72°')).toBeInTheDocument()
    expect(screen.getByText('Clear')).toBeInTheDocument()
    expect(screen.getByText(/54°/)).toBeInTheDocument()
    expect(screen.getByText(/76°/)).toBeInTheDocument()
  })
})
