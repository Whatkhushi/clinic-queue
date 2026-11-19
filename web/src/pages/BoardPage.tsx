import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useQueueUpdates } from '../lib/socket';
import type { PublicQueue } from '../lib/types';

/** Full-screen display for a TV in the waiting room. Shows ticket numbers only, never names. */
export default function BoardPage() {
  const providerId = Number(useParams().providerId);
  const [now, setNow] = useState(new Date());

  const { data, error, refetch } = useQuery({
    queryKey: ['board', providerId],
    queryFn: () => api<PublicQueue>(`/providers/${providerId}/queue`),
    refetchInterval: 60_000, // safety net in case a socket message is missed
  });
  useQueueUpdates([providerId], () => refetch());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 p-6 text-white sm:p-10">
      <header className="flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-lg font-semibold">
          <span className="grid size-9 place-items-center rounded-lg bg-brand-500">Q</span>
          ClinicQ
        </Link>
        <div className="text-2xl tabular-nums text-slate-300">
          {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </div>
      </header>

      {error && <p className="mt-10 text-red-300">Couldn’t load the queue.</p>}
      {data && (
        <main className="mt-8 flex flex-1 flex-col">
          <h1 className="text-3xl font-semibold sm:text-4xl">{data.provider.name}</h1>
          <p className="text-lg text-slate-400">{data.provider.specialty}</p>

          <div className="mt-10 grid flex-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
            <section className="flex flex-col items-center justify-center rounded-2xl bg-brand-700 p-10 text-center">
              <p className="text-xl uppercase tracking-widest text-brand-100">Now seeing</p>
              <p className="mt-4 text-8xl font-bold tabular-nums sm:text-9xl">
                {data.nowServing ? `#${data.nowServing}` : '—'}
              </p>
            </section>

            <section className="rounded-2xl bg-slate-800 p-8">
              <div className="flex items-baseline justify-between">
                <p className="text-xl uppercase tracking-widest text-slate-400">Up next</p>
                <p className="text-slate-400">
                  {data.waitingCount} waiting · ~{data.estimatedWaitMinutes} min
                </p>
              </div>
              <ol className="mt-6 grid grid-cols-3 gap-3">
                {data.waiting.slice(0, 12).map((id, i) => (
                  <li
                    key={id}
                    className={`rounded-xl py-4 text-center text-3xl font-semibold tabular-nums ${
                      i === 0 ? 'bg-amber-400 text-slate-900' : 'bg-slate-700'
                    }`}
                  >
                    #{id}
                  </li>
                ))}
              </ol>
              {data.waitingCount === 0 && <p className="mt-6 text-2xl text-slate-500">No one waiting</p>}
            </section>
          </div>
          <p className="mt-6 text-center text-slate-500">
            Track your own position on your phone at <span className="text-slate-300">{window.location.host}</span>
          </p>
        </main>
      )}
    </div>
  );
}
