// Campus events API and static file server. Uses only Node's built-in modules.
import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { events as seedEvents } from '../src/data/events.js';
import {
  ACCESSIBLE_SEATS,
  CAMPUS_TZ_OFFSET,
  CATEGORIES,
  HOLD_SECONDS,
  MAX_PASSWORD_LENGTH,
  MAX_SEATS_PER_BOOKING,
  MAX_SEATS_PER_PERSON,
  MIN_PASSWORD_LENGTH,
  PAYMENT_WINDOW_MINUTES,
  REFUND_WINDOW_HOURS,
  REMINDER_HOURS,
  SEATS_PER_EVENT,
} from '../src/config.js';
import { generatePassCode } from '../src/lib/passes.js';
import { hashPassword, verifyPassword } from './auth.js';
import { queueEmail } from './mailer.js';
import { PAYMENT_METHOD_IDS, processPayment, processRefund } from './payments.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DEFAULT_DATA_FILE = path.join(HERE, 'data', 'db.json');
const DEFAULT_DIST = path.join(ROOT, 'dist');
const MAX_BODY_BYTES = 16 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const PASS_CODE_PATTERN = /^CE-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/;
const HOUR_MS = 60 * 60 * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
};

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// Staff accounts are set by the ADMIN_EMAILS environment variable (comma-separated).
export function adminEmailsFromEnv() {
  return (process.env.ADMIN_EMAILS ?? 'admin@campus.edu')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

const iso = (ms) => new Date(ms).toISOString();
const withDefaults = (list) =>
  list.map((e) => ({ ...e, published: e.published ?? true, time: e.time ?? '' }));

// When an event starts, in campus time. Events without a time start at 8:00 AM.
const startMs = (item) => Date.parse(`${item.date}T${item.time || '08:00'}:00${CAMPUS_TZ_OFFSET}`);
const isActive = (booking) => booking.status !== 'cancelled';
const formatWhen = (ms) =>
  new Date(ms).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });

function seedDb() {
  return {
    sessions: {},
    users: {},
    events: withDefaults(seedEvents),
    // Seats blocked by the organisers. Shown as taken, never released.
    reservations: { 1: [1, 2, 3], 2: [10, 11], 3: [] },
    holds: [], // { eventId, seats, email, expiresAt }
    bookings: [], // see handleApi: booking records
    waitlist: [], // { id, eventId, email, joinedAt, notifiedAt }
    outbox: [],
  };
}

// Brings data files from earlier versions up to the current shape.
function migrate(db) {
  db.users ??= {};
  db.events = Array.isArray(db.events) ? withDefaults(db.events) : withDefaults(seedEvents);
  db.reservations ??= {};
  db.holds ??= [];
  db.outbox ??= [];
  db.bookings ??= [];
  db.waitlist ??= [];
  for (const b of db.bookings) {
    b.status ??= 'paid'; // bookings made before payments existed count as paid
    b.paidAt ??= b.bookedOn ?? null;
    b.checkedInAt ??= null;
    b.time ??= db.events.find((e) => e.id === b.eventId)?.time ?? '';
    b.reminderSentAt ??= null;
    b.refundStatus ??= null;
  }
  return db;
}

// Seats that someone else can't pick: blocked by organisers, booked, or held by another person.
function takenSeats(db, eventId, exceptEmail = null) {
  const taken = new Set(db.reservations[eventId] || []);
  for (const b of db.bookings) {
    if (b.eventId === eventId && isActive(b)) b.seats.forEach((s) => taken.add(s));
  }
  for (const h of db.holds) {
    if (h.eventId === eventId && h.email !== exceptEmail) h.seats.forEach((s) => taken.add(s));
  }
  return [...taken];
}

const seatsLeftFor = (db, eventId) => SEATS_PER_EVENT - takenSeats(db, eventId).length;

function reservationsMap(db, exceptEmail = null) {
  return Object.fromEntries(db.events.map((e) => [e.id, takenSeats(db, e.id, exceptEmail)]));
}

// Seats this person has already booked for an event (pending or paid).
function seatsOwned(db, email, eventId) {
  return db.bookings
    .filter((b) => b.email === email && b.eventId === eventId && isActive(b))
    .reduce((total, b) => total + b.seats.length, 0);
}

const myHold = (db, email, eventId) =>
  db.holds.find((h) => h.email === email && h.eventId === eventId) ?? null;

