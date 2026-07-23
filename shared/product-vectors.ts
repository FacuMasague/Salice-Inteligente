import {
  VECTOR_LABELS,
  type Product,
  type ProductVectorMeta,
  type VectorKey,
} from './models.js';

export const VECTOR_KEYS: VectorKey[] = [
  'perros', 'gatos', 'otras_especies', 'cachorros', 'adultos', 'senior',
  'tamano_pequeno', 'tamano_mediano', 'tamano_grande',
  'premium', 'economico', 'natural', 'granel', 'promocional',
  'alimento_seco', 'alimento_humedo', 'snacks', 'farmacia', 'antiparasitario',
  'higiene', 'accesorios', 'consumo_humano', 'funcional', 'esterilizados',
  'control_peso', 'piel_pelaje', 'salud_urinaria', 'salud_digestiva',
  'salud_dental', 'sabor_pollo', 'sabor_carne', 'sabor_pescado', 'sabor_cordero',
];

const VECTOR_WEIGHTS: Record<VectorKey, number> = {
  perros: 1.45,
  gatos: 1.45,
  otras_especies: 1.3,
  cachorros: 1.2,
  adultos: 1,
  senior: 1.2,
  tamano_pequeno: 1.15,
  tamano_mediano: 1.15,
  tamano_grande: 1.15,
  premium: .9,
  economico: .9,
  alimento_seco: 1.25,
  alimento_humedo: 1.25,
  snacks: 1.2,
  farmacia: 1.25,
  antiparasitario: 1.35,
  natural: .75,
  funcional: .75,
  esterilizados: 1.1,
  control_peso: 1.1,
  piel_pelaje: 1.05,
  salud_urinaria: 1.15,
  salud_digestiva: 1.15,
  salud_dental: 1.05,
  higiene: 1.2,
  accesorios: 1.2,
  granel: .75,
  consumo_humano: 1.25,
  promocional: .7,
  sabor_pollo: .65,
  sabor_carne: .65,
  sabor_pescado: .65,
  sabor_cordero: .7,
};

export interface ProductVectorInput {
  name: string;
  description?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  line?: string;
  commercialFamily?: string;
  group?: string;
  pack?: string;
}

type SourceKey = keyof ProductVectorInput;

const SOURCE_LABELS: Record<SourceKey, string> = {
  name: 'Nombre',
  description: 'Descripción',
  category: 'Rubro',
  subcategory: 'Subrubro',
  brand: 'Marca',
  line: 'Línea',
  commercialFamily: 'Familia comercial',
  group: 'Grupo',
  pack: 'Presentación',
};

const SOURCE_RELIABILITY: Record<SourceKey, number> = {
  name: 96,
  description: 88,
  category: 100,
  subcategory: 98,
  brand: 82,
  line: 100,
  commercialFamily: 88,
  group: 78,
  pack: 72,
};

const SOURCE_COVERAGE_WEIGHT: Record<SourceKey, number> = {
  name: 20,
  description: 5,
  category: 18,
  subcategory: 10,
  brand: 15,
  line: 12,
  commercialFamily: 8,
  group: 8,
  pack: 4,
};

const normalize = (value: string | undefined) => (value ?? '')
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLowerCase()
  .replace(/[^a-z0-9+]+/g, ' ')
  .trim();

const hasTerm = (source: string, term: string) => {
  const normalizedTerm = normalize(term);
  return normalizedTerm.length > 0 && ` ${source} `.includes(` ${normalizedTerm} `);
};

const emptyVector = (): Record<VectorKey, number> => Object.fromEntries(
  VECTOR_KEYS.map((key) => [key, 0]),
) as Record<VectorKey, number>;

type EvidenceAccumulator = Partial<Record<VectorKey, { label: string; reliability: number }[]>>;

const compactEvidence = (evidence: EvidenceAccumulator): ProductVectorMeta['evidence'] => Object.fromEntries(
  Object.entries(evidence).map(([key, items]) => [key, [...new Set(items?.map((item) => item.label) ?? [])].slice(0, 4)]),
) as ProductVectorMeta['evidence'];

