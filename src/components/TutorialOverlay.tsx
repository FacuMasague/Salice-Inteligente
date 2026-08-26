import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';

export type TutorialView = 'home' | 'map' | 'agenda' | 'clients' | 'sellers' | 'finance' | 'products' | 'brands' | 'routes' | 'sales-explorer' | 'receivables' | 'report-center' | 'reports' | 'spt' | 'commercial-sales' | 'mars' | 'nutripet' | 'baires' | 'non-buyers' | 'pending-balances' | 'settings';

export interface TutorialStep {
  view: TutorialView;
  target: string;
  eyebrow: string;
  title: string;
  description: string;
  details: string[];
  tip: string;
}

export type TutorialSection = 'daily-work' | 'clients-sales' | 'planning' | 'reports';

export interface TutorialDefinition {
  id: TutorialSection;
  label: string;
  title: string;
  description: string;
  steps: TutorialStep[];
}

export const TUTORIALS: Record<TutorialSection, TutorialDefinition> = {
  'clients-sales': {
    id: 'clients-sales',
    label: 'Clientes y ventas',
    title: 'Cartera, ventas y catálogo',
    description: 'Un recorrido por clientes, vendedores, ventas, productos y marcas para pasar del panorama comercial a la evidencia concreta.',
    steps: [
      { view: 'clients', target: 'clients-directory', eyebrow: 'Clientes', title: 'Compará la cartera en una sola tabla', description: 'El directorio ayuda a pasar de una revisión general a clientes concretos usando un mismo conjunto de filtros y columnas comparables.', details: ['Buscá por nombre o código y combiná vendedor, localidad, estado y ubicación para acotar la lista.', 'Ordená las columnas de ventas, deuda, prioridad o última compra; al abrir una fila conservás el contexto del cliente.'], tip: 'Una prioridad alta es una señal para revisar, no una decisión automática sobre el cliente.' },
      { view: 'sellers', target: 'sellers-overview', eyebrow: 'Vendedores', title: 'Entendé cada cartera comercial', description: 'La vista compara responsables sobre clientes activos, ventas, localidades y señales comerciales calculadas con el mismo corte.', details: ['Empezá por el resumen para detectar diferencias de escala y luego seleccioná un vendedor para ver su cartera.', 'Contrastá ventas con cantidad de clientes y actividad reciente: un total alto no implica necesariamente buena cobertura.'], tip: 'Las localidades describen datos observados; no son territorios asignados automáticamente.' },
      { view: 'sales-explorer', target: 'sales-explorer-overview', eyebrow: 'Ventas', title: 'Definí primero qué querés analizar', description: 'El explorador permite investigar la venta neta desde el indicador general hasta los renglones de un comprobante sin cambiar de fuente.', details: ['Elegí período y combiná vendedor, cliente, producto, marca, rubro, canal o zona; todas las cifras se recalculan juntas.', 'Revisá los filtros activos antes de comparar resultados y usá restablecer para volver a la selección completa.'], tip: 'Fecha de corte, filtros y comparación deben coincidir antes de explicar una diferencia entre pantallas.' },
      { view: 'sales-explorer', target: 'sales-explorer-overview', eyebrow: 'Ventas', title: 'Bajá del total al comprobante', description: 'Las tablas y gráficos funcionan como niveles de una misma investigación comercial y conservan el contexto de la selección.', details: ['Seleccioná una agrupación para identificar clientes o productos responsables y abrí el comprobante para verificar sus renglones exactos.', 'Guardá una vista cuando la combinación sea recurrente; las vistas quedan asociadas a tu usuario y no modifican los datos.'], tip: 'La exportación respeta los filtros aplicados, no solamente las filas visibles en pantalla.' },
      { view: 'products', target: 'product-catalog', eyebrow: 'Productos', title: 'Consultá catálogo, stock y precios', description: 'El catálogo reúne disponibilidad, ventas, kilos inferidos, rotación, demanda y precios para revisar cada producto con contexto.', details: ['Usá búsqueda, marca, grupo, demanda y rotación para separar faltantes, exceso de stock y productos con movimiento saludable.', 'Abrí la ficha para distinguir precio por unidad, precio por kilo propio y referencia por kilo de la competencia.'], tip: 'Los kilos inferidos dependen de la relación entre presentación y unidades; revisá la advertencia cuando falte peso confiable.' },
      { view: 'products', target: 'product-catalog', eyebrow: 'Productos', title: 'Interpretá demanda y oportunidades', description: 'Las recomendaciones combinan comportamiento de compra, afinidad entre productos y disponibilidad actual sin reemplazar el criterio comercial.', details: ['Demanda y rotación responden preguntas distintas: la primera estima interés observado y la segunda relaciona salida con stock.', 'Antes de contactar a un cliente, abrí la evidencia y confirmá compras recientes, vendedor responsable y disponibilidad.'], tip: 'La confianza mide la calidad de la evidencia; no es una probabilidad garantizada de compra.' },
      { view: 'brands', target: 'brands-directory', eyebrow: 'Marcas', title: 'Revisá el peso de cada marca', description: 'El directorio muestra cuánto aporta cada marca en dinero y en kilos, además de compradores, productos, stock y última venta.', details: ['Compará el porcentaje monetario con el porcentaje en kilos para distinguir volumen físico de valor comercial.', 'Abrí una marca y filtrá sus productos por grupo, actividad o búsqueda para encontrar qué referencias explican el resultado.'], tip: 'Los nombres de marca que aparecen en otras pantallas también funcionan como acceso directo a esta ficha.' },
    ],
  },
  'daily-work': {
    id: 'daily-work',
    label: 'Trabajo diario',
    title: 'Inicio, bandeja y cobranzas',
    description: 'Una guía para orientarse desde Inicio, ordenar la revisión diaria y documentar cobranzas sin mezclar datos y seguimiento.',
    steps: [
      { view: 'home', target: 'home-kpis', eyebrow: 'Inicio', title: 'Empezá por el estado general', description: 'Los indicadores superiores resumen la cartera activa y mantienen separadas las ventas, la cobranza y las oportunidades para que cada señal conserve su significado.', details: ['Leé primero el período y la fecha de corte: explican hasta qué día llegan las ventas y los saldos.', 'Cada indicador es también un acceso: usalo para abrir Clientes, Ventas o Cobranzas sin buscar la sección en el menú.'], tip: 'Inicio organiza información ya calculada; no crea tareas ni modifica ningún estado.' },
      { view: 'finance', target: 'finance-summary', eyebrow: 'Cobranzas · Comprobantes', title: 'Priorizá la cobranza con un corte claro', description: 'Comprobantes resume los documentos pendientes incluidos en la política comercial y permite ordenarlos por urgencia.', details: ['Comprobá la fecha de corte y el vendedor antes de comparar el saldo con otra pantalla.', 'Separá vencido, próximo a vencer y a vencer; cada grupo requiere una acción y urgencia distintas.'], tip: 'Un total diferente suele indicar otra selección, fecha de corte o filtro, no necesariamente un error de suma.' },
      { view: 'finance', target: 'finance-summary', eyebrow: 'Comprobantes', title: 'Revisá el documento antes de gestionar', description: 'Cada fila permite abrir el detalle comercial y el PDF disponible para confirmar origen, fechas e importes.', details: ['Usá antigüedad de lo vencido para ordenar deuda atrasada y días hasta vencimiento para anticipar próximos compromisos.', 'Confirmá cliente, comprobante y vendedor asignado en el propio documento antes de iniciar una gestión.'], tip: 'Las notas y gestiones humanas no recalculan el saldo pendiente.' },
      { view: 'receivables', target: 'receivables-overview', eyebrow: 'Cobranzas · Clientes', title: 'Documentá el seguimiento', description: 'La pestaña Clientes agrega contexto humano a la cartera contable sin reemplazar ni editar el saldo fuente.', details: ['Registrá responsable, estado, promesa, próximo seguimiento y comentario breve para que la próxima persona entienda qué ocurrió.', 'Usá filtros de estado y seguimiento para preparar la jornada y detectar promesas vencidas o casos sin responsable.'], tip: 'El lápiz de cada fila abre la edición y el sistema conserva autor, fecha e historial de cambios.' },
      { view: 'receivables', target: 'receivables-overview', eyebrow: 'Clientes', title: 'Separá promesa de pago y saldo', description: 'Una promesa representa un compromiso informado por el cliente; no equivale a un pago confirmado.', details: ['Indicá una fecha realista y el importe prometido sólo cuando exista evidencia de la conversación.', 'Cuando se actualicen los datos, contrastá la promesa con el saldo antes de cerrar la gestión.'], tip: 'Nunca marques como cobrado únicamente porque existe una promesa o comentario.' },
      { view: 'agenda', target: 'agenda-workstation', eyebrow: 'Bandeja comercial', title: 'Prepará la revisión diaria', description: 'La bandeja reúne señales comerciales, cobranzas, compromisos y notas para convertir datos dispersos en una lista de revisión.', details: ['Filtrá el tipo de cliente o señal que querés trabajar y avanzá caso por caso para evitar mezclar tareas.', 'Usá el resumen diario para identificar clientes ya revisados, pendientes y próximos seguimientos del equipo.'], tip: 'La prioridad ordena la revisión; no envía mensajes ni toma decisiones automáticamente.' },
      { view: 'agenda', target: 'agenda-workstation', eyebrow: 'Bandeja comercial', title: 'Dejá una nota útil y atribuida', description: 'Las notas complementan la evidencia automática con hechos que sólo conoce la oficina o el vendedor.', details: ['Escribí qué ocurrió, con quién se habló y cuál es el próximo paso; evitá copiar datos sensibles innecesarios.', 'El sistema guarda quién creó la nota y cuándo, para que el equipo pueda reconstruir el seguimiento.'], tip: 'Una nota documenta un hecho; no comunica al cliente ni completa automáticamente una gestión.' },
    ],
  },
  planning: {
    id: 'planning',
    label: 'Planificación',
    title: 'Mapa operativo y rutas',
    description: 'Un recorrido para revisar ubicaciones, seleccionar fojas y entender los límites de los recorridos estimados antes de usarlos.',
    steps: [
      { view: 'map', target: 'map-filters', eyebrow: 'Mapa operativo', title: 'Elegí qué clientes querés ver', description: 'Los filtros permiten reducir el territorio a una pregunta concreta sin cambiar los datos originales ni ocultar advertencias de ubicación.', details: ['Combiná estado del cliente, vendedor, localidad, ubicación corregida y señales de cobranza para preparar una revisión.', 'Los puntos cercanos se agrupan automáticamente: el número del grupo indica cuántos clientes hay y se separa al acercar el mapa.'], tip: 'Restablecé los filtros antes de comparar dos zonas para no arrastrar una selección anterior.' },
      { view: 'map', target: 'client-panel', eyebrow: 'Mapa operativo', title: 'Confirmá la calidad de la ubicación', description: 'La ficha permite distinguir una coordenada exacta, una aproximación por localidad y un cliente todavía pendiente de revisión.', details: ['Revisá la advertencia antes de interpretar el punto y conservá la diferencia entre dirección declarada y posición aproximada.', 'Usá compras, cuenta corriente y notas como contexto separado; ninguna de esas señales vuelve utilizable una coordenada dudosa.'], tip: 'Una ubicación aproximada puede verse en el mapa, pero nunca se utiliza para calcular rutas.' },
      { view: 'routes', target: 'route-picker', eyebrow: 'Rutas', title: 'Prepará facturas y fojas', description: 'La pantalla organiza comprobantes pendientes y fojas para decidir qué clientes pueden incorporarse a una planificación operativa.', details: ['Filtrá por fecha, foja, vendedor o cliente y verificá los comprobantes incluidos antes de calcular.', 'Varias facturas del mismo cliente se agrupan en una parada; las ubicaciones aproximadas o sin coordenadas quedan excluidas.'], tip: 'Una foja cerrada confirma el cierre de carga, no demuestra que la mercadería haya sido entregada.' },
      { view: 'routes', target: 'route-picker', eyebrow: 'Rutas', title: 'Interpretá el recorrido estimado', description: 'El orden sugerido parte y regresa a Salice y utiliza únicamente ubicaciones suficientemente confiables para el cálculo.', details: ['Distancia y duración son estimaciones para organizar la oficina; no representan GPS ni el trayecto realmente realizado.', 'Antes de usar el plan, confirmá restricciones de horario, capacidad, tránsito y cualquier condición conocida por reparto.'], tip: 'La optimización ayuda a ordenar paradas, pero la decisión final sigue siendo operativa.' },
    ],
  },
  reports: {
    id: 'reports',
    label: 'Reportes',
    title: 'Resultados y análisis',
    description: 'Cómo elegir el informe correcto, comparar períodos equivalentes, conservar filtros y validar cada conclusión.',
    steps: [
      { view: 'report-center', target: 'report-center', eyebrow: 'Centro de reportes', title: 'Empezá por la pregunta de negocio', description: 'La portada agrupa los informes por finalidad para evitar elegir solamente por el nombre del proveedor o por costumbre.', details: ['Usá “¿Cómo estamos?” para una lectura ejecutiva y elegí un reporte específico cuando necesites explicar un indicador.', 'Leé la descripción, fuente y alcance de cada tarjeta; dos informes pueden incluir operaciones o períodos distintos.'], tip: 'Favoritos y recientes se guardan por usuario y aceleran el acceso sin alterar filtros ni datos.' },
      { view: 'report-center', target: 'report-center', eyebrow: 'Centro de reportes', title: 'Interpretá el resumen ejecutivo', description: 'El resumen combina señales aceptadas de distintas fuentes sin sumarlas como si fueran una sola medida.', details: ['Abrí cada sección para ver la información, el período y el reporte que sostiene la conclusión.', 'Tomá las cifras calculadas como fuente de verdad; la explicación asistida sólo resume datos ya disponibles.'], tip: 'Si una explicación no está disponible, los indicadores y reportes calculados siguen funcionando.' },
      { view: 'reports', target: 'reports-overview', eyebrow: 'Reporte general', title: 'Seguí resultados frente a objetivos', description: 'El Reporte General reúne ventas reales, objetivos versionados, cumplimiento, tendencia y composición comercial.', details: ['Elegí mes, vendedor, rubro o marca y verificá que resultado y objetivo correspondan al mismo período.', 'Usá el cumplimiento para contextualizar el avance, pero revisá también importe, composición y días transcurridos.'], tip: 'El plan comercial y las ventas reales siempre se muestran como conceptos separados.' },
      { view: 'reports', target: 'reports-overview', eyebrow: 'Reporte general', title: 'Conservá y compartí una lectura reproducible', description: 'Los controles del reporte permiten repetir exactamente una consulta sin depender de capturas de pantalla.', details: ['Guardá la vista si vas a volver a usar esos filtros y marcá el reporte como favorito para encontrarlo desde la portada.', 'Al exportar, verificá período, comparación, filtros y advertencias metodológicas incluidas en el archivo.'], tip: 'La metodología detallada permanece plegada para no interrumpir la lectura cotidiana, pero siempre está disponible.' },
      { view: 'spt', target: 'spt-overview', eyebrow: 'Volumen SPT', title: 'Compará kilos en períodos equivalentes', description: 'Volumen SPT mide kilos comerciales y compara el avance contra cortes temporales equivalentes.', details: ['En un mes abierto, la comparación usa la misma cantidad de días del mes anterior y del año anterior.', 'Filtrá empresa, vendedor o dimensión disponible y comprobá que el total cambie junto con todos los desgloses.'], tip: 'El Excel exporta el informe completo y deja registrados los filtros aplicados.' },
      { view: 'commercial-sales', target: 'commercial-sales-overview', eyebrow: 'Ventas comerciales', title: 'Leé la composición del negocio', description: 'Este reporte conecta venta neta, comparación, cantidad de negocios, evolución y participación de marcas y productos.', details: ['Empezá por el total y la variación; luego observá si el cambio proviene de más operaciones, mayor valor o distinta composición.', 'Expandí una marca para identificar los productos que explican su participación sin perder el filtro general.'], tip: 'Una variación porcentual necesita siempre su importe base para evitar conclusiones exageradas.' },
      { view: 'mars', target: 'mars-overview', eyebrow: 'Mars', title: 'Respetá los períodos comerciales de Mars', description: 'El informe organiza volumen, cobertura, cuentas y marcas según el alcance acordado para el proveedor.', details: ['Confirmá período actual y comparación antes de evaluar crecimiento, especialmente cuando el corte todavía está abierto.', 'Alterná sucursales, cuentas y marcas manteniendo el mismo criterio para explicar diferencias de cobertura.'], tip: 'No compares directamente un período comercial de Mars con un mes calendario sin ajustar los cortes.' },
      { view: 'nutripet', target: 'nutripet-overview', eyebrow: 'NutriPet', title: 'Analizá volumen y cobertura mensual', description: 'NutriPet presenta kilos, clientes, acumulados, trimestres, marcas y productos sobre meses calendario.', details: ['Usá acumulados para leer tendencia y el mes individual para detectar cambios recientes.', 'Filtrá marca, línea o canal y verificá que tablas, indicadores y evolución reconcilien con el total seleccionado.'], tip: 'Recorré el gráfico de cobertura para consultar el valor y corte de cada mes.' },
      { view: 'baires', target: 'baires-overview', eyebrow: 'Baires', title: 'Compará Especializado y Masivo', description: 'El reporte separa los dos segmentos y muestra volumen, clientes, marcas, subrubros y evolución bajo un mismo corte.', details: ['Consultá primero el total y después alterná cada segmento para identificar cuál explica la diferencia.', 'Revisá clientes y composición junto con kilos: más volumen puede venir de distinta mezcla comercial.'], tip: 'El selector de segmento recalcula toda la vista; comprobá su estado antes de citar una cifra.' },
      { view: 'non-buyers', target: 'non-buyers-overview', eyebrow: 'Cuentas no compradoras', title: 'Detectá recuperaciones posibles', description: 'La vista encuentra cuentas o marcas con compras históricas positivas que no registran actividad reciente dentro de la ventana definida.', details: ['Elegí si querés analizar cuentas o marcas y aplicá vendedor, grupo, rubro o marca para asignar la revisión.', 'Abrí el detalle para confirmar última compra, importe histórico y condición actual antes de tratar el caso como oportunidad.'], tip: 'Ausencia de compra no explica el motivo; requiere validación comercial antes de actuar.' },
      { view: 'pending-balances', target: 'pending-balances-overview', eyebrow: 'Saldos pendientes', title: 'Relacioná deuda y venta reciente', description: 'El informe resume cartera abierta por vendedor, forma de pago y estado, y compara el saldo con ventas recientes cuando existe base suficiente.', details: ['Separá saldo total, vencido y a vencer; después ordená por antigüedad o presión sobre ventas según la tarea.', 'Usá Cobranzas para trabajar el cliente y registrar gestiones; este reporte está pensado como resumen analítico.'], tip: '“Sin ventas 30 días” indica que no existe una base comercial reciente para calcular la relación, no que el saldo sea cero.' },
    ],
  },
};

