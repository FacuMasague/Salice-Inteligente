import { useEffect, useMemo, useState } from 'react';
import { Check, Clock3, RefreshCw, ShieldCheck, UserRoundCheck, UserRoundX, Users } from 'lucide-react';
import type { AuthUser, UserRole, UserStatus } from '../../shared/auth';
import { useAuth } from '../auth';

const statusLabel: Record<UserStatus, string> = {
  pending: 'Pendiente',
  active: 'Habilitado',
  rejected: 'Rechazado',
  disabled: 'Deshabilitado',
};
const roleLabel: Record<UserRole, string> = {
  developer: 'Developer',
  admin: 'Administrador',
  office: 'Oficina',
};

function date(value: string | null) {
  if (!value) return 'Sin ingresos';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function UsersView() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const pending = useMemo(() => users.filter((user) => user.status === 'pending'), [users]);

  const reload = () => {
    setLoading(true);
    fetch('/api/system/users')
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? 'No se pudieron cargar los usuarios.');
        setUsers(payload.users ?? []);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  const update = async (user: AuthUser, status: Exclude<UserStatus, 'pending'>, role: UserRole = user.role) => {
    setBusyId(user.id);
    setError('');
    try {
      const response = await fetch(`/api/system/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, role }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo actualizar el usuario.');
      setUsers((current) => current.map((item) => item.id === user.id ? payload.user : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId('');
    }
  };

  return <div className="page-view users-page">
    <section className="data-card users-hero">
      <div><span className="section-kicker"><ShieldCheck size={15} /> Seguridad de acceso</span><h2>Usuarios autorizados</h2><p>Sólo las cuentas habilitadas pueden consultar información del negocio. Las solicitudes nuevas no reciben acceso hasta que un administrador las aprueba.</p></div>
      <div className="users-summary"><span><Clock3 size={16} /> Pendientes</span><strong>{pending.length}</strong></div>
    </section>

    {!!pending.length && <section className="data-card pending-users-card">
      <div className="data-card-header"><div><span className="section-kicker"><UserRoundCheck size={15} /> Revisión requerida</span><h2>Solicitudes pendientes</h2><p>Confirmá personalmente la identidad antes de habilitar una cuenta.</p></div></div>
      <div className="users-list pending">{pending.map((user) => <article key={user.id}>
        <div className="user-avatar">{user.displayName.slice(0, 1).toUpperCase()}</div>
        <div><strong>{user.displayName}</strong><span>@{user.username} · solicitó el {date(user.createdAt)}</span></div>
        <select aria-label={`Rol de ${user.displayName}`} defaultValue="office" id={`role-${user.id}`}><option value="office">Oficina</option><option value="admin">Administrador</option>{currentUser.role === 'developer' && <option value="developer">Developer</option>}</select>
        <div className="user-actions">
          <button className="button primary compact" disabled={busyId === user.id} onClick={() => {
            const role = (document.getElementById(`role-${user.id}`) as HTMLSelectElement)?.value as UserRole;
            void update(user, 'active', role);
          }}><Check size={14} /> Aprobar</button>
          <button className="button ghost compact danger" disabled={busyId === user.id} onClick={() => void update(user, 'rejected')}><UserRoundX size={14} /> Rechazar</button>
        </div>
      </article>)}</div>
    </section>}

    <section className="data-card">
      <div className="data-card-header"><div><span className="section-kicker"><Users size={15} /> Accesos registrados</span><h2>Todos los usuarios</h2><p>Los cambios de estado invalidan inmediatamente las sesiones de una cuenta bloqueada.</p></div><button className="button ghost compact" onClick={reload}><RefreshCw className={loading ? 'spin' : ''} size={14} /> Actualizar</button></div>
      <div className="users-table">
        <header><span>Persona</span><span>Rol</span><span>Estado</span><span>Último ingreso</span><span>Acceso</span></header>
        {users.map((user) => <article key={user.id}>
          <div><strong>{user.displayName}</strong><small>@{user.username}{user.id === currentUser.id ? ' · tu cuenta' : ''}</small></div>
          <select value={user.role} aria-label={`Rol actual: ${roleLabel[user.role]}`} disabled={user.id === currentUser.id || busyId === user.id || (user.role === 'developer' && currentUser.role !== 'developer')} onChange={(event) => void update(user, user.status === 'pending' ? 'active' : user.status, event.target.value as UserRole)}><option value="office">Oficina</option><option value="admin">Administrador</option>{(currentUser.role === 'developer' || user.role === 'developer') && <option value="developer">Developer</option>}</select>
          <span className={`user-status ${user.status}`}>{statusLabel[user.status]}</span>
          <span>{date(user.lastLoginAt)}</span>
          <div className="user-actions">
            {user.status === 'active'
              ? <button className="button ghost compact danger" disabled={user.id === currentUser.id || busyId === user.id} onClick={() => void update(user, 'disabled')}><UserRoundX size={14} /> Deshabilitar</button>
              : <button className="button ghost compact" disabled={busyId === user.id} onClick={() => void update(user, 'active')}><UserRoundCheck size={14} /> Habilitar</button>}
          </div>
        </article>)}
        {!loading && !users.length && <div className="users-empty">No hay usuarios registrados.</div>}
      </div>
      {error && <div className="auth-message error users-error">{error}</div>}
    </section>
  </div>;
}