// Tell people on the waitlist once seats are free. Each person is told once.
function notifyWaitlist(db, eventId, nowMs) {
  if (seatsLeftFor(db, eventId) <= 0) return false;
  const event = db.events.find((e) => e.id === eventId);
  let changed = false;
  for (const entry of db.waitlist) {
    if (entry.eventId !== eventId || entry.notifiedAt) continue;
    entry.notifiedAt = iso(nowMs);
    queueEmail(db, {
      to: entry.email,
      subject: `A seat opened: ${event?.title ?? 'your event'}`,
      body: 'A seat is now available. Open the app to select your seats before someone else takes them.',
    });
    changed = true;
  }
  return changed;
}

// Emails a reminder for paid bookings starting within the reminder window. Each booking is reminded once.
function sendReminders(db, nowMs) {
  let count = 0;
  for (const b of db.bookings) {
    if (b.status !== 'paid' || b.reminderSentAt) continue;
    const start = startMs({ date: b.eventDate, time: b.time });
    if (start <= nowMs || start - nowMs > REMINDER_HOURS * HOUR_MS) continue;
    b.reminderSentAt = iso(nowMs);
    queueEmail(db, {
      to: b.email,
      subject: `Reminder: ${b.eventTitle} is tomorrow`,
      body: `${b.eventTitle} starts ${formatWhen(start)} at ${b.venue}. Your seats: ${b.seats.join(', ')}. Pass code: ${b.code}.`,
    });
    count += 1;
  }
  return count;
}

// Releases expired holds and unpaid bookings, sends reminders and waitlist notices.
// Returns true if anything changed, so the caller knows to save.
function purgeExpired(db, nowMs) {
  let changed = false;
  const holdsBefore = db.holds.length;
  db.holds = db.holds.filter((h) => Date.parse(h.expiresAt) > nowMs);
  if (db.holds.length !== holdsBefore) changed = true;

  const overdue = db.bookings.filter((b) => b.status === 'pending' && Date.parse(b.paymentDueAt) <= nowMs);
  for (const b of overdue) {
    queueEmail(db, {
      to: b.email,
      subject: `Booking released: ${b.eventTitle}`,
      body: `Payment for seat(s) ${b.seats.join(', ')} was not received in time, so the seats were released.`,
    });
  }
  if (overdue.length > 0) {
    db.bookings = db.bookings.filter((b) => !overdue.includes(b));
    for (const eventId of new Set(overdue.map((b) => b.eventId))) notifyWaitlist(db, eventId, nowMs);
    changed = true;
  }

  if (sendReminders(db, nowMs) > 0) changed = true;
  return changed;
}

