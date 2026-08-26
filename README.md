# Salice Inteligente · v2.1.6

Salice Inteligente reúne la operación comercial, administrativa, logística y de reportes de Salice en una sola interfaz web. La v2.1.6 conserva toda la experiencia de oficina y móvil de v2.1.5 y hace resiliente la captura de comprobantes frente a respuestas lentas: comienza con páginas más livianas y, si GESI agota el tiempo de espera, reinicia la colección con lotes menores sin publicar una foto parcial. En teléfonos se conserva siempre la vista simple de v2.0.

La versión no modifica roles, universos comerciales ni datos operativos. Cambia únicamente la vigencia de las sesiones para conservar cada dispositivo conectado hasta el cierre manual o una revocación de acceso. En inventario se mantiene la distinción funcional incorporada en v2.1.2: un artículo con existencia física en el almacén sigue perteneciendo al catálogo aunque toda esa existencia esté comprometida; cobertura, alertas y oportunidades continúan usando únicamente lo disponible para vender. También se conserva la cobertura histórica ampliada de fojas de reparto, junto con el alcance, la auditoría y la activación atómica. Saldos pendientes continúa como reporte independiente y Oportunidades sigue siendo una sección principal de Productos.

La v1.3.1 incorporó la creación y actualización de objetivos comerciales directamente desde Reporte General, con nombre elegido por la persona, historial mensual inmutable, exportación compatible con el Excel actual y migración secundaria dentro del historial. Esa funcionalidad continúa integrada en la v1.4.0.

Los objetivos reutilizan el alcance comercial común del programa: vendedores vigentes o altas futuras válidas de GESI y los mismos productos/rubros publicados por Reporte General. Las carteras antiguas del Excel quedan disponibles sólo en el historial auditable.

Cada producto o rubro admite objetivos mensuales de kilos y de clientes. Reporte General calcula el cumplimiento de clientes con compradores únicos por producto y vendedor usando exclusivamente movimientos GESI del mismo mes; una cuenta puede integrar más de un producto.

Una celda vacía de kilos, clientes o facturación se conserva como `null`, es decir, sin objetivo definido. El cero continúa siendo un valor explícito válido. Las filas de facturación de autoservicio no requieren producto y nunca aportan kilos ni cuentas.

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
- Los roles disponibles son Developer, Administrador y Oficina.
- Developer conserva las funciones administrativas y agrega una vista privada de accesos, tiempo activo por sección, días de uso, cambios con contexto seguro y alertas técnicas.
- El tiempo de uso deja de acumularse después de cinco minutos sin interacción.
- Las sesiones se conservan de forma segura en cada dispositivo hasta que el usuario cierre sesión; también se invalidan si la cuenta es deshabilitada o su acceso es revocado.
- Deshabilitar una cuenta invalida inmediatamente sus sesiones.
- Vistas guardadas, favoritos y reportes recientes pertenecen al usuario.
- Las notas, correcciones y gestiones registran la persona autenticada; el navegador no puede elegir otro autor.
- Las contraseñas y tokens de sesión se almacenan derivados o hasheados, nunca en texto legible.

## Recorrido principal

### Inicio

- Reúne clientes activos, facturación y kilos de 90 días, saldo de cuenta corriente y riesgo de cobranza; cada indicador abre su sección correspondiente.
- Recupera las últimas cuatro pantallas distintas de cada usuario y ofrece acceso a todas las secciones principales.
- Atención y Comercial permanecen contraídas hasta que la persona necesita revisarlas.
- No crea tareas, no cambia estados y no modifica importes.

### Trabajo diario

- Inicio: prioridades y accesos para comenzar la jornada.
- Bandeja comercial: señales y notas reunidas para revisión.
- Cobranzas: una sola entrada con las pestañas Comprobantes y Clientes.

### Clientes y ventas

- Explorador de ventas: del indicador al comprobante.
- Clientes: directorio completo, estados, ubicación y fichas.
- Vendedores: desempeño y composición de cada cartera.
- Productos: inventario, catálogo, oportunidades y análisis adicionales.
- Marcas: venta, stock y productos agrupados por marca.

### Planificación

- Mapa operativo: clientes y ubicaciones sobre el territorio.
- Rutas: facturas y recorridos estimados con ubicaciones verificadas.

### Administración comercial

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

Cada reporte conserva filtros, período, fecha de corte, comparación, advertencias y exportaciones. Volumen SPT compara la mezcla por grupo contra mes y año anterior al mismo día; Ventas y composición agrega esos mismos grupos sobre su propia facturación y conserva un resto explícito para conciliar el total. Mars usa sus últimos 13 períodos comerciales y NutriPet/Baires sus últimos 13 meses para mostrar todos los quarters o trimestres intersectados, incluidos extremos parciales y ausencia explícita de cobertura interanual. “Cómo se calcula” mantiene el detalle metodológico plegado hasta que sea necesario.

## Ubicaciones y rutas

Las coordenadas se contrastan con la localidad declarada:

- Una ubicación original compatible se conserva.
- Una incompatibilidad evidente puede reemplazarse por una referencia aproximada y trazable de la localidad.
- Un caso sin referencia confiable queda pendiente de revisión y no se dibuja como si fuera exacto.

