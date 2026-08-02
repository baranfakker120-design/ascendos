/**
 * Team Seyda Guide — opened inside the PWA shell (iframe), never the
 * system browser. Bottom nav stays available around this view.
 */
export function TeamSeydaPage() {
  return (
    <div className="flex h-full min-h-[70vh] flex-col">
      <header className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Team Seyda</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Guide</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_8px_24px_rgb(17_18_20/0.04)]">
        <iframe
          title="Team Seyda Guide"
          src="https://teamseydaguide.netlify.app"
          className="h-[min(70vh,640px)] w-full border-0 bg-surface"
          referrerPolicy="no-referrer-when-downgrade"
          allow="fullscreen"
        />
      </div>
    </div>
  );
}
