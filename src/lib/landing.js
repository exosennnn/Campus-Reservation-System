// Small helpers for moving around the landing page.
export function focusSignIn() {
  document.getElementById('landing-signin')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => document.getElementById('signin-email')?.focus({ preventScroll: true }), 450);
}

export function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
