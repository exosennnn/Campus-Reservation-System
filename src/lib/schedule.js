// Day arithmetic uses local calendar dates, so "today" matches what the student sees.
const DAY_MS = 86400000;

export function daysUntil(iso, today = new Date()) {
  const [y, m, d] = iso.split('-').map(Number);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(y, m - 1, d);
  return Math.round((target - start) / DAY_MS);
}

// The soonest booking that hasn't happened yet, or null.
export function nextUpcoming(bookings, today = new Date()) {
  return (
    bookings
      .filter((b) => b.eventDate && daysUntil(b.eventDate, today) >= 0)
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate))[0] ?? null
  );
}

export function countdownLabel(days) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

// Event links look like #event-3.
export const eventHash = (id) => `#event-${id}`;

export function parseEventHash(hash) {
  const match = /^#event-(\d+)$/.exec(hash || '');
  return match ? Number(match[1]) : null;
}
