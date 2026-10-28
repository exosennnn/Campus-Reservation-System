import { formatMoney, pluralSeats } from '../lib/format.js';

export default function CheckoutBar({ count, total, onReserve }) {
  return (
    <div className="checkout-bar">
      <div className="checkout-total" aria-live="polite">
        <span className="muted small">
          {count === 0 ? 'Total' : `Total for ${pluralSeats(count)}`}
        </span>
        <strong>{formatMoney(total)}</strong>
      </div>
      <button
        type="button"
        className="btn-primary"
        disabled={count === 0}
        onClick={onReserve}
      >
        Reserve selected seats
      </button>
    </div>
  );
}
