import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api.js';
import { CATEGORIES, SEATS_PER_EVENT } from '../config.js';
import { formatClockTime, formatDate, formatTime } from '../lib/format.js';
import CountUp from './CountUp.jsx';

function Stat({ label, value }) {
  return (
    <div className="stat">
      <strong>
        <CountUp value={value} />
      </strong>
      <span>{label}</span>
    </div>
  );
}

const EMPTY_FORM = {
  title: '',
  category: CATEGORIES[0],
  date: '',
  time: '',
  venue: '',
  price: '',
  description: '',
  published: true,
};

function CheckResult({ result }) {
  return (
    <div className={`check-result ${result.ok ? 'ok' : 'bad'}`} role="status">
      <strong>{result.message}</strong>
      {result.booking && (
        <span className="muted small">
          {result.booking.name || result.booking.email}, seats {result.booking.seats.join(', ')},{' '}
          {result.booking.eventTitle}
        </span>
      )}
    </div>
  );
}

export default function AdminView({ token, onBack, onError, showToast }) {
  const [data, setData] = useState(null);
  const [code, setCode] = useState('');
  const [checkResult, setCheckResult] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api('/admin/overview', { token }));
    } catch (err) {
      onError(err, "Couldn't load the staff tools.");
    }
  }, [token, onError]);

  useEffect(() => {
    load();
  }, [load]);

  async function checkIn(e) {
    e.preventDefault();
    setCheckResult(null);
    try {
      const booking = await api('/admin/checkin', { method: 'POST', token, body: { code } });
      setCheckResult({ ok: true, booking, message: 'Checked in. Let them through.' });
      setCode('');
      load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setCheckResult({ ok: false, booking: err.data.booking, message: err.message });
      } else if (err instanceof ApiError && err.status !== 401) {
        setCheckResult({ ok: false, message: err.message });
      } else {
        onError(err, "Can't reach the server.");
      }
    }
  }

  function startEdit(event) {
    setEditingId(event.id);
    setForm({
      title: event.title,
      category: event.category,
      date: event.date,
      time: event.time || '',
      venue: event.venue,
      price: String(event.price),
      description: event.description || '',
      published: event.published,
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function saveEvent(e) {
    e.preventDefault();
    setSaving(true);
    const body = { ...form, price: Number(form.price) };
    try {
      if (editingId) {
        await api(`/admin/events/${editingId}`, { method: 'PATCH', token, body });
      } else {
        await api('/admin/events', { method: 'POST', token, body });
      }
      showToast(editingId ? 'Event updated.' : 'Event created.', 'success');
      resetForm();
      load();
    } catch (err) {
      onError(err, "Couldn't save the event. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublished(event) {
    try {
      await api(`/admin/events/${event.id}`, {
        method: 'PATCH',
        token,
        body: { published: !event.published },
      });
      showToast(event.published ? 'Event hidden from students.' : 'Event is open for booking.', 'success');
      load();
    } catch (err) {
      onError(err, "Couldn't change the event. Please try again.");
    }
  }

  if (!data) return <p className="loading-note">Loading staff tools…</p>;

  const checkedIn = data.bookings.filter((b) => b.checkedInAt).length;

  return (
    <section className="page" aria-labelledby="admin-heading">
      <button type="button" className="btn-quiet" onClick={onBack}>
        Back to events
      </button>
      <header className="page-intro">
        <h2 id="admin-heading">Staff tools</h2>
        <p>Check passes at the door, manage events, and see who has booked.</p>
      </header>

      <div className="stat-grid">
        <Stat label="Bookings" value={data.bookings.length} />
        <Stat label="Paid" value={data.bookings.filter((b) => b.status === 'paid').length} />
        <Stat label="Checked in" value={checkedIn} />
        <Stat label="Open events" value={data.events.filter((e) => e.published).length} />
      </div>

      <div className="admin-grid">
        <div className="admin-card">
          <h3>Check in a pass</h3>
          <form className="admin-row" onSubmit={checkIn}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="CE-XXXXX"
              aria-label="Pass code"
              maxLength={12}
              autoComplete="off"
              autoCapitalize="characters"
              className="admin-input"
            />
            <button type="submit" className="btn-primary" disabled={!code.trim()}>
              Check in
            </button>
          </form>
          {checkResult && <CheckResult result={checkResult} />}
          <p className="muted small">
            {checkedIn} of {data.bookings.length} passes checked in.
          </p>
        </div>

        <div className="admin-card">
          <h3>{editingId ? 'Edit event' : 'New event'}</h3>
          <form className="admin-form" onSubmit={saveEvent}>
            <label>
              <span>Title</span>
              <input
                required
                minLength={3}
                maxLength={120}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <div className="admin-two">
              <label>
                <span>Category</span>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Date</span>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </label>
            </div>
            <label>
              <span>Start time (optional)</span>
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </label>
            <label>
              <span>Venue</span>
              <input
                required
                minLength={2}
                maxLength={80}
                value={form.venue}
                onChange={(e) => setForm({ ...form, venue: e.target.value })}
              />
            </label>
            <div className="admin-two">
              <label>
                <span>Price (USD)</span>
                <input
                  type="number"
                  required
                  min="0"
                  max="500"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </label>
              <label className="admin-check">
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={(e) => setForm({ ...form, published: e.target.checked })}
                />
                <span>Open for booking</span>
              </label>
            </div>
            <label>
              <span>Description</span>
              <textarea
                rows={3}
                maxLength={400}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            <div className="admin-row">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create event'}
              </button>
              {editingId && (
                <button type="button" className="btn-secondary" onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      <AccessibilityForm token={token} onError={onError} showToast={showToast} />

      <div className="admin-card admin-wide">
        <h3>Events</h3>
        <ul className="admin-list">
          {data.events.map((event) => {
            const seatsLeft = SEATS_PER_EVENT - (data.reservations[event.id] || []).length;
            return (
              <li key={event.id}>
                <div>
                  <strong>{event.title}</strong>
                  <span className="muted small">
                    {formatDate(event.date)}
                    {event.time ? ` at ${formatClockTime(event.time)}` : ''}, {event.venue}, {seatsLeft} of{' '}
                    {SEATS_PER_EVENT} seats left
                  </span>
                </div>
                <div className="admin-actions">
                  <span className={`status-pill ${event.published ? 'on' : 'off'}`}>
                    {event.published ? 'Open' : 'Hidden'}
                  </span>
                  <button type="button" className="btn-quiet" onClick={() => startEdit(event)}>
                    Edit
                  </button>
                  <button type="button" className="btn-quiet" onClick={() => togglePublished(event)}>
                    {event.published ? 'Hide' : 'Open'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="admin-card admin-wide">
        <h3>Sent emails</h3>
        {data.outbox.length === 0 ? (
          <p className="muted">No emails yet.</p>
        ) : (
          <ul className="admin-list">
            {data.outbox.map((m) => (
              <li key={m.id}>
                <div>
                  <strong>{m.subject}</strong>
                  <span className="muted small">
                    To {m.to}, {formatTime(m.sentAt)}
                  </span>
                  <span className="outbox-body">{m.body}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="admin-card admin-wide">
        <h3>Bookings</h3>
        {data.bookings.length === 0 ? (
          <p className="muted">No bookings yet.</p>
        ) : (
          <ul className="admin-list">
            {data.bookings.map((b) => (
              <li key={b.id}>
                <div>
                  <strong>
                    {b.code} · {b.name || b.email}
                  </strong>
                  <span className="muted small">
                    {b.eventTitle}, seats {b.seats.join(', ')}, {b.email}
                  </span>
                </div>
                <span className={`status-pill ${b.checkedInAt ? 'on' : b.status === 'paid' ? '' : 'off'}`}>
                  {b.checkedInAt
                    ? `In at ${formatTime(b.checkedInAt)}`
                    : b.status === 'paid'
                      ? 'Paid, not checked in'
                      : 'Awaiting payment'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// Staff approve students for wheelchair spaces, after the accessibility office has confirmed them.
function AccessibilityForm({ token, onError, showToast }) {
  const [email, setEmail] = useState('');
  const [approved, setApproved] = useState(true);
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/admin/accessibility', {
        method: 'POST',
        token,
        body: { email: email.trim(), verified: approved },
      });
      showToast(approved ? 'Accessible seating approved.' : 'Accessible seating removed.', 'success');
      setEmail('');
    } catch (err) {
      onError(err, "Couldn't update that account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-card admin-wide">
      <h3>Accessible seating</h3>
      <p className="muted small">
        Wheelchair spaces can only be booked by students approved here. Confirm the student with the
        accessibility office first.
      </p>
      <form className="admin-row" onSubmit={save}>
        <input
          className="admin-input"
          type="email"
          placeholder="student@campus.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          aria-label="Student email"
        />
        <label className="admin-check">
          <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
          <span>Approved</span>
        </label>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  );
}
