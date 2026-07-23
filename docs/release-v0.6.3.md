# Salice Inteligente v0.6.3 · Oportunidades vinculadas con listas y notas

## Objetivo

Permitir una selección humana liviana sobre las recomendaciones explicables de productos.

## Alcance

- Una oportunidad vigente puede vincularse a una lista guardada de oportunidades.
- En la misma acción puede escribirse una nota opcional.
- La nota guarda cliente y producto en la actividad humana existente.
- El vínculo conserva la lista, cliente, producto, clases de recomendación, snapshot y, cuando existe, la nota asociada.
- Eliminar una lista elimina sus vínculos de selección, pero no altera GESI.

## Validaciones

Al guardar se vuelve a comprobar que el cliente esté activo, sin bloqueo, con ventas recientes y que el producto continúe recomendado por el snapshot activo. No se inventan oportunidades ni se permiten listas de otro propósito.

## Límites

La nota documenta exclusivamente lo escrito por una persona. No permite inferir contacto, visita, oferta, aceptación, descarte ni resultado. El vínculo no posee estado y no crea agenda, promesa o gestión automática.

