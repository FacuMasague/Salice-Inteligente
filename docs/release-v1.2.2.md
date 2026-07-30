# Salice Inteligente v1.2.2

## Alcance de datos

- Empresa 3 pasa a ser el único alcance aceptado para movimientos de ventas, cobranzas, cartera, logística y reportes.
- Las sucursales 3 y 6 continúan disponibles cuando el comprobante pertenece a empresa 3.
- Via Salice MDP S.A. (cliente GESI 30033) se excluye de clientes, ventas, productos, cartera, fojas y bases de reportes derivadas.
- El universo SPT corrige una regla heredada que permitía interpretar empresa 6 como parte de Salice.
- Los maestros compartidos que no informan empresa no se eliminan automáticamente: sólo se excluyen identidades confirmadas o movimientos con empresa incompatible.

## Persistencia

La actualización reemplaza únicamente el paquete comercial activo. `operations.sqlite` permanece separado en el disco persistente, por lo que conserva usuarios, sesiones, notas, gestiones, vistas, objetivos, feedback y auditoría entre versiones y actualizaciones.

## Estabilidad de actualización

La normalización de la captura real del 29 de julio agotó los límites de 512 y 768 MB. Esa etapa recibe ahora un heap aislado de 1.024 MB; la captura continúa en 768 MB y las demás etapas en 512 MB. El procesamiento sigue siendo secuencial sobre una única instancia Standard.

## Verificación

```bash
pnpm test
pnpm run build
```
