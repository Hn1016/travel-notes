import JournalPage from './JournalPage'

export default function App() {
  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center px-4 py-3">
          <span className="font-semibold tracking-tight">🧭 Travel Notes</span>
        </div>
      </header>
      <main>
        <JournalPage />
      </main>
    </>
  )
}
