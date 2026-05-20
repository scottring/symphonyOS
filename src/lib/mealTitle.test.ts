import { describe, it, expect } from 'vitest'
import { parseMealTitle } from './mealTitle'

describe('parseMealTitle', () => {
  it('returns the whole string as title when no separator', () => {
    expect(parseMealTitle('Tacos')).toEqual({ title: 'Tacos', sides: undefined })
  })

  it('strips a leading meal-type prefix ("Dinner · ")', () => {
    expect(parseMealTitle('Dinner · Tacos')).toEqual({ title: 'Tacos', sides: undefined })
  })

  it('splits the first " + " into title and sides', () => {
    expect(parseMealTitle('Crispy tofu stir fry + brown rice + broccoli')).toEqual({
      title: 'Crispy tofu stir fry',
      sides: 'brown rice + broccoli',
    })
  })

  it('combines prefix-strip and sides-split', () => {
    expect(
      parseMealTitle('Dinner · Crispy tofu stir fry + brown rice + broccoli + edamame + snap peas'),
    ).toEqual({
      title: 'Crispy tofu stir fry',
      sides: 'brown rice + broccoli + edamame + snap peas',
    })
  })

  it('handles "Lunch · " and "Breakfast · " prefixes too', () => {
    expect(parseMealTitle('Lunch · Caesar salad')).toEqual({ title: 'Caesar salad', sides: undefined })
    expect(parseMealTitle('Breakfast · Oatmeal')).toEqual({ title: 'Oatmeal', sides: undefined })
  })
})
