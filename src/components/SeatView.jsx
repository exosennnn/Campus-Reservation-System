import { useEffect, useRef, useState } from 'react';
import { HOLD_SECONDS, MAX_SEATS_PER_BOOKING } from '../config.js';
import { formatClock, formatDate, formatMoney } from '../lib/format.js';
import { useHoldCountdown } from '../hooks/useHoldCountdown.js';
import HoldRing from './HoldRing.jsx';
import SeatMap from './SeatMap.jsx';
import CheckoutBar from './CheckoutBar.jsx';

export default function SeatView({
  event,
  reserved,
  selected,
  holdExpiresAt,
  busy = false,
  accessible = false,
  onToggle,
  onAutoPick,
  onShare,
  onBack,
  onReserve,
  onExpire,
}) {
  const [pickCount, setPickCount] = useState(2);
  const secondsLeft = useHoldCountdown(holdExpiresAt, onExpire);
  const holding = selected.length > 0 && holdExpiresAt !== null;
  const counts = Array.from({ length: MAX_SEATS_PER_BOOKING }, (_, i) => i + 1);

  const headingRef = useRef(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [event.id]);

  return (
    <section className="page" aria-labelledby="active-event-title">
      <button type="button" className="btn-quiet" onClick={onBack}>
        Back to events
      </button>

      <header className="seat-header">
        <h2 id="active-event-title" ref={headingRef} tabIndex={-1}>{event.title}</h2>
        <p className="muted">
          {formatDate(event.date)} at {event.venue}. {formatMoney(event.price)} per seat.
        </p>
        <p className="event-description">{event.description}</p>
        <div className="share-row">
          <button type="button" className="btn-secondary" onClick={() => onShare(event)}>
            Share event
          </button>
        </div>
      </header>

      {holding && (
        <div className="hold-card" role="status">
          <HoldRing secondsLeft={secondsLeft} total={HOLD_SECONDS} label={formatClock(secondsLeft)} />
          <div>
            <strong>Seats held</strong>
            <span className="muted small">Complete your booking before the timer ends, or the seats are released.</span>
          </div>
        </div>
      )}

      <div className="pick-row">
        <span className="muted small">Want seats together?</span>
        <select
          value={pickCount}
          onChange={(e) => setPickCount(Number(e.target.value))}
          aria-label="Number of seats to find"
        >
          {counts.map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? 'seat' : 'seats'}
            </option>
          ))}
        </select>
        <button type="button" className="btn-secondary" onClick={() => onAutoPick(pickCount)}>
          Pick for me
        </button>
      </div>

      <div className="stage" aria-hidden="true">
        <span>Stage</span>
      </div>

      <SeatMap reserved={reserved} selected={selected} busy={busy} accessible={accessible} onToggle={onToggle} />

      <ul className="seat-legend" aria-label="Seat key">
        <li>
          <i className="legend-swatch available" /> Available
        </li>
        <li>
          <i className="legend-swatch selected" /> Selected
        </li>
        <li>
          <i className="legend-swatch reserved" /> Reserved
        </li>
        <li>
          <i className="legend-swatch access-wheel" /> Wheelchair space
        </li>
        <li>
          <i className="legend-swatch near-entrance" /> Near entrance
        </li>
      </ul>
      <p className="muted small center">
        Up to {MAX_SEATS_PER_BOOKING} seats per booking. Selected seats are held for 5 minutes.
      </p>

      <CheckoutBar
        count={selected.length}
        total={selected.length * event.price}
        onReserve={onReserve}
      />
    </section>
  );
}
