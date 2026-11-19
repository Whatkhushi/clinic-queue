import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { minuteToLabel, workingDaysLabel } from '../lib/format';
import type { Provider } from '../lib/types';
import { Alert, Card, Spinner } from '../components/ui';

export default function HomePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['providers'],
    queryFn: () => api<{ providers: Provider[] }>('/providers'),
  });

  return (
    <div>
      <section className="mb-10 rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 px-6 py-10 text-white sm:px-10">
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Skip the crowded waiting room.</h1>
        <p className="mt-3 max-w-2xl text-brand-100">
          Book a slot with your doctor, then follow your live place in the queue from home. You’ll know exactly when to
          walk in.
        </p>
        <div className="mt-6 grid max-w-2xl gap-3 text-sm sm:grid-cols-3">
          {['Pick a doctor & time', 'Check in at reception', 'Watch your live position'].map((step, i) => (
            <div key={step} className="rounded-lg bg-white/10 px-3 py-2">
              <span className="font-semibold">{i + 1}.</span> {step}
            </div>
          ))}
        </div>
      </section>

      <h2 className="mb-4 text-lg font-semibold text-slate-900">Our doctors</h2>
      {isLoading && <Spinner />}
      {error && <Alert>Couldn’t load doctors: {(error as Error).message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.providers.map((p) => {
          const first = [...p.workingHours].sort((a, b) => a.startMinute - b.startMinute)[0];
          const last = [...p.workingHours].sort((a, b) => b.endMinute - a.endMinute)[0];
          return (
            <Card key={p.id} className="flex flex-col">
              <div className="flex items-start gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 font-semibold text-brand-800">
                  {p.name.replace('Dr. ', '').split(' ').map((w) => w[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{p.name}</h3>
                  <p className="text-sm text-slate-600">{p.specialty}</p>
                </div>
              </div>
              <dl className="mt-4 space-y-1 text-sm text-slate-600">
                <div className="flex justify-between">
                  <dt>Days</dt>
                  <dd className="font-medium text-slate-800">{workingDaysLabel(p.workingHours.map((h) => h.dayOfWeek))}</dd>
                </div>
                {first && last && (
                  <div className="flex justify-between">
                    <dt>Hours</dt>
                    <dd className="font-medium text-slate-800">
                      {minuteToLabel(first.startMinute)} – {minuteToLabel(last.endMinute)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt>Visit length</dt>
                  <dd className="font-medium text-slate-800">{p.slotMinutes} min</dd>
                </div>
              </dl>
              <div className="mt-5 flex gap-2">
                <Link
                  to={`/book/${p.id}`}
                  className="flex-1 rounded-lg bg-brand-700 px-3 py-2 text-center text-sm font-medium text-white hover:bg-brand-800"
                >
                  Book appointment
                </Link>
                <Link
                  to={`/board/${p.id}`}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
                >
                  Live queue
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
      {data && data.providers.length === 0 && <Alert tone="info">No doctors have been added yet.</Alert>}
    </div>
  );
}
