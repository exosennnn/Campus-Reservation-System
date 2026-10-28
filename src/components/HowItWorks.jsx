import Reveal from './Reveal.jsx';

const STEPS = [
  {
    title: 'Pick an event',
    text: 'Browse shows, games and talks. Filter by category, or sort by date or price.',
    icon: (
      <path d="M4 5h16v14H4zM4 10h16M9 3v4M15 3v4" />
    ),
  },
  {
    title: 'Choose your seats',
    text: 'Taken seats update live. Your seats are held for 5 minutes while you pay.',
    icon: (
      <path d="M6 4h12v9H6zM4 13h16v4H4zM8 17v3M16 17v3" />
    ),
  },
  {
    title: 'Pay and show your pass',
    text: 'Pay in the app, then show your pass code at the entrance.',
    icon: (
      <path d="M4 7h16v10H4zM4 11h16M8 15h3" />
    ),
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="how" aria-labelledby="how-heading">
      <Reveal className="how-inner">
        <p className="eyebrow">How it works</p>
        <h2 id="how-heading">Three steps from seat to entrance</h2>

        <div className="how-steps">
          <svg className="how-path" viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true">
            <path pathLength="1" d="M60 60 C 260 0, 420 120, 500 60 S 760 0, 940 60" />
          </svg>

          {STEPS.map((step, i) => (
            <Reveal key={step.title} className="how-card" delay={200 + i * 160}>
              <span className="how-num" aria-hidden="true">
                {i + 1}
              </span>
              <svg className="how-icon" viewBox="0 0 24 24" aria-hidden="true">
                {step.icon}
              </svg>
              <h3>{step.title}</h3>
              <p className="muted">{step.text}</p>
            </Reveal>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
