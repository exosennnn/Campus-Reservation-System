import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAppServer } from './server.js';

const STAFF_EMAIL = 'admin@campus.edu';
const HOUR = 60 * 60 * 1000;
const PASSWORD = 'correct-horse';

let server;
let base;
let dir;
let t; // controllable clock, in milliseconds
const advance = (ms) => {
  t += ms;
};

before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'campus-api-'));
  t = Date.parse('2026-10-28T10:00:00Z');
  server = createAppServer({
    dataFile: path.join(dir, 'db.json'),
    distDir: path.join(dir, 'no-dist'),
    adminEmails: [STAFF_EMAIL],
    now: () => t,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
});

async function call(method, route, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + route, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function account(name, email, password = PASSWORD) {
  const res = await call('POST', '/api/sign-in', { body: { mode: 'signup', name, email, password } });
  assert.equal(res.status, 200, res.data.error);
  return res.data.token;
}

async function holdAndBook(token, eventId, seats) {
  const hold = await call('POST', '/api/holds', { token, body: { eventId, seats } });
  assert.equal(hold.status, 200, hold.data.error);
  const booking = await call('POST', '/api/bookings', { token, body: { eventId } });
  assert.equal(booking.status, 201, booking.data.error);
  return booking.data;
}

let alice;
let bob;
let staff;

test('accounts need a password of 8+ characters and a unique email', async () => {
  const short = await call('POST', '/api/sign-in', {
    body: { mode: 'signup', name: 'Alice', email: 'alice@campus.edu', password: 'short' },
  });
  assert.equal(short.status, 400);

  alice = await account('Alice Tan', 'alice@campus.edu');
  const dup = await call('POST', '/api/sign-in', {
    body: { mode: 'signup', name: 'Alice', email: 'alice@campus.edu', password: PASSWORD },
  });
  assert.equal(dup.status, 409);
});

test('sign-in checks the password and the account exists', async () => {
  const wrong = await call('POST', '/api/sign-in', {
    body: { mode: 'signin', email: 'alice@campus.edu', password: 'not-the-password' },
  });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.data.error, 'Wrong password.');

  const unknown = await call('POST', '/api/sign-in', {
    body: { mode: 'signin', email: 'nobody@campus.edu', password: PASSWORD },
  });
  assert.equal(unknown.status, 401);

  const ok = await call('POST', '/api/sign-in', {
    body: { mode: 'signin', email: 'alice@campus.edu', password: PASSWORD },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.role, 'student');
});

test('the password is stored as a salted hash, never in plain text', async () => {
  const { readFile } = await import('node:fs/promises');
  const raw = await readFile(path.join(dir, 'db.json'), 'utf8');
  assert.equal(raw.includes(PASSWORD), false);
  assert.match(raw, /"hash":\s*"[a-f0-9]{128}"/);
});

test('staff accounts are recognised from the staff email list', async () => {
  staff = await account('Front Desk', STAFF_EMAIL);
  const res = await call('GET', '/api/state', { token: staff });
  assert.equal(res.data.user.role, 'admin');
});

test('the event list is public, the account state is not', async () => {
  const pub = await call('GET', '/api/events');
  assert.equal(pub.data.events.length, 3);
  assert.equal((await call('GET', '/api/state')).status, 401);
});

test('a seat hold blocks others and can be changed or released', async () => {
  bob = await account('Bob Reyes', 'bob@campus.edu');

  const held = await call('POST', '/api/holds', { token: alice, body: { eventId: 1, seats: [5, 6] } });
  assert.equal(held.status, 200);
  assert.ok(held.data.expiresAt);

  const bobView = await call('GET', '/api/state', { token: bob });
  assert.ok(bobView.data.reservations['1'].includes(5));
  assert.deepEqual(bobView.data.myHolds, []);

  const clash = await call('POST', '/api/holds', { token: bob, body: { eventId: 1, seats: [6, 7] } });
  assert.equal(clash.status, 409);
  assert.deepEqual(clash.data.conflicts, [6]);

  const switched = await call('POST', '/api/holds', { token: alice, body: { eventId: 1, seats: [8] } });
  assert.equal(switched.status, 200);
  const aliceView = await call('GET', '/api/state', { token: alice });
  assert.deepEqual(aliceView.data.myHolds[0].seats, [8]);
  assert.equal(aliceView.data.reservations['1'].includes(5), false);

  assert.equal((await call('DELETE', '/api/holds/1', { token: alice })).status, 200);
  const freed = await call('POST', '/api/holds', { token: bob, body: { eventId: 1, seats: [5] } });
  assert.equal(freed.status, 200);
  await call('DELETE', '/api/holds/1', { token: bob });
});

test('a hold expires on the server after five minutes', async () => {
  await call('POST', '/api/holds', { token: alice, body: { eventId: 2, seats: [20] } });
  advance(5 * 60 * 1000 + 1000);
  const view = await call('GET', '/api/state', { token: alice });
  assert.deepEqual(view.data.myHolds, []);
  const bobTakes = await call('POST', '/api/holds', { token: bob, body: { eventId: 2, seats: [20] } });
  assert.equal(bobTakes.status, 200);
  await call('DELETE', '/api/holds/2', { token: bob });
});

test('booking needs a live hold and creates a booking awaiting payment', async () => {
  const none = await call('POST', '/api/bookings', { token: alice, body: { eventId: 2 } });
  assert.equal(none.status, 409);

  await call('POST', '/api/holds', { token: alice, body: { eventId: 2, seats: [21, 22] } });
  const booking = await call('POST', '/api/bookings', { token: alice, body: { eventId: 2 } });
  assert.equal(booking.status, 201);
  assert.equal(booking.data.status, 'pending');
  assert.deepEqual(booking.data.seats, [21, 22]);
  assert.equal(booking.data.totalPaid, 20);

  // An unpaid pass cannot be checked in.
  const checkin = await call('POST', '/api/admin/checkin', { token: staff, body: { code: booking.data.code } });
  assert.equal(checkin.status, 409);
  assert.match(checkin.data.error, /not been paid/);
});

test('paying turns the booking into a pass and sends a receipt', async () => {
  const state = await call('GET', '/api/state', { token: alice });
  const pending = state.data.bookings.find((b) => b.seats.includes(21));
  assert.equal(pending.status, 'pending');

  const badMethod = await call('POST', `/api/bookings/${pending.id}/pay`, { token: alice, body: { method: 'cash' } });
  assert.equal(badMethod.status, 400);

  const paid = await call('POST', `/api/bookings/${pending.id}/pay`, { token: alice, body: { method: 'card' } });
  assert.equal(paid.status, 200);
  assert.equal(paid.data.status, 'paid');
  assert.match(paid.data.paymentRef, /^SBX-[A-F0-9]{8}$/);

  const again = await call('POST', `/api/bookings/${pending.id}/pay`, { token: alice, body: { method: 'card' } });
  assert.equal(again.status, 409);

  const overview = await call('GET', '/api/admin/overview', { token: staff });
  assert.ok(overview.data.outbox.some((m) => m.to === 'alice@campus.edu' && m.subject.startsWith('Your pass')));

  const checkin = await call('POST', '/api/admin/checkin', { token: staff, body: { code: pending.code } });
  assert.equal(checkin.status, 200);
  const twice = await call('POST', '/api/admin/checkin', { token: staff, body: { code: pending.code } });
  assert.equal(twice.status, 409);
  assert.match(twice.data.error, /already checked in/);
});

test('an unpaid booking is released after the payment window and seats become free', async () => {
  const booking = await holdAndBook(bob, 3, [3, 4]);
  const taken = await call('GET', '/api/state', { token: alice });
  assert.ok(taken.data.reservations['3'].includes(3));

  advance(11 * 60 * 1000);
  const after = await call('GET', '/api/state', { token: bob });
  assert.equal(after.data.bookings.some((b) => b.id === booking.id), false);
  const freed = await call('GET', '/api/state', { token: alice });
  assert.equal(freed.data.reservations['3'].includes(3), false);

  const overview = await call('GET', '/api/admin/overview', { token: staff });
  assert.ok(overview.data.outbox.some((m) => m.subject.startsWith('Booking released')));
});

test('one person can hold at most six seats for an event, paid or pending', async () => {
  const carol = await account('Carol Cruz', 'carol@campus.edu');
  await holdAndBook(carol, 3, [5, 6, 7, 8]);

  const over = await call('POST', '/api/holds', { token: carol, body: { eventId: 3, seats: [9, 10, 11] } });
  assert.equal(over.status, 409);
  assert.match(over.data.error, /hold up to 6 seats/);
  assert.match(over.data.error, /already have 4/);

  const within = await call('POST', '/api/holds', { token: carol, body: { eventId: 3, seats: [9, 10] } });
  assert.equal(within.status, 200);
  await call('DELETE', '/api/holds/3', { token: carol });
});

test('the owner can cancel, and nobody else can', async () => {
  const dan = await account('Dan Lim', 'dan@campus.edu');
  const booking = await holdAndBook(dan, 3, [12]);

  const intruder = await call('DELETE', `/api/bookings/${booking.id}`, { token: alice });
  assert.equal(intruder.status, 404);

  const cancel = await call('DELETE', `/api/bookings/${booking.id}`, { token: dan });
  assert.equal(cancel.status, 200);
  assert.equal(cancel.data.refund.status, 'none');
  const state = await call('GET', '/api/state', { token: dan });
  assert.equal(state.data.bookings.find((b) => b.id === booking.id).status, 'cancelled');
});

test('students cannot reach staff routes, and invalid input is rejected', async () => {
  assert.equal((await call('GET', '/api/admin/overview', { token: alice })).status, 403);
  assert.equal((await call('POST', '/api/admin/events', { token: alice, body: {} })).status, 403);
  assert.equal((await call('POST', '/api/admin/checkin', { token: alice, body: { code: 'CE-ABCDE' } })).status, 403);

  const bad = [
    { title: 'x', category: 'Tech', date: '2026-12-02', venue: 'Lab', price: 5 },
    { title: 'Good title', category: 'Music', date: '2026-12-02', venue: 'Lab', price: 5 },
    { title: 'Good title', category: 'Tech', date: '02-12-2026', venue: 'Lab', price: 5 },
    { title: 'Good title', category: 'Tech', date: '2026-12-02', venue: 'Lab', price: -1 },
  ];
  for (const body of bad) {
    assert.equal((await call('POST', '/api/admin/events', { token: staff, body })).status, 400);
  }
});

test('staff can add a hidden event, open it, and edits reach existing bookings', async () => {
  const created = await call('POST', '/api/admin/events', {
    token: staff,
    body: { title: 'Robotics Expo', category: 'Tech', date: '2026-12-02', venue: 'Lab 2', price: 5, published: false },
  });
  assert.equal(created.status, 201);
  const publicList = await call('GET', '/api/events');
  assert.equal(publicList.data.events.some((e) => e.title === 'Robotics Expo'), false);

  const opened = await call('PATCH', `/api/admin/events/${created.data.id}`, { token: staff, body: { published: true } });
  assert.equal(opened.status, 200);
  const after = await call('GET', '/api/events');
  assert.equal(after.data.events.some((e) => e.title === 'Robotics Expo'), true);

  const booking = await holdAndBook(alice, 2, [19]);
  await call('PATCH', '/api/admin/events/2', { token: staff, body: { title: 'Renamed Play' } });
  const state = await call('GET', '/api/state', { token: alice });
  assert.equal(state.data.bookings.find((b) => b.id === booking.id).eventTitle, 'Renamed Play');
});

test('a cancelled booking sends a cancellation email', async () => {
  const eve = await account('Eve Mendoza', 'eve@campus.edu');
  const booking = await holdAndBook(eve, 1, [18]);
  await call('DELETE', `/api/bookings/${booking.id}`, { token: eve });
  const overview = await call('GET', '/api/admin/overview', { token: staff });
  assert.ok(overview.data.outbox.some((m) => m.subject.startsWith('Booking cancelled')));
});

// ---- Tests for refunds, waitlists, reminders, sessions and accessible seating ----

// Campus-time date and HH:MM for a moment, so tests stay correct whatever today's date is.
function campusWhen(ms) {
  const d = new Date(ms + 8 * 60 * 60 * 1000).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
}

async function createEvent(token, fields) {
  const res = await call('POST', '/api/admin/events', { token, body: { category: 'Arts', venue: 'Hall A', price: 10, ...fields } });
  assert.equal(res.status, 201, res.data.error);
  return res.data;
}

test('accessible seats need staff approval', async () => {
  const wes = await account('Wes Ong', 'wes@campus.edu');
  const denied = await call('POST', '/api/holds', { token: wes, body: { eventId: 2, seats: [1] } });
  assert.equal(denied.status, 403);
  assert.match(denied.data.error, /accessible seating/);

  const approve = await call('POST', '/api/admin/accessibility', { token: staff, body: { email: 'wes@campus.edu', verified: true } });
  assert.equal(approve.status, 200);
  const allowed = await call('POST', '/api/holds', { token: wes, body: { eventId: 2, seats: [1] } });
  assert.equal(allowed.status, 200);
  await call('DELETE', '/api/holds/2', { token: wes });

  const state = await call('GET', '/api/state', { token: wes });
  assert.equal(state.data.user.accessible, true);
});

test('accessibility approval only works for real accounts and staff', async () => {
  assert.equal((await call('POST', '/api/admin/accessibility', { token: alice, body: { email: 'wes@campus.edu', verified: true } })).status, 403);
  assert.equal((await call('POST', '/api/admin/accessibility', { token: staff, body: { email: 'nobody@campus.edu', verified: true } })).status, 404);
});

test('several sessions of one show keep their own times', async () => {
  const day = campusWhen(t + 5 * 24 * HOUR);
  const later = campusWhen(t + 6 * 24 * HOUR);
  const first = await createEvent(staff, { title: 'Night Concert', date: day.date, time: '19:00' });
  const second = await createEvent(staff, { title: 'Night Concert', date: later.date, time: '14:00' });
  const pub = await call('GET', '/api/events');
  const sessions = pub.data.events.filter((e) => e.title === 'Night Concert');
  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions.map((e) => e.time).sort(), ['14:00', '19:00']);
  assert.notEqual(first.id, second.id);

  const bad = await call('POST', '/api/admin/events', {
    token: staff,
    body: { title: 'Bad time', category: 'Tech', date: day.date, time: '25:00', venue: 'Lab', price: 1 },
  });
  assert.equal(bad.status, 400);
});

