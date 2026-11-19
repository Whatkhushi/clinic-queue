import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatDate, formatTime, isToday } from '../lib/format';
import { useQueueUpdates } from '../lib/socket';
import type { Appointment } from '../lib/types';
import { Alert, Button, Card, PageHeader, Spinner, StatusBadge } from '../components/ui';

const ACTIVE = ['BOOKED', 'CHECKED_IN', 'IN_PROGRESS'];

function LiveQueueCard({ a }: { a: Appointment }) {
  if (a.status === 'IN_PROGRESS') {
    return (
      <div className="mt-4 rounded-lg bg-violet-50 p-4 text-violet-900">
        <p className="text-lg font-semibold">It’s your turn. Please go in.</p>
      </div>
    );
  }
  if (a.status === 'CHECKED_IN' && a.queue) {
    return (
      <div className="mt-4 flex items-center gap-5 rounded-lg bg-amber-50 p-4 text-amber-900">
        <div className="text-center">
          <div className="text-4xl font-bold tabular-nums">#{a.queue.position}</div>
          <div className="text-xs uppercase tracking-wide">in line</div>
        </div>
        <div>
          <p className="font-semibold">
            {a.queue.position === 1 && a.queue.estimatedWaitMinutes === 0
              ? 'You’re next!'
              : `About ${a.queue.estimatedWaitMinutes} min wait`}
          </p>
          <p className="text-sm opacity-80">This updates live as the doctor sees patients.</p>
        </div>
      </div>
    );
  }
  if (a.status === 'BOOKED' && isToday(a.startTime)) {
    return (
      <Alert tone="info">
        When you arrive, check in at reception. Your live queue position will appear here.
      </Alert>
    );
  }
  return null;
}

export default function MyAppointmentsPage() {
  const queryClient = useQueryClient();
  const justBooked = (useLocation().state as { justBooked?: boolean } | null)?.justBooked;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['my-appointments'],
    queryFn: () => api<{ appointments: Appointment[] }>('/appointments/me'),
  });

  const appts = data?.appointments ?? [];
  const upcoming = appts
    .filter((a) => ACTIVE.includes(a.status) && (new Date(a.endTime) > new Date() || a.status !== 'BOOKED'))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const past = appts.filter((a) => !upcoming.includes(a));

  // Live updates for doctors I'm seeing today.
  useQueueUpdates(
    upcoming.filter((a) => isToday(a.startTime)).map((a) => a.provider.id),
    () => refetch(),
  );

  const cancel = useMutation({
    mutationFn: (id: number) => api(`/appointments/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-appointments'] }),
  });

  return (
    <div>
      <PageHeader
        title="My appointments"
        actions={
          <Link to="/" className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">
            Book another
          </Link>
        }
      />
      {justBooked && (
        <div className="mb-4">
          <Alert tone="success">Booked! You’ll see your live queue position here on the day.</Alert>
        </div>
      )}
      {isLoading && <Spinner />}
      {error && <Alert>{(error as Error).message}</Alert>}
      {cancel.error && <Alert>{(cancel.error as Error).message}</Alert>}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Upcoming</h2>
      {!isLoading && upcoming.length === 0 && <p className="mb-8 text-slate-600">No upcoming appointments.</p>}
      <div className="mb-10 space-y-3">
        {upcoming.map((a) => (
          <Card key={a.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900">{a.provider.name}</h3>
                  <StatusBadge status={a.status} />
                </div>
                <p className="text-sm text-slate-600">
                  {a.provider.specialty} · {isToday(a.startTime) ? 'Today' : formatDate(a.startTime)} at {formatTime(a.startTime)}{' '}
                  · Ticket #{a.id}
                </p>
              </div>
              {(a.status === 'BOOKED' || a.status === 'CHECKED_IN') && (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={cancel.isPending}
                  onClick={() => confirm('Cancel this appointment?') && cancel.mutate(a.id)}
                >
                  Cancel
                </Button>
              )}
            </div>
            <LiveQueueCard a={a} />
          </Card>
        ))}
      </div>

      {past.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">History</h2>
          <Card className="divide-y divide-slate-100 p-0">
            {past.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  <span className="font-medium text-slate-800">{a.provider.name}</span>
                  <span className="text-slate-500">
                    {' '}
                    · {formatDate(a.startTime)}, {formatTime(a.startTime)}
                  </span>
                </span>
                <StatusBadge status={a.status} />
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
