# CampusEvents: event and seat reservation

A React app with a small Node server. Students sign in, pick seats, and get a pass that works on any device.

## Run it

Requires Node.js 18 or newer.

```bash
npm install
```

**Development** (two terminals):

```bash
npm run api     # terminal 1: API server on http://localhost:3001
npm run dev     # terminal 2: app on http://localhost:5173 (proxies /api to the server)
```

**Production** (one process):

```bash
npm run build   # builds the app into dist/
npm start       # serves the app and the API on http://localhost:3001
```

**Tests:**

```bash
npm test        # seat, pass, calendar and API tests
```

## How it works

- `server/server.js` is the API and static file server. It uses only Node's built-in modules.
- All data is kept in `server/data/db.json`: sessions, seat reservations and bookings. Every change is checked on the server, so two students can't take the same seat. Writes are queued and saved atomically.
- The app reloads seat availability every 4 seconds. If someone else takes a seat you've selected, it's released and you're told.
- Your theme choice is the only thing kept in the browser.

## Project layout

```
server/
  server.js             API routes, data store, static files
  server.test.js        API tests
src/
  App.jsx               app state, sign-in, polling, booking and cancelling
  api.js                fetch wrapper with readable errors
  main.jsx, styles.css
  config.js             seat count, hold time, storage keys
  data/events.js        event catalogue (the server reads this too)
  lib/
    format.js           dates, money, timer text
    reservations.js     seats-left helpers
    passes.js           pass codes, calendar export
    schedule.js         countdowns, event links
    seats.js            "Pick for me" logic
    storage.js          theme and sign-in token
    lib.test.js         unit tests
  hooks/                hold countdown, toasts
  components/           screens and shared pieces
```

## How the new parts work

- **Passwords.** Passwords are hashed with scrypt and a random salt for each account (`server/auth.js`). Plain-text passwords are never stored. Students create an account once, then sign in with email and password.
- **Seat holds.** Selecting seats creates a 5-minute hold on the server, so other students see those seats as taken. A hold is released when the time runs out, when the student leaves the seat map, or when the seats are booked.
- **Payment.** Reserving turns the hold into a booking that waits for payment for 10 minutes. Unpaid bookings are released automatically. A booking becomes a pass once it is paid, and only paid passes can be checked in.
- **Email.** Each event that matters (payment needed, receipt, cancellation, booking released) is saved to an outbox. Staff can see it in Staff tools.

## Connecting to real services

These parts are sandboxed. Each one has one file to change.

| Feature | Current state | To make it real |
| --- | --- | --- |
| Payment | `server/payments.js` records a reference and moves no money. | Replace `processPayment` with a call to PayMongo, Stripe or your bank's API. Use the secret key from an environment variable. Only mark the booking paid after the provider confirms it. |
| Email | `server/mailer.js` saves messages to the outbox. | Send each outbox message through SMTP or an email provider, such as SendGrid. Keep the outbox record for your audit trail. |
| Sign-in | Email and password, stored on this server. | Connect the sign-in step to your campus single sign-on (SSO) provider, for example via OpenID Connect. This needs approval and setup from the school's IT office. |

## Limits to know about

- **Campus SSO is not connected.** Students currently make their own accounts. Ask the school's IT office about SSO before launch.
- **Payments are a sandbox.** No real money is taken until you connect a provider.
- **Emails are saved, not sent,** until an email provider is connected.
- **The data file is a single JSON file.** It is fine for a campus-sized launch. A larger deployment should move to a database such as PostgreSQL.
- **Accounts from earlier versions have no password.** Those students need to create an account with the same email.

## Accessibility

- Focus moves to each screen's heading when you navigate.
- Cancelling a booking opens a modal dialog. Focus stays inside it, and Escape closes it.
- The checkout total is a live region, so updates are announced.

## Landing page and background

The signed-out landing page uses `public/school-bg.svg` as its background, an illustrated school drawn in SVG. To use a real photo of your school:

1. Put the photo in `public/`, for example `public/school.jpg`. Use a landscape image of at least 1600 px wide.
2. In `src/styles.css`, find `url('/school-bg.svg')` (there are three places) and change it to `url('/school.jpg')`.
3. Run `npm run build` again.

Keep the photo's main subject to the right of centre, because the copy sits on the left. Check the result in light and dark mode.

## Staff tools

Staff accounts are set with the `ADMIN_EMAILS` environment variable (comma-separated). If it isn't set, `admin@campus.edu` is the staff account.

```bash
ADMIN_EMAILS=frontdesk@campus.edu,registrar@campus.edu npm start
```

Staff sign in like students and get a **Staff tools** button in the navbar. From there they can:

- **Check in a pass.** Enter the pass code (for example `CE-ABCDE`). A pass is accepted once. A second attempt shows when it was first checked in.
- **Create and edit events.** New events can be saved hidden. Opening an event makes it visible to students. Editing an event also updates the title, date and venue on existing bookings.
- **See all bookings** and whether each pass has been checked in.

## Booking rules

- A person can hold at most **6 seats per event** in total, across all their bookings for that event.
- Only events that are open for booking can be reserved.

## Landing page

- **Hero:** the headline words animate in one at a time, and the school illustration drifts with the pointer. The "Sign in to book" button leans toward the cursor and moves the focus to the sign-in form.
- **Seat preview:** a demo seat map where visitors can pick up to six seats and see the total change. Nothing here is saved or reserved.
- **Event cards:** tilt toward the pointer and show a light that follows it.
- **Scroll reveals:** sections fade in as they come into view.
- **Reduced motion:** when the system asks for reduced motion, all movement is switched off and the content is shown at once.

If a screen ever crashes, the app shows an error message with a Reload button instead of a blank page.

## App background

Signed-in screens sit on a soft background: two floating colour glows, a faint dot grid, and a faint school illustration in the corner. It follows light and dark mode, and it stays still when reduced motion is on.

## Refunds, reminders, waitlist, sessions and accessible seating

- **Refunds.** A paid booking cancelled 48 hours or more before the event gets a full refund. Cancelling later is not refundable. The rule is `REFUND_WINDOW_HOURS` in `src/config.js`. Refunds go through `processRefund` in `server/payments.js`, which is a sandbox for now.
- **Reminders.** Each paid booking gets one email about 24 hours before the event (`REMINDER_HOURS`). The server checks every minute, even when nobody is using the app.
- **Waitlist.** When a sold-out event has a free seat again, everyone on its waitlist is emailed once.
- **Seat rows.** Seats are grouped into Row A (front), Row B (middle) and Row C (back). Seat numbers stay the same.
- **Sessions.** Create the same show as separate events with different times. The catalogue links them with "Also on".
- **Accessible seating.** Seats 1 and 2 are wheelchair spaces. Only students staff have approved under Staff tools can book them. Seats 1, 8, 9, 16, 17 and 24 are marked as near the entrance (`ACCESSIBLE_SEATS` in `src/config.js`).
- **Event times** are campus time (Philippines, +08:00).

Emails are still saved to the outbox, not sent, until an email provider is connected. Refunds and payments are still sandbox steps.
