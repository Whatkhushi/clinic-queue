import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import type { AppointmentStatus } from '../lib/types';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 disabled:bg-brand-700/50',
  secondary: 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50',
  danger: 'bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed',
        size === 'sm' ? 'px-2.5 py-1.5 text-sm' : 'px-4 py-2 text-sm',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200', className)}>{children}</div>;
}

export function Field({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        className={cx(
          'block w-full rounded-lg border-0 px-3 py-2 text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-600 focus:outline-none',
          error && 'ring-red-400',
        )}
        {...props}
      />
      {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
    </label>
  );
}

export function Alert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'success' | 'info' }) {
  const tones = {
    error: 'bg-red-50 text-red-800 ring-red-200',
    success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    info: 'bg-sky-50 text-sky-800 ring-sky-200',
  };
  return <div className={cx('rounded-lg px-4 py-3 text-sm ring-1', tones[tone])}>{children}</div>;
}

const statusStyles: Record<AppointmentStatus, string> = {
  BOOKED: 'bg-sky-50 text-sky-700 ring-sky-200',
  CHECKED_IN: 'bg-amber-50 text-amber-800 ring-amber-200',
  IN_PROGRESS: 'bg-violet-50 text-violet-700 ring-violet-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CANCELLED: 'bg-slate-100 text-slate-500 ring-slate-200',
  NO_SHOW: 'bg-red-50 text-red-700 ring-red-200',
};
const statusLabels: Record<AppointmentStatus, string> = {
  BOOKED: 'Booked',
  CHECKED_IN: 'Waiting',
  IN_PROGRESS: 'With doctor',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No-show',
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span className={cx('inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1', statusStyles[status])}>
      {statusLabels[status]}
    </span>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-slate-500" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      {label}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-slate-600">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export { cx };
