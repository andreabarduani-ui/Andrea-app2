import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { completeChat, MISTRAL_MODEL, type ChatMessage } from './mistral.js';
import { listDataFiles, readData, writeData } from './dataStore.js';
import { runCommand } from './terminal.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(moduleDir, '../public');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC_DIR));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    model: MISTRAL_MODEL,
    apiKeyConfigured: Boolean(process.env.MISTRAL_API_KEY),
  });
});

const ROLES = new Set(['system', 'user', 'assistant']);

function parseMessages(body: unknown): ChatMessage[] | null {
  const messages = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) return null;
  for (const m of messages) {
    if (typeof m !== 'object' || m === null) return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (typeof role !== 'string' || !ROLES.has(role)) return null;
    if (typeof content !== 'string' || content.length === 0 || content.length > 8000) return null;
  }
  return messages as ChatMessage[];
}

app.post('/api/chat', async (req, res) => {
  const messages = parseMessages(req.body);
  if (!messages) {
    return res.status(400).json({ error: 'Body non valido: serve { "messages": [{ "role", "content" }] }' });
  }
  if (!process.env.MISTRAL_API_KEY) {
    return res.status(500).json({
      error: 'MISTRAL_API_KEY non configurata sul server. Aggiungila in .env e riavvia il server.',
    });
  }
  try {
    const reply = await completeChat(messages);
    res.json({ reply, model: MISTRAL_MODEL });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Chiamata all'API Mistral fallita", detail });
  }
});

app.get('/api/data', (_req, res) => {
  res.json({ files: listDataFiles() });
});

app.get('/api/data/:name', (req, res) => {
  try {
    res.json(readData(req.params.name));
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.put('/api/data/:name', (req, res) => {
  try {
    writeData(req.params.name, req.body);
    res.json({ ok: true, file: `${req.params.name}.json` });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/terminal', (req, res) => {
  const command = (req.body as { command?: unknown } | null)?.command;
  if (typeof command !== 'string' || command.length === 0 || command.length > 2000) {
    return res.status(400).json({ error: 'Body non valido: serve { "command": "..." }' });
  }
  res.json({ output: runCommand(command) });
});

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`Belgio App in ascolto su http://localhost:${PORT}`);
  console.log(`Modello Mistral: ${MISTRAL_MODEL} — MISTRAL_API_KEY configurata: ${Boolean(process.env.MISTRAL_API_KEY)}`);
});
