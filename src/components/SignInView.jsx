import { useState } from 'react';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../config.js';
import { trackPointer } from '../lib/parallax.js';
import LandingHero from './LandingHero.jsx';
import SeatPreview from './SeatPreview.jsx';
import HowItWorks from './HowItWorks.jsx';
import LandingFooter from './LandingFooter.jsx';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A small ticket with a moving perforation, shown above the heading.
function TicketArt() {
  return (
    <svg className="ticket-art" viewBox="0 0 170 100" aria-hidden="true">
      <rect x="6" y="8" width="158" height="84" rx="14" className="ticket-shape" />
      <line x1="122" y1="8" x2="122" y2="92" className="ticket-perf" />
      <circle cx="122" cy="8" r="9" className="ticket-notch" />
      <circle cx="122" cy="92" r="9" className="ticket-notch" />
      <rect x="22" y="30" width="70" height="8" rx="4" className="ticket-line" />
      <rect x="22" y="48" width="48" height="8" rx="4" className="ticket-line soft" />
      <rect x="22" y="66" width="60" height="8" rx="4" className="ticket-line soft" />
      <text x="146" y="58" textAnchor="middle" className="ticket-admit">
        ✓
      </text>
    </svg>
  );
}

export default function SignInView({ onSubmit, onComplete }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [phase, setPhase] = useState('idle'); // 'idle' | 'sending' | 'success'
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [shaking, setShaking] = useState(false);

  const busy = phase !== 'idle';

  function shake() {
    setShaking(false);
    // Restart the animation on the next frame so repeated errors shake again.
    requestAnimationFrame(() => setShaking(true));
    setTimeout(() => setShaking(false), 500);
  }

  function validate() {
    const next = {};
    if (mode === 'signup' && !name.trim()) next.name = 'Enter your full name.';
    if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Enter a valid email, like name@campus.edu.';
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      next.password = `Use ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`;
    }
    return next;
  }

  function switchMode() {
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
    setErrors({});
    setFormError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;

    const found = validate();
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length > 0) {
      shake();
      return;
    }

    setPhase('sending');
    try {
      const data = await onSubmit({
        name: name.trim(),
        email: email.trim(),
        password,
        mode,
      });
      setPhase('success');
      await wait(1000); // let the check mark finish before the app appears
      onComplete(data);
    } catch (err) {
      setPhase('idle');
      setFormError(
        err.name === 'ApiError' ? err.message : "Can't reach the server. Check that it's running."
      );
      shake();
    }
  }

  return (
    <section className="landing" aria-labelledby="landing-heading">
      <div className="landing-hero" onPointerMove={trackPointer}>
        <div className="landing-hero-art" aria-hidden="true">
          <div className="blob blob-a" />
          <div className="blob blob-b" />
          <div className="art-layer" />
        </div>
        <div className="landing-inner">
        <LandingHero />

        <div className="landing-card" id="landing-signin">
          <div className={`signin-card ${phase === 'success' ? 'is-success' : ''}`}>
            <div className="reveal" style={{ '--i': 2 }}>
              <TicketArt />
            </div>

            <header className="reveal" style={{ '--i': 3 }}>
              <h2>Sign in to book</h2>
              <p className="muted">Your passes follow your email, so you can see them on any device.</p>
            </header>

            <form className={`auth-form ${shaking ? 'shake' : ''}`} onSubmit={handleSubmit} noValidate>
              {mode === 'signup' && (
              <div className="field reveal" style={{ '--i': 4 }}>
                <div className={`field-box ${errors.name ? 'invalid' : ''}`}>
                  <input
                    id="signin-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder=" "
                    autoComplete="name"
                    maxLength={60}
                    disabled={busy}
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? 'signin-name-error' : undefined}
                  />
                  <label htmlFor="signin-name">Full name</label>
                </div>
                {errors.name && (
                  <span className="field-error" id="signin-name-error" role="alert">
                    {errors.name}
                  </span>
                )}
              </div>

              )}

              <div className="field reveal" style={{ '--i': 5 }}>
                <div className={`field-box ${errors.email ? 'invalid' : ''}`}>
                  <input
                    id="signin-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder=" "
                    autoComplete="email"
                    maxLength={120}
                    disabled={busy}
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'signin-email-error' : undefined}
                  />
                  <label htmlFor="signin-email">Student email</label>
                </div>
                {errors.email && (
                  <span className="field-error" id="signin-email-error" role="alert">
                    {errors.email}
                  </span>
                )}
              </div>

              <div className="field reveal" style={{ '--i': 6 }}>
                <div className={`field-box ${errors.password ? 'invalid' : ''}`}>
                  <input
                    id="signin-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder=" "
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    maxLength={MAX_PASSWORD_LENGTH}
                    disabled={busy}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? 'signin-password-error' : undefined}
                  />
                  <label htmlFor="signin-password">Password</label>
                </div>
                {errors.password && (
                  <span className="field-error" id="signin-password-error" role="alert">
                    {errors.password}
                  </span>
                )}
              </div>

              {formError && (
                <p className="form-alert" role="alert">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                className={`btn-primary auth-submit reveal ${phase}`}
                style={{ '--i': 7 }}
                disabled={busy}
              >
                <span className="auth-submit-label">{mode === 'signup' ? 'Create account' : 'Sign in'}</span>
                <span className="auth-spinner" aria-hidden="true" />
                <svg className="auth-check" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12.5l4.2 4.2L19 7" />
                </svg>
                <span className="sr-only" aria-live="polite">
                  {phase === 'sending' ? 'Signing in' : phase === 'success' ? 'Signed in' : ''}
                </span>
              </button>
            </form>

            <button type="button" className="link-btn reveal" style={{ '--i': 8 }} onClick={switchMode} disabled={busy}>
              {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
            </button>

            <p className="muted small auth-note reveal" style={{ '--i': 9 }}>
              Passwords are stored as salted hashes on this server. Connecting to your campus single sign-on
              is the next step before a real launch.
            </p>
          </div>
        </div>
        </div>
      </div>

      <SeatPreview />
      <HowItWorks />
      <LandingFooter />
    </section>
  );
}
