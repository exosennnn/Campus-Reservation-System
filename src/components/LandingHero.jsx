import { focusSignIn, scrollToId } from '../lib/landing.js';
import MagneticButton from './MagneticButton.jsx';
import UpcomingEvents from './UpcomingEvents.jsx';

export default function LandingHero() {
  return (
    <div className="hero-copy">
      <span className="hero-chip reveal" style={{ '--i': 0 }}>
        <span className="live-dot" aria-hidden="true" />
        Seats update live
      </span>

      <h1 id="landing-heading" className="hero-title">
        <span className="hero-line">
          <span className="word" style={{ '--i': 1 }}>Find</span>{' '}
          <span className="word" style={{ '--i': 2 }}>your</span>{' '}
          <span className="word" style={{ '--i': 3 }}>seat.</span>
        </span>
        <span className="hero-line">
          <span className="word" style={{ '--i': 4 }}>Keep</span>{' '}
          <span className="word" style={{ '--i': 5 }}>your</span>{' '}
          <span className="word hl" style={{ '--i': 6 }}>pass.</span>
        </span>
      </h1>

      <p className="landing-lede reveal" style={{ '--i': 7 }}>
        Browse shows, games and talks on campus, pick the seats you want, and get a pass code for the
        entrance.
      </p>

      <div className="hero-actions reveal" style={{ '--i': 8 }}>
        <MagneticButton className="btn-primary hero-cta" onClick={focusSignIn}>
          Sign in to book
        </MagneticButton>
        <button type="button" className="btn-secondary hero-link" onClick={() => scrollToId('how-it-works')}>
          How it works
        </button>
      </div>

      <UpcomingEvents />
    </div>
  );
}
