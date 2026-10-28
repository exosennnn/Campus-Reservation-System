import { useEffect, useState } from 'react';
import { HOLD_SECONDS } from '../config.js';

// Returns whole seconds left on a hold. `expiresAt` is a timestamp (ms) or null.
// Calls `onExpire` once when the hold runs out.
export function useHoldCountdown(expiresAt, onExpire) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (expiresAt === null) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [expiresAt]);

  const remainingMs = expiresAt === null ? HOLD_SECONDS * 1000 : expiresAt - Date.now();
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));

  useEffect(() => {
    if (expiresAt !== null && seconds === 0) onExpire();
  }, [expiresAt, seconds, onExpire]);

  return seconds;
}
