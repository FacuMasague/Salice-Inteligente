import { BarChart3, BookOpen, CheckCircle2, ClipboardCheck, Map, PlayCircle } from 'lucide-react';
import { TUTORIALS, type TutorialSection } from '../components/TutorialOverlay';

const tutorialCards: { id: TutorialSection; icon: typeof Map }[] = [
  { id: 'operations', icon: Map },
  { id: 'administration', icon: ClipboardCheck },
  { id: 'reports', icon: BarChart3 },
];

export function HelpView({ tutorialCompleted, onStartTutorial }: {
  tutorialCompleted: Record<TutorialSection, boolean>;
  onStartTutorial: (section: TutorialSection) => void;
}) {
  return <div className="page-view help-view">
    <section className="data-card settings-tutorial-card" data-tour="settings-tutorial">
      <div className="settings-tutorial-copy">
        <div className="settings-icon"><BookOpen size={28} /></div>
        <div><span className="section-kicker">Ayuda</span><h2>Elegí qué parte del programa querés aprender</h2><p>Cada recorrido explica una tarea concreta, cambia de pantalla automáticamente y no modifica ningún dato.</p></div>
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
  </div>;
}
