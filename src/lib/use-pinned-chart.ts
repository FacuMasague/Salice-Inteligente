import { useState } from 'react';

/** Mantiene el dato visible al tocar/clickear, sin perder el comportamiento de hover. */
export function usePinnedChart<T>() {
  const [hovered, setHovered] = useState<T | null>(null);
  const [pinned, setPinned] = useState<T | null>(null);
  const active = hovered ?? pinned;

  const togglePinned = (value: T) => {
    setPinned((current) => {
      if (Object.is(current, value)) {
        setHovered(null);
        return null;
      }
      return value;
    });
  };

  return { active, hovered, pinned, setHovered, clearHover: () => setHovered(null), togglePinned };
}