export function inferProductVectorV21(input: ProductVectorInput): {
  vector: Record<VectorKey, number>;
  meta: ProductVectorMeta;
} {
  const vector = emptyVector();
  const evidence: EvidenceAccumulator = {};
  const sources = (Object.keys(SOURCE_LABELS) as SourceKey[])
    .map((key) => ({ key, raw: input[key] ?? '', normalized: normalize(input[key]) }))
    .filter((source) => source.normalized.length > 0);

  const signal = (key: VectorKey, terms: string[], options: { sources?: SourceKey[]; score?: number; reliability?: number } = {}) => {
    const allowed = options.sources ?? sources.map((source) => source.key);
    for (const source of sources) {
      if (!allowed.includes(source.key) || !terms.some((term) => hasTerm(source.normalized, term))) continue;
      const reliability = options.reliability ?? SOURCE_RELIABILITY[source.key];
      const score = options.score ?? reliability;
      vector[key] = Math.max(vector[key], score);
      const label = `${SOURCE_LABELS[source.key]}: ${source.raw}`;
      evidence[key] = [...(evidence[key] ?? []), { label, reliability }];
    }
  };

  const structured = (key: VectorKey, terms: string[], sourceKeys: SourceKey[], score = 100) => {
    signal(key, terms, { sources: sourceKeys, score, reliability: score });
  };
  const sourceHas = (terms: string[], sourceKeys: SourceKey[]) => sources.some((source) => (
    sourceKeys.includes(source.key) && terms.some((term) => hasTerm(source.normalized, term))
  ));

  // Especie: sólo se asigna cuando existe evidencia explícita. La versión anterior
  // completaba perro/gato por defecto y generaba afinidades ficticias en farmacia.
  signal('perros', ['perro', 'perros', 'canino', 'caninos', 'dog', 'puppy']);
  signal('gatos', ['gato', 'gatos', 'gatito', 'gatitos', 'felino', 'felinos', 'cat', 'kitten']);
  signal('otras_especies', ['equino', 'equinos', 'caballo', 'bovino', 'bovinos', 'ave', 'aves', 'roedor', 'roedores', 'conejo', 'conejos', 'pez', 'peces', 'porcino', 'porcinos', 'ovino', 'ovinos']);
  structured('gatos', ['cat'], ['line'], 100);
  // En el maestro real de GESI, Adulto y Puppy son líneas caninas; Cat es la
  // línea felina. Se sostiene como regla explícita y auditable del catálogo.
  structured('perros', ['adulto', 'puppy'], ['line'], 100);

  signal('cachorros', ['cach', 'cachorro', 'cachorros', 'puppy', 'puppies', 'kitten', 'gatito', 'gatitos', 'junior', 'baby', 'primer ano', 'etapa 1']);
  signal('adultos', ['adulto', 'adultos', 'adult', 'gato ad', 'perro ad', 'ad cat']);
  signal('senior', ['senior', 'mature', 'geriatrico', 'geriatrica', '7+', '7 +']);
  structured('adultos', ['adulto'], ['line'], 100);
  structured('cachorros', ['puppy', 'cachorro', 'kit'], ['line'], 100);

  // Porte de la mascota. Se evitan términos sueltos como "mini", "small" o
  // "grande" porque también describen envases, exhibidores y grandes animales.
  signal('tamano_pequeno', ['raza pequena', 'razas pequenas', 'r pequena', 'small breed', 'mini breed', 'mini small', 'mordida pequena', 'perro pequeno', 'perros pequenos', 'perro chico'], { sources: ['name', 'description', 'line', 'commercialFamily'] });
  signal('tamano_mediano', ['raza mediana', 'razas medianas', 'r mediana', 'medium breed', 'medium large', 'mordida mediana', 'perro mediano', 'perros medianos', 'perro med'], { sources: ['name', 'description', 'line', 'commercialFamily'] });
  signal('tamano_grande', ['raza grande', 'razas grandes', 'r grande', 'large breed', 'large giant', 'medium large', 'mordida grande', 'perro grande', 'perros grandes', 'perro gigante', 'giant breed', 'perro gde', 'perro xl'], { sources: ['name', 'description', 'line', 'commercialFamily'] });

  signal('premium', ['premium', 'super premium', 'ultra premium', 'select', 'holistic', 'high pro']);
  signal('economico', ['economico', 'economica', 'rinde', 'mantenimiento', 'maintenance']);
  structured('economico', ['masivo'], ['commercialFamily'], 62);

  structured('alimento_seco', ['alimentos balanceados', 'alimento balanceado'], ['category'], 100);
  signal('alimento_seco', ['balanceado', 'croqueta', 'croquetas', 'seco', 'dry']);
  structured('alimento_seco', ['large bags', 'small bags'], ['subcategory'], 92);
  structured('alimento_humedo', ['alimento humedo'], ['category'], 100);
  signal('alimento_humedo', ['pouch', 'sobrecito', 'sobrecitos', 'lata', 'latas', 'humedo']);
  structured('alimento_humedo', ['sobrecitos', 'latas'], ['subcategory'], 100);
  if (vector.alimento_humedo >= 95 && sourceHas(['pouch', 'sobrecito', 'sobrecitos', 'lata', 'latas', 'humedo'], ['name', 'description', 'subcategory'])) {
    vector.alimento_seco = 0;
    delete evidence.alimento_seco;
  }
  structured('snacks', ['snacks'], ['category'], 100);
  signal('snacks', ['snack', 'snacks', 'golosina', 'golosinas', 'premio', 'premios', 'treat', 'biscrok']);

  structured('farmacia', ['farmacos', 'biologicos'], ['category'], 100);
  signal('farmacia', ['farmaco', 'farmacos', 'biologico', 'biologicos', 'antibiotico', 'antibioticos', 'antiinflamatorio', 'antiinflamatorios', 'anestesico', 'anestesicos', 'vacuna', 'vacunas', 'oftalmico', 'otico', 'hormonal', 'quirurgico']);
  signal('antiparasitario', ['antiparasitario', 'antiparasitarios', 'pulguicida', 'pulguicidas', 'garrapaticida', 'garrapaticidas', 'mosquicida', 'mosquicidas', 'pipeta', 'pipetas', 'pulga', 'pulgas', 'garrapata', 'garrapatas', 'endectocida']);
  if (vector.antiparasitario > 0 && vector.farmacia === 0) {
    vector.farmacia = 82;
    evidence.farmacia = [{ label: 'Clasificación antiparasitaria', reliability: 82 }];
  }

  signal('natural', ['natural', 'holistic', 'organico', 'organica', 'sin conservantes']);
  signal('funcional', ['renal', 'urinario', 'urinaria', 'gastrointestinal', 'gastro', 'hepatico', 'hepatica', 'hepato', 'diet', 'terapeutico', 'terapeutica', 'cardiaco', 'cardiaca', 'cardio', 'artrosis', 'articular', 'castrado', 'castrados', 'control de peso']);
  signal('esterilizados', ['esterilizado', 'esterilizados', 'esterilizada', 'esterilizadas', 'sterilized', 'neutered', 'castrado', 'castrados', 'castrada', 'castradas']);
  signal('control_peso', ['peso ideal', 'weight control', 'control de peso', 'obesidad']);
  if ((vector.perros >= 55 || vector.gatos >= 55) && (vector.alimento_seco >= 55 || vector.alimento_humedo >= 55)) {
    signal('control_peso', ['light'], { sources: ['name', 'description', 'line'] });
  }
  signal('piel_pelaje', ['dermatologico', 'dermatologica', 'dermal', 'derma', 'derm', 'piel sensible', 'skin care', 'pelaje'], { sources: ['name', 'description', 'category', 'subcategory', 'line'] });
  signal('salud_urinaria', ['urinario', 'urinaria', 'urinary', 'renal', 'vias urinarias']);
  signal('salud_digestiva', ['gastrointestinal', 'gastro', 'digestivo', 'digestiva', 'digestive', 'hepatico', 'hepatica', 'hepato']);
  signal('salud_dental', ['dental', 'dentastix', 'salud oral', 'oral care', 'sarro'], { sources: ['name', 'description', 'category', 'subcategory'] });
  const specificNeedKeys: VectorKey[] = ['esterilizados', 'control_peso', 'piel_pelaje', 'salud_urinaria', 'salud_digestiva', 'salud_dental'];
  if (specificNeedKeys.some((key) => vector[key] > 0) && vector.funcional === 0) {
    vector.funcional = 82;
    evidence.funcional = [{ label: 'Necesidad específica declarada', reliability: 82 }];
  }
  structured('higiene', ['sanitarios', 'higiene'], ['category'], 100);
  signal('higiene', ['higiene', 'sanitario', 'sanitarios', 'shampoo', 'enjuague', 'arena', 'arenas', 'piedra', 'piedras', 'locion', 'desinfectante', 'limpiador']);
  structured('accesorios', ['accesorios', 'instrumental'], ['category'], 100);
  signal('accesorios', ['accesorio', 'accesorios', 'instrumental', 'correa', 'correas', 'collar', 'collares', 'juguete', 'juguetes', 'cama', 'camas', 'comedero', 'comederos', 'transportadora']);
  signal('granel', ['granel']);
  signal('consumo_humano', ['almacen', 'especias', 'condimentos', 'salsas', 'refrigerados', 'congelados', 'infusiones', 'cafe', 'bebidas', 'consumo humano']);
  signal('promocional', ['promocion', 'promociones', 'bonificado', 'bonificada', 'bonificados', 'merchandising', 'material pop', 'combo', 'descuento', 'muestra gratis', 'gratis']);

  const isPetFood = (vector.perros >= 55 || vector.gatos >= 55)
    && (vector.alimento_seco >= 55 || vector.alimento_humedo >= 55 || vector.snacks >= 55);
  if (isPetFood) {
    signal('sabor_pollo', ['pollo', 'chicken'], { sources: ['name', 'description', 'line'] });
    signal('sabor_carne', ['carne', 'carne vacuna', 'beef'], { sources: ['name', 'description', 'line'] });
    signal('sabor_pescado', ['pescado', 'atun', 'salmon', 'fish', 'tuna'], { sources: ['name', 'description', 'line'] });
    signal('sabor_cordero', ['cordero', 'lamb'], { sources: ['name', 'description', 'line'] });
  }

  const sourceCoverage = Math.round(sources.reduce((sum, source) => sum + SOURCE_COVERAGE_WEIGHT[source.key], 0));
  const reliableSignals = Object.values(evidence).flat().map((item) => item.reliability).sort((a, b) => b - a).slice(0, 5);
  const signalConfidence = reliableSignals.length
    ? reliableSignals.reduce((sum, value) => sum + value, 0) / reliableSignals.length
    : 0;
  const confidence = Math.round(Math.min(99, signalConfidence * .72 + sourceCoverage * .28));

  return {
    vector,
    meta: {
      version: '2.1',
      confidence,
      sourceCoverage,
      evidence: compactEvidence(evidence),
    },
  };
}

