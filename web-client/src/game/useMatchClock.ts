import { useEffect, useState } from 'react';

export function useMatchClock(active: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const update = () => setNow(Date.now());
    update();
    const interval = window.setInterval(update, 200);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [active]);
  return now;
}
