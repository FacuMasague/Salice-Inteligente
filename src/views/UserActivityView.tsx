import { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, Clock3, History, LogIn, MailWarning, RefreshCw, ShieldCheck } from 'lucide-react';
import type { DeveloperActivityPayload, UserRole } from '../../shared/auth';
import type { DeveloperAlertStatus } from '../../shared/developer-observability';
import { MobileFilterSheet } from '../components/MobileFilterSheet';
import { number } from '../lib/format';

const roleLabel: Record<UserRole, string> = {
  developer: 'Developer',
  admin: 'Administrador',
  office: 'Oficina',
};

const viewLabel: Record<string, string> = {
  map: 'Mapa operativo', routes: 'Rutas', clients: 'Clientes', sellers: 'Vendedores', products: 'Productos', brands: 'Marcas',
  finance: 'Cartera', agenda: 'Bandeja comercial', 'sales-explorer': 'Explorador de ventas', receivables: 'Cuentas por cobrar',
  'report-center': 'Centro de reportes', reports: 'Reporte General', spt: 'Volumen SPT', 'commercial-sales': 'Ventas y composición',
  mars: 'Mars', nutripet: 'NutriPet', baires: 'Baires', 'non-buyers': 'Cuentas no compradoras', 'pending-balances': 'Saldos pendientes',
  settings: 'Configuración', help: 'Ayuda', users: 'Usuarios', 'user-activity': 'Actividad de usuarios', unknown: 'Sin identificar',
};

