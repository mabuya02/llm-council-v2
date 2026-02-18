import { useState } from 'react';
import Stage1 from './Stage1';
import Stage2 from './Stage2';
import './StagePanel.css';

export default function StagePanel({ conversation, isOpen, onToggle }) {
  const [activeStage, setActiveStage] = useState(null);

  if (!isOpen) {
    return (
      <div className="stage-panel collapsed">
        <button className="panel-toggle" onClick={onToggle} aria-label="Expand stage panel">
          <span className="toggle-icon">‹</span>
        </button>
      </div>
    );
  }

  const hasConversation = conversation && conversation.messages.length > 0;
  const assistantMessages = hasConversation
    ? conversation.messages.filter(m => m.role === 'assistant')
    : [];
  const latestAssistant = assistantMessages[assistantMessages.length - 1];

  if (!hasConversation || !latestAssistant) {
    return (
      <div className="stage-panel">
        <button className="panel-toggle" onClick={onToggle} aria-label="Collapse stage panel">
          <span className="toggle-icon open">›</span>
        </button>
        <div className="stage-panel-empty">
          <div className="stage-panel-empty-icon">{hasConversation ? '💬' : '⚡'}</div>
          <p>{hasConversation ? 'Send a message to see the council deliberate.' : 'Stage details will appear here once you start a conversation.'}</p>
        </div>
      </div>
    );
  }

  const stages = [
    {
      id: 'stage1',
      label: 'Individual Responses',
      shortLabel: 'Stage 1',
      loading: latestAssistant.loading?.stage1,
      done: !!latestAssistant.stage1,
      content: latestAssistant.stage1 ? (
        <Stage1 responses={latestAssistant.stage1} />
      ) : null,
    },
    {
      id: 'stage2',
      label: 'Peer Rankings',
      shortLabel: 'Stage 2',
      loading: latestAssistant.loading?.stage2,
      done: !!latestAssistant.stage2,
      content: latestAssistant.stage2 ? (
        <Stage2
          rankings={latestAssistant.stage2}
          labelToModel={latestAssistant.metadata?.label_to_model}
          aggregateRankings={latestAssistant.metadata?.aggregate_rankings}
        />
      ) : null,
    },
    {
      id: 'stage3',
      label: 'Final Synthesis',
      shortLabel: 'Stage 3',
      loading: latestAssistant.loading?.stage3,
      done: !!latestAssistant.stage3,
      content: null, // Stage 3 shown in main chat
    },
  ];

  const toggleStage = (id) => {
    setActiveStage(prev => prev === id ? null : id);
  };

  return (
    <div className="stage-panel">
      <button className="panel-toggle" onClick={onToggle} aria-label="Collapse stage panel">
        <span className="toggle-icon open">›</span>
      </button>

      <div className="stage-panel-header">
        <h3>Council Stages</h3>
      </div>

      {/* Progress tracker */}
      <div className="stage-progress">
        {stages.map((stage, i) => (
          <div key={stage.id} className="stage-progress-item">
            <div className={`stage-dot ${stage.done ? 'done' : ''} ${stage.loading ? 'loading' : ''}`}>
              {stage.loading ? (
                <span className="dot-spinner"></span>
              ) : stage.done ? (
                <span className="dot-check">✓</span>
              ) : (
                <span className="dot-num">{i + 1}</span>
              )}
            </div>
            <span className={`stage-progress-label ${stage.done ? 'done' : ''} ${stage.loading ? 'active' : ''}`}>
              {stage.shortLabel}
            </span>
            {i < stages.length - 1 && (
              <div className={`stage-connector ${stages[i + 1].done || stages[i + 1].loading ? 'active' : ''}`} />
            )}
          </div>
        ))}
      </div>

      {/* Stage accordions */}
      <div className="stage-accordions">
        {stages.filter(s => s.id !== 'stage3').map((stage) => (
          <div key={stage.id} className={`stage-accordion ${activeStage === stage.id ? 'open' : ''}`}>
            <button
              className="stage-accordion-trigger"
              onClick={() => toggleStage(stage.id)}
              disabled={!stage.done}
            >
              <span className="accordion-label">{stage.label}</span>
              {stage.loading && <span className="accordion-status loading">Running...</span>}
              {stage.done && <span className="accordion-status done">Complete</span>}
              {!stage.done && !stage.loading && <span className="accordion-status pending">Pending</span>}
              <span className={`accordion-chevron ${activeStage === stage.id ? 'open' : ''}`}>›</span>
            </button>
            {activeStage === stage.id && stage.content && (
              <div className="stage-accordion-content">
                {stage.content}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
