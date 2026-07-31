import { useEffect, useMemo, useState } from 'react';
import { Boxes, ChevronRight, Info, PackageCheck, Store, TrendingUp, Warehouse, X } from 'lucide-react';
import type { BrandAnalysisPayload } from '../../shared/brand-analysis';
import type { Product } from '../../shared/models';
import { compactDate, money, number } from '../lib/format';

export function BrandPanel({ brand, products, onClose, onOpenProduct }: {
  brand: string;
  products: Product[];
  onClose: () => void;
  onOpenProduct: (product: Product) => void;
}) {
  const [analysis, setAnalysis] = useState<BrandAnalysisPayload | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setAnalysis(null);
    setError('');
    fetch('/api/brands/analysis', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'No se pudo calcular la marca.');
        return response.json() as Promise<BrandAnalysisPayload>;
      })
      .then(setAnalysis)
      .catch((cause) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => controller.abort();
  }, [brand]);

  const catalogProducts = useMemo(() => products.filter((product) => product.brand === brand), [brand, products]);
  const commercial = analysis?.brands.find((row) => row.name === brand);
  const commercialByProduct = useMemo(() => new Map((commercial?.products ?? []).map((row) => [row.productId, row])), [commercial]);
  const orderedProducts = useMemo(() => [...catalogProducts].sort((left, right) => {
    const salesDifference = (commercialByProduct.get(right.id)?.netAmount ?? 0) - (commercialByProduct.get(left.id)?.netAmount ?? 0);
    return salesDifference || right.stock - left.stock || left.name.localeCompare(right.name, 'es');
  }), [catalogProducts, commercialByProduct]);
  const stock = catalogProducts.reduce((sum, product) => sum + product.stock, 0);

  return <section className="brand-panel" role="dialog" aria-modal="true" aria-labelledby="brand-panel-title">
    <header className="brand-panel-header">
      <div><span className="section-kicker"><Store size={14} /> Marca · últimos 90 días</span><h2 id="brand-panel-title">{brand}</h2><p>{analysis ? `${compactDate(analysis.range.from)} → ${compactDate(analysis.range.through)}` : 'Calculando el período comercial…'}</p></div>
      <button className="icon-button" aria-label="Cerrar ficha de marca" onClick={onClose}><X size={18} /></button>
    </header>
    <div className="brand-panel-scroll">
      {error && <div className="demand-coverage-note attention"><Info size={17} /><div><strong>No se pudo abrir el análisis comercial</strong><span>{error}</span></div></div>}
      <div className="brand-panel-kpis">
        <article><TrendingUp size={18} /><span>Facturación neta</span><strong>{commercial ? money(commercial.netAmount) : analysis ? money(0) : '—'}</strong><small>{commercial ? `${number(commercial.salesSharePercent, 2)}% del total` : analysis ? 'Sin ventas detalladas en 90 días' : 'Esperando datos'}</small></article>
        <article><PackageCheck size={18} /><span>Kilos netos estimados</span><strong>{commercial ? `${number(commercial.kilos, 2)} kg` : analysis ? '0 kg' : '—'}</strong><small>{commercial ? `${number(commercial.kiloSharePercent, 2)}% del total` : analysis ? 'Sin volumen atribuible en 90 días' : 'Esperando datos'}</small></article>
        <article><Boxes size={18} /><span>Productos</span><strong>{number(catalogProducts.length)}</strong><small>{number(catalogProducts.filter((product) => product.commercialStatus === 'commercializable').length)} comercializables</small></article>
        <article><Warehouse size={18} /><span>Stock disponible</span><strong>{number(stock)}</strong><small>depósito 2</small></article>
      </div>
      <section className="brand-panel-products">
        <header><div><span className="section-kicker">Productos de la marca</span><h3>{number(orderedProducts.length)} productos</h3></div><span>Facturación y kilos se muestran juntos.</span></header>
        <div className="brand-panel-product-list">
          {orderedProducts.map((product) => {
            const metrics = commercialByProduct.get(product.id);
            return <button key={product.id} onClick={() => onOpenProduct(product)}>
              <span><strong>{product.name}</strong><small>{product.sku} · {product.family} · stock {number(product.stock)}</small></span>
              <span><strong>{metrics ? money(metrics.netAmount, true) : 'Sin venta'}</strong><small>{metrics ? `${number(metrics.kilos, 2)} kg · ${number(metrics.buyers)} compradores` : '90 días'}</small></span>
              <ChevronRight size={16} />
            </button>;
          })}
        </div>
      </section>
    </div>
  </section>;
}
