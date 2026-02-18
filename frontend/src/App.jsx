import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import StagePanel from './components/StagePanel';
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

  const loadConversations = useCallback(async () => {
    try {
      const convs = await api.listConversations();
      setConversations(convs);
      setCurrentConversationId((prevId) => prevId || convs[0]?.id || null);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  }, []);

  const loadConversation = useCallback(async (id) => {
    try {
      const conv = await api.getConversation(id);
      setCurrentConversation(conv);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  }, []);

  const loadRuntimeConfig = useCallback(async () => {
    try {
      const config = await api.getRuntimeConfig();
      setRuntimeConfig(config);
    } catch (error) {
      console.error('Failed to load runtime config:', error);
    }
  }, []);

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
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [currentConversationId, loadConversation]);

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
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const handleSelectConversation = (id) => {
    setCurrentConversationId(id);
  };

  const handleSendMessage = async (content) => {
    if (!currentConversationId) return;

    const targetConversationId = currentConversationId;
    setIsLoading(true);
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
            // Reload conversations to get updated title
            loadConversations();
            break;

          case 'complete':
            // Stream complete, reload conversations list
            loadConversations();
            loadConversation(targetConversationId);
            setIsLoading(false);
            break;

          case 'error':
            console.error('Stream error:', event.message);
            setIsLoading(false);
            break;

          default:
            console.log('Unknown event type:', eventType);
        }
      });
    } catch (error) {
      console.error('Failed to send message:', error);
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
        runtimeConfig={runtimeConfig}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(prev => !prev)}
      />
      <ChatInterface
        conversation={currentConversation}
        onSendMessage={handleSendMessage}
        onNewConversation={handleNewConversation}
        isLoading={isLoading}
        runtimeConfig={runtimeConfig}
      />
      <StagePanel
        conversation={currentConversation}
        isOpen={stagePanelOpen}
        onToggle={() => setStagePanelOpen(prev => !prev)}
      />
    </div>
  );
}

export default App;
