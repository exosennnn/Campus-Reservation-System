// Emails are written to an outbox stored with the data. Staff can see them in Staff tools.
// To send real email, replace `queueEmail` with a call to your provider (SMTP, SendGrid, etc.)
// and keep the same outbox record for the audit trail.
import { randomUUID } from 'node:crypto';

const OUTBOX_LIMIT = 200;

export function queueEmail(db, { to, subject, body }) {
  db.outbox.push({
    id: randomUUID(),
    to,
    subject,
    body,
    sentAt: new Date().toISOString(),
  });
  if (db.outbox.length > OUTBOX_LIMIT) db.outbox.splice(0, db.outbox.length - OUTBOX_LIMIT);
}
