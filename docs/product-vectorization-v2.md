# Vectorización de productos v2.2 · v0.5.4

## Objetivo

Representar atributos comerciales comparables sin inventar características que GESI no informa. El vector sirve para ordenar, comparar y recomendar; no es una predicción de venta ni una descripción nutricional completa.

La implementación ejecutable vive en `shared/product-vectors.ts`. La normalización de la captura se realiza en `server/gesi/normalize.ts`.

## Fuentes usadas

Cada producto puede aportar señales desde:

- nombre y descripción extendida;
- rubro y subrubro;
- marca (`filtroArticulos1ID`);
- línea (`filtroArticulos2ID`);
- familia comercial (`filtroArticulos3ID`);
- grupo de artículos (`grupoArtID`);
- presentación.

Los maestros de marca, línea, familia y grupo se capturan desde GESI. Un valor faltante se muestra como no informado y no se reemplaza por el subrubro ni por una equivalencia inferida.

## Las 33 dimensiones

Las dimensiones se agrupan para que el perfil sea legible:

- Especie: Perros, Gatos y Otras especies.
- Edad y tamaño: Cachorros, Adultos, Senior, Mascota pequeña, Mascota mediana y Mascota grande.
- Posicionamiento: Premium, Económico, Natural, Granel y Promocional.
- Tipo: Alimento seco, Alimento húmedo, Snacks, Farmacia, Antiparasitario, Higiene, Accesorios y Consumo humano.
- Necesidades: Funcional, Esterilizados, Control de peso, Piel y pelaje, Salud urinaria, Salud digestiva y Salud dental.
- Proteína o sabor: Pollo, Carne vacuna, Pescado y Cordero.

Los valores van de 0 a 100:

- 100 representa una clasificación estructurada explícita o una señal de máxima fuerza;
- valores intermedios representan señales menos directas y documentadas, por ejemplo familia comercial Masivo → Económico 62;
- 0 significa “sin evidencia en las fuentes disponibles”, no “atributo imposible”.

La coincidencia se realiza por palabras o frases completas. Por ejemplo, `Cat` como línea identifica Gatos, pero “catéter” no lo hace.

### Edad y tamaño

Cachorros, Adultos y Senior no son sólo etiquetas visibles: intervienen en el peso de similitud y las etapas incompatibles reciben una penalización. La versión 2.2 agrega expresiones observadas como `starter`, `growth`, `ageing` y `adulto mayor`, además de las variantes ya cubiertas.

El porte requiere una expresión referida a la mascota, como `razas pequeñas`, `small breed`, `mordida mediana` o `large & giant`. Palabras aisladas como `mini`, `small` o `grande` no alcanzan porque pueden describir envases, exhibidores o grandes animales. Un producto Medium & Large puede tener afinidad simultánea con mascotas medianas y grandes.

### Necesidades y sabores

Las necesidades específicas complementan el vector Funcional y permiten distinguir dos productos terapéuticos con usos diferentes. Se activan solamente por señales declaradas. Los sabores se asignan únicamente cuando el artículo ya fue identificado como alimento o snack para perros o gatos; por eso un condimento para pescado de consumo humano no recibe el vector Pescado.

### Premium y Económico por precio relativo

Una mención explícita como `Premium`, `Maintenance` o familia `Masivo` sigue siendo evidencia válida. La v2.2 conserva la vía basada en precio por kilo, con estas restricciones:

1. sólo alimentos secos con precio y peso neto inequívocos;
2. comparación separada para perros y gatos;
3. bandas de presentación hasta 3 kg, de 3 a 10 kg y mayores de 10 kg;
4. sólo artículos activos y no promocionales;
5. al menos doce productos comparables después de retirar precios extremos fuera de un rango robusto alrededor de la mediana;
6. cuartil inferior → Económico; cuartil superior → Premium; zona central → precio de mercado sin agregar vector.

El precio total de una bolsa nunca se compara directamente con otra presentación. Precio alto tampoco se presenta como prueba de calidad nutricional: la evidencia visible dice `Precio relativo` y conserva el tamaño y la cantidad de comparables.

## Correcciones frente a v1.1

- Ya no se asignan Perros 35 y Gatos 35 por ser un artículo veterinario.
- Ya no se asigna Adultos 45 por ausencia de cachorro o senior.
- Las líneas estructuradas de GESI se interpretan de forma explícita: `Adulto` y `Puppy` son caninas, mientras que `Cat` es felina. Esta regla fue contrastada contra el catálogo real y no reemplaza evidencia contradictoria inventada.
- Ya no se asigna Premium o Económico por ser alimento sin evidencia de posicionamiento.
- Un fármaco no recibe Funcional por defecto.
- Una bolsa grande no se clasifica como Granel sin una señal explícita.
- Marca y subrubro se mantienen como dimensiones descriptivas diferentes.

