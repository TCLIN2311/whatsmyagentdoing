'use strict';

// Resident agents: every custom Claude Code agent in ~/.claude/agents/ gets a
// permanent spot in the office. Off duty it wanders around (status "idle");
// when it is actually called as a subagent, the resident steps aside and the
// working subagent takes a desk under the same name tag.
//
// Name tag and role come from an optional team.json next to the agent file
// (<dir of the real .md>/<name>/team.json: { "title", "role" }), otherwise
// from the agent's frontmatter. An optional "group" (e.g. one workflow; a string or
// a list of names) folds its members into a single collapsible plate on the team board; an optional
// numeric "order" (e.g. the workflow step) lists them in that order there; an agent in several groups
// may give { "<group>": n, ... } instead, one step per group (a group it leaves out puts it last).
// An optional "section" (e.g. "建築設計") puts this agent's groups side by side inside one labelled
// frame on the team board; each group there stays a collapsible plate. An optional "look" object in team.json gives
// the resident a custom outfit in the 2D office (see public/office.js newPerson).
//
// Case type: when a working agent belongs to several groups, the task it was given decides
// which group's plate lights up. "<label>：<group>" (label 案件類型 / case type) wins; otherwise a
// group counts as named when its name, or one of its aliases in an optional team-match.json next
// to the agent files ({ "<group>": ["alias", ...] }), appears in the task. Exactly one named
// group → only that plate lights; none or several → every group of the agent lights, as before.

const fs = require('fs');

function orderOf(o) {
  if (Number.isFinite(o)) return o;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const m = {};
  for (const [k, v] of Object.entries(o)) if (Number.isFinite(v)) m[k] = v;
  return Object.keys(m).length ? m : null;
}
const os = require('os');
const path = require('path');

const AGENTS_DIR = path.join(os.homedir(), '.claude', 'agents');
const ACTIVE = new Set(['thinking', 'tool', 'typing', 'waiting']);

let cache = { key: '', list: [] };

function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

function teamJson(mdFile, name) {
  try {
    const dir = path.dirname(fs.realpathSync(mdFile));
    return JSON.parse(fs.readFileSync(path.join(dir, name, 'team.json'), 'utf8')) || {};
  } catch { return {}; }
}

// "group" may be one name or a list (an agent that belongs to several workflows
// shows up under each of them). Returns a non-empty array or null.
function groups(g) {
  const list = (Array.isArray(g) ? g : [g])
    .filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
  return list.length ? [...new Set(list)] : null;
}

// Aliases per group name, from team-match.json in the real agents folder(s).
let matchCache = { key: '', map: {} };
function aliases(files) {
  const dirs = [...new Set(files.map((f) => {
    try { return path.dirname(fs.realpathSync(path.join(AGENTS_DIR, f))); } catch { return null; }
  }).filter(Boolean))];
  const stamp = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
  const key = dirs.map((d) => `${d}:${stamp(path.join(d, 'team-match.json'))}`).join('|');
  if (key === matchCache.key) return matchCache.map;
  const map = {};
  for (const d of dirs) {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(d, 'team-match.json'), 'utf8')); } catch { continue; }
    for (const [g, l] of Object.entries(j || {})) {
      if (!Array.isArray(l)) continue;
      map[g] = [...new Set([...(map[g] || []), ...l.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())])];
    }
  }
  matchCache = { key, map };
  return map;
}

