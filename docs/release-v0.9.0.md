# v0.9.0 — Infraestructura de IA auditable

## Alcance

Esta versión incorpora la base técnica para enriquecimientos posteriores a una actualización de datos. No habilita todavía vectorización de productos, narrativas, explicaciones comerciales ni otras funciones visibles de IA.

La aplicación determinística conserva el control de métricas, universos y selección de entidades. No existe chat libre y ninguna pantalla llama a OpenAI al abrirse o al cambiar filtros.

## Flujo

1. GESI se captura y audita.
2. Se construyen y auditan snapshot y bases candidatas.
3. El manifiesto se activa atómicamente.
4. El refresco determinístico se registra como aprobado.
5. Se ejecuta el orquestador de enriquecimiento.
6. Cada salida se valida y persiste vinculada al snapshot.

El paso 5 está protegido por una barrera de error propia. Una indisponibilidad, rechazo o salida inválida de OpenAI no llama a `failRefreshRun`, no modifica el manifiesto y no invalida el snapshot.

## Proveedor y contratos

- SDK oficial `openai`.
- Responses API.
- `store: false`.
- Modelo base `gpt-5.6-terra`.
- Esfuerzo declarado por función.
- Structured Outputs con JSON Schema estricto.
- Validación local adicional con Ajv.
- Proveedor falso para pruebas sin red ni clave.

Los prompts se registran con versión, versión de esquema y hash de contenido. Reutilizar el mismo número de versión con otro contenido es rechazado.

## Persistencia

La migración es aditiva y crea un backup consistente de `operations.sqlite` antes de instalar el esquema:

- `ai_prompt_versions`;
- `ai_enrichment_runs`;
- `ai_artifacts`;
- `ai_attempts`;
- `ai_feedback`.

Prompts, artefactos, intentos y feedback son append-only. Las ejecuciones pueden actualizar únicamente su estado y totales hasta finalizar.

Cada intento conserva proveedor, modelo, esfuerzo, respuesta, tokens de entrada, salida, caché y razonamiento, duración, tarifa versionada, costo estimado y error.

## Privacidad y costo

Los constructores de evidencia deben enviar agregados o señales mínimas. La infraestructura rechaza claves de campos asociadas con CUIT/CUIL/DNI, teléfonos, correos, direcciones, contraseñas, credenciales, secretos, claves de API y tokens.

También se aplican límites configurables:

- entidades por función;
- entidades por ejecución;
- bytes por entidad;
- tokens de entrada estimados por ejecución;
- tokens máximos de salida por solicitud;
- uno o dos intentos totales.

El valor predeterminado permite un único reintento. No hay reintentos indefinidos.

La tarifa queda identificada por versión para que el costo histórico no cambie silenciosamente cuando cambie el precio del proveedor.

## Deduplicación

La evidencia se serializa de forma canónica. El hash efectivo incluye función, entidad, modelo, esfuerzo, prompt, esquema y evidencia.

Si la misma entrada ya produjo un artefacto válido, el nuevo snapshot recibe un artefacto `reused` vinculado al original sin repetir la llamada.

## Operación

```bash
pnpm run enrich:ai
pnpm run enrich:ai:resume
```

`refresh:gesi` invoca el mismo orquestador después de la activación. En v0.9.0 el registro productivo de funciones está vacío, por lo que el resultado esperado es `skipped` sin llamadas ni costo.

`Configuración` sólo consulta `operations.sqlite` y muestra:

- si existe una clave configurada;
- último análisis;
- correspondencia con el snapshot activo;
- entidades procesadas, reutilizadas, fallidas u omitidas;
- tokens;
- costo estimado;
- límites;
- tarifa registrada;
- errores.

## Validación

- Las pruebas normales usan proveedor falso.
- No requieren internet ni `OPENAI_API_KEY`.
- Se prueban privacidad, hashes, reutilización, límites, reintento estructural, falla del proveedor, migración y append-only.
- Se realizó una comprobación real mínima sin datos comerciales: 70 tokens de entrada, 29 de salida y costo estimado de USD 0,00061.

## Límites preservados

- No se actualizó el tutorial.
- No se modificaron métricas ni contratos de reportes.
- No se modificaron datos GESI.
- No se adelantaron funciones de v0.9.1 a v0.9.5.
- No existe chat, llamada por pantalla, acción automática ni aprendizaje autónomo.
