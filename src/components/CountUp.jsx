import { useEffect, useRef, useState } from 'react';
import { reduceMotion } from '../lib/parallax.js';

// Counts from the previous value to the new one. Shows the number straight away when motion is reduced.
export default function CountUp({ value, duration = 900 }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (reduceMotion()) {
      setShown(value);
      from.current = value;
      return undefined;
    }
    const start = performance.now();
    const begin = from.current;
    let frame;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(begin + (value - begin) * eased));
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        from.current = value;
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <>{shown}</>;
}
