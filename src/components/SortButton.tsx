import { ArrowDown, ArrowUp } from "lucide-react";
import type { SortDirection } from "../lib/sorting";
export function SortButton({ label, direction, onClick }: {
    label: string;
    direction: SortDirection | null;
    onClick: () => void;
}) {
    const stateLabel = direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "original order";
    const nextLabel = direction === "asc" ? "descending" : direction === "desc" ? "original order" : "ascending";
    return <button type="button" className={`sort-button ${direction ? "active" : ""}`} onClick={onClick} aria-label={`${label}: ${stateLabel}. Sort ${nextLabel}`}>
    <span>{label}</span>
    {direction === "asc" ? <ArrowUp size={12} aria-hidden="true"/> : direction === "desc" ? <ArrowDown size={12} aria-hidden="true"/> : <i className="sort-button-placeholder" aria-hidden="true"/>}
  </button>;
}
