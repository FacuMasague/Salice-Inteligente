# Salice Inteligente v1.4.1

## Objetivo

La v1.4.1 corrige el cambio de mes de los reportes. El período vigente se determina mediante la fecha del paquete de datos actualizado en `America/Argentina/Buenos_Aires`, no mediante la última factura ni la existencia de objetivos comerciales.

## Comportamiento

- Reporte General abre el mes del paquete aunque todavía no tenga objetivos; en ese caso conserva los resultados reales, muestra objetivo cero y no calcula un porcentaje de cumplimiento.
- Ventas Comercial, SPT, NutriPet y Baires incorporan el mes vigente aunque aún no tenga movimientos.
- Mars resuelve del mismo modo su período comercial vigente.
- Un mes anterior queda cerrado de forma natural cuando el paquete ya avanzó al mes siguiente.
- Las comparaciones parciales utilizan el mismo día calendario del paquete.
- La fecha de captura se interpreta en el horario operativo de Argentina y nunca puede retroceder respecto de la última fecha de movimiento.

La corrección no modifica universos, vendedores, productos, objetivos históricos ni datos persistentes.

## Verificación

Se agregó un caso sintético con paquete actualizado el 3 de agosto, última venta en julio y ausencia de objetivos de agosto. Los reportes seleccionan agosto, muestran importes reales en cero cuando corresponde y Reporte General continúa disponible sin objetivo.

```bash
pnpm test
pnpm run build
```
