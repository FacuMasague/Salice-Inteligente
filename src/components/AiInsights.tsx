import {
  AlertTriangle,
  BadgeInfo,
  CheckCircle2,
  ChevronDown,
  Compass,
  Database,
  HelpCircle,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type {
  AiCommercialExplanation,
  AiEvidenceStatement,
  AiExecutiveBrief,
  AiFeedbackRating,
  AiFeedbackRecord,
  AiFrequentlyAskedQuestion,
  AiReportNarrative,
  AiSellerSummary,
  AiStoredArtifact,
} from '../../shared/ai';
import { formatAiDisplayText } from '../lib/ai-display';

type InsightTone = 'key' | 'positive' | 'review';

const effortLabel = { low: 'bajo', medium: 'medio', high: 'alto' } as const;
const feedbackLabels: Record<AiFeedbackRating, string> = {
  useful: 'Útil',
  not_useful: 'Poco útil',
  incorrect: 'Incorrecto',
  incomplete: 'Incompleto',
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function countEvidence(groups: AiEvidenceStatement[][]) {
  return new Set(groups.flatMap((group) => group.flatMap((item) => item.evidenceIds))).size;
}

function AiMark({ compact = false }: { compact?: boolean }) {
  return <span className={`ai-mark${compact ? ' compact' : ''}`} aria-hidden="true">
    <Sparkles size={compact ? 14 : 19} strokeWidth={2.2} />
  </span>;
}

function AiProvenance({
  artifact,
  evidenceCount,
}: {
  artifact: AiStoredArtifact<unknown>;
  evidenceCount: number;
}) {
  return <aside className="ai-provenance">
    <div className="ai-provenance-heading">
      <AiMark compact />
      <div><strong>Datos confirmados</strong><span>Indicadores calculados por Salice que respaldan esta interpretación.</span></div>
    </div>
    <dl>
      <div><dt>Respaldo</dt><dd>{evidenceCount} dato{evidenceCount === 1 ? '' : 's'} citado{evidenceCount === 1 ? '' : 's'}</dd></div>
      <div><dt>Vigencia</dt><dd>Datos del {dateLabel(artifact.snapshotAt)}</dd></div>
      <div><dt>Alcance</dt><dd>Interpreta; no modifica cifras ni decisiones</dd></div>
    </dl>
    <p><BadgeInfo size={14} /> La interpretación y las sugerencias se distinguen de los datos confirmados.</p>
  </aside>;
}

function ArtifactMeta({ artifact }: { artifact: AiStoredArtifact<unknown> }) {
  return <footer className="ai-artifact-meta">
    <span><Database size={13} /> Datos de la actualización del {dateLabel(artifact.snapshotAt)}</span>
    <span><ShieldCheck size={13} /> Resultado guardado y trazable</span>
    <span className="ai-model-meta">{artifact.model.replace('gpt-5.6-', '')} · esfuerzo {effortLabel[artifact.effort]}</span>
  </footer>;
}

function AiFeedback({ artifact }: { artifact: AiStoredArtifact<unknown> }) {
  const [latest, setLatest] = useState<AiFeedbackRecord | null>(null);
  const [selected, setSelected] = useState<AiFeedbackRating | null>(null);
  const [correction, setCorrection] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const query = new URLSearchParams({
      entityType: artifact.entityType,
      entityId: artifact.entityId,
    });
    fetch(`/api/ai/artifacts/${encodeURIComponent(artifact.artifactId)}/feedback?${query}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('No se pudo leer el feedback.')))
      .then((payload: { feedback: AiFeedbackRecord[] }) => setLatest(payload.feedback[0] ?? null))
      .catch(() => setLatest(null));
  }, [artifact.artifactId, artifact.entityId, artifact.entityType]);

  const save = async (rating: AiFeedbackRating, text = '') => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/ai/artifacts/${encodeURIComponent(artifact.artifactId)}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          correction: text,
          entityType: artifact.entityType,
          entityId: artifact.entityId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo guardar el feedback.');
      setLatest(payload.feedback);
      setSelected(null);
      setCorrection('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusy(false);
    }
  };

  const choose = (rating: AiFeedbackRating) => {
    if (rating === 'incorrect' || rating === 'incomplete') {
      setSelected(rating);
      setError('');
      return;
    }
    void save(rating);
  };

  return <section className="ai-feedback">
    <div className="ai-feedback-heading">
      <div><MessageSquareText size={15} /><span><strong>¿Esta lectura fue útil?</strong><small>Tu evaluación queda versionada; no ajusta prompts automáticamente.</small></span></div>
      {latest && <em>Último: {feedbackLabels[latest.rating]}{latest.correction ? ` · corrección v${latest.correctionVersion}` : ''}</em>}
    </div>
    <div className="ai-feedback-actions">
      <button disabled={busy} onClick={() => choose('useful')}><ThumbsUp size={13} /> Útil</button>
      <button disabled={busy} onClick={() => choose('not_useful')}><ThumbsDown size={13} /> Poco útil</button>
      <button disabled={busy} onClick={() => choose('incorrect')}>Incorrecto</button>
      <button disabled={busy} onClick={() => choose('incomplete')}>Incompleto</button>
    </div>
    {selected && <div className="ai-feedback-correction">
      <label><span>Corrección breve</span><textarea
        value={correction}
        maxLength={500}
        placeholder={selected === 'incorrect' ? 'Qué dato o interpretación es incorrecta…' : 'Qué información importante falta…'}
        onChange={(event) => setCorrection(event.target.value)}
      /></label>
      <div><small>{correction.length}/500</small><button disabled={busy || correction.trim().length < 5} onClick={() => void save(selected, correction)}>Guardar corrección</button></div>
    </div>}
    {error && <p className="ai-feedback-error">{error}</p>}
  </section>;
}

function EvidenceIds({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return <span className="ai-evidence-ids" title={ids.join(' · ')}>
    <span aria-hidden="true" />
    {ids.length} dato{ids.length === 1 ? '' : 's'} de respaldo
  </span>;
}

function InsightGroup({
  index,
  title,
  tone,
  items,
  empty = 'Sin aspectos adicionales identificados.',
}: {
  index: string;
  title: string;
  tone: InsightTone;
  items: AiEvidenceStatement[];
  empty?: string;
}) {
  const Icon = tone === 'positive' ? CheckCircle2 : tone === 'review' ? AlertTriangle : Compass;
  return <section className={`ai-insight-group ${tone}`}>
    <header>
      <span>{index}</span>
      <div><Icon size={15} /><h3>{title}</h3></div>
    </header>
    <div className="ai-insight-list">
      {items.length
        ? items.map((item, itemIndex) => <article key={`${item.text}-${itemIndex}`}>
          <p>{formatAiDisplayText(item.text)}</p>
          <EvidenceIds ids={item.evidenceIds} />
        </article>)
        : <p className="ai-empty-copy">{empty}</p>}
    </div>
  </section>;
}

function Limitations({ values }: { values: string[] }) {
  return <aside className="ai-limitations">
    <div><ShieldCheck size={15} /><strong>Alcance de esta lectura</strong></div>
    <div>{values.map((item) => <span key={item}>{formatAiDisplayText(item)}</span>)}</div>
  </aside>;
}

function AiFaqs({ values }: { values: AiFrequentlyAskedQuestion[] }) {
  if (!values.length) return null;
  return <section className="ai-faqs">
    <header>
      <span><HelpCircle size={15} /> Preguntas para profundizar</span>
      <span>{values.length} respuesta{values.length === 1 ? '' : 's'} preparada{values.length === 1 ? '' : 's'}</span>
    </header>
    <div>{values.map((item) => <article key={item.question}>
      <strong>{formatAiDisplayText(item.question)}</strong>
      <p>{formatAiDisplayText(item.answer)}</p>
      <EvidenceIds ids={item.evidenceIds} />
    </article>)}</div>
  </section>;
}

function AiSummary({
  eyebrow,
  title,
  description,
  evidenceCount,
  staticView = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  evidenceCount: number;
  staticView?: boolean;
}) {
  const content = <>
    <AiMark />
    <div className="ai-insight-intro">
      <span className="ai-eyebrow">Asistencia con IA · Beta <em>{eyebrow}</em></span>
      <h2>{formatAiDisplayText(title)}</h2>
      <p>{formatAiDisplayText(description)}</p>
      <div className="ai-trust-line">
        <span><Database size={13} /> {evidenceCount} datos citados</span>
        <span><ShieldCheck size={13} /> Sólo lectura</span>
      </div>
    </div>
    {!staticView && <span className="ai-disclosure-label">
      <span className="when-closed">Ver análisis</span>
      <span className="when-open">Ocultar análisis</span>
      <ChevronDown size={15} />
    </span>}
  </>;
  return staticView
    ? <header className="ai-insight-summary static">{content}</header>
    : <summary className="ai-insight-summary">{content}</summary>;
}

function AiInsightShell({
  artifact,
  eyebrow,
  title,
  description,
  evidenceCount,
  className = '',
  expanded = false,
  children,
}: {
  artifact: AiStoredArtifact<unknown>;
  eyebrow: string;
  title: string;
  description: string;
  evidenceCount: number;
  className?: string;
  expanded?: boolean;
  children: ReactNode;
}) {
  const body = <div className="ai-insight-body">
    <AiProvenance artifact={artifact} evidenceCount={evidenceCount} />
    {children}
    <AiFeedback artifact={artifact} />
    <ArtifactMeta artifact={artifact} />
  </div>;

  if (expanded) {
    return <section className={`data-card ai-insight-card is-static ${className}`}>
      <AiSummary eyebrow={eyebrow} title={title} description={description} evidenceCount={evidenceCount} staticView />
      {body}
    </section>;
  }
  return <details className={`data-card ai-insight-card ${className}`}>
    <AiSummary eyebrow={eyebrow} title={title} description={description} evidenceCount={evidenceCount} />
    {body}
  </details>;
}

export function AiNarrativeCard({
  artifact,
}: {
  artifact?: AiStoredArtifact<AiReportNarrative> | null;
}) {
  if (!artifact) return <aside className="ai-unavailable-notice"><AiMark compact /><div><strong>Asistencia con IA no publicada</strong><span>Esta lectura no está disponible o no superó los controles de calidad. El reporte y sus cifras continúan completos.</span></div><ShieldCheck size={16} /></aside>;
  const value = artifact.output;
  const evidenceCount = countEvidence([value.findings, value.drivers, value.reviewItems]);
  return <AiInsightShell
    artifact={artifact}
    eyebrow="Interpretación"
    title={value.title}
    description={value.currentState}
    evidenceCount={evidenceCount}
  >
    <div className="ai-insight-columns">
      <InsightGroup index="01" title="Hallazgos clave" tone="key" items={value.findings} />
      <InsightGroup index="02" title="Qué lo explica" tone="positive" items={value.drivers} />
      <InsightGroup index="03" title="Para mirar de cerca" tone="review" items={value.reviewItems} />
    </div>
    <Limitations values={value.limitations} />
    <AiFaqs values={value.faqs} />
  </AiInsightShell>;
}

export function AiExecutiveBriefCard({
  artifact,
  expanded = false,
}: {
  artifact?: AiStoredArtifact<AiExecutiveBrief> | null;
  expanded?: boolean;
}) {
  if (!artifact) return null;
  const value = artifact.output;
  const evidenceCount = countEvidence([value.keyIssues, value.favorableIndicators, value.reviewItems]);
  return <AiInsightShell
    artifact={artifact}
    eyebrow="Interpretación general"
    title="Una lectura rápida del negocio"
    description={value.currentState}
    evidenceCount={evidenceCount}
    className="ai-executive-card"
    expanded={expanded}
  >
    <div className="ai-insight-columns">
      <InsightGroup index="01" title="Lo prioritario" tone="key" items={value.keyIssues} />
      <InsightGroup index="02" title="Señales a favor" tone="positive" items={value.favorableIndicators} />
      <InsightGroup index="03" title="Para mirar de cerca" tone="review" items={value.reviewItems} />
    </div>
    <Limitations values={value.limitations} />
    <AiFaqs values={value.faqs} />
  </AiInsightShell>;
}

export function AiCommercialExplanationCard({
  artifact,
}: {
  artifact?: AiStoredArtifact<AiCommercialExplanation> | null;
}) {
  if (!artifact) return null;
  const value = artifact.output;
  return <details className="commercial-ai-explanation">
    <summary>
      <AiMark />
      <div className="commercial-ai-title">
        <span className="ai-eyebrow">Asistencia con IA · Beta <em>Lectura del caso</em></span>
        <h3>{formatAiDisplayText(value.primaryReason)}</h3>
        <p>{formatAiDisplayText(value.explanation)}</p>
      </div>
      <span className="ai-disclosure-label">
        <span className="when-closed">Ver detalle</span>
        <span className="when-open">Ocultar detalle</span>
        <ChevronDown size={15} />
      </span>
    </summary>
    <div className="commercial-ai-body">
      <article className="commercial-ai-reading">
        <span><Compass size={15} /> Por qué merece atención</span>
        <p>{formatAiDisplayText(value.explanation)}</p>
      </article>
      {!!value.secondaryReasons.length && <div className="commercial-ai-signals">
        <span>También influye</span>
        <div>{value.secondaryReasons.map((item) => <span key={item}>{formatAiDisplayText(item).replace(/\.$/, '')}</span>)}</div>
      </div>}
      {value.commercialOpportunity && <article className="commercial-ai-opportunity">
        <CheckCircle2 size={16} />
        <div><strong>Oportunidad para revisar</strong><p>{formatAiDisplayText(value.commercialOpportunity)}</p></div>
      </article>}
      {value.caution && <aside className="commercial-ai-caution"><AlertTriangle size={15} /><span><strong>Antes de avanzar</strong>{formatAiDisplayText(value.caution)}</span></aside>}
      <AiFeedback artifact={artifact} />
    </div>
  </details>;
}

export function AiSellerSummaryCard({
  artifact,
}: {
  artifact?: AiStoredArtifact<AiSellerSummary> | null;
}) {
  if (!artifact) return null;
  const value = artifact.output;
  const evidenceCount = countEvidence([value.portfolioSignals, value.reviewItems]);
  return <AiInsightShell
    artifact={artifact}
    eyebrow="Interpretación de cartera"
    title="Lectura de la cartera"
    description={value.summary}
    evidenceCount={evidenceCount}
    className="ai-seller-summary"
  >
    <div className="ai-insight-columns two">
      <InsightGroup index="01" title="Señales que explican la cartera" tone="positive" items={value.portfolioSignals} />
      <InsightGroup index="02" title="Para mirar de cerca" tone="review" items={value.reviewItems} />
    </div>
    <Limitations values={value.limitations} />
  </AiInsightShell>;
}
