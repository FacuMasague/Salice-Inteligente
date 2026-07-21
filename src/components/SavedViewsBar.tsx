import { Bookmark, Check, RefreshCw, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { SavedView } from "../../shared/models";
interface SavedViewsBarProps {
    viewKey: SavedView["viewKey"];
    filters: Record<string, string>;
    onApply: (filters: Record<string, string>) => void;
}
export function SavedViewsBar({ viewKey, filters, onApply }: SavedViewsBarProps) {
    const [views, setViews] = useState<SavedView[]>([]);
    const [name, setName] = useState("");
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");
    const reload = () => fetch(`/api/saved-views?viewKey=${viewKey}`)
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("Saved views could not be loaded.")))
        .then((payload) => setViews(payload.views ?? []))
        .catch((cause: Error) => setError(cause.message));
    useEffect(() => { reload(); }, [viewKey]);
    const save = async () => {
        if (!name.trim())
            return;
        setError("");
        const response = await fetch("/api/saved-views", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ viewKey, name, filters }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            setError(payload.error ?? "The view could not be saved.");
            return;
        }
        setName("");
        setCreating(false);
        reload();
    };
    const patch = async (view: SavedView, changes: Partial<Pick<SavedView, "favorite" | "filters">>) => {
        const response = await fetch(`/api/saved-views/${view.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes),
        });
        if (!response.ok) {
            setError("The view could not be updated.");
            return;
        }
        reload();
    };
    const remove = async (view: SavedView) => {
        if (!window.confirm(`Delete the \u201C${view.name}\u201D view?`))
            return;
        const response = await fetch(`/api/saved-views/${view.id}`, { method: "DELETE" });
        if (!response.ok) {
            setError("The view could not be deleted.");
            return;
        }
        reload();
    };
    return <div className="saved-views-bar">
    <div className="saved-views-heading"><Bookmark size={15}/><strong>Saved views</strong></div>
    <div className="saved-view-list">
      {views.map((view) => <div className="saved-view-chip" key={view.id}>
        <button className="saved-view-name" onClick={() => onApply(view.filters)}>{view.favorite && <Star size={12} fill="currentColor"/>}{view.name}</button>
        <button title="Mark as favorite" aria-label={`Mark ${view.name} as favorite`} onClick={() => patch(view, { favorite: !view.favorite })}><Star size={13} fill={view.favorite ? "currentColor" : "none"}/></button>
        <button title="Update with current filters" aria-label={`Update ${view.name}`} onClick={() => patch(view, { filters })}><RefreshCw size={13}/></button>
        <button title="Delete view" aria-label={`Delete ${view.name}`} onClick={() => remove(view)}><Trash2 size={13}/></button>
      </div>)}
      {!views.length && !creating && <span className="saved-view-empty">No saved filter combinations yet.</span>}
    </div>
    {creating ? <div className="saved-view-create"><input autoFocus value={name} maxLength={80} placeholder="View name" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter")
                    save();
                if (event.key === "Escape")
                    setCreating(false);
            }}/><button className="button primary compact" onClick={save}><Check size={14}/> Save</button><button className="button ghost compact" onClick={() => setCreating(false)}>Cancel</button></div> : <button className="button ghost compact" onClick={() => setCreating(true)}><Bookmark size={14}/> Save current view</button>}
    {error && <small className="saved-view-error">{error}</small>}
  </div>;
}
