# Salice Inteligente · v1.1.0

Salice Inteligente reúne la operación comercial, administrativa, logística y de reportes de Salice en una sola interfaz web. La v1.1 amplía el análisis operativo con kilos reales de GESI, filtros de demanda y catálogo, participación por marca y un mapa de fojas de reparto.

## Abrir el programa

En el entorno local actual:

```bash
pnpm install
pnpm run dev
```

La aplicación queda disponible en la dirección informada por la terminal. Por seguridad operativa, la automatización está desactivada de forma predeterminada fuera de Render.

Para probar localmente la automatización puede configurarse `SALICE_AUTO_REFRESH_ENABLED=true`. En Render ya queda activada por el Blueprint. La guía de publicación, variables y verificación está en `docs/deployment-render-v0.11.md`.

## Recorrido principal

### Centro operativo

- Mapa operativo: clientes y prioridades sobre el territorio.
- Rutas: facturas y recorridos estimados con ubicaciones verificadas.
- Clientes: directorio completo, estados, ubicación y fichas.
- Vendedores: desempeño y composición de cada cartera.
- Productos: inventario, catálogo, oportunidades y análisis avanzados.
- Marcas: venta, stock y productos agrupados por marca.

### Administración

- Explorador de ventas: del indicador al comprobante.
- Cartera: saldos y vencimientos.
- Cuentas por cobrar: seguimiento humano, responsables y promesas.
- Bandeja comercial: señales y notas reunidas para revisión.
- Objetivos comerciales: planes versionados y comparación con resultados.

### Reportes

El Centro de reportes organiza ocho lecturas:

- Reporte General.
- Ventas y composición.
- Volumen SPT.
- Saldos pendientes.
- Cuentas no compradoras.
- Mars · desempeño comercial.
- NutriPet · desempeño comercial.
- Baires · desempeño comercial.

Cada reporte conserva filtros, período, fecha de corte, comparación, advertencias y exportaciones. “Cómo se calcula” mantiene el detalle metodológico plegado hasta que sea necesario.

## Ubicaciones y rutas

Las coordenadas se contrastan con la localidad declarada:

- Una ubicación original compatible se conserva.
- Una incompatibilidad evidente puede reemplazarse por una referencia aproximada y trazable de la localidad.
- Un caso sin referencia confiable queda pendiente de revisión y no se dibuja como si fuera exacto.

Mapa y Clientes permiten filtrar ubicaciones corregidas. La ficha explica el motivo y conserva la dirección original. Las ubicaciones aproximadas no pueden utilizarse para calcular rutas, tanto por control de interfaz como por validación del servidor.

## Productos

El recorrido cotidiano muestra precio, disponibilidad, rotación, compradores y oportunidades con lenguaje comercial. Los datos faltantes o inválidos se identifican sin inventar valores.

La clasificación explicable, sus atributos, evidencia, confianza, correcciones humanas e historial requieren activar el modo avanzado.

## Asistencia con IA

La IA es complementaria:

- Interpreta indicadores ya calculados.
- Reutiliza cada resultado mientras no cambie su evidencia, aunque exista una captura nueva.
- En reportes y resúmenes vuelve a intervenir únicamente si cambian los datos de esa función.
- En la Bandeja comercial explica sólo clientes nuevos; una explicación vigente se conserva entre actualizaciones.
- En productos procesa únicamente altas que todavía no tengan enriquecimiento.
- En la Bandeja comercial explica el motivo principal, el contexto del caso, la oportunidad disponible y qué conviene confirmar.
- Distingue datos confirmados, interpretación y sugerencias de revisión.
- No modifica cifras, universos, reportes ni decisiones.
- No bloquea los reportes determinísticos si falla.
- No publica narrativas rechazadas por control de calidad.
- Acepta feedback útil, poco útil, incorrecto o incompleto y correcciones breves versionadas.
- No ajusta prompts automáticamente y no realiza aprendizaje autónomo ni fine-tuning automático.

Configuración muestra contenido disponible, último intento, calidad, feedback, consumo por función y actualización, resultados reutilizados, reintentos y presupuesto. El límite recomendado continúa siendo USD 1 por actualización; una actualización sin evidencia nueva no vuelve a consumir IA.

## Configuración

Configuración se divide en:

1. Preferencias.
2. Inteligencia artificial.
3. Datos y actualizaciones.
4. Ayuda.
5. Diagnóstico avanzado.
6. Acerca del programa.

Las preferencias de densidad y ayuda contextual se guardan en el navegador. Los horarios de actualización que muestra la pantalla provienen del servidor e incluyen zona horaria, última ejecución y próxima ejecución real.

## Datos y recuperación

La aplicación conserva la última actualización aprobada si un intento posterior falla. Notas, gestiones, promesas, vistas, objetivos, correcciones y feedback se almacenan por separado de los datos comerciales.

En producción, snapshots, paquetes de datos, operaciones, feedback y artefactos de IA viven en el disco persistente de Render. El servidor ejecuta la actualización internamente porque ese almacenamiento no puede compartirse con un Cron Job independiente. Si el servicio vuelve después de haberse perdido un horario, intenta recuperar esa ejecución; nunca permite dos actualizaciones simultáneas.

La cartera documental sólo incluye facturas y notas de débito asignadas en el propio comprobante a Andres Dominguez, Edgardo Larrea, Ignacio Carea, Ana Ottaviano, Julieta Errecart o Gonzalo Russian. Continúan vigentes el mínimo de $1.000 y la exclusión de entidades internas o genéricas.

Las copias pueden consultarse desde Acerca del programa. La restauración sigue siendo manual y administrada para evitar reemplazos accidentales.

## Verificación técnica

```bash
pnpm test
pnpm run build
```

Los scripts de captura, auditoría, enriquecimiento y recuperación están destinados al responsable técnico y se documentan dentro de `docs/`.

## Alcance deliberadamente fuera de v1.1

- Empaquetado instalable.
- Rediseño móvil completo.
- Escalado horizontal: la base SQLite y el programador requieren una sola instancia con disco.
- Ajuste autónomo de prompts, aprendizaje automático con feedback o fine-tuning automático.

## Notas de versión

Las entregas de esta fase están documentadas en:

- `docs/release-v0.10.1.md`
- `docs/release-v0.10.2.md`
- `docs/release-v0.10.3.md`
- `docs/release-v0.10.4.md`
- `docs/release-v0.10.5.md`
- `docs/release-v0.10.6.md`
- `docs/release-v0.10.7.md`
- `docs/release-v0.10.8.md`
- `docs/release-v0.10.9.md`
- `docs/release-v0.11.0.md`
- `docs/release-v1.1.0.md`
