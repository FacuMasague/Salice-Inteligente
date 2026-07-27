# Salice Inteligente · v0.10.7

## Bandeja comercial y explicaciones con IA

- La IA recibe el detalle completo de las señales que ya determinaron la presencia de cada cliente.
- La lectura jerarquiza el motivo principal, los factores secundarios, la oportunidad comercial disponible y una precaución específica.
- Las explicaciones deben usar evidencia del mismo cliente; una referencia cruzada bloquea el resultado.
- La interfaz deja de mostrar modelo, esfuerzo, cantidad de referencias y demás metadatos técnicos en la Bandeja comercial.
- El feedback útil, poco útil, incorrecto o incompleto queda disponible directamente en cada explicación.
- La lista traduce la prioridad numérica a muy alta, alta, media o baja sin ocultar el puntaje.
- Un nuevo filtro permite aislar cobranza y compromisos, actividad comercial, bloqueos de ventas o notas de oficina.

La selección de clientes sigue siendo determinística. La IA explica los motivos existentes, pero no agrega clientes, no modifica el orden y no crea tareas, ofertas ni visitas.

## Política de cartera

- Cartera, Cuentas por cobrar, Saldos pendientes, agenda, riesgo, totales y exportaciones sólo consideran facturas y notas de débito con saldo pendiente igual o superior a $1.000.
- GBA M6 S.A., Consumidor Final y Salice Distribuciones S.A. se excluyen del universo operativo porque son entidades internas o genéricas, no clientes comerciales.
- La política se aplica al construir una actualización y también al leer paquetes anteriores, por lo que no exige esperar al próximo refresco para corregir la vista.
- Los comprobantes pagados se conservan como historia de conducta; el mínimo afecta únicamente a la deuda abierta.