const V22_FORM_TERMS = [
  'comprimido', 'comprimidos', 'comp', 'iny', 'inyectable', 'inyectables',
  'jarabe', 'colirio', 'gotas', 'capsula', 'capsulas', 'pomada', 'crema dermica',
  'solucion oral', 'suspension oral', 'antibiotico', 'antiinflamatorio', 'eutanasico',
];

const V22_INSTRUMENT_TERMS = [
  'aguja', 'agujas', 'jeringa', 'jeringas', 'bisturi', 'cateter', 'cateteres',
  'guante', 'guantes', 'peladora', 'pelad', 'secador', 'soplador', 'electrificador',
  'arreador', 'caravana', 'caravanas', 'comedero', 'bebedero', 'transportadora',
];

const negatesTerm = (source: string, term: string) => {
  const normalizedTerm = normalize(term);
  return [
    `sin ${normalizedTerm}`,
    `no ${normalizedTerm}`,
    `no apto para ${normalizedTerm}`,
    `no usar en ${normalizedTerm}`,
    `excepto ${normalizedTerm}`,
    `libre de ${normalizedTerm}`,
  ].some((phrase) => hasTerm(source, phrase));
};

/**
 * Motor descriptivo v2.2. Parte de v2.1 para que la comparación sea explícita
 * y aplica únicamente reglas determinísticas relevadas en el catálogo Salice.
 */
