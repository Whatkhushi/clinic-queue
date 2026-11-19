import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { DAY_NAMES, minuteToLabel, minuteToTime, timeToMinute, workingDaysLabel } from '../lib/format';
import type { Provider, User } from '../lib/types';
import { Alert, Button, Card, Field, PageHeader, Spinner, cx } from '../components/ui';

/** Simple hours editor: same start/end time on each selected day. */
function HoursEditor({
  value,
  onChange,
}: {
  value: { days: number[]; start: string; end: string };
  onChange: (v: { days: number[]; start: string; end: string }) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700">Working days</span>
      <div className="flex flex-wrap gap-1.5">
        {DAY_NAMES.map((name, d) => {
          const on = value.days.includes(d);
          return (
            <button
              type="button"
              key={name}
              onClick={() => onChange({ ...value, days: on ? value.days.filter((x) => x !== d) : [...value.days, d] })}
              className={cx(
                'rounded-lg px-2.5 py-1.5 text-sm ring-1',
                on ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-300',
              )}
            >
              {name}
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="From" type="time" value={value.start} onChange={(e) => onChange({ ...value, start: e.target.value })} />
        <Field label="To" type="time" value={value.end} onChange={(e) => onChange({ ...value, end: e.target.value })} />
      </div>
    </div>
  );
}

const toHours = (v: { days: number[]; start: string; end: string }) =>
  v.days.map((d) => ({ dayOfWeek: d, startMinute: timeToMinute(v.start), endMinute: timeToMinute(v.end) }));

function ProviderRow({ p }: { p: Provider }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const first = p.workingHours[0];
  const [hours, setHours] = useState({
    days: [...new Set(p.workingHours.map((h) => h.dayOfWeek))],
    start: minuteToTime(first?.startMinute ?? 540),
    end: minuteToTime(first?.endMinute ?? 1020),
  });

  const update = useMutation({
    mutationFn: (body: object) => api(`/providers/${p.id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['admin-providers'] });
      queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
  });

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900">{p.name}</span>
            {!p.active && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">hidden</span>}
          </div>
          <div className="text-sm text-slate-500">
            {p.specialty} · {p.slotMinutes} min · {workingDaysLabel(p.workingHours.map((h) => h.dayOfWeek))}{' '}
            {p.workingHours
              .filter((h, i, all) => all.findIndex((x) => x.startMinute === h.startMinute) === i)
              .map((h) => `${minuteToLabel(h.startMinute)}–${minuteToLabel(h.endMinute)}`)
              .join(', ')}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEditing(!editing)}>
            {editing ? 'Close' : 'Edit hours'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => update.mutate({ active: !p.active })}>
            {p.active ? 'Hide' : 'Show'}
          </Button>
        </div>
      </div>
      {editing && (
        <div className="mt-4 max-w-md space-y-3 rounded-lg bg-slate-50 p-4">
          <HoursEditor value={hours} onChange={setHours} />
          <p className="text-xs text-slate-500">This replaces all of this doctor’s current hours.</p>
          <Button size="sm" onClick={() => update.mutate({ workingHours: toHours(hours) })} disabled={update.isPending}>
            Save hours
          </Button>
        </div>
      )}
      {update.error && <p className="mt-2 text-sm text-red-600">{(update.error as Error).message}</p>}
    </div>
  );
}

export default function AdminPage() {
  const queryClient = useQueryClient();
  const providers = useQuery({
    queryKey: ['admin-providers'],
    // Admin sees hidden doctors too: fetch each active one + rely on PATCH responses.
    queryFn: () => api<{ providers: Provider[] }>('/providers'),
  });
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api<{ staff: User[] }>('/admin/staff') });

  const [doc, setDoc] = useState({ name: '', specialty: '', slotMinutes: 15 });
  const [hours, setHours] = useState({ days: [1, 2, 3, 4, 5, 6], start: '09:00', end: '17:00' });
  const createDoc = useMutation({
    mutationFn: () => api('/providers', { method: 'POST', body: { ...doc, workingHours: toHours(hours) } }),
    onSuccess: () => {
      setDoc({ name: '', specialty: '', slotMinutes: 15 });
      queryClient.invalidateQueries({ queryKey: ['admin-providers'] });
      queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
  });

  const [member, setMember] = useState({ name: '', email: '', password: '' });
  const createStaff = useMutation({
    mutationFn: () => api('/admin/staff', { method: 'POST', body: member }),
    onSuccess: () => {
      setMember({ name: '', email: '', password: '' });
      queryClient.invalidateQueries({ queryKey: ['staff'] });
    },
  });

  return (
    <div>
      <PageHeader title="Admin" subtitle="Manage doctors, their hours, and front-desk accounts." />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="p-0">
            <h2 className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-900">Doctors</h2>
            {providers.isLoading && <div className="px-5"><Spinner /></div>}
            <div className="divide-y divide-slate-100">
              {providers.data?.providers.map((p) => <ProviderRow key={p.id} p={p} />)}
            </div>
          </Card>

          <Card className="p-0">
            <h2 className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-900">Staff accounts</h2>
            <div className="divide-y divide-slate-100">
              {staff.data?.staff.map((s) => (
                <div key={s.id} className="flex justify-between px-5 py-3 text-sm">
                  <span className="font-medium text-slate-800">{s.name}</span>
                  <span className="text-slate-500">
                    {s.email} · {s.role.toLowerCase()}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="font-semibold text-slate-900">Add a doctor</h2>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                createDoc.mutate();
              }}
            >
              {createDoc.error && <Alert>{(createDoc.error as Error).message}</Alert>}
              <Field label="Name" required placeholder="Dr. Jane Doe" value={doc.name} onChange={(e) => setDoc({ ...doc, name: e.target.value })} />
              <Field
                label="Specialty"
                required
                placeholder="Cardiologist"
                value={doc.specialty}
                onChange={(e) => setDoc({ ...doc, specialty: e.target.value })}
              />
              <Field
                label="Visit length (minutes)"
                type="number"
                min={5}
                max={120}
                step={5}
                value={doc.slotMinutes}
                onChange={(e) => setDoc({ ...doc, slotMinutes: Number(e.target.value) })}
              />
              <HoursEditor value={hours} onChange={setHours} />
              <Button type="submit" disabled={createDoc.isPending} className="w-full">
                Add doctor
              </Button>
            </form>
          </Card>

          <Card>
            <h2 className="font-semibold text-slate-900">Add a receptionist</h2>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                createStaff.mutate();
              }}
            >
              {createStaff.error && <Alert>{(createStaff.error as Error).message}</Alert>}
              {createStaff.isSuccess && <Alert tone="success">Staff account created.</Alert>}
              <Field label="Name" required value={member.name} onChange={(e) => setMember({ ...member, name: e.target.value })} />
              <Field label="Email" type="email" required value={member.email} onChange={(e) => setMember({ ...member, email: e.target.value })} />
              <Field
                label="Temporary password"
                type="password"
                minLength={8}
                required
                value={member.password}
                onChange={(e) => setMember({ ...member, password: e.target.value })}
              />
              <Button type="submit" disabled={createStaff.isPending} className="w-full">
                Create account
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
