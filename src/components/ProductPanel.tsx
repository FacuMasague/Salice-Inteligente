import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight, BarChart3, Boxes, CalendarDays, CheckCircle2, ChevronRight,
  GitCompareArrows, Info, PackageSearch, Search, Sparkles, Store, Trash2, TrendingUp, UserPlus, Users, X,
} from 'lucide-react';
import {
  classifyInventoryProduct, INVENTORY_EXCEPTION_LABELS, inventoryReviewDisplayLabel,
  type InventoryAlertReview, type InventoryDecisionStatus,
} from '../../shared/inventory-decisions';
import { buildProductCommercialInsight, productPresentationLabel, summarizeProductForOffice } from '../../shared/product-insights';
import { compareProductsV2 } from '../../shared/product-vectors';
import { VECTOR_GROUPS, VECTOR_LABELS, type Client, type Product, type ProductClientOpportunity, type ProductVectorCorrection, type ProductVectorCorrectionEvent, type RecommendationConfidence, type VectorKey } from '../../shared/models';
import { clientPrimaryName, clientSecondaryName } from '../lib/client-name';
import { money, number, shortDate } from '../lib/format';

const vectorKeys = Object.keys(VECTOR_LABELS) as VectorKey[];

interface ProductPanelProps {
  product: Product;
  products: Product[];
  clients: Client[];
  snapshotDate: string;
  inventoryReview?: InventoryAlertReview | null;
  mode?: 'embedded' | 'popup';
  onClose?: () => void;
  onOpenProduct?: (product: Product) => void;
  onCompareProduct?: (product: Product) => void;
  comparisonSelectedIds?: string[];
  onOpenCatalog?: (product: Product) => void;
  onOpenBrand?: (brand: string) => void;
  onOpenFamily?: (family: string) => void;
  onOpenClient?: (client: Client) => void;
  onDataChanged?: () => void | Promise<void>;
}

const useful = (value: string) => value && !value.toLocaleLowerCase('es').startsWith('sin ') ? value : 'No informado por GESI';

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

function inventoryTone(status: InventoryDecisionStatus) {
  if (status === 'no_stock_with_demand' || status === 'critical_coverage') return 'critical';
  if (status === 'low_coverage' || status === 'stock_without_movement' || status === 'insufficient_data') return 'attention';
  if (status === 'adequate_coverage') return 'healthy';
  return 'neutral';
}

function affinityLabel(score: number) {
  if (score >= 80) return 'Alternativa muy cercana';
  if (score >= 65) return 'Alternativa relacionada';
  return 'Opción exploratoria';
}

function comparisonReason(comparison: ReturnType<typeof compareProductsV2>) {
  if (comparison.matches.length) return `Coincide en ${comparison.matches.slice(0, 2).join(' y ').toLocaleLowerCase('es')}.`;
  return 'Comparte parte de la clasificación disponible; conviene revisar el análisis técnico.';
}

const opportunityConfidenceLabels: Record<RecommendationConfidence, string> = {
  reliable: 'Confianza alta',
  exploratory: 'Confianza media',
  insufficient: 'Confianza limitada',
};

