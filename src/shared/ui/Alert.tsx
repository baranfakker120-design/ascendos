export function Alert({ tone, children }: { tone: 'error' | 'info'; children: string }) {
  const styles =
    tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-line bg-bg text-muted';
  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}
