# Captura de inventario con sucursal cero

Fecha: 27 de agosto de 2026.

## Causa comprobada

La actualización nocturna se detuvo en captura, antes de activar el manifiesto.
GESI entregó una fila con empresa 3, almacén 2 y sucursal 0, existencia física
cero, pedidos pendientes y disponibilidad negativa. La lectura directa de la
fuente reprodujo esa estructura; el maestro `Almacenes/GetList` confirmó que el
almacén 2 pertenece a la sucursal 3.

La captura anterior sólo podía completar un alcance omitido cuando las seis
cantidades U1/U2 eran exactamente cero. Por eso bloqueó correctamente la fila
al no disponer de evidencia de su sucursal. No fue un timeout y no correspondía
activar la cadena de reintentos horarios.

## Corrección

- Se consulta el maestro de almacenes con paginación estricta, usando la sesión
  de empresa 3/sucursal 3. Sólo se conserva el registro del almacén 2.
- Una fila con empresa 3 y almacén 2 explícitos, sucursal exactamente 0 y seis
  cantidades numéricas puede resolver su sucursal exclusivamente si existe un
  único registro del maestro que confirma almacén 2/sucursal 3.
- Se mantienen intactos stock físico, pedidos y disponibilidad, incluidos los
  negativos. No se infiere empresa, no se suman otros depósitos ni se rellena
  una cantidad ausente.
- La fila conserva `saliceSourceSucursalID`; la captura conserva el maestro en
  `masters.inventoryWarehouses` y el contador `inventoryBranchResolvedRows`.
- La auditoría comprueba nuevamente esa evidencia y el contador. Una captura
  reutilizada también debe verificar su evidencia contra el maestro consultado.
- El inventario se valida antes de descargar los saldos y el histórico de ventas,
  para detener cuanto antes una captura cuyo alcance no se puede comprobar.

Una empresa ajena, el marcador global 65535 con cantidades no nulas, otro
almacén, una sucursal extranjera, cantidades incompletas o un maestro ambiguo
continúan bloqueando el candidato. También se rechaza ahora un alcance no
numérico o ausente que antes podía atravesar este control por comparaciones con
`NaN`; la auditoría posterior ya exigía el alcance exacto.

Los campos de evidencia son opcionales para mantener la lectura de capturas
anteriores. No cambian las reglas comerciales, los horarios, los reintentos,
los roles, la persistencia operativa ni la activación atómica.

## Verificación y publicación

Las pruebas usan productos, cantidades y maestros sintéticos. Cubren el caso
de sucursal cero, conservación de valores, ausencia y contradicción de evidencia,
rechazo de otros alcances, cantidades inválidas, duplicados y reutilización.

Antes de publicar: ejecutar `pnpm test`, `pnpm run build` y `git diff --check`.
Verificación local completada: 417 pruebas aprobadas, 7 conciliaciones históricas
omitidas por no disponer del paquete exacto, TypeScript y build correctos, y
`git diff --check` sin errores. Las pruebas HTTP requirieron permiso para abrir
un puerto local; las escrituras operativas de pruebas usaron bases temporales.

La consulta de verificación a GESI es de sólo lectura y no activa un paquete.
La comprobación del 27 de agosto recibió 13.418 filas: 13.417 productos válidos
y una fila sin producto, excluida por la regla existente. Una fila requirió
resolver su sucursal contra el maestro; las seis cantidades originales se
conservaron y las 13.417 filas resultantes quedaron dentro de 3/3/2. Esto valida
la captura de inventario, no las etapas posteriores de una actualización completa.

Para verificar recuperación en producción será necesario publicar con autorización
y completar después una actualización íntegra con todas sus auditorías.
