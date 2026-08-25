import { BarChart3, BookOpen, CheckCircle2, ClipboardCheck, Map, PlayCircle, ReceiptText, Search, Target, WalletCards } from 'lucide-react';
import { TASK_JOURNEYS, TUTORIALS, type TaskJourneyId, type TutorialSection } from '../components/TutorialOverlay';

const tutorialCards: { id: TutorialSection; icon: typeof Map }[] = [
  { id: 'operations', icon: Map },
  { id: 'administration', icon: ClipboardCheck },
  { id: 'reports', icon: BarChart3 },
];

const journeyCards: { id: TaskJourneyId; icon: typeof Map }[] = [
  { id: 'review-client', icon: Search },
  { id: 'manage-collection', icon: WalletCards },
  { id: 'find-document', icon: ReceiptText },
  { id: 'review-month', icon: Target },
];

export function HelpView({ tutorialCompleted, onStartTutorial, onStartJourney }: {
  tutorialCompleted: Record<TutorialSection, boolean>;
  onStartTutorial: (section: TutorialSection) => void;
  onStartJourney: (journey: TaskJourneyId) => void;
}) {
  return <div className="page-view help-view">
    <section className="data-card settings-tutorial-card" data-tour="settings-tutorial">
      <div className="settings-tutorial-copy">
        <div className="settings-icon"><BookOpen size={28} /></div>
        <div><span className="section-kicker">Ayuda</span><h2>Elegí qué parte del programa querés aprender</h2><p>Los tutoriales explican áreas completas, cambian de pantalla automáticamente y no modifican ningún dato.</p></div>
      </div>
      <div className="tutorial-selector-grid">
        {tutorialCards.map(({ id, icon: Icon }) => {
          const definition = TUTORIALS[id];
          const completed = tutorialCompleted[id];
          return <article key={id}>
            <div className="tutorial-selector-icon"><Icon size={21} /></div>
            <div><span>{definition.label}</span><strong>{definition.title}</strong><p>{definition.description}</p><small>{definition.steps.length} pasos · recorrido independiente</small></div>
            {completed && <em><CheckCircle2 size={14} /> Completado</em>}
            <button className={`button ${completed ? 'secondary' : 'primary'}`} aria-label={`${completed ? 'Repetir' : 'Comenzar'} tutorial: ${definition.label}`} onClick={() => onStartTutorial(id)}><PlayCircle size={16} /> {completed ? 'Repetir' : 'Comenzar'}</button>
          </article>;
        })}
      </div>
    </section>
    <section className="data-card help-journeys-card">
      <div className="data-card-header"><div><span className="section-kicker"><PlayCircle size={14} /> Recorridos prácticos</span><h2>Aprendé una tarea concreta, paso a paso</h2><p>Cada guía separa la tarea en momentos claros, explica qué conviene verificar y te lleva por las pantallas necesarias sin apurarte.</p></div></div>
      <div className="help-journey-grid">{journeyCards.map(({ id, icon: Icon }) => { const journey = TASK_JOURNEYS[id]; return <article key={id}><span><Icon size={20} /></span><div><strong>{journey.title}</strong><p>{journey.description}</p><small>{journey.steps.length} {journey.steps.length === 1 ? 'paso' : 'pasos'}</small></div><button className="button secondary" onClick={() => onStartJourney(id)}><PlayCircle size={15} /> Comenzar</button></article>; })}</div>
    </section>
  </div>;
}
