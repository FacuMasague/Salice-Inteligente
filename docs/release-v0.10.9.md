# Salice Inteligente · v0.10.9

## Cartera por vendedor documental

- La cartera usa una lista blanca de seis vendedores reales: Andres Dominguez, Edgardo Larrea, Ignacio Carea, Ana Ottaviano, Julieta Errecart y Gonzalo Russian.
- La pertenencia se determina con el `vendedorID` de cada factura o nota de débito, no solamente con el responsable actual de la ficha del cliente.
- Cada comprobante normalizado conserva su vendedor para filtros, tablas, reportes, riesgo y totales.
- Saldos Pendientes persiste el vendedor documental y atribuye cada cliente al vendedor con mayor saldo elegible cuando interviene más de uno.
- Los datos anteriores sin vendedor por comprobante continúan siendo legibles usando como respaldo el vendedor del cliente.

Siguen vigentes el saldo mínimo de $1.000 y la exclusión de GBA M6 S.A., Consumidor Final y Salice Distribuciones S.A.

## Impacto sobre la captura disponible

Con el corte local usado para validar esta versión, la nueva regla incluye 805 comprobantes por $312.601.501,92. Excluye 49 comprobantes por $44.534.595,00 asignados a responsables genéricos u otros vendedores. Gonzalo Russian aporta 137 comprobantes por $23.640.667,75.