export type TaskJourneyId = 'review-client' | 'manage-collection' | 'find-document' | 'review-month';

export const TASK_JOURNEYS: Record<TaskJourneyId, TutorialDefinition> = {
  'review-client': {
    id: 'clients-sales',
    label: 'Recorrido práctico',
    title: 'Revisar un cliente',
    description: 'Encontrá una cuenta, confirmá su identidad y recorré su información sin mezclar señales distintas.',
    steps: [
      { view: 'clients', target: 'clients-directory', eyebrow: 'Paso 1', title: 'Empezá en Clientes', description: 'El directorio reúne la cartera visible con un único criterio de alcance.', details: ['Confirmá si estás viendo clientes recientes, activos o todo el historial.', 'Mirá la cantidad de resultados antes de aplicar filtros para entender desde qué universo empezás.'], tip: 'El alcance habitual se configura una vez y se comparte con las demás pantallas operativas.' },
      { view: 'clients', target: 'clients-directory', eyebrow: 'Paso 2', title: 'Buscá y confirmá la identidad', description: 'Escribí razón social, nombre de fantasía, código, localidad o vendedor y usá filtros sólo cuando ayuden a distinguir resultados.', details: ['La razón social es la identidad principal; el nombre de fantasía funciona como referencia adicional.', 'Antes de abrir, comprobá vendedor, localidad y estado para evitar trabajar otra cuenta con un nombre parecido.'], tip: 'En móvil, tocá cualquier parte de la tarjeta para abrir la ficha.' },
      { view: 'map', target: 'client-panel', eyebrow: 'Paso 3', title: 'Leé primero el resumen', description: 'La ficha separa identidad, actividad comercial, cuenta corriente, ubicación y contexto humano.', details: ['Empezá por estado, última compra, ventas y saldo; después abrí la pestaña que responda tu pregunta.', 'No interpretes oportunidad, riesgo y prioridad como una misma medida: cada una responde una pregunta distinta.'], tip: 'Un indicador ayuda a ordenar la revisión, pero no toma decisiones por la oficina.' },
      { view: 'map', target: 'client-panel', eyebrow: 'Paso 4', title: 'Verificá el dato antes de actuar', description: 'Profundizá solamente en la sección necesaria y confirmá fecha de corte, comprobantes o notas antes de continuar.', details: ['Si vas a cobrar, revisá cuenta corriente y vencimientos; si vas a vender, revisá compras, productos y disponibilidad.', 'Si necesitás una visita o entrega, confirmá si la ubicación es exacta, aproximada o todavía no utilizable.'], tip: 'Una ubicación aproximada nunca debe presentarse como una dirección exacta ni usarse para calcular rutas.' },
    ],
  },
  'manage-collection': {
    id: 'daily-work',
    label: 'Recorrido práctico',
    title: 'Registrar una gestión de cobranza',
    description: 'Cómo pasar del comprobante pendiente al seguimiento administrativo sin mezclar ambos conceptos.',
    steps: [
      { view: 'finance', target: 'finance-summary', eyebrow: 'Paso 1', title: 'Ubicá la deuda en Comprobantes', description: 'La primera pestaña de Cobranzas muestra importes y documentos pendientes con su corte correspondiente.', details: ['Buscá por razón social, comprobante o vendedor y confirmá que los filtros activos sean los esperados.', 'Separá vencido, próximo a vencer y a vencer antes de decidir la urgencia.'], tip: 'Saldo pendiente e importe original son conceptos diferentes.' },
      { view: 'finance', target: 'finance-summary', eyebrow: 'Paso 2', title: 'Confirmá el comprobante', description: 'Abrí el documento que explica el importe antes de registrar cualquier contacto o compromiso.', details: ['Verificá razón social, emisión, vencimiento, vendedor y saldo aún abierto.', 'Consultá el PDF o el detalle cuando necesites confirmar la composición del documento.'], tip: 'Una nota o promesa nunca modifica el saldo calculado.' },
      { view: 'receivables', target: 'receivables-overview', eyebrow: 'Paso 3', title: 'Pasá a Clientes', description: 'La segunda pestaña organiza el trabajo humano por cuenta sin alterar la información documental.', details: ['Buscá la misma razón social y revisá responsable, estado y último contacto.', 'Usá los filtros para detectar seguimientos exigibles, promesas vencidas o cuentas todavía sin gestionar.'], tip: 'Comprobantes y Clientes comparten Cobranzas, pero conservan responsabilidades distintas.' },
      { view: 'receivables', target: 'receivables-overview', eyebrow: 'Paso 4', title: 'Registrá sólo lo confirmado', description: 'Indicá qué ocurrió, quién queda a cargo y cuál es el próximo paso que el equipo debe ejecutar.', details: ['Cargá fecha e importe de promesa únicamente cuando el cliente los haya informado.', 'Escribí contexto breve y necesario; no copies contraseñas, secretos ni contenido sensible.'], tip: 'Una promesa documenta un compromiso, no un pago confirmado.' },
      { view: 'receivables', target: 'receivables-overview', eyebrow: 'Paso 5', title: 'Comprobá que el seguimiento quedó claro', description: 'Antes de cerrar, revisá el resumen de la cuenta y asegurate de que otra persona pueda continuar el trabajo.', details: ['Confirmá responsable, estado, próxima fecha y promesa activa si corresponde.', 'Cuando llegue una actualización de datos, contrastá nuevamente el compromiso con el saldo abierto.'], tip: 'Cerrar internamente una gestión no cancela el documento pendiente.' },
    ],
  },
  'find-document': {
    id: 'clients-sales',
    label: 'Recorrido práctico',
    title: 'Buscar un comprobante de venta',
    description: 'Cómo pasar de una pregunta comercial al detalle exacto del documento manteniendo período y filtros.',
    steps: [
      { view: 'sales-explorer', target: 'sales-explorer-overview', eyebrow: 'Paso 1', title: 'Formulá la búsqueda', description: 'Definí primero qué sabés: período, cliente, vendedor, producto, marca o importe aproximado.', details: ['Empezá con pocos filtros y agregá precisión sólo si aparecen demasiados resultados.', 'Si no conocés el día exacto, seleccioná varios períodos antes de avanzar.'], tip: 'Una búsqueda demasiado cerrada puede ocultar el documento que querés encontrar.' },
      { view: 'sales-explorer', target: 'sales-explorer-overview', eyebrow: 'Paso 2', title: 'Confirmá período y filtros', description: 'Revisá la selección visible antes de interpretar cualquier total o avanzar de nivel.', details: ['Comprobá fecha de inicio, fecha final y dimensiones comerciales activas.', 'El total, los gráficos y las tablas deben responder a la misma selección.'], tip: 'Restablecé la vista si sospechás que quedó un filtro anterior.' },
      { view: 'sales-explorer', target: 'sales-explorer-overview', eyebrow: 'Paso 3', title: 'Bajá de nivel sin perder contexto', description: 'Pasá de períodos a clientes o productos para identificar quién explica el resultado.', details: ['Podés seguir seleccionando períodos y avanzar cuando la selección esté lista.', 'Compará razón social, producto e importe antes de abrir la lista documental.'], tip: 'El nivel intermedio sirve para validar el camino; no es un total diferente.' },
      { view: 'sales-explorer', target: 'sales-explorer-overview', eyebrow: 'Paso 4', title: 'Abrí el comprobante exacto', description: 'En Comprobantes, elegí el documento y verificá sus datos y renglones disponibles.', details: ['Confirmá tipo, número, fecha, razón social, vendedor e importe.', 'Desde el detalle también podés abrir las fichas relacionadas sin perder la evidencia documental.'], tip: 'La exportación incluye la selección completa, no solamente las filas visibles.' },
    ],
  },
  'review-month': {
    id: 'reports',
    label: 'Recorrido práctico',
    title: 'Revisar cómo viene el mes',
    description: 'Un recorrido ordenado para elegir el reporte, confirmar el período y comparar resultados con objetivos.',
    steps: [
      { view: 'report-center', target: 'report-center', eyebrow: 'Paso 1', title: 'Empezá por la pregunta', description: 'La portada de Reportes agrupa las lecturas según la decisión que necesitás tomar.', details: ['Usá el resumen ejecutivo para orientarte y Reporte General para revisar objetivos y resultados.', 'Elegí un reporte específico cuando necesites profundizar en volumen, ventas, cartera o proveedores.'], tip: 'No todos los reportes usan el mismo universo o tipo de período.' },
      { view: 'report-center', target: 'report-center', eyebrow: 'Paso 2', title: 'Leé alcance y período antes de entrar', description: 'Cada tarjeta explica qué responde el reporte para evitar comparaciones entre medidas incompatibles.', details: ['Revisá si trabaja con mes calendario, período comercial, kilos, facturación o saldos.', 'Favoritos y recientes sirven para volver más rápido sin cambiar datos ni filtros.'], tip: 'El nombre del reporte no reemplaza la lectura de su alcance.' },
      { view: 'reports', target: 'reports-overview', eyebrow: 'Paso 3', title: 'Confirmá el mes real', description: 'Reporte General ancla resultados y objetivos al mismo mes calendario del paquete actualizado.', details: ['Verificá el mes seleccionado y la fecha de corte antes de leer el avance.', 'Si el mes sigue abierto, interpretá el resultado como acumulado hasta esa fecha.'], tip: 'El mes no se desplaza por la fecha de la última factura.' },
      { view: 'reports', target: 'reports-overview', eyebrow: 'Paso 4', title: 'Compará resultado y objetivo', description: 'Revisá importes, kilos, clientes y porcentajes como medidas complementarias, no intercambiables.', details: ['Aplicá vendedor, producto o rubro y comprobá que objetivo y resultado cambien con la misma selección.', 'Si no hay objetivo cargado, usá los resultados reales y leé la advertencia en lugar de interpretar un cero ficticio.'], tip: 'El objetivo planifica; nunca reemplaza ni modifica las ventas observadas.' },
    ],
  },
};

