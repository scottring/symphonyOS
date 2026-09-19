import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WeatherChip } from './WeatherChip'

const useWeatherMock = vi.fn()
vi.mock('@/hooks/useWeather', () => ({ useWeather: () => useWeatherMock() }))
afterEach(() => useWeatherMock.mockReset())

const now = new Date(2026, 8, 19, 13, 5)
const reading = (o = {}) => ({
  weather: { currentTemp: 72.4, weatherCode: 2, condition: 'Partly Cloudy', highTemp: 76, lowTemp: 54, hourlyForecast: [], ...o },
  loading: false, error: null,
})

describe('WeatherChip', () => {
  // Degrades to nothing: no placeholder, no "set your location" nag on Today.
  it('renders nothing on error or with no location', () => {
    useWeatherMock.mockReturnValue({ weather: null, loading: false, error: 'no-location' })
    const { container } = render(<WeatherChip now={now} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('renders nothing while loading', () => {
    useWeatherMock.mockReturnValue({ weather: null, loading: true, error: null })
    const { container } = render(<WeatherChip now={now} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('reads as one line: temperature, condition, high / low', () => {
    useWeatherMock.mockReturnValue(reading())
    render(<WeatherChip now={now} />)
    expect(screen.getByText('72°')).toBeInTheDocument()
    expect(screen.getByText('Partly cloudy')).toBeInTheDocument()
    expect(screen.getByText('76° / 54°')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Weather: 72°, Partly cloudy, high 76°, low 54°' })).toBeInTheDocument()
    expect(screen.queryByTestId('weather-cue')).not.toBeInTheDocument()
  })
  it('adds a rain cue only when rain is coming', () => {
    useWeatherMock.mockReturnValue(reading({ hourlyForecast: [{ hour: 14, temp: 71, code: 2 }, { hour: 16, temp: 66, code: 61 }] }))
    render(<WeatherChip now={now} />)
    expect(screen.getByTestId('weather-cue')).toHaveTextContent('Rain from 4 PM')
  })
  it('opens the next few hours on click and closes on Escape', async () => {
    useWeatherMock.mockReturnValue(reading({ hourlyForecast: [{ hour: 12, temp: 70, code: 0 }, { hour: 14, temp: 71, code: 0 }] }))
    const { user } = render(<WeatherChip now={now} />)
    expect(screen.queryByTestId('weather-forecast')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /weather/i }))
    const hours = screen.getByTestId('weather-forecast')
    // The past hour (12) is gone; only what is ahead.
    expect(hours).toHaveTextContent('2p')
    expect(hours).not.toHaveTextContent('12p')
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('weather-forecast')).not.toBeInTheDocument()
  })
})
