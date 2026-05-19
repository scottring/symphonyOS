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
  it('expands an hourly forecast strip on click and collapses on second click', async () => {
    useWeatherMock.mockReturnValue({
      weather: { currentTemp: 72, weatherCode: 0, condition: 'Clear', highTemp: 76, lowTemp: 54,
        hourlyForecast: [{ hour: 14, temp: 71, code: 0 }, { hour: 15, temp: 73, code: 2 }] },
      loading: false, error: null, requestLocation: vi.fn(),
    })
    const { user } = render(<WeatherCard />)
    expect(screen.queryByTestId('weather-forecast')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /weather/i }))
    expect(screen.getByTestId('weather-forecast')).toBeInTheDocument()
    expect(screen.getByText('2p')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /weather/i }))
    expect(screen.queryByTestId('weather-forecast')).not.toBeInTheDocument()
  })
  it('is not clickable when forecast is empty', () => {
    useWeatherMock.mockReturnValue({
      weather: { currentTemp: 72, weatherCode: 0, condition: 'Clear', highTemp: 76, lowTemp: 54, hourlyForecast: [] },
      loading: false, error: null, requestLocation: vi.fn(),
    })
    render(<WeatherCard />)
    expect(screen.queryByRole('button', { name: /weather/i })).not.toBeInTheDocument()
  })
})
