# Salice Inteligente v0.6.2 · Listas comerciales reproducibles

## Objetivo

Permitir que la oficina conserve combinaciones de filtros útiles para recuperación de clientes, cobranzas y oportunidades de productos, sin introducir una campaña con workflow.

## Alcance

- `Cuentas no compradoras` conserva filtros de recuperación.
- `Cuentas por cobrar` guarda listas identificadas como cobranza.
- `Productos → Oportunidades` guarda cliente, búsqueda, tipo de oportunidad y confianza.
- Cada lista conserva nombre, filtros, propósito, favorito y fechas de creación y actualización.

## Límites

Una lista no envía mensajes, no contacta personas, no crea gestiones, no asigna responsables y no exige mantener estados. Aplicarla vuelve a establecer filtros sobre los datos actuales; por eso sus resultados pueden cambiar con un nuevo snapshot.

La persistencia reutiliza `saved_views` y agrega un propósito explícito. No se creó un sistema paralelo de campañas.

