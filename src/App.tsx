function App() {
  return (
    <div className="min-h-screen bg-neutral-50 p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-primary-600">Symphony OS</h1>
        <p className="text-neutral-500 mt-2">Your personal operating system</p>
      </header>
      <main>
        <div className="bg-white rounded-lg shadow-card p-6 max-w-md">
          <h2 className="text-lg font-semibold text-neutral-800 mb-2">
            Welcome
          </h2>
          <p className="text-neutral-600">
            Symphony is ready to help you organize your life.
          </p>
        </div>
      </main>
    </div>
  )
}

export default App
