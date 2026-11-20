// Team name board along the top of the office: one plate per resident agent.
// Greyed out while idle; lit with ~4000K warm white while working (thinking,
// running a tool, replying, waiting for you). Reads the page's global
// state.data.sessions, where src/residents.js tags entries with residentOf.
// Agents sharing a team.json "group" (a name, or a list of names) fold into one collapsible plate
// (e.g. "都市更新 ▸"); click it to show the member plates below. The group
// plate lights up when any member is working. Groups whose members share a team.json
// "section" (e.g. "建築設計") sit side by side under one labelled bracket; each of
// them is still a collapsible plate ("都市更新 ▸", "危老重建 ▸", "素地新建 ▸"). Clicking a plate opens that
// Members of a group that share a team.json
// "subgroup" (e.g. "室內裝修申請") fold into one nested collapsible plate inside that group's list,
// at the slot of the first of them. Clicking a plate opens that
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
    /* 子群組（例如 室內裝修 ▸ 申請 ▸）：收在上層清單裡，點開後成員縮排列在它下面。 */
    #teamBoard .members .group { pointer-events: auto; display: flex; flex-direction: column; align-items: stretch; }
    #teamBoard .members .group > .members { position: static; transform: none; margin: 6px 0 0 10px; padding: 0 0 0 6px;
      border: none; border-left: 1px solid #3a3a3a; border-radius: 0; background: none; }
    #teamBoard .section { position: relative; pointer-events: none; display: flex; align-items: flex-start;
      gap: 10px; padding: 16px 10px 0; margin-top: 4px; border: 1px solid #3a3a3a; border-bottom: none;
      border-radius: 8px 8px 0 0; transition: border-color .6s, box-shadow .6s; }
    #teamBoard .section.on { border-color: rgba(${LIGHT}, .45); }
    #teamBoard .section > .legend { position: absolute; top: -9px; left: 50%; transform: translateX(-50%);
      padding: 0 10px; white-space: nowrap;
      font: 600 12px/18px ui-sans-serif, system-ui, -apple-system, "PingFang TC", sans-serif;
      letter-spacing: .2em; color: #8a8a8a; background: #141414; }
    #teamBoard .section.on > .legend { color: rgb(${LIGHT}); }
    /* 畫面窄到名牌要換行時：名牌縮小；還是換行時，建築設計框改成封閉的框，不留斷掉的框線。 */
    #teamBoard.compact { gap: 6px; padding: 0 8px; }
    #teamBoard.compact .plate { font-size: 12px; letter-spacing: .03em; padding: 6px 9px; }
    #teamBoard.compact .group > .plate .count, #teamBoard.compact .group > .plate .caret { margin-left: 4px; }
    #teamBoard.compact .section { gap: 6px; padding: 14px 6px 0; }
    #teamBoard.wrapped .section { padding-bottom: 6px; border-bottom: 1px solid #3a3a3a; border-radius: 8px; }
    #teamBoard.wrapped .section.on { border-bottom-color: rgba(${LIGHT}, .45); }
  `;
  document.head.appendChild(css);

  const board = document.createElement('div');
  board.id = 'teamBoard';
  const open = new Set(); // group names the user has expanded
  let last = '';

  // Inside a group the group name is already on the head plate, so a member
  // label that starts with it drops the prefix ("室內裝修合約" → "合約").
  function plate(name, t, group) {
    const el = document.createElement('div');
    el.className = 'plate' + (t.on ? ' on' : '');
    const short = group && t.label.startsWith(group) ? t.label.slice(group.length).trim() : '';
    el.textContent = short || t.label;
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
      if (it.section) {
        const box = document.createElement('div');
        box.className = 'section' + (it.groups.some((g) => g.members.some(([, t]) => t.on)) ? ' on' : '');
        const legend = document.createElement('span');
        legend.className = 'legend';
        legend.textContent = it.section;
        box.append(legend, ...it.groups.map(groupEl));
        return box;
      }
      if (!it.group) return plate(it.name, it);
      return groupEl(it);
    }));
  }

  // parent: the group this one is nested in (a subgroup), if any.
  function groupEl(it, parent) {
    {
      const id = parent ? `${parent}/${it.group}` : it.group;
      const wrap = document.createElement('div');
      wrap.className = 'group' + (open.has(id) ? ' open' : '');
      const head = document.createElement('div');
      const busy = it.members.filter(([, t]) => t.on).length;
      head.className = 'plate' + (busy ? ' on' : '');
      head.textContent = parent && it.group.startsWith(parent) ? it.group.slice(parent.length).trim() || it.group : it.group;
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
        if (open.has(id)) open.delete(id); else open.add(id);
        wrap.classList.toggle('open', open.has(id));
      };
      const list = document.createElement('div');
      list.className = 'members';
      // Members sharing a "subgroup" fold into one nested group at the slot of the first of them.
      const subs = new Map();
      const rows = [];
      for (const m of it.members) {
        const sn = !parent && m[1].subgroup;
        if (!sn) { rows.push(m); continue; }
        let sg = subs.get(sn);
        if (!sg) { sg = { group: sn, members: [] }; subs.set(sn, sg); rows.push(sg); }
        sg.members.push(m);
      }
      list.append(...rows.map((r) => (Array.isArray(r) ? plate(r[0], r[1], parent ? null : it.group) : groupEl(r, it.group))));
      wrap.append(head, list);
      return wrap;
    }
  }

  function tick() {
    const host = document.getElementById('office');
    if (!host || typeof state === 'undefined' || !state.data) return;
    if (board.parentNode !== host) host.appendChild(board);
    const team = new Map();
    for (const s of state.data.sessions || []) {
      if (!s.residentOf) continue;
      const t = team.get(s.residentOf) || { label: s.residentLabel || s.residentOf, group: s.residentGroup || null, order: s.residentOrder ?? null, section: s.residentSection || null, subgroup: s.residentSubgroup || null, on: false, cases: [], key: s.key };
      if (ACTIVE.has(s.status)) {
        t.on = true; t.key = s.key;
        // cases: the groups this agent is working for; null = all of its groups (unknown case type).
        if (!s.residentCase) t.cases = null;
        else if (t.cases && !t.cases.includes(s.residentCase)) t.cases.push(s.residentCase);
      }
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
        // In a group the agent is not working for, its plate stays dark.
        g.members.push([name, t.on && t.cases && t.cases.length && !t.cases.includes(gn) ? { ...t, on: false } : t]);
      }
    }
    // Within a group, members follow team.json "order" (workflow steps, first
    // on top); members without one go last, by name.
    // "order" may be one number, or { "<group>": n } for an agent in several groups.
    const rank = (t, gn) => {
      const o = t.order && typeof t.order === 'object' ? t.order[gn] : t.order;
      return Number.isFinite(o) ? o : Infinity;
    };
    for (const g of groups.values()) g.members.sort((a, b) => rank(a[1], g.group) - rank(b[1], g.group) || a[0].localeCompare(b[0]));
    // Groups of the same "section" go into one bracket, at the slot of the first of them,
    // in the order of the longest group list a member gives (e.g. 都市更新、危老重建、素地新建).
    const out = [];
    const sections = new Map();
    for (const it of items) {
      const sec = it.group && it.members.map(([, t]) => t.section).find(Boolean);
      if (!sec) { out.push(it); continue; }
      let s = sections.get(sec);
      if (!s) { s = { section: sec, groups: [] }; sections.set(sec, s); out.push(s); }
      s.groups.push(it);
    }
    for (const s of sections.values()) {
      let canon = [];
      for (const g of s.groups) for (const [, t] of g.members) {
        const l = Array.isArray(t.group) ? t.group : [t.group];
        if (l.length > canon.length) canon = l;
      }
      const at = (n) => { const i = canon.indexOf(n); return i < 0 ? Infinity : i; };
      s.groups.sort((a, b) => at(a.group) - at(b.group));
    }
    render(out);
    fit();
  }

  // 名牌排不下一列時先縮小（compact），縮小後還是換行就標 wrapped。
  function fit() {
    // 建築設計框比單獨的名牌高、上緣也低幾 px，所以用「下一個比第一個低超過 24px」才算換行。
    const rows = () => {
      const tops = [...board.children].map((c) => c.getBoundingClientRect().top);
      return tops.some((t) => t - Math.min(...tops) > 24) ? 2 : 1;
    };
    board.classList.remove('compact', 'wrapped');
    if (!board.children.length || rows() <= 1) return;
    board.classList.add('compact');
    if (rows() > 1) board.classList.add('wrapped');
  }
  addEventListener('resize', fit);
  document.addEventListener('click', (e) => {
    if (!open.size || board.contains(e.target)) return;
    open.clear();
    for (const g of board.querySelectorAll('.group.open')) g.classList.remove('open');
  });
  setInterval(tick, 700);
  tick();
})();
