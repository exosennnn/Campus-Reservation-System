import { useState } from 'react';
import { focusSignIn } from '../lib/landing.js';
import Reveal from './Reveal.jsx';

// A demo seat map. Nothing here is saved or reserved: it only shows how booking feels.
const DEMO_TAKEN = new Set([3, 4, 9, 14, 15, 18, 22]);
const PRICE = 15;
const LIMIT = 6;
const SEATS = Array.from({ length: 24 }, (_, i) => i + 1);

export default function SeatPreview() {
  const [picked, setPicked] = useState([]);
  const [note, setNote] = useState('');

  function toggle(seat) {
    if (DEMO_TAKEN.has(seat)) return;
    if (picked.includes(seat)) {
      setPicked(picked.filter((s) => s !== seat));
      setNote('');
      return;
    }
    if (picked.length >= LIMIT) {
      setNote(`Six seats is the limit per person.`);
      return;
    }
    setPicked([...picked, seat]);
    setNote('');
  }

  const total = picked.length * PRICE;
  const sorted = [...picked].sort((a, b) => a - b);

  return (
    <section className="preview" aria-labelledby="preview-heading">
      <Reveal className="preview-inner">
        <div className="preview-copy">
          <p className="eyebrow">Try it</p>
          <h2 id="preview-heading">Pick seats, see the price</h2>
          <p className="muted">
            This map is a demo. Tap a few seats and watch the total change. Real seats update live once
            you sign in.
          </p>

          <ul className="preview-picks" aria-live="polite">
            {sorted.length === 0 ? (
              <li className="muted small">No seats picked yet.</li>
            ) : (
              sorted.map((s) => (
                <li key={s} className="pick-chip">
                  Seat {s}
                </li>
              ))
            )}
          </ul>

          <div className="preview-total">
            <span>Total for {picked.length} {picked.length === 1 ? 'seat' : 'seats'}</span>
            <strong key={total} className="bump">
              ${total}.00
            </strong>
          </div>

          {note && (
            <p className="form-alert" role="status">
              {note}
            </p>
          )}
        </div>

        <div className="preview-map">
          <div className="stage" aria-hidden="true">
            <span>Stage</span>
          </div>
          <div className="seat-grid" role="group" aria-label="Demo seat map">
            {SEATS.map((seat) => {
              const taken = DEMO_TAKEN.has(seat);
              const on = picked.includes(seat);
              const status = taken ? 'taken' : on ? 'selected' : 'free';
              return (
                <button
                  key={seat}
                  type="button"
                  className={`seat ${taken ? 'reserved' : on ? 'selected' : 'available'}`}
                  aria-pressed={on}
                  disabled={taken}
                  aria-label={`Demo seat ${seat}, ${status}`}
                  onClick={() => toggle(seat)}
                >
                  {seat}
                </button>
              );
            })}
          </div>
          <ul className="seat-legend" aria-label="Seat key">
            <li>
              <i className="legend-swatch available" /> Free
            </li>
            <li>
              <i className="legend-swatch selected" /> Selected
            </li>
            <li>
              <i className="legend-swatch reserved" /> Taken
            </li>
          </ul>
          <button type="button" className="btn-primary preview-cta" onClick={focusSignIn}>
            Sign in to book these seats
          </button>
        </div>
      </Reveal>
    </section>
  );
}
