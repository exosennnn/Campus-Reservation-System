// Mock Campus Events Dataset
const mockEvents = [
  { id: 1, title: "Tech Innovators Summit 2026", category: "Tech", date: "Aug 15, 2026", venue: "Main Auditorium", price: 15 },
  { id: 2, title: "Annual Campus Drama Play", category: "Arts", date: "Aug 20, 2026", venue: "Black Box Theater", price: 10 },
  { id: 3, title: "Inter-College Basketball Finals", category: "Sports", date: "Aug 25, 2026", venue: "Gymnasium", price: 8 }
];

// Application State Object
let state = {
  events: mockEvents,
  activeEventId: null,
  selectedSeatIds: [],
  reservedSeatsPerEvent: JSON.parse(localStorage.getItem('reservedSeats')) || { 1: [1, 2, 3], 2: [10, 11], 3: [] },
  userBookings: JSON.parse(localStorage.getItem('userBookings')) || [],
  holdTimerInterval: null,
  holdSecondsRemaining: 300
};

// DOM Element References
const views = {
  catalog: document.getElementById('catalog-view'),
  seat: document.getElementById('seat-view'),
  history: document.getElementById('history-view')
};

function switchView(targetView) {
  Object.values(views).forEach(view => view.classList.remove('active'));
  views[targetView].classList.add('active');
}

// Render Event Catalog Cards
function renderCatalog() {
  const eventGrid = document.getElementById('event-grid');
  const search = document.getElementById('search-input').value.toLowerCase();
  const category = document.getElementById('category-filter').value;

  const filtered = state.events.filter(e => {
    const matchesSearch = e.title.toLowerCase().includes(search);
    const matchesCategory = category === 'all' || e.category === category;
    return matchesSearch && matchesCategory;
  });

  eventGrid.innerHTML = filtered.map(e => `
    <div class="event-card">
      <div>
        <span class="category-tag">${e.category}</span>
        <h3>${e.title}</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem;">${e.date} • ${e.venue}</p>
      </div>
      <div style="margin-top: 1rem; display: flex; justify-content: space-between; align-items: center;">
        <strong>$${e.price}</strong>
        <button class="btn-primary" onclick="openSeatSelection(${e.id})">Select Seats</button>
      </div>
    </div>
  `).join('');
}

// Open Seat Selection View
function openSeatSelection(eventId) {
  state.activeEventId = eventId;
  state.selectedSeatIds = [];
  resetHoldTimer();

  const event = state.events.find(e => e.id === eventId);
  document.getElementById('active-event-title').textContent = event.title;
  document.getElementById('active-event-details').textContent = `${event.date} • ${event.venue} ($${event.price}/seat)`;

  renderSeatGrid();
  updateCheckoutSummary();
  switchView('seat');
}

// Render 24 Venue Seats (3 rows of 8)
function renderSeatGrid() {
  const grid = document.getElementById('seat-grid');
  const reservedForEvent = state.reservedSeatsPerEvent[state.activeEventId] || [];
  grid.innerHTML = '';

  for (let i = 1; i <= 24; i++) {
    const isReserved = reservedForEvent.includes(i);
    const isSelected = state.selectedSeatIds.includes(i);

    const seatBtn = document.createElement('div');
    seatBtn.className = `seat ${isReserved ? 'reserved' : ''} ${isSelected ? 'selected' : ''}`;
    seatBtn.textContent = i;

    if (!isReserved) {
      seatBtn.addEventListener('click', () => toggleSeat(i));
    }

    grid.appendChild(seatBtn);
  }
}

// Toggle Seat Picker (Max 6 limit)
function toggleSeat(seatId) {
  if (state.selectedSeatIds.includes(seatId)) {
    state.selectedSeatIds = state.selectedSeatIds.filter(id => id !== seatId);
  } else {
    if (state.selectedSeatIds.length >= 6) {
      alert("Maximum 6 seats allowed per reservation.");
      return;
    }
    state.selectedSeatIds.push(seatId);
  }

  if (state.selectedSeatIds.length > 0 && !state.holdTimerInterval) {
    startHoldTimer();
  } else if (state.selectedSeatIds.length === 0) {
    resetHoldTimer();
  }

  renderSeatGrid();
  updateCheckoutSummary();
}

