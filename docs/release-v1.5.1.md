# Salice Inteligente v1.5.1

## Corrección

Desde el 10 de agosto de 2026, `GetPrecios` comenzó a informar en `paginacion.totalElementos` la cantidad de códigos de producto consultados, aunque la colección `precios` sólo incluía productos con una o más definiciones disponibles. El cliente genérico interpretaba esa diferencia como una página truncada y, correctamente bajo esa interpretación, bloqueaba el paquete candidato.

La v1.5.1 incorpora un modo de paginación dispersa utilizado exclusivamente por `GetPrecios`:

- mantiene los reintentos de red y HTTP;
- recorre todas las páginas anunciadas;
- conserva todas las definiciones efectivamente devueltas;
- no exige una fila por cada código consultado;
- deja que la auditoría de captura informe los productos del catálogo sin definición de precio.

La comprobación de completitud continúa siendo estricta para movimientos, documentos, stock, saldos y los demás maestros. Una ausencia de precios se representa como dato faltante y nunca se inventa ni se reemplaza por un valor anterior durante la captura candidata.

## Evidencia operativa

Los registros de Render mostraron respuestas repetidas de 24 o 27 filas frente a 40 códigos anunciados los días 10, 11 y 12 de agosto. El manifiesto activo no fue reemplazado durante esos intentos fallidos, por lo que la protección atómica conservó el último paquete aprobado.
