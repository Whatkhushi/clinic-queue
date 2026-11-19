export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

/** 540 -> "9:00 AM" */
export function minuteToLabel(minute: number) {
  const d = new Date(2000, 0, 1, Math.floor(minute / 60), minute % 60);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** "09:30" <-> 570 for <input type="time"> */
export const timeToMinute = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const minuteToTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Local YYYY-MM-DD, `offset` days from today. */
export function localDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

/** Short summary like "Mon–Sat" or "Sun, Mon, Wed, Fri". */
export function workingDaysLabel(days: number[]) {
  const unique = [...new Set(days)].sort();
  if (unique.length === 0) return 'No hours set';
  const contiguous = unique.every((d, i) => i === 0 || d === unique[i - 1] + 1);
  if (contiguous && unique.length > 2) return `${DAY_NAMES[unique[0]]}–${DAY_NAMES[unique[unique.length - 1]]}`;
  return unique.map((d) => DAY_NAMES[d]).join(', ');
}
