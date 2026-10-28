const RADIUS = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// A ring that empties as the seat hold runs down.
export default function HoldRing({ secondsLeft, total, label }) {
  const fraction = Math.max(0, Math.min(1, secondsLeft / total));
  return (
    <div className="hold-ring" role="timer" aria-label={`${label} left`}>
      <svg viewBox="0 0 56 56" aria-hidden="true">
        <circle className="ring-track" cx="28" cy="28" r={RADIUS} />
        <circle
          className="ring-fill"
          cx="28"
          cy="28"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
        />
      </svg>
      <span className="ring-time">{label}</span>
    </div>
  );
}