Estas correcciones reducen similitudes altas producidas por rellenos compartidos y conservan vacíos explícitos cuando la API no permite clasificar.

## Cambios auditados en v2.2

- Las negaciones (`sin pollo`, `no apto para gatos`) no se convierten en afinidades positivas.
- `Perros y gatos`, `todas las edades` y `Medium & Large` quedan como combinaciones declaradas, no como contradicciones.
- El porte sólo se toma de expresiones referidas a la mascota; peso y tamaño del envase no lo determinan.
- En el legado Drovet, `Rubro = Alimentos Balanceados` exige una segunda señal de alimento. Formas farmacéuticas e instrumental observados recuperan su tipo sin inventar especie.
- Rubro, línea y relaciones U2/U1 estructuradas tienen prioridad. Una ausencia o ambigüedad permanece visible.
- Rotación, adopción y popularidad siguen separadas de las 33 dimensiones descriptivas.

## Similitud v2.2

La comparación final se compone de:

1. Perfil vectorial ponderado, 80%: combina coseno ponderado y solapamiento de magnitudes. Especie, etapa de vida y tipo de producto pesan más que posicionamiento secundario.
2. Clasificación comercial, 20%: compara rubro, subrubro, marca, línea, familia comercial y grupo cuando ambos productos poseen el dato.

Una incompatibilidad explícita entre producto sólo para perros y producto sólo para gatos penaliza el componente vectorial. También se penalizan Cachorro frente a Senior, Cachorro frente a Adulto exclusivo y porte pequeño frente a porte grande exclusivo. Los productos que declaran más de una etapa o porte no reciben esa penalización. El resultado se redondea a un porcentaje entre 0 y 100.

La ficha muestra además:

- porcentaje vectorial;
- porcentaje de clasificación comercial;
- confianza de la comparación, limitada por el producto con menor calidad de perfil;
- coincidencias y diferencias principales.

La confianza no modifica el porcentaje de similitud: informa si existen fuentes suficientes para interpretarlo.

## Calidad y evidencia

`sourceCoverage` resume qué campos descriptivos y maestros estaban disponibles. `confidence` combina esa cobertura con la fuerza de las señales encontradas. Cada dimensión positiva guarda hasta cuatro evidencias visibles, como `Línea: Cat` o `Rubro: Alimento Húmedo`.

En el snapshot activo del 22/07/2026 con v2.2:

- 2.156 productos forman el catálogo operativo;
- 1.906 tienen al menos una señal vectorial;
- 250 quedan con vector vacío y perfil limitado, sin completar atributos artificialmente;
- 474 tienen peso neto reconocido y 443 permiten mostrar precio por kilo;
- no quedan contradicciones no declaradas y 19 productos registran combinaciones explícitas válidas;
- 244 perfiles con confianza menor a 45 quedan listados para revisión humana, sin corrección automática.

## Información comercial de la ficha

- `units90d`: unidades facturadas en renglones positivos de producto durante 90 días.
- `monthlyUnits`: `units90d ÷ 3`, redondeado para presentación.
- `sales90d`: importe de factura atribuido proporcionalmente a los renglones positivos del producto.
- `clients90d`: clientes únicos compradores durante la ventana.
- `lastSaleAt`: última factura con detalle positivo observada en la captura.
- `stockCoverageMonths`: stock disponible dividido por la rotación mensual exacta. Queda nulo cuando no hay rotación suficiente.
- `contentKg`: peso neto reconocido en una presentación inequívoca; no convierte litros, dosis, cajas o unidades.
- `referencePricePerKg`: precio GESI dividido por `contentKg`.
- `pricePosition`: cuartil económico, mercado, cuartil premium o sin cohorte suficiente.

No se presenta margen porque la fuente operativa no entrega una definición validada para ese indicador.

### Presentación administrativa desde v0.5.3

Los vectores ya no ocupan la superficie principal de la ficha. Una función determinística resume únicamente las afinidades positivas en lenguaje cotidiano; cuando no existe evidencia suficiente, usa la clasificación explícita del rubro y declara la limitación.

La ficha habitual muestra datos comerciales, evolución, compradores, inventario y alternativas explicadas. `Ver análisis técnico` conserva los 33 valores, evidencias, cobertura y confianza. El explorador completo continúa en `Productos → Herramientas técnicas`. Ocultar esta información por defecto no cambia vectores, algoritmos ni auditorías.