export function inferProductVectorV22(input: ProductVectorInput): {
  vector: Record<VectorKey, number>;
  meta: ProductVectorMeta;
} {
  const baseline = inferProductVectorV21(input);
  const vector = { ...baseline.vector };
  const evidence = structuredClone(baseline.meta.evidence);
  const normalized = Object.fromEntries((Object.keys(SOURCE_LABELS) as SourceKey[]).map((key) => [key, normalize(input[key])])) as Record<SourceKey, string>;
  const declaredCombinations: NonNullable<ProductVectorMeta['declaredCombinations']> = {};
  const addedReliability: number[] = [];

  const add = (key: VectorKey, score: number, label: string, reliability = score) => {
    vector[key] = Math.max(vector[key], score);
    evidence[key] = [...new Set([...(evidence[key] ?? []), label])].slice(0, 4);
    addedReliability.push(reliability);
  };
  const clear = (key: VectorKey) => {
    vector[key] = 0;
    delete evidence[key];
  };
  const rawLabel = (source: SourceKey) => `${SOURCE_LABELS[source]}: ${input[source] ?? ''}`;
  const anySourceHas = (terms: string[], sourceKeys: SourceKey[]) => sourceKeys.some((source) => terms.some((term) => hasTerm(normalized[source], term) && !negatesTerm(normalized[source], term)));
  const addFromSources = (key: VectorKey, terms: string[], sourceKeys: SourceKey[], score?: number) => {
    for (const source of sourceKeys) {
      if (!terms.some((term) => hasTerm(normalized[source], term) && !negatesTerm(normalized[source], term))) continue;
      const resolved = score ?? SOURCE_RELIABILITY[source];
      add(key, resolved, rawLabel(source), resolved);
    }
  };

  // Variantes observadas y seguras: se mantienen palabras/frases completas.
  addFromSources('otras_especies', ['canario', 'canarios', 'paloma', 'palomas', 'hamster', 'cobayo', 'cobayos', 'tortuga', 'tortugas', 'peces ornamentales'], ['name', 'description', 'category', 'subcategory', 'line']);
  addFromSources('cachorros', ['starter', 'growth', 'destete'], ['name', 'description', 'line', 'commercialFamily']);
  addFromSources('senior', ['adulto mayor', 'adultos mayores', 'ageing', 'aging', '8+', '10+'], ['name', 'description', 'line', 'commercialFamily']);
  const petContext = (vector.perros >= 55 || vector.gatos >= 55)
    && (vector.alimento_seco >= 55 || vector.alimento_humedo >= 55 || vector.snacks >= 55 || vector.farmacia >= 55);
  if (petContext) {
    addFromSources('control_peso', ['reducido en calorias', 'bajo en calorias', 'weight management', 'satiety'], ['name', 'description', 'line', 'commercialFamily']);
    addFromSources('salud_digestiva', ['intestinal', 'sensitive digestion', 'probiotico', 'probioticos'], ['name', 'description', 'line', 'commercialFamily']);
    addFromSources('piel_pelaje', ['skin', 'coat', 'dermico', 'dermica'], ['name', 'description', 'line', 'subcategory']);
  }

  // Negaciones: una mención explícita de ausencia no constituye sabor/especie.
  const negationSources: SourceKey[] = ['name', 'description', 'line'];
  const removeWhenOnlyNegated = (key: VectorKey, terms: string[]) => {
    const hasPositive = negationSources.some((source) => terms.some((term) => hasTerm(normalized[source], term) && !negatesTerm(normalized[source], term)));
    const hasNegation = negationSources.some((source) => terms.some((term) => negatesTerm(normalized[source], term)));
    if (hasNegation && !hasPositive) clear(key);
  };
  removeWhenOnlyNegated('sabor_pollo', ['pollo', 'chicken']);
  removeWhenOnlyNegated('sabor_carne', ['carne', 'carne vacuna', 'beef']);
  removeWhenOnlyNegated('sabor_pescado', ['pescado', 'atun', 'salmon', 'fish', 'tuna']);
  removeWhenOnlyNegated('sabor_cordero', ['cordero', 'lamb']);
  removeWhenOnlyNegated('perros', ['perro', 'perros', 'canino', 'caninos', 'dog']);
  removeWhenOnlyNegated('gatos', ['gato', 'gatos', 'felino', 'felinos', 'cat']);

  const explicitlyDog = anySourceHas(['perro', 'perros', 'canino', 'caninos', 'dog'], ['name', 'description']);
  const explicitlyCat = anySourceHas(['gato', 'gatos', 'felino', 'felinos', 'cat'], ['name', 'description']);
  if (explicitlyDog && !explicitlyCat && normalized.line === 'cat') clear('gatos');
  if (explicitlyCat && !explicitlyDog && ['adulto', 'puppy'].includes(normalized.line)) clear('perros');

  const multiSpecies = ['perros y gatos', 'perro y gato', 'caninos y felinos', 'dogs and cats'].find((term) => anySourceHas([term], ['name', 'description', 'line']));
  if (multiSpecies) {
    add('perros', 96, `Combinación explícita v2.2: ${multiSpecies}`, 96);
    add('gatos', 96, `Combinación explícita v2.2: ${multiSpecies}`, 96);
    declaredCombinations.species = multiSpecies;
  }
  const allStages = ['todas las edades', 'toda edad', 'all life stages'].find((term) => anySourceHas([term], ['name', 'description', 'line', 'commercialFamily']));
  if (allStages) {
    add('cachorros', 88, `Combinación explícita v2.2: ${allStages}`, 88);
    add('adultos', 88, `Combinación explícita v2.2: ${allStages}`, 88);
    add('senior', 88, `Combinación explícita v2.2: ${allStages}`, 88);
    declaredCombinations.lifeStage = allStages;
  }
  if (anySourceHas(['medium large', 'mediana y grande', 'medianos y grandes'], ['name', 'description', 'line', 'commercialFamily'])) {
    declaredCombinations.petSize = 'Mediano y grande explícito';
  }

  // El porte nunca se toma de Presentación ni de pesos. Sólo expresiones que
  // califican a la mascota pueden sostener estas dimensiones.
  const petSizeSources: SourceKey[] = ['name', 'description', 'line', 'commercialFamily'];
  if (!anySourceHas(['raza pequena', 'razas pequenas', 'r pequena', 'small breed', 'mini breed', 'mini small', 'mordida pequena', 'perro pequeno', 'perros pequenos', 'perro chico'], petSizeSources)) clear('tamano_pequeno');
  if (!anySourceHas(['raza mediana', 'razas medianas', 'medium breed', 'medium large', 'mordida mediana', 'perro mediano', 'perros medianos', 'perro med', 'mediana y grande'], petSizeSources)) clear('tamano_mediano');
  if (!anySourceHas(['raza grande', 'razas grandes', 'large breed', 'large giant', 'medium large', 'mordida grande', 'perro grande', 'perros grandes', 'perro gigante', 'giant breed', 'perro gde', 'perro xl', 'mediana y grande'], petSizeSources)) clear('tamano_grande');

  const drovetContext = hasTerm(normalized.group, 'drovet');
  const structuredFood = hasTerm(normalized.category, 'alimentos balanceados');
  const explicitPetFood = anySourceHas(['balanceado', 'croqueta', 'alimento para perro', 'alimento para gato', 'dog food', 'cat food'], ['name', 'description', 'line', 'commercialFamily'])
    || ((explicitlyDog || explicitlyCat) && anySourceHas(['adulto', 'cachorro', 'puppy', 'kitten', 'senior', 'sabor'], ['name', 'description', 'line']));
  // En el legado Drovet, Rubro=Alimentos Balanceados aparece en fármacos,
  // gasas y líquidos. Exige una segunda señal antes de tratarlo como alimento.
  if (drovetContext && structuredFood && !explicitPetFood) clear('alimento_seco');

  const veterinaryCategory = anySourceHas(['farmacos', 'biologicos', 'antiparasitario interno', 'antiparasitario externo', 'alimentos suplementos y sustitutos'], ['category']);
  if (veterinaryCategory) add('farmacia', 100, rawLabel('category'), 100);
  const instrumentCategory = anySourceHas(['identificacion animal', 'instrumental', 'accesorios'], ['category']);
  if (instrumentCategory) add('accesorios', 100, rawLabel('category'), 100);
  if (drovetContext && anySourceHas(V22_FORM_TERMS, ['name'])) add('farmacia', 84, `Regla contextual v2.2 · Grupo Drovet + forma farmacéutica: ${input.name}`, 84);
  if (drovetContext && anySourceHas(V22_INSTRUMENT_TERMS, ['name'])) add('accesorios', 84, `Regla contextual v2.2 · Grupo Drovet + instrumental: ${input.name}`, 84);
  if (hasTerm(normalized.line, 'grandes animales')) add('otras_especies', 92, rawLabel('line'), 92);

  // Un maestro de tipo explícito prevalece sobre palabras incidentales del
  // nombre, sin borrar afinidades compatibles (p. ej. collar antiparasitario).
  const primaryType = veterinaryCategory || (drovetContext && anySourceHas(V22_FORM_TERMS, ['name'])) ? 'farmacia'
    : instrumentCategory || (drovetContext && anySourceHas(V22_INSTRUMENT_TERMS, ['name'])) ? 'accesorios'
      : anySourceHas(['sanitarios', 'higiene'], ['category']) ? 'higiene'
        : anySourceHas(['almacen', 'refrigerados', 'congelados', 'bebidas', 'consumo humano'], ['category']) ? 'consumo_humano'
          : null;
  if (primaryType) {
    if (primaryType === 'farmacia' || primaryType === 'accesorios' || primaryType === 'higiene') {
      (['alimento_seco', 'alimento_humedo', 'snacks', 'consumo_humano'] as VectorKey[]).forEach(clear);
    } else if (primaryType === 'consumo_humano') {
      (['alimento_seco', 'alimento_humedo', 'snacks'] as VectorKey[]).forEach(clear);
    }
  }

  const confidenceBoost = addedReliability.length ? addedReliability.sort((a, b) => b - a).slice(0, 4).reduce((sum, value) => sum + value, 0) / Math.min(4, addedReliability.length) : 0;
  return {
    vector,
    meta: {
      version: '2.2',
      confidence: Math.round(Math.min(99, Math.max(baseline.meta.confidence, confidenceBoost * .78 + baseline.meta.sourceCoverage * .22))),
      sourceCoverage: baseline.meta.sourceCoverage,
      evidence,
      ...(Object.keys(declaredCombinations).length ? { declaredCombinations } : {}),
    },
  };
}

