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

export const TUTORIAL_STEPS: TutorialStep[] = [
  { view: 'settings', target: 'settings-tutorial', eyebrow: 'Bienvenida', title: 'Tu recorrido por Salice Inteligente', description: 'El tutorial va a cambiar de sección y señalar los controles importantes. No modifica datos: podés cerrarlo en cualquier momento y repetirlo desde Configuración.', tip: 'Usá Siguiente para avanzar o las flechas del teclado.' },
  { view: 'map', target: 'map-kpis', eyebrow: 'Mapa operativo', title: 'El pulso de la cartera activa', description: 'Los indicadores resumen activos GESI y muestran cuántos tienen pertenencia explícita a la sucursal Salice. Riesgo de cobranza ya no se mezcla con oportunidad comercial.', tip: 'Los inactivos nunca se suman a estos indicadores operativos.' },
  { view: 'map', target: 'map-filters', eyebrow: 'Mapa operativo', title: 'Elegí qué querés ver', description: 'Podés cambiar alcance, estado GESI, pertenencia a Salice, zona y riesgo de cobranza. Los puntos cercanos se agrupan para que el mapa siga siendo legible.', tip: 'Acercá el mapa para separar los grupos de clientes.' },
  { view: 'map', target: 'client-panel', eyebrow: 'Ficha de cliente', title: 'Toda la historia en un punto', description: 'Al seleccionar un marcador se abre la ficha con resumen, recomendaciones, compras, cuenta corriente y notas humanas. El historial de cuenta muestra además si cada factura está sin foja, en una foja abierta o en una cerrada.', tip: 'Una foja cerrada no confirma entrega. En Gestiones, borrar una nota tampoco modifica la recomendación, una lista ni GESI.' },
  { view: 'agenda', target: 'agenda-workstation', eyebrow: 'Bandeja comercial · v0.6', title: 'Reuní señales y notas sin crear un workflow', description: 'Administración combina prioridades algorítmicas, cobranzas, oportunidades, compromisos y notas de oficina. Las señales orientan; sólo una persona puede registrar un hecho ocurrido fuera del sistema.', tip: 'Una nota no planifica, no comunica y no marca una recomendación como realizada.' },
  { view: 'clients', target: 'clients-directory', eyebrow: 'Clientes', title: 'Compará señales sin confundirlas', description: 'La lista separa estado GESI, pertenencia Salice, riesgo de cobranza C, oportunidad comercial O, prioridad P y evolución de compra contra los 90 días anteriores.', tip: 'Mayor crecimiento y Mayor caída usan un umbral de 30%; marcá con el tilde lo que ya revisaste.' },
  { view: 'sellers', target: 'sellers-overview', eyebrow: 'Vendedores · v0.6', title: 'Entendé cada cartera comercial', description: 'La tabla compara exclusivamente clientes activos, ventas, localidades y señales C/O/P. Los encabezados recorren orden descendente, ascendente y original; seleccionar un vendedor abre su detalle.', tip: 'Las localidades describen la cartera observada: no son territorios inferidos ni producen reasignaciones.' },
  { view: 'finance', target: 'finance-summary', eyebrow: 'Cartera', title: 'Priorizá la cobranza', description: 'Los resúmenes responden a los filtros y usan sólo comprobantes de clientes activos. Cada factura abre su panel completo y PDF.', tip: 'Combiná bandas de tiempo hasta el vencimiento y de antigüedad vencida según la tarea del día.' },
  { view: 'sales-explorer', target: 'sales-explorer-overview', eyebrow: 'Administración', title: 'Explorá cada venta hasta el comprobante', description: 'Fecha, vendedor, cliente, producto, marca, rubro, canal y zona recalculan el mismo universo. Desde un indicador podés bajar al período, cliente o producto y finalmente al comprobante.', tip: 'Guardá las combinaciones que la oficina usa con frecuencia y exportá el detalle filtrado.' },
  { view: 'receivables', target: 'receivables-overview', eyebrow: 'Cuentas por cobrar', title: 'Convertí la cartera en una bandeja de trabajo', description: 'Los saldos y vencimientos provienen de GESI. Responsable, estado, promesa, próximo seguimiento y comentarios viven por separado y conservan un historial auditable.', tip: 'Los cuadrantes filtran la bandeja; el lápiz de cada fila es el único acceso de edición.' },
  { view: 'goals', target: 'goals-overview', eyebrow: 'Objetivos · v0.6', title: 'Separá plan, resultado y notas', description: 'Los objetivos se editan en un borrador clonado y se comparan con resultados reales de GESI para el mismo período. Sólo una activación explícita modifica el plan; las versiones anteriores quedan archivadas.', tip: 'Las notas y oportunidades abiertas son contexto, no productividad ni etapas de un embudo.' },
  { view: 'report-center', target: 'report-center', eyebrow: 'Centro de reportes · v0.8', title: 'Empezá por la pregunta que necesitás responder', description: 'Reportes reúne dirección, ventas, cartera y negocios en una sola entrada. La portada “¿Cómo estamos?” resume señales aceptadas sin sumar universos incompatibles; también conserva favoritos, accesos recientes y la consulta directa de fojas.', tip: 'Cada tarjeta abre el reporte dueño del dato. Una foja cerrada continúa siendo un estado documental, no una entrega confirmada.' },
  { view: 'reports', target: 'reports-overview', eyebrow: 'Reporte General', title: 'Seguí el resultado frente al objetivo', description: 'La pantalla reúne Objetivos kilos, Marcas estratégicas y Autoservicio. Mes, vendedor, rubro y marca recalculan resultado, plan, cumplimiento, evolución y desgloses.', tip: 'Las ventas reales vienen de GESI; el plan comercial se conserva como configuración separada.' },
  { view: 'reports', target: 'reports-overview', eyebrow: 'Lectura del plan', title: 'Compará períodos equivalentes', description: 'El mes en curso se compara contra el mismo corte del mes y año anterior. Los filtros activos pueden quitarse individualmente, las vistas frecuentes pueden guardarse y la proyección lineal se mantiene como referencia, no como pronóstico.', tip: 'El acceso a Objetivos comerciales permite revisar el plan sin mezclarlo con los resultados reales de GESI.' },
  { view: 'spt', target: 'spt-overview', eyebrow: 'Reporte SPT', title: 'Compará volumen con períodos equivalentes', description: 'Este tablero calcula el universo SPT directamente desde GESI y compara kilos del mes contra la misma cantidad de días del mes y año anterior. Los criterios frecuentes quedan visibles y los filtros avanzados se abren sólo cuando hacen falta.', tip: 'Filtros activos y vistas guardadas usan el mismo bloque que el resto de Reportes; el Excel reúne el informe completo.' },
  { view: 'commercial-sales', target: 'commercial-sales-overview', eyebrow: 'Ventas · Comercial', title: 'Leé el negocio sin depender de Power BI', description: 'Esta pantalla replica el reporte comercial con datos capturados desde GESI: venta neta, comparación equivalente, negocios, evolución y matriz de marcas y productos.', tip: 'Las marcas se expanden sin ocultar su nombre; el Excel conserva números tipados, anchos legibles y cuadrícula.' },
  { view: 'mars', target: 'mars-overview', eyebrow: 'Reporte Mars', title: 'Seguimiento del proveedor por períodos propios', description: 'Mars trabaja con trece períodos comerciales. Evolución ocupa todo el ancho; Cobertura comparte una fila con los cuatro quarters y Marcas dispone de una tabla completa independiente.', tip: 'Mové el cursor por Cobertura para actualizar período y clientes continuamente; alterná sucursales y cuentas para comparar ambos criterios.' },
  { view: 'nutripet', target: 'nutripet-overview', eyebrow: 'Reporte NutriPet', title: 'Volumen y cobertura por mes calendario', description: 'NutriPet combina kilos, clientes, acumulados, trimestres, marcas y productos. Cobertura y los cuatro trimestres comparten una fila; Marcas y Detalle auditable conservan filas completas.', tip: 'Los meses se leen horizontalmente y el detalle del punto cambia mientras desplazás el cursor por Cobertura.' },
  { view: 'baires', target: 'baires-overview', eyebrow: 'Reporte Baires', title: 'Especializado y Masivo en una sola lectura', description: 'Baires reúne kilos, clientes, acumulados, trimestres, marcas y subrubros de Baires SPT y Baires Masivo. Cobertura y trimestres comparten una fila, mientras Marcas y Subrubros ocupan filas completas.', tip: 'El segmento permite analizar Especializado, Masivo o ambos; el tooltip de Cobertura acompaña el mes que estás recorriendo.' },
  { view: 'non-buyers', target: 'non-buyers-overview', eyebrow: 'Cuentas no compradoras', title: 'Detectá oportunidades de recuperación', description: 'Las vistas de cuentas y marcas comparan actividad en 180 días contra ausencia de venta neta positiva durante los últimos 30. Vendedor, grupo, rubro y marca recalculan el universo completo.', tip: 'La tasa usa como denominador quienes compraron en 90 días; el detalle permite alternar entre todo el universo y sólo los casos sin compra.' },
  { view: 'pending-balances', target: 'pending-balances-overview', eyebrow: 'Saldos Pendientes', title: 'Relacioná deuda, vencimiento y venta reciente', description: 'La pantalla separa saldo pendiente y vencido, muestra antigüedad, forma de pago y compara la deuda con las ventas brutas de los últimos 30 días.', tip: '“Sin ventas 30d” reemplaza el Infinity del reporte original: indica presión de cobranza sin una base comercial reciente.' },
  { view: 'brands', target: 'brands-directory', eyebrow: 'Marcas', title: 'Abrí el desempeño completo de una marca', description: 'El directorio reúne venta y unidades de 90 días, productos, stock, rotación, familias y última venta. Cada producto conserva acceso directo a su ficha.', tip: 'Cuando veas un nombre de marca en otra pantalla, podés usarlo para volver a esta ficha.' },
  { view: 'products', target: 'product-catalog', eyebrow: 'Productos · v0.6', title: 'Catálogo, stock y oportunidades', description: 'Además del inventario y catálogo, Oportunidades reúne faltantes de mix, adopción entre comparables y sustitutos con stock. Una selección humana puede vincularse a una lista y/o a una nota.', tip: 'La confianza describe evidencia; no es probabilidad de compra y nunca registra que el producto fue ofrecido.' },
  { view: 'products', target: 'vector-explorer', eyebrow: 'Productos', title: 'Explorá los 33 vectores', description: 'Las dimensiones se agrupan por especie, edad y porte, posicionamiento, tipo de producto, necesidades y sabores. Cada señal conserva evidencia auditable.', tip: 'Podés volver a la ficha de cualquier producto desde la flecha de su fila.' },
  { view: 'routes', target: 'route-picker', eyebrow: 'Rutas de reparto · v0.7', title: 'Leé facturas y fojas antes de armar el recorrido', description: 'Filtrá facturas por período, localidad y estado. Varias facturas del mismo cliente forman una parada; cada comprobante aclara si está sin asignar, en foja abierta o en foja cerrada.', tip: '“Foja cerrada” confirma el cierre de la carga en GESI, no que el cliente haya recibido la mercadería.' },
  { view: 'settings', target: 'portfolio-rules', eyebrow: 'Reglas de cartera', title: 'Entendé el universo de clientes', description: 'Activo GESI y pertenencia a Salice son dos campos distintos. Los casos ambiguos quedan marcados para revisión, sin perderse ni excluirse solos.', tip: 'Esta decisión debe validarse con el jefe de Salice antes de endurecer el filtro.' },
  { view: 'settings', target: 'settings-tutorial', eyebrow: 'Final', title: 'Ya conocés la v0.8.7', description: 'El recorrido incorpora la gestión comercial liviana, rutas y fojas, el Centro de reportes, filtros y vistas guardadas, exportaciones y la lectura renovada de Mars, NutriPet y Baires.', tip: 'La aplicación simplifica y conecta información; no reemplaza la comunicación cotidiana de la oficina.' },
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
