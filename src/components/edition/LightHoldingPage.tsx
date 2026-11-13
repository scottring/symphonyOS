/** The one page a light (free iPhone) account sees on the web. */
export function LightHoldingPage({ email, onSignOut }: { email?: string | null; onSignOut: () => void }) {
  return (
    <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <img src="/symphony-logo.png" alt="Symphony Logo" className="w-12 h-12" />
            <h1 className="font-display text-3xl text-neutral-900">Symphony</h1>
          </div>
        </div>
        <div className="card p-8 text-center">
          <h2 className="font-display text-xl font-medium text-neutral-800 mb-4">Symphony is on iPhone for now</h2>
          <p className="text-neutral-700 mb-3">
            Your account is ready. Open Symphony on your iPhone to plan your year, your week and today.
          </p>
          <p className="text-neutral-600 mb-6">Symphony on the web comes with Symphony Plus, which is on its way.</p>
          {email && <p className="text-sm text-neutral-500 mb-3">Signed in as {email}</p>}
          <button type="button" onClick={onSignOut} className="btn btn-secondary">Sign out</button>
        </div>
      </div>
    </div>
  )
}
