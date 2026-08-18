import { useEffect, useRef, useState, type ReactNode } from 'react';

interface AnimatedLayerProps {
  open: boolean;
  className: string;
  children: ReactNode;
  exitDuration?: number;
}

/** Keeps a transient layer mounted long enough to render its closing motion. */
export function AnimatedLayer({ open, className, children, exitDuration = 320 }: AnimatedLayerProps) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const lastOpenChildren = useRef<ReactNode>(children);

  if (open && children != null) lastOpenChildren.current = children;

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return undefined;
    }
    if (!mounted) return undefined;

    setClosing(true);
    const timeout = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, exitDuration);
    return () => window.clearTimeout(timeout);
  }, [exitDuration, mounted, open]);

  if (!mounted) return null;

  return <div
    className={`${className} animated-layer ${closing ? 'is-closing' : 'is-opening'}`}
    aria-hidden={closing ? true : undefined}
  >
    {open ? children : lastOpenChildren.current}
  </div>;
}
