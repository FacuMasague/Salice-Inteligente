import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { KeyRound, LockKeyhole, ShieldCheck, UserPlus } from 'lucide-react';
import type { AuthUser } from '../shared/auth';
import { AUTH_REQUIRED_EVENT } from './lib/auth-fetch';

interface AuthContextValue {
  user: AuthUser;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function AccessScreen({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (mode === 'register' && password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, displayName, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo completar la solicitud.');
      if (mode === 'login') {
        onAuthenticated(payload.user);
      } else {
        setMessage(payload.message ?? 'Solicitud enviada para aprobación.');
        setMode('login');
        setPassword('');
        setConfirmPassword('');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo completar la solicitud.');
    } finally {
      setBusy(false);
    }
  };

  return <main className="auth-page">
    <section className="auth-brand-panel">
      <img src="/salice-logo.png" alt="Salice" />
      <div>
        <span><ShieldCheck size={17} /> Acceso privado</span>
        <h1>La información del negocio queda protegida.</h1>
        <p>Salice Inteligente requiere una cuenta aprobada. La sesión se mantiene en esta computadora hasta que cierres sesión.</p>
      </div>
    </section>
    <section className="auth-card">
      <div className="auth-card-icon">{mode === 'login' ? <LockKeyhole size={25} /> : <UserPlus size={25} />}</div>
      <h2>{mode === 'login' ? 'Ingresar a Salice Inteligente' : 'Solicitar una cuenta'}</h2>
      <p>{mode === 'login' ? 'Usá el usuario aprobado por administración.' : 'Un administrador revisará la solicitud antes de habilitar el acceso.'}</p>
      <form onSubmit={submit}>
        {mode === 'register' && <label><span>Nombre y apellido</span><input autoComplete="name" maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></label>}
        <label><span>Usuario</span><input autoComplete="username" minLength={3} maxLength={40} value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
        <label><span>Contraseña</span><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={12} maxLength={200} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {mode === 'register' && <label><span>Repetir contraseña</span><input type="password" autoComplete="new-password" minLength={12} maxLength={200} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>}
        {error && <div className="auth-message error">{error}</div>}
        {message && <div className="auth-message success">{message}</div>}
        <button className="button primary auth-submit" disabled={busy}>{busy ? 'Procesando…' : mode === 'login' ? <><KeyRound size={16} /> Ingresar</> : <><UserPlus size={16} /> Enviar solicitud</>}</button>
      </form>
      <button className="auth-mode-toggle" onClick={() => { setMode((current) => current === 'login' ? 'register' : 'login'); setError(''); setMessage(''); }}>
        {mode === 'login' ? '¿No tenés usuario? Solicitar acceso' : 'Ya tengo una cuenta aprobada'}
      </button>
    </section>
  </main>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ loading: boolean; user: AuthUser | null }>({ loading: true, user: null });
  useEffect(() => {
    let active = true;
    fetch('/api/auth/session')
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload) => { if (active) setState({ loading: false, user: payload?.user ?? null }); })
      .catch(() => { if (active) setState({ loading: false, user: null }); });
    const invalidate = () => setState({ loading: false, user: null });
    window.addEventListener(AUTH_REQUIRED_EVENT, invalidate);
    return () => { active = false; window.removeEventListener(AUTH_REQUIRED_EVENT, invalidate); };
  }, []);

  const value = useMemo<AuthContextValue | null>(() => state.user ? ({
    user: state.user,
    logout: async () => {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
      setState({ loading: false, user: null });
    },
  }) : null, [state.user]);

  if (state.loading) return <main className="boot-screen"><img className="boot-logo loading" src="/salice-logo.png" alt="Salice" /><h1>Verificando acceso seguro</h1><p>Validando la sesión de esta computadora…</p></main>;
  if (!value) return <AccessScreen onAuthenticated={(user) => setState({ loading: false, user })} />;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth requiere una sesión autenticada.');
  return value;
}
