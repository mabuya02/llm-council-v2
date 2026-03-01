/**
 * API client for the LLM Council backend.
 */

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8001';

const MAX_SSE_RETRIES = 2;
const SSE_RETRY_DELAY = 1500;

/**
 * Get or create a persistent session ID for this browser.
 * Stored in localStorage so it survives page reloads.
 */
function getSessionId() {
  const KEY = 'llm_council_session_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

/** Common headers sent with every request. */
function baseHeaders(extra = {}) {
  return {
    'X-Session-ID': getSessionId(),
    ...extra,
  };
}

export const api = {
  /**
   * List all conversations.
   */
  async listConversations() {
    const response = await fetch(`${API_BASE}/api/conversations`, {
      headers: baseHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to list conversations');
    }
    return response.json();
  },

  /**
   * Create a new conversation.
   */
  async createConversation() {
    const response = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: baseHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      throw new Error('Failed to create conversation');
    }
    return response.json();
  },

  /**
   * Get a specific conversation.
   */
  async getConversation(conversationId) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}`,
      { headers: baseHeaders() }
    );
    if (!response.ok) {
      throw new Error('Failed to get conversation');
    }
    return response.json();
  },

  /**
   * Delete a conversation.
   */
  async deleteConversation(conversationId) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}`,
      { method: 'DELETE', headers: baseHeaders() }
    );
    if (!response.ok) {
      throw new Error('Failed to delete conversation');
    }
    return response.json();
  },

  /**
   * Get runtime backend configuration.
   */
  async getRuntimeConfig() {
    const response = await fetch(`${API_BASE}/api/runtime-config`, {
      headers: baseHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to load runtime config');
    }
    return response.json();
  },

  /**
   * Send a message in a conversation.
   */
  async sendMessage(conversationId, content) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/message`,
      {
        method: 'POST',
        headers: baseHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ content }),
      }
    );
    if (!response.ok) {
      throw new Error('Failed to send message');
    }
    return response.json();
  },

  /**
   * Send a message and receive streaming updates with reconnection support.
   * @param {string} conversationId - The conversation ID
   * @param {string} content - The message content
   * @param {function} onEvent - Callback function for each event: (eventType, data) => void
   * @returns {Promise<void>}
   */
  async sendMessageStream(conversationId, content, onEvent) {
    let lastAttemptError = null;

    for (let attempt = 0; attempt <= MAX_SSE_RETRIES; attempt++) {
      try {
        const response = await fetch(
          `${API_BASE}/api/conversations/${conversationId}/message/stream`,
          {
            method: 'POST',
            headers: baseHeaders({
              'Content-Type': 'application/json',
            }),
            body: JSON.stringify({ content }),
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: Failed to send message`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let completed = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            const trailingDataLine = buffer
              .split('\n')
              .find((line) => line.startsWith('data: '));
            if (trailingDataLine) {
              try {
                const event = JSON.parse(trailingDataLine.slice(6));
                if (event.type === 'complete') completed = true;
                onEvent(event.type, event);
              } catch (e) {
                console.error('Failed to parse trailing SSE event:', e);
              }
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const rawEvent of events) {
            const dataLine = rawEvent
              .split('\n')
              .find((line) => line.startsWith('data: '));
            if (!dataLine) continue;

            const data = dataLine.slice(6);
            try {
              const event = JSON.parse(data);
              if (event.type === 'complete') completed = true;
              onEvent(event.type, event);
            } catch (e) {
              console.error('Failed to parse SSE event:', e);
            }
          }
        }

        // If stream completed normally, we're done
        if (completed) return;

        // Stream ended without 'complete' event – may have dropped
        throw new Error('Stream ended unexpectedly without completion');

      } catch (err) {
        lastAttemptError = err;
        console.warn(`SSE attempt ${attempt + 1} failed:`, err.message);

        if (attempt < MAX_SSE_RETRIES) {
          await new Promise((r) => setTimeout(r, SSE_RETRY_DELAY * (attempt + 1)));
        }
      }
    }

    // All retries exhausted
    throw lastAttemptError || new Error('Failed to stream message');
  },
};
