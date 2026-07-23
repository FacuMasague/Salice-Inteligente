# Actualización manual segura y atómica · v0.3.3

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
9. manifiesto con corte, revisión, tamaños y SHA-256;
10. reemplazo atómico de `data/active-bundle.json`.

Después de una activación aprobada, el sistema agrega a `operations.sqlite` una observación append-only de precios por producto. Una ejecución rechazada no incorpora el candidato a esa serie. Al iniciar, `pnpm run backfill:prices` también puede reconstruir observaciones faltantes únicamente desde snapshots GESI que todavía estén preservados localmente; no consulta Power BI ni inventa puntos intermedios.

Los candidatos nunca son leídos por el servidor antes de aprobarse. Si una etapa falla, se elimina solamente esa generación y el manifiesto activo continúa apuntando exactamente al paquete anterior. No existe una ventana en la que el servidor combine una base comercial nueva con un snapshot viejo.

El servidor resuelve snapshot y bases desde el mismo manifiesto. Cuando el puntero cambia, abre las rutas de la nueva generación en la siguiente consulta sin reinicio. Al iniciar vuelve a verificar tamaños y checksums. Se conservan la generación activa y hasta dos anteriores.

Una segunda ejecución no puede comenzar mientras exista otra activa. Una ejecución interrumpida durante más de doce horas se cierra como fallida antes de liberar el flujo. El historial SPT conserva su backfill mensual incremental y reanudable.

## Resultado esperado

Una ejecución aprobada debe dejar:

- la misma fecha de captura en snapshot, staging, base comercial y saldos pendientes;
- ningún movimiento posterior al corte del snapshot;
- conteos físicos iguales a la metadata de cada SQLite;
- auditorías SPT, vectorial y de plataforma dentro del paquete;
- evidencia comparativa sólo si el paquete cambia la versión del motor vectorial;
- un manifiesto con checksums válidos;
- un registro exitoso con duración, cobertura y advertencias.

Los comandos individuales siguen disponibles para diagnóstico, pero la única operación aprobada para publicar una foto completa es `pnpm run refresh:gesi`. `pnpm run adopt:data-bundle` migra una sola vez una instalación anterior ya validada al esquema de manifiesto sin consultar GESI.

Las credenciales permanecen únicamente en `.env`. Ninguna salida, auditoría o respaldo debe copiar usuario o contraseña.