function dateTime(value: string | null) {
  if (!value) return 'Sin actividad';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function duration(seconds: number) {
  if (seconds < 60) return `${number(seconds)} s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${number(hours)} h ${number(minutes)} min` : `${number(minutes)} min`;
}

function device(userAgent: string) {
  if (!userAgent) return 'Dispositivo no informado';
  const browser = userAgent.includes('Edg/') ? 'Edge' : userAgent.includes('Chrome/') ? 'Chrome' : userAgent.includes('Safari/') ? 'Safari' : 'Navegador';
  const system = userAgent.includes('Mac OS') ? 'macOS' : userAgent.includes('Windows') ? 'Windows' : userAgent.includes('Android') ? 'Android' : userAgent.includes('iPhone') ? 'iPhone' : '';
  return [browser, system].filter(Boolean).join(' · ');
}

export function UserActivityView() {
  const [payload, setPayload] = useState<DeveloperActivityPayload | null>(null);
  const [alerts, setAlerts] = useState<DeveloperAlertStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState('');
  const [periodDays, setPeriodDays] = useState(30);
  const [visibleAccesses, setVisibleAccesses] = useState(100);
  const [visibleChanges, setVisibleChanges] = useState(150);
  const [testingAlert, setTestingAlert] = useState(false);
  const [alertFeedback, setAlertFeedback] = useState('');

  const reload = () => {
    setLoading(true);
    setError('');
    Promise.all([
      fetch(`/api/system/user-activity?days=${periodDays}`),
      fetch('/api/system/developer-alerts'),
    ])
      .then(async ([activityResponse, alertResponse]) => {
        const body = await activityResponse.json().catch(() => ({}));
        if (!activityResponse.ok) throw new Error(body.error ?? 'No se pudo cargar la actividad.');
        setPayload(body);
        if (alertResponse.ok) setAlerts(await alertResponse.json());
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [periodDays]);

  const usersById = useMemo(() => new Map(payload?.users.map((item) => [item.user.id, item.user]) ?? []), [payload]);
  const summaries = payload?.users.filter((item) => !userId || item.user.id === userId) ?? [];
  const accesses = payload?.accesses.filter((item) => !userId || item.userId === userId) ?? [];
  const changes = payload?.changes.filter((item) => !userId || item.userId === userId) ?? [];
  const views = useMemo(() => {
    const selected = payload?.views.filter((item) => !userId || item.userId === userId) ?? [];
    const aggregate = new Map<string, { activeSeconds: number; visitCount: number; lastActiveAt: string }>();
    for (const item of selected) {
      const current = aggregate.get(item.viewId);
      aggregate.set(item.viewId, {
        activeSeconds: (current?.activeSeconds ?? 0) + item.activeSeconds,
        visitCount: (current?.visitCount ?? 0) + item.visitCount,
        lastActiveAt: !current || item.lastActiveAt > current.lastActiveAt ? item.lastActiveAt : current.lastActiveAt,
      });
    }
    return [...aggregate.entries()].map(([viewId, value]) => ({ viewId, ...value })).sort((left, right) => right.activeSeconds - left.activeSeconds);
  }, [payload, userId]);
  const totals = summaries.reduce((result, item) => ({
    accesses: result.accesses + item.accessCount,
    activeSeconds: result.activeSeconds + item.activeSeconds,
    changes: result.changes + item.changeCount,
  }), { accesses: 0, activeSeconds: 0, changes: 0 });
  const activeFilterCount = (periodDays === 30 ? 0 : 1) + (userId ? 1 : 0);

  const testAlert = async () => {
    setTestingAlert(true);
    setAlertFeedback('');
    try {
      const response = await fetch('/api/system/developer-alerts/test', { method: 'POST' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.delivery === 'not_configured' ? 'Falta configurar SMTP en Render.' : 'No se pudo enviar el correo de prueba.');
      setAlertFeedback(result.delivery === 'deduplicated' ? 'La prueba reciente ya había sido enviada.' : 'Correo de prueba enviado.');
      reload();
    } catch (cause) {
      setAlertFeedback(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setTestingAlert(false);
    }
  };

  return <div className="page-view developer-activity-page">
    <section className="data-card developer-activity-hero">
      <div><span className="section-kicker"><ShieldCheck size={15} /> Vista Developer</span><h2>Actividad de usuarios</h2><p>Accesos, tiempo de uso real y cambios registrados desde v1.2.1. Nunca se muestran contraseñas ni contenido privado de los formularios.</p></div>
      <div className="developer-filter">
        <MobileFilterSheet
          title="Filtrar actividad"
          description="Elegí el período y, si hace falta, un usuario específico."
          activeCount={activeFilterCount}
        >
          <div className="developer-filter"><label><span>Período</span><select value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))}><option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option><option value={365}>Último año</option><option value={0}>Todo el historial</option></select></label><label><span>Usuario</span><select value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">Todos</option>{payload?.users.map((item) => <option key={item.user.id} value={item.user.id}>{item.user.displayName}</option>)}</select></label></div>
        </MobileFilterSheet>
        <button className="button ghost compact" onClick={reload}><RefreshCw className={loading ? 'spin' : ''} size={14} /> Actualizar</button>
      </div>
    </section>

    <section className="data-card developer-user-metrics">
      <div className="data-card-header"><div><span className="section-kicker"><CalendarDays size={14} /> Uso por sección</span><h2>Dónde se usa el programa</h2><p>{userId ? 'Tiempo y visitas del usuario elegido.' : 'Uso agregado de todos los usuarios.'}</p></div></div>
      <div className="developer-table view-summary">
        <header><span>Sección</span><span>Tiempo activo</span><span>Visitas</span><span>Participación</span><span>Último uso</span></header>
        {views.map((item) => <article key={item.viewId}><span><strong>{viewLabel[item.viewId] ?? item.viewId}</strong></span><span>{duration(item.activeSeconds)}</span><span>{number(item.visitCount)}</span><span>{totals.activeSeconds ? number(item.activeSeconds / totals.activeSeconds * 100, 1) : '0'}%</span><span>{dateTime(item.lastActiveAt)}</span></article>)}
        {!views.length && !loading && <p className="developer-empty">Todavía no hay actividad por sección para este período.</p>}
      </div>
    </section>

    <section className="developer-summary-grid">
      <article className="data-card"><LogIn size={18} /><span>Accesos registrados</span><strong>{number(totals.accesses)}</strong></article>
      <article className="data-card"><Clock3 size={18} /><span>Tiempo activo</span><strong>{duration(totals.activeSeconds)}</strong></article>
      <article className="data-card"><Activity size={18} /><span>Cambios realizados</span><strong>{number(totals.changes)}</strong></article>
      <article className="data-card anti-afk"><History size={18} /><span>Control anti-AFK</span><strong>{payload?.antiAfkMinutes ?? 5} min</strong><small>Deja de sumar al superar ese tiempo sin interacción.</small></article>
    </section>

    <section className="data-card developer-user-metrics">
      <div className="data-card-header"><div><span className="section-kicker">Resumen individual</span><h2>Uso por usuario</h2><p>El tiempo activo se acumula en intervalos validados por el servidor.</p></div></div>
      <div className="developer-table user-summary">
        <header><span>Usuario</span><span>Rol</span><span>Accesos</span><span>Hoy</span><span>Período activo</span><span>Días activos</span><span>Sección principal</span><span>Cambios</span><span>Última actividad</span></header>
        {summaries.map((item) => <article key={item.user.id}>
          <span><strong>{item.user.displayName}</strong><small>{item.user.status === 'active' ? 'Habilitado' : item.user.status}</small></span>
          <span className={`developer-role ${item.user.role}`}>{roleLabel[item.user.role]}</span>
          <span>{number(item.accessCount)}</span>
          <span>{duration(item.activeSecondsToday)}</span>
          <span>{duration(item.activeSeconds)}</span>
          <span>{number(item.activeDays)}</span>
          <span>{item.topViewId ? (viewLabel[item.topViewId] ?? item.topViewId) : '—'}</span>
          <span>{number(item.changeCount)}</span>
          <span>{dateTime(item.lastActiveAt)}</span>
        </article>)}
      </div>
    </section>

    <div className="developer-detail-grid">
      <section className="data-card">
        <div className="data-card-header"><div><span className="section-kicker"><LogIn size={14} /> Historial</span><h2>Accesos recientes</h2><p>{number(accesses.length)} ingresos conservados.</p></div></div>
        <div className="developer-event-list">{accesses.slice(0, visibleAccesses).map((access) => <article key={access.id}><div><strong>{usersById.get(access.userId)?.displayName ?? 'Usuario anterior'}</strong><span>{dateTime(access.occurredAt)}</span></div><div><strong>{access.ipAddress || 'IP no informada'}</strong><span>{device(access.userAgent)}</span></div></article>)}{visibleAccesses < accesses.length && <button className="developer-load-more" onClick={() => setVisibleAccesses((value) => value + 100)}>Mostrar 100 accesos más</button>}{!accesses.length && !loading && <p className="developer-empty">Todavía no hay accesos registrados.</p>}</div>
      </section>
      <section className="data-card">
        <div className="data-card-header"><div><span className="section-kicker"><Activity size={14} /> Auditoría</span><h2>Cambios recientes</h2><p>{number(changes.length)} escrituras exitosas; no se guardan sus contenidos.</p></div></div>
        <div className="developer-event-list changes">{changes.slice(0, visibleChanges).map((change) => <article key={change.id}><div><strong>{usersById.get(change.userId)?.displayName ?? 'Usuario anterior'}</strong><span>{dateTime(change.occurredAt)}</span></div><div><strong>{change.action}</strong>{change.detail && <span>{change.detail}</span>}<span>{change.method} · {change.path}</span></div></article>)}{visibleChanges < changes.length && <button className="developer-load-more" onClick={() => setVisibleChanges((value) => value + 150)}>Mostrar 150 cambios más</button>}{!changes.length && !loading && <p className="developer-empty">Todavía no hay cambios registrados.</p>}</div>
      </section>
    </div>
    <section className="data-card developer-alerts">
      <div className="data-card-header"><div><span className="section-kicker"><MailWarning size={14} /> Supervisión automática</span><h2>Alertas para Developer</h2><p>{alerts?.configured ? `El correo está configurado para ${alerts.recipient}.` : 'El registro está activo, pero falta configurar el servidor de correo en Render.'}</p>{alertFeedback && <small>{alertFeedback}</small>}</div><button className="button secondary compact" disabled={testingAlert || !alerts?.configured} onClick={() => void testAlert()}><MailWarning size={14} /> {testingAlert ? 'Enviando…' : 'Enviar prueba'}</button></div>
      <div className="developer-event-list changes">{alerts?.recent.map((alert) => <article key={alert.id}><div><strong>{alert.title}</strong><span>{dateTime(alert.occurredAt)}</span></div><div><strong>{alert.severity === 'critical' ? 'Crítica' : alert.severity === 'error' ? 'Error' : 'Advertencia'} · {alert.delivery === 'sent' ? 'Correo enviado' : alert.delivery === 'deduplicated' ? 'Correo repetido evitado' : alert.delivery === 'not_configured' ? 'Correo sin configurar' : 'Falló el envío'}</strong><span>{alert.detail}</span><span>{alert.source}{alert.deliveryError ? ` · ${alert.deliveryError}` : ''}</span></div></article>)}{!alerts?.recent.length && !loading && <p className="developer-empty">No hay alertas registradas.</p>}</div>
    </section>
    {error && <div className="auth-message error">{error}</div>}
  </div>;
}
