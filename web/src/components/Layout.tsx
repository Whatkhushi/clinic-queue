import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Button, cx } from './ui';

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-semibold text-slate-900">
      <span className="grid size-8 place-items-center rounded-lg bg-brand-700 text-white">Q</span>
      ClinicQ
    </Link>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const links = [
    { to: '/', label: 'Doctors', show: true },
    { to: '/my', label: 'My appointments', show: user?.role === 'PATIENT' },
    { to: '/staff', label: 'Front desk', show: user?.role === 'STAFF' || user?.role === 'ADMIN' },
    { to: '/admin', label: 'Admin', show: user?.role === 'ADMIN' },
  ].filter((l) => l.show);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <nav className="flex flex-wrap items-center gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end
                className={({ isActive }) =>
                  cx(
                    'rounded-lg px-3 py-1.5 text-sm font-medium',
                    isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100',
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
            {user ? (
              <div className="ml-2 flex items-center gap-2 border-l border-slate-200 pl-3">
                <span className="hidden text-sm text-slate-600 sm:inline">{user.name}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    await logout();
                    navigate('/');
                  }}
                >
                  Log out
                </Button>
              </div>
            ) : (
              <div className="ml-2 flex gap-2">
                <Link to="/login" className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
                  Log in
                </Link>
                <Link to="/register" className="rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800">
                  Sign up
                </Link>
              </div>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-500">
        ClinicQ: appointments and live queues for small clinics ·{' '}
        <a className="underline hover:text-slate-700" href="https://github.com/Whatkhushi/clinic-queue">
          Source on GitHub
        </a>
      </footer>
    </div>
  );
}
