# Vectorización de productos v2.1 · v0.3.2

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

Cachorros, Adultos y Senior ya no son sólo etiquetas visibles: intervienen en el peso de similitud y las etapas incompatibles reciben una penalización. La versión 2.1 reconoce además expresiones observadas en GESI como `primer año`, `etapa 1`, `mature` y abreviaturas contextuales de adulto.

El porte requiere una expresión referida a la mascota, como `razas pequeñas`, `small breed`, `mordida mediana` o `large & giant`. Palabras aisladas como `mini`, `small` o `grande` no alcanzan porque pueden describir envases, exhibidores o grandes animales. Un producto Medium & Large puede tener afinidad simultánea con mascotas medianas y grandes.

### Necesidades y sabores

Las necesidades específicas complementan el vector Funcional y permiten distinguir dos productos terapéuticos con usos diferentes. Se activan solamente por señales declaradas. Los sabores se asignan únicamente cuando el artículo ya fue identificado como alimento o snack para perros o gatos; por eso un condimento para pescado de consumo humano no recibe el vector Pescado.

### Premium y Económico por precio relativo

Una mención explícita como `Premium`, `Maintenance` o familia `Masivo` sigue siendo evidencia válida. La v2.1 suma una segunda vía basada en precio por kilo, con estas restricciones:

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

## Similitud v2.1

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

En el snapshot del 20/07/2026:

- 1.679 productos forman el catálogo operativo;
- 1.633 tienen marca verificable;
- 1.513 tienen grupo verificable;
- 1.491 tienen al menos una señal vectorial;
- 188 quedan con vector vacío y perfil limitado, sin completar atributos artificialmente;
- 294 tienen peso neto inequívoco y 290 permiten mostrar precio por kilo;
- 62 quedan en el cuartil económico, 135 en precio de mercado y 74 en el cuartil premium de una cohorte válida;
- el porte alcanza 36 productos pequeños, 25 medianos y 18 grandes; un producto puede pertenecer a más de un porte cuando la fórmula lo declara;
- las nuevas necesidades específicas conservan muestras pequeñas pero reales: 14 esterilizados, 5 de control de peso, 5 de piel/pelaje, 5 urinarios, 1 digestivo y 16 dentales.

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

## Uso en recomendaciones

El perfil del cliente sigue ponderando productos comprados por gasto, para no equiparar unidades incompatibles. La afinidad usa el vector v2.1; la recomendación conserva adopción en pares, adopción zonal, rotación, compatibilidad de especie y nivel de confianza. Los clientes inactivos y los productos sin stock continúan excluidos.

## Mantenimiento

Al cambiar una regla:

1. agregar o ajustar una prueba en `shared/product-vectors.test.ts`;
2. regenerar el snapshot desde la captura validada con `pnpm run sync:gesi`;
3. ejecutar `pnpm test`, `pnpm run build` y `pnpm run audit:data`;
4. revisar visualmente edad, porte, precio relativo, alimento seco, húmedo, snacks, farmacia, higiene, accesorios y artículos sin clasificación;
5. documentar cualquier nueva inferencia y su evidencia.
