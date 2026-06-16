import type { ChatEvent, ChatPromptConfig } from '@/features/chat/types';

// In production (Vercel) the API is same-origin at /api/v1.
// In local dev, Vite proxies /api to the FastAPI server (see vite.config.ts).
// Override with VITE_API_BASE_URL if the backend lives elsewhere.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

/**
 * Streaming chat API client
 * Yields ChatEvent objects as they arrive from the server
 */
export async function* streamChat(message: string, config?: ChatPromptConfig): AsyncGenerator<ChatEvent> {
  const body: any = { message };
  
  if (config) {
    if (config.systemInstruction) {
      body.system_instruction = config.systemInstruction;
    }
    if (config.examples && config.examples.length > 0) {
      body.few_shot_examples = config.examples.map(ex => ({
        input: ex.input,
        output: ex.output
      }));
    }
  }

  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine) {
          try {
            const event: ChatEvent = JSON.parse(trimmedLine);
            yield event;
          } catch (e) {
            console.warn('Failed to parse event:', trimmedLine);
          }
        }
      }
    }
    
    // Process any remaining data in buffer
    if (buffer.trim()) {
      try {
        const event: ChatEvent = JSON.parse(buffer.trim());
        yield event;
      } catch (e) {
        console.warn('Failed to parse final event:', buffer);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
