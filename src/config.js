export const SEATS_PER_EVENT = 24;
export const MAX_SEATS_PER_BOOKING = 6;
export const MAX_SEATS_PER_PERSON = 6; // total seats one person can hold for one event
export const HOLD_SECONDS = 300;
export const PAYMENT_WINDOW_MINUTES = 10; // time to pay after booking, before seats are released
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

// Sandbox payment methods. No real money moves; see server/payments.js.
export const PAYMENT_METHODS = [
  { id: 'card', label: 'Card' },
  { id: 'ewallet', label: 'E-wallet' },
];
export const CATEGORIES = ['Tech', 'Arts', 'Sports'];

// Refunds: a paid booking cancelled this many hours or more before the event gets a full refund.
export const REFUND_WINDOW_HOURS = 48;
// Students get a reminder email this many hours before a paid event.
export const REMINDER_HOURS = 24;
// Event times are campus local time (Philippines).
export const CAMPUS_TZ_OFFSET = '+08:00';

// Accessible seating. Wheelchair spaces need a student approved by staff.
export const ACCESSIBLE_SEATS = {
  wheelchair: [1, 2],
  nearEntrance: [1, 8, 9, 16, 17, 24],
};

// Only browser-side settings are stored locally. Bookings live on the server.
export const STORAGE_KEYS = {
  theme: 'theme',
  token: 'authToken',
};
