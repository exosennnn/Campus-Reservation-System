import { ACCESSIBLE_SEATS } from '../config.js';

// Seats are grouped in three rows of eight. Seat numbers stay the same as before.
const ROWS = [
  { letter: 'A', section: 'Front', seats: [1, 2, 3, 4, 5, 6, 7, 8] },
  { letter: 'B', section: 'Middle', seats: [9, 10, 11, 12, 13, 14, 15, 16] },
  { letter: 'C', section: 'Back', seats: [17, 18, 19, 20, 21, 22, 23, 24] },
];

export default function SeatMap({ reserved, selected, busy = false, accessible = false, onToggle }) {
  return (
    <div className="seat-rows" role="group" aria-label="Seat map">
      {ROWS.map((row) => (
        <div className="seat-row" key={row.letter}>
          <div className="row-label">
            <strong>Row {row.letter}</strong>
            <span className="muted small">{row.section} section</span>
          </div>
          <div className="seat-row-seats">
            {row.seats.map((seat) => {
              const isReserved = reserved.includes(seat);
              const isSelected = selected.includes(seat);
              const wheelchair = ACCESSIBLE_SEATS.wheelchair.includes(seat);
              const nearEntrance = ACCESSIBLE_SEATS.nearEntrance.includes(seat);
              const locked = wheelchair && !accessible;

              const state = isReserved ? 'taken' : isSelected ? 'selected' : locked ? 'for approved students' : 'available';
              const notes = [wheelchair && 'wheelchair space', nearEntrance && 'near the entrance']
                .filter(Boolean)
                .join(', ');

              const classes = [
                'seat',
                isReserved ? 'reserved' : isSelected ? 'selected' : 'available',
                wheelchair ? 'access-wheel' : '',
                nearEntrance ? 'near-entrance' : '',
              ].join(' ');

              return (
                <button
                  key={seat}
                  type="button"
                  className={classes}
                  disabled={isReserved || busy || locked}
                  aria-pressed={isSelected}
                  aria-label={`Seat ${seat}, row ${row.letter}, ${state}${notes ? `, ${notes}` : ''}`}
                  title={locked ? 'Reserved for students approved for accessible seating' : notes || undefined}
                  onClick={() => onToggle(seat)}
                >
                  <span>{seat}</span>
                  {wheelchair && (
                    <svg className="wheel-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="4.5" r="2" />
                      <path d="M9 9h5.5l1 4.5H19M12 9v4.5M10.5 13.5L8.5 19M13.5 13.5L15 19" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
