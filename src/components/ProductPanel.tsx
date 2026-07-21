import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight, Boxes, CalendarDays, CheckCircle2, ChevronRight, GitCompareArrows,
  Info, PackageSearch, Sparkles, TrendingUp, Users, X,
} from 'lucide-react';
import { compareProductsV2 } from '../../shared/product-vectors';
import { VECTOR_GROUPS, VECTOR_LABELS, type Product, type VectorKey } from '../../shared/models';
import { money, shortDate } from '../lib/format';

const vectorKeys = Object.keys(VECTOR_LABELS) as VectorKey[];

interface ProductPanelProps {
  product: Product;
  products: Product[];
  mode?: 'embedded' | 'popup';
  onClose?: () => void;
  onOpenProduct?: (product: Product) => void;
  onOpenCatalog?: (product: Product) => void;
  onOpenBrand?: (brand: string) => void;
}

const useful = (value: string) => value && !value.toLowerCase().startsWith('sin ') ? value : 'No informado por GESI';

function coverageCopy(product: Product) {
  if (product.stock <= 0) return { tone: 'critical', title: 'Sin stock disponible', detail: product.monthlyUnits > 0 ? `Tuvo una rotación media de ${product.monthlyUnits} unidades por mes.` : 'No tuvo rotación observable en los últimos 90 días.' };
  if (product.stockCoverageMonths == null) return { tone: 'neutral', title: 'Con stock, sin consumo reciente', detail: 'No hay rotación de 90 días suficiente para estimar cobertura.' };
  if (product.stockCoverageMonths < .7) return { tone: 'attention', title: 'Cobertura ajustada', detail: `El stock equivale a aproximadamente ${product.stockCoverageMonths.toLocaleString('es-AR')} meses de la rotación reciente.` };
  if (product.stockCoverageMonths > 4) return { tone: 'neutral', title: 'Cobertura amplia', detail: `El stock equivale a aproximadamente ${product.stockCoverageMonths.toLocaleString('es-AR')} meses de la rotación reciente.` };
  return { tone: 'healthy', title: 'Cobertura dentro del ritmo reciente', detail: `Aproximadamente ${product.stockCoverageMonths.toLocaleString('es-AR')} meses al ritmo de los últimos 90 días.` };
}

function confidenceLabel(value: number) {
  if (value >= 85) return 'Perfil sólido';
  if (value >= 65) return 'Perfil bueno';
  if (value >= 45) return 'Perfil parcial';
  return 'Perfil limitado';
}

function pricePositionLabel(product: Product) {
  if (!product.referencePricePerKg) return 'Sin presentación comparable';
  if (product.pricePosition === 'budget') return 'Precio/kg bajo en comparables';
  if (product.pricePosition === 'premium') return 'Precio/kg alto en comparables';
  if (product.pricePosition === 'market') return 'Precio/kg dentro del mercado';
  return 'Sin cohorte comparable suficiente';
}

