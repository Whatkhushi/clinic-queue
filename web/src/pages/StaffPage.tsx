import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatTime, localDate } from '../lib/format';
import { useQueueUpdates } from '../lib/socket';
import type { Appointment, AppointmentStatus, Provider } from '../lib/types';
import { Alert, Button, Card, PageHeader, Spinner, StatusBadge } from '../components/ui';

type Action = { label: string; to: AppointmentStatus | 'CANCEL'; variant?: 'primary' | 'secondary' | 'danger' };

const ACTIONS: Partial<Record<AppointmentStatus, Action[]>> = {
  BOOKED: [
    { label: 'Check in', to: 'CHECKED_IN' },
    { label: 'No-show', to: 'NO_SHOW', variant: 'secondary' },
    { label: 'Cancel', to: 'CANCEL', variant: 'danger' },
  ],
  CHECKED_IN: [
    { label: 'Start visit', to: 'IN_PROGRESS' },
    { label: 'Cancel', to: 'CANCEL', variant: 'danger' },
  ],
  IN_PROGRESS: [{ label: 'Complete', to: 'COMPLETED' }],
};

export default function StaffPage() {
  const queryClient = useQueryClient();
  const [providerId, setProviderId] = useState<number | null>(null);
  const [date, setDate] = useState(localDate());
  const [walkInName, setWalkInName] = useState('');
  const isTodaySelected = date === localDate();

  const providers = useQuery({
    queryKey: ['providers'],
    queryFn: () => api<{ providers: Provider[] }>('/providers'),
  });
  useEffect(() => {
    if (providerId === null && providers.data?.providers[0]) setProviderId(providers.data.providers[0].id);
  }, [providers.data, providerId]);

  const scheduleKey = ['schedule', providerId, date];
  const schedule = useQuery({
    queryKey: scheduleKey,
    enabled: providerId !== null,
    queryFn: () => api<{ appointments: Appointment[] }>(`/appointments?providerId=${providerId}&date=${date}`),
  });

  // Another receptionist (or a patient cancelling) changes the queue -> refetch.
  useQueueUpdates(providerId ? [providerId] : [], () => queryClient.invalidateQueries({ queryKey: scheduleKey }));

  const refresh = () => queryClient.invalidateQueries({ queryKey: scheduleKey });

  const act = useMutation({
    mutationFn: ({ id, to }: { id: number; to: Action['to'] }) =>
      to === 'CANCEL'
        ? api(`/appointments/${id}/cancel`, { method: 'POST' })
        : api(`/appointments/${id}/status`, { method: 'PATCH', body: { status: to } }),
    onSettled: refresh,
  });

  const walkIn = useMutation({
    mutationFn: () => api('/appointments/walk-in', { method: 'POST', body: { providerId, name: walkInName } }),
    onSuccess: () => setWalkInName(''),
    onSettled: refresh,
  });

  const appts = schedule.data?.appointments ?? [];
  const count = (s: AppointmentStatus) => appts.filter((a) => a.status === s).length;
  const inProgress = appts.find((a) => a.status === 'IN_PROGRESS');

  return (
    <div>
      <PageHeader
        title="Front desk"
        subtitle="Check patients in, run the queue, and add walk-ins."
        actions={
          providerId && (
            <Link
              to={`/board/${providerId}`}
              target="_blank"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
            >
              Open TV board ↗
            </Link>
          )
        }
      />

      <Card className="mb-4 flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Doctor</span>
          <select
            className="rounded-lg border-0 px-3 py-2 ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-600"
            value={providerId ?? ''}
            onChange={(e) => setProviderId(Number(e.target.value))}
          >
            {providers.data?.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.specialty})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Date</span>
          <input
            type="date"
            className="rounded-lg border-0 px-3 py-2 ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-600"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <div className="ml-auto flex gap-4 text-center text-sm">
          {(
            [
              ['Booked', 'BOOKED'],
              ['Waiting', 'CHECKED_IN'],
              ['Done', 'COMPLETED'],
              ['No-show', 'NO_SHOW'],
            ] as const
          ).map(([label, s]) => (
            <div key={s}>
              <div className="text-xl font-semibold tabular-nums text-slate-900">{count(s)}</div>
              <div className="text-slate-500">{label}</div>
            </div>
          ))}
        </div>
      </Card>

      {isTodaySelected && (
        <div className="mb-4 grid gap-4 md:grid-cols-2">
          <Card className="bg-violet-50 ring-violet-200">
            <p className="text-sm font-medium text-violet-800">With doctor now</p>
            <p className="mt-1 text-lg font-semibold text-violet-950">
              {inProgress ? `#${inProgress.id} · ${inProgress.patientName}` : 'Nobody. Start the next visit.'}
            </p>
          </Card>
          <Card>
            <form
              className="flex items-end gap-2"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                walkIn.mutate();
              }}
            >
              <label className="block flex-1">
                <span className="mb-1 block text-sm font-medium text-slate-700">Add walk-in patient</span>
                <input
                  className="block w-full rounded-lg border-0 px-3 py-2 ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-600"
                  placeholder="Patient name"
                  value={walkInName}
                  minLength={2}
                  required
                  onChange={(e) => setWalkInName(e.target.value)}
                />
              </label>
              <Button type="submit" disabled={walkIn.isPending}>
                Add to queue
              </Button>
            </form>
            {walkIn.error && <p className="mt-2 text-sm text-red-600">{(walkIn.error as Error).message}</p>}
          </Card>
        </div>
      )}

      {act.error && (
        <div className="mb-4">
          <Alert>{(act.error as Error).message}</Alert>
        </div>
      )}

      <Card className="overflow-x-auto p-0">
        {schedule.isLoading && <div className="px-5"><Spinner /></div>}
        {!schedule.isLoading && appts.length === 0 && (
          <p className="px-5 py-8 text-center text-slate-500">No appointments for this day.</p>
        )}
        {appts.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Time</th>
                <th className="px-5 py-3">Ticket</th>
                <th className="px-5 py-3">Patient</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Queue</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {appts.map((a) => (
                <tr key={a.id} className={a.status === 'IN_PROGRESS' ? 'bg-violet-50/50' : undefined}>
                  <td className="whitespace-nowrap px-5 py-3 tabular-nums">
                    {formatTime(a.startTime)}
                    {a.isWalkIn && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">walk-in</span>}
                  </td>
                  <td className="px-5 py-3 tabular-nums text-slate-500">#{a.id}</td>
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-900">{a.patientName}</div>
                    {a.patientEmail && <div className="text-xs text-slate-500">{a.patientEmail}</div>}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-5 py-3 tabular-nums text-slate-600">{a.queue ? `#${a.queue.position}` : '–'}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1.5">
                      {(ACTIONS[a.status] ?? [])
                        .filter((x) => isTodaySelected || x.to === 'CANCEL' || x.to === 'NO_SHOW')
                        .map((x) => (
                          <Button
                            key={x.label}
                            size="sm"
                            variant={x.variant ?? 'primary'}
                            disabled={act.isPending}
                            onClick={() => act.mutate({ id: a.id, to: x.to })}
                          >
                            {x.label}
                          </Button>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
