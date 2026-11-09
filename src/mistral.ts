import { Mistral } from '@mistralai/mistralai';

export const MISTRAL_MODEL = 'mistral-small-latest';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

let client: Mistral | null = null;

function getClient(): Mistral {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY non impostata sul server (configurala in .env)');
  }
  if (!client) {
    client = new Mistral({ apiKey });
  }
  return client;
}

export async function completeChat(messages: ChatMessage[]): Promise<string> {
  const res = await getClient().chat.complete({
    model: MISTRAL_MODEL,
    messages,
  });
  const content = res.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((chunk) => (chunk.type === 'text' ? chunk.text : ''))
      .join('');
  }
  return '';
}
