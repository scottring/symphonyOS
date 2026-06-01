import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WeatherChip } from './WeatherChip'

const useWeatherMock = vi.fn()
vi.mock('@/hooks/useWeather', () => ({ useWeather: () => useWeatherMock() }))
afterEach(() => useWeatherMock.mockReset())

describe('WeatherChip', () => {
  it('renders nothing on error', () => {
    useWeatherMock.mockReturnValue({ weather: null, loading: false, error: 'api: Timeout' })
    render(<WeatherChip />)
    expect(screen.queryByLabelText('Weather')).not.toBeInTheDocument()
  })
  it('renders nothing while loading', () => {
    useWeatherMock.mockReturnValue({ weather: null, loading: true, error: null })
    render(<WeatherChip />)
    expect(screen.queryByLabelText('Weather')).not.toBeInTheDocument()
  })
  it('renders compact temp and high/low when populated', () => {
    useWeatherMock.mockReturnValue({
      weather: { currentTemp: 72, weatherCode: 0, condition: 'Clear', highTemp: 76, lowTemp: 54, hourlyForecast: [] },
      loading: false, error: null,
    })
    render(<WeatherChip />)
    expect(screen.getByText('72°')).toBeInTheDocument()
    expect(screen.getByText('H76/L54')).toBeInTheDocument()
  })
  it('opens an hourly forecast on click', async () => {
    useWeatherMock.mockReturnValue({
      weather: { currentTemp: 72, weatherCode: 0, condition: 'Clear', highTemp: 76, lowTemp: 54,
        hourlyForecast: [{ hour: 14, temp: 71, code: 0 }] },
      loading: false, error: null,
    })
    const { user } = render(<WeatherChip />)
    expect(screen.queryByTestId('weather-forecast')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /weather/i }))
    expect(screen.getByTestId('weather-forecast')).toBeInTheDocument()
  })
})
