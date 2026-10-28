import { reduceMotion } from '../lib/parallax.js';

// A button that leans slightly toward the pointer.
export default function MagneticButton({ className = '', onClick, children }) {
  function move(e) {
    if (reduceMotion()) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2;
    const y = e.clientY - r.top - r.height / 2;
    e.currentTarget.style.transform = `translate(${(x * 0.18).toFixed(1)}px, ${(y * 0.25).toFixed(1)}px)`;
  }

  function reset(e) {
    e.currentTarget.style.transform = '';
  }

  return (
    <button
      type="button"
      className={`magnetic ${className}`}
      onClick={onClick}
      onPointerMove={move}
      onPointerLeave={reset}
    >
      {children}
    </button>
  );
}
