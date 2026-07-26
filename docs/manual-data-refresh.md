# Actualización manual segura, atómica y enriquecida · v0.9.5

La actualización sigue siendo manual. No existe programación nocturna, reintento horario ni despliegue remoto en esta versión.

## Comando completo

```bash
pnpm run refresh:gesi
```

Si una ejecución falló después de aprobar la captura, puede reutilizarse únicamente cuando el archivo pertenece inequívocamente al intento fallido:

```bash
pnpm run refresh:gesi:resume
```

El orquestador construye todo dentro de `data/bundles/<ejecución>/`:

1. captura cruda de GESI;
2. auditoría de completitud;
3. base comercial candidata;
4. auditoría comercial;
5. snapshot, staging y saldos pendientes candidatos;
6. auditoría funcional del snapshot;
7. auditoría específica de vectorización;
8. auditoría cruzada de artefactos, cortes y catálogo;
9. resumen ejecutivo “¿Cómo estamos?” calculado contra el paquete candidato;
10. manifiesto con corte, revisión, tamaños y SHA-256;
11. reemplazo atómico de `data/active-bundle.json`;
12. enriquecimiento IA auditable vinculado al snapshot activo;
13. control local de citas, cifras, universos, comparaciones y contradicciones;
14. bloqueo aislado de salidas problemáticas, sin revertir el paquete determinístico;
15. cierre exitoso y recarga del dashboard con resumen e IA ya disponibles.

Después de una activación aprobada, el sistema agrega a `operations.sqlite` una observación append-only de precios por producto. Una ejecución rechazada no incorpora el candidato a esa serie. Al iniciar, `pnpm run backfill:prices` también puede reconstruir observaciones faltantes únicamente desde snapshots GESI que todavía estén preservados localmente; no consulta Power BI ni inventa puntos intermedios.

Los candidatos nunca son leídos por el servidor antes de aprobarse. Si una etapa falla, se elimina solamente esa generación y el manifiesto activo continúa apuntando exactamente al paquete anterior. No existe una ventana en la que el servidor combine una base comercial nueva con un snapshot viejo.

El enriquecimiento IA comienza únicamente después de activar el paquete determinístico. El refresco permanece visible como activo durante esta etapa para que el dashboard no se recargue antes de que termine el intento. Si OpenAI no está configurado, falla o devuelve una salida inválida, la ejecución IA queda omitida, parcial o fallida en `operations.sqlite`, pero el paquete aprobado no se revierte y el comando informa la salvedad por separado.

La ejecución productiva incluye las funciones habilitadas entre v0.9.1 y v0.9.4:

- línea base y clasificación de productos realmente nuevos;
- ocho narrativas almacenadas de reportes;
- lectura ejecutiva de “¿Cómo estamos?”;
- explicaciones de la bandeja comercial;
- resúmenes agregados de carteras de vendedores.

Los paquetes enviados son agregados y compactos. Nunca incluyen snapshots, bases SQLite, listas completas de clientes o cuentas, textos de notas, credenciales ni archivos fuente. El límite predeterminado es USD 1 por ejecución completa y puede reducirse con `SALICE_AI_MAX_COST_USD_PER_RUN`. Si el presupuesto restante no alcanza para una salida válida, ese trabajo queda registrado como omitido y la actualización determinística conserva su aprobación.

El gasto mensual se compara con `SALICE_AI_MONTHLY_BUDGET_USD` y genera una alerta al porcentaje definido por `SALICE_AI_MONTHLY_BUDGET_WARNING_PERCENT`. La alerta no aumenta límites ni modifica prompts automáticamente.

Una segunda ejecución sobre el mismo snapshot y la misma evidencia reutiliza los artefactos mediante sus hashes y no llama nuevamente a OpenAI. Para una reanudación administrativa explícita también están disponibles:

```bash
pnpm run enrich:ai
pnpm run enrich:ai:resume
```

El servidor resuelve snapshot y bases desde el mismo manifiesto. Cuando el puntero cambia, abre las rutas de la nueva generación en la siguiente consulta sin reinicio. Al iniciar vuelve a verificar tamaños y checksums. Se conservan la generación activa y hasta dos anteriores.

Una segunda ejecución no puede comenzar mientras exista otra activa. Al iniciar el sistema, una ejecución que lleva más de 30 minutos sin finalizar se cierra como interrumpida antes de liberar el flujo. El historial SPT conserva su backfill mensual incremental y reanudable.

## Resultado esperado

Una ejecución aprobada debe dejar:

- la misma fecha de captura en snapshot, staging, base comercial y saldos pendientes;
- ningún movimiento posterior al corte del snapshot;
- conteos físicos iguales a la metadata de cada SQLite;
- auditorías SPT, vectorial y de plataforma dentro del paquete;
- un resumen ejecutivo persistido con el mismo corte del snapshot;
- evidencia comparativa sólo si el paquete cambia la versión del motor vectorial;
- un manifiesto con checksums válidos;
- un registro exitoso con duración, cobertura y advertencias.
- una ejecución IA completa, parcial u omitida claramente registrada, sin alterar la validez del paquete determinístico.

Los comandos individuales siguen disponibles para diagnóstico, pero la única operación aprobada para publicar una foto completa es `pnpm run refresh:gesi`. `pnpm run adopt:data-bundle` migra una sola vez una instalación anterior ya validada al esquema de manifiesto sin consultar GESI.

Las credenciales permanecen únicamente en `.env`. Ninguna salida, auditoría o respaldo debe copiar usuario o contraseña.
