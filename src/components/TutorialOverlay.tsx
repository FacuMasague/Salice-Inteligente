import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';

export type TutorialView = 'map' | 'agenda' | 'clients' | 'sellers' | 'finance' | 'products' | 'brands' | 'routes' | 'sales-explorer' | 'receivables' | 'goals' | 'report-center' | 'reports' | 'spt' | 'commercial-sales' | 'mars' | 'nutripet' | 'baires' | 'non-buyers' | 'pending-balances' | 'settings';

export interface TutorialStep {
  view: TutorialView;
  target: string;
  eyebrow: string;
  title: string;
  description: string;
  tip: string;
}

export type TutorialSection = 'operations' | 'administration' | 'reports';

export interface TutorialDefinition {
  id: TutorialSection;
  label: string;
  title: string;
  description: string;
  steps: TutorialStep[];
}

export const TUTORIALS: Record<TutorialSection, TutorialDefinition> = {
  operations: {
    id: 'operations',
    label: 'Centro operativo',
    title: 'Clientes, territorio y catálogo',
    description: 'Mapa, clientes, vendedores, productos, marcas y rutas.',
    steps: [
      { view: 'map', target: 'map-kpis', eyebrow: 'Centro operativo', title: 'Empezá por el pulso comercial', description: 'Los indicadores resumen la cartera activa y separan ventas, cobranza y oportunidad comercial para que cada señal conserve su significado.', tip: 'Los clientes inactivos siguen disponibles como historial, pero no alteran los indicadores operativos.' },
      { view: 'map', target: 'map-filters', eyebrow: 'Mapa', title: 'Elegí qué clientes querés ver', description: 'Combiná alcance, estado, pertenencia, zona y riesgo de cobranza. Los puntos cercanos se agrupan automáticamente para mantener el mapa legible.', tip: 'Acercá el mapa para separar clientes de una misma zona.' },
      { view: 'map', target: 'client-panel', eyebrow: 'Ficha del cliente', title: 'Abrí toda la información desde el mapa', description: 'La ficha reúne compras, cuenta corriente, sugerencias comerciales y notas. También señala ubicaciones corregidas o pendientes de revisión.', tip: 'Una ubicación aproximada puede verse en el mapa, pero no se utiliza para calcular rutas.' },
      { view: 'clients', target: 'clients-directory', eyebrow: 'Clientes', title: 'Compará la cartera en una sola tabla', description: 'La lista permite revisar estado, ventas, deuda, riesgo, oportunidad y prioridad sin depender de abreviaturas internas.', tip: 'Los filtros y encabezados ordenables ayudan a pasar de una pregunta al cliente concreto.' },
      { view: 'sellers', target: 'sellers-overview', eyebrow: 'Vendedores', title: 'Entendé cada cartera comercial', description: 'La vista compara clientes activos, ventas, localidades y señales por responsable. Seleccionar un vendedor abre el detalle de su cartera.', tip: 'Las localidades describen datos observados; no son territorios asignados automáticamente.' },
      { view: 'products', target: 'product-catalog', eyebrow: 'Productos', title: 'Consultá catálogo, stock y oportunidades', description: 'Buscá productos, compará disponibilidad y abrí sugerencias respaldadas por compras, afinidad y stock.', tip: 'La confianza indica calidad de evidencia; no es una probabilidad de compra.' },
      { view: 'brands', target: 'brands-directory', eyebrow: 'Marcas', title: 'Revisá el desempeño de cada marca', description: 'El directorio reúne ventas, unidades, compradores, productos, stock y última venta para cada marca disponible.', tip: 'Los nombres de marca de otras pantallas también funcionan como acceso a esta ficha.' },
      { view: 'routes', target: 'route-picker', eyebrow: 'Rutas', title: 'Armá recorridos a partir de comprobantes', description: 'Filtrá facturas y fojas, agrupá varias facturas del mismo cliente y ordená las paradas verificadas.', tip: 'Una foja cerrada confirma el cierre de carga, no la entrega al cliente.' },
    ],
  },
  administration: {
    id: 'administration',
    label: 'Administración',
    title: 'Ventas, cobranzas y seguimiento',
    description: 'Explorador de ventas, cartera, cuentas por cobrar, bandeja y objetivos.',
    steps: [
      { view: 'sales-explorer', target: 'sales-explorer-overview', eyebrow: 'Administración', title: 'Explorá cada venta hasta el comprobante', description: 'Fecha, vendedor, cliente, producto, marca, rubro, canal y zona recalculan el mismo universo comercial.', tip: 'Guardá combinaciones frecuentes y exportá solamente el detalle filtrado.' },
      { view: 'finance', target: 'finance-summary', eyebrow: 'Cartera', title: 'Priorizá la cobranza', description: 'Los resúmenes responden a los filtros y cada factura abre un detalle completo con su PDF.', tip: 'Combiná tiempo hasta el vencimiento y antigüedad de lo vencido según la tarea del día.' },
      { view: 'receivables', target: 'receivables-overview', eyebrow: 'Cuentas por cobrar', title: 'Registrá el seguimiento sin alterar el saldo', description: 'Responsable, estado, promesa, próximo seguimiento y comentarios se guardan por separado de los datos contables.', tip: 'El lápiz de cada fila abre la edición y conserva el historial de cambios.' },
      { view: 'agenda', target: 'agenda-workstation', eyebrow: 'Bandeja comercial', title: 'Reuní señales y notas de oficina', description: 'La bandeja combina cobranzas, oportunidades, compromisos y registros humanos para decidir qué revisar primero.', tip: 'Una nota documenta un hecho; no comunica ni completa automáticamente una gestión.' },
      { view: 'goals', target: 'goals-overview', eyebrow: 'Objetivos', title: 'Separá plan y resultado real', description: 'Los objetivos se preparan en un borrador versionado y se comparan con resultados del mismo período.', tip: 'Sólo activar explícitamente una versión modifica el plan vigente.' },
      { view: 'settings', target: 'portfolio-rules', eyebrow: 'Criterios de trabajo', title: 'Consultá las reglas cuando tengas dudas', description: 'Configuración explica cobertura, cartera, cálculos financieros y calidad de datos sin alterar la operación.', tip: 'Los detalles más técnicos quedan agrupados para consulta administrativa.' },
    ],
  },
  reports: {
    id: 'reports',
    label: 'Reportes',
    title: 'Resultados y análisis',
    description: 'Centro de reportes, comparaciones, proveedores y saldos.',
    steps: [
      { view: 'report-center', target: 'report-center', eyebrow: 'Reportes', title: 'Empezá por la pregunta', description: 'La portada organiza los reportes por finalidad y resume el estado general sin mezclar períodos ni universos incompatibles.', tip: 'Favoritos y recientes aceleran el acceso a los informes que más usás.' },
      { view: 'reports', target: 'reports-overview', eyebrow: 'Reporte general', title: 'Seguí resultados frente a objetivos', description: 'Mes, vendedor, rubro y marca recalculan resultados, plan, cumplimiento y evolución sobre períodos comparables.', tip: 'El plan comercial y las ventas reales siempre se muestran como conceptos separados.' },
      { view: 'spt', target: 'spt-overview', eyebrow: 'Volumen SPT', title: 'Compará kilos en períodos equivalentes', description: 'El tablero compara el mes contra la misma cantidad de días del mes y año anterior.', tip: 'El Excel exporta el informe completo con los filtros aplicados.' },
      { view: 'commercial-sales', target: 'commercial-sales-overview', eyebrow: 'Ventas comerciales', title: 'Leé la composición del negocio', description: 'Venta neta, comparación, negocios, evolución y detalle de marcas y productos conviven en una misma lectura.', tip: 'Expandí una marca para bajar hasta sus productos sin perder el contexto.' },
      { view: 'mars', target: 'mars-overview', eyebrow: 'Mars', title: 'Seguimiento por períodos comerciales', description: 'Mars organiza volumen, cobertura y marcas según los períodos propios del proveedor.', tip: 'Alterná sucursales y cuentas para comparar criterios equivalentes.' },
      { view: 'nutripet', target: 'nutripet-overview', eyebrow: 'NutriPet', title: 'Volumen y cobertura mensual', description: 'Kilos, clientes, acumulados, trimestres, marcas y productos se leen sobre meses calendario.', tip: 'Recorré el gráfico de cobertura para consultar cada mes.' },
      { view: 'baires', target: 'baires-overview', eyebrow: 'Baires', title: 'Compará Especializado y Masivo', description: 'El reporte reúne volumen, clientes, marcas y subrubros de ambos segmentos.', tip: 'Usá el selector de segmento para ver cada negocio o el total.' },
      { view: 'non-buyers', target: 'non-buyers-overview', eyebrow: 'Cuentas no compradoras', title: 'Detectá recuperaciones posibles', description: 'La vista encuentra cuentas o marcas con actividad histórica pero sin compras positivas recientes.', tip: 'El detalle puede mostrar todo el universo o solamente los casos sin compra.' },
      { view: 'pending-balances', target: 'pending-balances-overview', eyebrow: 'Saldos pendientes', title: 'Relacioná deuda y venta reciente', description: 'El reporte separa saldo pendiente y vencido, antigüedad, forma de pago y presión sobre ventas de los últimos 30 días.', tip: '“Sin ventas 30 días” indica que no existe una base comercial reciente para comparar.' },
    ],
  },
};

