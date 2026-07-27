import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Clock3,
  Database,
  FolderOpen,
  LayoutDashboard,
  Package,
  PackageSearch,
  PawPrint,
  RefreshCw,
  ShoppingBag,
  ShoppingBasket,
  Star,
  WalletCards,
} from 'lucide-react';
import type { DashboardData, ExecutiveSummaryDestination } from '../../shared/models';
import { ExecutiveSummary } from '../components/ExecutiveSummary';
import {
  parseFavoriteReports,
  parseRecentReports,
  toggleFavoriteReport,
  type RecentReport,
  type ReportViewId,
} from '../lib/report-center';

const FAVORITES_KEY = 'salice-report-favorites-v080';
const RECENTS_KEY = 'salice-report-recents-v080';

type ReportGroupId = 'direction' | 'sales' | 'portfolio' | 'brands';

interface ReportDefinition {
  id: ReportViewId;
  group: ReportGroupId;
  name: string;
  description: string;
  endpoint: string;
  icon: ComponentType<{ size?: number }>;
  tone: 'green' | 'blue' | 'ochre' | 'red';
}

interface ReportMeta {
  available?: boolean;
  sourceSystem?: string;
  coverageFrom?: string;
  minDate?: string;
  maxDate?: string;
  capturedAt?: string;
  salesFrom?: string;
  asOfDate?: string;
  unavailableDocumentCount?: number;
  agreementsAvailable?: boolean;
}

const REPORT_GROUPS: { id: ReportGroupId; title: string; description: string }[] = [
  { id: 'direction', title: 'Dirección', description: 'Objetivos, resultados y lectura general del negocio.' },
  { id: 'sales', title: 'Ventas', description: 'Evolución comercial, volumen, marcas y productos.' },
  { id: 'portfolio', title: 'Cartera', description: 'Deuda abierta y cuentas que requieren recuperación.' },
  { id: 'brands', title: 'Negocios y marcas', description: 'Seguimiento de universos comerciales específicos.' },
];

const REPORTS: ReportDefinition[] = [
  {
    id: 'reports',
    group: 'direction',
    name: 'Reporte General',
    description: '¿Cómo avanzan los resultados reales frente a los objetivos comerciales?',
    endpoint: '/api/reports/general/meta',
    icon: LayoutDashboard,
    tone: 'green',
  },
  {
    id: 'commercial-sales',
    group: 'sales',
    name: 'Ventas y composición',
    description: '¿Cuánto se vendió y cómo se compone el negocio por marca y producto?',
    endpoint: '/api/reports/commercial-sales/meta',
    icon: ShoppingBasket,
    tone: 'blue',
  },
  {
    id: 'spt',
    group: 'sales',
    name: 'Volumen SPT',
    description: '¿Cómo evoluciona el volumen en kilos frente a períodos equivalentes?',
    endpoint: '/api/reports/spt/meta',
    icon: BarChart3,
    tone: 'ochre',
  },
  {
    id: 'pending-balances',
    group: 'portfolio',
    name: 'Saldos pendientes',
    description: '¿Qué saldo está abierto o vencido y cómo se distribuye por vendedor y cliente?',
    endpoint: '/api/reports/pending-balances/meta',
    icon: WalletCards,
    tone: 'red',
  },
  {
    id: 'non-buyers',
    group: 'portfolio',
    name: 'Cuentas no compradoras',
    description: '¿Qué cuentas o marcas dejaron de comprar dentro del universo reciente?',
    endpoint: '/api/reports/non-buyers/meta',
    icon: PackageSearch,
    tone: 'ochre',
  },
  {
    id: 'mars',
    group: 'brands',
    name: 'Mars · desempeño comercial',
    description: '¿Cómo evolucionan volumen, cobertura y marcas dentro de los períodos Mars?',
    endpoint: '/api/reports/mars/meta',
    icon: PawPrint,
    tone: 'red',
  },
  {
    id: 'nutripet',
    group: 'brands',
    name: 'NutriPet · desempeño comercial',
    description: '¿Cómo evolucionan volumen, cobertura, marcas y productos NutriPet?',
    endpoint: '/api/reports/nutripet/meta',
    icon: ShoppingBag,
    tone: 'green',
  },
  {
    id: 'baires',
    group: 'brands',
    name: 'Baires · desempeño comercial',
    description: '¿Cómo se comportan Baires Especializado y Masivo por volumen y cobertura?',
    endpoint: '/api/reports/baires/meta',
    icon: Package,
    tone: 'blue',
  },
];