export function ProductPanel({
  product, products, clients, snapshotDate, mode = 'embedded', onClose, onOpenProduct,
  inventoryReview, onOpenCatalog, onCompareProduct, comparisonSelectedIds = [], onOpenBrand, onOpenFamily, onOpenClient, onDataChanged,
}: ProductPanelProps) {
  const rankedAlternatives = useMemo(() => products
    .filter((candidate) => candidate.id !== product.id)
    .map((candidate) => ({ product: candidate, comparison: compareProductsV2(product, candidate) }))
    .sort((left, right) => right.comparison.score - left.comparison.score || right.product.monthlyUnits - left.product.monthlyUnits)
    .slice(0, 24), [product, products]);
  const [showAllBuyers, setShowAllBuyers] = useState(false);
  const [buyerQuery, setBuyerQuery] = useState('');
  const [showAllClientOpportunities, setShowAllClientOpportunities] = useState(false);
  const [clientOpportunityQuery, setClientOpportunityQuery] = useState('');
  const [clientOpportunities, setClientOpportunities] = useState<ProductClientOpportunity[]>([]);
  const [clientOpportunitiesLoading, setClientOpportunitiesLoading] = useState(false);
  const [clientOpportunitiesError, setClientOpportunitiesError] = useState('');
  const [corrections, setCorrections] = useState<ProductVectorCorrection[]>([]);
  const [correctionHistory, setCorrectionHistory] = useState<ProductVectorCorrectionEvent[]>([]);
  const [correctionKey, setCorrectionKey] = useState<VectorKey>('perros');
  const [correctionValue, setCorrectionValue] = useState(50);
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [correctionError, setCorrectionError] = useState('');

  useEffect(() => {
    setShowAllBuyers(false);
    setBuyerQuery('');
    setShowAllClientOpportunities(false);
    setClientOpportunityQuery('');
  }, [product.id]);
  useEffect(() => {
    const controller = new AbortController();
    setClientOpportunities([]);
    setClientOpportunitiesLoading(true);
    setClientOpportunitiesError('');
    fetch(`/api/products/${encodeURIComponent(product.id)}/client-opportunities`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then((payload: { opportunities?: ProductClientOpportunity[] }) => setClientOpportunities(payload.opportunities ?? []))
      .catch((error: Error) => { if (error.name !== 'AbortError') setClientOpportunitiesError('No se pudieron calcular los clientes sugeridos. Los datos existentes no fueron modificados.'); })
      .finally(() => { if (!controller.signal.aborted) setClientOpportunitiesLoading(false); });
    return () => controller.abort();
  }, [product.id]);
  useEffect(() => {
    let cancelled = false;
    setCorrectionError('');
    setCorrectionKey('perros');
    setCorrectionValue(product.vector.perros);
    setCorrectionReason('');
    fetch(`/api/product-vector-corrections/${encodeURIComponent(product.id)}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error()))
      .then((payload: { corrections: ProductVectorCorrection[]; history: ProductVectorCorrectionEvent[] }) => {
        if (cancelled) return;
        setCorrections(payload.corrections);
        setCorrectionHistory(payload.history);
      })
      .catch(() => { if (!cancelled) setCorrectionError('No se pudieron cargar las correcciones humanas.'); });
    return () => { cancelled = true; };
  }, [product.id]);
  useEffect(() => {
    if (!showAllBuyers && !showAllClientOpportunities) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setShowAllBuyers(false); setShowAllClientOpportunities(false); } };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [showAllBuyers, showAllClientOpportunities]);

  const features = useMemo(() => (Object.entries(product.vector) as [VectorKey, number][])
    .filter(([, value]) => value > 0)
    .sort((left, right) => right[1] - left[1]), [product]);
  const featureValues = useMemo(() => new Map(features), [features]);
  const commercial = useMemo(() => buildProductCommercialInsight(product.id, clients, snapshotDate), [product.id, clients, snapshotDate]);
  const plainSummary = useMemo(() => summarizeProductForOffice(product), [product]);
  const presentation = useMemo(() => productPresentationLabel(product), [product]);
  const inventoryDecision = useMemo(() => classifyInventoryProduct(product, inventoryReview ?? null), [product, inventoryReview]);
  const saveCorrection = async () => {
    if (correctionReason.trim().length < 5) { setCorrectionError('Indicá un motivo de al menos 5 caracteres.'); return; }
    setCorrectionBusy(true); setCorrectionError('');
    try {
      const response = await fetch(`/api/product-vector-corrections/${encodeURIComponent(product.id)}/${correctionKey}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: correctionValue, reason: correctionReason }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? 'No se pudo guardar.');
      const correction = (await response.json()).correction as ProductVectorCorrection;
      setCorrections((current) => [...current.filter((item) => item.key !== correction.key), correction].sort((a, b) => a.key.localeCompare(b.key)));
      setCorrectionHistory((current) => [{ ...correction, id: `${correction.updatedAt}:${correction.key}`, eventType: 'set' }, ...current]);
      setCorrectionReason('');
      await onDataChanged?.();
    } catch (error) { setCorrectionError(error instanceof Error ? error.message : 'No se pudo guardar.'); }
    finally { setCorrectionBusy(false); }
  };
  const removeCorrection = async (correction: ProductVectorCorrection) => {
    const reason = window.prompt(`Motivo para revertir la corrección de ${VECTOR_LABELS[correction.key]}:`)?.trim() ?? '';
    if (reason.length < 5) { if (reason) setCorrectionError('Indicá un motivo de al menos 5 caracteres.'); return; }
    setCorrectionBusy(true); setCorrectionError('');
    try {
      const response = await fetch(`/api/product-vector-corrections/${encodeURIComponent(product.id)}/${correction.key}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? 'No se pudo revertir.');
      const event = (await response.json()).event as ProductVectorCorrectionEvent;
      setCorrections((current) => current.filter((item) => item.key !== correction.key));
      setCorrectionHistory((current) => [event, ...current]);
      await onDataChanged?.();
    } catch (error) { setCorrectionError(error instanceof Error ? error.message : 'No se pudo revertir.'); }
    finally { setCorrectionBusy(false); }
  };
  const normalizedBuyerQuery = buyerQuery.trim().toLocaleLowerCase('es');
  const visibleBuyers = useMemo(() => commercial.buyers.filter((buyer) => `${clientPrimaryName(buyer.client)} ${clientSecondaryName(buyer.client)} ${buyer.client.seller}`.toLocaleLowerCase('es').includes(normalizedBuyerQuery)), [commercial.buyers, normalizedBuyerQuery]);
  const normalizedClientOpportunityQuery = clientOpportunityQuery.trim().toLocaleLowerCase('es');
  const visibleClientOpportunities = useMemo(() => clientOpportunities.filter((item) => `${item.client.name} ${item.client.tradeName} ${item.client.seller} ${item.client.locality}`.toLocaleLowerCase('es').includes(normalizedClientOpportunityQuery)), [clientOpportunities, normalizedClientOpportunityQuery]);
  const openOpportunityClient = (clientId: number) => {
    const fullClient = clients.find((client) => client.id === clientId);
    if (fullClient) onOpenClient?.(fullClient);
  };
  const maxPeriodSales = Math.max(...commercial.periods.map((period) => period.sales), 1);
  const statusLabel = product.masterStatus === 'active' ? 'Activo en maestro' : product.masterStatus === 'inactive' ? 'Inactivo en maestro' : 'Estado no informado';
  const commercialLabel = product.commercialStatus === 'commercializable' ? 'Comercializable observable' : product.commercialStatus === 'not_commercializable' ? 'No comercializable con las señales actuales' : 'Comercialización sin información suficiente';
  const inventoryQuality = product.inventory?.quality === 'reliable' ? 'Señal consistente' : product.inventory?.quality === 'attention' ? 'Señal con salvedades' : 'Señal insuficiente';

  return (
    <section className={`product-profile ${mode}`} aria-label={`Ficha de ${product.name}`}>
      {mode === 'popup' && <div className="product-profile-actions">{onOpenCatalog && <button className="button secondary" onClick={() => onOpenCatalog(product)}><ArrowUpRight size={15} /> Abrir en Productos</button>}<button className="icon-button" aria-label="Cerrar ficha de producto" onClick={onClose}><X size={18} /></button></div>}
      <div className="product-profile-scroll">
        <article className="data-card product-hero product-profile-hero">
          <div className="product-hero-top">
            <div className="large-product-icon"><PackageSearch size={30} /></div>
            <div className="product-hero-title">
              <span className="section-kicker"><button className="entity-link" onClick={() => onOpenFamily?.(product.family)}>{useful(product.family)}</button> · {product.sku}</span>
              <h2>{product.name}</h2>
              <p><button className="entity-link" onClick={() => onOpenBrand?.(product.brand)}>{useful(product.brand)}</button> · {presentation}</p>
            </div>
            <div className="product-profile-badges"><span className={`master-status ${product.masterStatus}`}>{statusLabel}</span><span className="algorithm-pill">{commercialLabel}</span></div>
          </div>
          <div className="product-office-summary"><Sparkles size={17} /><div><strong>Lectura rápida</strong><span>{plainSummary}</span><small>Resumen determinístico construido sólo con señales verificables del producto.</small></div>{onCompareProduct && <button className="button secondary product-add-comparison" onClick={() => onCompareProduct(product)}><GitCompareArrows size={15} />{comparisonSelectedIds.includes(product.id) || comparisonSelectedIds.length >= 4 ? `Abrir comparación${comparisonSelectedIds.length >= 4 ? ' (máximo 4)' : ''}` : 'Agregar a comparación'}</button>}</div>
          {!!product.description && product.description !== product.name && <p className="product-description">{product.description}</p>}
          <div className="product-metrics product-metrics-v3">
            <div><span>Precio de referencia GESI</span><strong>{product.price > 0 ? money(product.price) : 'Sin dato'}</strong><small>{product.referencePricePerKg ? `${money(product.referencePricePerKg)}/kg · ${pricePositionLabel(product)}` : pricePositionLabel(product)}</small></div>
            <div><span>Stock disponible</span><strong>{number(product.stock)} {product.unit.toLocaleLowerCase('es')}</strong><small>{product.stockCoverageMonths == null ? 'Cobertura no calculable' : `${product.stockCoverageMonths.toLocaleString('es-AR')} meses estimados`}</small></div>
            <div><span>Rotación mensual</span><strong>{number(product.monthlyUnits)} u.</strong><small>{number(product.units90d)} u. en 90 días</small></div>
            <div><span>Clientes compradores</span><strong>{number(product.clients90d)}</strong><small>únicos en los últimos 90 días</small></div>
            <div><span>Venta atribuida · 90 d</span><strong>{money(product.sales90d, true)}</strong><small>renglones positivos con detalle</small></div>
            <div><span>Última venta observada</span><strong>{product.lastSaleAt ? shortDate(product.lastSaleAt) : 'Sin detalle'}</strong><small>dentro del historial capturado</small></div>
          </div>
          <div className={`product-stock-callout ${inventoryTone(inventoryDecision.status)}`}><TrendingUp size={17} /><div><strong>{inventoryDecision.label}</strong><span>{inventoryDecision.explanation}</span></div></div>
          {inventoryReview !== undefined && <div className={`product-review-summary ${inventoryReview?.status ?? 'unreviewed'} ${inventoryReview?.status === 'unreviewed' && inventoryReview.reopenedAt ? 'reopened' : ''}`}><ClipboardReviewIcon status={inventoryReview?.status} /><div><span>Revisión de oficina</span><strong>{inventoryReviewDisplayLabel(inventoryReview)}</strong><p>{inventoryReview?.note || 'Sin nota de revisión.'}</p>{inventoryReview && <small>{inventoryReview.incidentNumber > 1 ? `Incidencia ${inventoryReview.incidentNumber} · ` : ''}{inventoryReview.exceptionType !== 'none' ? `Excepción: ${INVENTORY_EXCEPTION_LABELS[inventoryReview.exceptionType]} · ` : ''}Actualizado {shortDate(inventoryReview.updatedAt.slice(0, 10))} por {inventoryReview.updatedBy}</small>}</div></div>}
          <div className="product-data-note"><CalendarDays size={14} /><span><strong>{inventoryQuality}.</strong> Corte {product.inventory?.capturedAt ? shortDate(product.inventory.capturedAt.slice(0, 10)) : 'no informado'} · empresa {product.inventory?.companyId ?? 3} / sucursal {product.inventory?.branchId ?? 3} · depósito {product.inventory?.warehouseId ?? 2} {product.inventory?.warehouseLabel ? `(${product.inventory.warehouseLabel})` : ''}. {product.inventory?.completeZeroStockUniverse ? 'La captura distingue cero de ausencia.' : 'La captura activa no certifica el universo de existencias cero.'}</span></div>
          {!!product.inventory?.qualityReasons.length && <div className="product-stock-callout attention"><Info size={17} /><div><strong>Salvedades de esta señal</strong><span>{product.inventory.qualityReasons.join(' ')}</span></div></div>}
        </article>

        <div className="product-administrative-grid">
          <article className="data-card product-evolution-card">
            <div className="data-card-header"><div><span className="section-kicker"><BarChart3 size={14} /> Evolución comercial</span><h2>Tres ventanas móviles de 30 días</h2><p>Venta atribuida, unidades y compradores sobre el historial de 90 días.</p></div><span className={`product-trend ${commercial.trend.direction}`}>{commercial.trend.label}</span></div>
            <div className="product-period-chart">{commercial.periods.map((period, index) => <article key={period.from} className={index === commercial.periods.length - 1 ? 'current' : ''}><div className="product-period-bar"><i style={{ height: `${Math.max(5, period.sales / maxPeriodSales * 100)}%` }} /></div><strong>{money(period.sales, true)}</strong><span>{period.label}</span><small>{number(period.units)} u. · {number(period.buyers)} compradores</small></article>)}</div>
            <footer>Las ventanas son consecutivas y terminan en la fecha de actualización; no representan meses calendario completos.</footer>
          </article>

          <article className="data-card product-buyers-card">
            <div className="data-card-header"><div><span className="section-kicker"><Users size={14} /> Clientes compradores</span><h2>Quiénes explican la venta reciente</h2><p>Ordenados por venta atribuida de 90 días.</p></div><div className="product-buyers-actions"><span className="count-badge">{number(commercial.buyers.length)}</span>{commercial.buyers.length > 0 && <button className="button secondary" onClick={() => setShowAllBuyers(true)}>Ver todos</button>}</div></div>
            <div className="product-buyer-list">{commercial.buyers.slice(0, 7).map((buyer) => <button key={buyer.client.id} onClick={() => onOpenClient?.(buyer.client)}><div><strong>{clientPrimaryName(buyer.client)}</strong><small>{clientSecondaryName(buyer.client) ? `${clientSecondaryName(buyer.client)} · ` : ''}{buyer.client.seller || 'Sin vendedor'} · última compra {shortDate(buyer.lastPurchaseAt)}</small></div><span><strong>{money(buyer.sales, true)}</strong><small>{number(buyer.units)} u. · {buyer.purchaseDays} días de compra</small></span><ChevronRight size={15} /></button>)}</div>
            {!commercial.buyers.length && <div className="product-inline-empty"><Info size={18} /><span>No hay compradores identificables en los renglones detallados de los últimos 90 días.</span></div>}
            {commercial.buyers.length > 7 && <footer>Se muestran los 7 principales de {number(commercial.buyers.length)} compradores.</footer>}
          </article>

          <article className="data-card product-classification-card">
            <div className="data-card-header"><div><span className="section-kicker"><Boxes size={14} /> Clasificación comercial</span><h2>Cómo está organizado en GESI</h2></div></div>
            <div className="product-classification-grid">
              <div><span>Marca</span><button className="entity-link" onClick={() => onOpenBrand?.(product.brand)}><strong>{useful(product.brand)}</strong></button></div><div><span>Línea</span><strong>{useful(product.line)}</strong></div>
              <div><span>Rubro / familia</span><button className="entity-link" onClick={() => onOpenFamily?.(product.family)}><strong>{useful(product.family)}</strong></button></div><div><span>Subrubro</span><strong>{useful(product.subcategory)}</strong></div>
              <div><span>Familia comercial</span><strong>{useful(product.commercialFamily)}</strong></div><div><span>Grupo</span><strong>{useful(product.group)}</strong></div>
              <div><span>Presentación</span><strong>{presentation}</strong></div><div><span>Unidad primaria</span><strong>{product.unit}</strong></div>
              <div><span>Unidad secundaria</span><strong>{product.inventory?.unit2 || 'No informada'}</strong></div><div><span>Contenido U2 por U1</span><strong>{product.inventory?.unit2PerUnit1 ?? 'No informado'}</strong></div>
              <div><span>Unidades por caja</span><strong>{product.unitsPerCase ?? 'No informado'}</strong></div><div><span>Participa porque</span><strong>{product.catalogParticipation?.map((reason) => reason === 'active_master' ? 'maestro activo' : reason === 'recent_sale' ? 'venta reciente' : 'existencia no nula').join(' · ') || 'Criterio anterior del catálogo'}</strong></div>
            </div>
          </article>

          <article className="data-card product-limitations-card">
            <div className="data-card-header"><div><span className="section-kicker"><Info size={14} /> Alcance de la información</span><h2>Qué se puede afirmar</h2></div></div>
            <ul>
              <li><CheckCircle2 size={14} /><span>Stock observado, precio de referencia y ventas detalladas disponibles.</span></li>
              <li><Info size={14} /><span>GESI no informa una baja inequívoca: inactivo no se presenta automáticamente como discontinuado.</span></li>
              <li><Info size={14} /><span>No se muestran margen, costo, proveedor ni reposición porque todavía no poseen una fuente validada.</span></li>
              <li><Info size={14} /><span>Las facturas sin detalle no pueden atribuirse a este producto ni a sus compradores.</span></li>
            </ul>
          </article>
        </div>

        <article className="data-card product-client-opportunities-card">
          <div className="data-card-header"><div><span className="section-kicker"><UserPlus size={14} /> Clientes para ofrecer</span><h2>Mejores cuentas potenciales para este producto</h2><p>Clientes activos que todavía no lo compraron, ordenados por afinidad y adopción entre comparables.</p></div><div className="product-buyers-actions"><span className="count-badge">{number(clientOpportunities.length)}</span>{clientOpportunities.length > 0 && <button className="button secondary" onClick={() => setShowAllClientOpportunities(true)}>Ver todos</button>}</div></div>
          {clientOpportunitiesLoading && <div className="product-inline-empty"><Sparkles size={18} /><span>Calculando afinidad con el mix y adopción entre clientes comparables…</span></div>}
          {clientOpportunitiesError && <div className="product-inline-empty error"><Info size={18} /><span>{clientOpportunitiesError}</span></div>}
          {!clientOpportunitiesLoading && !clientOpportunitiesError && <div className="product-opportunity-client-list">{clientOpportunities.slice(0, 5).map((item) => <button key={item.client.id} onClick={() => openOpportunityClient(item.client.id)}><div><strong>{item.client.name}</strong>{item.client.tradeName && item.client.tradeName !== item.client.name && <small>{item.client.tradeName}</small>}<p>{item.reason} {item.affinityExplanation}</p></div><span><em className={`opportunity-confidence ${item.confidence}`}>{opportunityConfidenceLabels[item.confidence]}</em><strong>{item.score} pts.</strong><small>{item.client.seller || 'Sin vendedor'} · oportunidad {item.client.commercialOpportunity}/100</small></span><ChevronRight size={15} /></button>)}</div>}
          {!clientOpportunitiesLoading && !clientOpportunitiesError && clientOpportunities.length === 0 && <div className="product-inline-empty"><Info size={18} /><span>No hay clientes que cumplan las reglas actuales. Se excluyen compradores recientes, cuentas inactivas, incompatibilidades y productos sin stock positivo.</span></div>}
          {clientOpportunities.length > 5 && <footer>Se muestran los 5 principales de {number(clientOpportunities.length)} oportunidades calculadas.</footer>}
        </article>

        <article className="data-card closest-products-card product-alternatives-card">
          <div className="data-card-header"><div><span className="section-kicker"><Store size={14} /> Alternativas comerciales</span><h2>Productos relacionados para revisar</h2><p>La explicación resume coincidencias observables; no es una probabilidad de venta.</p></div></div>
          <div className="closest-product-list">{rankedAlternatives.slice(0, 6).map((item) => <article key={item.product.id}><button className="closest-product-main" onClick={() => onOpenProduct?.(item.product)}><span>{affinityLabel(item.comparison.score).slice(0, 1)}</span><div><strong>{item.product.name}</strong><small>{comparisonReason(item.comparison)}</small></div><em>{affinityLabel(item.comparison.score)}</em><ChevronRight size={15} /></button><button className="entity-link closest-product-brand" onClick={() => onOpenBrand?.(item.product.brand)}>{useful(item.product.brand)}</button>{onCompareProduct && <button className="closest-product-compare" disabled={comparisonSelectedIds.includes(item.product.id) || comparisonSelectedIds.length >= 4} onClick={() => onCompareProduct(item.product)}><GitCompareArrows size={12} />{comparisonSelectedIds.includes(item.product.id) ? 'Agregado' : 'Comparar'}</button>}</article>)}</div>
        </article>

        <details className="data-card product-technical-disclosure">
          <summary><span><Sparkles size={17} /><strong>Ver análisis técnico</strong><small>{vectorKeys.length} vectores, evidencias, confianza y comparación auditable</small></span><ChevronRight size={18} /></summary>
          <div className="product-technical-body">
            <article className="vector-card product-vector-v2">
              <div className="data-card-header"><div><span className="section-kicker"><Sparkles size={14} /> Perfil de afinidad</span><h2>{vectorKeys.length} dimensiones explicables</h2></div><div className="vector-confidence"><strong>{product.vectorMeta.confidence}%</strong><span>{confidenceLabel(product.vectorMeta.confidence)}</span></div></div>
              <p className="section-description">Cada porcentaje requiere una señal verificable del nombre o de los maestros de GESI. Un cero significa ausencia de evidencia, no imposibilidad del atributo.</p>
              <div className="vector-list-v2">
                {VECTOR_GROUPS.map((group) => {
                  const groupFeatures = group.keys.filter((key) => featureValues.has(key));
                  return groupFeatures.length ? <section className="vector-group-v21" key={group.id}><h3>{group.label}</h3>{groupFeatures.map((key) => { const value = featureValues.get(key) ?? 0; return <div className="vector-row-v2" key={key}><div><span>{VECTOR_LABELS[key]}</span><small title={product.vectorMeta.evidence[key]?.join(' · ')}>{product.vectorMeta.evidence[key]?.join(' · ') || 'Señal derivada de la clasificación disponible'}</small></div><div className="vector-track"><i style={{ width: `${value}%` }} /></div><strong>{value}%</strong></div>; })}</section> : null;
                })}
                {!features.length && <div className="product-vector-empty"><Info size={18} /><p>No hay señales suficientes para asignar afinidades. El producto se conserva sin completar datos artificialmente.</p></div>}
              </div>
              <footer className="vector-quality-note"><CheckCircle2 size={14} /><span>Cobertura descriptiva: {product.vectorMeta.sourceCoverage}% · confianza del perfil: {product.vectorMeta.confidence}%.</span></footer>
            </article>

            <article className="data-card product-vector-corrections">
              <div className="data-card-header"><div><span className="section-kicker">Corrección controlada</span><h2>Ajustes humanos auditables</h2><p>La regla automática permanece intacta. Este valor local se aplica después de cargar los datos y sobrevive a las actualizaciones.</p></div></div>
              <div className="vector-correction-form"><label><span>Dimensión</span><select value={correctionKey} onChange={(event) => { const key = event.target.value as VectorKey; setCorrectionKey(key); setCorrectionValue(corrections.find((item) => item.key === key)?.value ?? product.vector[key]); }}>{vectorKeys.map((key) => <option key={key} value={key}>{VECTOR_LABELS[key]}</option>)}</select></label><label><span>Valor 0–100</span><input type="number" min="0" max="100" step="1" value={correctionValue} onChange={(event) => setCorrectionValue(Math.max(0, Math.min(100, Number(event.target.value))))} /></label><label className="vector-correction-reason"><span>Motivo obligatorio</span><textarea maxLength={1000} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="Qué se verificó y con qué evidencia…" /></label><button className="button primary" disabled={correctionBusy} onClick={saveCorrection}>Guardar corrección</button></div>
              {correctionError && <p className="form-error">{correctionError}</p>}
              <div className="vector-correction-list">{corrections.map((correction) => <div key={correction.key}><span><strong>{VECTOR_LABELS[correction.key]} · {correction.value}%</strong><small>{correction.reason} · {correction.updatedBy}</small></span><button className="icon-button" disabled={correctionBusy} aria-label={`Revertir corrección de ${VECTOR_LABELS[correction.key]}`} onClick={() => removeCorrection(correction)}><Trash2 size={15} /></button></div>)}{!corrections.length && <p>Sin correcciones humanas activas.</p>}</div>
              {correctionHistory.length > 0 && <details><summary>Ver historial ({correctionHistory.length})</summary><ul>{correctionHistory.slice(0, 20).map((event) => <li key={event.id}><strong>{event.eventType === 'set' ? 'Ajuste' : 'Reversión'} · {VECTOR_LABELS[event.key]} · {event.value}%</strong><span>{event.reason} · {new Date(event.updatedAt).toLocaleString('es-AR')}</span></li>)}</ul></details>}
            </article>

          </div>
        </details>

          <div className="product-data-note"><CalendarDays size={14} /><span>Stock y precio de referencia corresponden a la última actualización; el precio efectivamente facturado se consulta por separado en Precios y evolución. Rotación mensual = unidades de 90 días ÷ 3; cobertura = stock positivo ÷ rotación exacta.</span></div>
      </div>
      {showAllBuyers && <div className="product-buyers-modal-layer"><button className="product-buyers-modal-backdrop" aria-label="Cerrar clientes compradores" onClick={() => setShowAllBuyers(false)} /><section className="data-card product-buyers-modal" role="dialog" aria-modal="true" aria-label={`Clientes compradores de ${product.name}`}><header><div><span className="section-kicker"><Users size={14} /> Clientes compradores · 90 días</span><h2>{product.name}</h2><p>Lista completa ordenada por venta atribuida.</p></div><button className="icon-button" aria-label="Cerrar lista de compradores" onClick={() => setShowAllBuyers(false)}><X size={18} /></button></header><div className="product-buyers-modal-tools"><label className="inline-search"><Search size={15} /><input value={buyerQuery} onChange={(event) => setBuyerQuery(event.target.value)} placeholder="Buscar cliente o vendedor…" /></label><span className="count-badge">{number(visibleBuyers.length)} de {number(commercial.buyers.length)}</span></div><div className="product-buyer-list product-buyer-list-full">{visibleBuyers.map((buyer) => <button key={buyer.client.id} onClick={() => { setShowAllBuyers(false); onOpenClient?.(buyer.client); }}><div><strong>{clientPrimaryName(buyer.client)}</strong><small>{clientSecondaryName(buyer.client) ? `${clientSecondaryName(buyer.client)} · ` : ''}{buyer.client.seller || 'Sin vendedor'} · última compra {shortDate(buyer.lastPurchaseAt)}</small></div><span><strong>{money(buyer.sales, true)}</strong><small>{number(buyer.units)} u. · {buyer.purchaseDays} días de compra</small></span><ChevronRight size={15} /></button>)}</div>{!visibleBuyers.length && <div className="product-inline-empty"><Info size={18} /><span>No hay compradores que coincidan con la búsqueda.</span></div>}<footer>Fuente: ventas con detalle disponible. Las facturas sin detalle no se atribuyen a un producto.</footer></section></div>}
      {showAllClientOpportunities && <div className="product-buyers-modal-layer"><button className="product-buyers-modal-backdrop" aria-label="Cerrar clientes sugeridos" onClick={() => setShowAllClientOpportunities(false)} /><section className="data-card product-buyers-modal product-client-opportunities-modal" role="dialog" aria-modal="true" aria-label={`Clientes para ofrecer ${product.name}`}><header><div><span className="section-kicker"><UserPlus size={14} /> Clientes para ofrecer</span><h2>{product.name}</h2><p>Ordenados por afinidad con el mix y adopción entre cuentas comparables.</p></div><button className="icon-button" aria-label="Cerrar clientes sugeridos" onClick={() => setShowAllClientOpportunities(false)}><X size={18} /></button></header><div className="product-buyers-modal-tools"><label className="inline-search"><Search size={15} /><input value={clientOpportunityQuery} onChange={(event) => setClientOpportunityQuery(event.target.value)} placeholder="Buscar cliente, vendedor o localidad…" /></label><span className="count-badge">{number(visibleClientOpportunities.length)} de {number(clientOpportunities.length)}</span></div><div className="product-opportunity-client-list product-opportunity-client-list-full">{visibleClientOpportunities.map((item) => <button key={item.client.id} onClick={() => { setShowAllClientOpportunities(false); openOpportunityClient(item.client.id); }}><div><strong>{item.client.name}</strong>{item.client.tradeName && item.client.tradeName !== item.client.name && <small>{item.client.tradeName}</small>}<p>{item.reason} {item.affinityExplanation}</p></div><span><em className={`opportunity-confidence ${item.confidence}`}>{opportunityConfidenceLabels[item.confidence]}</em><strong>{item.score} pts.</strong><small>{item.client.seller || 'Sin vendedor'} · {item.client.locality || 'Sin localidad'} · oportunidad {item.client.commercialOpportunity}/100</small></span><ChevronRight size={15} /></button>)}</div>{!visibleClientOpportunities.length && <div className="product-inline-empty"><Info size={18} /><span>No hay clientes que coincidan con la búsqueda.</span></div>}<footer>Fuente: datos comerciales disponibles. No crea tareas ni registra que una oferta haya ocurrido; la confianza describe la evidencia disponible, no una probabilidad de venta.</footer></section></div>}
    </section>
  );
}

function ClipboardReviewIcon({ status }: { status?: InventoryAlertReview['status'] }) {
  return status === 'reviewed' ? <CheckCircle2 size={17} /> : <Info size={17} />;
}
