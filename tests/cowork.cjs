// Cowork tasks of the Claude desktop app. Synthetic logs only.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const APP = fs.mkdtempSync(path.join(os.tmpdir(), 'wmad-cowork-'));
process.env.CLAUDE_APP_DIR = APP;
const { newSession, applyCowork } = require('../src/parsers');
const { Watcher } = require('../src/watcher');

const NOW = Date.now();
const at = (ms) => new Date(NOW - ms).toISOString();
const line = (type, extra = {}, ms = 0) => ({ type, session_id: 'cli', uuid: `${type}-${ms}`, _audit_timestamp: at(ms), ...extra });

test.after(() => fs.rmSync(APP, { recursive: true, force: true }));

test('Cowork follows a turn from prompt to result, with the app timestamps', () => {
  const s = newSession('cowork', 'local_1');
  applyCowork(s, line('system', { subtype: 'init', model: 'claude-opus-5-5', cwd: '/sessions/sandbox' }, 9000));
  assert.equal(s.model, 'claude-opus-5-5');
  assert.equal(s.cwd, null, 'the sandbox path is not your folder');
  applyCowork(s, line('user', { message: { role: 'user', content: 'Make the awards poster' } }, 8000));
  assert.equal(s.status, 'thinking'); assert.equal(s.prompt, 'Make the awards poster');
  applyCowork(s, line('user', { isReplay: true, message: { role: 'user', content: 'Make the awards poster' } }, 7900));
  applyCowork(s, line('user', { isSynthetic: true, message: { role: 'user', content: [{ type: 'text', text: 'skill body' }] } }, 7800));
  assert.equal(s.prompt, 'Make the awards poster');
  applyCowork(s, line('assistant', { message: { id: 'm1', model: 'claude-opus-5-5', content: [{ type: 'tool_use', name: 'Write', input: { file_path: '/x/poster.html' } }] } }, 6000));
  assert.equal(s.status, 'tool'); assert.equal(s.activity, 'Write poster.html');
  applyCowork(s, line('user', { message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't' }] } }, 5000));
  applyCowork(s, line('system', { subtype: 'status', status: 'requesting' }, 4000));
  assert.equal(s.status, 'thinking');
  applyCowork(s, line('assistant', { message: { id: 'm2', content: [{ type: 'tool_use', name: 'AskUserQuestion', input: {} }] } }, 3000));
  assert.equal(s.status, 'waiting');
  applyCowork(s, line('result', { subtype: 'success', is_error: false, result: 'Poster is ready.' }, 1000));
  assert.equal(s.status, 'done'); assert.equal(s.reply, 'Poster is ready.');
  assert.equal(s.lastEventAt, NOW - 1000);
  assert.equal(s.startedAt, NOW - 9000);
});

test('Cowork reports a failed run as an error', () => {
  const s = newSession('cowork', 'local_2');
  applyCowork(s, line('user', { message: { role: 'user', content: 'Migrate the workflow' } }, 2000));
  applyCowork(s, line('result', { subtype: 'error_during_execution', is_error: true }, 1000));
  assert.equal(s.status, 'error'); assert.equal(s.error, 'error_during_execution');
});

test('the watcher finds Cowork tasks, reads their task file and hides archived ones', () => {
  const dir = path.join(APP, 'local-agent-mode-sessions', 'org', 'user');
  const task = (id, meta, lines) => {
    fs.mkdirSync(path.join(dir, id), { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(meta));
    fs.writeFileSync(path.join(dir, id, 'audit.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  };
  const turn = [
    line('system', { subtype: 'init', model: 'claude-sonnet-5-5', cwd: '/sessions/x' }, 3000),
    line('user', { message: { role: 'user', content: 'Plan the week' } }, 2000),
    line('assistant', { message: { id: 'a', content: [{ type: 'text', text: 'Here is the plan.' }], stop_reason: 'end_turn' } }, 1500),
  ];
  task('local_open', { title: 'Weekly plan', userSelectedFolders: ['/Users/me/Plans'], createdAt: NOW - 5000, isArchived: false }, turn);
  task('local_done', { title: 'Old task', userSelectedFolders: [], createdAt: NOW - 5000, isArchived: true }, turn);
  fs.mkdirSync(path.join(dir, 'local_nolog'), { recursive: true }); // started, nothing written yet

  const w = new Watcher({ hours: 1 });
  w.tick();
  const rows = w.sessions().filter((s) => s.agent === 'cowork');
  assert.deepEqual(rows.map((s) => s.id), ['local_open']);
  const [s] = rows;
  assert.equal(s.title, 'Weekly plan');
  assert.equal(s.cwd, '/Users/me/Plans');
  assert.equal(s.model, 'claude-sonnet-5-5');
  assert.equal(s.status, 'done');
  assert.equal(s.startedAt, NOW - 5000);
  const msgs = w.transcript('cowork:local_open');
  assert.deepEqual(msgs.map((m) => [m.role, m.text]), [['user', 'Plan the week'], ['assistant', 'Here is the plan.']]);
  assert.equal(msgs[0].at, NOW - 2000);
});