// All writes go through one queue so overlapping requests can't overwrite each other.
// Files are written to a temporary name and renamed, so a crash never leaves half a file.
export function createStore(dataFile, now = () => Date.now()) {
  let queue = Promise.resolve();

  async function loadRaw() {
    let db;
    try {
      db = JSON.parse(await readFile(dataFile, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return migrate(seedDb());
      throw err;
    }
    return migrate(db);
  }

  async function write(db) {
    await mkdir(path.dirname(dataFile), { recursive: true });
    const tmp = `${dataFile}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(db, null, 2));
    await rename(tmp, dataFile);
  }

  // Read-only view. Expired items are hidden, but nothing is saved here.
  async function read() {
    const db = await loadRaw();
    purgeExpired(db, now());
    return db;
  }

  // fn(db) returns { value, changed }. Throwing an HttpError aborts without writing.
  function update(fn) {
    const run = queue.then(async () => {
      const db = await loadRaw();
      const expired = purgeExpired(db, now());
      const { value, changed } = await fn(db);
      if (changed || expired) await write(db);
      return value;
    });
    queue = run.catch(() => {});
    return run;
  }

  return { read, update, now };
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'That request is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'The request body must be valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function bearerToken(req) {
  const match = /^Bearer ([a-f0-9]{48})$/.exec(req.headers.authorization || '');
  return match ? match[1] : null;
}

function requireSession(db, req) {
  const token = bearerToken(req);
  const session = token ? db.sessions[token] : null;
  if (!session) throw new HttpError(401, 'Please sign in to continue.');
  return session;
}

function requireStaff(db, req) {
  const session = requireSession(db, req);
  if (session.role !== 'admin') throw new HttpError(403, 'Only event staff can do that.');
  return session;
}

const findEventIn = (db, id) => db.events.find((e) => e.id === Number(id)) ?? null;
const openEvents = (db) => db.events.filter((e) => e.published);
const isAccessible = (db, email) => db.users[email]?.accessibilityVerified === true;

function parseSeats(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_SEATS_PER_BOOKING) {
    throw new HttpError(400, `Choose between 1 and ${MAX_SEATS_PER_BOOKING} seats.`);
  }
  const seats = raw.map(Number);
  const valid = seats.every((s) => Number.isInteger(s) && s >= 1 && s <= SEATS_PER_EVENT);
  if (!valid || new Set(seats).size !== seats.length) {
    throw new HttpError(400, 'Those seat numbers are not valid.');
  }
  return seats.sort((a, b) => a - b);
}

// Wheelchair spaces are only for students staff have approved.
function checkAccessibleSeats(db, email, seats) {
  const wheelchair = seats.filter((s) => ACCESSIBLE_SEATS.wheelchair.includes(s));
  if (wheelchair.length > 0 && !isAccessible(db, email)) {
    throw new HttpError(
      403,
      `Seat${wheelchair.length > 1 ? 's' : ''} ${wheelchair.join(', ')} ${wheelchair.length > 1 ? 'are' : 'is'} reserved for students approved for accessible seating. Contact the accessibility office.`
    );
  }
}

function uniquePassCode(db) {
  let code;
  do {
    code = generatePassCode();
  } while (db.bookings.some((b) => b.code === code));
  return code;
}

// Validates event details. With partial = true, only the fields present are checked.
export function validateEvent(input, { partial = false } = {}) {
  const out = {};
  const has = (key) => input[key] !== undefined;

  if (!partial || has('title')) {
    const title = String(input.title ?? '').trim();
    if (title.length < 3 || title.length > 120) throw new HttpError(400, 'Title must be 3 to 120 characters.');
    out.title = title;
  }
  if (!partial || has('category')) {
    if (!CATEGORIES.includes(input.category)) {
      throw new HttpError(400, `Category must be one of: ${CATEGORIES.join(', ')}.`);
    }
    out.category = input.category;
  }
  if (!partial || has('date')) {
    const date = String(input.date ?? '');
    if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(date))) {
      throw new HttpError(400, 'Choose a valid date.');
    }
    out.date = date;
  }
  if (!partial || has('time')) {
    const time = String(input.time ?? '').trim();
    if (time && !TIME_PATTERN.test(time)) throw new HttpError(400, 'Start time must look like 19:00.');
    out.time = time;
  }
  if (!partial || has('venue')) {
    const venue = String(input.venue ?? '').trim();
    if (venue.length < 2 || venue.length > 80) throw new HttpError(400, 'Venue must be 2 to 80 characters.');
    out.venue = venue;
  }
  if (!partial || has('price')) {
    const price = Number(input.price);
    if (!Number.isFinite(price) || price < 0 || price > 500) {
      throw new HttpError(400, 'Price must be between 0 and 500.');
    }
    out.price = Math.round(price * 100) / 100;
  }
  if (!partial || has('description')) {
    const description = String(input.description ?? '').trim();
    if (description.length > 400) throw new HttpError(400, 'Description must be 400 characters or fewer.');
    out.description = description;
  }
  if (!partial || has('published')) {
    if (typeof input.published !== 'boolean') throw new HttpError(400, 'Published must be true or false.');
    out.published = input.published;
  }
  return out;
}

// Keeps existing bookings showing the current title, date, time and venue.
function syncBookings(db, event) {
  for (const booking of db.bookings) {
    if (booking.eventId === event.id) {
      booking.eventTitle = event.title;
      booking.eventDate = event.date;
      booking.time = event.time;
      booking.venue = event.venue;
    }
  }
}

async function handleApi(req, res, url, store, { adminEmails }) {
  const { pathname } = url;
  const { method } = req;
  const now = store.now;

  // ---- Accounts ----

  if (method === 'POST' && pathname === '/api/sign-in') {
    const body = await readJsonBody(req);
    const mode = body.mode === 'signup' ? 'signup' : 'signin';
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');

    if (!EMAIL_PATTERN.test(email) || email.length > 120) {
      throw new HttpError(400, 'Please enter a valid email address.');
    }
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      throw new HttpError(400, `Password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`);
    }
    if (mode === 'signup' && (!name || name.length > 60)) {
      throw new HttpError(400, 'Please enter your name (60 characters or fewer).');
    }

    const existing = (await store.read()).users[email];
    if (mode === 'signup' && existing) {
      throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
    }
    if (mode === 'signin') {
      if (!existing) throw new HttpError(401, 'No account uses that email. Create an account first.');
      if (!(await verifyPassword(password, existing))) throw new HttpError(401, 'Wrong password.');
    }

    const credentials = mode === 'signup' ? await hashPassword(password) : null;
    const role = adminEmails.includes(email) ? 'admin' : 'student';
    const token = randomBytes(24).toString('hex');
    let user;
    await store.update((db) => {
      if (mode === 'signup') {
        if (db.users[email]) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
        db.users[email] = {
          name,
          email,
          salt: credentials.salt,
          hash: credentials.hash,
          accessibilityVerified: false,
          createdAt: iso(now()),
        };
      }
      user = db.users[email];
      db.sessions[token] = { name: user.name, email, role, createdAt: iso(now()) };
      return { value: null, changed: true };
    });
    return sendJson(res, 200, {
      token,
      user: { name: user.name, email, role, accessible: user.accessibilityVerified === true },
    });
  }

  if (method === 'POST' && pathname === '/api/sign-out') {
    const token = bearerToken(req);
    if (token) {
      await store.update((db) => {
        delete db.sessions[token];
        return { value: null, changed: true };
      });
    }
    return sendJson(res, 200, { ok: true });
  }

  // ---- Public ----

  // Public: the landing page lists upcoming events before sign-in.
  if (method === 'GET' && pathname === '/api/events') {
    const db = await store.read();
    return sendJson(res, 200, { events: openEvents(db) });
  }

  if (method === 'GET' && pathname === '/api/state') {
    const db = await store.read();
    const session = requireSession(db, req);
    return sendJson(res, 200, {
      user: {
        name: session.name,
        email: session.email,
        role: session.role,
        accessible: isAccessible(db, session.email),
      },
      events: openEvents(db),
      reservations: reservationsMap(db, session.email),
      myHolds: db.holds
        .filter((h) => h.email === session.email)
        .map((h) => ({ eventId: h.eventId, seats: h.seats, expiresAt: h.expiresAt })),
      myWaitlist: db.waitlist
        .filter((w) => w.email === session.email)
        .map((w) => ({ eventId: w.eventId, notifiedAt: w.notifiedAt })),
      bookings: db.bookings.filter((b) => b.email === session.email),
    });
  }

  // ---- Waitlist ----

  const waitlistMatch = /^\/api\/events\/(\d+)\/waitlist$/.exec(pathname);
  if (waitlistMatch && method === 'POST') {
    await store.update((db) => {
      const session = requireSession(db, req);
      const event = findEventIn(db, waitlistMatch[1]);
      if (!event || !event.published) throw new HttpError(404, 'That event was not found.');
      if (seatsLeftFor(db, event.id) > 0) {
        throw new HttpError(409, 'Seats are still available. Select them now.');
      }
      if (db.waitlist.some((w) => w.eventId === event.id && w.email === session.email)) {
        return { value: null, changed: false };
      }
      db.waitlist.push({ id: randomUUID(), eventId: event.id, email: session.email, joinedAt: iso(now()), notifiedAt: null });
      queueEmail(db, {
        to: session.email,
        subject: `You're on the waitlist: ${event.title}`,
        body: "We'll email you as soon as a seat opens up.",
      });
      return { value: null, changed: true };
    });
    return sendJson(res, 201, { ok: true });
  }

  if (waitlistMatch && method === 'DELETE') {
    await store.update((db) => {
      const session = requireSession(db, req);
      const before = db.waitlist.length;
      db.waitlist = db.waitlist.filter((w) => !(w.eventId === Number(waitlistMatch[1]) && w.email === session.email));
      return { value: null, changed: db.waitlist.length !== before };
    });
    return sendJson(res, 200, { ok: true });
  }

  // ---- Seat holds (5 minutes, kept on the server) ----

  if (method === 'POST' && pathname === '/api/holds') {
    const body = await readJsonBody(req);
    const hold = await store.update((db) => {
      const session = requireSession(db, req);
      const event = findEventIn(db, body.eventId);
      if (!event || !event.published) throw new HttpError(404, 'That event is not open for booking.');
      if (startMs(event) <= now()) throw new HttpError(409, 'This event has already started.');

      const seats = parseSeats(body.seats);
      checkAccessibleSeats(db, session.email, seats);
      const conflicts = seats.filter((s) => takenSeats(db, event.id, session.email).includes(s));
      if (conflicts.length > 0) {
        throw new HttpError(
          409,
          `Seat${conflicts.length > 1 ? 's' : ''} ${conflicts.join(', ')} ${conflicts.length > 1 ? 'are' : 'is'} already taken.`,
          { conflicts }
        );
      }

      const owned = seatsOwned(db, session.email, event.id);
      if (owned + seats.length > MAX_SEATS_PER_PERSON) {
        throw new HttpError(
          409,
          `You can hold up to ${MAX_SEATS_PER_PERSON} seats for this event. You already have ${owned}.`
        );
      }

      db.holds = db.holds.filter((h) => !(h.email === session.email && h.eventId === event.id));
      const created = {
        eventId: event.id,
        seats,
        email: session.email,
        expiresAt: iso(now() + HOLD_SECONDS * 1000),
      };
      db.holds.push(created);
      return { value: created, changed: true };
    });
    return sendJson(res, 200, hold);
  }

  const holdMatch = /^\/api\/holds\/(\d+)$/.exec(pathname);
  if (method === 'DELETE' && holdMatch) {
    await store.update((db) => {
      const session = requireSession(db, req);
      const before = db.holds.length;
      db.holds = db.holds.filter((h) => !(h.email === session.email && h.eventId === Number(holdMatch[1])));
      return { value: null, changed: db.holds.length !== before };
    });
    return sendJson(res, 200, { ok: true });
  }

  // ---- Bookings and payment ----

  if (method === 'POST' && pathname === '/api/bookings') {
    const body = await readJsonBody(req);
    const booking = await store.update((db) => {
      const session = requireSession(db, req);
      const event = findEventIn(db, body.eventId);
      if (!event || !event.published) throw new HttpError(404, 'That event is not open for booking.');
      if (startMs(event) <= now()) throw new HttpError(409, 'This event has already started.');

      const hold = myHold(db, session.email, event.id);
      if (!hold) throw new HttpError(409, 'Your seat hold has expired. Please select your seats again.');
      checkAccessibleSeats(db, session.email, hold.seats);

      const owned = seatsOwned(db, session.email, event.id);
      if (owned + hold.seats.length > MAX_SEATS_PER_PERSON) {
        throw new HttpError(
          409,
          `You can hold up to ${MAX_SEATS_PER_PERSON} seats for this event. You already have ${owned}.`
        );
      }

      const booked = db.bookings
        .filter((b) => b.eventId === event.id && isActive(b))
        .flatMap((b) => b.seats);
      if (hold.seats.some((s) => booked.includes(s))) {
        throw new HttpError(409, 'Some of those seats were just booked by someone else.');
      }

      db.holds = db.holds.filter((h) => h !== hold);
      const dueMs = now() + PAYMENT_WINDOW_MINUTES * 60 * 1000;
      const created = {
        id: randomUUID(),
        code: uniquePassCode(db),
        eventId: event.id,
        eventTitle: event.title,
        eventDate: event.date,
        time: event.time,
        venue: event.venue,
        seats: hold.seats,
        totalPaid: hold.seats.length * event.price,
        bookedOn: iso(now()),
        name: session.name,
        email: session.email,
        status: 'pending',
        paymentDueAt: iso(dueMs),
        paidAt: null,
        paymentRef: null,
        paymentMethod: null,
        checkedInAt: null,
        reminderSentAt: null,
        refundStatus: null,
      };
      db.bookings.push(created);
      queueEmail(db, {
        to: session.email,
        subject: `Payment needed: ${event.title}`,
        body: `Seats ${hold.seats.join(', ')} are held for you until ${formatWhen(dueMs)}. Pay in the app to receive your pass code.`,
      });
      return { value: created, changed: true };
    });
    return sendJson(res, 201, booking);
  }

  const payMatch = /^\/api\/bookings\/([\w-]+)\/pay$/.exec(pathname);
  if (method === 'POST' && payMatch) {
    const body = await readJsonBody(req);
    if (!PAYMENT_METHOD_IDS.includes(body.method)) throw new HttpError(400, 'Choose a payment method.');
    const paid = await store.update((db) => {
      const session = requireSession(db, req);
      const booking = db.bookings.find((b) => b.id === payMatch[1] && b.email === session.email && isActive(b));
      if (!booking) throw new HttpError(404, 'That booking was not found or its payment window has closed.');
      if (booking.status === 'paid') throw new HttpError(409, 'This booking is already paid.');

      const receipt = processPayment({ amount: booking.totalPaid, method: body.method });
      Object.assign(booking, {
        status: 'paid',
        paidAt: iso(now()),
        paymentRef: receipt.reference,
        paymentMethod: body.method,
      });
      queueEmail(db, {
        to: booking.email,
        subject: `Your pass: ${booking.eventTitle}`,
        body: `Payment received (${receipt.reference}). Your pass code is ${booking.code}. Seats: ${booking.seats.join(', ')}.`,
      });
      return { value: booking, changed: true };
    });
    return sendJson(res, 200, paid);
  }

  const cancelMatch = /^\/api\/bookings\/([\w-]+)$/.exec(pathname);
  if (method === 'DELETE' && cancelMatch) {
    const outcome = await store.update((db) => {
      const session = requireSession(db, req);
      const booking = db.bookings.find((b) => b.id === cancelMatch[1] && isActive(b));
      // Other people's bookings look the same as missing ones, so ids can't be probed.
      if (!booking || booking.email !== session.email) {
        throw new HttpError(404, 'That booking was not found.');
      }

      const nowMs = now();
      const wasPaid = booking.status === 'paid';
      const hoursBefore = (startMs({ date: booking.eventDate, time: booking.time }) - nowMs) / HOUR_MS;
      const refundable = wasPaid && hoursBefore >= REFUND_WINDOW_HOURS;

      let refundRef = null;
      if (refundable) {
        refundRef = processRefund({ amount: booking.totalPaid, reference: booking.paymentRef }).reference;
        booking.refundRef = refundRef;
        booking.refundedAmount = booking.totalPaid;
      }
      booking.refundStatus = refundable ? 'refunded' : wasPaid ? 'not_eligible' : 'none';
      booking.status = 'cancelled';
      booking.cancelledAt = iso(nowMs);

      const refundLine = refundable
        ? `A full refund of ${booking.totalPaid} was issued (${refundRef}).`
        : wasPaid
          ? `This booking was cancelled less than ${REFUND_WINDOW_HOURS} hours before the event, so it is not refundable.`
          : 'No payment was taken, so there is nothing to refund.';
      queueEmail(db, {
        to: booking.email,
        subject: `Booking cancelled: ${booking.eventTitle}`,
        body: `Seat(s) ${booking.seats.join(', ')} were released. ${refundLine}`,
      });
      notifyWaitlist(db, booking.eventId, nowMs);
      return {
        value: { ok: true, refund: { status: booking.refundStatus, amount: refundable ? booking.totalPaid : 0, reference: refundRef } },
        changed: true,
      };
    });
    return sendJson(res, 200, outcome);
  }

  // ---- Staff only ----

  if (method === 'GET' && pathname === '/api/admin/overview') {
    const db = await store.read();
    requireStaff(db, req);
    return sendJson(res, 200, {
      events: db.events,
      reservations: reservationsMap(db),
      bookings: [...db.bookings].sort((a, b) => b.bookedOn.localeCompare(a.bookedOn)),
      outbox: db.outbox.slice(-30).reverse(),
      accessibleEmails: Object.values(db.users)
        .filter((u) => u.accessibilityVerified)
        .map((u) => u.email),
    });
  }

  if (method === 'POST' && pathname === '/api/admin/events') {
    const body = await readJsonBody(req);
    requireStaff(await store.read(), req); // check permission before checking the input
    const fields = validateEvent({ description: '', published: true, time: '', ...body });
    const created = await store.update((db) => {
      requireStaff(db, req);
      const id = Math.max(0, ...db.events.map((e) => e.id)) + 1;
      const event = { id, ...fields };
      db.events.push(event);
      return { value: event, changed: true };
    });
    return sendJson(res, 201, created);
  }

  const eventMatch = /^\/api\/admin\/events\/(\d+)$/.exec(pathname);
  if (method === 'PATCH' && eventMatch) {
    const body = await readJsonBody(req);
    requireStaff(await store.read(), req);
    const changes = validateEvent(body, { partial: true });
    if (Object.keys(changes).length === 0) throw new HttpError(400, 'Nothing to change.');
    const updated = await store.update((db) => {
      requireStaff(db, req);
      const event = findEventIn(db, eventMatch[1]);
      if (!event) throw new HttpError(404, 'That event was not found.');
      Object.assign(event, changes);
      syncBookings(db, event);
      return { value: event, changed: true };
    });
    return sendJson(res, 200, updated);
  }

  if (method === 'POST' && pathname === '/api/admin/accessibility') {
    const body = await readJsonBody(req);
    requireStaff(await store.read(), req);
    const email = String(body.email ?? '').trim().toLowerCase();
    const verified = body.verified === true;
    const result = await store.update((db) => {
      requireStaff(db, req);
      const user = db.users[email];
      if (!user) throw new HttpError(404, 'No account uses that email.');
      user.accessibilityVerified = verified;
      queueEmail(db, {
        to: email,
        subject: 'Accessible seating update',
        body: verified
          ? 'You have been approved for accessible seating. Wheelchair spaces are now available to you.'
          : 'Your accessible seating approval has been removed.',
      });
      return { value: { email, verified }, changed: true };
    });
    return sendJson(res, 200, result);
  }

  if (method === 'POST' && pathname === '/api/admin/checkin') {
    const body = await readJsonBody(req);
    requireStaff(await store.read(), req);
    const code = String(body.code ?? '').trim().toUpperCase();
    if (!PASS_CODE_PATTERN.test(code)) throw new HttpError(400, 'Enter a pass code like CE-ABCDE.');
    const booking = await store.update((db) => {
      requireStaff(db, req);
      const found = db.bookings.find((b) => b.code === code);
      if (!found) throw new HttpError(404, 'No pass matches that code.');
      if (found.status === 'cancelled') throw new HttpError(409, 'This pass was cancelled.', { booking: found });
      if (found.status !== 'paid') throw new HttpError(409, 'This pass has not been paid yet.', { booking: found });
      if (found.checkedInAt) {
        const time = new Date(found.checkedInAt).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });
        throw new HttpError(409, `This pass was already checked in at ${time}.`, { booking: found });
      }
      found.checkedInAt = iso(now());
      return { value: found, changed: true };
    });
    return sendJson(res, 200, booking);
  }

  throw new HttpError(404, 'Not found.');
}

