# Salice Inteligente v0.9.6 · Calidad geográfica de clientes

## Objetivo

Evitar que una coordenada ambigua de GESI dibuje clientes de Mar del Plata, la costa o pueblos bonaerenses en Capital u otras provincias, sin borrar cuentas ni modificar sus datos comerciales.

## Fuente y criterio

- Dirección, localidad y coordenadas continúan proviniendo de GESI.
- La aplicación normaliza variantes de escritura de la localidad y obtiene una referencia robusta usando la mediana de coordenadas compatibles observadas. Para localidades con poca muestra utiliza un catálogo local explícito de centros.
- Una coordenada se corrige únicamente cuando se encuentra a más de 45 km de la referencia de su localidad.
- El reemplazo representa la localidad, no el domicilio exacto. La coordenada original, el motivo y la precisión quedan conservados en el contrato del cliente.
- Si la coordenada está fuera de la zona comercial y la localidad no permite una corrección segura, el cliente queda `Pendiente de revisión` y no se dibuja.

No se consulta un geocodificador externo, no se transmiten domicilios y no se modifica el maestro de GESI.

## Experiencia de uso

- `Mapa operativo → Ubicación → Corregida automáticamente` muestra exclusivamente los clientes ajustados.
- Los marcadores corregidos tienen un contorno azul y el tooltip aclara que se trata de una referencia aproximada.
- La ficha del cliente explica el motivo y confirma que la dirección original no fue modificada.
- El mismo filtro está disponible en `Clientes`; allí también puede consultarse `Pendiente de revisión`.
- El alcance `Mar del Plata y zona` incluye la costa atlántica hasta San Clemente y los pueblos bonaerenses observados en la operación.

## Resultado sobre el corte activo

La migración en lectura del snapshot del 25/07/2026 detectó 26 clientes activos con coordenadas incompatibles y cuatro casos que no podían corregirse con seguridad. Después del control no queda ningún cliente activo dibujado en el área de Capital Federal.

Todos los clientes continúan participando en sus reportes, ventas, cobranzas y perfiles. La calidad geográfica sólo controla su representación en el mapa.

## Criterio de cierre

- Coordenadas incompatibles detectadas de manera determinística.
- Correcciones aproximadas claramente identificadas y auditables.
- Casos inciertos excluidos únicamente del mapa.
- Filtros disponibles tanto en el mapa como en el directorio de clientes.
- Sin geocodificación externa ni cambios automáticos sobre GESI.