Mapa y Clientes permiten filtrar ubicaciones corregidas. La ficha explica el motivo y conserva la dirección original. Las ubicaciones aproximadas no pueden utilizarse para calcular rutas, tanto por control de interfaz como por validación del servidor.

## Productos

El recorrido cotidiano muestra precio, existencia física del almacén 2, cantidad comprometida en pedidos, disponibilidad, rotación, compradores y oportunidades con lenguaje comercial. Los datos faltantes o inválidos se identifican sin inventar valores. La cobertura, las alertas y las sugerencias comerciales usan disponibilidad para no ofrecer unidades ya comprometidas.

Demanda y rotación y Precios y evolución priorizan período, cobertura, indicadores principales y comparaciones equivalentes. Sus controles y bloques se adaptan a teléfonos sin cambiar cálculos ni llamar a IA al abrirse.

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
4. Diagnóstico avanzado.
5. Acerca del programa.

Las preferencias de densidad, vista y ayuda contextual se guardan en el navegador. La vista completa es la predeterminada en computadoras; en teléfonos y pantallas pequeñas siempre se usa la vista simple. El alcance de clientes también se elige en Configuración y deja de ocupar una franja superior de trabajo.

Las vistas, favoritos y accesos recientes se separan por usuario y sus preferencias de reportes se persisten en el servidor. Ayuda conserva los tutoriales de Centro operativo, Administración y Reportes y ofrece recorridos graduales para revisar un cliente, gestionar una cobranza, buscar un comprobante o revisar el mes. Los horarios de actualización que muestra Configuración provienen del servidor e incluyen zona horaria, última ejecución y próxima ejecución real.

Developer puede comparar la adopción durante 7, 30, 90 o 365 días y consultar el histórico. La medición por sección respeta el control anti-AFK y no registra contraseñas, textos de notas ni contenido libre de formularios. Las fallas de actualización, IA y errores no controlados quedan auditados y, si SMTP está configurado, se notifican por correo sin bloquear el flujo principal.

## Datos y recuperación

La aplicación conserva la última actualización aprobada si un intento posterior falla. Notas, gestiones, promesas, vistas, objetivos, correcciones y feedback se almacenan por separado de los datos comerciales.

Los movimientos de ventas, cobranzas, cartera, logística y reportes sólo se aceptan cuando pertenecen simultáneamente a empresa 3 y sucursal 3. Via Salice MDP S.A. se excluye por identidad comercial de los snapshots y bases derivadas. Los maestros compartidos que no informan empresa o sucursal se conservan mientras no exista evidencia suficiente para atribuirlos a otro alcance.

El inventario consulta exclusivamente el almacén 2, **Mar del Plata [WPM]**. Conserva por separado existencia física (`unidad1`), pedidos pendientes y disponibilidad (`unidad1Disponible`); no suma los demás almacenes ni convierte U2 sin una relación maestra confiable. Una fila técnica global sólo puede normalizarse cuando declara explícitamente sucursal 3 y almacén 2, y su existencia física, disponibilidad y pedidos pendientes U1/U2 son exactamente cero.

La normalización del paquete candidato tiene un límite de heap propio de 1.024 MB; las demás etapas generales conservan 512 MB y la captura 768 MB. Las etapas continúan ejecutándose de forma secuencial.

Las fojas de reparto conservan el mismo año móvil que las facturas y agregan un solapamiento de 45 días para cubrir períodos que cruzan el corte. La primera actualización completa el histórico cuando detecta una captura antigua limitada; después sólo conserva detalles históricos cerrados del paquete activo y vuelve a consultar todas las fojas recientes o todavía abiertas. Un caché dudoso obliga a reconstruir el año. `pnpm run audit:delivery-sheets` permite comparar la fuente con el paquete activo sin modificar datos.

En producción, snapshots, paquetes de datos, operaciones, feedback y artefactos de IA viven en el disco persistente de Render. El servidor ejecuta la actualización internamente porque ese almacenamiento no puede compartirse con un Cron Job independiente. Si el servicio vuelve después de haberse perdido un horario, intenta recuperar esa ejecución; nunca permite dos actualizaciones simultáneas.

La cartera documental sólo incluye facturas y notas de débito asignadas en el propio comprobante a Andres Dominguez, Edgardo Larrea, Ignacio Carea, Ana Ottaviano, Julieta Errecart o Gonzalo Russian. Continúan vigentes el mínimo de $1.000 y la exclusión de entidades internas o genéricas.

Las copias pueden consultarse desde Acerca del programa. La restauración sigue siendo manual y administrada para evitar reemplazos accidentales.

## Verificación técnica

```bash
pnpm test
pnpm run build
```

Los scripts de captura, auditoría, enriquecimiento y recuperación están destinados al responsable técnico y se documentan dentro de `docs/`.

## Alcance que continúa fuera de v2.1.6

- Empaquetado instalable.
- Flujos, perfiles y permisos específicos para vendedores o fleteros; corresponden a la segunda parte planificada de v2.
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
- `docs/release-v1.5.0.md`
- `docs/release-v1.5.1.md`
- `docs/release-v2.0.0.md`
- `docs/release-v2.0.1.md`
- `docs/release-v2.1.0.md`
- `docs/release-v2.1.1.md`
- `docs/release-v2.1.2.md`
- `docs/release-v2.1.3.md`
- `docs/release-v2.1.4.md`
- `docs/release-v2.1.5.md`
- `docs/release-v2.1.6.md`
