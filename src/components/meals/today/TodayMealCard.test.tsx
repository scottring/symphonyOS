import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { TodayMealCard } from './TodayMealCard'

describe('TodayMealCard', () => {
  const baseProps = {
    dayLabel: 'Monday',
    title: 'Dutch Oven Barley Risotto',
    sides: 'Asparagus + Parmesan',
    methodLabel: 'HANDS-OFF OVEN METHOD',
    methodBody: 'Toast barley on stovetop → add hot stock → cover and bake.',
    kidsLine: 'Plain barley + parmesan, asparagus on the side.',
    servesCount: 4,
    prepLabel: 'Medium prep' as const,
    nutritionLabel: 'Nutritious & satisfying',
    diners: [
      { id: 'a', initials: 'SK', color: 'blue' as const },
      { id: 'b', initials: 'IR', color: 'purple' as const },
    ],
    state: 'drafted' as const,
    onGeneratePlan: vi.fn(),
    onRegenerate: vi.fn(),
    onViewRecipe: vi.fn(),
  }

  it('renders title, sides, day label, method body, kids line, metadata triplet', () => {
    render(<TodayMealCard {...baseProps} />)
    expect(screen.getByText('Monday')).toBeInTheDocument()
    expect(screen.getByText('Dutch Oven Barley Risotto')).toBeInTheDocument()
    expect(screen.getByText(/Asparagus \+ Parmesan/)).toBeInTheDocument()
    expect(screen.getByText('HANDS-OFF OVEN METHOD')).toBeInTheDocument()
    expect(screen.getByText(/Toast barley on stovetop/)).toBeInTheDocument()
    expect(screen.getByText(/Plain barley \+ parmesan/)).toBeInTheDocument()
    expect(screen.getByText(/Serves 4/i)).toBeInTheDocument()
    expect(screen.getByText(/Medium prep/i)).toBeInTheDocument()
    expect(screen.getByText(/Nutritious & satisfying/i)).toBeInTheDocument()
  })

  it('renders one avatar per diner using initials', () => {
    render(<TodayMealCard {...baseProps} />)
    expect(screen.getByText('SK')).toBeInTheDocument()
    expect(screen.getByText('IR')).toBeInTheDocument()
  })

  it('primary action is "View recipe" when state is "drafted"', () => {
    render(<TodayMealCard {...baseProps} />)
    expect(screen.getByRole('button', { name: /view recipe/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument()
  })

  it('primary action is "View recipe" when state is "cooked" too', () => {
    render(<TodayMealCard {...baseProps} state="cooked" />)
    expect(screen.getByRole('button', { name: /view recipe/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument()
  })

  it('primary action is "Generate plan" when state is "empty"', () => {
    render(<TodayMealCard {...baseProps} state="empty" />)
    expect(screen.getByRole('button', { name: /generate plan/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /view recipe/i })).not.toBeInTheDocument()
  })

  it('calls onViewRecipe when View recipe is clicked', async () => {
    const onViewRecipe = vi.fn()
    const { user } = render(<TodayMealCard {...baseProps} onViewRecipe={onViewRecipe} />)
    await user.click(screen.getByRole('button', { name: /view recipe/i }))
    expect(onViewRecipe).toHaveBeenCalledTimes(1)
  })

  it('calls onRegenerate when Regenerate is clicked', async () => {
    const onRegenerate = vi.fn()
    const { user } = render(<TodayMealCard {...baseProps} onRegenerate={onRegenerate} />)
    await user.click(screen.getByRole('button', { name: /regenerate/i }))
    expect(onRegenerate).toHaveBeenCalledTimes(1)
  })

  it('does NOT render "Shift + Enter for new line" hint (the floater is dropped)', () => {
    render(<TodayMealCard {...baseProps} />)
    expect(screen.queryByText(/shift \+ enter/i)).not.toBeInTheDocument()
  })
})
