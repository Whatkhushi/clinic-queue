import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { homeFor, useAuth } from '../lib/auth';
import { Alert, Button, Card, Field } from '../components/ui';

export default function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from ?? homeFor(user)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      const u = await register(form.name, form.email, form.password);
      navigate(from ?? homeFor(u), { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.details) setFieldErrors(err.details);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="mx-auto max-w-md">
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-slate-900">Create your account</h1>
        <p className="mt-1 text-sm text-slate-600">Book appointments and track your queue position.</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Full name" required value={form.name} onChange={set('name')} error={fieldErrors.name?.[0]} />
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={set('email')}
            error={fieldErrors.email?.[0]}
          />
          <Field
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={form.password}
            onChange={set('password')}
            error={fieldErrors.password?.[0]}
          />
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link to="/login" state={location.state} className="font-medium text-brand-700 hover:underline">
            Log in
          </Link>
        </p>
      </Card>
    </div>
  );
}
