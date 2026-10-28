export function formatDate(iso) {
  if (!iso) return 'Date TBA';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function dateParts(iso) {
  if (!iso) return { weekday: '', day: '–', month: 'TBA' };
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return {
    weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
    day: date.getDate(),
    month: date.toLocaleDateString('en-US', { month: 'short' }),
  };
}

export const formatMoney = (amount) => `$${Number(amount).toFixed(2)}`;

export const pluralSeats = (count) => `${count} seat${count === 1 ? '' : 's'}`;

export function formatClock(totalSeconds) {
  const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const secs = String(totalSeconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

export const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// "19:00" becomes "7:00 PM". Empty input gives an empty string.
export function formatClockTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
