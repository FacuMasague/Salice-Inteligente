import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';

export type TutorialView = 'map' | 'agenda' | 'clients' | 'sellers' | 'finance' | 'products' | 'brands' | 'routes' | 'sales-explorer' | 'receivables' | 'goals' | 'reports' | 'spt' | 'commercial-sales' | 'mars' | 'nutripet' | 'baires' | 'non-buyers' | 'pending-balances' | 'settings';

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
  { view: 'agenda', target: 'agenda-workstation', eyebrow: 'Gestiones comerciales', title: 'Del dato a la acción comercial', description: 'Administración reúne prioridades algorítmicas y tareas programadas para visitas, llamadas y ofertas. Las promesas y cobranzas se trabajan en Cuentas por cobrar.', tip: 'Una gestión sólo cuenta como realizada cuando alguien la registra.' },
  { view: 'clients', target: 'clients-directory', eyebrow: 'Clientes', title: 'Compará señales sin confundirlas', description: 'La lista separa estado GESI, pertenencia Salice, riesgo de cobranza C, oportunidad comercial O, prioridad P y evolución de compra contra los 90 días anteriores.', tip: 'Mayor crecimiento y Mayor caída usan un umbral de 30%; marcá con el tilde lo que ya revisaste.' },
  { view: 'sellers', target: 'sellers-overview', eyebrow: 'Vendedores', title: 'Entendé cada cartera comercial', description: 'La ventana reúne clientes asignados, ventas, deuda, riesgo, oportunidades, comportamiento de pago, territorio y próximas prioridades por vendedor.', tip: 'Los nombres de vendedor en tablas operativas abren directamente esta misma ficha.' },
  { view: 'finance', target: 'finance-summary', eyebrow: 'Cartera', title: 'Priorizá la cobranza', description: 'Los resúmenes responden a los filtros y usan sólo comprobantes de clientes activos. Cada factura abre su panel completo y PDF.', tip: 'Combiná bandas de tiempo hasta el vencimiento y de antigüedad vencida según la tarea del día.' },
  { view: 'sales-explorer', target: 'sales-explorer-overview', eyebrow: 'Administración', title: 'Explorá cada venta hasta el comprobante', description: 'Fecha, vendedor, cliente, producto, marca, rubro, canal y zona recalculan el mismo universo. Desde un indicador podés bajar al período, cliente o producto y finalmente al comprobante.', tip: 'Guardá las combinaciones que la oficina usa con frecuencia y exportá el detalle filtrado.' },
  { view: 'receivables', target: 'receivables-overview', eyebrow: 'Cuentas por cobrar', title: 'Convertí la cartera en una bandeja de trabajo', description: 'Los saldos y vencimientos provienen de GESI. Responsable, estado, promesa, próximo seguimiento y comentarios viven por separado y conservan un historial auditable.', tip: 'Los cuadrantes filtran la bandeja; el lápiz de cada fila es el único acceso de edición.' },
  { view: 'goals', target: 'goals-overview', eyebrow: 'Objetivos', title: 'Versioná el plan antes de cambiarlo', description: 'Los objetivos se editan en un borrador clonado. Sólo una activación explícita modifica el plan que consume Reporte General; las versiones anteriores quedan archivadas.', tip: 'Excel conserva el detalle y PDF resume el plan y su cumplimiento.' },
  { view: 'reports', target: 'reports-overview', eyebrow: 'Reporte General', title: 'Seguí el resultado frente al objetivo', description: 'La pantalla reúne Objetivos kilos, Marcas estratégicas y Autoservicio. Mes, vendedor, rubro y marca recalculan resultado, plan, cumplimiento, evolución y desgloses.', tip: 'Las ventas reales vienen de GESI; el plan comercial se conserva como configuración separada.' },
  { view: 'reports', target: 'reports-overview', eyebrow: 'Lectura del plan', title: 'Compará períodos equivalentes', description: 'El mes en curso se compara contra el mismo corte del mes y año anterior. La proyección es lineal y se presenta como referencia, no como pronóstico.', tip: 'Pasá por cada barra de Evolución para ver real, objetivo y cumplimiento exactos.' },
  { view: 'spt', target: 'spt-overview', eyebrow: 'Reporte SPT', title: 'Compará volumen con períodos equivalentes', description: 'Este tablero calcula el universo SPT directamente desde GESI y compara kilos del mes contra la misma cantidad de días del mes y año anterior. Los filtros actualizan resumen, vendedores y trimestres.', tip: '91% significa que el volumen equivale al 91% de la base, es decir, una baja cercana al 9%.' },
  { view: 'commercial-sales', target: 'commercial-sales-overview', eyebrow: 'Ventas · Comercial', title: 'Leé el negocio sin depender de Power BI', description: 'Esta pantalla replica el reporte comercial con datos capturados desde GESI: venta neta, comparación equivalente, negocios, evolución y matriz de marcas y productos.', tip: 'Elegí vista mensual o anual; el período, vendedor, rubro, marca y grupo recalculan toda la pantalla.' },
  { view: 'mars', target: 'mars-overview', eyebrow: 'Reporte Mars', title: 'Seguimiento del proveedor por períodos propios', description: 'Mars trabaja con trece períodos comerciales. Esta pantalla compara volumen, clientes, marcas y quarters sin confundirlos con meses calendario.', tip: 'Alterná entre sucursales de cliente y cuentas únicas para entender por qué las dos coberturas son distintas.' },
  { view: 'nutripet', target: 'nutripet-overview', eyebrow: 'Reporte NutriPet', title: 'Volumen y cobertura por mes calendario', description: 'NutriPet combina kilos, clientes, acumulados, trimestres, marcas y productos usando el universo conciliado directamente con GESI.', tip: 'El gráfico histórico conserva siempre los últimos trece meses; año y mes definen las tarjetas, trimestres y tablas de detalle.' },
  { view: 'baires', target: 'baires-overview', eyebrow: 'Reporte Baires', title: 'Especializado y Masivo en una sola lectura', description: 'Baires reúne kilos, clientes, acumulados, trimestres, marcas y subrubros de Baires SPT y Baires Masivo usando datos directos de GESI.', tip: 'El segmento permite analizar Especializado, Masivo o ambos sin cambiar el universo Salice.' },
  { view: 'non-buyers', target: 'non-buyers-overview', eyebrow: 'Cuentas no compradoras', title: 'Detectá oportunidades de recuperación', description: 'Las vistas de cuentas y marcas comparan actividad en 180 días contra ausencia de venta neta positiva durante los últimos 30. Vendedor, grupo, rubro y marca recalculan el universo completo.', tip: 'La tasa usa como denominador quienes compraron en 90 días; el detalle permite alternar entre todo el universo y sólo los casos sin compra.' },
  { view: 'pending-balances', target: 'pending-balances-overview', eyebrow: 'Saldos Pendientes', title: 'Relacioná deuda, vencimiento y venta reciente', description: 'La pantalla separa saldo pendiente y vencido, muestra antigüedad, forma de pago y compara la deuda con las ventas brutas de los últimos 30 días.', tip: '“Sin ventas 30d” reemplaza el Infinity del reporte original: indica presión de cobranza sin una base comercial reciente.' },
  { view: 'brands', target: 'brands-directory', eyebrow: 'Marcas', title: 'Abrí el desempeño completo de una marca', description: 'El directorio reúne venta y unidades de 90 días, productos, stock, rotación, familias y última venta. Cada producto conserva acceso directo a su ficha.', tip: 'Cuando veas un nombre de marca en otra pantalla, podés usarlo para volver a esta ficha.' },
  { view: 'products', target: 'product-catalog', eyebrow: 'Productos', title: 'Catálogo, stock y similitud', description: 'Seleccioná un producto para ver marca, línea, venta, compradores, cobertura, sus rasgos principales y alternativas cercanas.', tip: 'El comparador v2.1 pondera especie, edad, porte, necesidades y clasificación comercial, e informa su confianza.' },
  { view: 'products', target: 'vector-explorer', eyebrow: 'Productos', title: 'Explorá los 33 vectores', description: 'Las dimensiones se agrupan por especie, edad y porte, posicionamiento, tipo de producto, necesidades y sabores. Cada señal conserva evidencia auditable.', tip: 'Podés volver a la ficha de cualquier producto desde la flecha de su fila.' },
  { view: 'routes', target: 'route-picker', eyebrow: 'Rutas', title: 'Armá una jornada posible', description: 'Elegí vendedor, duración de visita y jornada máxima. La estimación agrupa primero por corredor y avisa si el recorrido no parece cumplible.', tip: 'La distancia sigue siendo estimada: validá tránsito y horarios antes de salir.' },
  { view: 'settings', target: 'portfolio-rules', eyebrow: 'Reglas de cartera', title: 'Entendé el universo de clientes', description: 'Activo GESI y pertenencia a Salice son dos campos distintos. Los casos ambiguos quedan marcados para revisión, sin perderse ni excluirse solos.', tip: 'Esta decisión debe validarse con el jefe de Salice antes de endurecer el filtro.' },
  { view: 'settings', target: 'settings-tutorial', eyebrow: 'Final', title: 'Ya conocés la v0.4.3', description: 'El tutorial queda disponible para repetirlo. Configuración también documenta métricas, universos, frescura, calidad y persistencia local.', tip: 'La operación diaria sigue siendo algorítmica, auditable y explicable.' },
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
