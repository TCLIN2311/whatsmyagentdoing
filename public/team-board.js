// Team name board along the top of the office: one plate per resident agent.
// Greyed out while idle; lit with ~4000K warm white while working (thinking,
// running a tool, replying, waiting for you). Reads the page's global
// state.data.sessions, where src/residents.js tags entries with residentOf.
// Agents sharing a team.json "group" (a name, or a list of names) fold into one collapsible plate
// (e.g. "都市更新 ▸"); click it to show the member plates below. The group
// plate lights up when any member is working. Clicking a plate opens that
// agent in the side panel; clicking the same plate again folds the panel away.
(() => {
  if (new URLSearchParams(location.search).get('pip') === '1') return;
  const LIGHT = '255, 206, 166'; // ~4000K colour temperature
  const ACTIVE = new Set(['thinking', 'tool', 'typing', 'waiting']);

  const css = document.createElement('style');
  css.textContent = `
    #teamBoard { position: absolute; top: 12px; left: 0; right: 0; z-index: 5;
      display: flex; flex-wrap: wrap; justify-content: center; align-items: flex-start; gap: 10px;
      padding: 0 16px; pointer-events: none; }
    #teamBoard .plate { pointer-events: auto; cursor: pointer; white-space: nowrap;
      font: 600 13px/1 ui-sans-serif, system-ui, -apple-system, "PingFang TC", sans-serif;
      letter-spacing: .08em; padding: 8px 14px; border-radius: 6px;
      color: #6b6b6b; background: #1f1f1f; border: 1px solid #3a3a3a;
      filter: grayscale(1); transition: color .6s, background .6s, box-shadow .6s, border-color .6s; }
    #teamBoard .plate.on { filter: none; color: rgb(${LIGHT});
      background: rgba(${LIGHT}, .12); border-color: rgba(${LIGHT}, .7);
      text-shadow: 0 0 6px rgba(${LIGHT}, .9), 0 0 14px rgba(${LIGHT}, .5);
      box-shadow: 0 0 10px rgba(${LIGHT}, .45), 0 0 28px rgba(${LIGHT}, .25), inset 0 0 10px rgba(${LIGHT}, .2); }
    #teamBoard .group { position: relative; pointer-events: none; }
    #teamBoard .group > .plate .caret { display: inline-block; margin-left: 6px; font-size: 10px;
      transition: transform .2s; }
    #teamBoard .group.open > .plate .caret { transform: rotate(90deg); }
    #teamBoard .group > .plate .count { margin-left: 6px; font-size: 11px; opacity: .7; letter-spacing: 0; }
    #teamBoard .members { display: none; position: absolute; top: calc(100% + 6px); left: 50%;
      transform: translateX(-50%); flex-direction: column; align-items: stretch; gap: 6px;
      padding: 6px; border-radius: 8px; background: rgba(12, 12, 12, .85);
      border: 1px solid #2c2c2c; pointer-events: auto; }
    #teamBoard .group.open > .members { display: flex; }
    #teamBoard .members .plate { text-align: center; }
  `;
  document.head.appendChild(css);

  const board = document.createElement('div');
  board.id = 'teamBoard';
  const open = new Set(); // group names the user has expanded
  let last = '';

  function plate(name, t) {
    const el = document.createElement('div');
    el.className = 'plate' + (t.on ? ' on' : '');
    el.textContent = t.label;
    el.title = `${name}${t.on ? '（工作中）' : '（待命）'}`;
    // Click again on the plate whose details are showing to fold the side panel away.
    el.onclick = (e) => {
      e.stopPropagation();
      try {
        if (state.side && sel === t.key) { closeDetail(); setSide(false); }
        else openDetail(t.key);
      } catch {}
    };
    return el;
  }

  function render(items) {
    board.replaceChildren(...items.map((it) => {
      if (!it.group) return plate(it.name, it);
      const wrap = document.createElement('div');
      wrap.className = 'group' + (open.has(it.group) ? ' open' : '');
      const head = document.createElement('div');
      const busy = it.members.filter(([, t]) => t.on).length;
      head.className = 'plate' + (busy ? ' on' : '');
      head.textContent = it.group;
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = busy ? `${busy}/${it.members.length}` : String(it.members.length);
      const caret = document.createElement('span');
      caret.className = 'caret';
      caret.textContent = '▸';
      head.append(count, caret);
      head.title = `${it.group}：${it.members.map(([, t]) => t.label).join('、')}`;
      head.onclick = (e) => {
        e.stopPropagation();
        if (open.has(it.group)) open.delete(it.group); else open.add(it.group);
        wrap.classList.toggle('open', open.has(it.group));
      };
      const list = document.createElement('div');
      list.className = 'members';
      list.append(...it.members.map(([name, t]) => plate(name, t)));
      wrap.append(head, list);
      return wrap;
    }));
  }

  function tick() {
    const host = document.getElementById('office');
    if (!host || typeof state === 'undefined' || !state.data) return;
    if (board.parentNode !== host) host.appendChild(board);
    const team = new Map();
    for (const s of state.data.sessions || []) {
      if (!s.residentOf) continue;
      const t = team.get(s.residentOf) || { label: s.residentLabel || s.residentOf, group: s.residentGroup || null, on: false, key: s.key };
      if (ACTIVE.has(s.status)) { t.on = true; t.key = s.key; }
      team.set(s.residentOf, t);
    }
    const sorted = [...team.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const sig = JSON.stringify(sorted);
    if (sig === last) return;
    last = sig;
    // Each group takes the slot of its first member; ungrouped plates stay as is.
    // An agent listing several groups appears as a member of each.
    const items = [];
    const groups = new Map();
    for (const [name, t] of sorted) {
      const names = Array.isArray(t.group) ? t.group : t.group ? [t.group] : [];
      if (!names.length) { items.push({ name, ...t }); continue; }
      for (const gn of names) {
        let g = groups.get(gn);
        if (!g) { g = { group: gn, members: [] }; groups.set(gn, g); items.push(g); }
        g.members.push([name, t]);
      }
    }
    render(items);
  }
  document.addEventListener('click', (e) => {
    if (!open.size || board.contains(e.target)) return;
    open.clear();
    for (const g of board.querySelectorAll('.group.open')) g.classList.remove('open');
  });
  setInterval(tick, 700);
  tick();
})();
