import { useEffect, useMemo, useState } from 'react';
import { Activity, Clock3, History, LogIn, RefreshCw, ShieldCheck } from 'lucide-react';
import type { DeveloperActivityPayload, UserRole } from '../../shared/auth';
import { number } from '../lib/format';

const roleLabel: Record<UserRole, string> = {
  developer: 'Developer',
  admin: 'Administrador',
  office: 'Oficina',
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState('');
  const [visibleAccesses, setVisibleAccesses] = useState(100);
  const [visibleChanges, setVisibleChanges] = useState(150);

  const reload = () => {
    setLoading(true);
    setError('');
    fetch('/api/system/user-activity')
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? 'No se pudo cargar la actividad.');
        setPayload(body);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  const usersById = useMemo(() => new Map(payload?.users.map((item) => [item.user.id, item.user]) ?? []), [payload]);
  const summaries = payload?.users.filter((item) => !userId || item.user.id === userId) ?? [];
  const accesses = payload?.accesses.filter((item) => !userId || item.userId === userId) ?? [];
  const changes = payload?.changes.filter((item) => !userId || item.userId === userId) ?? [];
  const totals = summaries.reduce((result, item) => ({
    accesses: result.accesses + item.accessCount,
    activeSeconds: result.activeSeconds + item.activeSeconds,
    changes: result.changes + item.changeCount,
  }), { accesses: 0, activeSeconds: 0, changes: 0 });

  return <div className="page-view developer-activity-page">
    <section className="data-card developer-activity-hero">
      <div><span className="section-kicker"><ShieldCheck size={15} /> Vista Developer</span><h2>Actividad de usuarios</h2><p>Accesos, tiempo de uso real y cambios registrados desde v1.2.1. Nunca se muestran contraseñas ni contenido privado de los formularios.</p></div>
      <div className="developer-filter"><label><span>Usuario</span><select value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">Todos</option>{payload?.users.map((item) => <option key={item.user.id} value={item.user.id}>{item.user.displayName}</option>)}</select></label><button className="button ghost compact" onClick={reload}><RefreshCw className={loading ? 'spin' : ''} size={14} /> Actualizar</button></div>
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
        <header><span>Usuario</span><span>Rol</span><span>Accesos</span><span>Hoy</span><span>Total activo</span><span>Cambios</span><span>Última actividad</span></header>
        {summaries.map((item) => <article key={item.user.id}>
          <span><strong>{item.user.displayName}</strong><small>{item.user.status === 'active' ? 'Habilitado' : item.user.status}</small></span>
          <span className={`developer-role ${item.user.role}`}>{roleLabel[item.user.role]}</span>
          <span>{number(item.accessCount)}</span>
          <span>{duration(item.activeSecondsToday)}</span>
          <span>{duration(item.activeSeconds)}</span>
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
        <div className="developer-event-list changes">{changes.slice(0, visibleChanges).map((change) => <article key={change.id}><div><strong>{usersById.get(change.userId)?.displayName ?? 'Usuario anterior'}</strong><span>{dateTime(change.occurredAt)}</span></div><div><strong>{change.action}</strong><span>{change.method} · {change.path}</span></div></article>)}{visibleChanges < changes.length && <button className="developer-load-more" onClick={() => setVisibleChanges((value) => value + 150)}>Mostrar 150 cambios más</button>}{!changes.length && !loading && <p className="developer-empty">Todavía no hay cambios registrados.</p>}</div>
      </section>
    </div>
    {error && <div className="auth-message error">{error}</div>}
  </div>;
}
