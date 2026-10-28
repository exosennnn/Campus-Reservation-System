import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { dateParts, formatMoney } from '../lib/format.js';
import Reveal from './Reveal.jsx';
import TiltCard from './TiltCard.jsx';

// Public list of events shown on the landing page. Hidden if it can't load.
export default function UpcomingEvents() {
  const [events, setEvents] = useState(null); // null while loading

  useEffect(() => {
    let cancelled = false;
    api('/events')
      .then((data) => {
        if (!cancelled) setEvents(data.events);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (events !== null && events.length === 0) return null;

  return (
    <div className="upcoming">
      <Reveal className="upcoming-head">
        <p className="eyebrow">Coming up on campus</p>
      </Reveal>
      <ul className="up-list">
        {events === null
          ? [0, 1, 2].map((i) => <li key={i} className="up-skeleton" aria-hidden="true" />)
          : events.slice(0, 3).map((event, i) => {
              const day = dateParts(event.date);
              return (
                <Reveal as="li" key={event.id} delay={200 + i * 120}>
                  <TiltCard className="up-card">
                    <div className="up-stamp" aria-label={`${day.month} ${day.day}`}>
                      <span>{day.month}</span>
                      <strong>{day.day}</strong>
                    </div>
                    <div className="up-info">
                      <strong>{event.title}</strong>
                      <span>
                        {event.venue}, {formatMoney(event.price)}
                      </span>
                    </div>
                    <svg className="up-arrow" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </TiltCard>
                </Reveal>
              );
            })}
      </ul>
    </div>
  );
}
