interface WelcomeStepProps {
  onContinue: () => void
}

export function WelcomeStep({ onContinue }: WelcomeStepProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      {/* Logo */}
      <div className="mb-8">
        <svg
          className="w-16 h-16 text-primary-600"
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Simple tree icon */}
          <path
            d="M50 10 L50 90 M50 30 L30 50 M50 30 L70 50 M50 50 L25 70 M50 50 L75 70 M50 70 L35 85 M50 70 L65 85"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Headline */}
      <h1 className="font-display text-4xl md:text-5xl font-semibold text-neutral-800 text-center mb-4 leading-tight">
        Know what you have to do.
        <br />
        Be ready when it's time.
      </h1>

      {/* Subtitle */}
      <p className="text-lg text-neutral-500 text-center max-w-md mb-12 leading-relaxed">
        Symphony OS is your personal operating system for work, life, and family. Three separate domains,
        one clear view — built for you, designed for sharing.
      </p>

      {/* Setup note */}
      <p className="text-sm text-neutral-400 mb-8">
        Let's get you set up. This takes about 5 minutes.
      </p>

      {/* CTA */}
      <button
        onClick={onContinue}
        className="btn-primary px-8 py-3 text-lg font-medium"
      >
        Get Started
      </button>

      {/* Sign in link */}
      <p className="mt-6 text-sm text-neutral-400">
        Already have an account?{' '}
        <button className="text-primary-600 hover:text-primary-700 underline">
          Sign In
        </button>
      </p>
    </div>
  )
}