const reportById = new Map(REPORTS.map((report) => [report.id, report]));

function formatDate(value?: string, withTime = false) {
  if (!value) return 'No informado';
  const normalized = value.length === 10 ? `${value}T12:00:00` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return 'No informado';
  return new Intl.DateTimeFormat('es-AR', withTime
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function periodLabel(meta?: ReportMeta) {
  if (!meta) return 'Consultando cobertura…';
  const from = meta.coverageFrom || meta.minDate || meta.salesFrom;
  const through = meta.maxDate || meta.asOfDate;
  if (!from && !through) return 'Cobertura no informada';
  if (!from) return `Hasta ${formatDate(through)}`;
  if (!through) return `Desde ${formatDate(from)}`;
  return `${formatDate(from)} — ${formatDate(through)}`;
}

function QuickAccess({
  title,
  empty,
  reports,
  recents,
  onOpen,
}: {
  title: string;
  empty: string;
  reports: ReportDefinition[];
  recents?: RecentReport[];
  onOpen: (id: ReportViewId) => void;
}) {
  const recentById = new Map(recents?.map((recent) => [recent.id, recent.openedAt]));
  return (
    <section className="report-hub-quick-block">
      <div className="report-hub-section-heading">
        <div><span>{title}</span></div>
      </div>
      {reports.length ? <div className="report-hub-quick-list">{reports.map((report) => {
        const Icon = report.icon;
        const openedAt = recentById.get(report.id);
        return <button key={report.id} onClick={() => onOpen(report.id)}>
          <span className={`report-hub-mini-icon ${report.tone}`}><Icon size={16} /></span>
          <span><strong>{report.name}</strong>{openedAt && <small>Abierto el {formatDate(openedAt, true)}</small>}</span>
          <ArrowRight size={15} />
        </button>;
      })}</div> : <div className="report-hub-empty"><Star size={17} /><span>{empty}</span><button onClick={() => onOpen('reports')}>Abrir Reporte General <ArrowRight size={13} /></button></div>}
    </section>
  );
}

export function ReportsHubView({
  data,
  onOpenReport,
  onOpenDestination,
  onOpenSheet,
}: {
  data: DashboardData;
  onOpenReport: (id: ReportViewId) => void;
  onOpenDestination: (destination: ExecutiveSummaryDestination) => void;
  onOpenSheet: (sheetId: number) => void;
}) {
  const [metadata, setMetadata] = useState<Partial<Record<ReportViewId, ReportMeta>>>({});
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<ReportViewId[]>(() => parseFavoriteReports(localStorage.getItem(FAVORITES_KEY)));
  const [recents, setRecents] = useState<RecentReport[]>(() => parseRecentReports(localStorage.getItem(RECENTS_KEY)));
  const [sheetLookup, setSheetLookup] = useState('');
  const sortedSheets = useMemo(() => [...data.logistics.sheets].sort((left, right) => right.id - left.id), [data.logistics.sheets]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all(REPORTS.map(async (report) => {
      try {
        const response = await fetch(report.endpoint);
        if (!response.ok) return [report.id, { available: false }] as const;
        return [report.id, await response.json() as ReportMeta] as const;
      } catch {
        return [report.id, { available: false }] as const;
      }
    })).then((entries) => {
      if (!active) return;
      setMetadata(Object.fromEntries(entries));
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    const refresh = () => setRecents(parseRecentReports(localStorage.getItem(RECENTS_KEY)));
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  const favoriteReports = useMemo(() => REPORTS.filter((report) => favorites.includes(report.id)), [favorites]);
  const recentReports = useMemo(() => recents.flatMap((recent) => {
    const report = reportById.get(recent.id);
    return report ? [report] : [];
  }), [recents]);
  const availableCount = REPORTS.filter((report) => metadata[report.id]?.available !== false).length;

  const toggleFavorite = (id: ReportViewId) => setFavorites((current) => toggleFavoriteReport(current, id));

  return (
    <div className="report-hub" data-tour="report-center">
      <section className="report-hub-hero">
        <div>
          <span className="section-kicker"><LayoutDashboard size={15} /> Centro de reportes</span>
          <h2>Elegí el reporte según la pregunta que necesitás responder</h2>
          <p>Encontrá rápidamente resultados generales, ventas, cartera y desempeño por negocio. Cada reporte conserva sus filtros y explica cómo se calcula cuando necesitás consultarlo.</p>
        </div>
        <div className="report-hub-hero-tools">
          <div className="report-hub-status">
            <span><Database size={15} /> Datos actualizados</span>
            <strong>{formatDate(data.meta.generatedAt, true)}</strong>
            <small>{loading ? 'Consultando metadatos de los reportes…' : availableCount === REPORTS.length ? '8 reportes disponibles para revisión' : `${availableCount} de 8 reportes disponibles`}</small>
          </div>
          <div className="report-hub-sheet-lookup">
            <label><span>Consultar foja</span><select value={sheetLookup} onChange={(event) => setSheetLookup(event.target.value)}>
              <option value="">Elegir número…</option>
              {sortedSheets.map((sheet) => <option value={sheet.id} key={sheet.id}>Foja {sheet.id} · {sheet.status === 'closed' ? 'cerrada' : 'abierta'}</option>)}
            </select></label>
            <button className="button secondary compact" disabled={!sheetLookup} onClick={() => onOpenSheet(Number(sheetLookup))}><FolderOpen size={14} /> Abrir</button>
          </div>
        </div>
      </section>

      <ExecutiveSummary summary={data.executiveSummary ?? null} onOpen={onOpenDestination} />

      <div className="report-hub-quick-grid">
        <QuickAccess title="Favoritos" empty="Marcá la estrella de un reporte para dejarlo a mano." reports={favoriteReports} onOpen={onOpenReport} />
        <QuickAccess title="Accesos recientes" empty="Los últimos reportes abiertos aparecerán acá." reports={recentReports} recents={recents} onOpen={onOpenReport} />
      </div>

      {REPORT_GROUPS.map((group) => (
        <section className="report-hub-group" key={group.id}>
          <div className="report-hub-group-heading">
            <div><h3>{group.title}</h3><p>{group.description}</p></div>
            <span>{REPORTS.filter((report) => report.group === group.id).length} {REPORTS.filter((report) => report.group === group.id).length === 1 ? 'reporte' : 'reportes'}</span>
          </div>
          <div className="report-hub-grid">
            {REPORTS.filter((report) => report.group === group.id).map((report) => {
              const Icon = report.icon;
              const meta = metadata[report.id];
              const isFavorite = favorites.includes(report.id);
              return <article className="report-hub-card" key={report.id}>
                <div className="report-hub-card-top">
                  <span className={`report-hub-card-icon ${report.tone}`}><Icon size={21} /></span>
                  <button
                    className={`report-hub-favorite ${isFavorite ? 'active' : ''}`}
                    aria-label={`${isFavorite ? 'Quitar' : 'Agregar'} ${report.name} ${isFavorite ? 'de' : 'a'} favoritos`}
                    aria-pressed={isFavorite}
                    onClick={() => toggleFavorite(report.id)}
                  ><Star size={17} fill={isFavorite ? 'currentColor' : 'none'} /></button>
                </div>
                <div className="report-hub-card-copy">
                  <h3>{report.name}</h3>
                  <p>{report.description}</p>
                </div>
                <dl className="report-hub-meta">
                  <div><dt><CalendarDays size={13} /> Período disponible</dt><dd>{periodLabel(meta)}</dd></div>
                  <div><dt><Clock3 size={13} /> Actualización</dt><dd>{formatDate(meta?.capturedAt || data.meta.generatedAt, true)}</dd></div>
                </dl>
                <button className="report-hub-open" onClick={() => onOpenReport(report.id)}>Abrir reporte <ArrowRight size={15} /></button>
              </article>;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
