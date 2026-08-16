import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, SlidersHorizontal, X } from 'lucide-react';

const FOCUSABLE_SELECTOR = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])';
let openMobileSheetCount = 0;

function acquireMobileSheetLock() {
  openMobileSheetCount += 1;
  document.documentElement.classList.add('mobile-sheet-open');
}

function releaseMobileSheetLock() {
  openMobileSheetCount = Math.max(0, openMobileSheetCount - 1);
  if (!openMobileSheetCount) document.documentElement.classList.remove('mobile-sheet-open');
}

interface MobileFilterSheetProps {
  title: string;
  description?: string;
  activeCount?: number;
  triggerLabel?: string;
  applyLabel?: string;
  className?: string;
  triggerClassName?: string;
  mobileOnly?: boolean;
  children: ReactNode;
}

/**
 * On desktop this wrapper is layout-neutral and preserves the existing filter
 * bars. On narrow screens it turns the same controls into an accessible bottom
 * sheet, so every view keeps one source of filter state and behaviour.
 */
export function MobileFilterSheet({
  title,
  description = 'Elegí los criterios y volvé a los resultados cuando termines.',
  activeCount = 0,
  triggerLabel = 'Filtros',
  applyLabel = 'Ver resultados',
  className = '',
  triggerClassName = '',
  mobileOnly = false,
  children,
}: MobileFilterSheetProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const restoreTriggerFocusRef = useRef(true);

  useEffect(() => {
    if (!open) return undefined;
    const focusableElements = () => [...(sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])]
      .filter((element) => element.offsetParent !== null);
    const keepFocusInside = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase('es') === 'k') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        restoreTriggerFocusRef.current = true;
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = focusableElements();
      if (!focusable.length) {
        event.preventDefault();
        sheetRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!sheetRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const restoreEscapedFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !sheetRef.current?.contains(event.target)) {
        (focusableElements()[0] ?? sheetRef.current)?.focus();
      }
    };
    const inertedSiblings = new Map<HTMLElement, { inert: boolean; ariaHidden: string | null }>();
    let activeBranch: HTMLElement | null = layerRef.current;
    while (activeBranch && activeBranch !== document.body) {
      const parent = activeBranch.parentElement;
      if (!parent) break;
      for (const sibling of parent.children) {
        if (sibling === activeBranch || !(sibling instanceof HTMLElement) || inertedSiblings.has(sibling)) continue;
        inertedSiblings.set(sibling, { inert: sibling.inert, ariaHidden: sibling.getAttribute('aria-hidden') });
        sibling.inert = true;
        sibling.setAttribute('aria-hidden', 'true');
      }
      activeBranch = parent;
    }
    acquireMobileSheetLock();
    const mobileViewport = window.matchMedia('(max-width: 900px)');
    const closeWhenLeavingMobile = (event: MediaQueryListEvent) => {
      if (event.matches) return;
      restoreTriggerFocusRef.current = false;
      setOpen(false);
    };
    const focusFrame = window.requestAnimationFrame(() => sheetRef.current?.querySelector<HTMLElement>('.mobile-filter-close')?.focus());
    mobileViewport.addEventListener('change', closeWhenLeavingMobile);
    window.addEventListener('keydown', keepFocusInside, true);
    document.addEventListener('focusin', restoreEscapedFocus, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      releaseMobileSheetLock();
      for (const [element, previous] of inertedSiblings) {
        element.inert = previous.inert;
        if (previous.ariaHidden == null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', previous.ariaHidden);
      }
      mobileViewport.removeEventListener('change', closeWhenLeavingMobile);
      window.removeEventListener('keydown', keepFocusInside, true);
      document.removeEventListener('focusin', restoreEscapedFocus, true);
      if (restoreTriggerFocusRef.current && window.matchMedia('(max-width: 900px)').matches) {
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
  }, [open]);

  return <div className={`mobile-filter-shell ${mobileOnly ? 'mobile-only' : ''} ${className}`.trim()}>
    <button
      type="button"
      ref={triggerRef}
      className={`mobile-filter-trigger ${triggerClassName}`.trim()}
      aria-expanded={open}
      aria-controls={`${titleId}-sheet`}
      onClick={() => { restoreTriggerFocusRef.current = true; setOpen(true); }}
    >
      <SlidersHorizontal size={17} />
      <span>{triggerLabel}</span>
      {activeCount > 0 && <strong aria-label={`${activeCount} ${activeCount === 1 ? 'filtro activo' : 'filtros activos'}`}>{activeCount}</strong>}
    </button>
    <div ref={layerRef} className={`mobile-filter-layer ${open ? 'open' : ''}`} id={`${titleId}-sheet`}>
      <button type="button" className="mobile-filter-backdrop" tabIndex={-1} aria-hidden="true" onClick={() => { restoreTriggerFocusRef.current = true; setOpen(false); }} />
      <section
        ref={sheetRef}
        className="mobile-filter-sheet"
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        aria-labelledby={open ? titleId : undefined}
        aria-describedby={open ? descriptionId : undefined}
        tabIndex={open ? -1 : undefined}
      >
        <header>
          <div>
            <span>Opciones de esta vista</span>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
          <button type="button" className="mobile-filter-close" aria-label={`Cerrar ${title}`} onClick={() => { restoreTriggerFocusRef.current = true; setOpen(false); }}><X size={20} /></button>
        </header>
        <div className="mobile-filter-body">{children}</div>
        <footer>
          <button type="button" className="button primary mobile-filter-apply" onClick={() => { restoreTriggerFocusRef.current = true; setOpen(false); }}><Check size={17} /> {applyLabel}</button>
        </footer>
      </section>
    </div>
  </div>;
}
