import { useCallback, useEffect, useRef, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import Toast from './components/Toast.jsx';
import SignInView from './components/SignInView.jsx';
import CatalogView from './components/CatalogView.jsx';
import SeatView from './components/SeatView.jsx';
import HistoryView from './components/HistoryView.jsx';
import AdminView from './components/AdminView.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import PaymentDialog from './components/PaymentDialog.jsx';
import { api, ApiError } from './api.js';
import { MAX_SEATS_PER_BOOKING, REFUND_WINDOW_HOURS, SEATS_PER_EVENT, STORAGE_KEYS } from './config.js';
import { loadJSON, saveJSON } from './lib/storage.js';
import { reservedFor } from './lib/reservations.js';
import { downloadICS } from './lib/passes.js';
import { pickBestSeats } from './lib/seats.js';
import { formatDate, formatMoney } from './lib/format.js';
import { eventHash, nextUpcoming, parseEventHash } from './lib/schedule.js';
import { useToast } from './hooks/useToast.js';

const POLL_MS = 4000;
const findById = (list, id) => list.find((e) => e.id === Number(id)) ?? null;

export default function App() {
  const [theme, setTheme] = useState(() => {
    const saved = loadJSON(STORAGE_KEYS.theme, null);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Session and server data
  const [token, setToken] = useState(() => loadJSON(STORAGE_KEYS.token, null));
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [reservations, setReservations] = useState({}); // seats taken by others, per event
  const [myHolds, setMyHolds] = useState([]); // this person's seat holds, from the server
  const [bookings, setBookings] = useState([]);
  const [myWaitlist, setMyWaitlist] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // Screen state
  const [view, setView] = useState('catalog'); // 'catalog' | 'seats' | 'history' | 'admin'
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [activeEventId, setActiveEventId] = useState(null);
  const [holdBusy, setHoldBusy] = useState(false);
  const [pendingCancelId, setPendingCancelId] = useState(null);
  const [payingBooking, setPayingBooking] = useState(null);
  const { toast, showToast } = useToast();

  const initialHashId = useRef(parseEventHash(window.location.hash));
  const deepLinkDone = useRef(false);
  const offline = useRef(false);

  const activeEvent = findById(events, activeEventId);
  const activeHold = myHolds.find((h) => h.eventId === activeEventId) ?? null;
  const selectedSeats = activeHold ? activeHold.seats : [];
  const holdExpiresAt = activeHold ? Date.parse(activeHold.expiresAt) : null;
  const pendingBooking = bookings.find((b) => b.id === pendingCancelId) ?? null;
  const activeBookings = bookings.filter((b) => b.status !== 'cancelled');
  const upcoming = nextUpcoming(activeBookings);

  const clearSession = useCallback(
    (message) => {
      setToken(null);
      setUser(null);
      setEvents([]);
      setReservations({});
      setMyHolds([]);
      setBookings([]);
      setMyWaitlist([]);
      setLoaded(false);
      setActiveEventId(null);
      setPendingCancelId(null);
      setPayingBooking(null);
      setView('catalog');
      if (message) showToast(message, 'error');
    },
    [showToast]
  );

  const handleApiError = useCallback(
    (err, fallback) => {
      if (err instanceof ApiError && err.status === 401) {
        clearSession('Your session has ended. Please sign in again.');
        return;
      }
      showToast(err instanceof ApiError ? err.message : fallback, 'error');
    },
    [clearSession, showToast]
  );

  // Pull events, seat availability, holds and this user's bookings from the server.
  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api('/state', { token });
      offline.current = false;
      setUser(data.user);
      setEvents(data.events);
      setReservations(data.reservations);
      setMyHolds(data.myHolds);
      setBookings(data.bookings);
      setMyWaitlist(data.myWaitlist);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearSession('Your session has ended. Please sign in again.');
      } else if (!(err instanceof ApiError) && !offline.current) {
        offline.current = true;
        showToast("Can't reach the server. Trying again…", 'error');
      }
    } finally {
      setLoaded(true);
    }
  }, [token, clearSession, showToast]);

  // Holds expire on the server; this just refreshes the screen and says so.
  const handleHoldExpired = useCallback(() => {
    refresh();
    showToast('Your seat hold expired. Please select your seats again.', 'error');
  }, [refresh, showToast]);

  const handlePaymentExpired = useCallback(() => {
    setPayingBooking(null);
    refresh();
    showToast('The payment window closed and your seats were released.', 'error');
  }, [refresh, showToast]);

  useEffect(() => {
    saveJSON(STORAGE_KEYS.token, token);
  }, [token]);

  // Load on sign-in, then poll so seat availability stays current.
  useEffect(() => {
    if (!token) return undefined;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [token, refresh]);

  // Keep the chosen theme on the page and remember it.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveJSON(STORAGE_KEYS.theme, theme);
  }, [theme]);

  // A shared link like #event-2 opens that event once the events have loaded.
  useEffect(() => {
    if (deepLinkDone.current || initialHashId.current === null || events.length === 0) return;
    deepLinkDone.current = true;
    if (findById(events, initialHashId.current)) {
      setActiveEventId(initialHashId.current);
      setView('seats');
    }
  }, [events]);

  // Browser back and forward move between the catalogue and event pages.
  useEffect(() => {
    function onPopState() {
      const id = parseEventHash(window.location.hash);
      if (id !== null && findById(events, id)) {
        setActiveEventId(id);
        setView('seats');
      } else {
        setView((current) => (current === 'seats' ? 'catalog' : current));
      }
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [events]);

  // ---- Accounts ----

  // The sign-in form calls this and waits for the server's reply.
  function requestSignIn({ name, email, password, mode }) {
    return api('/sign-in', { method: 'POST', body: { name, email, password, mode } });
  }

  // Called after the form's success animation finishes.
  function completeSignIn(data) {
    setToken(data.token);
    setUser(data.user);
    showToast(`Welcome, ${data.user.name}.`, 'success');
  }

  async function signOut() {
    try {
      await api('/sign-out', { method: 'POST', token });
    } catch {
      // Signing out locally even if the server can't be reached.
    }
    clearSession();
    showToast('You have signed out.', 'info');
  }

  // ---- Seat holds ----

  // Saves the selection on the server. Seats are disabled while this runs, so requests don't overlap.
  async function updateHold(eventId, seats) {
    setHoldBusy(true);
    try {
      if (seats.length === 0) {
        await api(`/holds/${eventId}`, { method: 'DELETE', token });
      } else {
        await api('/holds', { method: 'POST', token, body: { eventId, seats } });
      }
      await refresh();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await refresh();
        showToast(err.message, 'error');
        return false;
      }
      handleApiError(err, "Can't reach the server. Please try again.");
      return false;
    } finally {
      setHoldBusy(false);
    }
  }

  // Leaving the seat map releases the hold, so other students can pick those seats.
  function releaseActiveHold() {
    if (activeEventId === null || !myHolds.some((h) => h.eventId === activeEventId)) return;
    api(`/holds/${activeEventId}`, { method: 'DELETE', token })
      .then(refresh)
      .catch(() => {});
  }

  const openEvent = (eventId) => {
    if (activeEventId !== null && activeEventId !== eventId) releaseActiveHold();
    setActiveEventId(eventId);
    setView('seats');
    window.history.pushState(null, '', eventHash(eventId));
    window.scrollTo(0, 0);
  };

  const clearEventHash = () => {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  };

  const goCatalog = () => {
    releaseActiveHold();
    setView('catalog');
    clearEventHash();
    window.scrollTo(0, 0);
  };

  const openHistory = () => {
    releaseActiveHold();
    setView('history');
    clearEventHash();
    window.scrollTo(0, 0);
  };

  const openStaff = () => {
    releaseActiveHold();
    setView('admin');
    clearEventHash();
    window.scrollTo(0, 0);
  };

  const toggleSeat = (seatId) => {
    if (!activeEvent || holdBusy) return;
    const isSelected = selectedSeats.includes(seatId);
    if (!isSelected && selectedSeats.length >= MAX_SEATS_PER_BOOKING) {
      showToast(`You can reserve up to ${MAX_SEATS_PER_BOOKING} seats per booking.`, 'error');
      return;
    }
    const next = isSelected ? selectedSeats.filter((s) => s !== seatId) : [...selectedSeats, seatId];
    updateHold(activeEvent.id, next);
  };

  const autoPick = async (count) => {
    if (!activeEvent || holdBusy) return;
    const result = pickBestSeats(reservedFor(reservations, activeEvent.id), count);
    if (!result) {
      const left = SEATS_PER_EVENT - reservedFor(reservations, activeEvent.id).length;
      showToast(`Only ${left} seat${left === 1 ? '' : 's'} left, so we can't find ${count}.`, 'error');
      return;
    }
    const saved = await updateHold(activeEvent.id, result.seats);
    if (saved && !result.together) {
      showToast("Those seats aren't side by side, but they're the best available.", 'info');
    }
  };

  const shareEvent = async (event) => {
    const url = `${window.location.origin}${window.location.pathname}${eventHash(event.id)}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: event.title,
          text: `${event.title}, ${formatDate(event.date)} at ${event.venue}`,
          url,
        });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied to your clipboard.', 'success');
    } catch {
      showToast(`Copy this link to share it: ${url}`, 'info');
    }
  };

  // ---- Bookings and payment ----

  // Turns the hold into a booking that waits for payment, then opens the payment dialog.
  async function reserveSeats() {
    if (!activeEvent || selectedSeats.length === 0 || holdBusy) return;
    setHoldBusy(true);
    try {
      const booking = await api('/bookings', { method: 'POST', token, body: { eventId: activeEvent.id } });
      setView('catalog');
      clearEventHash();
      await refresh();
      setPayingBooking(booking);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
        await refresh();
        showToast(err.message, 'error');
      } else {
        handleApiError(err, "Can't reach the server. Your seats were not reserved.");
      }
    } finally {
      setHoldBusy(false);
    }
  }

  function paymentDone(paid) {
    setPayingBooking(null);
    refresh();
    showToast(`Payment received. Your pass code is ${paid.code}.`, 'success');
  }

  async function confirmCancel() {
    const booking = pendingBooking;
    setPendingCancelId(null);
    if (!booking) return;
    try {
      const result = await api(`/bookings/${booking.id}`, { method: 'DELETE', token });
      await refresh();
      if (result.refund?.status === 'refunded') {
        showToast(
          `Booking cancelled. Refund of ${formatMoney(result.refund.amount)} issued (${result.refund.reference}).`,
          'success'
        );
      } else if (result.refund?.status === 'not_eligible') {
        showToast(
          `Booking cancelled. Cancellations less than ${REFUND_WINDOW_HOURS} hours before the event are not refundable.`,
          'info'
        );
      } else {
        showToast('Booking cancelled.', 'success');
      }
    } catch (err) {
      handleApiError(err, 'Could not cancel that booking. Please try again.');
    }
  }

  async function toggleWaitlist(event, join) {
    try {
      if (join) {
        await api(`/events/${event.id}/waitlist`, { method: 'POST', token });
        showToast("You're on the waitlist. We'll email you if a seat opens.", 'success');
      } else {
        await api(`/events/${event.id}/waitlist`, { method: 'DELETE', token });
        showToast('Removed from the waitlist.', 'info');
      }
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await refresh();
        showToast(err.message, 'info');
      } else {
        handleApiError(err, "Couldn't update the waitlist. Please try again.");
      }
    }
  }

  // ---- Render ----

  const themeToggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  if (!token) {
    return (
      <>
        <Navbar user={null} bookingCount={0} theme={theme} onToggleTheme={themeToggle} />
        <main className="container">
          <Toast {...toast} />
          <SignInView onSubmit={requestSignIn} onComplete={completeSignIn} />
        </main>
      </>
    );
  }

  return (
    <>
      <div className="app-bg" aria-hidden="true">
        <span className="orb orb-1" />
        <span className="orb orb-2" />
        <span className="orb orb-3" />
        <span className="app-school" />
      </div>

      <Navbar
        user={user}
        bookingCount={activeBookings.length}
        theme={theme}
        onToggleTheme={themeToggle}
        onOpenBookings={openHistory}
        onOpenStaff={openStaff}
        onSignOut={signOut}
      />
      <main className="container">
        <Toast {...toast} />

        {!loaded && <p className="loading-note">Loading campus events…</p>}

        {loaded && view === 'catalog' && (
          <CatalogView
            events={events}
            userName={user?.name}
            myWaitlist={myWaitlist}
            onWaitlist={toggleWaitlist}
            nextBooking={upcoming}
            onOpenPasses={openHistory}
            query={query}
            category={category}
            sortBy={sortBy}
            onlyAvailable={onlyAvailable}
            reservations={reservations}
            onQueryChange={setQuery}
            onCategoryChange={setCategory}
            onSortChange={setSortBy}
            onOnlyAvailableChange={setOnlyAvailable}
            onSelect={openEvent}
          />
        )}

        {loaded && view === 'seats' && activeEvent && (
          <SeatView
            event={activeEvent}
            reserved={reservedFor(reservations, activeEvent.id)}
            selected={selectedSeats}
            holdExpiresAt={holdExpiresAt}
            busy={holdBusy}
            accessible={user?.accessible}
            onToggle={toggleSeat}
            onAutoPick={autoPick}
            onShare={shareEvent}
            onBack={goCatalog}
            onReserve={reserveSeats}
            onExpire={handleHoldExpired}
          />
        )}

        {loaded && view === 'admin' && user?.role === 'admin' && (
          <AdminView token={token} onBack={goCatalog} onError={handleApiError} showToast={showToast} />
        )}

        {loaded && view === 'history' && (
          <HistoryView
            bookings={activeBookings}
            onCancel={(id) => setPendingCancelId(id)}
            onPay={(booking) => setPayingBooking(booking)}
            onAddToCalendar={downloadICS}
            onBrowse={goCatalog}
          />
        )}
      </main>

      <PaymentDialog
        booking={payingBooking}
        token={token}
        onPaid={paymentDone}
        onClose={() => setPayingBooking(null)}
        onExpire={handlePaymentExpired}
        onError={(err, fallback) => {
          if (err instanceof ApiError && err.status === 404) {
            setPayingBooking(null);
            refresh();
          }
          handleApiError(err, fallback);
        }}
      />

      <ConfirmDialog
        open={pendingBooking !== null}
        title="Cancel this booking?"
        message={
          pendingBooking
            ? `${pendingBooking.seats.length} seat(s) for "${pendingBooking.eventTitle}" will be released for other students.${
                pendingBooking.status === 'paid'
                  ? ` Refund policy: a full refund of ${formatMoney(pendingBooking.totalPaid)} if you cancel ${REFUND_WINDOW_HOURS} hours or more before the event. Cancelling later is not refundable.`
                  : ''
              }`
            : ''
        }
        confirmLabel={pendingBooking?.status === 'paid' ? 'Cancel and refund' : 'Cancel booking'}
        cancelLabel="Keep booking"
        onConfirm={confirmCancel}
        onCancel={() => setPendingCancelId(null)}
      />
    </>
  );
}
