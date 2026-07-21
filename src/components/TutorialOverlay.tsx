import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
export type TutorialView = "map" | "agenda" | "clients" | "sellers" | "finance" | "products" | "brands" | "routes" | "sales-explorer" | "receivables" | "goals" | "reports" | "spt" | "commercial-sales" | "mars" | "nutripet" | "baires" | "non-buyers" | "pending-balances" | "settings";
export interface TutorialStep {
    view: TutorialView;
    target: string;
    eyebrow: string;
    title: string;
    description: string;
    tip: string;
}
export const TUTORIAL_STEPS: TutorialStep[] = [
    { view: "settings", target: "settings-tutorial", eyebrow: "Welcome", title: "Meet SMART Salice", description: "This guided tour changes sections and highlights the controls that connect commercial, financial, product, and route workflows.", tip: "Use Next or the arrow keys. The tour never modifies data." },
    { view: "map", target: "map-kpis", eyebrow: "Operational Map", title: "See the active portfolio at a glance", description: "The map keeps collection risk C separate from commercial opportunity O and combined visit priority P.", tip: "Every displayed company and amount is synthetic." },
    { view: "map", target: "map-filters", eyebrow: "Operational Map", title: "Focus the territory", description: "Filter by activity, portfolio status, zone, and risk. Nearby points cluster to keep the map readable.", tip: "Zoom in to separate customer groups." },
    { view: "map", target: "client-panel", eyebrow: "Customer Profile", title: "Move from a point to the complete history", description: "A customer profile combines recommendations, purchases, open documents, notes, and next actions.", tip: "Inactive customers retain history but do not enter routes or recommendations." },
    { view: "agenda", target: "agenda-workstation", eyebrow: "Commercial Activities", title: "Turn evidence into action", description: "Plan and record visits, calls, offers, and follow-ups while keeping human activity separate from analytical facts.", tip: "An action counts only when a person records it." },
    { view: "clients", target: "clients-directory", eyebrow: "Customers", title: "Compare signals without mixing them", description: "Review status, C, O, P, and 90-day change with persistent review marks for movements of at least 30%.", tip: "Unreviewed changes appear first." },
    { view: "sellers", target: "sellers-overview", eyebrow: "Sales Team", title: "Understand each portfolio", description: "See assigned customers, sales, debt, risk, opportunities, territory, and next priorities by seller.", tip: "Seller names open the same profile from operational tables." },
    { view: "finance", target: "finance-summary", eyebrow: "Portfolio", title: "Prioritize collections", description: "Aging filters separate time until due from time overdue, and every invoice opens its document-level detail.", tip: "Combine aging bands for the day's collection task." },
    { view: "sales-explorer", target: "sales-explorer-overview", eyebrow: "Administration", title: "Drill every sale down to its document", description: "Date, seller, customer, product, brand, category, channel, and zone recalculate the same report universe.", tip: "Save frequent filter combinations and export the result." },
    { view: "receivables", target: "receivables-overview", eyebrow: "Accounts Receivable", title: "Use the portfolio as a work queue", description: "Balances and due dates stay separate from owners, statuses, promises, next follow-ups, and append-only comments.", tip: "The workflow history is auditable." },
    { view: "goals", target: "goals-overview", eyebrow: "Goals", title: "Version the plan before changing it", description: "Edit cloned drafts and activate them explicitly; prior versions remain archived.", tip: "Actuals and targets never share a source table." },
    { view: "reports", target: "reports-overview", eyebrow: "Commercial Plan", title: "Track actuals against targets", description: "Month, seller, category, and brand recalculate results, plan, attainment, trend, and breakdowns.", tip: "Linear projection is a pace reference, not a forecast." },
    { view: "spt", target: "spt-overview", eyebrow: "Sales Performance", title: "Compare equivalent periods", description: "Compare the selected month against the same number of days in the previous month and prior year.", tip: "A 91% ratio means a decline of roughly 9%." },
    { view: "commercial-sales", target: "commercial-sales-overview", eyebrow: "Commercial Sales", title: "Read the complete business mix", description: "Net sales, comparisons, categories, trends, brands, products, and signed credits all come from the same local analytical database.", tip: "Monthly and annual modes use the same explicit universe." },
    { view: "mars", target: "mars-overview", eyebrow: "Orbit Nutrition", title: "Follow a supplier calendar", description: "Thirteen supplier periods compare volume, coverage, brands, and quarters without confusing them with calendar months.", tip: "Switch between customer branches and unique accounts." },
    { view: "nutripet", target: "nutripet-overview", eyebrow: "Nova Pet", title: "Review monthly supplier coverage", description: "Volume, customers, YTD, quarters, brands, and products share one isolated fictional product group.", tip: "The trend always keeps thirteen months visible." },
    { view: "baires", target: "baires-overview", eyebrow: "Harbor Portfolio", title: "Compare specialty and retail segments", description: "Volume, customers, YTD, quarters, brands, and subcategories remain reconciled to the selected total.", tip: "Segment filters do not change the baseline issuer universe." },
    { view: "non-buyers", target: "non-buyers-overview", eyebrow: "Dormant Accounts", title: "Find recovery opportunities", description: "Compare 180-day activity with the absence of positive net sales in the latest 30 days.", tip: "The detail can show the full universe or only dormant cases." },
    { view: "pending-balances", target: "pending-balances-overview", eyebrow: "Pending Balances", title: "Connect debt, due dates, and recent sales", description: "Separate pending and overdue balances, inspect exact ages and payment terms, and compare exposure with 30-day sales.", tip: "No 30-day sales is shown explicitly instead of Infinity." },
    { view: "brands", target: "brands-directory", eyebrow: "Brands", title: "Open complete brand performance", description: "Review 90-day sales and units, products, stock, turnover, families, and last sale.", tip: "Brand names stay navigable across reports." },
    { view: "products", target: "product-catalog", eyebrow: "Products", title: "Compare catalog, stock, and similarity", description: "Open any item for classification, demand, coverage, vector evidence, and nearby alternatives.", tip: "Comparator v2.1 exposes its confidence." },
    { view: "products", target: "vector-explorer", eyebrow: "Products", title: "Explore all 33 dimensions", description: "Dimensions cover species, life stage, size, positioning, product type, needs, and flavor.", tip: "Every non-zero signal retains evidence." },
    { view: "routes", target: "route-picker", eyebrow: "Routes", title: "Build a feasible workday", description: "Choose seller, visit duration, and maximum workday. The estimator groups nearby stops and flags infeasible plans.", tip: "Distance remains an estimate; traffic still requires human validation." },
    { view: "settings", target: "portfolio-rules", eyebrow: "Rules", title: "Understand the customer universe", description: "Activity and portfolio review remain distinct signals so uncertain cases stay visible.", tip: "Conservative rules prevent silent exclusion." },
    { view: "settings", target: "settings-tutorial", eyebrow: "Complete", title: "You are ready to demonstrate SMART Salice", description: "The guide remains available here alongside metric definitions, data quality, and local persistence details.", tip: "The entire demo is local, synthetic, auditable, and explainable." },
];
interface FocusRect {
    top: number;
    left: number;
    width: number;
    height: number;
}
export function TutorialOverlay({ stepIndex, onBack, onNext, onClose }: {
    stepIndex: number;
    onBack: () => void;
    onNext: () => void;
    onClose: () => void;
}) {
    const step = TUTORIAL_STEPS[stepIndex];
    const [focus, setFocus] = useState<FocusRect | null>(null);
    useEffect(() => {
        const update = () => {
            const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
            if (!target)
                return setFocus(null);
            const rect = target.getBoundingClientRect();
            setFocus({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
        };
        const observer = new MutationObserver(update);
        observer.observe(document.body, { childList: true, subtree: true });
        const frame = requestAnimationFrame(update);
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, true);
        };
    }, [step.target]);
    useEffect(() => {
        const keydown = (event: KeyboardEvent) => {
            if (event.key === "Escape")
                onClose();
            if (event.key === "ArrowRight")
                onNext();
            if (event.key === "ArrowLeft" && stepIndex > 0)
                onBack();
        };
        window.addEventListener("keydown", keydown);
        return () => window.removeEventListener("keydown", keydown);
    }, [onBack, onClose, onNext, stepIndex]);
    const popoverWidth = Math.min(370, window.innerWidth - 32);
    const popoverLeft = focus
        ? Math.max(16, Math.min(window.innerWidth - popoverWidth - 16, focus.left + focus.width / 2 - popoverWidth / 2))
        : Math.max(16, (window.innerWidth - popoverWidth) / 2);
    const popoverTop = focus
        ? focus.top + focus.height + 246 < window.innerHeight
            ? focus.top + focus.height + 14
            : Math.max(16, focus.top - 232)
        : Math.max(20, window.innerHeight / 2 - 120);
    const finalStep = stepIndex === TUTORIAL_STEPS.length - 1;
    return (<div className="tutorial-layer" aria-live="polite">
      <div className={`tutorial-blocker ${focus ? "" : "dimmed"}`}/>
      {focus && <div className="tutorial-focus" style={{ top: focus.top - 6, left: focus.left - 6, width: focus.width + 12, height: focus.height + 12 }}/>}
      <section className="tutorial-popover" role="dialog" aria-modal="true" aria-label={`Tutorial: ${step.title}`} style={{ top: popoverTop, left: popoverLeft, width: popoverWidth }}>
        <button className="tutorial-close" onClick={onClose} aria-label="Close tutorial"><X size={17}/></button>
        <div className="tutorial-progress"><span>{step.eyebrow}</span><strong>{stepIndex + 1} / {TUTORIAL_STEPS.length}</strong></div>
        <h2>{step.title}</h2>
        <p>{step.description}</p>
        <div className="tutorial-tip"><Check size={14}/><span>{step.tip}</span></div>
        <div className="tutorial-dots">{TUTORIAL_STEPS.map((_, index) => <i key={index} className={index === stepIndex ? "active" : index < stepIndex ? "done" : ""}/>)}</div>
        <div className="tutorial-actions">
          <button className="button secondary" disabled={stepIndex === 0} onClick={onBack}><ArrowLeft size={15}/> Back</button>
          <button className="button primary" onClick={onNext}>{finalStep ? "Finish" : "Next"} {finalStep ? <Check size={15}/> : <ArrowRight size={15}/>}</button>
        </div>
      </section>
    </div>);
}
