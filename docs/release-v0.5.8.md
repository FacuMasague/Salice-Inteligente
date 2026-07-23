# Salice Inteligente v0.5.8 · Oportunidades comerciales de productos

## Objetivo

Convertir la recomendación básica del perfil del cliente en una herramienta de oficina que explique qué producto podría ofrecerse, a quién y por qué, sin inferir una venta ni registrar trabajo humano inexistente.

## Universo y corte

- Clientes activos con al menos una compra atribuible en la ventana observable del snapshot operativo de Salice. Sin mix no se genera una sugerencia artificial. Los pares comparables deben estar activos y tener pertenencia Salice confirmada.
- Productos del catálogo operativo con maestro no inactivo, estado no incompatible con la comercialización, inventario utilizable y stock U1 positivo en empresa 3, sucursal 3 y depósito 2.
- Compras y mix: 90 días observables en el snapshot activo. La ausencia significa “no aparece en esta ventana”, no “nunca compró”.
- Fuente: GESI y reglas compartidas. PBIX no participa del cálculo.

## Tipos de oportunidad

1. `Falta en el mix reciente`: producto disponible que no aparece en las compras observables del cliente y no contradice su especie dominante.
2. `Adoptado por comparables`: al menos dos cuentas comparables y 10% de la muestra compraron el producto. La interfaz muestra muestra, porcentaje y ejemplos.
3. `Sustituto ante quiebre`: un producto comprado recientemente no tiene stock positivo y existe una alternativa con compatibilidad de uso y presentación de al menos 70%, sin incompatibilidades explícitas.
4. `Stock alto para movilizar`: el producto además posee cobertura de al menos tres meses o stock sin movimiento reciente según la política compartida de inventario. Esta señal sólo refuerza una afinidad o adopción suficiente; nunca crea una recomendación por sí sola.

Una recomendación puede reunir varias señales. Stock alto no demuestra afinidad por sí solo y nunca transforma un producto incompatible en oportunidad.

## Comparables, puntaje y confianza

Los comparables se ordenan mediante solapamiento de productos comprados y coincidencias disponibles de segmento, canal, localidad y zona. Se usan como máximo 40 cuentas para evitar que una cartera genérica opaque el comportamiento cercano.

Para faltantes del mix, el puntaje combina 45% afinidad descriptiva, 35% adopción comparable, 12% señal de stock alto y 8% rotación relativa. Los sustitutos poseen un cálculo separado basado principalmente en uso y presentación. El puntaje ordena; no es probabilidad de compra.

La confianza se muestra como alta, media o limitada según amplitud del mix, tamaño de la muestra comparable y calidad del vector del producto. No se oculta una muestra pequeña detrás de un porcentaje.

## Interfaz y navegación

`Productos → Oportunidades` permite elegir una cuenta, filtrar por tipo y confianza, leer la explicación y desplegar evidencia. Cliente, vendedor, marca, producto sugerido, producto sustituido y ejemplos comparables abren sus contextos existentes. El perfil completo del cliente consume el mismo contrato.

La ficha de cada producto en `Catálogo` ofrece la lectura inversa: muestra las cinco cuentas mejor ordenadas que todavía no compraron el artículo y deja la lista completa detrás de `Ver todos`. Conserva afinidad, adopción comparable, confianza, vendedor, localidad, señal O y navegación al cliente. No recalcula el catálogo completo por cada cuenta ni introduce un puntaje diferente.

La pantalla declara expresamente que sólo incluye stock positivo y que una sugerencia no crea tareas ni gestiones. No se agregó ningún endpoint de escritura.

## Contratos y pruebas

- `shared/commercial-opportunities.ts`: universo, comparables, exclusiones, puntajes, sustitución y política de no automatización.
- `shared/models.ts`: tipos de oportunidad y evidencia devuelta.
- `shared/commercial-opportunities.test.ts`: stock, actividad, compatibilidad, sustitución, confianza, evidencia y regla humana.
- `GET /api/clients/:id/recommendations`: devuelve hasta doce oportunidades explicables para la cuenta elegida.
- `GET /api/products/:id/client-opportunities`: devuelve las cuentas calificadas para el producto elegido, con el mismo universo, puntaje, confianza y evidencia de faltantes de mix.

## Limitaciones reales

- El mix visible del cliente está limitado a la ventana capturada de 90 días.
- Segmento, canal y zona pueden tener cobertura parcial; la comparación prioriza entonces productos compartidos.
- Stock es una foto de GESI y no se descuenta localmente con facturas nuevas.
- Costos, márgenes, compras y reposición no se inventan ni participan del puntaje.
- No se modificó el tutorial, no se agregó experiencia móvil y no se automatizó la actualización nocturna.

## Validación

- Suite completa: 162 pruebas aprobadas, 7 conciliaciones históricas omitidas de manera explícita y 0 fallas.
- Pruebas específicas de oportunidades y compatibilidad: 12 aprobadas.
- Build de producción: correcto.
- Auditoría de datos: 0 problemas.
- Integridad de operaciones: correcta sobre 18 tablas.
- Auditoría de plataforma: 23 controles aprobados, 0 fallas obligatorias y 5 advertencias conocidas de cobertura/calidad de GESI.
- Auditorías de vectores y precios: aprobadas.
- Contraste sobre veinte cuentas reales: doce oportunidades por cuenta en 668 ms, con stock positivo en todos los resultados.
- Revisión visual de escritorio: filtros, confianza, evidencia y navegación a producto y cliente verificadas; la ficha de Catálogo muestra el resumen, abre la lista completa, busca y navega al cliente. Abrir y cerrar una ficha conserva Oportunidades como contexto. Consola sin errores ni advertencias.