async function serveStatic(pathname, res, distDir) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, 'Bad request path.');
  }
  const target = path.join(distDir, decoded);
  if (target !== distDir && !target.startsWith(distDir + path.sep)) {
    throw new HttpError(403, 'Forbidden.');
  }

  let file = target;
  let body;
  try {
    body = await readFile(file);
  } catch {
    // Unknown paths get the app, so deep links like /#event-2 and refreshes work.
    file = path.join(distDir, 'index.html');
    try {
      body = await readFile(file);
    } catch {
      throw new HttpError(404, 'The app has not been built yet. Run "npm run build" first, or use "npm run dev".');
    }
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
  });
  res.end(body);
}

export function createAppServer({
  dataFile = DEFAULT_DATA_FILE,
  distDir = DEFAULT_DIST,
  adminEmails = adminEmailsFromEnv(),
  now = () => Date.now(),
} = {}) {
  const store = createStore(dataFile, now);
  const options = { adminEmails };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url, store, options);
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        res.end();
        return;
      }
      await serveStatic(url.pathname, res, distDir);
    } catch (err) {
      if (err instanceof HttpError) {
        if (!res.headersSent) sendJson(res, err.status, { error: err.message, ...err.extra });
        return;
      }
      console.error(err);
      if (!res.headersSent) sendJson(res, 500, { error: 'Something went wrong on the server.' });
    }
  });

  // Runs scheduled work (reminders, expired holds and waitlist notices) even when nobody is using the app.
  server.tick = () => store.update(() => ({ value: null, changed: false }));
  return server;
}

// Start the server when run directly: `node server/server.js`
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.PORT) || 3001;
  const dataFile = process.env.DATA_FILE || DEFAULT_DATA_FILE;
  const server = createAppServer({ dataFile });
  server.listen(port, () => {
    console.log(`Campus events running at http://localhost:${port}`);
    console.log(`Data file: ${dataFile}`);
    console.log(`Staff accounts: ${adminEmailsFromEnv().join(', ')}`);
  });
  setInterval(() => server.tick().catch((err) => console.error('Scheduled task failed:', err)), 60 * 1000);
}
