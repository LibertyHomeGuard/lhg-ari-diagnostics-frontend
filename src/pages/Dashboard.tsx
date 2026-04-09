import { useState } from "react";
import ActiveClaimsList from "../components/ActiveClaimsList";
import AIAccuracyModal from "../components/AIAccuracyModal";

export default function Dashboard() {
  const [showAccuracy, setShowAccuracy] = useState(false);

  return (
    <div className="flex h-screen flex-col bg-black text-white">
      <header className="z-10 flex shrink-0 items-center justify-between border-b border-neutral-800 bg-black px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            aria-label="Menu"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-xl font-semibold text-white">LHG - ARI VOICE AI</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAccuracy(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-teal-700/60 bg-teal-600/15 px-3 py-2 text-sm font-medium text-teal-300 transition hover:bg-teal-600/25 hover:text-teal-200"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            AI Accuracy
          </button>
          <div className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-600 text-sm font-bold text-white">
              G
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-white">Goutham Chadalla Manjunath</p>
              <p className="text-xs text-neutral-400">Admin</p>
            </div>
          </div>
        </div>
      </header>

      {showAccuracy && <AIAccuracyModal onClose={() => setShowAccuracy(false)} />}

      <main className="flex min-h-0 flex-1 p-4">
        <ActiveClaimsList />
      </main>
    </div>
  );
}
