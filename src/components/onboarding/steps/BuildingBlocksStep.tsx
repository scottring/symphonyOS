import { useState } from 'react'

interface BuildingBlocksStepProps {
  onContinue: () => void
}

const CARDS = [
  {
    icon: '🏷️',
    title: 'Domains',
    description: 'Work, Family, and Personal. Keep them separate.',
    examples: 'Work tasks stay in work hours. Family tasks surface when you are home. Personal time is yours.',
  },
  {
    icon: '📋',
    title: 'Tasks',
    description: 'The single things you need to do.',
    examples: '"Buy milk." "Call the dentist." "Email the contractor."',
  },
  {
    icon: '📁',
    title: 'Projects',
    description: 'Groups of tasks working toward a goal.',
    examples: '"Plan birthday party" might include: book venue, order cake, send invites.',
  },
  {
    icon: '🔄',
    title: 'Routines',
    description: 'Things you do on repeat.',
    examples: '"Walk the dog." "Empty dishwasher." "Pack lunches." Track them so nothing falls through the cracks.',
  },
]

export function BuildingBlocksStep({ onContinue }: BuildingBlocksStepProps) {
  const [activeCard, setActiveCard] = useState(0)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 pt-24">
      {/* Header */}
      <h1 className="font-display text-3xl md:text-4xl font-semibold text-neutral-800 text-center mb-4">
        How Symphony Works
      </h1>
      <p className="text-lg text-neutral-500 text-center mb-12 max-w-md">
        Four building blocks power your daily rhythm.
      </p>

      {/* Cards - Desktop: side by side, Mobile: stacked with tabs */}
      <div className="w-full max-w-4xl">
        {/* Desktop view */}
        <div className="hidden md:grid grid-cols-4 gap-6 mb-12">
          {CARDS.map((card, i) => (
            <div
              key={i}
              className="card p-6 hover:shadow-lg transition-shadow"
            >
              <div className="text-4xl mb-4">{card.icon}</div>
              <h3 className="font-display text-xl font-semibold text-neutral-800 mb-2">
                {card.title}
              </h3>
              <p className="text-neutral-600 mb-3">
                {card.description}
              </p>
              <p className="text-sm text-neutral-400 italic">
                {card.examples}
              </p>
            </div>
          ))}
        </div>

        {/* Mobile view - swipeable cards */}
        <div className="md:hidden">
          {/* Card indicators */}
          <div className="flex justify-center gap-2 mb-6">
            {CARDS.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveCard(i)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === activeCard ? 'bg-primary-500' : 'bg-neutral-200'
                }`}
              />
            ))}
          </div>

          {/* Active card */}
          <div className="card p-8 mb-8 animate-fade-in-up">
            <div className="text-5xl mb-4 text-center">{CARDS[activeCard].icon}</div>
            <h3 className="font-display text-2xl font-semibold text-neutral-800 mb-3 text-center">
              {CARDS[activeCard].title}
            </h3>
            <p className="text-neutral-600 mb-4 text-center">
              {CARDS[activeCard].description}
            </p>
            <p className="text-sm text-neutral-400 italic text-center">
              {CARDS[activeCard].examples}
            </p>
          </div>

          {/* Navigation buttons */}
          <div className="flex justify-center gap-4 mb-8">
            <button
              onClick={() => setActiveCard(Math.max(0, activeCard - 1))}
              disabled={activeCard === 0}
              className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 disabled:opacity-30"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => setActiveCard(Math.min(CARDS.length - 1, activeCard + 1))}
              disabled={activeCard === CARDS.length - 1}
              className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 disabled:opacity-30"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={onContinue}
        className="btn-primary px-8 py-3 text-lg font-medium"
      >
        Continue
      </button>
    </div>
  )
}
