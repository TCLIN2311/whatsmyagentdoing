'use strict';

// Resident agents: every custom Claude Code agent in ~/.claude/agents/ gets a
// permanent spot in the office. Off duty it wanders around (status "idle");
// when it is actually called as a subagent, the resident steps aside and the
// working subagent takes a desk under the same name tag.
//
// Name tag and role come from an optional team.json next to the agent file
// (<dir of the real .md>/<name>/team.json: { "title", "role" }), otherwise
// from the agent's frontmatter. An optional "look" object in team.json gives
// the resident a custom outfit in the 2D office (see public/office.js newPerson).

const fs = require('fs');
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
      role: t.role || (fm.description || '').split(/[。.]/)[0].slice(0, 80),
      look: t.look && typeof t.look === 'object' ? t.look : null,
      startedAt: stamp(path.join(AGENTS_DIR, f)),
    });
  }
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
    const r = byName.get(agentType((rawByKey.get(v.key) || {}).file));
    if (!r || !ACTIVE.has(v.status)) continue;
    busy.add(r.name);
    v.project = r.label;
    v.residentOf = r.name;
    v.residentLabel = r.label;
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

module.exports = { apply, residents };
