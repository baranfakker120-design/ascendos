import { Outlet } from 'react-router-dom';

export function AuthLayout() {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-center px-6 py-10">
      <p className="mb-2 text-center text-lg uppercase tracking-[0.3em] text-ink">
        <span className="font-light">Ascend</span>
        <span className="font-bold">OS</span>
      </p>
      <p className="mb-8 text-center text-[11px] uppercase tracking-[0.35em] text-muted">
        Build a better tomorrow
      </p>
      <Outlet />
    </div>
  );
}
