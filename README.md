# Salice Inteligente · v1.4.1

Salice Inteligente reúne la operación comercial, administrativa, logística y de reportes de Salice en una sola interfaz web. La v1.4.1 mantiene los reportes alineados con el mes calendario del paquete actualizado aunque todavía no existan ventas u objetivos, sobre la base adaptable y compacta incorporada en v1.4.0.

La v1.3.1 incorporó la creación y actualización de objetivos comerciales directamente desde Reporte General, con nombre elegido por la persona, historial mensual inmutable, exportación compatible con el Excel actual y migración secundaria dentro del historial. Esa funcionalidad continúa integrada en la v1.4.0.

Los objetivos reutilizan el alcance comercial común del programa: vendedores vigentes o altas futuras válidas de GESI y los mismos productos/rubros publicados por Reporte General. Las carteras antiguas del Excel quedan disponibles sólo en el historial auditable.

Cada producto o rubro admite objetivos mensuales de kilos y de clientes. Reporte General calcula el cumplimiento de clientes con compradores únicos por producto y vendedor usando exclusivamente movimientos GESI del mismo mes; una cuenta puede integrar más de un producto.

## Abrir el programa

En el entorno local actual:

```bash
export SALICE_INITIAL_ADMIN_USERNAME="administrador"
export SALICE_INITIAL_ADMIN_PASSWORD="una contraseña inicial segura"
export SALICE_INITIAL_ADMIN_ROLE="developer"
pnpm install
pnpm run dev
```

Las variables del administrador inicial son secretas y no deben guardarse en Git. Sólo se utilizan para crear o recuperar el primer administrador cuando todavía no existe otro administrador activo.

La aplicación queda disponible en la dirección informada por la terminal. Sin una cuenta activa no se entrega ningún snapshot, reporte, exportación ni dato operativo. Por seguridad operativa, la automatización está desactivada de forma predeterminada fuera de Render.

Para probar localmente la automatización puede configurarse `SALICE_AUTO_REFRESH_ENABLED=true`. En Render ya queda activada por el Blueprint. La guía de publicación, variables y verificación está en `docs/deployment-render-v1.2.md`.

## Acceso y usuarios

- Toda la API de negocio exige una sesión activa y aprobada.
- El health check público informa únicamente disponibilidad y versión.
- Una persona sin cuenta puede solicitar acceso sólo con usuario y contraseña, pero permanece pendiente y no puede ingresar.
- Un administrador aprueba, rechaza o deshabilita cuentas desde **Sistema → Usuarios**.
- Los roles disponibles son Administrador y Oficina.
- Developer conserva las funciones administrativas y agrega una vista privada de accesos, tiempo activo y cambios.
- El tiempo de uso deja de acumularse después de cinco minutos sin interacción.
- Las sesiones se conservan de forma segura en la computadora hasta 30 días o hasta cerrar sesión.
- Deshabilitar una cuenta invalida inmediatamente sus sesiones.
- Vistas guardadas, favoritos y reportes recientes pertenecen al usuario.
- Las notas, correcciones y gestiones registran la persona autenticada; el navegador no puede elegir otro autor.
- Las contraseñas y tokens de sesión se almacenan derivados o hasheados, nunca en texto legible.

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
- Reporte General: objetivos y resultados sobre el mismo período, sin un módulo administrativo duplicado.

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
- Usa Sol para la síntesis ejecutiva, Terra para análisis y Luna para tareas estructuradas de mayor volumen.
- Resume de forma agregada la Bandeja comercial y la demanda/rotación de productos sin reemplazar sus cálculos.
- Calcula el costo con la tarifa del modelo utilizado en cada intento.
- Presenta enteros con separador de miles y porcentajes con hasta dos decimales.
- Reutiliza en la ficha del cliente la explicación vigente de Bandeja sin llamar a OpenAI al abrir la pantalla.

Configuración muestra contenido disponible, último intento, calidad, feedback, consumo por función y actualización, resultados reutilizados, reintentos y presupuesto. Las ejecuciones de las 03:00 y 15:00 comparten un límite total de USD 1 por día; una actualización sin evidencia nueva no vuelve a consumir IA.

## Configuración

Configuración se divide en:

1. Preferencias.
2. Inteligencia artificial.
3. Datos y actualizaciones.
4. Ayuda.
5. Diagnóstico avanzado.
6. Acerca del programa.

Las preferencias de densidad y ayuda contextual se guardan en el navegador. Las vistas, favoritos y accesos recientes se separan por usuario y sus preferencias de reportes se persisten en el servidor. Los tutoriales independientes de Centro operativo, Administración y Reportes explican qué mirar, cómo trabajar y qué salvedades respetar en cada módulo. Los horarios de actualización que muestra la pantalla provienen del servidor e incluyen zona horaria, última ejecución y próxima ejecución real.

## Datos y recuperación

La aplicación conserva la última actualización aprobada si un intento posterior falla. Notas, gestiones, promesas, vistas, objetivos, correcciones y feedback se almacenan por separado de los datos comerciales.

Los movimientos de ventas, cobranzas, cartera, logística y reportes sólo se aceptan cuando pertenecen simultáneamente a empresa 3 y sucursal 3. Via Salice MDP S.A. se excluye por identidad comercial de los snapshots y bases derivadas. Los maestros compartidos que no informan empresa o sucursal se conservan mientras no exista evidencia suficiente para atribuirlos a otro alcance.

La normalización del paquete candidato tiene un límite de heap propio de 1.024 MB; las demás etapas generales conservan 512 MB y la captura 768 MB. Las etapas continúan ejecutándose de forma secuencial.

En producción, snapshots, paquetes de datos, operaciones, feedback y artefactos de IA viven en el disco persistente de Render. El servidor ejecuta la actualización internamente porque ese almacenamiento no puede compartirse con un Cron Job independiente. Si el servicio vuelve después de haberse perdido un horario, intenta recuperar esa ejecución; nunca permite dos actualizaciones simultáneas.

La cartera documental sólo incluye facturas y notas de débito asignadas en el propio comprobante a Andres Dominguez, Edgardo Larrea, Ignacio Carea, Ana Ottaviano, Julieta Errecart o Gonzalo Russian. Continúan vigentes el mínimo de $1.000 y la exclusión de entidades internas o genéricas.

Las copias pueden consultarse desde Acerca del programa. La restauración sigue siendo manual y administrada para evitar reemplazos accidentales.

## Verificación técnica

```bash
pnpm test
pnpm run build
```

Los scripts de captura, auditoría, enriquecimiento y recuperación están destinados al responsable técnico y se documentan dentro de `docs/`.

## Alcance deliberadamente fuera de v1.4

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
- `docs/release-v1.1.1.md`
- `docs/release-v1.2.0.md`
- `docs/release-v1.2.1.md`
- `docs/release-v1.2.2.md`
- `docs/release-v1.2.3.md`
- `docs/release-v1.3.0.md`
- `docs/release-v1.3.1.md`
- `docs/release-v1.4.1.md`
- `docs/release-v1.4.0.md`