test('a paid booking cancelled 48 hours or more before the event is refunded', async () => {
  const when = campusWhen(t + 5 * 24 * HOUR);
  const event = await createEvent(staff, { title: 'Far Away Talk', date: when.date, time: when.time });
  const eve = await account('Refund Eve', 'refund-eve@campus.edu');
  const booking = await holdAndBook(eve, event.id, [5, 6]);
  await call('POST', `/api/bookings/${booking.id}/pay`, { token: eve, body: { method: 'card' } });

  const cancel = await call('DELETE', `/api/bookings/${booking.id}`, { token: eve });
  assert.equal(cancel.status, 200);
  assert.equal(cancel.data.refund.status, 'refunded');
  assert.equal(cancel.data.refund.amount, 20);
  assert.match(cancel.data.refund.reference, /^RFD-/);
});

test('a paid booking cancelled within 48 hours is not refunded', async () => {
  const when = campusWhen(t + 24 * HOUR);
  const event = await createEvent(staff, { title: 'Tomorrow Talk', date: when.date, time: when.time });
  const ian = await account('Late Ian', 'late-ian@campus.edu');
  const booking = await holdAndBook(ian, event.id, [4]);
  await call('POST', `/api/bookings/${booking.id}/pay`, { token: ian, body: { method: 'card' } });

  const cancel = await call('DELETE', `/api/bookings/${booking.id}`, { token: ian });
  assert.equal(cancel.data.refund.status, 'not_eligible');
  assert.equal(cancel.data.refund.amount, 0);
});

