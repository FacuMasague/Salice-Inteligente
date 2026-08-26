# Salice Inteligente v2.1.5

Fecha: 26 de agosto de 2026.

## Resumen

La v2.1.5 corrige la distribución del mapa de fojas, ajusta el inicio de la navegación, simplifica la lectura trimestral de Mars, NutriPet y Baires y mantiene las sesiones por dispositivo sin vencimiento mensual. No modifica universos comerciales, cifras determinísticas, permisos, datos operativos ni el proceso atómico de actualización.

## Rutas de reparto

- El directorio de fojas conserva un límite vertical y su propio desplazamiento.
- El mapa y los comprobantes seleccionados dejan de estar encerrados por la altura del directorio.
- La página puede crecer para mostrar todos los comprobantes y usa el desplazamiento normal del módulo.
- En pantallas pequeñas el directorio continúa limitado de forma independiente.

## Navegación

- Una recarga conserva la pestaña abierta dentro de la misma pestaña del navegador.
- Una apertura nueva desde la dirección normal comienza en Inicio.
- Los enlaces explícitos a una sección o reporte siguen abriendo su destino.
- La última vista deja de persistirse entre aperturas independientes del navegador.

## Trimestres de proveedores

- Mars muestra solamente los quarters del año comercial elegido, desde Q1 hasta el quarter alcanzado.
- NutriPet y Baires muestran solamente los trimestres del año elegido, desde T1 hasta el trimestre alcanzado.
- Cada trimestre mantiene la comparación contra el mismo tramo del año anterior.
- La grilla admite hasta cuatro trimestres sin depender de una ventana móvil de cuatro o cinco bloques.
- Las exportaciones utilizan la misma serie anual publicada por la API.

## Simplificación visual

- Se retiró de Mars, NutriPet y Baires el recuadro adicional que repetía período, corte y metodología.
- El período y el corte continúan disponibles en los encabezados, indicadores y contexto metodológico plegable.

## Sesiones

- Las sesiones ya no vencen automáticamente a los 30 días.
- Cada dispositivo conserva su sesión hasta cerrar sesión, borrar los datos del navegador o perder acceso a la cuenta.
- Deshabilitar una cuenta continúa invalidando sus sesiones.
- Los tokens y contraseñas siguen almacenándose de forma segura y no se exponen en la interfaz.

## Verificación

La entrega debe validar:

```bash
pnpm test
pnpm run build
git diff --check
```

Resultado local de la entrega:

- 388 pruebas aprobadas.
- 7 conciliaciones históricas omitidas porque dependen del paquete exacto de referencia.
- Build de producción correcto.
- Validación visual del mapa de fojas, navegación y trimestres realizada con el paquete comercial activo y una base operativa temporal.
