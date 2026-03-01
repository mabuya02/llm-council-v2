import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './Stage1.css';

export default function Stage1({ responses, streaming }) {
  const [activeTab, setActiveTab] = useState(0);

  const safeActiveTab =
    responses && responses.length > 0 ? Math.min(activeTab, responses.length - 1) : 0;

  if (!responses || responses.length === 0) {
    return null;
  }

  const current = responses[safeActiveTab];
  const isCurrentStreaming = current?.streaming;

  return (
    <div className="stage stage1">
      <h3 className="stage-title">Stage 1: Individual Responses</h3>

      <div className="tabs">
        {responses.map((resp, index) => (
          <button
            key={index}
            className={`tab ${safeActiveTab === index ? 'active' : ''} ${resp.streaming ? 'streaming' : ''}`}
            onClick={() => setActiveTab(index)}
          >
            {resp.model.split('/')[1] || resp.model}
            {resp.streaming && <span className="tab-streaming-dot" />}
          </button>
        ))}
      </div>

      <div className="tab-content">
        <div className="model-name">{current.model}</div>
        <div className="response-text markdown-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.response}</ReactMarkdown>
          {isCurrentStreaming && <span className="streaming-cursor">▊</span>}
        </div>
      </div>
    </div>
  );
}
