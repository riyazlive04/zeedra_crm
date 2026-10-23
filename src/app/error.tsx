"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="font-display text-xl font-bold">Something went wrong</h1>
      <p className="max-w-md text-sm text-slate-500">An unexpected error occurred. Our team has been notified{error.digest ? ` (ref ${error.digest})` : ""}.</p>
      <button onClick={reset} className="sun-gradient rounded-lg px-4 py-2 text-sm font-semibold text-white">
        Try again
      </button>
    </div>
  );
}
