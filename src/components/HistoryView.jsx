import { useState } from 'react';
import { formatMoney } from '../lib/format.js';
import { TicketStub } from './Ticket.jsx';
import Reveal from './Reveal.jsx';
import TiltCard from './TiltCard.jsx';

export default function HistoryView({ bookings, onCancel, onPay, onAddToCalendar, onBrowse }) {
  return (
    <section className="page" aria-labelledby="history-heading">
      <Reveal>
        <button type="button" className="btn-quiet" onClick={onBrowse}>
          Back to events
        </button>
      </Reveal>

      <Reveal className="page-intro">
        <h2 id="history-heading">My passes</h2>
        <p>Every seat you've reserved, in one place.</p>
      </Reveal>

      {bookings.length === 0 ? (
        <Reveal className="history-empty-v2">
          <svg className="empty-ticket" viewBox="0 0 120 80" aria-hidden="true">
            <rect x="4" y="12" width="112" height="56" rx="10" />
            <line x1="84" y1="12" x2="84" y2="68" />
          </svg>
          <h3>No passes yet</h3>
          <p>Choose an event to reserve your first seats. Your passes will appear here.</p>
        </Reveal>
      ) : (
        <div className="history-list">
          {bookings.map((booking, i) => (
            <Reveal key={booking.id} delay={Math.min(i, 6) * 90}>
              <PassTicket
                booking={booking}
                onCancel={onCancel}
                onPay={onPay}
                onAddToCalendar={onAddToCalendar}
              />
            </Reveal>
          ))}
        </div>
      )}
    </section>
  );
}

function PassTicket({ booking, onCancel, onPay, onAddToCalendar }) {
  const paid = booking.status === 'paid';
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(booking.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const bookedText = booking.bookedOn
    ? new Date(booking.bookedOn).toLocaleDateString()
    : booking.date || 'Unknown';

  return (
    <TiltCard as="article" className={`ticket pass pass-v2 ${paid ? 'is-paid' : 'is-pending'}`}>
      <TicketStub iso={booking.eventDate} />
      <div className="ticket-body">
        <div className="pass-head">
          <h3>{booking.eventTitle}</h3>
          <span className={`status-pill ${paid ? 'on' : 'pending'}`}>{paid ? 'Paid' : 'Awaiting payment'}</span>
        </div>

        <dl className="pass-facts">
          <div>
            <dt>Seats</dt>
            <dd>{booking.seats.join(', ')}</dd>
          </div>
          <div>
            <dt>Paid</dt>
            <dd>{formatMoney(booking.totalPaid)}</dd>
          </div>
          <div>
            <dt>Booked</dt>
            <dd>{bookedText}</dd>
          </div>
        </dl>

        {paid ? (
          <div className="code-box">
            <span className="muted small">Pass code</span>
            <strong className="pass-code">{booking.code}</strong>
            <button type="button" className="btn-quiet copy-btn" onClick={copyCode}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        ) : (
          <p className="pending-note">Pay before the timer ends, or the seats are released.</p>
        )}

        <div className="pass-actions">
          {paid ? (
            <button type="button" className="btn-secondary" onClick={() => onAddToCalendar(booking)}>
              Add to calendar
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={() => onPay(booking)}>
              Pay now
            </button>
          )}
          <button type="button" className="btn-quiet danger" onClick={() => onCancel(booking.id)}>
            Cancel booking
          </button>
        </div>
      </div>
    </TiltCard>
  );
}
