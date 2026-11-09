import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(moduleDir, '../data');

const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/i;

function fileFor(name: string): string {
  if (!NAME_RE.test(name)) {
    throw new Error(`Nome non valido: "${name}". Usa solo lettere, numeri, "-" e "_".`);
  }
  return path.join(DATA_DIR, `${name}.json`);
}

export function listDataFiles(): string[] {
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}

export function readData(name: string): unknown {
  const file = fileFor(name);
  if (!fs.existsSync(file)) {
    const disponibili = listDataFiles().join(', ') || '(nessuno)';
    throw new Error(`File "${name}.json" non trovato. Disponibili: ${disponibili}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeData(name: string, value: unknown): void {
  const file = fileFor(name);
  if (!fs.existsSync(file)) {
    const disponibili = listDataFiles().join(', ') || '(nessuno)';
    throw new Error(`Non puoi creare nuovi file: "${name}.json" non esiste. Disponibili: ${disponibili}`);
  }
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}
