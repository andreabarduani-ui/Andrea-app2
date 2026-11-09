const app = document.getElementById('app');

const SYSTEM_PROMPT = [
  'Sei un assistente esperto di trasferimenti in Belgio (visto, alloggio, registrazione al comune,',
  'mutuelle, NISS, conto bancario, patente, utenze, scuola). Rispondi in italiano, in modo pratico',
  'e conciso, usando elenchi puntati quando utile.',
].join(' ');

let chatHistory = [];

async function api(path, options = {}) {
  const res = await fetch(path, options);
  let body = {};
  try { body = await res.json(); } catch { /* risposta non JSON */ }
  if (!res.ok) throw new Error(body.error || `Errore HTTP ${res.status}`);
  return body;
}

// SERVER_MODE = true quando gira il server Node locale (npm run dev):
// in quel caso i dati passano dalle API e chat/terminale sono attivi.
// Su GitHub Pages (statico) SERVER_MODE resta false: i dati si leggono da
// data/*.json e le modifiche si salvano in localStorage (poi esportabili in JSON).
let SERVER_MODE = false;
const LS_PREFIX = 'belgioapp:';

async function detectServer() {
  try {
    const res = await fetch('/api/health');
    SERVER_MODE = res.ok;
  } catch {
    SERVER_MODE = false;
  }
}

async function fetchStatic(name) {
  const res = await fetch(`data/${name}.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Errore HTTP ${res.status} caricando data/${name}.json`);
  return res.json();
}

async function getData(name) {
  if (SERVER_MODE) return api(`/api/data/${name}`);
  const base = await fetchStatic(name);
  try {
    const saved = JSON.parse(localStorage.getItem(LS_PREFIX + name) || 'null');
    if (Array.isArray(saved)) return saved;
  } catch { /* dati locali non validi: uso il file del repo */ }
  return base;
}

