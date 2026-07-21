import { Bookmark, Check, RefreshCw, Star, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SavedView } from '../../shared/models';

interface SavedViewsBarProps {
  viewKey: SavedView['viewKey'];
  filters: Record<string, string>;
  onApply: (filters: Record<string, string>) => void;
}

export function SavedViewsBar({ viewKey, filters, onApply }: SavedViewsBarProps) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const reload = () => fetch(`/api/saved-views?viewKey=${viewKey}`)
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('No se pudieron cargar las vistas guardadas.')))
    .then((payload) => setViews(payload.views ?? []))
    .catch((cause: Error) => setError(cause.message));

  useEffect(() => { reload(); }, [viewKey]);

  const save = async () => {
    if (!name.trim()) return;
    setError('');
    const response = await fetch('/api/saved-views', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewKey, name, filters }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload.error ?? 'No se pudo guardar la vista.'); return; }
    setName('');
    setCreating(false);
    reload();
  };

  const patch = async (view: SavedView, changes: Partial<Pick<SavedView, 'favorite' | 'filters'>>) => {
    const response = await fetch(`/api/saved-views/${view.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes),
    });
    if (!response.ok) { setError('No se pudo actualizar la vista.'); return; }
    reload();
  };

  const remove = async (view: SavedView) => {
    if (!window.confirm(`¿Eliminar la vista “${view.name}”?`)) return;
    const response = await fetch(`/api/saved-views/${view.id}`, { method: 'DELETE' });
    if (!response.ok) { setError('No se pudo eliminar la vista.'); return; }
    reload();
  };

  return <div className="saved-views-bar">
    <div className="saved-views-heading"><Bookmark size={15} /><strong>Vistas guardadas</strong></div>
    <div className="saved-view-list">
      {views.map((view) => <div className="saved-view-chip" key={view.id}>
        <button className="saved-view-name" onClick={() => onApply(view.filters)}>{view.favorite && <Star size={12} fill="currentColor" />}{view.name}</button>
        <button title="Marcar como frecuente" aria-label={`Marcar ${view.name} como frecuente`} onClick={() => patch(view, { favorite: !view.favorite })}><Star size={13} fill={view.favorite ? 'currentColor' : 'none'} /></button>
        <button title="Actualizar con los filtros actuales" aria-label={`Actualizar ${view.name}`} onClick={() => patch(view, { filters })}><RefreshCw size={13} /></button>
        <button title="Eliminar vista" aria-label={`Eliminar ${view.name}`} onClick={() => remove(view)}><Trash2 size={13} /></button>
      </div>)}
      {!views.length && !creating && <span className="saved-view-empty">Todavía no guardaste combinaciones de filtros.</span>}
    </div>
    {creating ? <div className="saved-view-create"><input autoFocus value={name} maxLength={80} placeholder="Nombre de la vista" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') save(); if (event.key === 'Escape') setCreating(false); }} /><button className="button primary compact" onClick={save}><Check size={14} /> Guardar</button><button className="button ghost compact" onClick={() => setCreating(false)}>Cancelar</button></div> : <button className="button ghost compact" onClick={() => setCreating(true)}><Bookmark size={14} /> Guardar vista actual</button>}
    {error && <small className="saved-view-error">{error}</small>}
  </div>;
}
