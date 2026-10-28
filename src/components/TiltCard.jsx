import { reduceMotion } from '../lib/parallax.js';

// Tilts toward the pointer and shows a soft light that follows it.
export default function TiltCard({ as: Tag = 'div', className = '', children, ...rest }) {
  function move(e) {
    if (reduceMotion()) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const s = e.currentTarget.style;
    s.setProperty('--rx', (px - 0.5).toFixed(3));
    s.setProperty('--ry', (py - 0.5).toFixed(3));
    s.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
    s.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
  }

  function reset(e) {
    e.currentTarget.style.setProperty('--rx', '0');
    e.currentTarget.style.setProperty('--ry', '0');
  }

  return (
    <Tag className={`tilt ${className}`} onPointerMove={move} onPointerLeave={reset} {...rest}>
      {children}
    </Tag>
  );
}
