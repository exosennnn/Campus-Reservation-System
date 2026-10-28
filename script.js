// ===== Configuration =====
const SEATS_PER_EVENT = 24;
const MAX_SEATS_PER_BOOKING = 6;
const HOLD_SECONDS = 300;
const STORAGE_KEYS = { reserved: 'reservedSeats', bookings: 'userBookings' };

// ===== Mock data =====
// Dates are ISO (YYYY-MM-DD) so they sort and parse reliably.
const events = [
  { id: 1, title: 'Tech Innovators Summit 2026', category: 'Tech', date: '2026-11-14', venue: 'Main Auditorium', price: 15 },
  { id: 2, title: 'Annual Campus Drama Play', category: 'Arts', date: '2026-11-20', venue: 'Black Box Theater', price: 10 },
  { id: 3, title: 'Inter-College Basketball Finals', category: 'Sports', date: '2026-11-25', venue: 'Gymnasium', price: 8 }
];

function defaultReservations() {
  return { 1: [1, 2, 3], 2: [10, 11], 3: [] };
}

// ===== Storage helpers (never throw on bad data) =====
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn(`Could not read "${key}" from storage; using defaults.`, err);
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error(`Could not save "${key}"`, err);
    return false;
  }
}

function loadReservations() {
  const data = loadJSON(STORAGE_KEYS.reserved, null);
  return data && typeof data === 'object' ? data : defaultReservations();
}

// Older saves lacked eventId / eventDate; fill them in so cancellation works.
function normalizeBookings(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(b => {
    const event = events.find(e => e.id === b.eventId) || events.find(e => e.title === b.eventTitle);
    return {
      ...b,
      eventId: event ? event.id : b.eventId,
      eventDate: b.eventDate || (event ? event.date : null),
      seats: Array.isArray(b.seats) ? b.seats : []
    };
  });
}

// ===== Application state =====
const state = {
  activeEventId: null,
  selectedSeatIds: [],
  reservedSeatsPerEvent: loadReservations(),
  userBookings: normalizeBookings(loadJSON(STORAGE_KEYS.bookings, [])),
  holdTimerInterval: null,
  holdSecondsRemaining: HOLD_SECONDS
};

let currentView = 'catalog';

// ===== Formatting & utilities =====
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatDate(iso) {
  if (!iso) return 'Date TBA';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function dateParts(iso) {
  if (!iso) return { weekday: '', day: '–', month: 'TBA' };
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    weekday: dt.toLocaleDateString('en-US', { weekday: 'short' }),
    day: dt.getDate(),
    month: dt.toLocaleDateString('en-US', { month: 'short' })
  };
}

const formatMoney = amount => `$${Number(amount).toFixed(2)}`;
const findEvent = id => events.find(e => e.id === Number(id));
const reservedFor = eventId => state.reservedSeatsPerEvent[eventId] || [];
const seatsLeft = eventId => SEATS_PER_EVENT - reservedFor(eventId).length;

let toastTimeout = null;
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 3500);
}

function switchView(name) {
  Object.entries(views).forEach(([key, el]) => el.classList.toggle('active', key === name));
  currentView = name;
  window.scrollTo(0, 0);
}

const views = {
  catalog: document.getElementById('catalog-view'),
  seat: document.getElementById('seat-view'),
  history: document.getElementById('history-view')
};

// ===== Catalog =====
function renderCatalog() {
  const search = document.getElementById('search-input').value.trim().toLowerCase();
  const category = document.getElementById('category-filter').value;

  const filtered = events
    .filter(e => e.title.toLowerCase().includes(search))
    .filter(e => category === 'all' || e.category === category)
    .sort((a, b) => a.date.localeCompare(b.date));

  document.getElementById('catalog-empty').classList.toggle('hidden', filtered.length > 0);

  document.getElementById('event-grid').innerHTML = filtered.map(e => {
    const left = seatsLeft(e.id);
    const soldOut = left <= 0;
    const day = dateParts(e.date);
    return `
      <article class="ticket">
        <div class="ticket-stub">
          <span class="ticket-weekday">${day.weekday}</span>
          <span class="ticket-day">${day.day}</span>
          <span class="ticket-month">${day.month}</span>
        </div>
        <div class="ticket-body">
          <span class="tag">${escapeHtml(e.category)}</span>
          <h3>${escapeHtml(e.title)}</h3>
          <p class="ticket-venue">${escapeHtml(e.venue)}</p>
          <div class="ticket-footer">
            <div>
              <span class="price">${formatMoney(e.price)}</span>
              <span class="seats-left ${soldOut ? 'sold-out' : ''}">${soldOut ? 'Sold out' : `${left} of ${SEATS_PER_EVENT} seats left`}</span>
            </div>
            <button class="btn-primary" type="button" data-event-id="${e.id}" ${soldOut ? 'disabled' : ''}>
              ${soldOut ? 'Sold out' : 'Select seats'}
            </button>
          </div>
        </div>
      </article>`;
  }).join('');
}

