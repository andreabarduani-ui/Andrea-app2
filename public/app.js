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

const getData = (name) => api(`/api/data/${name}`);
const putData = (name, value) => api(`/api/data/${name}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(value),
});
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
      await putData(name, parsed);
      status.textContent = 'Salvato ✔';
      refresh();
    } catch (err) {
      status.textContent = `Errore: ${err.message}`;
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

async function renderHome() {
  app.innerHTML = '<h2>Home</h2><p class="muted">Caricamento…</p>';
  try {
    const [health, docs, check, scad] = await Promise.all([
      api('/api/health'),
      getData('documenti'),
      getData('checklist'),
      getData('scadenze'),
    ]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const pronti = docs.filter((d) => d.stato === 'pronto').length;
    const fatti = check.filter((c) => c.fatto).length;
    const prossime = [...scad]
      .filter((s) => new Date(`${s.data}T00:00:00`) >= today)
      .sort((a, b) => String(a.data).localeCompare(String(b.data)))
      .slice(0, 3);
    app.innerHTML = `
      <h2>🇧🇪 Benvenuto in Belgio App</h2>
      <p>La tua app per gestire il trasferimento in Belgio: documenti, checklist, scadenze, note,
         chat con l'IA e un terminale per modificare i tuoi dati.</p>
      <div class="cards">
        <a class="card" href="#/documenti"><strong>${pronti}/${docs.length}</strong><span>documenti pronti</span></a>
        <a class="card" href="#/checklist"><strong>${fatti}/${check.length}</strong><span>checklist completati</span></a>
        <a class="card" href="#/scadenze"><strong>${prossime.length}</strong><span>prossime scadenze</span></a>
        <a class="card" href="#/chat"><strong>${esc(health.model)}</strong>
          <span>chat AI ${health.apiKeyConfigured ? '✔ pronta' : '⚠ chiave mancante'}</span></a>
      </div>
      <h3>Prossime scadenze</h3>
      ${prossime.length
        ? '<ul>' + prossime.map((s) => `<li><strong>${esc(s.data)}</strong> — ${esc(s.titolo)}</li>`).join('') + '</ul>'
        : '<p class="muted">Nessuna scadenza imminente.</p>'}
      ${health.apiKeyConfigured
        ? ''
        : '<p class="error">MISTRAL_API_KEY non configurata: crea il file .env (vedi README) per usare la chat AI.</p>'}
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
render();
