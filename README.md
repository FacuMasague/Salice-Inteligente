# Salice Inteligente · v0.10.7

Salice Inteligente reúne la operación comercial, administrativa, logística y de reportes de Salice en una sola interfaz. Esta versión cierra la preparación funcional y visual previa al trabajo de publicación web previsto para v0.11.

## Abrir el programa

En el entorno local actual:

```bash
pnpm install
pnpm run dev
```

La aplicación queda disponible en la dirección informada por la terminal. La v0.10 no incorpora hosting ni actualizaciones automáticas.

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
- En la Bandeja comercial explica el motivo principal, el contexto del caso, la oportunidad disponible y qué conviene confirmar.
- Distingue datos confirmados, interpretación y sugerencias de revisión.
- No modifica cifras, universos, reportes ni decisiones.
- No bloquea los reportes determinísticos si falla.
- No publica narrativas rechazadas por control de calidad.
- Acepta feedback útil, poco útil, incorrecto o incompleto y correcciones breves versionadas.
- No ajusta prompts automáticamente y no realiza aprendizaje autónomo ni fine-tuning automático.

Configuración muestra contenido disponible, último intento, calidad, feedback, consumo por función y actualización, reintentos y presupuesto. El límite recomendado continúa siendo USD 1 por actualización.

## Configuración

Configuración se divide en:

1. Preferencias.
2. Inteligencia artificial.
3. Datos y actualizaciones.
4. Ayuda.
5. Diagnóstico avanzado.
6. Acerca del programa.

Las preferencias de densidad, ayuda contextual y horarios previstos se guardan en el navegador. Registrar horarios previstos no automatiza las actualizaciones.

## Datos y recuperación

La aplicación conserva la última actualización aprobada si un intento posterior falla. Notas, gestiones, promesas, vistas, objetivos, correcciones y feedback se almacenan por separado de los datos comerciales.

Las copias pueden consultarse desde Acerca del programa. La restauración sigue siendo manual y administrada para evitar reemplazos accidentales.

## Verificación técnica

```bash
pnpm test
pnpm run build
```

Los scripts de captura, auditoría, enriquecimiento y recuperación están destinados al responsable técnico y se documentan dentro de `docs/`.

## Alcance deliberadamente fuera de v0.10

- Publicación y hosting web.
- Autenticación y seguridad de despliegue.
- Actualizaciones automáticas.
- Empaquetado instalable.
- Optimización del proceso pesado de actualización programada.
- Rediseño móvil completo.

Estos temas corresponden a la fase v0.11.

## Notas de versión

Las entregas de esta fase están documentadas en:

- `docs/release-v0.10.1.md`
- `docs/release-v0.10.2.md`
- `docs/release-v0.10.3.md`
- `docs/release-v0.10.4.md`
- `docs/release-v0.10.5.md`
- `docs/release-v0.10.6.md`
- `docs/release-v0.10.7.md`