test('the waitlist opens only for sold-out events and emails people when a seat frees up', async () => {
  const when = campusWhen(t + 10 * 24 * HOUR);
  const event = await createEvent(staff, { title: 'Sold Out Night', date: when.date, time: when.time });

  const notYet = await call('POST', `/api/events/${event.id}/waitlist`, { token: alice });
  assert.equal(notYet.status, 409);

  const groups = [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12], [13, 14, 15, 16, 17, 18], [19, 20, 21, 22, 23, 24]];
  const holders = [];
  for (let i = 0; i < groups.length; i++) {
    const token = await account(`Full House ${i}`, `full${i}@campus.edu`);
    if (i === 0) {
      // The first group holds the wheelchair spaces, so it must be approved.
      await call('POST', '/api/admin/accessibility', { token: staff, body: { email: `full${i}@campus.edu`, verified: true } });
    }
    const booking = await holdAndBook(token, event.id, groups[i]);
    holders.push({ token, booking });
  }

  const late = await account('Late Comer', 'late-comer@campus.edu');
  const join = await call('POST', `/api/events/${event.id}/waitlist`, { token: late });
  assert.equal(join.status, 201);
  const state = await call('GET', '/api/state', { token: late });
  assert.equal(state.data.myWaitlist[0].eventId, event.id);

  const freed = await call('DELETE', `/api/bookings/${holders[0].booking.id}`, { token: holders[0].token });
  assert.equal(freed.status, 200);
  const overview = await call('GET', '/api/admin/overview', { token: staff });
  assert.ok(overview.data.outbox.some((m) => m.to === 'late-comer@campus.edu' && m.subject.startsWith('A seat opened')));
});

test('a reminder goes out once, about 24 hours before a paid event', async () => {
  const when = campusWhen(t + 30 * HOUR);
  const event = await createEvent(staff, { title: 'Reminder Check', date: when.date, time: when.time });
  const rita = await account('Rita Reminder', 'rita@campus.edu');
  const booking = await holdAndBook(rita, event.id, [5]);
  await call('POST', `/api/bookings/${booking.id}/pay`, { token: rita, body: { method: 'card' } });

  const countReminders = async () =>
    (await call('GET', '/api/admin/overview', { token: staff })).data.outbox.filter(
      (m) => m.to === 'rita@campus.edu' && m.subject.startsWith('Reminder:')
    ).length;

  await server.tick();
  assert.equal(await countReminders(), 0);

  advance(7 * HOUR);
  await server.tick();
  assert.equal(await countReminders(), 1);
  await server.tick();
  assert.equal(await countReminders(), 1);
});