// Cached by file times, so a new or edited agent shows up within seconds.
function residents() {
  let files = [];
  try { files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md')); } catch { return []; }
  const stamp = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
  const teamStamp = (f) => {
    try { return stamp(path.join(path.dirname(fs.realpathSync(path.join(AGENTS_DIR, f))), f.slice(0, -3), 'team.json')); } catch { return 0; }
  };
  const key = files.map((f) => `${f}:${stamp(path.join(AGENTS_DIR, f))}:${teamStamp(f)}`).join('|');
  if (key === cache.key) return cache.list;
  const list = [];
  for (const f of files) {
    let fm;
    try { fm = frontmatter(fs.readFileSync(path.join(AGENTS_DIR, f), 'utf8')); } catch { continue; }
    const name = fm.name || f.slice(0, -3);
    const t = teamJson(path.join(AGENTS_DIR, f), name);
    list.push({
      name,
      label: t.title || name,
      group: groups(t.group),
      order: orderOf(t.order),
      section: typeof t.section === 'string' && t.section.trim() ? t.section.trim() : null,
      role: t.role || (fm.description || '').split(/[。.]/)[0].slice(0, 80),
      look: t.look && typeof t.look === 'object' ? t.look : null,
      startedAt: stamp(path.join(AGENTS_DIR, f)),
    });
  }
  const al = aliases(files);
  for (const r of list) r.match = r.group && r.group.length > 1 ? Object.fromEntries(r.group.map((g) => [g, [g, ...(al[g] || [])]])) : null;
  cache = { key, list };
  return list;
}

// A subagent's .meta.json records which agent it is (agentType).
const typeCache = new Map();
function agentType(file) {
  if (!file || !file.includes(`${path.sep}subagents${path.sep}`)) return null;
  if (typeCache.has(file)) return typeCache.get(file);
  let t = null;
  try { t = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8')).agentType || null; } catch {}
  typeCache.set(file, t);
  return t;
}

// The task a subagent was given: the first user message of its transcript.
const taskCache = new Map();
function firstTask(file) {
  if (!file) return '';
  if (taskCache.has(file)) return taskCache.get(file);
  let text = '';
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(256 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    for (const line of buf.toString('utf8', 0, n).split('\n')) {
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (e.type !== 'user' || !e.message) continue;
      const c = e.message.content;
      text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((p) => p && p.type === 'text').map((p) => p.text).join('\n') : '';
      if (text) break;
    }
  } catch {}
  if (text) taskCache.set(file, text);
  return text;
}

// Which one of the agent's groups this task belongs to, or null (unknown / several).
function caseGroup(r, task) {
  if (!r.match || !task) return null;
  const label = /(?:案件類型|case type)\s*[:：=＝]\s*(\S+)/i.exec(task);
  if (label) {
    const hit = r.group.filter((g) => r.match[g].some((w) => label[1].includes(w)));
    if (hit.length === 1) return hit[0];
  }
  const hit = r.group.filter((g) => r.match[g].some((w) => task.includes(w)));
  return hit.length === 1 ? hit[0] : null;
}

// sessions: the view() list from server.js (modified in place); raw: watcher sessions.
function apply(sessions, raw, now, opts = {}) {
  if (opts.demo) return;
  const team = residents();
  if (!team.length) return;
  const byName = new Map(team.map((r) => [r.name, r]));
  const busy = new Set();
  const rawByKey = new Map(raw.map((s) => [`${s.agent}:${s.id}`, s]));
  for (const v of sessions) {
    if (v.agent !== 'claude' || !v.subagent) continue;
    const file = (rawByKey.get(v.key) || {}).file;
    const r = byName.get(agentType(file));
    if (!r || !ACTIVE.has(v.status)) continue;
    v.residentCase = caseGroup(r, firstTask(file));
    busy.add(r.name);
    v.project = r.label;
    v.residentOf = r.name;
    v.residentLabel = r.label;
    v.residentGroup = r.group;
    v.residentOrder = r.order;
    v.residentSection = r.section;
    if (r.look) v.look = r.look;
  }
  // Sort residents ahead of recently finished sessions so they never "go home";
  // use the newest event time rather than now so idle ticks don't push updates.
  const latest = sessions.reduce((m, s) => Math.max(m, s.lastEventAt || 0), 0);
  for (const r of team) {
    if (busy.has(r.name)) continue;
    sessions.push({
      key: `claude:resident-${r.name}`,
      agent: 'claude',
      id: `resident-${r.name}`,
      sessionId: null,
      parentId: null,
      subagent: false,
      resident: true,
      residentOf: r.name,
      residentLabel: r.label,
      residentGroup: r.group,
      residentOrder: r.order,
      residentSection: r.section,
      look: r.look,
      cwd: null,
      project: r.label,
      title: opts.privacy ? null : `常駐成員：${r.role}`,
      model: null,
      status: 'idle',
      stuck: 0,
      context: null,
      today: null,
      activity: null,
      prompt: null,
      reply: opts.privacy ? null : `我是「${r.label}」（${r.name}）。需要時在對話裡請 Claude 交給 ${r.name}。`,
      error: null,
      turnStartedAt: null,
      lastEventAt: latest || r.startedAt,
      startedAt: r.startedAt,
    });
  }
}

module.exports = { apply, residents, caseGroup, firstTask };
