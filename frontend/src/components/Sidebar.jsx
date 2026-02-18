import './Sidebar.css';

export default function Sidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  runtimeConfig,
  isOpen,
  onToggle,
}) {
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
                {conv.title || 'New Conversation'}
              </div>
              <div className="conversation-meta">
                {conv.message_count} messages · {formatCreatedAt(conv.created_at)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