// ===== Seat selection =====
function openSeatSelection(eventId) {
  const event = findEvent(eventId);
  if (!event) return;

  releaseSelection();
  state.activeEventId = event.id;

  document.getElementById('active-event-title').textContent = event.title;
  document.getElementById('active-event-details').textContent =
    `${formatDate(event.date)} at ${event.venue}. ${formatMoney(event.price)} per seat.`;

  renderSeatGrid();
  updateCheckoutSummary();
  switchView('seat');
}

function renderSeatGrid() {
  const grid = document.getElementById('seat-grid');
  const reserved = new Set(reservedFor(state.activeEventId));
  const selected = new Set(state.selectedSeatIds);
  const fragment = document.createDocumentFragment();

  for (let seat = 1; seat <= SEATS_PER_EVENT; seat++) {
    const isReserved = reserved.has(seat);
    const isSelected = selected.has(seat);
    const status = isReserved ? 'reserved' : isSelected ? 'selected' : 'available';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `seat ${status}`;
    btn.textContent = seat;
    btn.dataset.seat = seat;
    btn.disabled = isReserved;
    btn.setAttribute('aria-pressed', String(isSelected));
    btn.setAttribute('aria-label', `Seat ${seat}, ${status}`);
    fragment.appendChild(btn);
  }

  grid.replaceChildren(fragment);
}

function toggleSeat(seatId) {
  const index = state.selectedSeatIds.indexOf(seatId);

  if (index !== -1) {
    state.selectedSeatIds.splice(index, 1);
  } else {
    if (state.selectedSeatIds.length >= MAX_SEATS_PER_BOOKING) {
      showToast(`You can reserve up to ${MAX_SEATS_PER_BOOKING} seats per booking.`, 'error');
      return;
    }
    state.selectedSeatIds.push(seatId);
  }

  if (state.selectedSeatIds.length > 0) {
    startHoldTimer();
  } else {
    stopHoldTimer();
  }

  renderSeatGrid();
  updateCheckoutSummary();
}

function updateCheckoutSummary() {
  const event = findEvent(state.activeEventId);
  const count = state.selectedSeatIds.length;
  const total = event ? count * event.price : 0;

  document.getElementById('seat-count').textContent = `${count} seat${count === 1 ? '' : 's'}`;
  document.getElementById('total-price').textContent = formatMoney(total);
  document.getElementById('proceed-checkout-btn').disabled = count === 0;
}

// ===== Hold timer =====
function updateTimerDisplay() {
  const mins = String(Math.floor(state.holdSecondsRemaining / 60)).padStart(2, '0');
  const secs = String(state.holdSecondsRemaining % 60).padStart(2, '0');
  document.getElementById('timer-display').textContent = `${mins}:${secs}`;
  const pct = (state.holdSecondsRemaining / HOLD_SECONDS) * 100;
  document.getElementById('hold-progress').style.width = `${Math.max(0, pct)}%`;
}

function startHoldTimer() {
  if (state.holdTimerInterval) return; // already holding; don't reset the clock

  state.holdSecondsRemaining = HOLD_SECONDS;
  document.getElementById('hold-banner').classList.remove('hidden');
  updateTimerDisplay();

  state.holdTimerInterval = setInterval(() => {
    state.holdSecondsRemaining--;

    if (state.holdSecondsRemaining <= 0) {
      releaseSelection();
      renderSeatGrid();
      updateCheckoutSummary();
      showToast('Your seat hold expired. Please select your seats again.', 'error');
      return;
    }
    updateTimerDisplay();
  }, 1000);
}

function stopHoldTimer() {
  clearInterval(state.holdTimerInterval);
  state.holdTimerInterval = null;
  document.getElementById('hold-banner').classList.add('hidden');
}

// Clears the hold and any selected seats (used when leaving the seat map).
function releaseSelection() {
  stopHoldTimer();
  state.selectedSeatIds = [];
}

// ===== Checkout =====
function confirmReservation() {
  const event = findEvent(state.activeEventId);
  if (!event || state.selectedSeatIds.length === 0) return;

  // Re-read storage: another tab may have taken some of these seats since we loaded.
  state.reservedSeatsPerEvent = loadReservations();
  const taken = reservedFor(event.id);
  const conflicts = state.selectedSeatIds.filter(id => taken.includes(id));

  if (conflicts.length > 0) {
    releaseSelection();
    renderSeatGrid();
    updateCheckoutSummary();
    showToast(`Seat(s) ${conflicts.join(', ')} were just reserved by someone else. Please choose again.`, 'error');
    return;
  }

  const seats = [...state.selectedSeatIds].sort((a, b) => a - b);
  const booking = {
    id: Date.now(),
    eventId: event.id,
    eventTitle: event.title,
    eventDate: event.date,
    venue: event.venue,
    seats,
    totalPaid: seats.length * event.price,
    bookedOn: new Date().toISOString()
  };

  const updatedReservations = { ...state.reservedSeatsPerEvent, [event.id]: [...taken, ...seats] };
  const updatedBookings = [...state.userBookings, booking];

  const savedSeats = saveJSON(STORAGE_KEYS.reserved, updatedReservations);
  const savedBookings = saveJSON(STORAGE_KEYS.bookings, updatedBookings);
  if (!savedSeats || !savedBookings) {
    showToast('Could not save your reservation. Browser storage may be full or disabled.', 'error');
    return;
  }

  state.reservedSeatsPerEvent = updatedReservations;
  state.userBookings = updatedBookings;
  releaseSelection();

  showToast(`Reservation confirmed: ${seats.length} seat(s) for ${event.title}.`, 'success');
  switchView('catalog');
  renderCatalog();
}

