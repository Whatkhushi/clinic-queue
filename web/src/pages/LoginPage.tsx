import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { homeFor, useAuth } from '../lib/auth';
import { Alert, Button, Card, Field } from '../components/ui';

const DEMO = [
  { label: 'Patient', email: 'patient@clinicq.dev', password: 'patient1234' },
  { label: 'Reception', email: 'staff@clinicq.dev', password: 'staff1234' },
  { label: 'Admin', email: 'admin@clinicq.dev', password: 'admin1234' },
];

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from ?? homeFor(user)} replace />;

  async function submit(e: FormEvent, creds = { email, password }) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(creds.email, creds.password);
      navigate(from ?? homeFor(u), { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-slate-900">Log in</h1>
        <form onSubmit={submit} className="mt-5 space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-600">
          New here?{' '}
          <Link to="/register" state={location.state} className="font-medium text-brand-700 hover:underline">
            Create an account
          </Link>
        </p>
      </Card>

      <Card className="mt-4">
        <p className="text-sm font-medium text-slate-700">Try a demo account</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {DEMO.map((d) => (
            <Button
              key={d.label}
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={(e) => {
                setEmail(d.email);
                setPassword(d.password);
                submit(e, d);
              }}
            >
              {d.label}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}
