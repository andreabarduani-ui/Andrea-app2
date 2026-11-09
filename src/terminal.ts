import { listDataFiles, readData, writeData } from './dataStore.js';
import { MISTRAL_MODEL } from './mistral.js';

const HELP = [
  'Comandi disponibili:',
  '  help                      mostra questo aiuto',
  '  ls                        elenca i file dati in data/',
  '  cat <file>                mostra il contenuto di <file>.json',
  '  set <file> <json>         sovrascrive <file>.json con il JSON indicato',
  '  add <file> <json>         aggiunge un elemento all\'array in <file>.json',
  '  remove <file> <indice>    rimuove l\'elemento all\'indice dall\'array in <file>.json',
  '  model                     mostra il modello Mistral in uso',
  '  clear                     pulisce lo schermo (lato client)',
].join('\n');

function splitNameAndPayload(rest: string): { name: string; payload: string } {
  const trimmed = rest.trim();
  const sp = trimmed.search(/\s/);
  if (sp === -1) return { name: trimmed, payload: '' };
  return { name: trimmed.slice(0, sp), payload: trimmed.slice(sp + 1).trim() };
}

export function runCommand(raw: string): string {
  const input = raw.trim();
  if (!input) return '';
  const sp = input.search(/\s/);
  const cmd = (sp === -1 ? input : input.slice(0, sp)).toLowerCase();
  const rest = sp === -1 ? '' : input.slice(sp + 1);
  try {
    switch (cmd) {
      case 'help':
        return HELP;
      case 'ls':
      case 'list': {
        const files = listDataFiles();
        return files.length ? files.map((f) => `${f}.json`).join('\n') : '(nessun file in data/)';
      }
      case 'cat':
      case 'show': {
        const { name } = splitNameAndPayload(rest);
        if (!name) return 'Uso: cat <file>';
        return JSON.stringify(readData(name), null, 2);
      }
      case 'set': {
        const { name, payload } = splitNameAndPayload(rest);
        if (!name || !payload) return 'Uso: set <file> <json>';
        const value = JSON.parse(payload);
        writeData(name, value);
        return `OK: ${name}.json aggiornato`;
      }
      case 'add': {
        const { name, payload } = splitNameAndPayload(rest);
        if (!name || !payload) return 'Uso: add <file> <json>';
        const item = JSON.parse(payload);
        const current = readData(name);
        if (!Array.isArray(current)) return `Errore: ${name}.json non contiene un array`;
        current.push(item);
        writeData(name, current);
        return `OK: elemento aggiunto a ${name}.json (${current.length} elementi in totale)`;
      }
      case 'remove':
      case 'rm':
      case 'del': {
        const { name, payload } = splitNameAndPayload(rest);
        if (!name || !payload) return 'Uso: remove <file> <indice>';
        const index = Number.parseInt(payload, 10);
        if (Number.isNaN(index)) return `Indice non valido: "${payload}"`;
        const current = readData(name);
        if (!Array.isArray(current)) return `Errore: ${name}.json non contiene un array`;
        if (index < 0 || index >= current.length) {
          return `Indice fuori intervallo: ${index} (valido: 0-${current.length - 1})`;
        }
        const [removed] = current.splice(index, 1);
        writeData(name, current);
        return `OK: rimosso elemento ${index} da ${name}.json: ${JSON.stringify(removed)}`;
      }
      case 'model':
        return `Modello Mistral in uso: ${MISTRAL_MODEL}`;
      default:
        return `Comando non riconosciuto: "${cmd}". Scrivi "help" per la lista dei comandi.`;
    }
  } catch (err) {
    return `Errore: ${err instanceof Error ? err.message : String(err)}`;
  }
}