export const inferProductVectorV2 = inferProductVectorV22;

/**
 * Extrae el contenido de una presentación vendible cuando el texto expresa un
 * peso inequívoco. No intenta convertir cajas, dosis, litros ni unidades.
 */
export function estimateContentKgV21(...values: (string | undefined)[]) {
  const source = values.filter(Boolean).join(' ')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/,/g, '.')
    .replace(/[^a-z0-9.+]+/g, ' ')
    .trim();
  const bonus = source.match(/(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilo|kilos)\b/);
  if (bonus) {
    const total = Number(bonus[1]) + Number(bonus[2]);
    return total > 0 && total <= 50 ? Math.round(total * 1000) / 1000 : null;
  }
  const kilograms = [...source.matchAll(/(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilo|kilos)\b/g)]
    .map((match) => Number(match[1])).filter((value) => value > 0 && value <= 50);
  if (kilograms.length) return Math.round(Math.max(...kilograms) * 1000) / 1000;
  const grams = [...source.matchAll(/(\d+(?:\.\d+)?)\s*(?:g|gr|grs|gramo|gramos)\b/g)]
    .map((match) => Number(match[1]) / 1000).filter((value) => value >= .1 && value <= 50);
  return grams.length ? Math.round(Math.max(...grams) * 1000) / 1000 : null;
}

