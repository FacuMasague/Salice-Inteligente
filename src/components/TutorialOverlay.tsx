import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';

export type TutorialView = 'map' | 'agenda' | 'clients' | 'sellers' | 'finance' | 'products' | 'brands' | 'routes' | 'sales-explorer' | 'receivables' | 'report-center' | 'reports' | 'spt' | 'commercial-sales' | 'mars' | 'nutripet' | 'baires' | 'non-buyers' | 'pending-balances' | 'settings';

export interface TutorialStep {
  view: TutorialView;
  target: string;
  eyebrow: string;
  title: string;
  description: string;
  details: string[];
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
    description: 'Un recorrido práctico por mapa, clientes, vendedores, productos, marcas y rutas, con criterios para interpretar cada dato.',
    steps: [
      { view: 'map', target: 'map-kpis', eyebrow: 'Centro operativo', title: 'Empezá por el pulso comercial', description: 'Los indicadores superiores resumen la cartera activa y mantienen separadas las ventas, la cobranza y las oportunidades para que cada señal conserve su significado.', details: ['Leé primero el período y la fecha de corte: explican hasta qué día llegan las ventas y los saldos.', 'Usá cada indicador como punto de partida y después bajá al mapa o al cliente; no sumes métricas que representan universos distintos.'], tip: 'Los clientes inactivos siguen disponibles como historial, pero no alteran los indicadores operativos.' },
      { view: 'map', target: 'map-filters', eyebrow: 'Mapa', title: 'Elegí qué clientes querés ver', description: 'Los filtros permiten reducir el territorio a una pregunta concreta sin cambiar los datos originales.', details: ['Combiná estado del cliente, vendedor, localidad, ubicación corregida y señales de cobranza para preparar una revisión.', 'Los puntos cercanos se agrupan automáticamente: el número del grupo indica cuántos clientes hay y se separa al acercar el mapa.'], tip: 'Restablecé los filtros antes de comparar dos zonas para no arrastrar una selección anterior.' },
      { view: 'map', target: 'client-panel', eyebrow: 'Ficha del cliente', title: 'Abrí toda la información desde el mapa', description: 'La ficha concentra la identidad comercial, compras, cuenta corriente, oportunidades y seguimiento humano del cliente seleccionado.', details: ['Recorré las pestañas para separar información comercial, financiera y notas; una señal no reemplaza a la otra.', 'Revisá la advertencia de ubicación antes de usar el punto: las coordenadas corregidas son aproximadas y conservan el dato original para auditoría.'], tip: 'Una ubicación aproximada puede verse en el mapa, pero nunca se utiliza para calcular rutas.' },
      { view: 'clients', target: 'clients-directory', eyebrow: 'Clientes', title: 'Compará la cartera en una sola tabla', description: 'El directorio ayuda a pasar de una revisión general a clientes concretos usando un mismo conjunto de filtros y columnas comparables.', details: ['Buscá por nombre o código y combiná vendedor, localidad, estado y ubicación para acotar la lista.', 'Ordená las columnas de ventas, deuda, prioridad o última compra; al abrir una fila conservás el contexto del cliente.'], tip: 'Una prioridad alta es una señal para revisar, no una decisión automática sobre el cliente.' },
      { view: 'sellers', target: 'sellers-overview', eyebrow: 'Vendedores', title: 'Entendé cada cartera comercial', description: 'La vista compara responsables sobre clientes activos, ventas, localidades y señales comerciales calculadas con el mismo corte.', details: ['Empezá por el resumen para detectar diferencias de escala y luego seleccioná un vendedor para ver su cartera.', 'Contrastá ventas con cantidad de clientes y actividad reciente: un total alto no implica necesariamente buena cobertura.'], tip: 'Las localidades describen datos observados; no son territorios asignados automáticamente.' },
      { view: 'products', target: 'product-catalog', eyebrow: 'Productos', title: 'Consultá catálogo, stock y precios', description: 'El catálogo reúne disponibilidad, ventas, kilos inferidos, rotación, demanda y precios para revisar cada producto con contexto.', details: ['Usá búsqueda, marca, grupo, demanda y rotación para separar faltantes, exceso de stock y productos con movimiento saludable.', 'Abrí la ficha para distinguir precio por unidad, precio por kilo propio y referencia por kilo de la competencia.'], tip: 'Los kilos inferidos dependen de la relación entre presentación y unidades; revisá la advertencia cuando falte peso confiable.' },
      { view: 'products', target: 'product-catalog', eyebrow: 'Productos', title: 'Interpretá demanda y oportunidades', description: 'Las recomendaciones combinan comportamiento de compra, afinidad entre productos y disponibilidad actual sin reemplazar el criterio comercial.', details: ['Demanda y rotación responden preguntas distintas: la primera estima interés observado y la segunda relaciona salida con stock.', 'Antes de contactar a un cliente, abrí la evidencia y confirmá compras recientes, vendedor responsable y disponibilidad.'], tip: 'La confianza mide la calidad de la evidencia; no es una probabilidad garantizada de compra.' },
      { view: 'brands', target: 'brands-directory', eyebrow: 'Marcas', title: 'Revisá el peso de cada marca', description: 'El directorio muestra cuánto aporta cada marca en dinero y en kilos, además de compradores, productos, stock y última venta.', details: ['Compará el porcentaje monetario con el porcentaje en kilos para distinguir volumen físico de valor comercial.', 'Abrí una marca y filtrá sus productos por grupo, actividad o búsqueda para encontrar qué referencias explican el resultado.'], tip: 'Los nombres de marca que aparecen en otras pantallas también funcionan como acceso directo a esta ficha.' },
      { view: 'routes', target: 'route-picker', eyebrow: 'Rutas', title: 'Prepará facturas y fojas', description: 'La pantalla organiza comprobantes pendientes y fojas para decidir qué clientes pueden incorporarse a una planificación.', details: ['Filtrá por fecha, foja, vendedor o cliente y verificá los comprobantes incluidos antes de calcular.', 'Varias facturas del mismo cliente se agrupan en una parada; las ubicaciones aproximadas o sin coordenadas quedan excluidas.'], tip: 'Una foja cerrada confirma el cierre de carga, no demuestra que la mercadería haya sido entregada.' },
      { view: 'routes', target: 'route-picker', eyebrow: 'Rutas', title: 'Interpretá el recorrido estimado', description: 'El orden sugerido parte y regresa a Salice y utiliza únicamente ubicaciones suficientemente confiables.', details: ['Distancia y duración son estimaciones para organizar la oficina; no representan GPS ni el trayecto realmente realizado.', 'Antes de usar el plan, confirmá restricciones de horario, capacidad, tránsito y cualquier condición conocida por reparto.'], tip: 'La optimización ayuda a ordenar paradas, pero la decisión final sigue siendo operativa.' },
    ],
  },
  administration: {
    id: 'administration',
    label: 'Administración',
    title: 'Ventas, cobranzas y seguimiento',
    description: 'Una guía detallada para investigar ventas, ordenar cobranzas y documentar el seguimiento de cada cliente.',
    steps: [
      { view: 'sales-explorer', target: 'sales-explorer-overview', eyebrow: 'Explorador de ventas', title: 'Definí primero el universo', description: 'El explorador permite investigar la venta neta desde el indicador general hasta los renglones de un comprobante sin cambiar de fuente.', details: ['Elegí período y combiná vendedor, cliente, producto, marca, rubro, canal o zona; todas las cifras se recalculan juntas.', 'Revisá los filtros activos antes de comparar resultados y usá restablecer para volver al universo completo.'], tip: 'Fecha de corte, filtros y comparación deben coincidir antes de explicar una diferencia entre pantallas.' },
      { view: 'sales-explorer', target: 'sales-explorer-overview', eyebrow: 'Explorador de ventas', title: 'Bajá del total al comprobante', description: 'Las tablas y gráficos funcionan como niveles de una misma investigación comercial.', details: ['Seleccioná una agrupación para identificar clientes o productos responsables y abrí el comprobante para verificar sus renglones exactos.', 'Guardá una vista cuando la combinación sea recurrente; las vistas quedan asociadas a tu usuario y no modifican los datos.'], tip: 'La exportación respeta el universo filtrado, no solamente las filas visibles en pantalla.' },
      { view: 'finance', target: 'finance-summary', eyebrow: 'Cartera', title: 'Priorizá la cobranza con un corte claro', description: 'Cartera resume documentos pendientes que cumplen la política central de vendedores, exclusiones y monto mínimo.', details: ['Comprobá la fecha de corte y el vendedor antes de comparar el saldo con otra pantalla.', 'Separá vencido, próximo a vencer y a vencer; cada grupo requiere una acción y urgencia distintas.'], tip: 'Un total diferente suele indicar otro universo documental, fecha de corte o filtro, no necesariamente un error de suma.' },
      { view: 'finance', target: 'finance-summary', eyebrow: 'Cartera', title: 'Revisá el documento antes de gestionar', description: 'Cada fila permite abrir el detalle comercial y el PDF disponible para confirmar origen, fechas e importes.', details: ['Usá antigüedad de lo vencido para ordenar deuda atrasada y días hasta vencimiento para anticipar próximos compromisos.', 'Confirmá cliente, comprobante y vendedor asignado en el propio documento antes de iniciar una gestión.'], tip: 'El saldo proviene de GESI; las notas y gestiones humanas no lo recalculan.' },
      { view: 'receivables', target: 'receivables-overview', eyebrow: 'Cuentas por cobrar', title: 'Documentá el seguimiento', description: 'Esta mesa de trabajo agrega contexto humano a la cartera contable sin reemplazar ni editar el saldo fuente.', details: ['Registrá responsable, estado, promesa, próximo seguimiento y comentario breve para que la próxima persona entienda qué ocurrió.', 'Usá filtros de estado y seguimiento para preparar la jornada y detectar promesas vencidas o casos sin responsable.'], tip: 'El lápiz de cada fila abre la edición y el sistema conserva autor, fecha e historial de cambios.' },
      { view: 'receivables', target: 'receivables-overview', eyebrow: 'Cuentas por cobrar', title: 'Separá promesa de pago y saldo', description: 'Una promesa representa un compromiso informado por el cliente; no equivale a un pago confirmado.', details: ['Indicá una fecha realista y el importe prometido sólo cuando exista evidencia de la conversación.', 'Cuando ingrese nueva información de GESI, contrastá la promesa con el saldo actualizado antes de cerrar la gestión.'], tip: 'Nunca marques como cobrado únicamente porque existe una promesa o comentario.' },
      { view: 'agenda', target: 'agenda-workstation', eyebrow: 'Bandeja comercial', title: 'Prepará la revisión diaria', description: 'La bandeja reúne señales comerciales, cobranzas, compromisos y notas para convertir datos dispersos en una lista de revisión.', details: ['Filtrá el tipo de cliente o señal que querés trabajar y avanzá caso por caso para evitar mezclar tareas.', 'Usá el resumen diario para identificar clientes ya revisados, pendientes y próximos seguimientos del equipo.'], tip: 'La prioridad ordena la revisión; no envía mensajes ni toma decisiones automáticamente.' },
      { view: 'agenda', target: 'agenda-workstation', eyebrow: 'Bandeja comercial', title: 'Dejá una nota útil y atribuida', description: 'Las notas complementan la evidencia automática con hechos que sólo conoce la oficina o el vendedor.', details: ['Escribí qué ocurrió, con quién se habló y cuál es el próximo paso; evitá copiar datos sensibles innecesarios.', 'El sistema guarda quién creó la nota y cuándo, para que el equipo pueda reconstruir el seguimiento.'], tip: 'Una nota documenta un hecho; no comunica al cliente ni completa automáticamente una gestión.' },
      { view: 'settings', target: 'portfolio-rules', eyebrow: 'Criterios de trabajo', title: 'Consultá las reglas cuando haya diferencias', description: 'Configuración publica las reglas de cartera, cobertura, cálculos financieros y calidad usadas por las pantallas.', details: ['Verificá vendedores admitidos, monto mínimo, clientes excluidos y tratamiento de documentos antes de cuestionar un total.', 'Consultá las advertencias de calidad y actualización para saber si estás viendo el último paquete aprobado.'], tip: 'Las reglas de negocio no deben cambiarse para hacer coincidir un resultado puntual sin una decisión explícita.' },
    ],
  },
  reports: {
    id: 'reports',
    label: 'Reportes',
    title: 'Resultados y análisis',
    description: 'Cómo elegir el informe correcto, comparar períodos equivalentes, conservar filtros y validar cada conclusión.',
    steps: [
      { view: 'report-center', target: 'report-center', eyebrow: 'Centro de reportes', title: 'Empezá por la pregunta de negocio', description: 'La portada agrupa los informes por finalidad para evitar elegir solamente por el nombre del proveedor o por costumbre.', details: ['Usá “¿Cómo estamos?” para una lectura ejecutiva y elegí un reporte específico cuando necesites explicar un indicador.', 'Leé la descripción, fuente y alcance de cada tarjeta; dos informes pueden usar períodos o universos distintos.'], tip: 'Favoritos y recientes se guardan por usuario y aceleran el acceso sin alterar filtros ni datos.' },
      { view: 'report-center', target: 'report-center', eyebrow: 'Centro de reportes', title: 'Interpretá el resumen ejecutivo', description: 'El resumen combina señales aceptadas de distintas fuentes sin sumarlas como si fueran una sola métrica.', details: ['Abrí cada sección para ver evidencia, período y navegación al reporte que sostiene la conclusión.', 'Tomá las cifras determinísticas como fuente de verdad; la explicación de IA sólo resume datos ya calculados.'], tip: 'Si una narrativa falla o queda bloqueada por calidad, los indicadores y reportes determinísticos siguen disponibles.' },
      { view: 'reports', target: 'reports-overview', eyebrow: 'Reporte general', title: 'Seguí resultados frente a objetivos', description: 'El Reporte General reúne ventas reales, objetivos versionados, cumplimiento, tendencia y composición comercial.', details: ['Elegí mes, vendedor, rubro o marca y verificá que resultado y objetivo correspondan al mismo período.', 'Usá el cumplimiento para contextualizar el avance, pero revisá también importe, composición y días transcurridos.'], tip: 'El plan comercial y las ventas reales siempre se muestran como conceptos separados.' },
      { view: 'reports', target: 'reports-overview', eyebrow: 'Reporte general', title: 'Conservá y compartí una lectura reproducible', description: 'Los controles del reporte permiten repetir exactamente una consulta sin depender de capturas de pantalla.', details: ['Guardá la vista si vas a volver a usar esos filtros y marcá el reporte como favorito para encontrarlo desde la portada.', 'Al exportar, verificá período, comparación, filtros y advertencias metodológicas incluidas en el archivo.'], tip: 'La metodología detallada permanece plegada para no interrumpir la lectura cotidiana, pero siempre está disponible.' },
      { view: 'spt', target: 'spt-overview', eyebrow: 'Volumen SPT', title: 'Compará kilos en períodos equivalentes', description: 'Volumen SPT mide kilos comerciales y compara el avance contra cortes temporales equivalentes.', details: ['En un mes abierto, la comparación usa la misma cantidad de días del mes anterior y del año anterior.', 'Filtrá empresa, vendedor o dimensión disponible y comprobá que el total cambie junto con todos los desgloses.'], tip: 'El Excel exporta el informe completo y deja registrados los filtros aplicados.' },
      { view: 'commercial-sales', target: 'commercial-sales-overview', eyebrow: 'Ventas comerciales', title: 'Leé la composición del negocio', description: 'Este reporte conecta venta neta, comparación, cantidad de negocios, evolución y participación de marcas y productos.', details: ['Empezá por el total y la variación; luego observá si el cambio proviene de más operaciones, mayor valor o distinta composición.', 'Expandí una marca para identificar los productos que explican su participación sin perder el filtro general.'], tip: 'Una variación porcentual necesita siempre su importe base para evitar conclusiones exageradas.' },
      { view: 'mars', target: 'mars-overview', eyebrow: 'Mars', title: 'Respetá los períodos comerciales de Mars', description: 'El informe organiza volumen, cobertura, cuentas y marcas según el universo acordado para el proveedor.', details: ['Confirmá período actual y comparación antes de evaluar crecimiento, especialmente cuando el corte todavía está abierto.', 'Alterná sucursales, cuentas y marcas manteniendo el mismo criterio para explicar diferencias de cobertura.'], tip: 'No compares directamente un período comercial de Mars con un mes calendario sin ajustar los cortes.' },
      { view: 'nutripet', target: 'nutripet-overview', eyebrow: 'NutriPet', title: 'Analizá volumen y cobertura mensual', description: 'NutriPet presenta kilos, clientes, acumulados, trimestres, marcas y productos sobre meses calendario.', details: ['Usá acumulados para leer tendencia y el mes individual para detectar cambios recientes.', 'Filtrá marca, línea o canal y verificá que tablas, indicadores y evolución reconcilien con el total seleccionado.'], tip: 'Recorré el gráfico de cobertura para consultar el valor y corte de cada mes.' },
      { view: 'baires', target: 'baires-overview', eyebrow: 'Baires', title: 'Compará Especializado y Masivo', description: 'El reporte separa los dos segmentos y muestra volumen, clientes, marcas, subrubros y evolución bajo un mismo corte.', details: ['Consultá primero el total y después alterná cada segmento para identificar cuál explica la diferencia.', 'Revisá clientes y composición junto con kilos: más volumen puede venir de distinta mezcla comercial.'], tip: 'El selector de segmento recalcula toda la vista; comprobá su estado antes de citar una cifra.' },
      { view: 'non-buyers', target: 'non-buyers-overview', eyebrow: 'Cuentas no compradoras', title: 'Detectá recuperaciones posibles', description: 'La vista encuentra cuentas o marcas con compras históricas positivas que no registran actividad reciente dentro de la ventana definida.', details: ['Elegí si querés analizar cuentas o marcas y aplicá vendedor, grupo, rubro o marca para asignar la revisión.', 'Abrí el detalle para confirmar última compra, importe histórico y condición actual antes de tratar el caso como oportunidad.'], tip: 'Ausencia de compra no explica el motivo; requiere validación comercial antes de actuar.' },
      { view: 'pending-balances', target: 'pending-balances-overview', eyebrow: 'Saldos pendientes', title: 'Relacioná deuda y venta reciente', description: 'El informe resume cartera abierta por vendedor, forma de pago y estado, y compara el saldo con ventas recientes cuando existe base suficiente.', details: ['Separá saldo total, vencido y a vencer; después ordená por antigüedad o presión sobre ventas según la tarea.', 'Usá Cuentas por cobrar para trabajar el cliente y registrar gestiones; este reporte está pensado como resumen analítico.'], tip: '“Sin ventas 30 días” indica que no existe una base comercial reciente para calcular la relación, no que el saldo sea cero.' },
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

  const popoverWidth = Math.min(430, window.innerWidth - 32);
  const popoverHeight = 390;
  const popoverLeft = focus
    ? Math.max(16, Math.min(window.innerWidth - popoverWidth - 16, focus.left + focus.width / 2 - popoverWidth / 2))
    : Math.max(16, (window.innerWidth - popoverWidth) / 2);
  const popoverTop = focus
    ? focus.top + focus.height + popoverHeight + 14 < window.innerHeight
      ? focus.top + focus.height + 14
      : Math.max(16, focus.top - popoverHeight - 14)
    : Math.max(20, window.innerHeight / 2 - popoverHeight / 2);
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
        <div className="tutorial-details"><strong>Cómo aprovechar esta pantalla</strong><ul>{step.details.map((detail) => <li key={detail}>{detail}</li>)}</ul></div>
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
