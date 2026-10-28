// Pointer-driven motion. Everything here is skipped when the system asks for reduced motion.
export const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Sets --px and --py (-0.5 to 0.5) on the element, so CSS can move layers with the pointer.
export function trackPointer(e) {
  if (reduceMotion()) return;
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
  e.currentTarget.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
}
