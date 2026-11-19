import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatTime, localDate } from '../lib/format';
import type { Appointment, Provider, Slot } from '../lib/types';
import { Alert, Button, Card, PageHeader, Spinner, cx } from '../components/ui';

const DAYS_AHEAD = 7;

export default function BookPage() {
  const providerId = Number(useParams().providerId);
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(localDate());
  const [selected, setSelected] = useState<Slot | null>(null);

  const provider = useQuery({
    queryKey: ['provider', providerId],
    queryFn: () => api<{ provider: Provider }>(`/providers/${providerId}`),
  });
  const slots = useQuery({
    queryKey: ['slots', providerId, date],
    queryFn: () => api<{ slots: Slot[] }>(`/providers/${providerId}/slots?date=${date}`),
  });

  const book = useMutation({
    mutationFn: (slot: Slot) =>
      api<{ appointment: Appointment }>('/appointments', { method: 'POST', body: { providerId, startTime: slot.startTime } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-appointments'] });
      navigate('/my', { state: { justBooked: true } });
    },
    onError: (err) => {
      // Someone else got the slot first: refresh so it shows as taken.
      if (err instanceof ApiError && err.code === 'SLOT_TAKEN') {
        setSelected(null);
        slots.refetch();
      }
    },
  });

  if (provider.isLoading) return <Spinner />;
  if (provider.error || !provider.data) return <Alert>Doctor not found.</Alert>;
  const p = provider.data.provider;
  const available = slots.data?.slots.filter((s) => s.available) ?? [];

  return (
    <div>
      <Link to="/" className="text-sm text-slate-600 hover:text-slate-900">
        ← All doctors
      </Link>
      <PageHeader title={`Book with ${p.name}`} subtitle={`${p.specialty} · ${p.slotMinutes}-minute visits`} />

      <Card>
        <h2 className="text-sm font-medium text-slate-700">1. Choose a day</h2>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {Array.from({ length: DAYS_AHEAD }, (_, i) => {
            const d = localDate(i);
            const label = new Date(`${d}T00:00`);
            return (
              <button
                key={d}
                onClick={() => {
                  setDate(d);
                  setSelected(null);
                  book.reset();
                }}
                className={cx(
                  'min-w-16 shrink-0 rounded-lg px-3 py-2 text-center text-sm ring-1',
                  d === date ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50',
                )}
              >
                <div className="text-xs opacity-80">{i === 0 ? 'Today' : label.toLocaleDateString([], { weekday: 'short' })}</div>
                <div className="font-semibold">{label.getDate()}</div>
              </button>
            );
          })}
        </div>

        <h2 className="mt-6 text-sm font-medium text-slate-700">2. Choose a time</h2>
        {slots.isLoading && <Spinner label="Loading slots…" />}
        {slots.data && slots.data.slots.length === 0 && (
          <p className="mt-3 text-sm text-slate-500">{p.name} doesn’t work on this day. Try another one.</p>
        )}
        {slots.data && slots.data.slots.length > 0 && available.length === 0 && (
          <p className="mt-3 text-sm text-slate-500">All slots are taken or have passed for this day.</p>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-8">
          {slots.data?.slots.map((s) => (
            <button
              key={s.startTime}
              disabled={!s.available}
              onClick={() => setSelected(s)}
              className={cx(
                'rounded-lg px-2 py-2 text-sm ring-1',
                !s.available && 'cursor-not-allowed bg-slate-50 text-slate-400 line-through ring-slate-200',
                s.available && selected?.startTime === s.startTime && 'bg-brand-700 text-white ring-brand-700',
                s.available && selected?.startTime !== s.startTime && 'bg-white text-slate-700 ring-slate-300 hover:ring-brand-600',
              )}
            >
              {formatTime(s.startTime)}
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-3 border-t border-slate-100 pt-5">
          {book.error && <Alert>{(book.error as Error).message}</Alert>}
          {!user ? (
            <Alert tone="info">
              <Link to="/login" state={{ from: `/book/${providerId}` }} className="font-medium underline">
                Log in
              </Link>{' '}
              or{' '}
              <Link to="/register" state={{ from: `/book/${providerId}` }} className="font-medium underline">
                create an account
              </Link>{' '}
              to book.
            </Alert>
          ) : user.role !== 'PATIENT' ? (
            <Alert tone="info">Only patient accounts can book online. Staff can add walk-ins from the front desk.</Alert>
          ) : (
            <Button disabled={!selected || book.isPending} onClick={() => selected && book.mutate(selected)}>
              {book.isPending ? 'Booking…' : selected ? `Confirm ${formatTime(selected.startTime)}` : 'Select a time'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
