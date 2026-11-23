// Isometric office: agents that are working sit at cubicle desks; a few that
// are off duty wander between the pantry, lounge, meeting room and ping-pong
// table. Plain canvas 2D with local provider logos, no dependencies.
(() => {
  'use strict';

  const TW = 64; // tile width px
  const TH = 32; // tile height px; one z unit is TH px too
  const WALL_H = 2.4;
  const WORKING = new Set(['thinking', 'tool', 'typing', 'waiting', 'error']);
  const MAX_WANDERERS = 7;
  const SPEED = 2.1; // tiles / second

  const SKIN = ['#f3cfb0', '#e5b38f', '#c98d66', '#9a6646', '#6e4630', '#f7dcc7'];
  const HAIR = ['#2a2019', '#4b3020', '#8a4b2a', '#c99a5b', '#1c1c1c', '#8c8c8c', '#a33a2c', '#3d3550'];
  const SHIRT = {
    claude: ['#c96442', '#d9825f', '#b4553a', '#e09a72'],
    cowork: ['#b0703f', '#c98a55', '#93592f', '#ddb07f'],
    codex: ['#10a37f', '#2bb38f', '#0d8a6b', '#4cc3a0'],
    gemini: ['#4f7cf0', '#6b8ff5', '#3d66d6', '#8aa6f8'],
    copilot: ['#8f5cf5', '#a06af7', '#7a47d5', '#c5a4ff'],
    omp: ['#a96926', '#c78942', '#8d531e', '#dca45c'],
    pi: ['#4f8eb3', '#6ba5c7', '#3d7596', '#9cc7df'],
    antigravity: ['#0ea5e9', '#38bdf8', '#0284c7', '#7dd3fc'],
    opencode: ['#2f6fd0', '#4a86e0', '#2559b0', '#7aa5ee'],
    hermes: ['#b4622d', '#d07c44', '#96501f', '#e2a374'],
  };
  // Official product icons, shared by both renderers and the page UI (OMP: a neutral monogram).
  // Load once per page from the same origin so video capture stays readable.
  // Initials remain a fallback if an image cannot be loaded.
  const AGENT_BADGES = {
    claude: { label: 'Claude', short: 'Cl', color: '#c96442', logo: '/assets/agents/claude.png' },
    cowork: { label: 'Cowork', short: 'Cw', color: '#b0703f', logo: '/assets/agents/claude.png' },
    codex: { label: 'Codex', short: 'Cx', color: '#10a37f', logo: '/assets/agents/codex.png' },
    gemini: { label: 'Gemini', short: 'G', color: '#4f7cf0', logo: '/assets/agents/gemini.png' },
    copilot: { label: 'Copilot', short: 'Co', color: '#8f5cf5', logo: '/assets/agents/copilot.svg', mono: true },
    kimi: { label: 'Kimi Code', short: 'Ki', logo: '/assets/agents/kimi.svg', mono: true },
    dsh: { label: 'DSH', short: 'Ds', logo: '/assets/agents/dsh.svg' },
    grok: { label: 'Grok Build', short: 'Gr', logo: '/assets/agents/grok.svg', mono: true },
    omp: { label: 'OMP', short: 'OMP', color: '#a96926', logo: '/assets/agents/omp.svg' },
    pi: { label: 'Pi', short: 'Pi', color: '#4f8eb3', logo: '/assets/agents/pi.svg' },
    antigravity: { label: 'Antigravity', short: 'Ag', color: '#0ea5e9', logo: '/assets/agents/antigravity.png' },
    opencode: { label: 'OpenCode', short: 'Oc', color: '#2f6fd0', logo: '/assets/agents/opencode.svg', mono: true },
    hermes: { label: 'Hermes', short: 'He', color: '#b4622d', logo: '/assets/agents/hermes.svg', mono: true },
  };
  for (const badge of Object.values(AGENT_BADGES)) {
    badge.image = new Image();
    badge.image.src = badge.logo;
  }
  const PANTS = ['#34405a', '#2c2c34', '#4a3f35', '#3b4a3f'];
  // Black-and-white outfit for anyone without a custom look: varied cuts
  // (jacket, coat, plain top), tones and accessories, all monochrome.
  const BW_DARK = ['#151517', '#1f1f22', '#2a2a2d'];
  const BW_LIGHT = ['#f3f2ee', '#e9e8e3', '#dcdbd6'];
  const BW_GREY = ['#8a8a8e', '#5e5e62'];
  function bwLook(h) {
    const style = pick([0, 1, 2, 3, 4], h, 21);
    const dk = pick(BW_DARK, h, 22), lt = pick(BW_LIGHT, h, 23);
    const L = {
      skin: pick(SKIN, h, 3), hair: pick(['#1c1c1c', '#2a2019', '#3a3a3a', '#8c8c8c', '#1c1c1c'], h, 24),
      hairStyle: pick(['short', 'long', 'bun', 'crop', 'slick'], h, 25),
      jacket: [dk, lt, dk, pick(BW_GREY, h, 26), lt][style],
      inner: [lt, dk, lt, lt, lt][style],
      stitch: style === 1 || style === 4 ? '#bdbdb8' : '#3a3a3d',
      pants: [dk, dk, dk, dk, lt][style] === lt && pick([0, 1], h, 27) ? dk : [dk, dk, dk, dk, lt][style],
      shoes: pick(['#f5f5f2', '#121213'], h, 28),
      coat: style === 2,
      wide: !!pick([0, 1], h, 29),
    };
    if (L.shoes === '#f5f5f2' && pick([0, 1], h, 30)) L.shoeStripe = '#141414';
    if (!pick([0, 1, 2, 3], h, 31)) L.glasses = '#111111';
    if (!pick([0, 1, 2, 3, 4, 5], h, 32)) L.hat = pick(['#161617', '#ecebe6'], h, 33);
    return L;
  }

  // Named hairstyles a resident's "look" can ask for (4 = slicked back).
  const HAIR_STYLE = { short: 0, long: 1, bun: 2, crop: 3, slick: 4 };
  const PANEL = ['#7d93c4', '#d98b6a', '#7fb08a', '#c9a24c'];

  const STATUS_COLOR = {
    thinking: '#8b6be6', tool: '#3b8ee0', typing: '#22a874', waiting: '#e09412',
    done: '#5f9a4c', error: '#de4b40', interrupted: '#9b9a94', idle: '#9b9a94',
  };

  const ACT_EMOJI = {
    coffee: '☕', water: '💧', fridge: '🍎', sink: '🫧', stool: '💬', couch: '💬', beanbag: '🎧',
    window: '☁️', read: '📖', whiteboard: '✏️', meeting: '💬', arcade: '🎮', pingpong: '🏓', plant: '🌱',
    vending: '🥤', foosball: '⚽', phone: '📞', gpu: '⚡', interview: '🎤', camera: '🎥',
  };

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const pick = (arr, h, salt) => arr[(Math.imul(h ^ Math.imul(salt, 2654435761), 2246822519) >>> 0) % arr.length];
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function palette() {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    return dark ? {
      dark: true,
      wood1: '#a8865f', wood2: '#a07f58', woodLine: 'rgba(70,45,20,.28)',
      paint1: '#c9c3b7', paint2: '#c5bfb3', paintSheen: 'rgba(255,255,255,.035)',
      raised: '#9ea2a6', raisedPerf: '#7f8489', raisedLine: 'rgba(0,0,0,.18)', chairWhite: '#e9e9e6',
      walnut: '#5e412d', walnutL: '#4d3524', walnutR: '#3f2b1d', walnutGrain: 'rgba(20,10,4,.28)',
      leather: '#6a4027', leatherD: '#52311c', stud: '#c9a75e',
      gymFloor: '#2e3236', gameFloor: '#3c3550', movieFloor: '#3e2328',
      tileA: '#bfb39f', tileB: '#b8ac98', carpet: '#33404d', carpetLine: 'rgba(255,255,255,.04)',
      wallL: '#4a4640', wallR: '#3f3b36', wallTop: '#5a554e', trim: '#2b2926',
      deskTop: '#8a6a4c', deskL: '#6e533b', deskR: '#5c4431',
      monitor: '#18181a', screenOff: '#26282c', chair: '#2d2d32',
      rug: '#47544f', rugEdge: '#3a4541', couch: '#5b6b8c', couchD: '#4a587a',
      counter: '#d9d4c9', counterL: '#a9a397', counterR: '#958f84', metal: '#8d939a',
      glass: 'rgba(160,200,230,.10)', glassEdge: 'rgba(190,220,240,.35)', mat: '#2f4a3a',
      text: '#ecebe6', tagBg: 'rgba(20,20,19,.78)', bubble: '#f4f3ee', bubbleInk: '#1c1c1a',
      plant: '#4f8a52', pot: '#9a5b3c', shadow: 'rgba(0,0,0,.28)', book: ['#c96442', '#3b8ee0', '#5f9a4c', '#c9a24c', '#8b6be6'],
    } : {
      dark: false,
      wood1: '#ddbf92', wood2: '#d5b688', woodLine: 'rgba(120,80,40,.18)',
      paint1: '#f1ece2', paint2: '#ede7dc', paintSheen: 'rgba(255,255,255,.35)',
      raised: '#d5d8db', raisedPerf: '#b7bbbf', raisedLine: 'rgba(0,0,0,.10)', chairWhite: '#fbfbf9',
      walnut: '#6e4c34', walnutL: '#5a3d29', walnutR: '#4a3221', walnutGrain: 'rgba(30,16,6,.22)',
      leather: '#7a4a2b', leatherD: '#5f3920', stud: '#d9b56a',
      gymFloor: '#6b727a', gameFloor: '#cfc6e0', movieFloor: '#8a4a52',
      tileA: '#e8dcc6', tileB: '#e2d5be', carpet: '#c9d3dc', carpetLine: 'rgba(0,0,0,.035)',
      wallL: '#f4efe6', wallR: '#e8e1d4', wallTop: '#fbf8f2', trim: '#cfc5b3',
      deskTop: '#c89f72', deskL: '#a8825a', deskR: '#946f4b',
      monitor: '#2a2a2e', screenOff: '#3a3d44', chair: '#4a4a52',
      rug: '#c4d4cb', rugEdge: '#a9bcb1', couch: '#7d93c4', couchD: '#6a80b0',
      counter: '#fbfaf7', counterL: '#d9d4c9', counterR: '#c9c3b6', metal: '#b5bcc4',
      glass: 'rgba(170,210,235,.16)', glassEdge: 'rgba(120,160,190,.55)', mat: '#bfd8c4',
      text: '#1c1c1a', tagBg: 'rgba(255,255,255,.9)', bubble: '#ffffff', bubbleInk: '#1c1c1a',
      plant: '#5a9b5d', pot: '#b86f4b', shadow: 'rgba(60,40,20,.18)', book: ['#c96442', '#3b8ee0', '#5f9a4c', '#c9a24c', '#8b6be6'],
    };
  }

  function skyColor(d = new Date()) {
    const h = d.getHours() + d.getMinutes() / 60;
    if (h >= 7 && h < 17) return { sky: '#a9d4f2', night: false };
    if (h >= 5 && h < 7) return { sky: '#f3c9a8', night: false };
    if (h >= 17 && h < 19) return { sky: '#f0a679', night: false };
    return { sky: '#1d2747', night: true };
  }

  // ---------------------------------------------------------------- A* grid

  class Grid {
    constructor(W, D, res = 4) {
      this.res = res;
      this.cw = Math.ceil(W * res);
      this.ch = Math.ceil(D * res);
      this.cost = new Uint8Array(this.cw * this.ch);
    }
    block(x, y, w, d, pad = 0.12) {
      const R = this.res;
      const i0 = clamp(Math.floor((x - pad) * R), 0, this.cw - 1);
      const i1 = clamp(Math.ceil((x + w + pad) * R) - 1, 0, this.cw - 1);
      const j0 = clamp(Math.floor((y - pad) * R), 0, this.ch - 1);
      const j1 = clamp(Math.ceil((y + d + pad) * R) - 1, 0, this.ch - 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.cost[j * this.cw + i] = 1;
    }
    blocked(x, y) {
      const i = Math.floor(x * this.res), j = Math.floor(y * this.res);
      if (i < 0 || j < 0 || i >= this.cw || j >= this.ch) return true;
      return !!this.cost[j * this.cw + i];
    }
    path(ax, ay, bx, by) {
      const R = this.res, cw = this.cw, ch = this.ch;
      const si = clamp(Math.floor(ax * R), 0, cw - 1), sj = clamp(Math.floor(ay * R), 0, ch - 1);
      const gi = clamp(Math.floor(bx * R), 0, cw - 1), gj = clamp(Math.floor(by * R), 0, ch - 1);
      const N = cw * ch;
      const g = new Float32Array(N).fill(Infinity);
      const came = new Int32Array(N).fill(-1);
      const closed = new Uint8Array(N);
      const heap = [];
      const push = (f, n) => {
        heap.push([f, n]);
        let k = heap.length - 1;
        while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
      };
      const pop = () => {
        const top = heap[0], last = heap.pop();
        if (heap.length) {
          heap[0] = last;
          let k = 0;
          for (;;) {
            const l = 2 * k + 1, r = l + 1;
            let m = k;
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
            if (m === k) break;
            [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
          }
        }
        return top;
      };
      const hfn = (i, j) => { const dx = Math.abs(i - gi), dy = Math.abs(j - gj); return Math.max(dx, dy) + 0.41 * Math.min(dx, dy); };
      // Blocked cells are expensive, not impossible, so a path always exists
      // (someone standing right against furniture can still step away).
      const stepCost = (n) => (this.cost[n] ? 25 : 1);
      const start = sj * cw + si, goal = gj * cw + gi;
      g[start] = 0;
      push(hfn(si, sj), start);
      const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]];
      while (heap.length) {
        const [, n] = pop();
        if (n === goal) break;
        if (closed[n]) continue;
        closed[n] = 1;
        const i = n % cw, j = (n / cw) | 0;
        for (const [di, dj, c] of dirs) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= cw || nj >= ch) continue;
          if (di && dj && (this.cost[j * cw + ni] || this.cost[nj * cw + i])) continue;
          const nn = nj * cw + ni;
          const ng = g[n] + c * stepCost(nn);
          if (ng < g[nn]) { g[nn] = ng; came[nn] = n; push(ng + hfn(ni, nj), nn); }
        }
      }
      const cells = [];
      for (let n = goal; n !== -1 && n !== start; n = came[n]) cells.push(n);
      cells.reverse();
      const pts = [];
      let lastDir = null;
      for (let k = 0; k < cells.length; k++) {
        const n = cells[k];
        const dir = n - (k ? cells[k - 1] : start);
        const pt = { x: ((n % cw) + 0.5) / R, y: (((n / cw) | 0) + 0.5) / R };
        if (dir === lastDir && pts.length) pts[pts.length - 1] = pt;
        else pts.push(pt);
        lastDir = dir;
      }
      if (pts.length) pts[pts.length - 1] = { x: bx, y: by };
      else pts.push({ x: bx, y: by });
      return pts;
    }
  }

  // ---------------------------------------------------------------- office

  class Office {
    constructor(root, { onHover, label, subLabel, onFrame, showAgent = true, compact = false } = {}) {
      this.root = root;
      this.onHover = onHover || (() => {});
      this.label = label || ((s) => s.project || s.agent);
      this.subLabel = subLabel || (() => '');
      this.onFrame = onFrame;
      this.showAgent = showAgent;
      this.compact = compact;
      this.offDutyLabel = 'went home';
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'office-canvas';
      root.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.people = new Map();
      this.deskOf = new Map();
      this.offDuty = 0;
      this.first = true;
      this.visible = true;
      this.hit = [];
      this.hoverKey = null;
      this.t = performance.now();
      this.pal = palette();
      this.plan = this.buildPlan(0);
      this.cat = { x: this.plan.W - 3, y: this.plan.D - 2, path: [], until: 0, face: 1 };
      this.theme = matchMedia('(prefers-color-scheme: dark)');
      this.onTheme = () => (this.pal = palette());
      this.theme.addEventListener('change', this.onTheme);

      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(root);
      this.canvas.addEventListener('mousemove', (e) => this.pointer(e));
      this.canvas.addEventListener('click', (e) => this.pointer(e, true));
      this.canvas.addEventListener('mouseleave', () => { this.hoverKey = null; this.onHover(null); });
      this.resize();
      this.last = performance.now();
      // Resolves true once a few frames have been drawn with data in place,
      // false if the renderer gave up (3D load failure).
      this.ready = new Promise((ok) => (this.markReady = ok));
      this.framesShown = 0;
      const loop = (t) => { if (this.dead) return; this.frame(t); this.raf = requestAnimationFrame(loop); };
      this.raf = requestAnimationFrame(loop);
    }

    destroy() {
      this.dead = true;
      cancelAnimationFrame(this.raf);
      this.ro.disconnect();
      this.theme.removeEventListener('change', this.onTheme);
      this.canvas.remove();
    }

    // ------------------------------------------------------------ floor plan

    buildPlan(nWorking) {
      const pal = this.pal;
      const pods = Math.max(2, Math.ceil((nWorking + 2) / 4));
      const podCols = pods <= 4 ? 2 : 3;
      const podRows = Math.ceil(pods / podCols);
      // Two columns (custom layout: the left gym / Switch room / movie room
      // column is removed): the open office with the desks on the left,
      // meeting room / pantry / lounge on the right.
      const CW = 1.6, CY = 9.6, MY = CY + CW;      // door position; minimum depth
      const OX = 0;                                // open office starts here
      const OW = OX + 1.3 + (podCols - 1) * 4.2 + 3.9; // open office right edge
      const TS = 3.2;                              // games strip along the back wall
      const FS = 2.8;                              // vending / phone booth strip at the front
      const blockH = (podRows - 1) * 4.7 + 3.4;    // pods, seat to seat
      const D = Math.max(MY + 5.6, TS + blockH + FS + 1.0);
      const spare = D - TS - blockH - FS;
      const P0 = TS + spare / 2 + 0.85;            // first pod row: desks centred
      const FY = D - FS;
      const OD = FY;                               // open office depth (kept for callers)
      const RW = 7.2;                              // right column width
      const RX = OW + RW;                          // right edge of meeting room / pantry / lounge
      const GW = 5.6;                              // GPU compute room width
      const W = RX + GW;
      const MR = 5.2;                              // meeting room depth
      const PY = 9.9;                              // pantry / lounge boundary
      const grid = new Grid(W, D);
      const items = [];
      const pois = [];
      const desks = [];
      const add = (depth, draw) => items.push({ depth, draw });
      // Semantic list of what is where, for renderers that don't use the 2D
      // draw closures (the 3D view).
      const props = [];
      const prop = (t, o) => props.push({ t, ...o });
      const solid = (x, y, w, d, pad) => grid.block(x, y, w, d, pad);
      const poi = (x, y, act, face, opt = {}) => pois.push({ x, y, act, face, sit: 0, ...opt });

      // Long boxes are split into ~1 tile pieces so depth sorting against
      // people stays right along their length. `extra(x0, x1)` draws things on
      // the front face of each piece (books on a shelf, etc).
      const longBox = (x, y, z, w, d, h, top, left, right, opts = {}) => {
        const n = Math.max(1, Math.ceil(Math.max(w, d) / 0.9));
        for (let k = 0; k < n; k++) {
          const sx = w >= d ? x + (w / n) * k : x, sy = w >= d ? y : y + (d / n) * k;
          const sw = w >= d ? w / n : w, sd = w >= d ? d : d / n;
          add(sx + sw / 2 + sy + sd / 2 + (opts.bias || 0), () => {
            this.box(sx, sy, z, sw, sd, h, top, left, right);
            if (opts.extra) opts.extra(sx, sx + sw);
          });
        }
      };

      // ---- cubicle pods: 4 desks back to back with a divider
      for (let p = 0; p < pods; p++) {
        const c = p % podCols, r = Math.floor(p / podCols);
        const px = OX + 1.3 + c * 4.2, py = P0 + r * 4.7;
        const panel = PANEL[p % PANEL.length];
        for (let k = 0; k < 2; k++) {
          const x = px + k * 1.5;
          desks.push({ x, y: py, side: 'n', seat: { x: x + 0.7, y: py - 0.45 } });
          desks.push({ x, y: py + 0.92, side: 's', seat: { x: x + 0.7, y: py + 0.92 + 1.25 } });
          solid(x, py, 1.4, 0.8, 0.08);
          solid(x, py + 0.92, 1.4, 0.8, 0.08);
        }
        longBox(px - 0.1, py + 0.82, 0, 3.15, 0.08, 1.15, this.shade(panel, 25), panel, this.shade(panel, -15), { bias: 0.05 });
        prop('panel', { x: px - 0.1, y: py + 0.82, w: 3.15, d: 0.08, h: 1.15, color: panel });
        prop('panel', { x: px - 0.18, y: py - 0.05, w: 0.08, d: 1.82, h: 1.15, color: panel });
        add(px - 0.1 + py + 0.86, () => this.box(px - 0.18, py - 0.05, 0, 0.08, 1.82, 1.15, this.shade(panel, 25), panel, this.shade(panel, -15)));
        solid(px - 0.18, py + 0.8, 3.25, 0.12, 0.05);
      }

      // ---- open office extras
      const rx = OW - 1.15;
      add(rx + 0.35 + 0.5, () => this.serverRack(rx, 0.2));
      prop('rack', { x: rx, y: 0.2 });
      prop('printer', { x: OW - 2.3, y: 0.25 });
      solid(rx, 0.2, 0.7, 0.6);
      add(OW - 2.3 + 0.3 + 0.5, () => this.printer(OW - 2.3, 0.25));
      solid(OW - 2.3, 0.25, 0.75, 0.55);
      for (const [x, y] of [[OX + 0.45, 0.45], [OX + 0.45, FY - 0.4]]) { add(x + y, () => this.plant(x, y)); prop('plant', { x, y }); solid(x - 0.2, y - 0.2, 0.4, 0.4); }
      const windows = [];
      const press = { x0: OX + 1.5, x1: OX + 6.7, y0: 0, y1: TS - 0.2 }; // press backdrop on the back wall
      for (let x = OX + 1.0; x < OW - 2.6; x += 2.4) {
        if (x + 1.5 > press.x0 - 0.1 && x < press.x1 + 0.1) continue; // no window behind the backdrop
        windows.push(x);
        poi(x + 0.75, 0.75, 'window', 'back');
      }
      poi(OX + 0.95, FY - 0.4, 'plant', 'back');

      // ---- press area along the back wall: step-and-repeat backdrop,
      // a podium with microphones, two softbox lights and a camera on a tripod
      const pp = null; // (was the ping-pong table)
      {
        const cx = (press.x0 + press.x1) / 2;
        prop('pressBackdrop', { x0: press.x0, x1: press.x1 });
        prop('pressCarpet', { x: press.x0 + 0.3, y: 0.25, w: press.x1 - press.x0 - 0.6, d: 2.0 });
        add(cx + 1.25, () => this.podium(cx - 0.35, 0.95));
        prop('podium', { x: cx - 0.35, y: 0.95 });
        solid(cx - 0.35, 0.95, 0.7, 0.5, 0.05);
        poi(cx, 0.6, 'interview', 'front', { emoji: '🎤', anim: 'interact-right' });
        poi(press.x0 + 0.9, 0.75, 'interview', 'front', { emoji: '🎤' });
        poi(press.x1 - 0.9, 0.75, 'interview', 'front', { emoji: '🎤' });
        for (const lx of [press.x0 + 0.35, press.x1 - 0.65]) {
          add(lx + 0.15 + 1.95, () => this.softbox(lx, 1.8, lx < cx ? 1 : -1));
          prop('softbox', { x: lx, y: 1.8, side: lx < cx ? 1 : -1 });
          solid(lx, 1.8, 0.3, 0.3, 0.05);
        }
        add(cx + 0.2 + 2.75, () => this.tripodCamera(cx - 0.2, 2.55));
        prop('tripodCamera', { x: cx - 0.2, y: 2.55 });
        solid(cx - 0.2, 2.55, 0.4, 0.4, 0.05);
        poi(cx + 0.55, 2.85, 'camera', 'back', { emoji: '🎥', anim: 'holding-right' });
      }

      // ---- front strip: vending machines and the phone booth
      {
        const vx = OX + 0.15, vy = FY + 0.6;
        add(vx + 0.38 + vy + 0.4, () => this.vending(vx, vy, '#c0392b'));
        prop('vending', { x: vx, y: vy, color: '#c0392b' });
        prop('vending', { x: vx, y: vy + 0.8, color: '#2f6fb0' });
        add(vx + 0.38 + vy + 1.2, () => this.vending(vx, vy + 0.8, '#2f6fb0'));
        solid(vx - 0.02, vy, 0.75, 1.55);
        poi(vx + 1.18, vy + 0.4, 'vending', 'back');
        poi(vx + 1.18, vy + 1.2, 'vending', 'back');
        const bx = OW - 2.0, by = FY + 0.5;
        this.booth(add, bx, by);
        prop('booth', { x: bx, y: by });
        solid(bx - 0.05, by - 0.05, 1.4, 0.1, 0.03);
        solid(bx - 0.05, by - 0.05, 0.1, 1.4, 0.03);
        solid(bx + 1.25, by - 0.05, 0.1, 1.4, 0.03);
        solid(bx + 0.85, by + 1.25, 0.5, 0.1, 0.03);
        poi(bx + 0.65, by + 0.6, 'phone', 'front', { sit: 0.45 });
        add(OW - 0.45 + D - 0.6, () => this.plant(OW - 0.45, D - 0.6));
        prop('plant', { x: OW - 0.45, y: D - 0.6 });
      }

      // ---- meeting room behind glass, door at y 3.6–4.6
      const mx = OW;
      for (const [y, d] of [[0, 1], [1, 1], [2, 1], [3, 0.6], [4.6, MR - 4.6]]) this.glassX(add, mx, y, d);
      for (let x = mx; x < RX - 0.01; x += 1) this.glassY(add, x, MR, Math.min(1, RX - x));
      prop('glass', { x: mx, y: 0, w: 0, d: 3.6 });
      prop('glass', { x: mx, y: 4.6, w: 0, d: MR - 4.6 });
      prop('glass', { x: mx, y: MR, w: RW, d: 0 });
      solid(mx - 0.05, 0, 0.1, 3.6, 0.05);
      solid(mx - 0.05, 4.6, 0.1, MR - 4.6, 0.05);
      solid(mx, MR - 0.05, RW, 0.1, 0.05);
      const mtx = mx + 1.6, mty = 1.7;
      add(mtx + 1.5 + mty + 0.7, () => this.meetingTable(mtx, mty));
      prop('meetingTable', { x: mtx, y: mty, w: 3.0, d: 1.4 });
      solid(mtx, mty, 3.0, 1.4);
      for (let k = 0; k < 3; k++) {
        const cx = mtx + 0.5 + k * 1.0;
        add(cx + mty - 0.45, () => this.rollingChair(cx, mty - 0.4, 'front'));
        add(cx + mty + 1.78, () => this.rollingChair(cx, mty + 1.8, 'back'));
        poi(cx, mty - 0.4, 'meeting', 'front', { sit: 0.42 });
        prop('chair', { x: cx, y: mty - 0.4, face: 'front' });
        prop('chair', { x: cx, y: mty + 1.8, face: 'back' });
        poi(cx, mty + 1.8, 'meeting', 'back', { sit: 0.42 });
      }
      poi(mx + 3.6, 0.65, 'whiteboard', 'back');
      add(RX - 0.45 + 0.45, () => this.plant(RX - 0.45, 0.45));
      prop('plant', { x: RX - 0.45, y: 0.45 });
      solid(RX - 0.65, 0.25, 0.4, 0.4);

      // ---- pantry
      const cy = MR + 0.3;
      longBox(mx + 1.0, cy, 0, RW - 2.3, 0.7, 0.9, pal.counter, pal.counterL, pal.counterR, { bias: -0.5 });
      solid(mx + 1.0, cy, RW - 2.3, 0.7);
      prop('counter', { x: mx + 1.0, y: cy, w: RW - 2.3, d: 0.7 });
      prop('coffee', { x: mx + 2.4, y: cy + 0.12 });
      prop('sink', { x: mx + 3.9, y: cy + 0.12 });
      prop('fridge', { x: RX - 1.15, y: cy });
      prop('cooler', { x: mx + 0.35, y: cy + 0.05 });
      add(mx + 2.65 + cy + 0.35, () => this.coffeeMachine(mx + 2.4, cy + 0.12));
      add(mx + 4.15 + cy + 0.35, () => this.sink(mx + 3.9, cy + 0.12));
      add(RX - 0.75 + cy + 0.4, () => this.fridge(RX - 1.15, cy));
      solid(RX - 1.15, cy, 0.85, 0.75);
      add(mx + 0.55 + cy + 0.25, () => this.waterCooler(mx + 0.35, cy + 0.05));
      solid(mx + 0.3, cy, 0.5, 0.5);
      poi(mx + 2.65, cy + 1.2, 'coffee', 'back');
      poi(mx + 4.15, cy + 1.2, 'sink', 'back');
      poi(RX - 0.75, cy + 1.3, 'fridge', 'back');
      poi(mx + 0.6, cy + 0.95, 'water', 'back');
      const rtx = mx + 3.6, rty = MR + 2.9;
      add(rtx + rty, () => this.roundTable(rtx, rty));
      prop('roundTable', { x: rtx, y: rty });
      solid(rtx - 0.45, rty - 0.45, 0.9, 0.9);
      for (const [sx, sy, face] of [[rtx - 1.0, rty, 'front'], [rtx + 1.0, rty, 'front'], [rtx, rty + 1.0, 'back'], [rtx, rty - 0.95, 'front']]) {
        add(sx + sy - 0.02, () => this.stool(sx, sy, 0.45, '#c9a24c'));
        poi(sx, sy, 'stool', face, { sit: 0.47 });
        prop('barStool', { x: sx, y: sy });
      }

      // ---- lounge
      const lx = mx + 0.6, ly = PY + 0.4;
      const shelfX = mx + 3.4, shelfW = RW - 3.6;
      longBox(shelfX, PY - 0.25, 0, shelfW, 0.45, 1.45, pal.walnut, pal.walnutL, pal.walnutR, {
        extra: (x0, x1) => { this.grain(x0, x1, PY + 0.2, 1.45); this.books(x0, x1, PY + 0.2); },
      });
      solid(shelfX, PY - 0.25, shelfW, 0.45);
      prop('shelf', { x: shelfX, y: PY - 0.25, w: shelfW, d: 0.45 });
      poi(mx + 4.6, PY + 0.75, 'read', 'back');
      poi(mx + 5.8, PY + 0.75, 'read', 'back');
      add(lx + ly + 0.6, () => this.couch(lx, ly + 0.6));
      prop('couch', { x: lx, y: ly + 0.6, w: 2.8, d: 0.8 });
      prop('coffeeTable', { x: lx + 0.6, y: ly + 2.0, w: 1.6, d: 0.7 });
      prop('beanbag', { x: lx + 0.4, y: ly + 3.6, color: '#c96442' });
      prop('beanbag', { x: lx + 2.6, y: ly + 3.6, color: '#7d93c4' });
      solid(lx, ly + 0.6, 2.8, 0.8);
      for (let k = 0; k < 3; k++) poi(lx + 0.5 + k * 0.9, ly + 1.2, 'couch', 'front', { sit: 0.36 });
      add(lx + 1.4 + ly + 2.35, () => this.coffeeTable(lx + 0.6, ly + 2.0));
      solid(lx + 0.6, ly + 2.0, 1.6, 0.7);
      add(lx + 0.4 + ly + 3.6, () => this.beanbag(lx + 0.4, ly + 3.6, '#c96442'));
      add(lx + 2.6 + ly + 3.6, () => this.beanbag(lx + 2.6, ly + 3.6, '#7d93c4'));
      poi(lx + 0.4, ly + 3.6, 'beanbag', 'front', { sit: 0.18 });
      poi(lx + 2.6, ly + 3.6, 'beanbag', 'front', { sit: 0.18 });
      const ax = RX - 1.2, ay = ly + 1.0;
      add(ax + 0.35 + ay + 0.35, () => this.arcade(ax, ay));
      prop('arcade', { x: ax, y: ay });
      prop('plant', { x: RX - 0.5, y: D - 0.5 });
      prop('lamp', { x: lx - 0.2, y: D - 0.6 });
      prop('rug', { x: OW + 0.3, y: PY + 0.6, w: 4.0, d: D - PY - 1.0 });
      solid(ax, ay, 0.7, 0.7);
      poi(ax + 0.35, ay + 1.15, 'arcade', 'back');
      add(RX - 0.5 + D - 0.5, () => this.plant(RX - 0.5, D - 0.5));

      // ---- GPU compute room: glass wall with a door from the pantry side,
      // two rows of GPU racks facing a cold aisle, cable trays overhead
      const gdoor = MR + 1.2;                      // door 1 m wide
      for (let y = 0; y < gdoor - 0.01; y += 1) this.glassX(add, RX, y, Math.min(1, gdoor - y));
      for (let y = gdoor + 1.0; y < D - 0.01; y += 1) this.glassX(add, RX, y, Math.min(1, D - y));
      prop('glass', { x: RX, y: 0, w: 0, d: gdoor });
      prop('glass', { x: RX, y: gdoor + 1.0, w: 0, d: D - gdoor - 1.0 });
      solid(RX - 0.05, 0, 0.1, gdoor, 0.05);
      solid(RX - 0.05, gdoor + 1.0, 0.1, D - gdoor - 1.0, 0.05);
      const rackW = 0.62, rackD = 1.0;
      const rows = [{ x: RX + 0.45, face: 'e' }, { x: W - 0.45 - rackD, face: 'w' }];
      const aisleX = (rows[0].x + rackD + rows[1].x) / 2;
      const r0 = 0.5, r1 = D - 0.9;
      const nRacks = Math.floor((r1 - r0) / rackW);
      for (const row of rows) {
        for (let k = 0; k < nRacks; k++) {
          const ry = r0 + k * rackW;
          add(row.x + rackD / 2 + ry + rackW / 2, () => this.gpuRack(row.x, ry, rackD, rackW, row.face, k));
          prop('gpuRack', { x: row.x, y: ry, w: rackD, d: rackW, face: row.face, k });
        }
        solid(row.x, r0, rackD, nRacks * rackW);
        prop('cableTray', { x: row.x, y: r0, w: rackD, d: nRacks * rackW });
      }
      for (let k = 1; k < 4; k++) poi(aisleX, r0 + (r1 - r0) * k / 4, 'gpu', k % 2 ? 'side' : 'back', { emoji: '⚡' });
      add(lx - 0.2 + D - 0.6, () => this.floorLamp(lx - 0.2, D - 0.6));

      const posters = [];
      const rooms = null;
      return { press, W, D, OW, OD, MR, PY, RW, RX, gpu: { x: RX, w: GW, aisleX, door: gdoor }, grid, items, props, pois, desks, windows, posters, pp, rooms, door: { x: 0.4, y: CY + CW / 2 } };
    }

    glassX(add, x, y, d) {
      add(x + y + d / 2 + 0.02, () => {
        const P = (a, b, c) => this.iso(a, b, c);
        this.poly([P(x, y, 0), P(x, y + d, 0), P(x, y + d, 0.22), P(x, y, 0.22)], this.pal.trim);
        this.poly([P(x, y, 0.22), P(x, y + d, 0.22), P(x, y + d, 2.1), P(x, y, 2.1)], this.pal.glass, this.pal.glassEdge);
      });
    }

    glassY(add, x, y, w) {
      add(x + w / 2 + y + 0.02, () => {
        const P = (a, b, c) => this.iso(a, b, c);
        this.poly([P(x, y, 0), P(x + w, y, 0), P(x + w, y, 0.22), P(x, y, 0.22)], this.pal.trim);
        this.poly([P(x, y, 0.22), P(x + w, y, 0.22), P(x + w, y, 2.1), P(x, y, 2.1)], this.pal.glass, this.pal.glassEdge);
      });
    }

    // ------------------------------------------------------------ sessions → people

    update(sessions) {
      const working = sessions.filter((s) => WORKING.has(s.status));
      const off = sessions
        .filter((s) => !WORKING.has(s.status))
        .sort((a, b) => (b.lastEventAt || 0) - (a.lastEventAt || 0));
      const wanderers = off.slice(0, MAX_WANDERERS);
      this.offDuty = off.length - wanderers.length;

      const cap = this.plan.desks.length;
      // Scene packs have a fixed floor plan; the built-in office grows with the team.
      if (!this.plan.fixed && (working.length > cap - 1 || (cap > 8 && working.length < cap * 0.35))) {
        this.plan = this.buildPlan(working.length);
        this.deskOf.clear();
        for (const p of this.people.values()) { p.poi = null; p.napDesk = null; p.desk = null; p.until = 0; }
      }

      const workKeys = new Set(working.map((s) => s.key));
      for (const k of [...this.deskOf.keys()]) if (!workKeys.has(k)) this.deskOf.delete(k);
      const used = new Set(this.deskOf.values());
      // Fill the desks that face us first so more faces and screens show.
      const desks = this.plan.desks;
      const order = desks.map((d, i) => i).sort((a, b) => (desks[a].side === 's') - (desks[b].side === 's') || a - b);
      for (const s of [...working].sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0))) {
        if (this.deskOf.has(s.key)) continue;
        const i = order.find((n) => !used.has(n));
        if (i == null) continue;
        this.deskOf.set(s.key, i);
        used.add(i);
      }
      const takenDesks = new Set([...this.deskOf.values()].map((i) => desks[i]));

      const shown = new Set();
      for (const s of [...working, ...wanderers]) {
        const isWorker = this.deskOf.has(s.key);
        if (!isWorker && WORKING.has(s.status)) continue; // no desk left
        shown.add(s.key);
        let p = this.people.get(s.key);
        if (!p) { p = this.newPerson(s); this.people.set(s.key, p); }
        p.s = s;
        p.leaving = false;
        if (isWorker) {
          this.release(p);
          const desk = desks[this.deskOf.get(s.key)];
          if (p.desk !== desk || p.mode !== 'work') { p.desk = desk; this.goTo(p, desk.seat); }
          p.mode = 'work';
        } else {
          if (p.mode !== 'wander') { p.mode = 'wander'; p.desk = null; p.poi = null; p.until = 0; }
          // Someone started working at the desk this one was napping on.
          if (p.napDesk && takenDesks.has(p.napDesk)) { this.release(p); p.path = []; }
        }
      }
      for (const [k, p] of this.people) {
        if (!shown.has(k) && !p.leaving) {
          p.leaving = true;
          p.mode = 'leave';
          this.release(p);
          p.desk = null;
          this.goTo(p, this.plan.door);
        }
      }
      this.first = false;
    }

    release(p) {
      if (p.poi) { p.poi.taken = null; p.poi = null; }
      if (p.napDesk) { p.napDesk.napper = null; p.napDesk = null; }
    }

    newPerson(s) {
      const h = hash(s.key);
      const door = this.plan.door;
      // Custom outfit from the resident's team.json ("look"); everyone else
      // gets a black-and-white outfit picked from their hash.
      const look = s.look && typeof s.look === 'object' ? s.look : bwLook(h);
      const lk = (k, fb) => (look && typeof look[k] === 'string' && /^#[0-9a-f]{3,8}$/i.test(look[k]) ? look[k] : fb);
      return {
        key: s.key, h, s, look,
        skin: lk('skin', pick(SKIN, h, 3)), hair: lk('hair', pick(HAIR, h, 7)), pants: lk('pants', pick(PANTS, h, 13)),
        shirt: lk('jacket', pick(SHIRT[s.agent] || SHIRT.claude, h, 11)),
        hairStyle: look && look.hairStyle in HAIR_STYLE ? HAIR_STYLE[look.hairStyle] : h % 4,
        phase: (h % 1000) / 1000 * Math.PI * 2,
        x: door.x, y: door.y,
        path: [], walkFace: 'front', until: 0, mode: null,
        // On the first snapshot everyone is placed directly, no stampede.
        placeOnArrive: this.first,
      };
    }

    goTo(p, target) {
      if (p.placeOnArrive) {
        p.x = target.x; p.y = target.y; p.path = []; p.placeOnArrive = false;
        return;
      }
      p.path = this.plan.grid.path(p.x, p.y, target.x, target.y);
    }

    wander(p, now) {
      if (p.path.length) return;
      if (p.poi && now < p.until) return;
      this.release(p);
      const plan = this.plan;
      const workingDesks = new Set([...this.deskOf.values()].map((i) => plan.desks[i]));
      const sleepy = p.s.status === 'idle';
      const weighted = [];
      for (const q of plan.pois) {
        if (q.taken) continue;
        let w = 1;
        if (q.pair) w = plan.pois.some((o) => o.pair === q.pair && o !== q && o.taken) ? 7 : 1.2;
        if (q.act === 'couch' || q.act === 'beanbag' || q.sleepy) w = sleepy ? 3 : 1.4;
        weighted.push([q, w]);
      }
      for (const d of plan.noNap ? [] : plan.desks) {
        if (workingDesks.has(d) || d.napper) continue;
        weighted.push([{ x: d.seat.x, y: d.seat.y, act: 'nap', face: d.side === 'n' ? 'front' : 'back', sit: 0.34, desk: d }, sleepy ? 3 : 0.25]);
      }
      if (!weighted.length) return;
      let r = Math.random() * weighted.reduce((a, [, w]) => a + w, 0);
      let choice = weighted[0][0];
      for (const [q, w] of weighted) { r -= w; if (r <= 0) { choice = q; break; } }
      if (choice.desk) { choice.desk.napper = p.key; p.napDesk = choice.desk; }
      choice.taken = p.key;
      p.poi = choice;
      p.until = Infinity; // set on arrival
      p.stay = (choice.act === 'nap' ? rand(25, 60) : choice.act === 'pingpong' ? rand(15, 30) : rand(8, 20)) * 1000;
      this.goTo(p, choice);
    }

    setVisible(v) { this.visible = v; if (v) this.resize(); }

    // Room on the right covered by an overlay (the agent panel). The canvas
    // keeps its size; the view eases over so the room stays centred in what
    // is still visible, instead of the canvas resizing under the slide.
    setInset(px, animate = true) {
      const now = performance.now();
      this.insetFrom = animate ? this.inset(now) : px;
      this.insetTo = px;
      this.insetT0 = animate ? now : -Infinity;
    }
    inset(now = performance.now()) {
      if (this.insetTo == null) return 0;
      const k = Math.min(1, (now - this.insetT0) / 340);
      const e = 1 - Math.pow(1 - k, 3); // ease out, like the panel's slide
      return this.insetFrom + (this.insetTo - this.insetFrom) * e;
    }
    insetMoving(now = performance.now()) { return this.insetTo != null && now - this.insetT0 < 360; }

    // ------------------------------------------------------------ camera / input

    resize() {
      const r = this.root.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.cw = Math.max(this.compact ? 1 : 200, r.width);
      this.ch = Math.max(this.compact ? 1 : 240, r.height);
      this.canvas.width = Math.round(this.cw * dpr);
      this.canvas.height = Math.round(this.ch * dpr);
      this.canvas.style.width = this.cw + 'px';
      this.canvas.style.height = this.ch + 'px';
      this.dpr = dpr;
    }

    fitCamera() {
      const { W, D } = this.plan;
      const left = this.iso(0, D, 0).x, right = this.iso(W, 0, 0).x;
      const top = this.iso(0, 0, WALL_H).y - 20, bottom = this.iso(W, D, 0).y + 10;
      const inset = this.inset();
      const vw = Math.max(120, this.cw - inset);
      const zoom = Math.min(vw / (right - left + 30), this.ch / (bottom - top + 30), 2);
      const want = { zoom, ox: vw / 2 - ((left + right) / 2) * zoom, oy: this.ch / 2 - ((top + bottom) / 2) * zoom };
      // While the inset eases, follow it exactly; otherwise settle gently.
      if (!this.cam || this.insetMoving()) this.cam = want;
      else for (const k of ['zoom', 'ox', 'oy']) this.cam[k] += (want[k] - this.cam[k]) * 0.1;
    }

    pointer(e, click) {
      const r = this.canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      let found = null;
      for (let i = this.hit.length - 1; i >= 0; i--) {
        const h = this.hit[i];
        if (mx >= h.x0 && mx <= h.x1 && my >= h.y0 && my <= h.y1) { found = h; break; }
      }
      const key = found ? found.key : null;
      this.canvas.style.cursor = key ? 'pointer' : 'default';
      if (key !== this.hoverKey || click) {
        this.hoverKey = key;
        const p = key && this.people.get(key);
        this.onHover(p ? p.s : null, { x: e.clientX, y: e.clientY }, !!click);
      }
    }

    iso(x, y, z = 0) {
      return { x: (x - y) * TW / 2, y: (x + y) * TH / 2 - z * TH };
    }

    // ------------------------------------------------------------ primitives

    poly(pts, fill, stroke) {
      const c = this.ctx;
      c.beginPath();
      pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
    }

    box(x, y, z, w, d, h, top, left, right) {
      const P = (a, b, cc) => this.iso(a, b, cc);
      this.poly([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], left);
      this.poly([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], right);
      this.poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], top);
    }

    shade(color, amt) {
      if (color[0] !== '#') return color;
      const n = parseInt(color.slice(1), 16);
      const f = (v) => clamp(Math.round(v + amt), 0, 255);
      return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
    }

    roundRect(x, y, w, h, r, fill, stroke) {
      const c = this.ctx;
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.5; c.stroke(); }
    }

    // Draw flat things on a wall: 'y0' = back wall (runs along x),
    // 'x0' = left wall (runs along y).
    onWall(dir, a, z, fn) {
      const c = this.ctx;
      const o = dir === 'y0' ? this.iso(a, 0, z) : this.iso(0, a, z);
      c.save();
      c.translate(o.x, o.y);
      c.transform(1, dir === 'y0' ? 0.5 : -0.5, 0, 1, 0, 0);
      fn(c);
      c.restore();
    }

    // ------------------------------------------------------------ room shell

    drawRoom() {
      const { D, OW, MR, PY, pp } = this.plan;
      const W = this.plan.RX || this.plan.W; // right column ends here; the GPU room follows
      const pal = this.pal;
      const P = (x, y, z) => this.iso(x, y, z);
      const t = this.t / 1000;

      // floors: wood office, carpet meeting room, tiled pantry, wood lounge
      for (let x = 0; x < Math.ceil(OW); x++) {
        for (let y = 0; y < Math.ceil(D); y++) {
          const x1 = Math.min(OW, x + 1), y1 = Math.min(D, y + 1);
          this.poly([P(x, y), P(x1, y), P(x1, y1), P(x, y1)], (x + y) % 2 ? pal.paint1 : pal.paint2);
        }
      }
      // painted (epoxy) floor: seamless, with a soft sheen instead of planks
      for (let k = 0; k < 3; k++) {
        const y0 = D * (0.18 + k * 0.3);
        this.poly([P(0, y0), P(OW, y0 - 0.6), P(OW, y0 + 0.2), P(0, y0 + 0.8)], pal.paintSheen);
      }
      const rm = this.plan.rooms;
      if (rm) {
        // rubber gym floor, carpet in the Switch and movie rooms
        this.poly([P(0, 0), P(rm.LW, 0), P(rm.LW, rm.GD), P(0, rm.GD)], pal.gymFloor);
        for (let x = 1; x < rm.LW; x++) this.poly([P(x, 0), P(x + 0.02, 0), P(x + 0.02, rm.GD), P(x, rm.GD)], pal.carpetLine);
        this.poly([P(0, rm.SY), P(rm.LW, rm.SY), P(rm.LW, rm.CY), P(0, rm.CY)], pal.gameFloor);
        this.poly([P(1.0, rm.SY + 0.9), P(3.4, rm.SY + 0.9), P(3.4, rm.SY + 3.5), P(1.0, rm.SY + 3.5)], pal.rug, pal.rugEdge);
        this.poly([P(0, rm.MY), P(rm.LW, rm.MY), P(rm.LW, D), P(0, D)], pal.movieFloor);
      }
      this.poly([P(OW, 0), P(W, 0), P(W, MR), P(OW, MR)], pal.carpet);
      for (let x = OW + 0.5; x < W; x += 0.5) this.poly([P(x, 0), P(x + 0.015, 0), P(x + 0.015, MR), P(x, MR)], pal.carpetLine);
      for (let i = 0; i < Math.ceil((W - OW) * 2); i++) {
        for (let j = 0; j < Math.ceil((PY - MR) * 2); j++) {
          const x = OW + i / 2, y = MR + j / 2;
          const x1 = Math.min(W, x + 0.5), y1 = Math.min(PY, y + 0.5);
          this.poly([P(x, y), P(x1, y), P(x1, y1), P(x, y1)], (i + j) % 2 ? pal.tileA : pal.tileB);
        }
      }
      for (let x = Math.floor(OW); x < W; x++) {
        for (let y = PY; y < D; y++) {
          const x0 = Math.max(OW, x), x1 = Math.min(W, x + 1), y1 = Math.min(D, y + 1);
          this.poly([P(x0, y), P(x1, y), P(x1, y1), P(x0, y1)], (x + Math.floor(y)) % 2 ? pal.paint1 : pal.paint2);
        }
      }
      this.poly([P(OW + 0.3, PY + 0.6), P(OW + 4.3, PY + 0.6), P(OW + 4.3, D - 0.4), P(OW + 0.3, D - 0.4)], pal.rug);
      this.poly([P(OW + 0.5, PY + 0.8), P(OW + 4.1, PY + 0.8), P(OW + 4.1, D - 0.6), P(OW + 0.5, D - 0.6)], null, pal.rugEdge);
      if (pp) this.poly([P(pp.x0 - 0.6, pp.y - 1.4), P(pp.x1 + 0.6, pp.y - 1.4), P(pp.x1 + 0.6, pp.y + 1.3), P(pp.x0 - 0.6, pp.y + 1.3)], pal.mat);
      const pr = this.plan.press;
      if (pr) this.poly([P(pr.x0 + 0.3, 0.25), P(pr.x1 - 0.3, 0.25), P(pr.x1 - 0.3, 2.25), P(pr.x0 + 0.3, 2.25)], '#26272b', '#3a3b40');

      // walls
      const g = this.plan.gpu;
      if (g) {
        // raised floor: light grey panels, perforated tiles along the aisle
        const WW = g.x + g.w;
        for (let x = g.x; x < WW - 0.01; x += 0.6) {
          for (let y = 0; y < D - 0.01; y += 0.6) {
            const x1 = Math.min(WW, x + 0.6), y1 = Math.min(D, y + 0.6);
            const perf = Math.abs(x + 0.3 - g.aisleX) < 0.6;
            this.poly([P(x, y), P(x1, y), P(x1, y1), P(x, y1)], perf ? pal.raisedPerf : pal.raised, pal.raisedLine);
          }
        }
      }
      const WT = this.plan.W; // the back wall runs past the GPU room
      this.poly([P(0, 0, 0), P(WT, 0, 0), P(WT, 0, WALL_H), P(0, 0, WALL_H)], pal.wallL);
      this.poly([P(0, 0, 0), P(0, D, 0), P(0, D, WALL_H), P(0, 0, WALL_H)], pal.wallR);
      this.poly([P(0, 0, WALL_H), P(WT, 0, WALL_H), P(WT, -0.15, WALL_H), P(-0.15, -0.15, WALL_H), P(-0.15, D, WALL_H), P(0, D, WALL_H)], pal.wallTop);
      this.poly([P(0, 0, 0), P(WT, 0, 0), P(WT, 0, 0.12), P(0, 0, 0.12)], pal.trim);
      this.poly([P(0, 0, 0), P(0, D, 0), P(0, D, 0.12), P(0, 0, 0.12)], pal.trim);

      // press backdrop: step-and-repeat banner mounted on the back wall
      if (this.plan.press) {
        const { x0, x1 } = this.plan.press;
        this.poly([P(x0, 0.02, 0.1), P(x1, 0.02, 0.1), P(x1, 0.02, 2.25), P(x0, 0.02, 2.25)], '#f6f5f1', '#1c1c1e');
        this.poly([P(x0, 0.03, 0.1), P(x1, 0.03, 0.1), P(x1, 0.03, 0.2), P(x0, 0.03, 0.2)], '#1c1c1e');
        let r = 0;
        for (let z = 2.0; z > 0.35; z -= 0.36, r++) {
          for (let x = x0 + 0.3 + (r % 2) * 0.4; x < x1 - 0.2; x += 0.8) {
            const star = (Math.round((x - x0) / 0.8) + r) % 2 === 0;
            this.onWall('y0', x, z, (c) => {
              if (star) {
                c.strokeStyle = '#c96442'; c.lineWidth = 1.6; c.lineCap = 'round';
                for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI; c.beginPath(); c.moveTo(Math.cos(a) * 4, Math.sin(a) * 4); c.lineTo(-Math.cos(a) * 4, -Math.sin(a) * 4); c.stroke(); }
              } else {
                c.font = '800 4.5px ui-sans-serif, system-ui, sans-serif'; c.fillStyle = '#1c1c1e'; c.textAlign = 'center'; c.textBaseline = 'middle';
                c.fillText('AGENT OFFICE', 0, 0);
              }
            });
          }
        }
      }

      // windows with the real sky outside
      const sky = skyColor();
      for (const x of this.plan.windows) {
        this.poly([P(x, 0, 0.85), P(x + 1.5, 0, 0.85), P(x + 1.5, 0, 2.0), P(x, 0, 2.0)], sky.sky);
        if (sky.night) {
          this.onWall('y0', x + 0.3, 1.75, (c) => { c.fillStyle = '#f4f1d0'; c.beginPath(); c.arc(0, 0, 3, 0, Math.PI * 2); c.fill(); });
          this.onWall('y0', x + 1.1, 1.55, (c) => { c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(0, 0, 1.5, 1.5); });
        } else {
          const cx = x + 0.25 + ((t * 0.02 + x * 0.37) % 1) * 1.0;
          this.onWall('y0', cx, 1.65, (c) => {
            c.fillStyle = 'rgba(255,255,255,.85)';
            c.beginPath(); c.ellipse(0, 0, 7, 3, 0, 0, Math.PI * 2); c.ellipse(5, -2, 5, 3, 0, 0, Math.PI * 2); c.fill();
          });
        }
        this.poly([P(x + 0.74, 0, 0.85), P(x + 0.76, 0, 0.85), P(x + 0.76, 0, 2.0), P(x + 0.74, 0, 2.0)], pal.trim);
        this.poly([P(x, 0, 0.85), P(x + 1.5, 0, 0.85), P(x + 1.5, 0, 0.9), P(x, 0, 0.9)], pal.trim);
        this.poly([P(x, 0.05), P(x + 1.5, 0.05), P(x + 1.95, 1.2), P(x + 0.45, 1.2)], sky.night ? 'rgba(120,140,200,.06)' : 'rgba(255,250,230,.16)');
      }
      // meeting room whiteboard + sign
      const wx = OW + 2.4;
      this.poly([P(wx, 0, 0.8), P(wx + 2.6, 0, 0.8), P(wx + 2.6, 0, 1.95), P(wx, 0, 1.95)], '#fdfdfb', pal.trim);
      this.onWall('y0', wx + 0.25, 1.75, (c) => {
        c.lineWidth = 1.4;
        c.strokeStyle = '#3b8ee0';
        c.beginPath(); c.moveTo(0, 0); c.lineTo(22, 0); c.moveTo(0, 7); c.lineTo(36, 7); c.stroke();
        c.strokeStyle = '#c96442';
        c.strokeRect(46, -2, 20, 12); c.strokeRect(80, 6, 20, 12);
        c.beginPath(); c.moveTo(66, 4); c.lineTo(80, 12); c.stroke();
        c.strokeStyle = '#5f9a4c';
        c.beginPath(); c.moveTo(0, 22); for (let i = 0; i < 8; i++) c.lineTo(i * 8, 22 - ((i * 37) % 13)); c.stroke();
      });
      this.onWall('y0', OW + 0.5, 2.2, (c) => {
        c.font = '700 9px ui-sans-serif, system-ui, sans-serif'; c.fillStyle = this.shade(pal.trim, -60); c.fillText('MEETING', 0, 0);
      });
      if (rm) {
        // gym: sign on the back wall, mirror on the left wall
        this.onWall('y0', 5.2, 2.2, (c) => {
          c.font = '700 9px ui-sans-serif, system-ui, sans-serif'; c.fillStyle = this.shade(pal.trim, -60); c.fillText('GYM', 0, 0);
        });
        this.poly([P(0, 2.5, 0.25), P(0, 4.7, 0.25), P(0, 4.7, 1.9), P(0, 2.5, 1.9)], pal.dark ? '#5d7387' : '#cfe0ec', pal.trim);
        this.poly([P(0, 2.9, 0.4), P(0, 3.3, 0.4), P(0, 3.7, 1.8), P(0, 3.3, 1.8)], 'rgba(255,255,255,.25)');
        // movie screen, flickering with the film
        const glow = 0.85 + 0.15 * Math.sin(t * 2.3) * Math.sin(t * 0.7);
        const sy0 = rm.MY + 0.5, sy1 = D - 0.5;
        this.poly([P(0, sy0 - 0.06, 0.44), P(0, sy1 + 0.06, 0.44), P(0, sy1 + 0.06, 2.16), P(0, sy0 - 0.06, 2.16)], '#18181a');
        this.poly([P(0, sy0, 0.5), P(0, sy1, 0.5), P(0, sy1, 2.1), P(0, sy0, 2.1)], `rgba(${Math.round(200 * glow)},${Math.round(220 * glow)},255,1)`);
      }
      // left wall: posters, clock, door
      for (const ps of this.plan.posters) {
        this.poly([P(0, ps.y, 0.95), P(0, ps.y + 0.9, 0.95), P(0, ps.y + 0.9, 1.95), P(0, ps.y, 1.95)], ps.color);
        this.onWall('x0', ps.y + 0.45, 1.4, (c) => {
          c.font = '800 8px ui-sans-serif, system-ui, sans-serif'; c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(ps.text, 0, 0);
        });
      }
      this.onWall('x0', 1.0, 1.85, (c) => {
        c.beginPath(); c.arc(0, 0, 11, 0, Math.PI * 2); c.fillStyle = pal.bubble; c.fill();
        c.lineWidth = 2; c.strokeStyle = pal.trim; c.stroke();
        const d = new Date();
        const hand = (ang, len, w) => { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.sin(ang) * len, -Math.cos(ang) * len); c.lineWidth = w; c.strokeStyle = pal.bubbleInk; c.stroke(); };
        hand(((d.getHours() % 12) + d.getMinutes() / 60) / 12 * Math.PI * 2, 5.5, 2);
        hand((d.getMinutes() / 60) * Math.PI * 2, 8, 1.4);
      });
      const dy = this.plan.door.y;
      this.poly([P(0, dy - 0.6, 0), P(0, dy + 0.6, 0), P(0, dy + 0.6, 1.8), P(0, dy - 0.6, 1.8)], pal.trim);
      this.poly([P(0, dy - 0.52, 0), P(0, dy + 0.52, 0), P(0, dy + 0.52, 1.72), P(0, dy - 0.52, 1.72)], this.shade(pal.deskL, -10));
      this.onWall('x0', dy - 0.25, 0.85, (c) => { c.fillStyle = '#d8c48a'; c.beginPath(); c.arc(0, 0, 1.8, 0, Math.PI * 2); c.fill(); });
      this.poly([P(0.05, dy - 0.6), P(0.9, dy - 0.6), P(0.9, dy + 0.6), P(0.05, dy + 0.6)], pal.dark ? '#5a3b2e' : '#b9654a');
    }

    // ------------------------------------------------------------ furniture

    plant(x, y) {
      const pal = this.pal;
      this.box(x - 0.18, y - 0.18, 0, 0.36, 0.36, 0.3, this.shade(pal.pot, 10), pal.pot, this.shade(pal.pot, -15));
      const c = this.ctx;
      const b = this.iso(x, y, 0.3);
      const sway = Math.sin(this.t / 1400 + x) * 0.05;
      c.fillStyle = pal.plant;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        c.beginPath();
        c.ellipse(b.x + Math.cos(a) * 6, b.y - 13 + Math.sin(a) * 3, 5.5, 13, a / 3 + sway, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = this.shade(pal.plant, 22);
      c.beginPath(); c.ellipse(b.x, b.y - 20, 5, 10, sway, 0, Math.PI * 2); c.fill();
    }

    // A rack packed with GPU servers. face 'e': front (GPU sleds) toward +x;
    // 'w': front toward -x, so the visible +x side is the back (cables).
    gpuRack(x, y, w, d, face, k) {
      const H = 2.05;
      this.box(x, y, 0, w, d, H, '#2a2c30', '#1b1c1f', '#202226');
      const P = (a, b, c) => this.iso(a, b, c);
      const fx = x + w + 0.002;
      const quad = (y0, y1, z0, z1, col) => this.poly([P(fx, y0, z0), P(fx, y1, z0), P(fx, y1, z1), P(fx, y0, z1)], col);
      const t = this.t / 1000;
      const y0 = y + 0.05, y1 = y + d - 0.05;
      if (face === 'e') {
        quad(y0, y1, 0.08, H - 0.08, '#0c0d0f');
        const n = 8;
        for (let i = 0; i < n; i++) {
          const z0 = 0.14 + i * ((H - 0.3) / n), z1 = z0 + (H - 0.3) / n - 0.035;
          quad(y0 + 0.02, y1 - 0.02, z0, z1, '#17191c');
          // cool-blue light line across each GPU sled
          const glow = 0.55 + 0.45 * Math.sin(t * 1.3 + i * 0.7 + k);
          quad(y0 + 0.06, y1 - 0.06, (z0 + z1) / 2 - 0.01, (z0 + z1) / 2 + 0.01, `rgba(80,190,255,${0.45 + glow * 0.45})`);
          // status LEDs
          for (let j = 0; j < 4; j++) {
            const on = Math.sin(t * (3 + j) + i * 1.7 + k * 2.3 + j) > -0.3;
            const ly = y0 + 0.06 + j * 0.05;
            quad(ly, ly + 0.025, z0 + 0.03, z0 + 0.055, on ? '#52f08a' : '#1d3a27');
          }
        }
      } else {
        // rear: cable bundles with silver connectors
        quad(y0, y1, 0.08, H - 0.08, '#101113');
        for (let j = 0; j < 5; j++) {
          const cy = y0 + 0.06 + j * ((y1 - y0 - 0.12) / 4);
          quad(cy - 0.015, cy + 0.015, 0.1, H - 0.1, j % 2 ? '#0a0a0b' : '#1a1c20');
          for (let i = 0; i < 6; i++) {
            const z = 0.25 + i * 0.3;
            quad(cy - 0.022, cy + 0.022, z, z + 0.05, '#b9bfc6');
          }
        }
        const blink = Math.sin(t * 4 + k) > 0;
        quad(y0 + 0.02, y0 + 0.05, H - 0.2, H - 0.17, blink ? '#3b8ee0' : '#16324f');
      }
    }

    // White rolling office chair (meeting room).
    rollingChair(x, y, face) {
      const c = this.ctx, pal = this.pal;
      const base = this.iso(x, y, 0.02);
      c.strokeStyle = '#3a3d42'; c.lineWidth = 1.6;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        const e = this.iso(x + Math.cos(a) * 0.24, y + Math.sin(a) * 0.24, 0.02);
        c.beginPath(); c.moveTo(base.x, base.y); c.lineTo(e.x, e.y); c.stroke();
        c.fillStyle = '#1e1f22'; c.beginPath(); c.arc(e.x, e.y + 1, 1.6, 0, Math.PI * 2); c.fill();
      }
      const top = this.iso(x, y, 0.38);
      c.strokeStyle = '#8d939a'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(base.x, base.y); c.lineTo(top.x, top.y); c.stroke();
      const w = pal.chairWhite;
      this.box(x - 0.22, y - 0.22, 0.38, 0.44, 0.44, 0.07, w, this.shade(w, -22), this.shade(w, -34));
      if (face === 'front') this.box(x - 0.22, y - 0.27, 0.45, 0.44, 0.06, 0.5, w, this.shade(w, -22), this.shade(w, -34));
      else this.box(x - 0.22, y + 0.21, 0.45, 0.44, 0.06, 0.5, w, this.shade(w, -22), this.shade(w, -34));
    }

    serverRack(x, y) {
      this.box(x, y, 0, 0.7, 0.6, 1.9, '#3a3d44', '#24262b', '#1b1d21');
      const c = this.ctx;
      const busy = this.deskOf.size;
      for (let r = 0; r < 7; r++) {
        for (let k = 0; k < 4; k++) {
          const on = Math.sin(this.t / (180 + r * 37 + k * 53) + r * k) > 0.2 && (r * 4 + k) < Math.max(4, busy * 3);
          const p = this.iso(x + 0.12 + k * 0.13, y + 0.6, 1.7 - r * 0.22);
          c.fillStyle = on ? (k % 3 === 0 ? '#ffb347' : '#5cf08a') : '#2f3a33';
          c.fillRect(p.x - 1, p.y - 1, 2.5, 2);
        }
      }
    }

    printer(x, y) {
      const pal = this.pal;
      this.box(x, y, 0, 0.75, 0.55, 0.55, pal.deskTop, pal.deskL, pal.deskR);
      this.box(x + 0.05, y + 0.05, 0.55, 0.65, 0.45, 0.28, '#e8e8e8', '#c8c8c8', '#b3b3b3');
      this.box(x + 0.15, y + 0.35, 0.83, 0.45, 0.15, 0.02, '#ffffff', '#eee', '#ddd');
    }

    pingpong(x, y) {
      for (const [lx, ly] of [[0.1, 0.1], [2.4, 0.1], [0.1, 1.2], [2.4, 1.2]]) this.box(x + lx, y + ly, 0, 0.08, 0.08, 0.7, '#333', '#333', '#222');
      this.box(x, y, 0.7, 2.6, 1.4, 0.06, '#2f7a52', '#245f40', '#1d4f35');
      const P = (a, b, c) => this.iso(a, b, c);
      this.poly([P(x + 0.04, y + 0.69, 0.765), P(x + 2.56, y + 0.69, 0.765), P(x + 2.56, y + 0.71, 0.765), P(x + 0.04, y + 0.71, 0.765)], '#ffffff');
      this.poly([P(x + 1.3, y - 0.05, 0.76), P(x + 1.3, y + 1.45, 0.76), P(x + 1.3, y + 1.45, 0.95), P(x + 1.3, y - 0.05, 0.95)], 'rgba(255,255,255,.55)', '#ddd');
    }

    // Lectern with two microphones on goosenecks and a logo plate.
    podium(x, y) {
      const pal = this.pal;
      this.box(x, y, 0, 0.7, 0.5, 1.05, pal.walnut, pal.walnutL, pal.walnutR);
      this.box(x - 0.05, y - 0.05, 1.05, 0.8, 0.6, 0.05, this.shade(pal.walnut, 12), pal.walnutL, pal.walnutR);
      const P = (a, b, c) => this.iso(a, b, c);
      this.poly([P(x + 0.2, y + 0.5, 0.55), P(x + 0.5, y + 0.5, 0.55), P(x + 0.5, y + 0.5, 0.8), P(x + 0.2, y + 0.5, 0.8)], '#f6f5f1');
      const c = this.ctx;
      const m = this.iso(x + 0.35, y + 0.52, 0.67);
      c.strokeStyle = '#c96442'; c.lineWidth = 1.2;
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI; c.beginPath(); c.moveTo(m.x + Math.cos(a) * 3, m.y + Math.sin(a) * 3); c.lineTo(m.x - Math.cos(a) * 3, m.y - Math.sin(a) * 3); c.stroke(); }
      for (const dx of [0.25, 0.45]) {
        const b = this.iso(x + dx, y + 0.2, 1.1), t = this.iso(x + dx + 0.02, y + 0.42, 1.38);
        c.strokeStyle = '#2a2a2e'; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(b.x, b.y); c.quadraticCurveTo(b.x, t.y, t.x, t.y); c.stroke();
        c.fillStyle = '#18181a'; c.beginPath(); c.arc(t.x, t.y, 2.2, 0, Math.PI * 2); c.fill();
      }
    }

    // Light stand with a softbox angled toward the backdrop.
    softbox(x, y, side) {
      const c = this.ctx;
      const base = this.iso(x + 0.15, y + 0.15, 0), top = this.iso(x + 0.15, y + 0.15, 1.75);
      c.strokeStyle = '#2a2a2e'; c.lineWidth = 1.5;
      for (const [dx, dy] of [[-0.18, 0.1], [0.18, 0.1], [0, -0.2]]) { const e = this.iso(x + 0.15 + dx, y + 0.15 + dy, 0); c.beginPath(); c.moveTo(base.x, base.y - 6); c.lineTo(e.x, e.y); c.stroke(); }
      c.beginPath(); c.moveTo(base.x, base.y); c.lineTo(top.x, top.y); c.stroke();
      this.box(x - 0.1, y - 0.05, 1.65, 0.5, 0.4, 0.45, '#2a2a2e', '#f8f6ee', '#1f1f22');
      const g = this.iso(x + 0.15, y + 0.35, 1.87);
      const glow = c.createRadialGradient(g.x, g.y, 2, g.x, g.y, 26);
      glow.addColorStop(0, 'rgba(255,250,235,.35)'); glow.addColorStop(1, 'rgba(255,250,235,0)');
      c.fillStyle = glow; c.beginPath(); c.arc(g.x, g.y, 26, 0, Math.PI * 2); c.fill();
      void side;
    }

    // Video camera on a tripod, pointed at the backdrop.
    tripodCamera(x, y) {
      const c = this.ctx;
      const head = this.iso(x + 0.2, y + 0.2, 1.2);
      c.strokeStyle = '#2a2a2e'; c.lineWidth = 1.4;
      for (const [dx, dy] of [[-0.2, 0.15], [0.2, 0.15], [0, -0.25]]) { const e = this.iso(x + 0.2 + dx, y + 0.2 + dy, 0); c.beginPath(); c.moveTo(head.x, head.y); c.lineTo(e.x, e.y); c.stroke(); }
      this.box(x + 0.05, y + 0.05, 1.2, 0.3, 0.45, 0.25, '#2a2a2e', '#18181a', '#202024');
      this.box(x + 0.12, y - 0.12, 1.25, 0.16, 0.17, 0.16, '#3a3a3e', '#111', '#1a1a1c');
      const led = this.iso(x + 0.35, y + 0.5, 1.4);
      c.fillStyle = Math.sin(this.t / 300) > 0 ? '#ff3b30' : '#5a1a16';
      c.beginPath(); c.arc(led.x, led.y, 1.4, 0, Math.PI * 2); c.fill();
    }

    meetingTable(x, y) {
      const pal = this.pal;
      this.box(x + 0.3, y + 0.5, 0, 0.12, 0.4, 0.7, pal.deskL, pal.deskL, pal.deskR);
      this.box(x + 2.6, y + 0.5, 0, 0.12, 0.4, 0.7, pal.deskL, pal.deskL, pal.deskR);
      this.box(x, y, 0.7, 3.0, 1.4, 0.08, this.shade(pal.deskTop, 12), pal.deskL, pal.deskR);
      this.box(x + 1.2, y + 0.45, 0.78, 0.5, 0.35, 0.03, '#2a2a2e', '#222', '#1a1a1a');
      this.box(x + 0.4, y + 0.3, 0.78, 0.2, 0.28, 0.02, '#fff', '#eee', '#ddd');
      this.box(x + 2.2, y + 0.8, 0.78, 0.12, 0.12, 0.12, '#f2f2f2', '#d0d0d0', '#bbb');
    }

    stool(x, y, h, color) {
      this.box(x - 0.04, y - 0.04, 0, 0.08, 0.08, h, '#555', '#444', '#333');
      this.box(x - 0.2, y - 0.2, h, 0.4, 0.4, 0.07, this.shade(color, 18), color, this.shade(color, -18));
    }

    roundTable(x, y) {
      const c = this.ctx;
      this.box(x - 0.05, y - 0.05, 0, 0.1, 0.1, 0.72, '#555', '#444', '#333');
      const p = this.iso(x, y, 0.75);
      c.fillStyle = this.shade(this.pal.deskTop, -15);
      c.beginPath(); c.ellipse(p.x, p.y + 3, 30, 15, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = this.shade(this.pal.deskTop, 15);
      c.beginPath(); c.ellipse(p.x, p.y, 30, 15, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff';
      c.beginPath(); c.ellipse(p.x + 8, p.y - 2, 5, 2.5, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#e6b35c';
      c.beginPath(); c.arc(p.x + 8, p.y - 3, 2, 0, Math.PI * 2); c.fill();
    }

    coffeeMachine(x, y) {
      this.box(x, y, 0.9, 0.5, 0.45, 0.6, '#555b63', '#3a3f45', '#2e3237');
      this.box(x + 0.15, y + 0.42, 1.0, 0.2, 0.05, 0.15, '#222', '#111', '#111');
      const p = this.iso(x + 0.4, y + 0.45, 1.35);
      this.ctx.fillStyle = Math.sin(this.t / 400) > 0 ? '#ff6b4a' : '#7a3a2a';
      this.ctx.fillRect(p.x, p.y, 2.5, 2.5);
      this.box(x + 0.6, y + 0.1, 0.9, 0.14, 0.14, 0.14, '#fff', '#ddd', '#ccc');
    }

    sink(x, y) {
      this.box(x, y + 0.05, 0.9, 0.55, 0.4, 0.02, '#9aa3ad', '#7d858e', '#6c737b');
      this.box(x + 0.22, y + 0.02, 0.92, 0.06, 0.06, 0.3, this.pal.metal, this.pal.metal, '#888');
      this.box(x + 0.22, y + 0.02, 1.2, 0.06, 0.2, 0.04, this.pal.metal, this.pal.metal, '#888');
    }

    fridge(x, y) {
      this.box(x, y, 0, 0.85, 0.75, 1.95, '#eef1f4', '#cfd5db', '#bcc3ca');
      const P = (a, b, c) => this.iso(a, b, c);
      this.poly([P(x, y + 0.75, 1.25), P(x + 0.85, y + 0.75, 1.25), P(x + 0.85, y + 0.75, 1.27), P(x, y + 0.75, 1.27)], '#9aa3ad');
      this.poly([P(x + 0.7, y + 0.75, 1.4), P(x + 0.73, y + 0.75, 1.4), P(x + 0.73, y + 0.75, 1.75), P(x + 0.7, y + 0.75, 1.75)], '#888');
      for (const [mx, mz, col] of [[0.2, 1.6, '#c96442'], [0.4, 1.45, '#3b8ee0'], [0.3, 0.9, '#5f9a4c']]) {
        const p = P(x + mx, y + 0.75, mz);
        this.ctx.fillStyle = col; this.ctx.fillRect(p.x, p.y, 4, 4);
      }
    }

    waterCooler(x, y) {
      this.box(x, y, 0, 0.42, 0.42, 0.95, '#e8ecef', '#cfd5db', '#bcc3ca');
      const c = this.ctx;
      const p = this.iso(x + 0.21, y + 0.21, 0.95);
      c.fillStyle = 'rgba(120,180,240,.6)';
      c.beginPath(); c.ellipse(p.x, p.y - 9, 8, 11, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,.5)';
      c.fillRect(p.x - 4, p.y - 16, 2, 10);
      const k = (this.t / 1800) % 1;
      c.fillStyle = 'rgba(255,255,255,.85)';
      c.beginPath(); c.arc(p.x + 2, p.y - 2 - k * 16, 1.2, 0, Math.PI * 2); c.fill();
      const tap = this.iso(x + 0.21, y + 0.42, 0.65);
      c.fillStyle = '#3b8ee0'; c.fillRect(tap.x - 1.5, tap.y, 3, 3);
    }

    // brown leather sofa with brass studs (rivets) along the edges
    couch(x, y) {
      const pal = this.pal;
      const top = pal.leather, l = pal.leatherD, r = this.shade(pal.leatherD, -12);
      this.box(x, y - 0.05, 0.32, 2.8, 0.25, 0.42, this.shade(top, 10), l, r);
      this.box(x, y, 0, 2.8, 0.8, 0.32, top, l, r);
      this.box(x - 0.15, y - 0.05, 0, 0.18, 0.85, 0.52, this.shade(top, 6), l, r);
      this.box(x + 2.8, y - 0.05, 0, 0.18, 0.85, 0.52, this.shade(top, 6), l, r);
      this.studs(x + 0.04, y + 0.8, 0.28, x + 2.76, y + 0.8, 0.28, 18); // seat front
      this.studs(x - 0.13, y + 0.8, 0.48, x + 0.01, y + 0.8, 0.48, 2); // arm fronts
      this.studs(x + 2.82, y + 0.8, 0.48, x + 2.96, y + 0.8, 0.48, 2);
      this.studs(x + 2.98, y - 0.03, 0.48, x + 2.98, y + 0.78, 0.48, 6); // right arm side
      this.box(x + 2.15, y + 0.12, 0.32, 0.35, 0.16, 0.28, '#efe8da', '#d9d1c2', '#c9c0b0');
    }

    studs(x0, y0, z0, x1, y1, z1, n) {
      const c = this.ctx;
      c.fillStyle = this.pal.stud;
      for (let i = 0; i < n; i++) {
        const k = n === 1 ? 0.5 : i / (n - 1);
        const p = this.iso(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, z0 + (z1 - z0) * k);
        c.beginPath(); c.arc(p.x, p.y, 0.9, 0, Math.PI * 2); c.fill();
      }
    }

    coffeeTable(x, y) {
      const pal = this.pal;
      this.box(x, y, 0, 1.6, 0.7, 0.3, this.shade(pal.deskTop, -10), pal.deskL, pal.deskR);
      this.box(x + 0.2, y + 0.15, 0.3, 0.35, 0.25, 0.06, '#c96442', '#a85336', '#8f462e');
      this.box(x + 1.1, y + 0.3, 0.3, 0.12, 0.12, 0.12, '#fff', '#ddd', '#ccc');
    }

    beanbag(x, y, color) {
      const c = this.ctx;
      const p = this.iso(x, y, 0);
      c.fillStyle = this.shade(color, -25);
      c.beginPath(); c.ellipse(p.x, p.y - 4, 20, 11, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = color;
      c.beginPath(); c.ellipse(p.x, p.y - 8, 18, 10, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = this.shade(color, 20);
      c.beginPath(); c.ellipse(p.x - 3, p.y - 14, 10, 6, -0.2, 0, Math.PI * 2); c.fill();
    }

    // walnut veneer grain on a cabinet's front face (y = that face)
    grain(x0, x1, y, h) {
      const P = (a, b, c) => this.iso(a, b, c);
      for (let k = 1; k < 9; k++) {
        const z = (h / 9) * k + Math.sin(x0 * 5 + k) * 0.02;
        this.poly([P(x0, y, z), P(x1, y, z + 0.015), P(x1, y, z + 0.022), P(x0, y, z + 0.007)], this.pal.walnutGrain);
      }
    }

    books(x0, x1, y) {
      const P = (a, b, c) => this.iso(a, b, c);
      const cols = this.pal.book;
      for (let shelf = 0; shelf < 3; shelf++) {
        const z = 0.12 + shelf * 0.45;
        let bx = x0 + 0.05;
        let i = Math.round(x0 * 7) + shelf * 5;
        while (bx < x1 - 0.1) {
          const bw = 0.07 + ((i * 13) % 5) * 0.015;
          const bh = 0.25 + ((i * 7) % 4) * 0.03;
          if (i % 7 !== 3) this.poly([P(bx, y, z), P(bx + bw, y, z), P(bx + bw, y, z + bh), P(bx, y, z + bh)], cols[i % cols.length]);
          bx += bw + 0.015;
          i++;
        }
        this.poly([P(x0, y, z - 0.02), P(x1, y, z - 0.02), P(x1, y, z), P(x0, y, z)], this.pal.walnutR);
      }
    }

    arcade(x, y) {
      this.box(x, y, 0, 0.7, 0.7, 1.75, '#3a2a6a', '#2b1f52', '#221843');
      const P = (a, b, c) => this.iso(a, b, c);
      const hue = (this.t / 20) % 360;
      this.poly([P(x + 0.1, y + 0.7, 1.0), P(x + 0.6, y + 0.7, 1.0), P(x + 0.6, y + 0.7, 1.45), P(x + 0.1, y + 0.7, 1.45)], `hsl(${hue},70%,55%)`);
      const blip = this.iso(x + 0.25 + 0.2 * Math.sin(this.t / 300), y + 0.7, 1.2);
      this.ctx.fillStyle = '#fff'; this.ctx.fillRect(blip.x, blip.y, 3, 3);
      this.poly([P(x, y + 0.7, 1.55), P(x + 0.7, y + 0.7, 1.55), P(x + 0.7, y + 0.7, 1.72), P(x, y + 0.7, 1.72)], '#ffcf4a');
      this.box(x, y + 0.7, 0.8, 0.7, 0.2, 0.08, '#4a3a8a', '#3a2a6a', '#2b1f52');
      const j = this.iso(x + 0.25, y + 0.8, 0.88);
      this.ctx.fillStyle = '#e04a4a'; this.ctx.beginPath(); this.ctx.arc(j.x, j.y - 3, 2.5, 0, Math.PI * 2); this.ctx.fill();
    }

    // ---- gym / Switch room / movie room

    treadmill(x, y) {
      const dk = '#3a3d42', dkL = '#2c2f33', dkR = '#24272a';
      this.box(x, y + 0.15, 0, 0.8, 1.55, 0.08, '#4a4e54', dkL, dkR);
      this.box(x + 0.1, y + 0.2, 0.08, 0.6, 1.45, 0.01, '#1c1d20', '#1c1d20', '#1c1d20');
      this.box(x + 0.02, y + 0.12, 0, 0.06, 0.06, 1.05, dk, dkL, dkR);
      this.box(x + 0.72, y + 0.12, 0, 0.06, 0.06, 1.05, dk, dkL, dkR);
      this.box(x, y, 1.0, 0.8, 0.3, 0.12, '#4a4e54', dkL, dkR);
      const P = (a, b, c) => this.iso(a, b, c);
      this.poly([P(x + 0.2, y + 0.3, 1.02), P(x + 0.6, y + 0.3, 1.02), P(x + 0.6, y + 0.3, 1.1), P(x + 0.2, y + 0.3, 1.1)], '#3fd38a');
    }

    punchBag(x, y) {
      const c = this.ctx;
      const a = this.iso(x, y, 2.3), b = this.iso(x, y, 1.65);
      c.strokeStyle = '#8d939a'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      const sway = Math.sin(this.t / 500) * 0.03;
      this.box(x - 0.2 + sway, y - 0.2, 0.6, 0.4, 0.4, 1.05, '#d0463b', '#b03a30', '#922f27');
      this.box(x - 0.2 + sway, y - 0.2, 1.05, 0.4, 0.4, 0.06, '#2a2a2e', '#1f1f22', '#18181a');
    }

    dumbbellRack(x, y) {
      this.box(x, y, 0, 0.45, 1.8, 0.55, '#4a4e54', '#3a3d42', '#2c2f33');
      const cols = ['#c0392b', '#2f6fb0', '#5f9a4c', '#c9a24c', '#2a2a2e'];
      for (let k = 0; k < 5; k++) this.box(x + 0.1, y + 0.12 + k * 0.33, 0.55, 0.25, 0.22, 0.12, cols[k], this.shade(cols[k], -25), this.shade(cols[k], -40));
    }

    bench(x, y) {
      this.box(x + 0.15, y + 0.2, 0, 0.12, 0.12, 0.35, '#3a3d42', '#2c2f33', '#24272a');
      this.box(x + 0.15, y + 1.0, 0, 0.12, 0.12, 0.35, '#3a3d42', '#2c2f33', '#24272a');
      this.box(x, y, 0.35, 0.45, 1.3, 0.12, '#2a2a2e', '#1f1f22', '#18181a');
    }

    yogaMat(x, y, color) {
      const P = (a, b, c) => this.iso(a, b, c);
      this.poly([P(x, y, 0.01), P(x + 0.7, y, 0.01), P(x + 0.7, y + 1.6, 0.01), P(x, y + 1.6, 0.01)], color, this.shade(color, -30));
    }

    tvWall(x, y) {
      // low cabinet with a console on it, TV on the wall above
      this.box(x, y, 0, 0.5, 2.0, 0.5, this.pal.walnut, this.pal.walnutL, this.pal.walnutR);
      for (let k = 1; k < 4; k++) { // walnut grain on the side facing the room
        const z = 0.12 * k + 0.02;
        this.poly([this.iso(x + 0.5, y, z), this.iso(x + 0.5, y + 2.0, z + 0.01), this.iso(x + 0.5, y + 2.0, z + 0.016), this.iso(x + 0.5, y, z + 0.006)], this.pal.walnutGrain);
      }
      this.box(x + 0.15, y + 0.85, 0.5, 0.18, 0.3, 0.1, '#2a2a2e', '#1f1f22', '#18181a');
      this.box(x + 0.15, y + 0.78, 0.5, 0.18, 0.07, 0.1, '#e60012', '#c00010', '#a0000d');
      this.box(x + 0.15, y + 1.15, 0.5, 0.18, 0.07, 0.1, '#00a2e8', '#0088c4', '#0070a0');
      const P = (a, b, c) => this.iso(a, b, c);
      const y0 = y + 0.1, y1 = y + 1.9;
      this.poly([P(0.02, y0, 0.8), P(0.02, y1, 0.8), P(0.02, y1, 1.85), P(0.02, y0, 1.85)], '#18181a');
      const hue = (this.t / 30) % 360;
      this.poly([P(0.04, y0 + 0.06, 0.86), P(0.04, y1 - 0.06, 0.86), P(0.04, y1 - 0.06, 1.79), P(0.04, y0 + 0.06, 1.79)], `hsl(${hue},65%,55%)`);
    }

    // sofa with its back to +x, facing the left wall
    sofaY(x, y, len) {
      const color = this.pal.leather;
      const d = this.pal.leatherD, e = this.shade(this.pal.leatherD, -14);
      this.box(x, y, 0, 0.8, len, 0.32, color, d, e);
      this.box(x + 0.58, y, 0.32, 0.22, len, 0.42, this.shade(color, 10), d, e);
      this.box(x, y - 0.15, 0, 0.8, 0.15, 0.52, this.shade(color, 6), d, e);
      this.box(x, y + len, 0, 0.8, 0.15, 0.52, this.shade(color, 6), d, e);
      this.studs(x + 0.8, y + 0.05, 0.7, x + 0.8, y + len - 0.05, 0.7, Math.round(len * 6)); // back, top edge
      this.studs(x + 0.8, y + 0.05, 0.06, x + 0.8, y + len - 0.05, 0.06, Math.round(len * 6)); // back, bottom edge
      this.studs(x + 0.05, y + len + 0.15, 0.48, x + 0.75, y + len + 0.15, 0.48, 5); // arm front
    }

    popcorn(x, y) {
      this.box(x, y, 0, 0.6, 0.5, 0.8, '#c0392b', '#a03024', '#80261d');
      this.box(x + 0.05, y + 0.05, 0.8, 0.5, 0.4, 0.45, 'rgba(255,240,200,.5)', 'rgba(255,225,140,.75)', 'rgba(240,210,120,.75)');
      this.box(x, y, 1.25, 0.6, 0.5, 0.08, '#c0392b', '#a03024', '#80261d');
    }

    floorLamp(x, y) {
      const c = this.ctx;
      const b = this.iso(x, y, 0), t = this.iso(x, y, 1.7);
      if (skyColor().night) {
        c.fillStyle = 'rgba(255,220,140,.14)';
        c.beginPath(); c.ellipse(b.x, b.y, 50, 25, 0, 0, Math.PI * 2); c.fill();
      }
      c.strokeStyle = '#333'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(t.x, t.y); c.stroke();
      c.fillStyle = '#333'; c.beginPath(); c.ellipse(b.x, b.y, 7, 3.5, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#f3e3b5';
      c.beginPath(); c.moveTo(t.x - 9, t.y + 4); c.lineTo(t.x + 9, t.y + 4); c.lineTo(t.x + 5, t.y - 8); c.lineTo(t.x - 5, t.y - 8); c.closePath(); c.fill();
    }

    vending(x, y, color) {
      this.box(x, y, 0, 0.7, 0.75, 1.85, this.shade(color, 15), this.shade(color, -10), color);
      const P = (a, b, c) => this.iso(a, b, c);
      const fx = x + 0.7;
      this.poly([P(fx, y + 0.08, 0.7), P(fx, y + 0.55, 0.7), P(fx, y + 0.55, 1.7), P(fx, y + 0.08, 1.7)], 'rgba(20,30,40,.75)');
      const cols = ['#f2d16b', '#5cf08a', '#ff8a65', '#81d4fa', '#ce93d8'];
      for (let r = 0; r < 4; r++) {
        for (let k = 0; k < 3; k++) {
          const q = P(fx, y + 0.15 + k * 0.14, 1.55 - r * 0.23);
          this.ctx.fillStyle = cols[(r * 3 + k + Math.round(y)) % cols.length];
          this.ctx.fillRect(q.x - 1.5, q.y - 4, 3, 5);
        }
      }
      this.poly([P(fx, y + 0.1, 0.25), P(fx, y + 0.5, 0.25), P(fx, y + 0.5, 0.45), P(fx, y + 0.1, 0.45)], '#222');
      const glow = P(fx, y + 0.65, 1.2);
      this.ctx.fillStyle = Math.sin(this.t / 700 + y) > 0 ? '#9ef' : '#4ad';
      this.ctx.fillRect(glow.x - 1, glow.y - 3, 2, 6);
    }

    foosball(x, y) {
      for (const [lx, ly] of [[0.1, 0.1], [1.42, 0.1], [0.1, 0.62], [1.42, 0.62]]) this.box(x + lx, y + ly, 0, 0.08, 0.08, 0.6, '#5a4030', '#5a4030', '#4a3428');
      this.box(x, y, 0.6, 1.6, 0.8, 0.25, '#2f8a4a', '#6e533b', '#5c4431');
      const P = (a, b, c) => this.iso(a, b, c);
      const players = this.plan && this.plan.pois.filter((q) => q.pair === 'fb' && q.taken).length === 2;
      for (let k = 0; k < 6; k++) {
        const rx = x + 0.2 + k * 0.24;
        const shift = players ? Math.sin(this.t / 120 + k) * 0.06 : 0;
        const a = P(rx, y - 0.15, 0.82), b = P(rx, y + 0.95, 0.82);
        this.ctx.strokeStyle = '#c8ccd0'; this.ctx.lineWidth = 1.2;
        this.ctx.beginPath(); this.ctx.moveTo(a.x, a.y); this.ctx.lineTo(b.x, b.y); this.ctx.stroke();
        for (let m = 0; m < 2; m++) {
          const q = P(rx, y + 0.25 + m * 0.3 + shift, 0.82);
          this.ctx.fillStyle = k % 2 ? '#c0392b' : '#2f6fb0';
          this.ctx.fillRect(q.x - 1.5, q.y - 3, 3, 6);
        }
      }
    }

    booth(add, x, y) {
      const P = (a, b, c) => this.iso(a, b, c);
      const pal = this.pal;
      const H = 2.0;
      // back walls (felt panels), then the stool, then glass front
      add(x + 0.65 + y + 0.05, () => {
        this.poly([P(x, y, 0), P(x + 1.3, y, 0), P(x + 1.3, y, H), P(x, y, H)], pal.dark ? '#3c4a5a' : '#9fb3c8');
        this.poly([P(x, y, 0), P(x, y + 1.3, 0), P(x, y + 1.3, H), P(x, y, H)], pal.dark ? '#34404e' : '#8ea3b8');
        this.poly([P(x + 0.02, y + 0.02), P(x + 1.28, y + 0.02), P(x + 1.28, y + 1.28), P(x + 0.02, y + 1.28)], pal.dark ? '#2a323b' : '#d8dee5');
        const lamp = P(x + 0.65, y + 0.65, H - 0.05);
        this.ctx.fillStyle = 'rgba(255,230,160,.9)';
        this.ctx.beginPath(); this.ctx.ellipse(lamp.x, lamp.y, 8, 4, 0, 0, Math.PI * 2); this.ctx.fill();
        this.stool(x + 0.65, y + 0.6, 0.43, '#c96442');
      });
      add(x + 1.3 + y + 0.65 + 0.3, () => {
        this.poly([P(x + 1.3, y, 0), P(x + 1.3, y + 1.3, 0), P(x + 1.3, y + 1.3, H), P(x + 1.3, y, H)], pal.glass, pal.glassEdge);
        this.poly([P(x, y + 1.3, 0), P(x + 1.3, y + 1.3, 0), P(x + 1.3, y + 1.3, H), P(x, y + 1.3, H)], pal.glass, pal.glassEdge);
        this.poly([P(x + 0.85, y + 1.3, 0), P(x + 0.87, y + 1.3, 0), P(x + 0.87, y + 1.3, H), P(x + 0.85, y + 1.3, H)], pal.glassEdge);
        this.box(x - 0.03, y - 0.03, H, 1.36, 1.36, 0.08, pal.dark ? '#4a5868' : '#b5c4d3', pal.trim, pal.trim);
      });
    }

    desk(dk, p) {
      const pal = this.pal;
      const { x, y } = dk;
      for (const [lx, ly] of [[0.05, 0.05], [1.27, 0.05], [0.05, 0.67], [1.27, 0.67]]) {
        this.box(x + lx, y + ly, 0, 0.08, 0.08, 0.72, pal.deskL, pal.deskL, pal.deskR);
      }
      this.box(x, y, 0.72, 1.4, 0.8, 0.07, pal.deskTop, pal.deskL, pal.deskR);
      const worker = p && p.mode === 'work' ? p : null;
      if (dk.side === 's') {
        const mx = x + 0.42, my = y + 0.1, mz = 0.79;
        this.box(mx + 0.22, my + 0.04, mz, 0.1, 0.1, 0.18, pal.monitor, pal.monitor, pal.monitor);
        this.box(mx, my, mz + 0.18, 0.56, 0.08, 0.42, pal.monitor, pal.monitor, this.shade(pal.monitor, 10));
        this.screen(mx + 0.04, my + 0.08, mz + 0.22, 0.48, 0.34, worker);
        this.box(x + 0.48, y + 0.48, 0.79, 0.44, 0.16, 0.025, '#d8d8d8', '#aaa', '#999');
      } else {
        // We see this monitor from behind; a status LED on its back.
        const mx = x + 0.42, my = y + 0.6, mz = 0.79;
        this.box(x + 0.48, y + 0.16, 0.79, 0.44, 0.16, 0.025, '#d8d8d8', '#aaa', '#999');
        this.box(mx + 0.22, my - 0.02, mz, 0.1, 0.1, 0.18, pal.monitor, pal.monitor, pal.monitor);
        this.box(mx, my, mz + 0.18, 0.56, 0.08, 0.42, this.shade(pal.monitor, 15), this.shade(pal.monitor, 8), this.shade(pal.monitor, 12));
        if (worker) {
          const g = this.iso(mx + 0.28, my + 0.08, mz + 0.5);
          this.ctx.fillStyle = STATUS_COLOR[worker.s.status] || '#888';
          this.ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.t / 400 + worker.phase);
          this.ctx.beginPath(); this.ctx.arc(g.x, g.y, 1.8, 0, Math.PI * 2); this.ctx.fill();
          this.ctx.globalAlpha = 1;
        }
      }
      // personal touches, stable per desk
      const h = hash(`${x.toFixed(1)},${y.toFixed(1)}`);
      if (h % 3 === 0) this.box(x + 1.12, y + 0.3, 0.79, 0.12, 0.12, 0.13, '#f2f2f2', '#d0d0d0', '#bbb');
      if (h % 5 === 1) {
        this.box(x + 0.14, y + 0.24, 0.79, 0.12, 0.12, 0.08, pal.pot, pal.pot, this.shade(pal.pot, -15));
        const q = this.iso(x + 0.2, y + 0.3, 0.87);
        this.ctx.fillStyle = pal.plant;
        this.ctx.beginPath(); this.ctx.ellipse(q.x, q.y - 4, 4, 6, 0, 0, Math.PI * 2); this.ctx.fill();
      }
      if (h % 4 === 2) this.box(x + 0.12, y + 0.45, 0.79, 0.22, 0.15, 0.05, '#f2d16b', '#d9b84f', '#c4a33f');
    }

    screen(x, y, z, w, h, p) {
      const P = (a, b, cc) => this.iso(a, b, cc);
      const st = p ? p.s.status : 'off';
      const base = { thinking: '#3a3160', tool: '#14324f', typing: '#123d2e', waiting: '#4d3510', error: '#4a1612' }[st] || this.pal.screenOff;
      const corners = [P(x, y, z), P(x + w, y, z), P(x + w, y, z + h), P(x, y, z + h)];
      this.poly(corners, base);
      if (!p) return;
      const c = this.ctx;
      c.save();
      c.beginPath();
      corners.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
      c.closePath();
      c.clip();
      const t = this.t / 1000;
      const col = STATUS_COLOR[st];
      if (st === 'tool' || st === 'typing') {
        const scroll = (t * (st === 'tool' ? 2.2 : 1.2) + p.phase) % 1;
        for (let i = -1; i < 6; i++) {
          const zz = z + h - 0.05 - ((i + scroll) * h) / 5;
          const len = 0.12 + ((p.h >> ((i + 8) & 15)) % 7) / 20;
          const a = P(x + 0.05, y, zz), b = P(x + 0.05 + Math.min(len, w - 0.1), y, zz);
          c.strokeStyle = i % 3 === 0 ? col : 'rgba(255,255,255,.55)';
          c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
        }
      } else {
        const m = P(x + w / 2, y, z + h / 2);
        c.fillStyle = col;
        c.globalAlpha = st === 'thinking' ? 0.5 + 0.4 * Math.sin(t * 3 + p.phase) : 0.9;
        c.font = '700 10px ui-sans-serif, system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText({ thinking: '…', waiting: '?', error: '!' }[st] || '', m.x, m.y);
      }
      c.restore();
      c.save();
      c.globalAlpha = 0.18;
      const g = P(x + w / 2, y + 0.35, 0.8);
      c.fillStyle = col;
      c.beginPath(); c.ellipse(g.x, g.y, 18, 7, 0, 0, Math.PI * 2); c.fill();
      c.restore();
    }

    chair(dk, p) {
      const pal = this.pal;
      const sx = dk.seat.x - 0.25, sy = dk.seat.y - 0.22;
      const seated = p && !p.path.length && p.pose === 'sit' && Math.hypot(p.x - dk.seat.x, p.y - dk.seat.y) < 0.05;
      const ox = seated ? 0 : 0.12, oy = seated ? 0 : dk.side === 's' ? 0.18 : -0.18;
      this.box(sx + 0.22 + ox, sy + 0.19 + oy, 0, 0.06, 0.06, 0.32, '#222', '#222', '#111');
      if (dk.side === 'n') this.box(sx + ox, sy + oy - 0.05, 0.4, 0.5, 0.07, 0.55, this.shade(pal.chair, 15), pal.chair, this.shade(pal.chair, -10));
      this.box(sx + ox, sy + oy, 0.32, 0.5, 0.45, 0.08, this.shade(pal.chair, 15), pal.chair, this.shade(pal.chair, -10));
      if (dk.side === 's' && !seated) this.box(sx + ox, sy + oy + 0.4, 0.4, 0.5, 0.07, 0.5, this.shade(pal.chair, 15), pal.chair, this.shade(pal.chair, -10));
    }

    // ------------------------------------------------------------ people

    stateOf(p) {
      const s = p.s || {};
      if (p.path.length) return { pose: 'walk', face: p.walkFace, act: null, sitZ: 0 };
      if (p.mode === 'work' && p.desk) {
        const face = p.desk.side === 'n' ? 'front' : 'back';
        if (s.status === 'waiting' || s.status === 'error') return { pose: 'stand', face, act: 'wave', sitZ: 0 };
        if (p.desk.pose === 'stand') return { pose: 'stand', face, act: 'station', sitZ: 0 };
        return { pose: 'sit', face, act: s.status === 'tool' || s.status === 'typing' ? 'type' : 'think', sitZ: 0.34 };
      }
      if (p.mode === 'wander' && p.poi) {
        const q = p.poi;
        return { pose: q.sit ? 'sit' : 'stand', face: q.face === 'side' ? 'front' : q.face, act: q.act, sitZ: q.sit || 0 };
      }
      return { pose: 'stand', face: 'front', act: null, sitZ: 0 };
    }

    person(p) {
      const c = this.ctx;
      const t = this.t / 1000;
      const s = p.s || {};
      const st = this.stateOf(p);
      p.pose = st.pose;
      const moving = st.pose === 'walk';
      const seated = st.pose === 'sit';
      const front = st.face !== 'back';
      const b = this.iso(p.x, p.y, st.sitZ);
      const step = moving ? Math.sin(t * 12 + p.phase) : 0;
      const bob = moving ? Math.abs(step) * 1.5 : 0;

      const fb = this.iso(p.x, p.y, 0);
      c.fillStyle = this.pal.shadow;
      c.beginPath(); c.ellipse(fb.x, fb.y, 10, 5, 0, 0, Math.PI * 2); c.fill();
      if (this.hoverKey === p.key) {
        c.strokeStyle = STATUS_COLOR[s.status] || '#888';
        c.lineWidth = 2;
        c.beginPath(); c.ellipse(fb.x, fb.y, 14, 7, 0, 0, Math.PI * 2); c.stroke();
      }

      let x = b.x;
      const y = b.y - bob;
      if (st.act === 'pingpong') x += Math.sin(t * 7 + p.phase) * 4;
      if (st.act === 'foosball') x += Math.sin(t * 5 + p.phase) * 1.5;
      const sc = s.subagent ? 0.8 : 1;
      c.save();
      c.translate(x, y);
      c.scale(sc, sc);

      const lk = p.look || {};
      const wide = !!lk.wide;
      const lw = wide ? 5 : 4; // wide-leg trousers
      const lx0 = wide ? -6 : -5;
      c.fillStyle = p.pants;
      if (seated) {
        c.fillRect(lx0, -4, lw, 5);
        c.fillRect(1, -4, lw, 5);
      } else {
        c.fillRect(lx0, -10, lw, 10 + step * 2);
        c.fillRect(1, -10, lw, 10 - step * 2);
        c.fillStyle = lk.shoes || '#2a2a2a';
        c.fillRect(lx0, -1 + step, lw, 2);
        c.fillRect(1, -1 - step, lw, 2);
        if (lk.shoeStripe) {
          c.fillStyle = lk.shoeStripe;
          c.fillRect(lx0 + 1, -0.6 + step, lw - 2, 0.8);
          c.fillRect(2, -0.6 - step, lw - 2, 0.8);
        }
      }
      const hip = seated ? -4 : -10;
      if (p.look) {
        // Oversized, boxy jacket (or a long coat) worn open over a tee, with contrast stitching.
        const hem = lk.coat ? (seated ? 3 : 7) : 2;
        this.roundRect(-8, hip - 13, 16, 13 + hem, 3, p.shirt);
        if (front) {
          if (lk.inner) { c.fillStyle = lk.inner; c.fillRect(-2, hip - 13, 4, 13 + hem); }
          if (lk.stitch) {
            c.strokeStyle = lk.stitch; c.lineWidth = 0.6;
            c.strokeRect(-6.5, hip - 10.5, 3.6, 3); // chest pockets
            c.strokeRect(2.9, hip - 10.5, 3.6, 3);
            c.beginPath();
            c.moveTo(-2.6, hip - 12.5); c.lineTo(-2.6, hip + hem - 0.5);
            c.moveTo(2.6, hip - 12.5); c.lineTo(2.6, hip + hem - 0.5);
            c.moveTo(-7.5, hip + hem - 1.4); c.lineTo(7.5, hip + hem - 1.4);
            c.stroke();
          }
        }
      } else {
        this.roundRect(-7, hip - 13, 14, 14, 3, p.shirt);
      }
      const arm = this.shade(p.shirt, -18);
      const hand = (hx, hy) => { c.fillStyle = p.skin; c.beginPath(); c.arc(hx, hy, 2.2, 0, Math.PI * 2); c.fill(); };
      c.fillStyle = arm;
      const sip = Math.sin(t * 0.9 + p.phase) > 0.6;
      switch (st.act) {
        case 'wave': {
          const wave = Math.sin(t * 8 + p.phase) * 2;
          c.fillRect(6, hip - 26, 3, 14);
          hand(7.5 + wave * 0.5, hip - 27);
          c.fillStyle = arm; c.fillRect(-9, hip - 11, 3, 10);
          break;
        }
        case 'type': {
          const k1 = Math.sin(t * 18 + p.phase) > 0 ? 1 : 0;
          c.fillRect(-9, hip - 11 - k1, 3, 8);
          c.fillRect(6, hip - 11 - (1 - k1), 3, 8);
          break;
        }
        case 'coffee':
        case 'water': {
          c.fillRect(-9, hip - 11, 3, 10);
          c.fillRect(6, sip ? hip - 15 : hip - 11, 3, sip ? 7 : 10);
          const cupY = sip && front ? hip - 19 : hip - 4;
          c.fillStyle = st.act === 'water' ? 'rgba(170,215,255,.95)' : '#fafafa';
          c.fillRect(6, cupY, 5, 6);
          if (st.act === 'coffee') { c.fillStyle = '#6b3f22'; c.fillRect(7, cupY, 3, 1.5); }
          break;
        }
        case 'read': {
          c.fillRect(-8, hip - 11, 3, 7);
          c.fillRect(5, hip - 11, 3, 7);
          if (front) { c.fillStyle = pick(this.pal.book, p.h, 5); c.fillRect(-7, hip - 12, 14, 9); c.fillStyle = '#fff'; c.fillRect(-0.5, hip - 12, 1, 9); }
          break;
        }
        case 'whiteboard':
        case 'arcade': {
          const k = Math.sin(t * (st.act === 'arcade' ? 14 : 3) + p.phase);
          c.fillRect(-9, hip - 11, 3, 10);
          c.fillRect(6, hip - 20 + k * 2, 3, 12);
          hand(7.5, hip - 21 + k * 2);
          break;
        }
        case 'pingpong': {
          c.fillRect(-9, hip - 11, 3, 10);
          c.fillRect(6, hip - 14, 3, 9);
          c.fillStyle = '#c0392b';
          c.beginPath(); c.arc(10, hip - 16, 4, 0, Math.PI * 2); c.fill();
          break;
        }
        case 'foosball': {
          const k1 = Math.sin(t * 16 + p.phase) * 1.5;
          c.fillRect(-9, hip - 12 + k1, 3, 7);
          c.fillRect(6, hip - 12 - k1, 3, 7);
          break;
        }
        case 'phone': {
          c.fillRect(-9, hip - 11, 3, 10);
          c.fillRect(5, hip - 22, 3, 12);
          c.fillStyle = '#222'; c.fillRect(5, hip - 25, 3, 6);
          break;
        }
        case 'nap': {
          c.fillRect(-9, hip - 13, 3, 6);
          c.fillRect(6, hip - 13, 3, 6);
          break;
        }
        default: {
          const sw = moving ? step * 2 : 0;
          c.fillRect(-9, hip - 11 + sw, 3, 10);
          c.fillRect(6, hip - 11 - sw, 3, 10);
        }
      }

      const napping = st.act === 'nap';
      const hy = hip - 20 + (napping ? 7 : 0) + (st.act === 'think' ? Math.sin(t * 1.5 + p.phase) * 0.6 : 0);
      c.fillStyle = p.skin;
      c.beginPath(); c.arc(0, hy, 7, 0, Math.PI * 2); c.fill();
      c.fillStyle = p.hair;
      if (front && !napping) {
        c.beginPath(); c.arc(0, hy - 1.5, 7.3, Math.PI * 1.05, Math.PI * 1.95); c.fill();
        if (p.hairStyle === 1) { c.fillRect(-7.3, hy - 2, 2.5, 8); c.fillRect(4.8, hy - 2, 2.5, 8); }
        if (p.hairStyle === 2) { c.beginPath(); c.arc(0, hy - 8, 3.2, 0, Math.PI * 2); c.fill(); }
        if (p.hairStyle === 4) { // slicked back with volume on top
          c.beginPath(); c.ellipse(0.5, hy - 6.3, 6.4, 2.8, -0.08, Math.PI, Math.PI * 2); c.fill();
        }
        if (lk.beard) {
          c.globalAlpha = 0.55; // short beard along the jaw
          c.beginPath(); c.arc(0, hy + 0.5, 6.8, 0.18 * Math.PI, 0.82 * Math.PI); c.arc(0, hy + 1.6, 4.6, 0.78 * Math.PI, 0.22 * Math.PI, true); c.fill();
          c.globalAlpha = 0.75; c.fillRect(-2.2, hy + 2.6, 4.4, 0.9); // moustache
          c.globalAlpha = 1;
        }
        c.fillStyle = '#2a2018';
        const sleepy = s.status === 'idle';
        const blink = Math.sin(t * 0.7 + p.phase * 3) > 0.985;
        if (lk.sunglasses) {
          c.fillStyle = lk.lens || '#6b4a2a';
          c.beginPath(); c.arc(-2.4, hy + 0.2, 2.1, 0, Math.PI * 2); c.arc(2.4, hy + 0.2, 2.1, 0, Math.PI * 2); c.fill();
          c.strokeStyle = lk.sunglasses; c.lineWidth = 0.9;
          c.beginPath(); c.arc(-2.4, hy + 0.2, 2.1, 0, Math.PI * 2); c.stroke();
          c.beginPath(); c.arc(2.4, hy + 0.2, 2.1, 0, Math.PI * 2); c.stroke();
          c.beginPath(); c.moveTo(-0.4, hy - 0.4); c.lineTo(0.4, hy - 0.4); c.stroke();
        } else {
          c.fillRect(-3, hy - 0.5, 1.6, blink || sleepy ? 0.7 : 2);
          c.fillRect(1.6, hy - 0.5, 1.6, blink || sleepy ? 0.7 : 2);
          if (lk.glasses) {
            c.strokeStyle = lk.glasses; c.lineWidth = 0.8;
            c.beginPath(); c.arc(-2.2, hy + 0.4, 2.2, 0, Math.PI * 2); c.stroke();
            c.beginPath(); c.arc(2.4, hy + 0.4, 2.2, 0, Math.PI * 2); c.stroke();
            c.beginPath(); c.moveTo(0, hy); c.lineTo(0.2, hy); c.stroke();
          }
        }
        c.strokeStyle = '#2a2018'; c.lineWidth = 1;
        if (p.mode === 'wander' && !sleepy) {
          c.beginPath(); c.arc(0, hy + 2.2, 2, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
        } else if (s.status === 'error' && p.mode === 'work') {
          c.beginPath(); c.arc(0, hy + 4.5, 2, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke();
        }
      } else {
        c.beginPath(); c.arc(0, hy - 0.5, 7.2, 0, Math.PI * 2); c.fill();
        if (p.hairStyle === 2) { c.beginPath(); c.arc(0, hy - 7, 3.2, 0, Math.PI * 2); c.fill(); }
        if (p.hairStyle === 1) c.fillRect(-6, hy, 12, 8);
      }
      if (lk.hat && !napping) {
        c.fillStyle = lk.hat;
        c.beginPath(); c.arc(0, hy - 2, 7.7, Math.PI, Math.PI * 2); c.fill();
        c.fillStyle = this.shade(lk.hat, 22);
        c.fillRect(-7.7, hy - 3, 15.4, 2.4);
      }
      if (st.act === 'arcade' || st.act === 'beanbag') {
        c.strokeStyle = '#222'; c.lineWidth = 2;
        c.beginPath(); c.arc(0, hy, 8, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
      }
      c.restore();

      const headTop = y + (hy - 8) * sc;
      this.hit.push({ key: p.key, x0: x - 13, x1: x + 13, y0: headTop - 22, y1: fb.y + 4 });
      return { x, y: headTop, act: st.act };
    }

    bubble(p, at) {
      const c = this.ctx;
      const t = this.t / 1000;
      const s = p.s || {};
      const st = s.status;
      const pal = this.pal;
      const x = at.x, y = at.y - 6;
      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const font = (w, px) => `${w} ${px}px ui-sans-serif, system-ui, -apple-system, "PingFang TC", "Apple Color Emoji", sans-serif`;
      c.font = font(600, 10);

      const badge = this.showAgent && AGENT_BADGES[s.agent];
      const pill = (text, fg, bg, yy, alpha = 1, identify = false, maxW = 118) => {
        c.globalAlpha = alpha;
        let tx = text;
        while (c.measureText(tx).width > maxW && tx.length > 2) tx = tx.slice(0, -2) + '…';
        const extra = badge && identify ? 26 : 0;
        const w = c.measureText(tx).width + 12 + extra;
        const height = extra ? 22 : 16;
        this.roundRect(x - w / 2, yy - height / 2, w, height, 8, bg);
        c.fillStyle = fg;
        c.fillText(tx, x + extra / 2, yy + 0.5);
        if (extra) this.agentBadge(badge, x - w / 2 + 13, yy);
        c.globalAlpha = 1;
        return yy - 8;
      };

      let top = y;
      if (p.mode === 'work' && !p.path.length) {
        const col = STATUS_COLOR[st] || '#888';
        if (st === 'thinking') {
          c.fillStyle = pal.bubble;
          c.beginPath(); c.arc(x + 6, y - 2, 2, 0, Math.PI * 2); c.fill();
          c.beginPath(); c.arc(x + 10, y - 7, 3, 0, Math.PI * 2); c.fill();
          this.roundRect(x - 2, y - 26, 32, 16, 8, pal.bubble);
          for (let i = 0; i < 3; i++) {
            c.fillStyle = col;
            c.globalAlpha = 0.3 + 0.7 * Math.max(0, Math.sin(t * 5 - i * 0.7));
            c.beginPath(); c.arc(x + 6 + i * 8, y - 18, 2.4, 0, Math.PI * 2); c.fill();
          }
          c.globalAlpha = 1;
          top = y - 26;
        } else if (st === 'typing') {
          this.roundRect(x - 2, y - 24, 34, 16, 5, col);
          c.beginPath(); c.moveTo(x + 2, y - 9); c.lineTo(x - 2, y - 3); c.lineTo(x + 8, y - 9); c.fillStyle = col; c.fill();
          const n = Math.floor(t * 4) % 4;
          c.fillStyle = '#fff';
          for (let i = 0; i < n; i++) { c.beginPath(); c.arc(x + 7 + i * 8, y - 16, 2, 0, Math.PI * 2); c.fill(); }
          top = y - 24;
        } else if (st === 'tool') {
          const tool = (s.activity || 'tool').split(/[:\s]/)[0];
          top = pill('⚙ ' + tool, '#fff', col, y - 12);
        } else if (st === 'waiting' || st === 'error') {
          const jump = Math.abs(Math.sin(t * 4)) * 4;
          c.fillStyle = col;
          c.beginPath(); c.arc(x, y - 12 - jump, 9, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#fff';
          c.font = font(800, 12);
          c.fillText('!', x, y - 11.5 - jump);
          c.font = font(600, 10);
          top = y - 22 - jump;
        }
      } else if (p.mode === 'wander') {
        const justDone = st === 'done' && Date.now() - (s.lastEventAt || 0) < 3 * 60_000;
        const dozing = at.act === 'nap' || (st === 'idle' && (at.act === 'couch' || at.act === 'beanbag' || (p.poi && p.poi.sleepy)));
        if (justDone) {
          c.fillStyle = STATUS_COLOR.done;
          c.beginPath(); c.arc(x, y - 10, 7, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#fff'; c.font = font(800, 9); c.fillText('✓', x, y - 9.5); c.font = font(600, 10);
          top = y - 18;
        } else if (dozing && !p.path.length) {
          c.fillStyle = STATUS_COLOR.idle;
          c.font = font(700, 10);
          for (let i = 0; i < 3; i++) {
            const k = (t * 0.6 + i / 3) % 1;
            c.globalAlpha = 1 - k;
            c.fillText('z', x + 6 + k * 10, y - 4 - k * 18);
          }
          c.globalAlpha = 1;
          c.font = font(600, 10);
          top = y - 20;
        } else if (at.act && (ACT_EMOJI[at.act] || (p.poi && p.poi.emoji)) && !p.path.length) {
          const cycle = (t + p.phase * 3) % 9;
          if (cycle < 2.2) {
            c.globalAlpha = Math.min(1, cycle * 3, (2.2 - cycle) * 3);
            c.font = font(400, 13);
            c.fillText((p.poi && p.poi.emoji) || ACT_EMOJI[at.act], x, y - 10);
            c.globalAlpha = 1;
            c.font = font(600, 10);
            top = y - 18;
          }
        }
      }

      const hover = this.hoverKey === p.key;
      if (!s.subagent || hover) {
        const alpha = p.mode === 'work' || hover ? 1 : 0.7;
        pill(this.label(s), pal.text, pal.tagBg, top - 11, alpha, true);
        // The session title sits in a smaller, quieter tag above the name.
        const sub = this.subLabel(s);
        if (sub) {
          c.font = font(500, 9);
          pill(sub, pal.text, pal.tagBg, top - 11 - (badge ? 11 : 8) - 9, alpha * 0.85, false, 150);
          c.font = font(600, 10);
        }
      } else if (badge) {
        this.agentBadge(badge, x, top - 11);
      }
      c.restore();
    }

    agentBadge(badge, x, y) {
      const c = this.ctx;
      c.save();
      c.globalAlpha = 1;
      if (badge.image.complete && badge.image.naturalWidth > 0) {
        if (badge.mono && this.pal.dark) c.filter = 'invert(1)';
        c.imageSmoothingEnabled = true;
        c.imageSmoothingQuality = 'high';
        c.drawImage(badge.image, x - 9, y - 9, 18, 18);
      } else {
        c.fillStyle = this.pal.text;
        c.font = '800 10px ui-sans-serif, system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(badge.short, x, y + 0.5);
      }
      c.restore();
    }

    moveCat(dt, now) {
      const k = this.cat;
      if (!k.path.length && now > k.until) {
        const { W, D, grid } = this.plan;
        let tx, ty, tries = 0;
        do { tx = rand(0.6, W - 0.6); ty = rand(1, D - 0.6); tries++; } while (grid.blocked(tx, ty) && tries < 30);
        k.path = grid.path(k.x, k.y, tx, ty);
        k.until = Infinity;
      }
      if (k.path.length) {
        const n = k.path[0];
        const dx = n.x - k.x, dy = n.y - k.y, d = Math.hypot(dx, dy), v = 1.2 * dt;
        if (d > 0.001) k.face = dx - dy >= 0 ? 1 : -1;
        if (d <= v) { k.x = n.x; k.y = n.y; k.path.shift(); if (!k.path.length) k.until = now + rand(4000, 12000); }
        else { k.x += (dx / d) * v; k.y += (dy / d) * v; }
      }
    }

    drawCat() {
      const k = this.cat;
      const c = this.ctx;
      const p = this.iso(k.x, k.y, 0);
      const t = this.t / 1000;
      const walking = k.path.length > 0;
      c.save();
      c.translate(p.x, p.y);
      c.scale(k.face, 1);
      c.fillStyle = this.pal.shadow;
      c.beginPath(); c.ellipse(0, 0, 8, 3, 0, 0, Math.PI * 2); c.fill();
      const col = '#e09a4a';
      c.fillStyle = col;
      if (walking) {
        const s = Math.sin(t * 14) * 1.5;
        c.fillRect(-5, -4, 2, 4 + s); c.fillRect(3, -4, 2, 4 - s);
      }
      c.beginPath(); c.ellipse(0, walking ? -6 : -4, 7, walking ? 4 : 5, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(6, walking ? -10 : -9, 3.6, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(4, -12); c.lineTo(5, -16); c.lineTo(7, -12.5); c.fill();
      c.beginPath(); c.moveTo(7, -12.5); c.lineTo(9, -15.5); c.lineTo(9.5, -11); c.fill();
      c.strokeStyle = col; c.lineWidth = 2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-6, -6); c.quadraticCurveTo(-12, -8 + Math.sin(t * 3) * 3, -10, -14); c.stroke();
      c.fillStyle = '#2a2018';
      c.fillRect(7, -10.5, 1.2, walking ? 1.2 : 0.6);
      c.restore();
    }

    pingPongBall() {
      const players = this.plan.pois
        .filter((q) => q.pair === 'pp' && q.taken)
        .map((q) => this.people.get(q.taken))
        .filter((p) => p && p.poi && p.poi.pair === 'pp' && !p.path.length);
      if (players.length < 2) return;
      const pp = this.plan.pp;
      const k = (this.t / 900) % 2;
      const f = k < 1 ? k : 2 - k;
      const x = pp.x0 + 0.3 + f * (pp.x1 - pp.x0 - 0.6);
      const z = 0.8 + Math.abs(Math.sin(f * Math.PI * 2)) * 0.45;
      const c = this.ctx;
      const sh = this.iso(x, pp.y, 0.77);
      c.fillStyle = 'rgba(0,0,0,.25)';
      c.beginPath(); c.ellipse(sh.x, sh.y, 2.5, 1.2, 0, 0, Math.PI * 2); c.fill();
      const p = this.iso(x, pp.y, z);
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(p.x, p.y, 2.2, 0, Math.PI * 2); c.fill();
    }

    // ------------------------------------------------------------ frame

    frame(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.t = now;
      if (!this.visible) return;
      this.step(dt);
      if (this.draw() !== false) {
        if (!this.first && ++this.framesShown === 3) this.markReady(true);
        // Capture immediately: a WebGL drawing buffer may be cleared after
        // this task. The overlay and the 3D canvas must be copied together.
        if (this.onFrame) this.onFrame(this);
      }
    }

    // Advance people and the cat; shared by the 2D and 3D renderers.
    step(dt) {
      const wall = Date.now();
      for (const [k, p] of this.people) {
        if (p.mode === 'wander') {
          if (p.poi && !p.path.length && p.until === Infinity) p.until = wall + p.stay;
          this.wander(p, wall);
        }
        if (p.path.length) {
          const n = p.path[0];
          const dx = n.x - p.x, dy = n.y - p.y, d = Math.hypot(dx, dy), v = SPEED * dt;
          if (d > 0.001) p.walkFace = dx + dy >= 0 ? 'front' : 'back';
          if (d <= v) { p.x = n.x; p.y = n.y; p.path.shift(); }
          else { p.x += (dx / d) * v; p.y += (dy / d) * v; }
        } else if (p.leaving) {
          this.people.delete(k);
        }
      }
      this.moveCat(dt, wall);
    }

    draw() {
      const c = this.ctx;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, this.cw, this.ch);
      this.fitCamera();
      c.translate(this.cam.ox, this.cam.oy);
      c.scale(this.cam.zoom, this.cam.zoom);

      this.drawRoom();
      const occupant = new Map();
      for (const p of this.people.values()) {
        if (p.mode === 'work' && p.desk) occupant.set(p.desk, p);
        else if (p.napDesk) occupant.set(p.napDesk, p);
      }
      const items = [...this.plan.items];
      for (const dk of this.plan.desks) {
        const p = occupant.get(dk);
        items.push({ depth: dk.x + 0.7 + dk.y + 0.4, draw: () => this.desk(dk, p) });
        items.push({ depth: dk.seat.x + dk.seat.y - 0.06, draw: () => this.chair(dk, p) });
      }
      for (const p of this.people.values()) items.push({ depth: p.x + p.y + 0.01, person: p });
      items.push({ depth: this.cat.x + this.cat.y, draw: () => this.drawCat() });
      items.sort((a, b) => a.depth - b.depth);

      this.hit = [];
      const heads = [];
      for (const it of items) {
        if (it.person) heads.push([it.person, this.person(it.person)]);
        else it.draw();
      }
      this.pingPongBall();
      if (this.compact) {
        // Keep labels readable when the room is scaled down for PiP.
        c.save();
        c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        for (const [p, at] of heads) this.bubble(p, {
          ...at, x: at.x * this.cam.zoom + this.cam.ox, y: at.y * this.cam.zoom + this.cam.oy,
        });
        c.restore();
      } else {
        for (const [p, at] of heads) this.bubble(p, at);
      }

      if (this.offDuty > 0) {
        const d = this.iso(0.2, this.plan.door.y + 0.9, 0);
        c.font = '600 10px ui-sans-serif, system-ui, -apple-system, "PingFang TC", sans-serif';
        c.textAlign = 'center';
        c.fillStyle = this.pal.text;
        c.globalAlpha = 0.65;
        c.fillText(`+${this.offDuty} ${this.offDutyLabel}`, d.x - 10, d.y + 14);
        c.globalAlpha = 1;
      }

      const z = this.cam.zoom;
      this.hit = this.hit.map((h) => ({
        key: h.key,
        x0: h.x0 * z + this.cam.ox, x1: h.x1 * z + this.cam.ox,
        y0: h.y0 * z + this.cam.oy, y1: h.y1 * z + this.cam.oy,
      }));
    }
  }

  window.Office = Office;
  window.OFFICE_AGENT_BADGES = AGENT_BADGES;
  window.OfficeGrid = Grid;
})();
