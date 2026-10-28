import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { PAYMENT_METHODS } from '../config.js';
import { useHoldCountdown } from '../hooks/useHoldCountdown.js';
import { formatClock, formatMoney } from '../lib/format.js';

// Pay for a booking before its seats are released. Uses the sandbox provider on the server.
export default function PaymentDialog({ booking, token, onPaid, onClose, onExpire, onError }) {
  const ref = useRef(null);
  const [method, setMethod] = useState(PAYMENT_METHODS[0].id);
  const [busy, setBusy] = useState(false);

  const dueMs = booking ? Date.parse(booking.paymentDueAt) : null;
  const secondsLeft = useHoldCountdown(dueMs, onExpire);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (booking && !dialog.open) dialog.showModal();
    if (!booking && dialog.open) dialog.close();
  }, [booking]);

  async function pay() {
    setBusy(true);
    try {
      const paid = await api(`/bookings/${booking.id}/pay`, {
        method: 'POST',
        token,
        body: { method },
      });
      onPaid(paid);
    } catch (err) {
      onError(err, "Payment didn't go through. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="confirm-dialog payment-dialog"
      aria-labelledby="pay-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onClose();
      }}
    >
      {booking && (
        <>
          <p className="eyebrow">Payment</p>
          <h3 id="pay-title">{booking.eventTitle}</h3>
          <p className="muted small">
            Seats {booking.seats.join(', ')}. Held for <strong>{formatClock(secondsLeft)}</strong>.
          </p>

          <div className="pay-total">
            <span>Total</span>
            <strong>{formatMoney(booking.totalPaid)}</strong>
          </div>

          <fieldset className="pay-methods">
            <legend>Payment method</legend>
            {PAYMENT_METHODS.map((m) => (
              <label key={m.id} className="pay-option">
                <input
                  type="radio"
                  name="pay-method"
                  value={m.id}
                  checked={method === m.id}
                  onChange={() => setMethod(m.id)}
                />
                <span>{m.label}</span>
              </label>
            ))}
          </fieldset>

          <p className="sandbox-note">Sandbox payment. No real money is charged.</p>

          <div className="confirm-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
              Pay later
            </button>
            <button type="button" className="btn-primary" onClick={pay} disabled={busy}>
              {busy ? 'Paying…' : `Pay ${formatMoney(booking.totalPaid)}`}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
