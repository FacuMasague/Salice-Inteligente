# v0.9.1 — Productos nuevos

## Resultado

La clasificación con IA queda habilitada únicamente para productos que aparezcan después de la línea base v0.9.1 y que todavía no posean un artefacto vectorial válido.

La primera ejecución registra como línea base append-only todos los productos del catálogo activo. Un vector vacío puede ser válido: significa que las fuentes disponibles no aportan evidencia, no que el producto carezca de versión. De esta manera no se envían masivamente productos históricos.

## Entrada compacta

Cada alta recibe exclusivamente:

- identificador operativo;
- nombre y descripción;
- rubro y subrubro;
- marca;
- línea;
- familia comercial;
- grupo;
- presentación;
- cobertura y señales determinísticas disponibles.

No se envían precios, stock, ventas, clientes, snapshots ni bases completas.

## Salida y activación

Terra High propone las 33 dimensiones, confianza, evidencia por dimensión, advertencias y combinaciones explícitas.

Antes de activar el artefacto:

- el JSON debe satisfacer el esquema estricto;
- todas las dimensiones deben ser enteros de 0 a 100;
- cada dimensión positiva debe citar evidencia;
- una señal determinística fuerte no puede debilitarse silenciosamente;
- las contradicciones existentes de especie, etapa, porte y posicionamiento deben superar la auditoría vectorial.

Una salida rechazada permanece auditada y el producto conserva su clasificación determinística. Al leer el catálogo, un artefacto válido se aplica primero y las correcciones humanas se aplican después, por lo que la oficina siempre prevalece.

## Cierre verificado

- El catálogo vigente se registró como línea base sin llamadas de producto.
- Una prueba agrega una alta posterior y demuestra que sólo esa entidad se procesa.
- Después de obtener una versión válida, la misma alta deja de ser candidata.
- Las pruebas rechazan candidatos que debilitan señales fuertes.

