import { dateParts } from '../lib/format.js';

// The perforated stub on the left of every ticket and pass.
export function TicketStub({ iso }) {
  const { weekday, day, month } = dateParts(iso);
  return (
    <div className="ticket-stub">
      <span className="ticket-weekday">{weekday}</span>
      <span className="ticket-day">{day}</span>
      <span className="ticket-month">{month}</span>
    </div>
  );
}
