import { useState, useEffect, useCallback } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import StagePanel from './components/StagePanel';
import { useToast } from './components/Toast';
import { api } from './api';
import './App.css';

function App() {
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [runtimeConfig, setRuntimeConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stagePanelOpen, setStagePanelOpen] = useState(true);
  // Index of the assistant message whose stages to show (null = latest)
  const [inspectedMessageIndex, setInspectedMessageIndex] = useState(null);

  const { addToast } = useToast();

  const loadConversations = useCallback(async () => {
    try {
      const convs = await api.listConversations();
      setConversations(convs);
      setCurrentConversationId((prevId) => prevId || convs[0]?.id || null);
    } catch (error) {
      addToast('Failed to load conversations. Is the backend running?', 'error');
    }
  }, [addToast]);

  const loadConversation = useCallback(async (id) => {
    try {
      const conv = await api.getConversation(id);
      setCurrentConversation(conv);
    } catch (error) {
      addToast('Failed to load conversation.', 'error');
    }
  }, [addToast]);

  const loadRuntimeConfig = useCallback(async () => {
    try {
      const config = await api.getRuntimeConfig();
      setRuntimeConfig(config);
    } catch (error) {
      addToast('Cannot reach backend. Check that the server is running.', 'warning');
    }
  }, [addToast]);

  // Load conversations on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadConversations();
      void loadRuntimeConfig();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadConversations, loadRuntimeConfig]);

  // Load conversation details when selected
  useEffect(() => {
    if (currentConversationId) {
      const timer = setTimeout(() => {
        void loadConversation(currentConversationId);
        setInspectedMessageIndex(null);
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [currentConversationId, loadConversation]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key === 'n') {
        e.preventDefault();
        handleNewConversation();
      }
      if (isMod && e.key === 'b') {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
      }
      if (isMod && e.key === '.') {
        e.preventDefault();
        setStagePanelOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleNewConversation = async () => {
    try {
      const newConv = await api.createConversation();
      setConversations((prev) => [
        {
          id: newConv.id,
          created_at: newConv.created_at,
          title: newConv.title || 'New Conversation',
          message_count: 0,
        },
        ...prev,
      ]);
      setCurrentConversationId(newConv.id);
      setCurrentConversation(newConv);
      setInspectedMessageIndex(null);
    } catch (error) {
      addToast('Failed to create conversation.', 'error');
    }
  };

  const handleDeleteConversation = async (id) => {
    try {
      await api.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentConversationId === id) {
        setCurrentConversationId(null);
        setCurrentConversation(null);
        setInspectedMessageIndex(null);
      }
      addToast('Conversation deleted.', 'success', 3000);
    } catch (error) {
      addToast('Failed to delete conversation.', 'error');
    }
  };

  const handleSelectConversation = (id) => {
    setCurrentConversationId(id);
  };

  const handleInspectMessage = (msgIndex) => {
    setInspectedMessageIndex((prev) => (prev === msgIndex ? null : msgIndex));
    if (!stagePanelOpen) setStagePanelOpen(true);
  };

  const handleSendMessage = async (content) => {
    if (!currentConversationId) return;

    const targetConversationId = currentConversationId;
    setIsLoading(true);
    setInspectedMessageIndex(null);
    try {
      // Create a partial assistant message that will be updated progressively.
      const assistantMessage = {
        role: 'assistant',
        stage1: null,
        stage2: null,
        stage3: null,
        metadata: null,
        loading: {
          stage1: false,
          stage2: false,
          stage3: false,
        },
      };

      // Optimistically add user + assistant placeholder messages.
      setCurrentConversation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: [...prev.messages, { role: 'user', content }, assistantMessage],
        };
      });

      const updateLatestAssistantMessage = (updater) => {
        setCurrentConversation((prev) => {
          if (!prev || prev.messages.length === 0) return prev;
          const messages = [...prev.messages];
          const lastIndex = messages.length - 1;
          const lastMessage = messages[lastIndex];
          if (lastMessage.role !== 'assistant') return prev;

          const clonedMessage = {
            ...lastMessage,
            loading: lastMessage.loading ? { ...lastMessage.loading } : undefined,
          };
          messages[lastIndex] = updater(clonedMessage);
          return { ...prev, messages };
        });
      };

      // Send message with streaming
      await api.sendMessageStream(targetConversationId, content, (eventType, event) => {
        switch (eventType) {
          case 'stage1_start':
            updateLatestAssistantMessage((message) => {
              message.loading.stage1 = true;
              return message;
            });
            break;

          case 'stage1_complete':
            updateLatestAssistantMessage((message) => {
              message.stage1 = event.data;
              message.loading.stage1 = false;
              return message;
            });
            break;

          case 'stage2_start':
            updateLatestAssistantMessage((message) => {
              message.loading.stage2 = true;
              return message;
            });
            break;

          case 'stage2_complete':
            updateLatestAssistantMessage((message) => {
              message.stage2 = event.data;
              message.metadata = event.metadata;
              message.loading.stage2 = false;
              return message;
            });
            break;

          case 'stage3_start':
            updateLatestAssistantMessage((message) => {
              message.loading.stage3 = true;
              return message;
            });
            break;

          case 'stage3_token':
            updateLatestAssistantMessage((message) => {
              if (!message.stage3) {
                message.stage3 = { model: event.model || '', response: event.token };
              } else {
                message.stage3 = { ...message.stage3, response: message.stage3.response + event.token };
              }
              return message;
            });
            break;

          case 'stage3_complete':
            updateLatestAssistantMessage((message) => {
              message.stage3 = event.data;
              message.loading.stage3 = false;
              return message;
            });
            break;

          case 'title_complete':
            loadConversations();
            break;

          case 'complete':
            loadConversations();
            loadConversation(targetConversationId);
            setIsLoading(false);
            break;

          case 'error':
            addToast(`Council error: ${event.message}`, 'error');
            setIsLoading(false);
            break;

          default:
            console.log('Unknown event type:', eventType);
        }
      });
    } catch (error) {
      addToast(`Failed to send message: ${error.message}`, 'error');
      // Remove optimistic messages on error
      setCurrentConversation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.slice(0, -2),
        };
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        runtimeConfig={runtimeConfig}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(prev => !prev)}
      />
      <ChatInterface
        conversation={currentConversation}
        onSendMessage={handleSendMessage}
        onNewConversation={handleNewConversation}
        onInspectMessage={handleInspectMessage}
        inspectedMessageIndex={inspectedMessageIndex}
        isLoading={isLoading}
        runtimeConfig={runtimeConfig}
      />
      <StagePanel
        conversation={currentConversation}
        inspectedMessageIndex={inspectedMessageIndex}
        isOpen={stagePanelOpen}
        onToggle={() => setStagePanelOpen(prev => !prev)}
      />
      <SpeedInsights />
    </div>
  );
}

export default App;