function updateCheckoutSummary() {
  const event = state.events.find(e => e.id === state.activeEventId);
  const count = state.selectedSeatIds.length;
  const total = count * (event ? event.price : 0);

  document.getElementById('seat-count').textContent = count;
  document.getElementById('total-price').textContent = `$${total}`;
  document.getElementById('proceed-checkout-btn').disabled = count === 0;
}

// Hold Timer Logic
function startHoldTimer() {
  state.holdSecondsRemaining = 300;
  document.getElementById('hold-banner').classList.remove('hidden');

  state.holdTimerInterval = setInterval(() => {
    state.holdSecondsRemaining--;

    const mins = String(Math.floor(state.holdSecondsRemaining / 60)).padStart(2, '0');
    const secs = String(state.holdSecondsRemaining % 60).padStart(2, '0');
    document.getElementById('timer-display').textContent = `${mins}:${secs}`;

    if (state.holdSecondsRemaining <= 0) {
      alert("Seat hold time expired! Your selections have been released.");
      state.selectedSeatIds = [];
      resetHoldTimer();
      renderSeatGrid();
      updateCheckoutSummary();
    }
  }, 1000);
}

function resetHoldTimer() {
  clearInterval(state.holdTimerInterval);
  state.holdTimerInterval = null;
  document.getElementById('hold-banner').classList.add('hidden');
}

// Confirm Reservation
document.getElementById('proceed-checkout-btn').addEventListener('click', () => {
  const event = state.events.find(e => e.id === state.activeEventId);

  // Save to Reserved State
  if (!state.reservedSeatsPerEvent[event.id]) {
    state.reservedSeatsPerEvent[event.id] = [];
  }
  state.reservedSeatsPerEvent[event.id].push(...state.selectedSeatIds);
  localStorage.setItem('reservedSeats', JSON.stringify(state.reservedSeatsPerEvent));

  // Save to User Bookings
  const newBooking = {
    id: Date.now(),
    eventTitle: event.title,
    seats: [...state.selectedSeatIds],
    totalPaid: state.selectedSeatIds.length * event.price,
    date: new Date().toLocaleDateString()
  };
  state.userBookings.push(newBooking);
  localStorage.setItem('userBookings', JSON.stringify(state.userBookings));

  alert("Reservation Successful! Tickets saved to your profile.");
  state.selectedSeatIds = [];
  resetHoldTimer();
  switchView('catalog');
  renderCatalog();
});

// History & Navigation Event Listeners
document.getElementById('search-input').addEventListener('input', renderCatalog);
document.getElementById('category-filter').addEventListener('change', renderCatalog);
document.getElementById('back-to-catalog').addEventListener('click', () => {
  resetHoldTimer();
  switchView('catalog');
});
document.getElementById('view-bookings-btn').addEventListener('click', () => {
  renderHistory();
  switchView('history');
});
document.getElementById('back-from-history').addEventListener('click', () => switchView('catalog'));

function renderHistory() {
  const historyList = document.getElementById('history-list');
  if (state.userBookings.length === 0) {
    historyList.innerHTML = `<p style="color: var(--text-muted); margin-top: 1rem;">No reserved passes found.</p>`;
    return;
  }

  historyList.innerHTML = state.userBookings.map(b => `
    <div style="background: var(--surface-color); border: 1px solid var(--border-color); padding: 1rem; border-radius: 8px; margin-top: 1rem;">
      <h3 style="color: var(--accent-gold);">${b.eventTitle}</h3>
      <p style="font-size: 0.9rem; color: var(--text-muted); margin: 0.4rem 0;">Booked on: ${b.date}</p>
      <p>Seats: <strong>${b.seats.join(', ')}</strong> | Paid: <strong>$${b.totalPaid}</strong></p>
    </div>
  `).join('');
}

// Initial Run
renderCatalog();