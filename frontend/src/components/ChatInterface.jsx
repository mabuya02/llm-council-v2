import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Stage3 from './Stage3';
import './ChatInterface.css';

export default function ChatInterface({
  conversation,
  onSendMessage,
  onNewConversation,
  isLoading,
  runtimeConfig,
}) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const applyQuickPrompt = (prompt) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  const modelSummary = runtimeConfig?.council_models?.length
    ? runtimeConfig.council_models.join(', ')
    : 'No models configured';
  const modelCount = runtimeConfig?.council_models?.length || 0;
  const hasModels = modelCount > 0;
  const modeLabel = runtimeConfig?.ollama_mode || 'local';
  const showCloudWarning = modeLabel === 'cloud' && !runtimeConfig?.cloud_configured;

  const quickPrompts = [
    'Give me the best answer and show disagreements between models.',
    'Compare options with pros, cons, and a recommendation.',
    'Explain this simply first, then give an advanced breakdown.',
  ];

  const renderComposer = ({ centered = false } = {}) => (
    <form className={`input-form ${centered ? 'input-form-centered' : ''}`} onSubmit={handleSubmit}>
      <div className="grok-composer">
        <textarea
          ref={inputRef}
          className="message-input"
          placeholder={centered ? 'What do you want to know?' : 'Ask anything'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          rows={1}
        />

        <button
          type="submit"
          className="send-button grok-send"
          disabled={!input.trim() || isLoading}
          aria-label="Send"
        >
          <span className="icon-send"></span>
        </button>
      </div>
    </form>
  );

  if (!conversation) {
    return (
      <div className="chat-interface chat-interface-hero">
        <div className="messages-container">
          <div className="grok-hero no-conversation-hero">
            <div className="council-figurines">
              <div className="figurine" style={{ animationDelay: '0s' }}>
                <div className="figurine-head">
                  <div className="face-eyes"><span></span><span></span></div>
                </div>
                <div className="figurine-neck"></div>
                <div className="figurine-torso">
                  <div className="arm arm-left"></div>
                  <div className="arm arm-right"></div>
                </div>
                <div className="figurine-platform"></div>
              </div>
            </div>
            <h2>LLM Council</h2>
            <p>Create a conversation to start.</p>
            <button className="empty-state-cta" onClick={onNewConversation}>
              New Conversation
            </button>
          </div>
        </div>
      </div>
    );
  }

  const showHero = conversation.messages.length === 0;

  return (
    <div className={`chat-interface ${showHero ? 'chat-interface-hero' : ''}`}>
      <div className="messages-container">
        {!showHero && (
          <div className="runtime-banner">
            <span className={`mode-pill mode-${modeLabel}`}>Ollama {modeLabel}</span>
            <span className="runtime-count">{modelCount} model{modelCount === 1 ? '' : 's'}</span>
            <span className="runtime-models">{modelSummary}</span>
            {showCloudWarning && (
              <span className="runtime-warning">Missing OLLAMA_CLOUD_API_KEY</span>
            )}
          </div>
        )}

        {showHero ? (
          <div className="grok-hero">
            <div className="council-figurines">
              {(() => {
                const council = (runtimeConfig?.council_models || []).filter(
                  m => m !== runtimeConfig?.chairman_model
                );
                const chairman = runtimeConfig?.chairman_model;
                // Insert chairman at center
                const mid = Math.floor(council.length / 2);
                const allModels = chairman
                  ? [...council.slice(0, mid), chairman, ...council.slice(mid)]
                  : council;
                return allModels.map((model, i) => {
                const isChairman = model === chairman;
                return (
                  <div
                    key={model}
                    className={`figurine ${isChairman ? 'figurine-chairman' : ''}`}
                    style={{ animationDelay: `${i * 0.15}s` }}
                    title={model}
                  >
                    {isChairman && <span className="crown">♛</span>}
                    <div className="figurine-head">
                      <div className="face-eyes"><span></span><span></span></div>
                    </div>
                    <div className="figurine-neck"></div>
                    <div className="figurine-torso">
                      <div className="arm arm-left"></div>
                      <div className="arm arm-right"></div>
                    </div>
                    <div className="figurine-platform"></div>
                    <span className="figurine-label">{model.split(':')[0]}</span>
                  </div>
                );
                });
              })()}
            </div>
            <h2>LLM Council</h2>
            <p>How can the council assist you today?</p>

            {renderComposer({ centered: true })}

            {hasModels ? (
              <div className="hero-chip-row">
                {quickPrompts.map((prompt, index) => (
                  <button
                    key={index}
                    type="button"
                    className="hero-chip"
                    onClick={() => applyQuickPrompt(prompt)}
                    disabled={isLoading}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state-warning">
                No models configured. Set `COUNCIL_MODELS` in `.env` and restart.
              </div>
            )}
          </div>
        ) : (
          conversation.messages.map((msg, index) => (
            <div key={index} className="message-group">
              {msg.role === 'user' ? (
                <div className="user-message">
                  <div className="message-label">You</div>
                  <div className="message-content">
                    <div className="markdown-content">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="assistant-message">
                  <div className="message-label">LLM Council</div>

                  {(msg.loading?.stage1 || msg.loading?.stage2) && (
                    <div className="stage-loading">
                      <div className="spinner"></div>
                      <span>
                        {msg.loading?.stage1
                          ? 'Stage 1: Collecting individual responses...'
                          : 'Stage 2: Peer rankings...'}
                      </span>
                    </div>
                  )}

                  {msg.loading?.stage3 && (
                    <div className="stage-loading">
                      <div className="spinner"></div>
                      <span>Stage 3: Synthesizing final answer...</span>
                    </div>
                  )}
                  {msg.stage3 && <Stage3 finalResponse={msg.stage3} />}
                </div>
              )}
            </div>
          ))
        )}

        {isLoading && (
          <div className="loading-indicator">
            <div className="spinner"></div>
            <span>Consulting the council...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {!showHero && renderComposer()}
    </div>
  );
}
