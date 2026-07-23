import { useEffect, useMemo, useState } from 'react';
import { Boxes, ChevronRight, PackageCheck, PackageX, Search, Sparkles, Store, Users } from 'lucide-react';
import type { Client, Product, Recommendation, RecommendationConfidence, RecommendationKind } from '../../shared/models';
import { clientPrimaryName, clientSecondaryName } from '../lib/client-name';
import { money, number } from '../lib/format';

const kindLabels: Record<RecommendationKind, string> = {
  mix_gap: 'Falta en el mix reciente',
  peer_adoption: 'Adoptado por comparables',
  stockout_substitute: 'Sustituto ante quiebre',
  high_stock_opportunity: 'Stock alto para movilizar',
};
const confidenceLabels: Record<RecommendationConfidence, string> = {
  reliable: 'Confianza alta', exploratory: 'Confianza media', insufficient: 'Confianza limitada',
};

export function CommercialOpportunitiesWorkspace({ clients, initialClientId, onOpenClient, onOpenSeller, onOpenBrand, onOpenProduct }: {
  clients: Client[];
  initialClientId?: number | null;
  onOpenClient: (client: Client) => void;
  onOpenSeller: (seller: string) => void;
  onOpenBrand: (brand: string) => void;
  onOpenProduct: (product: Product) => void;
}) {
  const activeClients = useMemo(() => clients.filter((client) => client.active && client.purchases.length > 0).sort((a, b) => b.commercialOpportunity - a.commercialOpportunity || b.sales90d - a.sales90d), [clients]);
  const [selectedId, setSelectedId] = useState(() => initialClientId && activeClients.some((client) => client.id === initialClientId) ? initialClientId : activeClients[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<RecommendationKind | 'all'>('all');
  const [confidence, setConfidence] = useState<RecommendationConfidence | 'all'>('all');
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const selected = activeClients.find((client) => client.id === selectedId) ?? activeClients[0];

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setRecommendations([]);
    fetch(`/api/clients/${selected.id}/recommendations`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then((payload) => setRecommendations(payload.recommendations || []))
      .catch((fetchError: Error) => { if (fetchError.name !== 'AbortError') setError('No se pudieron calcular las oportunidades. Los datos existentes no fueron modificados.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selected?.id]);

  const normalized = query.trim().toLocaleLowerCase('es');
  const visibleClients = activeClients.filter((client) => `${clientPrimaryName(client)} ${clientSecondaryName(client)} ${client.seller} ${client.locality}`.toLocaleLowerCase('es').includes(normalized)).slice(0, 120);
  const visibleRecommendations = recommendations.filter((item) => (kind === 'all' || item.kinds.includes(kind)) && (confidence === 'all' || item.confidence === confidence));

  if (!selected) return <section className="data-card opportunity-empty">No hay clientes activos disponibles para analizar.</section>;
  return <div className="commercial-opportunity-layout">
    <aside className="data-card opportunity-client-directory">
      <header><span className="section-kicker"><Users size={14} /> Cliente objetivo</span><h2>Elegir una cuenta</h2><p>Orden inicial por señal O y ventas recientes.</p></header>
      <label className="inline-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, vendedor o localidad…" /></label>
      <div className="opportunity-client-list">{visibleClients.map((client) => <button key={client.id} className={client.id === selected.id ? 'active' : ''} onClick={() => setSelectedId(client.id)}><span><strong>{clientPrimaryName(client)}</strong><small>{client.seller} · {client.locality}</small></span><b>O{client.commercialOpportunity}</b></button>)}</div>
      <footer>{number(visibleClients.length)} de {number(activeClients.length)} clientes activos con mix observable</footer>
    </aside>
    <section className="opportunity-workspace-main">
      <header className="data-card opportunity-hero">
        <div><span className="section-kicker"><Sparkles size={15} /> Oportunidades explicables · 90 días</span><h2>{clientPrimaryName(selected)}</h2>{clientSecondaryName(selected) && <p>{clientSecondaryName(selected)}</p>}<div className="opportunity-entity-links"><button onClick={() => onOpenClient(selected)}><Users size={13} /> Abrir cliente</button><button onClick={() => onOpenSeller(selected.seller)}><Users size={13} /> {selected.seller}</button></div></div>
        <div className="opportunity-hero-score"><span>Señal comercial</span><strong>O{selected.commercialOpportunity}</strong><small>{money(selected.sales90d, true)} vendidos en 90 días</small></div>
      </header>
      <div className="data-card opportunity-controls"><label><span>TIPO</span><select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="all">Todas las oportunidades</option>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>CONFIANZA</span><select value={confidence} onChange={(event) => setConfidence(event.target.value as typeof confidence)}><option value="all">Todos los niveles</option>{Object.entries(confidenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><p><PackageCheck size={15} /> Sólo productos comercializables con stock positivo. Los incompatibles quedan excluidos.</p></div>
      {loading && <div className="data-card opportunity-status">Calculando mix, pares comparables, quiebres y cobertura…</div>}
      {error && <div className="data-card opportunity-status error">{error}</div>}
      {!loading && !error && <div className="commercial-opportunity-grid">{visibleRecommendations.map((item) => <article className="data-card commercial-opportunity-card" key={item.product.id}>
        <header><div className="opportunity-kind-list">{item.kinds.map((value) => <span key={value} className={value}>{kindLabels[value]}</span>)}</div><strong className={`opportunity-confidence ${item.confidence}`}>{confidenceLabels[item.confidence]}</strong></header>
        <button className="opportunity-product-name" onClick={() => onOpenProduct(item.product)}><span><strong>{item.product.name}</strong><small>{item.product.sku}</small></span><ChevronRight size={16} /></button>
        <button className="opportunity-brand-link" onClick={() => onOpenBrand(item.product.brand)}><Store size={13} /> {item.product.brand}</button>
        <p className="opportunity-reason">{item.reason}</p><p className="opportunity-affinity">{item.affinityExplanation}</p>
        {item.replacedProduct && <button className="opportunity-replaced" onClick={() => onOpenProduct(item.replacedProduct!)}><PackageX size={14} /><span>Quiebre observado: <strong>{item.replacedProduct.name}</strong></span></button>}
        <div className="opportunity-metrics"><span><small>Afinidad</small><strong>{item.similarity}%</strong></span><span><small>Pares</small><strong>{item.peerAdoption}%</strong></span><span><small>Stock</small><strong>{number(item.product.stock)}</strong></span><span><small>Puntaje</small><strong>{item.score}</strong></span></div>
        {!!item.comparableClients.length && <div className="opportunity-peers"><small>Ejemplos comparables que lo compraron</small>{item.comparableClients.map((peer) => { const full = clients.find((client) => client.id === peer.id); return <button key={peer.id} disabled={!full} onClick={() => full && onOpenClient(full)}>{peer.name}<ChevronRight size={12} /></button>; })}</div>}
        <details><summary>Ver evidencia</summary><ul>{item.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul></details>
      </article>)}</div>}
      {!loading && !error && !visibleRecommendations.length && <div className="data-card opportunity-status">No hay oportunidades que cumplan estos filtros. No se completan recomendaciones con productos sin stock ni datos inventados.</div>}
      <div className="opportunity-no-task"><Boxes size={16} /><span>Estas sugerencias no crean tareas ni registran gestiones. Una tarea sólo se considera realizada cuando una persona guarda la gestión correspondiente.</span></div>
    </section>
  </div>;
}
