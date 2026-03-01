import { useState } from 'react';
import './Sidebar.css';

export default function Sidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  runtimeConfig,
  isOpen,
  onToggle,
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const modeLabel = runtimeConfig?.ollama_mode || 'local';
  const endpointLabel = runtimeConfig?.endpoint || 'Waiting for backend...';

  const formatCreatedAt = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  const handleDeleteClick = (e, convId) => {
    e.stopPropagation();
    if (confirmDeleteId === convId) {
      onDeleteConversation(convId);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(convId);
      // Auto-clear confirmation after 3 seconds
      setTimeout(() => setConfirmDeleteId((prev) => (prev === convId ? null : prev)), 3000);
    }
  };

  return (
    <div className={`sidebar ${isOpen ? 'open' : ''}`}>
      <button className="sidebar-toggle" onClick={onToggle} aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
        <span className={`toggle-icon ${isOpen ? 'open' : ''}`}>›</span>
      </button>

      <div className="sidebar-header">
        <div className="sidebar-title-row">
          <h1>LLM Council</h1>
          <span className={`sidebar-mode sidebar-mode-${modeLabel}`}>
            {modeLabel}
          </span>
        </div>
        <p className="sidebar-subtitle">{endpointLabel}</p>
        <button className="new-conversation-btn" onClick={onNewConversation}>
          + New Conversation
        </button>
      </div>

      <div className="conversation-list">
        {conversations.length === 0 ? (
          <div className="no-conversations">No conversations yet</div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={`conversation-item ${
                conv.id === currentConversationId ? 'active' : ''
              }`}
              onClick={() => onSelectConversation(conv.id)}
            >
              <div className="conversation-title">
                {(conv.title || 'New Conversation').replace(/\*{1,3}/g, '').replace(/_{1,3}/g, '').replace(/`/g, '').replace(/^#+\s*/, '')}
              </div>
              <div className="conversation-meta">
                {conv.message_count} messages · {formatCreatedAt(conv.created_at)}
              </div>
              {isOpen && (
                <button
                  className={`conversation-delete-btn ${confirmDeleteId === conv.id ? 'confirm' : ''}`}
                  onClick={(e) => handleDeleteClick(e, conv.id)}
                  title={confirmDeleteId === conv.id ? 'Click again to confirm' : 'Delete conversation'}
                >
                  {confirmDeleteId === conv.id ? '✓' : '×'}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