### Comparación operativa desde v0.5.5

La comparación deja de ser un selector técnico de dos artículos dentro de la ficha. `Productos → Comparar` conserva entre dos y cuatro productos y separa compatibilidad de uso, clasificación comercial, presentación, posicionamiento de precio, comportamiento comercial y confianza de los datos.

La sugerencia de comparables pondera uso, clasificación y presentación antes de la confianza. Una coincidencia vectorial alta no basta para declarar sustitución directa: una especie, etapa, tipo o presentación incompatible permanece visible en la conclusión.

El precio total sólo puede señalar una ventaja cuando las presentaciones son equivalentes. El precio por kilo exige peso inequívoco y mismo uso principal. Stock y rotación U1 no resaltan ventajas entre envases distintos; cobertura sólo se contrasta cuando todos los artículos tienen rotación e inventario utilizables. Las cifras siempre se muestran, aunque la comparación no sea válida.

La matriz completa de 33 dimensiones continúa disponible como detalle técnico opcional. No se usa para ocultar datos comerciales ni para inventar atributos ausentes.

### Demanda y rotación desde v0.5.6

Demanda, compradores, variación y estabilidad permanecen fuera de las 33 dimensiones descriptivas. Se calculan desde los movimientos históricos GESI para ventanas de 30, 90 y 180 días y nunca modifican el vector, la similitud ni la confianza descriptiva.

Un producto puede ser muy similar a otro y tener una rotación distinta; también puede acelerar sin que eso pruebe compatibilidad o sustitución. `Nuevo observado` describe la primera venta dentro de la cobertura comercial disponible, no una dimensión vectorial ni una fecha inferida de alta.

### Precios observados desde v0.5.7

El posicionamiento económico del vector continúa derivándose de la referencia GESI normalizada por kilo cuando el contenido es verificable. No se reemplaza automáticamente por el precio efectivo, porque descuentos, mix de clientes y condiciones comerciales pueden moverlo sin que cambie el posicionamiento del producto.

Referencia, efectivo e historia son métricas auditables fuera de las 33 dimensiones. Una alerta de cambio tampoco modifica vectores ni recomendaciones por sí sola. Cuando falta un peso inequívoco, el sistema conserva la advertencia de presentación ambigua en vez de forzar un precio por kilo.

## Uso en recomendaciones

Desde v0.5.8 el perfil del cliente sigue ponderando productos comprados por gasto, para no equiparar unidades incompatibles. La afinidad usa el vector v2.2, pero permanece separada de adopción comparable, rotación e inventario. Los pares se ordenan por productos compartidos y señales disponibles de segmento, canal, localidad y zona.

La recomendación distingue faltantes del mix observable, adopción en pares, sustitutos ante quiebre y oportunidades para stock alto. Un sustituto exige compatibilidad de uso y presentación; una similitud vectorial aislada no alcanza. Clientes inactivos, productos sin stock positivo, maestros inactivos, inventario insuficiente e incompatibilidades explícitas quedan excluidos. La confianza informa cobertura de evidencia y no probabilidad de venta. Ninguna sugerencia crea tareas ni registra gestiones.

## Mantenimiento

Al cambiar una regla:

1. agregar o ajustar una prueba en `shared/product-vectors.test.ts`;
2. ejecutar `pnpm run compare:vectors` y revisar los productos cambiados;
3. regenerar un paquete candidato desde la captura validada;
4. ejecutar `pnpm test`, `pnpm run build`, `pnpm run audit:data` y `pnpm run audit:vectors`;
5. revisar visualmente edad, porte, precio relativo, alimento seco, húmedo, snacks, farmacia, higiene, accesorios y artículos sin clasificación;
6. documentar cualquier nueva inferencia y su evidencia.

`pnpm run audit:vectors` guarda `product-vectors.json` en la carpeta de calidad de la generación activa. Informa cobertura, perfiles vacíos o de baja confianza, pesos, combinaciones declaradas, contradicciones, cohortes y cambios. `pnpm run compare:vectors` guarda la comparación completa v2.1 → v2.2.

## Correcciones humanas

La oficina puede corregir una dimensión desde el análisis técnico. Valor, motivo, autor y fecha se guardan en `operations.sqlite`; cada alta, cambio o reversión agrega un evento inmutable. La corrección se aplica al leer el snapshot, por lo que una actualización de GESI no la pisa. Revertirla recupera el valor algorítmico vigente. Este mecanismo es exclusivamente humano: la IA no guarda correcciones automáticamente.
