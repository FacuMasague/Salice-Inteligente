# Salice Inteligente v1.4.0

## Objetivo

La v1.4.0 reduce la carga visual y hace que la operación completa sea utilizable en pantallas de menor resolución, manteniendo intactos los universos comerciales, la persistencia y las fuentes determinísticas.

## Densidad y navegación

- La interfaz compacta es la opción predeterminada y está optimizada para anchos desde 720 px.
- La vista amplia continúa disponible en Sistema → Configuración.
- La barra lateral comienza contraída por debajo de 900 px, responde también cuando la ventana cruza ese ancho y puede abrirse cuando se necesita.
- La búsqueda global se cierra al hacer clic fuera de ella.
- Ayuda deja de ocupar una pestaña de Configuración y pasa a ser una sección propia de Sistema.

## Tablas y mapas

- Los encabezados permanecen visibles al desplazarse en tablas extensas.
- En modo compacto ninguna tabla oculta ni recorta columnas para entrar en pantalla: cuando el contenido no puede agruparse con claridad, la tabla conserva todas sus columnas y ofrece desplazamiento horizontal propio sin ensanchar la página completa.
- Clientes elimina las columnas GESI/Salice, Cobranza y Oportunidad, y conserva una única lectura de Prioridad.
- Productos simplifica “Estado y explicación” a “Estado”.
- Cartera elimina Antigüedad, renombra “Compra/emisión” como “Emisión” y deja de mostrar un contador fijo sin significado operativo.
- El mapa repliega filtros y leyenda; al abrir los filtros reserva espacio dentro del mapa para que no tapen sus datos.

## Fichas conectadas

Productos y marcas se abren como paneles emergentes sobre el contexto actual. Desde una marca se puede abrir un producto y, al cerrar, se conserva la pantalla que la persona estaba utilizando.

## Facturación y kilos

Las lecturas comerciales principales muestran facturación y kilos juntos. Esto incluye clientes, vendedores, mapa, Reporte General, Ventas Comercial, SPT, Mars, NutriPet, Baires, demanda de productos y oportunidades. Cuando una presentación no permite convertir unidades a kilos, la interfaz lo marca como conversión parcial en vez de inventar el dato.

Los indicadores financieros puros —saldos, deuda, vencimientos y cobranza— continúan expresados en dinero porque no representan volumen vendido.

## Objetivos comerciales

La creación, edición, selección mensual, objetivos de clientes, facturación de Autoservicio, historial y exportación incorporados en v1.3.1 se mantienen dentro de Reporte General. La densidad compacta mejora el editor sin crear catálogos paralelos de vendedores o productos.

## Verificación

```bash
pnpm test
pnpm run build
```
