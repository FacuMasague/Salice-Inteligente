import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';

export type TutorialView = 'map' | 'clients' | 'finance' | 'products' | 'routes' | 'settings';

export interface TutorialStep {
  view: TutorialView;
  target: string;
  eyebrow: string;
  title: string;
  description: string;
  tip: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  { view: 'settings', target: 'settings-tutorial', eyebrow: 'Bienvenida', title: 'Tu recorrido por Salice Inteligente', description: 'El tutorial va a cambiar de sección y señalar los controles importantes. No modifica datos: podés cerrarlo en cualquier momento y repetirlo desde Configuración.', tip: 'Usá Siguiente para avanzar o las flechas del teclado.' },
  { view: 'map', target: 'map-kpis', eyebrow: 'Mapa operativo', title: 'El pulso de la cartera activa', description: 'Los indicadores resumen activos GESI y muestran cuántos tienen pertenencia explícita a la sucursal Salice. Riesgo de cobranza ya no se mezcla con oportunidad comercial.', tip: 'Los inactivos nunca se suman a estos indicadores operativos.' },
  { view: 'map', target: 'map-filters', eyebrow: 'Mapa operativo', title: 'Elegí qué querés ver', description: 'Podés cambiar alcance, estado GESI, pertenencia a Salice, zona y riesgo de cobranza. Los puntos cercanos se agrupan para que el mapa siga siendo legible.', tip: 'Acercá el mapa para separar los grupos de clientes.' },
  { view: 'map', target: 'client-panel', eyebrow: 'Ficha de cliente', title: 'Toda la historia en un punto', description: 'Al seleccionar un marcador se abre la ficha con resumen, recomendaciones, compras, cuenta corriente y notas para la próxima visita.', tip: 'Los inactivos conservan su historia, pero no reciben recomendaciones ni se agregan a rutas.' },
  { view: 'clients', target: 'clients-directory', eyebrow: 'Clientes', title: 'Compará señales sin confundirlas', description: 'La lista separa estado GESI, pertenencia Salice, riesgo de cobranza C, oportunidad comercial O y prioridad de visita P.', tip: 'Filtrá por vendedor, riesgo, cartera y ordená según la tarea del momento.' },
  { view: 'finance', target: 'finance-summary', eyebrow: 'Cartera', title: 'Priorizá la cobranza', description: 'Los resúmenes responden a los filtros y usan saldo pendiente. El comportamiento se calcula contra la fecha de vencimiento, no sólo desde la emisión.', tip: 'La sección de antigüedad concentra rápidamente la deuda accionable.' },
  { view: 'products', target: 'product-catalog', eyebrow: 'Productos', title: 'Catálogo, stock y similitud', description: 'Seleccioná un producto para ver precio de referencia, stock, rotación, sus rasgos principales y compararlo con cualquier otro artículo.', tip: 'La comparación usa distancia coseno sobre 20 dimensiones.' },
  { view: 'products', target: 'vector-explorer', eyebrow: 'Productos', title: 'Explorá los 20 vectores', description: 'Cada dimensión explica una regla de clasificación. Al elegirla, todo el catálogo se ordena de afinidad 100 a 0, con un ranking completo y auditable.', tip: 'Podés volver a la ficha de cualquier producto desde la flecha de su fila.' },
  { view: 'routes', target: 'route-picker', eyebrow: 'Rutas', title: 'Armá una jornada posible', description: 'Elegí vendedor, duración de visita y jornada máxima. La estimación agrupa primero por corredor y avisa si el recorrido no parece cumplible.', tip: 'La distancia sigue siendo estimada: validá tránsito y horarios antes de salir.' },
  { view: 'settings', target: 'portfolio-rules', eyebrow: 'Reglas de cartera', title: 'Entendé el universo de clientes', description: 'Activo GESI y pertenencia a Salice son dos campos distintos. Los casos ambiguos quedan marcados para revisión, sin perderse ni excluirse solos.', tip: 'Esta decisión debe validarse con el jefe de Salice antes de endurecer el filtro.' },
  { view: 'settings', target: 'settings-tutorial', eyebrow: 'Final', title: 'Ya conocés la v0.0.3', description: 'El tutorial queda disponible para repetirlo. Configuración también documenta métricas, calidad, cobertura y persistencia local.', tip: 'La operación diaria sigue siendo algorítmica y explicable.' },
];

interface FocusRect { top: number; left: number; width: number; height: number }

export function TutorialOverlay({ stepIndex, onBack, onNext, onClose }: { stepIndex: number; onBack: () => void; onNext: () => void; onClose: () => void }) {
  const step = TUTORIAL_STEPS[stepIndex];
  const [focus, setFocus] = useState<FocusRect | null>(null);

  useEffect(() => {
    const update = () => {
      const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!target) return setFocus(null);
      const rect = target.getBoundingClientRect();
      setFocus({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    const frame = requestAnimationFrame(update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step.target]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') onNext();
      if (event.key === 'ArrowLeft' && stepIndex > 0) onBack();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [onBack, onClose, onNext, stepIndex]);

  const popoverWidth = Math.min(370, window.innerWidth - 32);
  const popoverLeft = focus
    ? Math.max(16, Math.min(window.innerWidth - popoverWidth - 16, focus.left + focus.width / 2 - popoverWidth / 2))
    : Math.max(16, (window.innerWidth - popoverWidth) / 2);
  const popoverTop = focus
    ? focus.top + focus.height + 246 < window.innerHeight
      ? focus.top + focus.height + 14
      : Math.max(16, focus.top - 232)
    : Math.max(20, window.innerHeight / 2 - 120);
  const finalStep = stepIndex === TUTORIAL_STEPS.length - 1;

  return (
    <div className="tutorial-layer" aria-live="polite">
      <div className={`tutorial-blocker ${focus ? '' : 'dimmed'}`} />
      {focus && <div className="tutorial-focus" style={{ top: focus.top - 6, left: focus.left - 6, width: focus.width + 12, height: focus.height + 12 }} />}
      <section className="tutorial-popover" role="dialog" aria-modal="true" aria-label={`Tutorial: ${step.title}`} style={{ top: popoverTop, left: popoverLeft, width: popoverWidth }}>
        <button className="tutorial-close" onClick={onClose} aria-label="Cerrar tutorial"><X size={17} /></button>
        <div className="tutorial-progress"><span>{step.eyebrow}</span><strong>{stepIndex + 1} / {TUTORIAL_STEPS.length}</strong></div>
        <h2>{step.title}</h2>
        <p>{step.description}</p>
        <div className="tutorial-tip"><Check size={14} /><span>{step.tip}</span></div>
        <div className="tutorial-dots">{TUTORIAL_STEPS.map((_, index) => <i key={index} className={index === stepIndex ? 'active' : index < stepIndex ? 'done' : ''} />)}</div>
        <div className="tutorial-actions">
          <button className="button secondary" disabled={stepIndex === 0} onClick={onBack}><ArrowLeft size={15} /> Anterior</button>
          <button className="button primary" onClick={onNext}>{finalStep ? 'Finalizar' : 'Siguiente'} {finalStep ? <Check size={15} /> : <ArrowRight size={15} />}</button>
        </div>
      </section>
    </div>
  );
}
