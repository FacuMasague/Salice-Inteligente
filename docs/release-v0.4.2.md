# Identidad de clientes y directorio · v0.4.2

## Alcance

La v0.4.2 hace explícita y uniforme la identidad visible de los clientes y corrige la distribución de controles de la ventana `Clientes`. No cambia universos, métricas, saldos ni datos de GESI.

## Regla de nombres

GESI entrega dos campos distintos y la interfaz los conserva sin intercambiarlos:

- `name`: razón social, título principal del cliente;
- `tradeName`: nombre de fantasía, subtítulo opcional.

El nombre de fantasía se omite cuando coincide con la razón social ignorando mayúsculas, minúsculas y espacios externos. Si una captura excepcional no contiene razón social, la interfaz usa el nombre de fantasía como respaldo visible; no modifica el snapshot ni inventa una razón social.

La regla se centraliza en `src/lib/client-name.ts` y se aplica también al orden alfabético, iniciales, etiquetas accesibles y entidades navegables. Las búsquedas siguen aceptando ambos campos.

## Ventana Clientes

La búsqueda ocupa una fila completa, los seis filtros comparten una grilla propia y las vistas guardadas quedan en una tercera franja. En escritorio se muestran seis columnas; el diseño reduce a tres y luego a una según el ancho disponible. La tabla mantiene desplazamiento horizontal deliberado y amplía la primera columna para razones sociales extensas.

## Verificación de cierre

- prueba unitaria de razón social, nombre de fantasía, deduplicación y respaldo;
- `pnpm test`;
- `pnpm run build`;
- `pnpm run audit:data`;
- `pnpm run audit:platform`;
- revisión visual de Clientes en escritorio y móvil, más búsqueda global y perfil de cliente.
