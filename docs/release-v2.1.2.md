# Salice Inteligente v2.1.2

Fecha de preparación: 25 de agosto de 2026.

## Objetivo

La v2.1.2 corrige la lectura humana del inventario sin alterar qué unidades pueden ofrecerse, termina el pulido visual de Inicio y Productos, mejora la separación de grupos en Volumen SPT y extiende las comparaciones trimestrales de Mars, NutriPet y Baires a toda su ventana visible.

## Stock del almacén

La auditoría del paquete activo y una consulta de sólo lectura a la fuente confirmaron que el programa ya solicita exclusivamente empresa 3, sucursal 3 y almacén 2, identificado como **Mar del Plata [WPM]**. Los otros trece almacenes informados por el maestro son especiales y no se suman.

La diferencia estaba en el significado de la cifra mostrada: `unidad1Disponible` se presentaba como “stock”, aunque corresponde a la disponibilidad posterior a pedidos pendientes. La fuente también entrega `unidad1`, que representa la existencia física del almacén, y `unidad1NPEPendientes`, que explica lo comprometido.

En el paquete activo auditado:

- 13.410 productos tienen una fila única de inventario dentro de 3/3/2;
- 139 productos presentan compromisos pendientes;
- la existencia física suma 347.825,99 U1;
- la disponibilidad suma 346.148,99 U1;
- las 1.677 U1 de diferencia reconcilian exactamente con pedidos pendientes;
- U2 también reconcilia, pero no se convierte a U1 cuando el maestro no informa una relación confiable.

La ficha de producto pasa a distinguir:

- **Existencia física · almacén 2**;
- **Comprometido en pedidos**;
- **Disponible para vender**.

La cobertura, las alertas de quiebre, las recomendaciones y las oportunidades continúan usando disponibilidad. Esto evita ofrecer unidades ya comprometidas. Las vistas de marcas, comparación y búsqueda también aclaran qué cifra es física y cuál está disponible.

Los snapshots anteriores siguen siendo legibles: mientras no exista una nueva actualización aprobada muestran la disponibilidad heredada y explican que todavía no poseen la existencia física separada. La actualización siguiente incorpora las tres señales sin modificar datos operativos.

La auditoría de alcance también se endurece: una fila técnica de empresa 65535 sólo puede asociarse a 3/3/2 cuando declara explícitamente sucursal 3 y almacén 2, y existencia física, disponibilidad y pedidos pendientes U1/U2 son exactamente cero. Una fila global no nula queda bloqueada aunque toda su existencia esté comprometida.

## Interfaz

- Precios y evolución conserva la altura completa de cada producto y deja desplazar la lista sin comprimir ni recortar las fichas.
- Los accesos de Inicio adoptan la jerarquía visual del Centro de reportes, con iconos, tonos y una acción clara para abrir cada sección.
- Las pestañas **Comprobantes** y **Clientes** de Cobranzas respetan el mismo margen que el resto del contenido.
- Mapa operativo elimina “Información técnica del mapa”.
- Volumen SPT separa mejor cada grupo de Mezcla: nombre y porcentaje ganan jerarquía, y cada bloque tiene límites visuales claros.

## Comparaciones trimestrales

Las series trimestrales dejaron de depender solamente del año seleccionado y ahora siguen la misma ventana visible del reporte:

- NutriPet y Baires muestran los cinco trimestres que intersectan sus últimos 13 meses.
- Mars agrupa sus últimos 13 períodos comerciales según su calendario propio; con el corte actual abarca Q4 2025 a Q3 2026.
- Cada punto informa año, fechas reales, parcialidad, kilos, facturación y clientes.
- La comparación interanual utiliza exactamente el mismo tramo del año anterior.
- Si la cobertura anterior no alcanza, se declara **Sin cobertura interanual comparable** en lugar de completar ceros.
- El desplazamiento horizontal afecta sólo al gráfico; el encabezado permanece en su lugar.
- Las exportaciones usan las mismas fechas, comparaciones y advertencias que la pantalla.

## Robustez de las actualizaciones

La actualización real del 25 de agosto llegó correctamente hasta la auditoría integral y fue rechazada antes de activar el manifiesto porque una oportunidad de sustitución proponía a un cliente otro producto que ya integraba sus compras observables. La ruta general de oportunidades ya excluía esos productos, pero la ruta específica de sustitutos sólo descartaba el artículo sin disponibilidad.

La v2.1.2 aplica la exclusión a todos los productos comprados también al construir sustitutos y vuelve a comprobar el contrato antes de publicar el resultado. La auditoría no se relaja: sigue bloqueando cualquier contradicción y ahora incluye los IDs de los productos repetidos en el diagnóstico.

## Reglas que no cambian

- Los cálculos determinísticos siguen siendo la fuente de verdad.
- El inventario continúa limitado a empresa 3, sucursal 3 y almacén 2.
- La IA no modifica cifras ni se ejecuta al abrir estas vistas.
- Usuarios, sesiones, objetivos, gestiones, vistas, actividad, alertas y artefactos permanecen fuera de los paquetes comerciales actualizables.
- Continúa una sola instancia con SQLite, disco persistente, programador interno y activación atómica.

## Publicación

Esta rama no realiza merge, push ni despliegue por sí sola. Antes de publicar corresponde verificar Git, sincronización con `main`, pruebas, build, `git diff --check` y ausencia de una actualización de datos en curso.
