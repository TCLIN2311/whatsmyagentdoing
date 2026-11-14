// Team name board along the top of the office: one plate per resident agent.
// Greyed out while idle; lit with ~4000K warm white while working (thinking,
// running a tool, replying, waiting for you). Reads the page's global
// state.data.sessions, where src/residents.js tags entries with residentOf.
(() => {
  if (new URLSearchParams(location.search).get('pip') === '1') return;
  const LIGHT = '255, 206, 166'; // ~4000K colour temperature
  const ACTIVE = new Set(['thinking', 'tool', 'typing', 'waiting']);

  const css = document.createElement('style');
  css.textContent = `
    #teamBoard { position: absolute; top: 12px; left: 0; right: 0; z-index: 5;
      display: flex; flex-wrap: wrap; justify-content: center; gap: 10px;
      padding: 0 16px; pointer-events: none; }
    #teamBoard .plate { pointer-events: auto; cursor: pointer;
      font: 600 13px/1 ui-sans-serif, system-ui, -apple-system, "PingFang TC", sans-serif;
      letter-spacing: .08em; padding: 8px 14px; border-radius: 6px;
      color: #6b6b6b; background: #1f1f1f; border: 1px solid #3a3a3a;
      filter: grayscale(1); transition: color .6s, background .6s, box-shadow .6s, border-color .6s; }
    #teamBoard .plate.on { filter: none; color: rgb(${LIGHT});
      background: rgba(${LIGHT}, .12); border-color: rgba(${LIGHT}, .7);
      text-shadow: 0 0 6px rgba(${LIGHT}, .9), 0 0 14px rgba(${LIGHT}, .5);
      box-shadow: 0 0 10px rgba(${LIGHT}, .45), 0 0 28px rgba(${LIGHT}, .25), inset 0 0 10px rgba(${LIGHT}, .2); }
  `;
  document.head.appendChild(css);

  const board = document.createElement('div');
  board.id = 'teamBoard';
  let last = '';

  function tick() {
    const host = document.getElementById('office');
    if (!host || typeof state === 'undefined' || !state.data) return;
    if (board.parentNode !== host) host.appendChild(board);
    const team = new Map();
    for (const s of state.data.sessions || []) {
      if (!s.residentOf) continue;
      const t = team.get(s.residentOf) || { label: s.residentLabel || s.residentOf, on: false, key: s.key };
      if (ACTIVE.has(s.status)) { t.on = true; t.key = s.key; }
      team.set(s.residentOf, t);
    }
    const list = [...team.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const sig = JSON.stringify(list);
    if (sig === last) return;
    last = sig;
    board.replaceChildren(...list.map(([name, t]) => {
      const el = document.createElement('div');
      el.className = 'plate' + (t.on ? ' on' : '');
      el.textContent = t.label;
      el.title = `${name}${t.on ? '（工作中）' : '（待命）'}`;
      el.onclick = () => { try { openDetail(t.key); } catch {} };
      return el;
    }));
  }
  setInterval(tick, 700);
  tick();
})();