export function ProductPanel({ product, products, mode = 'embedded', onClose, onOpenProduct, onOpenCatalog, onOpenBrand }: ProductPanelProps) {
  const nearest = useMemo(() => products
    .filter((candidate) => candidate.id !== product.id)
    .map((candidate) => ({ product: candidate, comparison: compareProductsV2(product, candidate) }))
    .sort((left, right) => right.comparison.score - left.comparison.score || right.product.monthlyUnits - left.product.monthlyUnits)
    .slice(0, 6), [product, products]);
  const [compareId, setCompareId] = useState(nearest[0]?.product.id ?? '');

  useEffect(() => setCompareId(nearest[0]?.product.id ?? ''), [product.id, nearest]);

  const compared = products.find((candidate) => candidate.id === compareId && candidate.id !== product.id) ?? nearest[0]?.product;
  const comparison = compared ? compareProductsV2(product, compared) : null;
  const features = useMemo(() => (Object.entries(product.vector) as [VectorKey, number][])
    .filter(([, value]) => value > 0)
    .sort((left, right) => right[1] - left[1]), [product]);
  const featureValues = useMemo(() => new Map(features), [features]);
  const stockCoverage = coverageCopy(product);
  const statusLabel = product.masterStatus === 'active' ? 'Activo en maestro' : product.masterStatus === 'inactive' ? 'Inactivo en maestro' : 'Estado no informado';

  return (
    <section className={`product-profile ${mode}`} aria-label={`Ficha de ${product.name}`}>
      {mode === 'popup' && <div className="product-profile-actions">{onOpenCatalog && <button className="button secondary" onClick={() => onOpenCatalog(product)}><ArrowUpRight size={15} /> Abrir en Productos</button>}<button className="icon-button" aria-label="Cerrar ficha de producto" onClick={onClose}><X size={18} /></button></div>}
      <div className="product-profile-scroll">
        <article className="data-card product-hero product-profile-hero">
          <div className="product-hero-top">
            <div className="large-product-icon"><PackageSearch size={30} /></div>
            <div className="product-hero-title"><span className="section-kicker">{product.family} · {product.sku}</span><h2>{product.name}</h2><p><button className="entity-link" onClick={() => onOpenBrand?.(product.brand)}>{useful(product.brand)}</button> · {product.pack}</p></div>
            <div className="product-profile-badges"><span className={`master-status ${product.masterStatus}`}>{statusLabel}</span><span className="algorithm-pill"><Sparkles size={13} /> Vector v2.1</span></div>
          </div>
          {!!product.description && product.description !== product.name && <p className="product-description">{product.description}</p>}
          <div className="product-metrics product-metrics-v2">
            <div><span>Precio de referencia</span><strong>{product.price > 0 ? money(product.price) : 'Sin dato'}</strong><small>{product.referencePricePerKg ? `${money(product.referencePricePerKg)}/kg · ${pricePositionLabel(product)}` : pricePositionLabel(product)}</small></div>
            <div><span>Stock disponible</span><strong>{product.stock.toLocaleString('es-AR')} {product.unit.toLowerCase()}</strong><small>{product.stockCoverageMonths == null ? 'Sin cobertura calculable' : `${product.stockCoverageMonths.toLocaleString('es-AR')} meses estimados`}</small></div>
            <div><span>Rotación mensual</span><strong>{product.monthlyUnits.toLocaleString('es-AR')} u.</strong><small>{product.units90d.toLocaleString('es-AR')} u. en 90 días</small></div>
            <div><span>Venta atribuida · 90 d</span><strong>{money(product.sales90d, true)}</strong><small>{product.clients90d.toLocaleString('es-AR')} clientes compradores</small></div>
            <div><span>Última venta observada</span><strong>{product.lastSaleAt ? shortDate(product.lastSaleAt) : 'Sin detalle'}</strong><small>Dentro del historial capturado</small></div>
          </div>
          <div className={`product-stock-callout ${stockCoverage.tone}`}><TrendingUp size={17} /><div><strong>{stockCoverage.title}</strong><span>{stockCoverage.detail}</span></div></div>
        </article>

        <div className="product-profile-grid">
          <article className="data-card product-classification-card">
            <div className="data-card-header"><div><span className="section-kicker"><Boxes size={14} /> Clasificación comercial</span><h2>Cómo está organizado en GESI</h2></div></div>
            <div className="product-classification-grid">
              <div><span>Marca</span><button className="entity-link" onClick={() => onOpenBrand?.(product.brand)}><strong>{useful(product.brand)}</strong></button></div><div><span>Línea</span><strong>{useful(product.line)}</strong></div>
              <div><span>Rubro</span><strong>{useful(product.family)}</strong></div><div><span>Subrubro</span><strong>{useful(product.subcategory)}</strong></div>
              <div><span>Familia comercial</span><strong>{useful(product.commercialFamily)}</strong></div><div><span>Grupo</span><strong>{useful(product.group)}</strong></div>
              <div><span>Unidad</span><strong>{product.unit}</strong></div><div><span>Unidades por caja</span><strong>{product.unitsPerCase ?? 'No informado'}</strong></div>
            </div>
          </article>

          <article className="data-card vector-card product-vector-v2">
            <div className="data-card-header"><div><span className="section-kicker"><Sparkles size={14} /> Perfil de afinidad</span><h2>{vectorKeys.length} dimensiones explicables</h2></div><div className="vector-confidence"><strong>{product.vectorMeta.confidence}%</strong><span>{confidenceLabel(product.vectorMeta.confidence)}</span></div></div>
            <p className="section-description">Cada porcentaje requiere una señal verificable del nombre o de los maestros de GESI. Un cero significa que no encontramos evidencia; no que el atributo sea imposible.</p>
            <div className="vector-list-v2">
              {VECTOR_GROUPS.map((group) => {
                const groupFeatures = group.keys.filter((key) => featureValues.has(key));
                return groupFeatures.length ? <section className="vector-group-v21" key={group.id}><h3>{group.label}</h3>{groupFeatures.map((key) => { const value = featureValues.get(key) ?? 0; return <div className="vector-row-v2" key={key}><div><span>{VECTOR_LABELS[key]}</span><small>{product.vectorMeta.evidence[key]?.[0] ?? 'Señal derivada de la clasificación disponible'}</small></div><div className="vector-track"><i style={{ width: `${value}%` }} /></div><strong>{value}%</strong></div>; })}</section> : null;
              })}
              {!features.length && <div className="product-vector-empty"><Info size={18} /><p>No hay señales suficientes para asignar afinidades a este producto. Se conserva visible sin completar datos artificialmente.</p></div>}
            </div>
            <footer className="vector-quality-note"><CheckCircle2 size={14} /><span>Cobertura de fuentes descriptivas: {product.vectorMeta.sourceCoverage}% · calidad del perfil: {product.vectorMeta.confidence}%.</span></footer>
          </article>
        </div>

        {compared && comparison && <article className="data-card comparison-card product-comparison-v2">
          <div className="data-card-header"><div><span className="section-kicker"><GitCompareArrows size={14} /> Comparador v2.1</span><h2>Similitud entre productos</h2></div><div className={`similarity-score ${comparison.score >= 75 ? 'high' : ''}`}><strong>{comparison.score}%</strong><span>similitud</span></div></div>
          <label className="compare-select"><span>Comparar con</span><select value={compared.id} onChange={(event) => setCompareId(event.target.value)}>{products.filter((candidate) => candidate.id !== product.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
          <div className="similarity-explanation"><div><span>Perfil vectorial ponderado</span><strong>{comparison.vectorScore}%</strong><small>Especie, etapa y tipo de producto pesan más que rasgos secundarios.</small></div><div><span>Clasificación comercial</span><strong>{comparison.taxonomyScore}%</strong><small>Rubro, subrubro, marca, línea, familia y grupo.</small></div><div><span>Confianza de la comparación</span><strong>{comparison.confidence}%</strong><small>Se limita por el perfil con menor cobertura.</small></div></div>
          <div className="compare-legend"><span><i className="bar-a" /> {product.name}</span><span><i className="bar-b" /> {compared.name}</span></div>
          <div className="compare-bars">{vectorKeys.filter((key) => product.vector[key] || compared.vector[key]).slice(0, 12).map((key) => <div className="compare-row" key={key}><span>{VECTOR_LABELS[key]}</span><div><i className="bar-a" style={{ width: `${product.vector[key]}%` }} /><i className="bar-b" style={{ width: `${compared.vector[key]}%` }} /></div></div>)}</div>
          <div className="comparison-reasons"><p><strong>Coinciden en</strong>{comparison.matches.length ? comparison.matches.join(' · ') : 'No hay coincidencias fuertes documentadas'}</p><p><strong>Se diferencian en</strong>{comparison.differences.length ? comparison.differences.join(' · ') : 'No hay diferencias vectoriales fuertes'}</p></div>
        </article>}

        <article className="data-card closest-products-card">
          <div className="data-card-header"><div><span className="section-kicker"><Users size={14} /> Alternativas cercanas</span><h2>Productos más parecidos</h2><p>Ranking recalculado con el comparador v2.1.</p></div></div>
          <div className="closest-product-list">{nearest.map((item, index) => <article key={item.product.id}><button className="closest-product-main" onClick={() => onOpenProduct?.(item.product)}><span>{index + 1}</span><div><strong>{item.product.name}</strong><small>{item.product.family}</small></div><em>{item.comparison.score}%</em><ChevronRight size={15} /></button><button className="entity-link closest-product-brand" onClick={() => onOpenBrand?.(item.product.brand)}>{useful(item.product.brand)}</button></article>)}</div>
        </article>

        <div className="product-data-note"><CalendarDays size={14} /><span>Stock, precio, ventas, clientes y última venta corresponden al snapshot visible. La cobertura se estima con stock actual ÷ rotación media de 90 días.</span></div>
      </div>
    </section>
  );
}