export function estimateContentKg(...values: (string | undefined)[]) {
  const source = values.filter(Boolean).join(' ')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/,/g, '.')
    .replace(/[^a-z0-9.+x]+/g, ' ')
    .trim();
  const unitToKg = (value: number, unit: string) => unit.startsWith('k') ? value : value / 1000;
  const valid = (value: number) => value > 0 && value <= 50 ? Math.round(value * 1000) / 1000 : null;
  const bonus = source.match(/(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)\s*(kg|kgs|kgr|kilo|kilos)\b/);
  if (bonus) return valid(Number(bonus[1]) + Number(bonus[2]));
  const countFirst = source.match(/(?<!\+)\b(\d{1,3})\s*x\s*(\d+(?:\.\d+)?)\s*(kg|kgs|kgr|kilo|kilos|g|gr|grs|gramo|gramos)\b/);
  if (countFirst) {
    const total = Number(countFirst[1]) * unitToKg(Number(countFirst[2]), countFirst[3]);
    const resolved = valid(total);
    if (resolved != null) return resolved;
  }
  const weightFirst = source.match(/\b(\d+(?:\.\d+)?)\s*(kg|kgs|kgr|kilo|kilos|g|gr|grs|gramo|gramos)\s*x\s*(\d{1,3})(?:\s*u)?\b/);
  if (weightFirst) {
    const total = unitToKg(Number(weightFirst[1]), weightFirst[2]) * Number(weightFirst[3]);
    const resolved = valid(total);
    if (resolved != null) return resolved;
  }
  return estimateContentKgV21(...values);
}

