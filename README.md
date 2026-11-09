# 🇧🇪 Belgio App

App web minima per gestire il tuo **trasferimento in Belgio**, con dati aggiornabili e una **chat AI** basata sull'[SDK ufficiale Mistral per TypeScript](https://docs.mistral.ai/) (`@mistralai/mistralai`, modello `mistral-small-latest`).

## Pagine

- **Home** — panoramica con conteggi e prossime scadenze
- **Documenti** — lista dei documenti necessari con stato (da fare / in corso / pronto)
- **Checklist** — attività da fare, spuntabili
- **Scadenze** — date importanti con giorni mancanti
- **Note** — annotazioni libere
- **Chat AI** — assistente per il trasferimento in Belgio (via API Mistral)
- **Terminale** — per modificare i dati direttamente da riga di comando

Tutti i dati vivono in `data/*.json` e sono modificabili sia dall'interfaccia (sezione "Modifica i dati (JSON)") sia dal **Terminale** (`help`, `ls`, `cat <file>`, `set <file> <json>`, `add <file> <json>`, `remove <file> <indice>`, `model`).

## Requisiti

- Node.js 18+ (consigliato 20+)
- Una chiave API Mistral, creabile su <https://console.mistral.ai> → *API keys*

## Installazione ed esecuzione locale

```bash
# 1. Installa le dipendenze
npm install

# 2. Configura la chiave API (resta SOLO sul server, mai nel browser)
cp .env.example .env
#    poi apri .env e incolla la tua chiave: MISTRAL_API_KEY=...

# 3. Avvia in sviluppo (hot reload su http://localhost:3000)
npm run dev
```

In produzione:

```bash
npm run build
npm start
# oppure scegli la porta: PORT=8080 npm start
```

Poi apri <http://localhost:3000>.

## Sicurezza

- `MISTRAL_API_KEY` è letta solo dal server (`process.env`) in `src/mistral.ts`: il frontend chiama solo `POST /api/chat` e non vede mai la chiave.
- `.env` è escluso dal versionamento (`.gitignore`).
- Il server ascolta di default solo su `127.0.0.1` (variabile `HOST` per cambiare).
- Il terminale web non esegue comandi di sistema arbitrari: opera solo sui file JSON esistenti in `data/`.

## API

| Metodo | Endpoint | Descrizione |
| --- | --- | --- |
| GET | `/api/health` | Stato del server, modello in uso, chiave configurata |
| POST | `/api/chat` | Body `{ "messages": [{ "role", "content" }] }` → `{ reply, model }` |
| GET | `/api/data` | Elenco dei file dati disponibili |
| GET | `/api/data/:nome` | Legge `data/<nome>.json` |
| PUT | `/api/data/:nome` | Sovrascrive `data/<nome>.json` (body JSON) |
| POST | `/api/terminal` | Body `{ "command": "..." }` → `{ output }` (comandi limitati) |

## Struttura del progetto

```
├── src/
│   ├── server.ts      # Express: static + API (chat, data, terminal)
│   ├── mistral.ts     # Client SDK ufficiale Mistral (mistral-small-latest)
│   ├── dataStore.ts   # Lettura/scrittura sicura dei file in data/
│   └── terminal.ts    # Interprete comandi restrittivo (solo file in data/)
├── public/            # Frontend statico (home, menu, chat, terminale)
├── data/              # I tuoi dati aggiornabili (documenti, checklist, …)
├── .env.example       # Template per MISTRAL_API_KEY
└── README.md
```