async function putData(name, value) {
  if (SERVER_MODE) {
    return api(`/api/data/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
  }
  localStorage.setItem(LS_PREFIX + name, JSON.stringify(value));
  return { local: true };
}

const postChat = (messages) => api('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages }),
});
const postTerminal = (command) => api('/api/terminal', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ command }),
});

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function dataPage(name, title, renderItems) {
  const refresh = () => dataPage(name, title, renderItems);
  app.innerHTML = `
    <h2>${esc(title)}</h2>
    <div id="page-content"><p class="muted">Caricamento…</p></div>
    <details class="editor">
      <summary>Modifica i dati (JSON)</summary>
      <textarea id="json-editor" spellcheck="false"></textarea>
      <div class="row">
        <button id="save-json" type="button">Salva modifiche</button>
        <button id="copy-json" type="button">Copia JSON</button>
        <span id="save-status" class="muted"></span>
      </div>
    </details>`;
  const content = document.getElementById('page-content');
  const editor = document.getElementById('json-editor');
  const status = document.getElementById('save-status');
  getData(name)
    .then((data) => {
      editor.value = JSON.stringify(data, null, 2);
      renderItems(content, data, refresh);
    })
    .catch((err) => {
      content.innerHTML = `<p class="error">${esc(err.message)}</p>`;
    });
  document.getElementById('save-json').addEventListener('click', async () => {
    status.textContent = 'Salvataggio…';
    try {
      const parsed = JSON.parse(editor.value);
      const res = await putData(name, parsed);
      status.textContent = res && res.local
        ? `Salvato nel browser ✔ — copia il JSON e incollalo in data/${name}.json su GitHub per renderlo permanente`
        : 'Salvato ✔';
      refresh();
    } catch (err) {
      status.textContent = `Errore: ${err.message}`;
    }
  });
  document.getElementById('copy-json').addEventListener('click', async () => {
    editor.select();
    try {
      await navigator.clipboard.writeText(editor.value);
      status.textContent = 'JSON copiato negli appunti ✔';
    } catch {
      status.textContent = 'JSON selezionato: copia con Ctrl+C';
    }
  });
}

function renderDocumenti(content, docs) {
  const pronti = docs.filter((d) => d.stato === 'pronto').length;
  const rows = docs.map((d) => `<tr>
    <td>${esc(d.nome)}</td>
    <td>${esc(d.descrizione)}</td>
    <td><span class="badge badge-${esc(d.stato)}">${esc(d.stato)}</span></td>
    <td>${esc(d.scadenza || '—')}</td>
    <td>${esc(d.note || '')}</td>
  </tr>`).join('');
  content.innerHTML = `
    <p class="muted">${pronti}/${docs.length} documenti pronti</p>
    <table>
      <thead><tr><th>Documento</th><th>Descrizione</th><th>Stato</th><th>Scadenza</th><th>Note</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderChecklist(content, items, refresh) {
  const fatti = items.filter((i) => i.fatto).length;
  content.innerHTML = `
    <p class="muted">${fatti}/${items.length} completati</p>
    <ul class="checklist">
      ${items.map((it, idx) => `<li>
        <label>
          <input type="checkbox" data-idx="${idx}" ${it.fatto ? 'checked' : ''}>
          <span class="${it.fatto ? 'done' : ''}">${esc(it.testo)}</span>
        </label>
      </li>`).join('')}
    </ul>`;
  content.querySelectorAll('input[type=checkbox]').forEach((cb) => {
    cb.addEventListener('change', async () => {
      items[Number(cb.dataset.idx)].fatto = cb.checked;
      try {
        await putData('checklist', items);
        refresh();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function renderScadenze(content, items) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sorted = [...items].sort((a, b) => String(a.data).localeCompare(String(b.data)));
  if (!sorted.length) {
    content.innerHTML = '<p class="muted">Nessuna scadenza.</p>';
    return;
  }
  const rows = sorted.map((s) => {
    const d = new Date(`${s.data}T00:00:00`);
    const days = Math.round((d - today) / 86400000);
    const badge = days < 0
      ? `<span class="badge badge-scaduto">scaduta da ${-days} gg</span>`
      : days === 0
        ? '<span class="badge badge-oggi">oggi</span>'
        : `<span class="badge badge-ok">tra ${days} gg</span>`;
    return `<tr>
      <td>${esc(s.data)}</td>
      <td>${esc(s.titolo)}</td>
      <td>${badge}</td>
      <td>${esc(s.descrizione || '')}</td>
    </tr>`;
  }).join('');
  content.innerHTML = `
    <table>
      <thead><tr><th>Data</th><th>Scadenza</th><th></th><th>Descrizione</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderNote(content, notes) {
  content.innerHTML = notes.length
    ? `<ul class="notes">${notes.map((n) =>
        `<li><span class="muted">${esc(n.data || '')}</span> — ${esc(n.testo ?? n)}</li>`).join('')}</ul>`
    : '<p class="muted">Nessuna nota.</p>';
}

const STATI_CANDIDATURA = ['da candidarsi', 'inviata', 'colloquio', 'in attesa', 'accettata', 'rifiutata'];

function badgeGiorni(dataStr) {
  if (!dataStr) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${dataStr}T00:00:00`);
  const days = Math.round((d - today) / 86400000);
  if (days < 0) return `<span class="badge badge-scaduto">scaduta da ${-days} gg</span>`;
  if (days === 0) return '<span class="badge badge-oggi">oggi</span>';
  return `<span class="badge badge-ok">tra ${days} gg</span>`;
}

function renderCandidature(content, items, refresh) {
  const sorted = [...items].sort((a, b) =>
    String(a.scadenza || '9999-99-99').localeCompare(String(b.scadenza || '9999-99-99')));
  const rows = sorted.map((c) => {
    const idx = items.indexOf(c);
    const opzioni = STATI_CANDIDATURA.map((s) =>
      `<option value="${esc(s)}" ${c.stato === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
    const docLinks = [
      c.cv ? `<a href="${esc(c.cv)}">CV (.docx)</a>` : '',
      c.lettera ? `<a href="${esc(c.lettera)}">Cover letter (.docx)</a>` : '',
    ].filter(Boolean).join(' · ');
    return `<tr>
      <td><strong>${esc(c.organizzazione)}</strong><br><span class="muted">${esc(c.ruolo || '')}</span></td>
      <td>${c.linkAnnuncio ? `<a href="${esc(c.linkAnnuncio)}" target="_blank" rel="noopener noreferrer">annuncio ↗</a>` : '—'}</td>
      <td>${esc(c.scadenza || '—')}<br>${badgeGiorni(c.scadenza)}</td>
      <td><select class="stato-select" data-idx="${idx}">${opzioni}</select></td>
      <td>${docLinks || '—'}</td>
      <td>${esc(c.oggettoEmail || '')}</td>
      <td>${esc(c.note || '')}</td>
    </tr>`;
  }).join('');
  content.innerHTML = `
    <p class="muted">${items.length} candidature tracciate</p>
    <table>
      <thead><tr><th>Candidatura</th><th>Annuncio</th><th>Scadenza</th><th>Stato</th><th>Documenti</th><th>Oggetto email</th><th>Note</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="muted">Nessuna candidatura: aggiungine una qui sotto.</td></tr>'}</tbody>
    </table>
    <details class="editor">
      <summary>Aggiungi candidatura</summary>
      <div class="row" style="flex-wrap: wrap;">
        <input id="new-org" placeholder="Organizzazione *">
        <input id="new-ruolo" placeholder="Ruolo *">
        <input id="new-link" placeholder="Link annuncio" style="flex: 2;">
        <input id="new-scadenza" type="date" title="Scadenza">
        <input id="new-cv" placeholder="Percorso CV (es. cv-applications-brussels-2026/CV_x.docx)" style="flex: 2;">
        <input id="new-lettera" placeholder="Percorso cover letter" style="flex: 2;">
        <input id="new-oggetto" placeholder="Oggetto email">
        <input id="new-note" placeholder="Note" style="flex: 2;">
        <button id="add-cand" type="button">Aggiungi</button>
      </div>
    </details>`;
  content.querySelectorAll('.stato-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      items[Number(sel.dataset.idx)].stato = sel.value;
      try {
        await putData('candidature', items);
        refresh();
      } catch (err) {
        alert(err.message);
      }
    });
  });
  document.getElementById('add-cand').addEventListener('click', async () => {
    const g = (id) => document.getElementById(id).value.trim();
    if (!g('new-org') || !g('new-ruolo')) {
      alert('Organizzazione e ruolo sono obbligatori.');
      return;
    }
    items.push({
      id: Date.now(),
      organizzazione: g('new-org'),
      ruolo: g('new-ruolo'),
      linkAnnuncio: g('new-link'),
      scadenza: g('new-scadenza'),
      stato: 'da candidarsi',
      cv: g('new-cv'),
      lettera: g('new-lettera'),
      oggettoEmail: g('new-oggetto'),
      note: g('new-note'),
    });
    try {
      await putData('candidature', items);
      refresh();
    } catch (err) {
      alert(err.message);
    }
  });
}

async function renderHome() {
  app.innerHTML = '<h2>Home</h2><p class="muted">Caricamento…</p>';
  try {
    const [docs, check, scad, cand] = await Promise.all([
      getData('documenti'),
      getData('checklist'),
      getData('scadenze'),
      getData('candidature'),
    ]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const pronti = docs.filter((d) => d.stato === 'pronto').length;
    const fatti = check.filter((c) => c.fatto).length;
    const prossime = [...scad]
      .filter((s) => new Date(`${s.data}T00:00:00`) >= today)
      .sort((a, b) => String(a.data).localeCompare(String(b.data)))
      .slice(0, 3);
    const candOrdinate = [...cand]
      .filter((c) => c.scadenza && new Date(`${c.scadenza}T00:00:00`) >= today)
      .sort((a, b) => String(a.scadenza).localeCompare(String(b.scadenza)));
    const prossimaCand = candOrdinate[0];
    const giaInviate = cand.filter((c) => c.stato && c.stato !== 'da candidarsi').length;
    app.innerHTML = `
      <h2>🇧🇪 Benvenuto in Belgio App</h2>
      <p>La tua app per gestire il trasferimento in Belgio e le candidature a Bruxelles:
         documenti, checklist, scadenze e note${SERVER_MODE ? ', chat con l\'IA e terminale dati' : ''}.</p>
      <div class="cards">
        <a class="card" href="#/candidature"><strong>${cand.length}</strong><span>candidature tracciate (${giaInviate} non più da candidarsi)</span></a>
        <a class="card" href="#/candidature"><strong>${prossimaCand ? esc(prossimaCand.scadenza) : '—'}</strong><span>prossima scadenza candidatura${prossimaCand ? ` — ${esc(prossimaCand.ruolo)}` : ''}</span></a>
        <a class="card" href="#/documenti"><strong>${pronti}/${docs.length}</strong><span>documenti pronti</span></a>
        <a class="card" href="#/checklist"><strong>${fatti}/${check.length}</strong><span>checklist completati</span></a>
        <a class="card" href="#/scadenze"><strong>${prossime.length}</strong><span>prossime scadenze</span></a>
      </div>
      ${!SERVER_MODE
        ? '<p class="muted">Versione statica su GitHub Pages: i dati si leggono da <code>data/*.json</code> e le modifiche si salvano nel browser (localStorage) — usa <strong>Copia JSON</strong> per aggiornare i file su GitHub. Chat AI e terminale sono attivi solo in locale con <code>npm run dev</code>.</p>'
        : ''}
      <h3>Prossime scadenze</h3>
      ${prossime.length
        ? '<ul>' + prossime.map((s) => `<li><strong>${esc(s.data)}</strong> — ${esc(s.titolo)}</li>`).join('') + '</ul>'
        : '<p class="muted">Nessuna scadenza imminente.</p>'}
    `;
  } catch (err) {
    app.innerHTML = `<p class="error">${esc(err.message)}</p>`;
  }
}

function addBubble(role, text) {
  const log = document.getElementById('chat-log');
  const div = document.createElement('div');
  div.className = `bubble ${role}`;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

function renderChat() {
  if (!SERVER_MODE) {
    app.innerHTML = `<h2>Chat AI</h2>
      <p class="error">La chat AI è disponibile solo con il server locale (<code>npm run dev</code>):
      su GitHub Pages è disattivata perché la chiave API non deve mai finire nel browser.</p>`;
    return;
  }
  app.innerHTML = `
    <div class="chat-head">
      <h2>Chat AI</h2>
      <button id="new-chat" type="button">Nuova chat</button>
    </div>
    <div id="chat-log" class="chat-log"></div>
    <form id="chat-form" class="chat-form">
      <input id="chat-input" autocomplete="off" placeholder="Scrivi un messaggio…" required>
      <button type="submit">Invia</button>
    </form>`;
  const log = document.getElementById('chat-log');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  document.getElementById('new-chat').addEventListener('click', () => {
    chatHistory = [];
    log.innerHTML = '';
    addBubble('assistant', 'Nuova chat iniziata. Come posso aiutarti per il trasferimento in Belgio?');
  });
  if (!chatHistory.length) {
    addBubble('assistant', "Ciao! Sono l'assistente AI (Mistral). Chiedimi qualsiasi cosa sul tuo trasferimento in Belgio.");
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addBubble('user', text);
    chatHistory.push({ role: 'user', content: text });
    const pending = addBubble('assistant', '…');
    try {
      const res = await postChat([{ role: 'system', content: SYSTEM_PROMPT }, ...chatHistory]);
      pending.textContent = res.reply;
      chatHistory.push({ role: 'assistant', content: res.reply });
    } catch (err) {
      pending.textContent = `Errore: ${err.message}`;
      pending.classList.add('error');
    }
  });
}

function renderTerminale() {
  if (!SERVER_MODE) {
    app.innerHTML = `<h2>Terminale</h2>
      <p class="error">Il terminale dati è disponibile solo con il server locale (<code>npm run dev</code>).
      Su GitHub Pages modifica i dati dall'editor JSON di ogni pagina (salvato nel browser) oppure
      direttamente editando i file <code>data/*.json</code> su GitHub.</p>`;
    return;
  }
  app.innerHTML = `
    <h2>Terminale</h2>
    <p class="muted">Modifica i tuoi dati da qui: scrivi <code>help</code> per i comandi
       (<code>ls</code>, <code>cat</code>, <code>set</code>, <code>add</code>, <code>remove</code>, <code>model</code>).</p>
    <div id="term" class="terminal"></div>
    <form id="term-form" class="term-form">
      <span class="prompt">&gt;</span>
      <input id="term-input" autocomplete="off" spellcheck="false" placeholder="scrivi un comando…">
    </form>`;
  const term = document.getElementById('term');
  const form = document.getElementById('term-form');
  const input = document.getElementById('term-input');
  const print = (text, cls = '') => {
    const pre = document.createElement('pre');
    if (cls) pre.className = cls;
    pre.textContent = text;
    term.appendChild(pre);
    term.scrollTop = term.scrollHeight;
  };
  print('Belgio App — terminale dati. Scrivi "help" per l\'elenco dei comandi.', 'muted');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const command = input.value.trim();
    if (!command) return;
    input.value = '';
    if (command.toLowerCase() === 'clear') {
      term.innerHTML = '';
      return;
    }
    print(`> ${command}`);
    try {
      const res = await postTerminal(command);
      if (res.output) print(res.output);
    } catch (err) {
      print(`Errore: ${err.message}`, 'error');
    }
  });
  input.focus();
}

const routes = {
  '/': renderHome,
  '/candidature': () => dataPage('candidature', 'Candidature', renderCandidature),
  '/documenti': () => dataPage('documenti', 'Documenti', renderDocumenti),
  '/checklist': () => dataPage('checklist', 'Checklist', renderChecklist),
  '/scadenze': () => dataPage('scadenze', 'Scadenze', renderScadenze),
  '/note': () => dataPage('note', 'Note', renderNote),
  '/chat': renderChat,
  '/terminale': renderTerminale,
};

function currentRoute() {
  const h = location.hash.replace(/^#/, '') || '/';
  return Object.hasOwn(routes, h) ? h : '/';
}

function render() {
  const r = currentRoute();
  document.querySelectorAll('.sidebar a').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('data-route') === r);
  });
  routes[r]();
}

window.addEventListener('hashchange', render);
detectServer().finally(render);