export function resolveProductContentKg(input: {
  unit1?: string;
  unit2?: string;
  unit2PerUnit1?: number | null;
  descriptions: (string | undefined)[];
}) {
  const unit1 = normalize(input.unit1);
  const unit2 = normalize(input.unit2);
  const ratio = Number(input.unit2PerUnit1 ?? 0);
  if (['un', 'unidad', 'u'].includes(unit1) && ['kg', 'kgs', 'kgr', 'kilo', 'kilos'].includes(unit2) && ratio > 0 && ratio <= 50) {
    return Math.round(ratio * 1000) / 1000;
  }
  return estimateContentKg(...input.descriptions);
}

const priceCohort = (product: Product) => {
  if (!product.contentKg || !product.referencePricePerKg || product.vector.alimento_seco < 75 || product.vector.promocional >= 55 || product.masterStatus !== 'active') return '';
  const species = product.vector.perros >= 75 && product.vector.gatos < 25
    ? 'perros'
    : product.vector.gatos >= 75 && product.vector.perros < 25
      ? 'gatos'
      : '';
  if (!species) return '';
  const packBand = product.contentKg <= 3 ? 'hasta 3 kg' : product.contentKg <= 10 ? '3 a 10 kg' : 'más de 10 kg';
  return `${species} · ${packBand}`;
};

/**
 * Desarrolla Económico/Premium con precio por kilo relativo. Sólo compara
 * alimentos secos de la misma especie y banda de presentación, con al menos
 * doce artículos válidos; el resto conserva únicamente evidencia descriptiva.
 */
export function applyCatalogPricePositioning(products: Product[]): Product[] {
  const cohorts = new Map<string, Product[]>();
  products.forEach((product) => {
    const cohort = priceCohort(product);
    if (!cohort) return;
    cohorts.set(cohort, [...(cohorts.get(cohort) ?? []), product]);
  });
  cohorts.forEach((items, cohort) => {
    const values = items.map((item) => item.referencePricePerKg ?? 0).sort((a, b) => a - b);
    const median = values[Math.floor(values.length / 2)] ?? 0;
    cohorts.set(cohort, items.filter((item) => (
      (item.referencePricePerKg ?? 0) >= median * .3 && (item.referencePricePerKg ?? 0) <= median * 3
    )));
  });
  return products.map((product) => {
    const cohort = priceCohort(product);
    const comparable = cohort ? cohorts.get(cohort) ?? [] : [];
    if (!cohort || comparable.length < 12 || !product.referencePricePerKg || !comparable.some((item) => item.id === product.id)) {
      return { ...product, pricePosition: 'unknown' };
    }
    const sorted = comparable.map((item) => item.referencePricePerKg ?? 0).sort((a, b) => a - b);
    const belowOrEqual = sorted.filter((value) => value <= product.referencePricePerKg!).length;
    const percentile = belowOrEqual / sorted.length;
    const vector = { ...product.vector };
    const evidence = { ...product.vectorMeta.evidence };
    const priceLabel = `$${Math.round(product.referencePricePerKg).toLocaleString('es-AR')}/kg · percentil ${Math.round(percentile * 100)} entre ${comparable.length} alimentos secos (${cohort})`;
    let pricePosition: Product['pricePosition'] = 'market';
    if (percentile <= .25) {
      vector.economico = Math.max(vector.economico, Math.round(78 + (.25 - percentile) / .25 * 17));
      evidence.economico = [...new Set([...(evidence.economico ?? []), `Precio relativo: ${priceLabel}`])].slice(0, 4);
      pricePosition = 'budget';
    } else if (percentile >= .75) {
      vector.premium = Math.max(vector.premium, Math.round(78 + (percentile - .75) / .25 * 17));
      evidence.premium = [...new Set([...(evidence.premium ?? []), `Precio relativo: ${priceLabel}`])].slice(0, 4);
      pricePosition = 'premium';
    }
    return {
      ...product,
      pricePosition,
      vector,
      vectorMeta: {
        ...product.vectorMeta,
        confidence: pricePosition === 'market' ? product.vectorMeta.confidence : Math.max(product.vectorMeta.confidence, 86),
        evidence,
      },
    };
  });
}

function weightedCosine(a: Record<VectorKey, number>, b: Record<VectorKey, number>) {
  const dot = VECTOR_KEYS.reduce((sum, key) => sum + a[key] * b[key] * VECTOR_WEIGHTS[key], 0);
  const magnitudeA = Math.sqrt(VECTOR_KEYS.reduce((sum, key) => sum + a[key] ** 2 * VECTOR_WEIGHTS[key], 0));
  const magnitudeB = Math.sqrt(VECTOR_KEYS.reduce((sum, key) => sum + b[key] ** 2 * VECTOR_WEIGHTS[key], 0));
  return magnitudeA && magnitudeB ? dot / (magnitudeA * magnitudeB) : 0;
}

