import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickBestSeats } from './seats.js';
import { buildICS, generatePassCode, passCodeFromId } from './passes.js';
import { countdownLabel, daysUntil, eventHash, nextUpcoming, parseEventHash } from './schedule.js';

const CODE_PATTERN = /^CE-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/;

test('pickBestSeats chooses seats side by side in the first row', () => {
  assert.deepEqual(pickBestSeats([], 3), { seats: [1, 2, 3], together: true });
});

test('pickBestSeats skips seats that are already taken', () => {
  assert.deepEqual(pickBestSeats([1, 2], 3), { seats: [3, 4, 5], together: true });
});

test('pickBestSeats moves to the next row when no row has a gap big enough', () => {
  // Row 1 has single free seats only, so the first pair is in row 2.
  assert.deepEqual(pickBestSeats([2, 4, 6, 8], 2), { seats: [9, 10], together: true });
});

test('pickBestSeats falls back to scattered seats when nothing fits together', () => {
  const taken = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
  assert.deepEqual(pickBestSeats(taken, 2), { seats: [1, 3], together: false });
});

test('pickBestSeats returns null when there are not enough free seats', () => {
  const taken = Array.from({ length: 23 }, (_, i) => i + 1);
  assert.equal(pickBestSeats(taken, 2), null);
});

test('passCodeFromId is deterministic and well formed', () => {
  assert.equal(passCodeFromId(1700000000000), passCodeFromId(1700000000000));
  assert.match(passCodeFromId(1700000000000), CODE_PATTERN);
  assert.match(passCodeFromId(0), CODE_PATTERN);
});

test('generatePassCode produces readable codes', () => {
  for (let i = 0; i < 50; i++) {
    assert.match(generatePassCode(), CODE_PATTERN);
  }
});

test('buildICS creates an all-day event that rolls over the month end', () => {
  const ics = buildICS({
    code: 'CE-ABCDE',
    eventTitle: 'Talk, Panel; Q&A',
    venue: 'Hall',
    eventDate: '2026-11-30',
    seats: [1, 2],
  });
  const lines = ics.split('\r\n');
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.equal(lines.at(-1), 'END:VCALENDAR');
  assert.ok(lines.includes('DTSTART;VALUE=DATE:20261130'));
  assert.ok(lines.includes('DTEND;VALUE=DATE:20261201'));
  assert.ok(lines.includes('SUMMARY:Talk\\, Panel\\; Q&A'));
  assert.ok(lines.includes('UID:CE-ABCDE@campus-events'));
});

test('daysUntil counts calendar days from today', () => {
  const today = new Date(2026, 10, 14, 23, 30); // 14 Nov, late evening
  assert.equal(daysUntil('2026-11-14', today), 0);
  assert.equal(daysUntil('2026-11-20', today), 6);
  assert.equal(daysUntil('2026-11-01', today), -13);
});

test('nextUpcoming returns the soonest booking that has not happened', () => {
  const today = new Date(2026, 10, 15);
  const bookings = [
    { id: 1, eventDate: '2026-11-01' },
    { id: 2, eventDate: '2026-11-25' },
    { id: 3, eventDate: '2026-11-20' },
  ];
  assert.equal(nextUpcoming(bookings, today).id, 3);
  assert.equal(nextUpcoming([{ id: 1, eventDate: '2026-11-01' }], today), null);
});

test('countdownLabel reads naturally for today, tomorrow and later', () => {
  assert.equal(countdownLabel(0), 'Today');
  assert.equal(countdownLabel(1), 'Tomorrow');
  assert.equal(countdownLabel(5), 'In 5 days');
});

test('event hashes round-trip and reject anything else', () => {
  assert.equal(eventHash(3), '#event-3');
  assert.equal(parseEventHash('#event-3'), 3);
  assert.equal(parseEventHash('#event-3x'), null);
  assert.equal(parseEventHash(''), null);
  assert.equal(parseEventHash('#catalog'), null);
});
