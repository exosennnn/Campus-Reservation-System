// Mock catalogue. ISO dates (YYYY-MM-DD) sort and parse reliably.
export const events = [
  {
    id: 1,
    title: 'Tech Innovators Summit 2026',
    category: 'Tech',
    date: '2026-11-14',
    time: '09:00',
    venue: 'Main Auditorium',
    price: 15,
    description: 'A day of talks from student builders and visiting engineers, ending with a panel on campus startups.',
  },
  {
    id: 2,
    title: 'Annual Campus Drama Play',
    category: 'Arts',
    date: '2026-11-20',
    time: '19:00',
    venue: 'Black Box Theater',
    price: 10,
    description: 'The drama club returns with an original two-act play. Running time is about 110 minutes with one interval.',
  },
  {
    id: 3,
    title: 'Inter-College Basketball Finals',
    category: 'Sports',
    date: '2026-11-25',
    time: '16:00',
    venue: 'Gymnasium',
    price: 8,
    description: 'The championship game between the two top-ranked colleges. Doors open one hour before tip-off.',
  },
];

export const findEvent = (id) => events.find((e) => e.id === Number(id)) ?? null;