function weightedOverlap(a: Record<VectorKey, number>, b: Record<VectorKey, number>) {
  const numerator = VECTOR_KEYS.reduce((sum, key) => sum + Math.min(a[key], b[key]) * VECTOR_WEIGHTS[key], 0);
  const denominator = VECTOR_KEYS.reduce((sum, key) => sum + Math.max(a[key], b[key]) * VECTOR_WEIGHTS[key], 0);
  return denominator ? numerator / denominator : 0;
}

export function vectorSimilarityV2(a: Record<VectorKey, number>, b: Record<VectorKey, number>) {
  const cosine = weightedCosine(a, b);
  const overlap = weightedOverlap(a, b);
  let score = (cosine * .62 + overlap * .38) * 100;
  const dogCatConflict = (a.perros >= 75 && b.gatos >= 75 && a.gatos < 25 && b.perros < 25)
    || (a.gatos >= 75 && b.perros >= 75 && a.perros < 25 && b.gatos < 25);
  if (dogCatConflict) score *= .28;
  const puppySeniorConflict = (a.cachorros >= 75 && b.senior >= 75 && a.senior < 25 && b.cachorros < 25)
    || (a.senior >= 75 && b.cachorros >= 75 && a.cachorros < 25 && b.senior < 25);
  if (puppySeniorConflict) score *= .52;
  const puppyAdultConflict = (a.cachorros >= 75 && b.adultos >= 75 && a.adultos < 25 && b.cachorros < 25)
    || (a.adultos >= 75 && b.cachorros >= 75 && a.cachorros < 25 && b.adultos < 25);
  if (puppyAdultConflict) score *= .72;
  const smallLargeConflict = (a.tamano_pequeno >= 75 && b.tamano_grande >= 75 && a.tamano_grande < 25 && b.tamano_pequeno < 25)
    || (a.tamano_grande >= 75 && b.tamano_pequeno >= 75 && a.tamano_pequeno < 25 && b.tamano_grande < 25);
  if (smallLargeConflict) score *= .58;
  return Math.max(0, Math.min(100, score));
}

export interface ProductSimilarity {
  score: number;
  vectorScore: number;
  taxonomyScore: number;
  confidence: number;
  matches: string[];
  differences: string[];
}

const usefulValue = (value: string | undefined) => {
  const normalized = normalize(value);
  return normalized && !normalized.startsWith('sin ') ? normalized : '';
};

export function compareProductsV2(a: Product, b: Product): ProductSimilarity {
  if (a.id === b.id) return { score: 100, vectorScore: 100, taxonomyScore: 100, confidence: a.vectorMeta.confidence, matches: ['Mismo producto'], differences: [] };
  const taxonomyFields: { label: string; matchLabel: string; a: string; b: string; weight: number }[] = [
    { label: 'rubro', matchLabel: 'Mismo rubro', a: a.family, b: b.family, weight: 24 },
    { label: 'subrubro', matchLabel: 'Mismo subrubro', a: a.subcategory, b: b.subcategory, weight: 12 },
    { label: 'marca', matchLabel: 'Misma marca', a: a.brand, b: b.brand, weight: 18 },
    { label: 'línea', matchLabel: 'Misma línea', a: a.line, b: b.line, weight: 20 },
    { label: 'familia comercial', matchLabel: 'Misma familia comercial', a: a.commercialFamily, b: b.commercialFamily, weight: 12 },
    { label: 'grupo', matchLabel: 'Mismo grupo', a: a.group, b: b.group, weight: 14 },
  ].filter((field) => usefulValue(field.a) && usefulValue(field.b));
  const taxonomyWeight = taxonomyFields.reduce((sum, field) => sum + field.weight, 0);
  const matchingTaxonomy = taxonomyFields.filter((field) => usefulValue(field.a) === usefulValue(field.b));
  const taxonomyScore = taxonomyWeight
    ? matchingTaxonomy.reduce((sum, field) => sum + field.weight, 0) / taxonomyWeight * 100
    : 0;
  const vectorScore = vectorSimilarityV2(a.vector, b.vector);
  const score = Math.round(vectorScore * .8 + taxonomyScore * .2);
  const sharedVectors = VECTOR_KEYS
    .filter((key) => a.vector[key] >= 55 && b.vector[key] >= 55)
    .sort((left, right) => Math.min(b.vector[right], a.vector[right]) - Math.min(b.vector[left], a.vector[left]))
    .slice(0, 4)
    .map((key) => VECTOR_LABELS[key]);
  const differentVectors = VECTOR_KEYS
    .filter((key) => Math.abs(a.vector[key] - b.vector[key]) >= 45)
    .sort((left, right) => Math.abs(a.vector[right] - b.vector[right]) - Math.abs(a.vector[left] - b.vector[left]))
    .slice(0, 3)
    .map((key) => VECTOR_LABELS[key]);
  return {
    score,
    vectorScore: Math.round(vectorScore),
    taxonomyScore: Math.round(taxonomyScore),
    confidence: Math.round(Math.min(a.vectorMeta.confidence, b.vectorMeta.confidence)),
    matches: [...matchingTaxonomy.map((field) => field.matchLabel), ...sharedVectors].slice(0, 5),
    differences: differentVectors,
  };
}