// ===== Bookings history =====
function renderHistory() {
  const list = document.getElementById('history-list');

  if (state.userBookings.length === 0) {
    list.innerHTML = `
      <div class="history-empty">
        <h3>No passes yet</h3>
        <p>Choose an event to reserve your first seats. Your passes will appear here.</p>
      </div>`;
    return;
  }

  list.innerHTML = state.userBookings.map(b => {
    const bookedText = b.bookedOn ? new Date(b.bookedOn).toLocaleDateString() : (b.date || 'Unknown');
    const day = dateParts(b.eventDate);
    return `
      <article class="ticket pass">
        <div class="ticket-stub">
          <span class="ticket-weekday">${day.weekday}</span>
          <span class="ticket-day">${day.day}</span>
          <span class="ticket-month">${day.month}</span>
        </div>
        <div class="ticket-body">
          <h3>${escapeHtml(b.eventTitle)}</h3>
          <dl class="pass-facts">
            <div><dt>Seats</dt><dd>${b.seats.join(', ')}</dd></div>
            <div><dt>Paid</dt><dd>${formatMoney(b.totalPaid)}</dd></div>
            <div><dt>Booked</dt><dd>${escapeHtml(bookedText)}</dd></div>
          </dl>
          <div class="ticket-footer">
            <button class="btn-quiet danger" type="button" data-booking-id="${b.id}">Cancel booking</button>
          </div>
        </div>
      </article>`;
  }).join('');
}

function cancelBooking(bookingId) {
  const booking = state.userBookings.find(b => b.id === bookingId);
  if (!booking) return;

  const ok = confirm(`Cancel ${booking.seats.length} seat(s) for "${booking.eventTitle}"? The seats will be released.`);
  if (!ok) return;

  const updatedReservations = {
    ...state.reservedSeatsPerEvent,
    [booking.eventId]: reservedFor(booking.eventId).filter(s => !booking.seats.includes(s))
  };
  const updatedBookings = state.userBookings.filter(b => b.id !== bookingId);

  if (!saveJSON(STORAGE_KEYS.reserved, updatedReservations) || !saveJSON(STORAGE_KEYS.bookings, updatedBookings)) {
    showToast('Could not update your bookings. Please try again.', 'error');
    return;
  }

  state.reservedSeatsPerEvent = updatedReservations;
  state.userBookings = updatedBookings;
  renderHistory();
  showToast('Booking cancelled.', 'success');
}

// ===== Event listeners =====
document.getElementById('search-input').addEventListener('input', renderCatalog);
document.getElementById('category-filter').addEventListener('change', renderCatalog);

document.getElementById('event-grid').addEventListener('click', e => {
  const btn = e.target.closest('button[data-event-id]');
  if (btn && !btn.disabled) openSeatSelection(btn.dataset.eventId);
});

document.getElementById('seat-grid').addEventListener('click', e => {
  const seat = e.target.closest('.seat');
  if (seat && !seat.disabled) toggleSeat(Number(seat.dataset.seat));
});

document.getElementById('proceed-checkout-btn').addEventListener('click', confirmReservation);

document.getElementById('back-to-catalog').addEventListener('click', () => {
  releaseSelection();
  switchView('catalog');
  renderCatalog();
});

document.getElementById('view-bookings-btn').addEventListener('click', () => {
  releaseSelection();
  renderHistory();
  switchView('history');
});

document.getElementById('back-from-history').addEventListener('click', () => {
  switchView('catalog');
  renderCatalog();
});

document.getElementById('history-list').addEventListener('click', e => {
  const btn = e.target.closest('button[data-booking-id]');
  if (btn) cancelBooking(Number(btn.dataset.bookingId));
});

// Keep multiple open tabs in sync.
window.addEventListener('storage', e => {
  if (e.key === STORAGE_KEYS.reserved) {
    state.reservedSeatsPerEvent = loadReservations();
    if (currentView === 'seat') {
      const before = state.selectedSeatIds.length;
      state.selectedSeatIds = state.selectedSeatIds.filter(
        id => !reservedFor(state.activeEventId).includes(id)
      );
      if (state.selectedSeatIds.length === 0) stopHoldTimer();
      if (state.selectedSeatIds.length < before) {
        showToast('Some of your selected seats were just reserved elsewhere and have been released.', 'error');
      }
      renderSeatGrid();
      updateCheckoutSummary();
    }
  }
  if (e.key === STORAGE_KEYS.bookings) {
    state.userBookings = normalizeBookings(loadJSON(STORAGE_KEYS.bookings, []));
    if (currentView === 'history') renderHistory();
  }
  if (currentView === 'catalog') renderCatalog();
});

// ===== Initial render =====
renderCatalog();
