import { useMemo } from 'react';
import { CATEGORIES, SEATS_PER_EVENT } from '../config.js';
import { seatsLeft } from '../lib/reservations.js';
import { dateParts, formatClockTime, formatDate, formatMoney } from '../lib/format.js';
import { countdownLabel, daysUntil } from '../lib/schedule.js';
import { TicketStub } from './Ticket.jsx';
import Reveal from './Reveal.jsx';
import TiltCard from './TiltCard.jsx';

export const SORT_OPTIONS = [
  { value: 'date', label: 'Date and time' },
  { value: 'price', label: 'Price, low to high' },
  { value: 'seats', label: 'Most seats left' },
];

const byStart = (a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);

export default function CatalogView({
  events,
  userName,
  nextBooking,
  onOpenPasses,
  query,
  category,
  sortBy,
  onlyAvailable,
  reservations,
  myWaitlist,
  onQueryChange,
  onCategoryChange,
  onSortChange,
  onOnlyAvailableChange,
  onSelect,
  onWaitlist,
}) {
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = events
      .filter((e) => e.title.toLowerCase().includes(needle))
      .filter((e) => category === 'all' || e.category === category)
      .filter((e) => !onlyAvailable || seatsLeft(reservations, e.id) > 0);

    return filtered.sort((a, b) => {
      if (sortBy === 'price') return a.price - b.price || byStart(a, b);
      if (sortBy === 'seats') return seatsLeft(reservations, b.id) - seatsLeft(reservations, a.id);
      return byStart(a, b);
    });
  }, [events, query, category, sortBy, onlyAvailable, reservations]);

  const firstName = (userName || '').split(' ')[0];

  return (
    <section className="page catalog" aria-labelledby="catalog-heading">
      <Reveal className="catalog-hero">
        <p className="eyebrow">{firstName ? `Hi, ${firstName}` : 'Welcome'}</p>
        <h1 id="catalog-heading">Campus events</h1>
        <p className="muted">Choose a show, pick your seats, and get your pass.</p>
      </Reveal>

      {nextBooking && (
        <Reveal className="next-banner next-banner-v2">
          <div>
            <p className="eyebrow">Next up</p>
            <h2>{nextBooking.eventTitle}</h2>
            <p className="muted small">
              <span className="countdown">{countdownLabel(daysUntil(nextBooking.eventDate))}</span>
              {nextBooking.time ? ` at ${formatClockTime(nextBooking.time)}` : ''}
              {' · '}Seats {nextBooking.seats.join(', ')} · Pass{' '}
              <span className="pass-code">{nextBooking.code}</span>
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={onOpenPasses}>
            View pass
          </button>
        </Reveal>
      )}

      <Reveal className="catalog-tools">
        <label className="search-box">
          <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by title"
            aria-label="Search by title"
          />
        </label>

        <div className="chip-row" role="group" aria-label="Filter by category">
          {['all', ...CATEGORIES].map((c) => (
            <button
              key={c}
              type="button"
              className={`chip ${category === c ? 'is-on' : ''}`}
              aria-pressed={category === c}
              onClick={() => onCategoryChange(c)}
            >
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>

        <div className="sort-bar">
          <label>
            Sort by{' '}
            <select value={sortBy} onChange={(e) => onSortChange(e.target.value)}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={onlyAvailable}
              onChange={(e) => onOnlyAvailableChange(e.target.checked)}
            />
            Seats available only
          </label>
        </div>
      </Reveal>

      {visible.length === 0 && (
        <p className="empty-note">Nothing matches that search. Try another title or category.</p>
      )}

      <div className="event-grid">
        {visible.map((event, i) => {
          const entry = myWaitlist.find((w) => w.eventId === event.id);
          return (
            <Reveal key={event.id} delay={Math.min(i, 6) * 90}>
              <EventTicket
                event={event}
                allEvents={events}
                left={seatsLeft(reservations, event.id)}
                waiting={Boolean(entry)}
                notified={Boolean(entry?.notifiedAt)}
                onSelect={onSelect}
                onWaitlist={onWaitlist}
              />
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

function EventTicket({ event, allEvents, left, waiting, notified, onSelect, onWaitlist }) {
  const soldOut = left <= 0;
  const pct = Math.round(((SEATS_PER_EVENT - left) / SEATS_PER_EVENT) * 100);
  const others = allEvents
    .filter((e) => e.title === event.title && e.id !== event.id)
    .sort(byStart);

  return (
    <TiltCard as="article" className="ticket event-ticket">
      <TicketStub iso={event.date} />
      <div className="ticket-body">
        <span className="tag">{event.category}</span>
        <h3>{event.title}</h3>
        <p className="ticket-venue">
          {event.venue}
          {event.time ? `, ${formatClockTime(event.time)}` : ''}
        </p>

        {others.length > 0 && (
          <p className="other-sessions">
            Also on{' '}
            {others
              .map((o) => `${formatDate(o.date)}${o.time ? ` at ${formatClockTime(o.time)}` : ''}`)
              .join('; ')}
          </p>
        )}

        <div className="seat-meter" role="img" aria-label={`${Math.round(((SEATS_PER_EVENT - left) / SEATS_PER_EVENT) * 100)}% of seats taken`}>
          <span className={pct >= 75 ? 'hot' : ''} style={{ width: `${pct}%` }} />
        </div>

        {notified && !soldOut && <p className="notice-line">A seat opened. Select yours now.</p>}

        <div className="ticket-footer">
          <div>
            <span className="price">{formatMoney(event.price)}</span>
            <span className={`seats-left ${soldOut ? 'sold-out' : ''}`}>
              {soldOut ? 'Sold out' : `${left} of ${SEATS_PER_EVENT} seats left`}
            </span>
          </div>
          {soldOut ? (
            waiting ? (
              <button type="button" className="btn-secondary" onClick={() => onWaitlist(event, false)}>
                Leave waitlist
              </button>
            ) : (
              <button type="button" className="btn-primary" onClick={() => onWaitlist(event, true)}>
                Join waitlist
              </button>
            )
          ) : (
            <button type="button" className="btn-primary" onClick={() => onSelect(event.id)}>
              Select seats
            </button>
          )}
        </div>

        {soldOut && waiting && (
          <p className="muted small">You're on the waitlist. We'll email you if a seat opens.</p>
        )}
      </div>
    </TiltCard>
  );
}
