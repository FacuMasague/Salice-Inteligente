import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, ChevronRight, GitCompareArrows, Info, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  areCoverageValuesComparable, arePricePerKgComparable, compareProductPair, suggestComparableProducts,
} from '../../shared/product-comparison';
import { productPresentationLabel, summarizeProductForOffice } from '../../shared/product-insights';
import { VECTOR_GROUPS, VECTOR_LABELS, type Product, type VectorKey } from '../../shared/models';
import { money, number, shortDate } from '../lib/format';

interface ProductComparisonWorkspaceProps {
  products: Product[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onOpenProduct: (product: Product) => void;
  onOpenBrand: (brand: string) => void;
}

interface ComparisonRow {
  id: string;
  label: string;
  values: Array<{ display: ReactNode; key: string; numeric?: number | null }>;
  comparable?: boolean;
  advantage?: 'min' | 'max';
  note?: string;
}

interface ComparisonBlock {
  id: string;
  title: string;
  description: string;
  rows: ComparisonRow[];
}

const useful = (value: string) => value && !value.toLocaleLowerCase('es').startsWith('sin ') ? value : 'No informado';
const raw = (value: unknown) => value == null || value === '' ? '∅' : String(value);
const positionLabel = (product: Product) => product.pricePosition === 'budget' ? 'Bajo dentro de comparables' : product.pricePosition === 'premium' ? 'Alto dentro de comparables' : product.pricePosition === 'market' ? 'Zona media de comparables' : 'Sin cohorte suficiente';
const masterLabel = (product: Product) => product.masterStatus === 'active' ? 'Activo' : product.masterStatus === 'inactive' ? 'Inactivo' : 'Sin estado';
const commercialLabel = (product: Product) => product.commercialStatus === 'commercializable' ? 'Comercializable observable' : product.commercialStatus === 'not_commercializable' ? 'No comercializable con señales actuales' : 'Sin información suficiente';
const inventoryQualityLabel = (product: Product) => product.inventory.quality === 'reliable' ? 'Confiable' : product.inventory.quality === 'attention' ? 'Con salvedades' : 'Insuficiente';

function dominantFeatures(product: Product, keys: VectorKey[], limit = 3) {
  const values = keys.filter((key) => product.vector[key] >= 45).sort((left, right) => product.vector[right] - product.vector[left]).slice(0, limit);
  return values.length ? values.map((key) => VECTOR_LABELS[key]).join(', ') : 'Sin señales suficientes';
}

function samePresentation(products: Product[]) {
  if (products.length < 2) return false;
  if (products.every((product) => product.contentKg && product.contentKg > 0)) {
    const values = products.map((product) => product.contentKg ?? 0);
    return Math.max(...values) / Math.min(...values) <= 1.1;
  }
  const first = `${products[0]?.unit}|${productPresentationLabel(products[0])}`.toLocaleLowerCase('es');
  return products.every((product) => `${product.unit}|${productPresentationLabel(product)}`.toLocaleLowerCase('es') === first);
}

function value(display: ReactNode, key = String(display), numeric?: number | null) {
  return { display, key, numeric };
}

function rowDiffers(row: ComparisonRow) {
  return new Set(row.values.map((item) => item.key)).size > 1;
}

export function ProductComparisonWorkspace({ products, selectedIds, onSelectionChange, onOpenProduct, onOpenBrand }: ProductComparisonWorkspaceProps) {
  const selected = selectedIds.map((id) => products.find((product) => product.id === id)).filter((product): product is Product => Boolean(product)).slice(0, 4);
  const [query, setQuery] = useState('');
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase('es');
  const searchResults = useMemo(() => normalizedQuery.length < 2 ? [] : products
    .filter((product) => !selectedIds.includes(product.id))
    .filter((product) => `${product.name} ${product.sku} ${product.brand} ${product.family} ${product.subcategory} ${product.line} ${product.pack}`.toLocaleLowerCase('es').includes(normalizedQuery))
    .sort((left, right) => right.monthlyUnits - left.monthlyUnits || left.name.localeCompare(right.name, 'es'))
    .slice(0, 10), [normalizedQuery, products, selectedIds]);
  const suggestions = useMemo(() => selected[0] ? suggestComparableProducts(selected[0], products, 18).filter((item) => !selectedIds.includes(item.product.id)).slice(0, 6) : [], [products, selected, selectedIds]);
  const pairComparisons = useMemo(() => selected.slice(1).map((product) => compareProductPair(selected[0], product)), [selected]);

  const addProduct = (product: Product) => {
    if (replaceIndex != null) {
      const next = [...selectedIds];
      next[replaceIndex] = product.id;
      onSelectionChange([...new Set(next)].slice(0, 4));
      setReplaceIndex(null);
    } else if (selectedIds.length < 4 && !selectedIds.includes(product.id)) onSelectionChange([...selectedIds, product.id]);
    setQuery('');
  };
  const removeProduct = (id: string) => onSelectionChange(selectedIds.filter((item) => item !== id));
  const pricePerKgComparable = arePricePerKgComparable(selected);
  const coverageComparable = areCoverageValuesComparable(selected);
  const presentationComparable = samePresentation(selected);
  const pairById = new Map(pairComparisons.map((comparison) => [comparison.candidateId, comparison]));

  const blocks: ComparisonBlock[] = selected.length < 2 ? [] : [
    {
      id: 'identity', title: 'Identidad y clasificación', description: 'Campos declarados por el maestro de GESI.', rows: [
        { id: 'sku', label: 'Código / SKU', values: selected.map((product) => value(product.sku, product.sku)) },
        { id: 'brand', label: 'Marca', values: selected.map((product) => value(<button className="entity-link" onClick={() => onOpenBrand(product.brand)}>{useful(product.brand)}</button>, product.brand)) },
        { id: 'family', label: 'Rubro / familia', values: selected.map((product) => value(useful(product.family), product.family)) },
        { id: 'subcategory', label: 'Subrubro', values: selected.map((product) => value(useful(product.subcategory), product.subcategory)) },
        { id: 'line', label: 'Línea', values: selected.map((product) => value(useful(product.line), product.line)) },
        { id: 'group', label: 'Familia comercial / grupo', values: selected.map((product) => value(`${useful(product.commercialFamily)} · ${useful(product.group)}`, `${product.commercialFamily}|${product.group}`)) },
      ],
    },
    {
      id: 'presentation', title: 'Presentación y contenido', description: 'No se equiparan envases cuando GESI no permite normalizarlos.', rows: [
        { id: 'presentation', label: 'Presentación', values: selected.map((product) => value(productPresentationLabel(product), productPresentationLabel(product))) },
        { id: 'content', label: 'Contenido neto reconocido', values: selected.map((product) => value(product.contentKg ? `${product.contentKg.toLocaleString('es-AR')} kg` : 'No calculable', raw(product.contentKg), product.contentKg)), comparable: selected.every((product) => Boolean(product.contentKg)), note: 'Sólo se reconoce cuando la presentación es inequívoca.' },
        { id: 'unit1', label: 'Unidad primaria', values: selected.map((product) => value(useful(product.unit), product.unit)) },
        { id: 'unit2', label: 'Unidad secundaria', values: selected.map((product) => value(useful(product.inventory.unit2), product.inventory.unit2)) },
        { id: 'units-case', label: 'Unidades por caja', values: selected.map((product) => value(product.unitsPerCase?.toLocaleString('es-AR') ?? 'No informado', raw(product.unitsPerCase), product.unitsPerCase)) },
      ],
    },
    {
      id: 'price', title: 'Precio y precio por kilo', description: 'Una ventaja se marca sólo con una unidad realmente equivalente.', rows: [
        { id: 'price', label: 'Precio de referencia GESI', values: selected.map((product) => value(product.price > 0 ? money(product.price) : 'Sin precio', raw(product.price), product.price)), comparable: presentationComparable && selected.every((product) => product.price > 0), advantage: 'min', note: presentationComparable ? 'Misma presentación observable; no es el precio efectivo facturado.' : 'No se resalta: las presentaciones no son equivalentes.' },
        { id: 'price-kg', label: 'Precio por kilo', values: selected.map((product) => value(product.referencePricePerKg ? `${money(product.referencePricePerKg)}/kg` : 'No calculable', raw(product.referencePricePerKg), product.referencePricePerKg)), comparable: pricePerKgComparable, advantage: 'min', note: pricePerKgComparable ? 'Mismo uso principal y unidad $/kg.' : 'No comparable: falta peso inequívoco o el uso principal es diferente.' },
        { id: 'position', label: 'Posicionamiento relativo', values: selected.map((product) => value(positionLabel(product), product.pricePosition)), comparable: pricePerKgComparable },
      ],
    },
    {
      id: 'inventory', title: 'Stock, rotación y cobertura', description: 'Stock y rotación están expresados en U1; la cobertura usa meses estimados.', rows: [
        { id: 'stock', label: 'Stock disponible U1', values: selected.map((product) => value(`${number(product.stock)} ${product.unit.toLocaleLowerCase('es')}`, `${product.stock}|${product.unit}`, product.stock)), comparable: presentationComparable, note: presentationComparable ? 'Presentaciones equivalentes.' : 'No se marca ventaja: una U1 representa contenidos diferentes.' },
        { id: 'rotation', label: 'Rotación mensual', values: selected.map((product) => value(`${number(product.monthlyUnits)} U1/mes`, String(product.monthlyUnits), product.monthlyUnits)), comparable: presentationComparable, advantage: 'max', note: presentationComparable ? 'U1 equivalentes.' : 'No se marca ventaja por presentación diferente.' },
        { id: 'units90', label: 'Unidades · 90 días', values: selected.map((product) => value(`${number(product.units90d)} U1`, String(product.units90d), product.units90d)), comparable: presentationComparable },
        { id: 'coverage', label: 'Cobertura estimada', values: selected.map((product) => value(product.stockCoverageMonths == null ? 'No calculable' : `${product.stockCoverageMonths.toLocaleString('es-AR')} meses`, raw(product.stockCoverageMonths), product.stockCoverageMonths)), comparable: coverageComparable, note: coverageComparable ? 'Todos poseen stock y rotación utilizables.' : 'No comparable: al menos un producto carece de rotación o señal de inventario suficiente.' },
        { id: 'inventory-quality', label: 'Calidad del inventario', values: selected.map((product) => value(inventoryQualityLabel(product), product.inventory.quality)) },
      ],
    },
    {
      id: 'sales', title: 'Ventas y compradores', description: 'Misma ventana móvil de 90 días hasta la última actualización.', rows: [
        { id: 'sales90', label: 'Facturación / kilos · 90 días', values: selected.map((product) => value(<>{money(product.sales90d, true)}<small>{product.kiloDataStatus === 'unavailable' ? 'Sin conversión a kg' : `${number(product.kilos90d ?? 0, 2)} kg`}</small></>, `${product.sales90d}|${product.kilos90d ?? '∅'}`, product.sales90d)), comparable: true, advantage: 'max' },
        { id: 'buyers', label: 'Clientes compradores', values: selected.map((product) => value(number(product.clients90d), String(product.clients90d), product.clients90d)), comparable: true, advantage: 'max' },
        { id: 'last-sale', label: 'Última venta observada', values: selected.map((product) => value(product.lastSaleAt ? shortDate(product.lastSaleAt) : 'Sin detalle', product.lastSaleAt || '∅')) },
        { id: 'commercial-status', label: 'Comercialización observable', values: selected.map((product) => value(commercialLabel(product), product.commercialStatus)) },
      ],
    },
    {
      id: 'features', title: 'Características principales', description: 'Lectura determinística de señales descriptivas; un vacío no se completa.', rows: [
        { id: 'summary', label: 'Lectura rápida', values: selected.map((product) => value(summarizeProductForOffice(product), summarizeProductForOffice(product))) },
        { id: 'species', label: 'Especie y etapa', values: selected.map((product) => value(dominantFeatures(product, ['perros', 'gatos', 'otras_especies', 'cachorros', 'adultos', 'senior']), dominantFeatures(product, ['perros', 'gatos', 'otras_especies', 'cachorros', 'adultos', 'senior']))) },
        { id: 'type', label: 'Tipo y uso', values: selected.map((product) => value(dominantFeatures(product, ['alimento_seco', 'alimento_humedo', 'snacks', 'farmacia', 'antiparasitario', 'higiene', 'accesorios', 'consumo_humano']), dominantFeatures(product, ['alimento_seco', 'alimento_humedo', 'snacks', 'farmacia', 'antiparasitario', 'higiene', 'accesorios', 'consumo_humano']))) },
        { id: 'needs', label: 'Necesidades específicas', values: selected.map((product) => value(dominantFeatures(product, ['funcional', 'esterilizados', 'control_peso', 'piel_pelaje', 'salud_urinaria', 'salud_digestiva', 'salud_dental']), dominantFeatures(product, ['funcional', 'esterilizados', 'control_peso', 'piel_pelaje', 'salud_urinaria', 'salud_digestiva', 'salud_dental']))) },
      ],
    },
    {
      id: 'compatibility', title: 'Compatibilidades e incompatibilidades', description: `Cada artículo se contrasta con ${selected[0]?.name}, usado como producto base.`, rows: [
        { id: 'use-score', label: 'Compatibilidad de uso', values: selected.map((product, index) => index === 0 ? value('Producto base', 'base', 100) : (() => { const item = pairById.get(product.id)?.dimensions.find((dimension) => dimension.id === 'use'); return value(item?.score == null ? 'No evaluable' : `${item.score}% · ${item.explanation}`, `${item?.score}|${item?.explanation}`, item?.score); })()) },
        { id: 'matches', label: 'Coincidencias verificadas', values: selected.map((product, index) => index === 0 ? value('Referencia', 'base') : (() => { const items = pairById.get(product.id)?.compatibilities ?? []; return value(items.length ? items.join(', ') : 'Sin coincidencias fuertes', items.join('|')); })()) },
        { id: 'conflicts', label: 'Diferencias que limitan sustitución', values: selected.map((product, index) => index === 0 ? value('Referencia', 'base') : (() => { const items = pairById.get(product.id)?.incompatibilities ?? []; return value(items.length ? items.join(', ') : 'Sin incompatibilidades explícitas', items.join('|') || 'none'); })()) },
        { id: 'conclusion', label: 'Conclusión', values: selected.map((product, index) => index === 0 ? value('Producto base de la comparación', 'base') : value(pairById.get(product.id)?.conclusion ?? 'Sin conclusión', pairById.get(product.id)?.conclusion ?? '')) },
      ],
    },
    {
      id: 'quality', title: 'Calidad de los datos', description: 'La confianza describe la evidencia disponible, no la conveniencia comercial.', rows: [
        { id: 'confidence', label: 'Confianza descriptiva', values: selected.map((product) => value(`${product.vectorMeta.confidence}%`, String(product.vectorMeta.confidence), product.vectorMeta.confidence)) },
        { id: 'coverage-data', label: 'Cobertura de fuentes', values: selected.map((product) => value(`${product.vectorMeta.sourceCoverage}%`, String(product.vectorMeta.sourceCoverage), product.vectorMeta.sourceCoverage)) },
        { id: 'master-status', label: 'Estado del maestro', values: selected.map((product) => value(masterLabel(product), product.masterStatus)) },
        { id: 'limitations', label: 'Salvedades puntuales', values: selected.map((product) => value(product.inventory.qualityReasons.length ? product.inventory.qualityReasons.join(' ') : 'Sin salvedades de inventario', product.inventory.qualityReasons.join('|') || 'none')) },
      ],
    },
  ];

  const advantageIndex = (row: ComparisonRow) => {
    if (!row.comparable || !row.advantage || row.values.some((item) => item.numeric == null || !Number.isFinite(item.numeric))) return -1;
    const numbers = row.values.map((item) => item.numeric as number);
    const target = row.advantage === 'min' ? Math.min(...numbers) : Math.max(...numbers);
    return numbers.filter((item) => item === target).length === 1 ? numbers.indexOf(target) : -1;
  };

  return <div className="product-comparison-workspace">
    <header className="data-card comparison-hero">
      <div><span className="section-kicker"><GitCompareArrows size={15} /> Comparador operativo</span><h2>Compará productos sin perder el contexto</h2><p>Elegí entre dos y cuatro artículos. El producto de la izquierda funciona como referencia, pero cada bloque conserva sus cifras exactas.</p></div>
      <label className="comparison-differences-toggle"><input type="checkbox" checked={differencesOnly} onChange={(event) => setDifferencesOnly(event.target.checked)} /><span>Mostrar sólo diferencias</span></label>
    </header>

    <section className="data-card comparison-selection-card">
      <div className="comparison-selected-products">
        {selected.map((product, index) => <article key={product.id} className={index === 0 ? 'anchor' : ''}>
          <span>{index === 0 ? 'Producto base' : `Alternativa ${index}`}</span>
          <button className="comparison-selected-name" onClick={() => onOpenProduct(product)}><strong>{product.name}</strong><small>{product.sku} · {product.brand} · {productPresentationLabel(product)}</small></button>
          <div><button onClick={() => { setReplaceIndex(index); setQuery(''); }}>Cambiar</button><button aria-label={`Quitar ${product.name}`} onClick={() => removeProduct(product.id)}><X size={14} /></button></div>
        </article>)}
        {selected.length < 4 && <button className="comparison-empty-slot" onClick={() => { setReplaceIndex(null); document.getElementById('comparison-product-search')?.focus(); }}><Plus size={18} /><span>{selected.length ? 'Agregar producto' : 'Elegir producto base'}</span></button>}
      </div>
      <div className="comparison-search-zone">
        <label className="inline-search comparison-product-search"><Search size={16} /><input id="comparison-product-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={replaceIndex == null ? 'Buscar por producto, SKU, marca o presentación…' : `Buscar reemplazo para la columna ${replaceIndex + 1}…`} /></label>
        {replaceIndex != null && <button className="button secondary" onClick={() => { setReplaceIndex(null); setQuery(''); }}>Cancelar cambio</button>}
        {searchResults.length > 0 && <div className="comparison-search-results">{searchResults.map((product) => <button key={product.id} onClick={() => addProduct(product)}><span><strong>{product.name}</strong><small>{product.sku} · {product.brand} · {productPresentationLabel(product)}</small></span><Plus size={15} /></button>)}</div>}
      </div>
    </section>

    {selected.length > 0 && selected.length < 4 && suggestions.length > 0 && <section className="data-card comparison-suggestions">
      <div className="data-card-header"><div><span className="section-kicker"><SlidersHorizontal size={14} /> Comparables sugeridos</span><h2>Mismo uso, categoría y presentación cuando la evidencia alcanza</h2><p>No se ordenan sólo por similitud vectorial.</p></div></div>
      <div>{suggestions.map(({ product, comparison, suggestionScore }) => <article key={product.id}><button onClick={() => addProduct(product)}><span><strong>{product.name}</strong><small>{product.brand} · {productPresentationLabel(product)}</small><em>{comparison.conclusion}</em></span><b>{suggestionScore}%<small>afinidad operativa</small></b><Plus size={15} /></button></article>)}</div>
    </section>}

    {selected.length < 2 ? <section className="data-card comparison-empty-state"><GitCompareArrows size={28} /><h2>Elegí al menos dos productos</h2><p>Podés buscarlos acá o agregarlos desde el catálogo y las fichas. La selección se conserva al abrir un producto y regresar.</p></section> : <>
      <section className="comparison-dimension-grid">
        {pairComparisons.map((comparison, comparisonIndex) => <article className="data-card" key={comparison.candidateId}><header><span>{selected[comparisonIndex + 1]?.name}</span><strong>frente a {selected[0]?.name}</strong></header><div>{comparison.dimensions.map((dimension) => <div key={dimension.id}><span>{dimension.label}</span><strong>{dimension.score == null ? 'No evaluable' : `${dimension.score}%`}</strong><small>{dimension.explanation}</small></div>)}</div><footer className={comparison.incompatibilities.length ? 'attention' : ''}>{comparison.conclusion}</footer></article>)}
      </section>

      {(!pricePerKgComparable || !coverageComparable) && <div className="comparison-warning-strip"><AlertTriangle size={16} /><span>{!pricePerKgComparable && 'Precio por kilo: no todos los artículos comparten uso principal y peso inequívoco. '}{!coverageComparable && 'Cobertura: al menos un producto no posee stock, rotación o calidad suficiente.'}</span></div>}

      <section className="data-card comparison-table-card">
        <div className="comparison-table-scroll"><table className="product-comparison-table"><thead><tr><th>Dato comparable</th>{selected.map((product, index) => <th key={product.id}><button onClick={() => onOpenProduct(product)}><span>{index === 0 ? 'BASE' : `ALT. ${index}`}</span><strong>{product.name}</strong><small>{productPresentationLabel(product)}</small></button></th>)}</tr></thead><tbody>{blocks.map((block) => {
          const visibleRows = differencesOnly ? block.rows.filter(rowDiffers) : block.rows;
          if (!visibleRows.length) return null;
          return [<tr className="comparison-block-row" key={`${block.id}-head`}><th colSpan={selected.length + 1}><strong>{block.title}</strong><span>{block.description}</span></th></tr>, ...visibleRows.map((row) => {
            const best = advantageIndex(row);
            return <tr key={row.id} className={row.comparable === false ? 'not-comparable' : ''}><th><span>{row.label}</span>{row.note && <small><Info size={12} />{row.note}</small>}</th>{row.values.map((item, index) => <td key={selected[index]?.id} className={best === index ? 'advantage' : ''}>{best === index && <span className="comparison-advantage-label"><Check size={11} /> Ventaja comparable</span>}<div>{item.display}</div></td>)}</tr>;
          })];
        })}</tbody></table></div>
      </section>

      <details className="data-card comparison-technical-details">
        <summary><span><GitCompareArrows size={16} /><strong>Ver detalle vectorial técnico</strong><small>33 dimensiones y porcentajes exactos; opcional para auditoría.</small></span><ChevronRight size={17} /></summary>
        <div className="comparison-technical-scroll"><table><thead><tr><th>Dimensión</th>{selected.map((product) => <th key={product.id}>{product.name}</th>)}</tr></thead><tbody>{VECTOR_GROUPS.flatMap((group) => [<tr className="comparison-vector-group" key={group.id}><th colSpan={selected.length + 1}>{group.label}</th></tr>, ...group.keys.map((key) => <tr key={key}><th>{VECTOR_LABELS[key]}</th>{selected.map((product) => <td key={product.id}>{product.vector[key]}%</td>)}</tr>)])}</tbody></table></div>
      </details>
    </>}
  </div>;
}