interface FocusRect { top: number; left: number; width: number; height: number }

export function TutorialOverlay({ definition, stepIndex, onBack, onNext, onClose }: { definition: TutorialDefinition; stepIndex: number; onBack: () => void; onNext: () => void; onClose: () => void }) {
  const step = definition.steps[stepIndex];
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
  const finalStep = stepIndex === definition.steps.length - 1;

  return (
    <div className="tutorial-layer" aria-live="polite">
      <div className={`tutorial-blocker ${focus ? '' : 'dimmed'}`} />
      {focus && <div className="tutorial-focus" style={{ top: focus.top - 6, left: focus.left - 6, width: focus.width + 12, height: focus.height + 12 }} />}
      <section className="tutorial-popover" role="dialog" aria-modal="true" aria-label={`Tutorial: ${step.title}`} style={{ top: popoverTop, left: popoverLeft, width: popoverWidth }}>
        <button className="tutorial-close" onClick={onClose} aria-label="Cerrar tutorial"><X size={17} /></button>
        <div className="tutorial-progress"><span>{definition.label === step.eyebrow ? definition.label : `${definition.label} · ${step.eyebrow}`}</span><strong>{stepIndex + 1} / {definition.steps.length}</strong></div>
        <h2>{step.title}</h2>
        <p>{step.description}</p>
        <div className="tutorial-tip"><Check size={14} /><span>{step.tip}</span></div>
        <div className="tutorial-dots">{definition.steps.map((_, index) => <i key={index} className={index === stepIndex ? 'active' : index < stepIndex ? 'done' : ''} />)}</div>
        <div className="tutorial-actions">
          <button className="button secondary" disabled={stepIndex === 0} onClick={onBack}><ArrowLeft size={15} /> Anterior</button>
          <button className="button primary" onClick={onNext}>{finalStep ? 'Finalizar' : 'Siguiente'} {finalStep ? <Check size={15} /> : <ArrowRight size={15} />}</button>
        </div>
      </section>
    </div>
  );
}
