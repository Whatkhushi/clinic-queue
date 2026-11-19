import { DateTime } from 'luxon';
import { config } from '../config.js';

/** Start and end (UTC) of a calendar day in the clinic's time zone. */
export function dayRange(date: string): { start: Date; end: Date; local: DateTime } {
  const local = DateTime.fromISO(date, { zone: config.CLINIC_TZ }).startOf('day');
  if (!local.isValid) throw new Error(`Invalid date: ${date}`);
  return { start: local.toUTC().toJSDate(), end: local.plus({ days: 1 }).toUTC().toJSDate(), local };
}

/** Today's date (YYYY-MM-DD) in the clinic's time zone. */
export function today(): string {
  return DateTime.now().setZone(config.CLINIC_TZ).toISODate()!;
}

/** Luxon weekday is 1 (Mon) .. 7 (Sun); we store 0 (Sun) .. 6 (Sat) like JS. */
export function dayOfWeek(local: DateTime): number {
  return local.weekday % 7;
}

/** Convert "minutes since local midnight" on a given local day to a UTC Date. */
export function atMinute(localDay: DateTime, minute: number): Date {
  return localDay.plus({ minutes: minute }).toUTC().toJSDate();
}