export type GuidedExperienceId = TutorialSection | TaskJourneyId;
export const GUIDED_EXPERIENCES: Record<GuidedExperienceId, TutorialDefinition> = { ...TUTORIALS, ...TASK_JOURNEYS };

interface FocusRect { top: number; left: number; width: number; height: number }

export function TutorialOverlay({ definition, stepIndex, onBack, onNext, onClose }: { definition: TutorialDefinition; stepIndex: number; onBack: () => void; onNext: () => void; onClose: () => void }) {
  const step = definition.steps[stepIndex];
  const [focus, setFocus] = useState<FocusRect | null>(null);
  const [popoverHeight, setPopoverHeight] = useState(390);
  const popoverRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let targetScrolled = false;
    const update = () => {
      const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!target) return setFocus(null);
      if (!targetScrolled) {
        targetScrolled = true;
        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      }
      const rect = target.getBoundingClientRect();
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const left = Math.max(8, rect.left);
      const top = Math.max(8, rect.top);
      const right = Math.min(viewportWidth - 8, rect.right);
      const bottom = Math.min(viewportHeight - 8, rect.bottom);
      setFocus(right > left && bottom > top ? { top, left, width: right - left, height: bottom - top } : null);
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

  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;
    const measure = () => setPopoverHeight(popover.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(popover);
    return () => observer.disconnect();
  }, [stepIndex]);

  useEffect(() => {
    document.documentElement.classList.add('tutorial-open');
    return () => document.documentElement.classList.remove('tutorial-open');
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') onNext();
      if (event.key === 'ArrowLeft' && stepIndex > 0) onBack();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [onBack, onClose, onNext, stepIndex]);

  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const popoverWidth = Math.min(430, viewportWidth - 32);
  const popoverLeft = focus
    ? Math.max(16, Math.min(viewportWidth - popoverWidth - 16, focus.left + focus.width / 2 - popoverWidth / 2))
    : Math.max(16, (viewportWidth - popoverWidth) / 2);
  const popoverTop = focus
    ? focus.top + focus.height + popoverHeight + 14 < viewportHeight
      ? focus.top + focus.height + 14
      : Math.max(16, focus.top - popoverHeight - 14)
    : Math.max(20, viewportHeight / 2 - popoverHeight / 2);
  const finalStep = stepIndex === definition.steps.length - 1;

  return (
    <div className="tutorial-layer" aria-live="polite">
      <div className={`tutorial-blocker ${focus ? '' : 'dimmed'}`} />
      {focus && <div className="tutorial-focus" style={{ top: focus.top - 6, left: focus.left - 6, width: focus.width + 12, height: focus.height + 12 }} />}
      <section ref={popoverRef} className="tutorial-popover" role="dialog" aria-modal="true" aria-label={`Tutorial: ${step.title}`} style={{ top: popoverTop, left: popoverLeft, width: popoverWidth }}>
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
