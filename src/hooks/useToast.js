import { useCallback, useEffect, useRef, useState } from 'react';

const VISIBLE_MS = 3500;

export function useToast() {
  const [toast, setToast] = useState({ message: '', type: 'info', visible: false });
  const timer = useRef(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, visible: true });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setToast((t) => ({ ...t, visible: false }));
    }, VISIBLE_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { toast, showToast };
}
