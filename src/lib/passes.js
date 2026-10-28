// Pass codes are short, readable and avoid look-alike characters (no I, O, 0, 1).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

export function generatePassCode() {
  const bytes = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (n) => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('');
  return `CE-${body}`;
}

// Used once, when migrating bookings saved before pass codes existed.
export function passCodeFromId(id) {
  const base = CODE_ALPHABET.length;
  let n = Math.floor(Math.abs(Number(id))) % base ** CODE_LENGTH;
  let body = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    body = CODE_ALPHABET[n % base] + body;
    n = Math.floor(n / base);
  }
  return `CE-${body}`;
}

const escapeICS = (text) =>
  String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

const compactDate = (iso) => iso.replace(/-/g, '');

function dayAfter(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10).replace(/-/g, '');
}

// Builds an all-day calendar event for a booking (the catalogue has no start times).
export function buildICS(booking) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CampusEvents//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${booking.code}@campus-events`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compactDate(booking.eventDate)}`,
    `DTEND;VALUE=DATE:${dayAfter(booking.eventDate)}`,
    `SUMMARY:${escapeICS(booking.eventTitle)}`,
    `LOCATION:${escapeICS(booking.venue || '')}`,
    `DESCRIPTION:${escapeICS(`Pass ${booking.code}. Seats: ${booking.seats.join(', ')}.`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

export function downloadICS(booking) {
  const blob = new Blob([buildICS(booking)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${booking.code}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
