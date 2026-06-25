const STORAGE_KEY = 'braceletStudioByCalieV6';
const DEFAULT_COLORS = ['#A8D8F0','#3D5CB3','#FFFFFF','#8FCBEA','#C7D1E3','#26408B','#F6C9D9','#7FC8B7','#111827','#F4E8B2','#7A4CBC','#13A4C8'];

const state = {
  type: 'normal',
  pattern: 'diamonds',
  threads: 12,
  rows: 18,
  colorCount: 4,
  colors: DEFAULT_COLORS.slice(0,4),
  showRows: true,
  showLetters: true,
  showPreviewGrid: true,
  zoom: 1,
  weave: true,
  next: 0,
  done: new Set(),
};

const $ = (s) => document.querySelector(s);
const svg = $('#patternSvg');
const scroller = $('#patternScroller');
const previewCanvas = $('#previewCanvas');
const previewCtx = previewCanvas.getContext('2d');
const currentKnotPreview = $('#currentKnotPreview');

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, done: [...state.done] }));
}
function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw) return;
    Object.assign(state, raw);
    state.done = new Set(raw.done || []);
    normalizeColors();
  } catch (e) {}
}

function normalizeColors() {
  while (state.colors.length < state.colorCount) {
    state.colors.push(DEFAULT_COLORS[state.colors.length % DEFAULT_COLORS.length]);
  }
  if (state.colors.length > state.colorCount) state.colors = state.colors.slice(0, state.colorCount);
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function hexBrightness(hex) {
  const n = parseInt(hex.slice(1),16); const r=(n>>16)&255, g=(n>>8)&255, b=n&255;
  return (r*299 + g*587 + b*114)/1000;
}
function letter(i) {
  let s='';
  do { s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26) - 1; } while (i >= 0);
  return s;
}

function nearestDiamondCenter(col, row) {
  const periodX = 8;
  const periodY = 8;
  const cxCandidates = [];
  const cyCandidates = [];
  const baseX = 3.5;
  const baseY = 3.5;
  for (let k=-1;k<=3;k++) cxCandidates.push(baseX + k*periodX);
  for (let k=-1;k<=3;k++) cyCandidates.push(baseY + k*periodY);
  let best = { d: Infinity, cx: baseX, cy: baseY };
  for (const cx of cxCandidates) {
    for (const cy of cyCandidates) {
      const d = Math.abs(col-cx) + Math.abs(row-cy);
      if (d < best.d) best = { d, cx, cy };
    }
  }
  return best;
}

function motifColorIndex(col, row) {
  const count = state.colorCount;
  if (state.pattern === 'stripes') return (Math.floor(col/2) + row) % count;
  if (state.pattern === 'chevrons') {
    const mid = (state.threads-1)/2;
    const dist = Math.abs(col - mid);
    return Math.floor(dist) % count;
  }
  if (state.pattern === 'hearts') {
    const cx = (state.threads-1)/2;
    const dy = row % 8;
    const dx = Math.abs(col-cx);
    if ((dy===1 && dx<1) || (dy===2 && dx<2) || (dy===3 && dx<3) || (dy===4 && dx<2) || (dy===5 && dx<1)) return 0;
    return (1 + col + row) % count;
  }
  // diamonds - inspired by the user's sample visual.
  const { d, cx, cy } = nearestDiamondCenter(col, row);
  if (count <= 2) return d <= 2 ? 0 : 1;
  if (count === 3) {
    if (d <= 0.7) return 0;
    if (d <= 2.2) return 1;
    return 2;
  }
  // 4+ colors: center, inner white, dark border, light outer diamonds, extras repeat around
  if (d <= 0.7) return 0;
  if (d <= 2.1) return 2;
  if (d <= 3.6) return 1;
  if (d <= 4.7) return 3;
  return (4 + Math.floor(d)) % count;
}

function renderPalette() {
  normalizeColors();
  $('#colorsValue').textContent = state.colorCount;
  const list = $('#paletteList');
  list.innerHTML = '';
  state.colors.forEach((hex, i) => {
    const row = document.createElement('div');
    row.className = 'palette-row';
    row.innerHTML = `
      <div class="index-badge">${i+1}</div>
      <button class="palette-swatch" title="Modifier la couleur ${i+1}" style="background:${hex}"></button>
      <code>${hex.toUpperCase()}</code>
      <button class="icon-btn ghost" title="Supprimer la couleur">✕</button>
    `;
    row.querySelector('.palette-swatch').onclick = () => {
      const picker = $('#colorPicker');
      picker.value = hex;
      picker.oninput = (e) => {
        state.colors[i] = e.target.value.toUpperCase();
        renderAll();
      };
      picker.click();
    };
    row.querySelector('.icon-btn').onclick = () => {
      if (state.colorCount <= 2) return;
      state.colors.splice(i,1);
      state.colorCount--;
      normalizeColors();
      renderAll();
    };
    list.appendChild(row);
  });
}

function setCanvasSize(canvas, cssHeight) {
  const width = canvas.clientWidth || canvas.parentElement.clientWidth;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return { width, height: cssHeight, ctx };
}

function drawDiamondTile(ctx, x, y, w, h, fill, stroke='#32415c') {
  ctx.beginPath();
  ctx.moveTo(x, y - h/2);
  ctx.lineTo(x + w/2, y);
  ctx.lineTo(x, y + h/2);
  ctx.lineTo(x - w/2, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function renderPreview() {
  const { width, height, ctx } = setCanvasSize(previewCanvas, 140);
  ctx.clearRect(0,0,width,height);
  ctx.fillStyle = '#fff';
  roundRect(ctx, 0, 0, width, height, 16); ctx.fill();
  const cols = Math.max(22, Math.floor(width / 24));
  const rows = 7;
  const tileW = Math.min(22, width / cols);
  const tileH = tileW * 1.25;
  const startX = tileW;
  const startY = height/2 - (rows-1) * tileH*0.42;

  if (state.showPreviewGrid) {
    for (let r=0; r<rows; r++) {
      for (let c=0; c<cols; c++) {
        const x = startX + c * tileW * 0.95;
        const y = startY + r * tileH * 0.8 + ((c%2) ? tileH*0.4 : 0);
        const color = state.colors[motifColorIndex((c%8), r) % state.colors.length];
        drawDiamondTile(ctx, x, y, tileW, tileH, color, 'rgba(43,51,77,.35)');
      }
    }
  } else {
    for (let c=0; c<cols; c++) {
      const x = startX + c * tileW * 0.95;
      const color = state.colors[c % state.colors.length];
      drawDiamondTile(ctx, x, height/2, tileW, tileH*4.3, color, 'rgba(43,51,77,.18)');
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

function knotType(r, c) {
  if (state.pattern === 'chevrons') {
    return c < state.threads/2 ? 'f' : 'b';
  }
  if (state.pattern === 'stripes') {
    return r % 2 ? 'b' : 'f';
  }
  if (state.pattern === 'hearts') {
    const cx = (state.threads-1)/2;
    if (Math.abs(c-cx) < 1.5 && (r % 8) < 3) return (r % 2 ? 'fb' : 'bf');
    return (c + r) % 2 ? 'f' : 'b';
  }
  // diamonds
  const { cx, cy } = nearestDiamondCenter(c, r);
  const dx = c - cx;
  const dy = r - cy;
  if (Math.abs(dx) < 0.7 && Math.abs(dy) < 0.7) return 'bf';
  if (dx <= 0 && dy <= 0) return 'f';
  if (dx >= 0 && dy <= 0) return 'b';
  if (dx <= 0 && dy >= 0) return 'fb';
  return 'bf';
}

function nodeFillColor(r,c) {
  const idx = motifColorIndex(c,r) % state.colors.length;
  return state.colors[idx];
}

function textSVG(txt,x,y,cls) {
  const t = document.createElementNS('http://www.w3.org/2000/svg','text');
  t.textContent = txt; t.setAttribute('x',x); t.setAttribute('y',y); t.setAttribute('class',cls); svg.appendChild(t);
}
function lineSVG(x1,y1,x2,y2,cls,stroke,width) {
  const l = document.createElementNS('http://www.w3.org/2000/svg','line');
  l.setAttribute('x1',x1); l.setAttribute('y1',y1); l.setAttribute('x2',x2); l.setAttribute('y2',y2);
  l.setAttribute('class',cls); l.setAttribute('stroke',stroke); l.setAttribute('stroke-width',width); svg.appendChild(l);
}
function drawThreadPair(x,y,w,h,colorA,colorB,type) {
  // two crossing threads, inspired by the visual shared by the user.
  if (type === 'f' || type === 'fb') {
    lineSVG(x - w/2, y - h/2, x + w/2, y + h/2, 'threadLine', colorA, 12);
    lineSVG(x + w/2, y - h/2, x - w/2, y + h/2, 'threadLine threadGhost', colorB, 9);
  } else {
    lineSVG(x + w/2, y - h/2, x - w/2, y + h/2, 'threadLine', colorB, 12);
    lineSVG(x - w/2, y - h/2, x + w/2, y + h/2, 'threadLine threadGhost', colorA, 9);
  }
}
function drawNode(x,y,fill,type,idx) {
  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
  g.setAttribute('class','node');
  if (state.done.has(idx)) g.classList.add('done');
  if (state.weave && idx === state.next) g.classList.add('next');
  const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
  circle.setAttribute('cx',x); circle.setAttribute('cy',y); circle.setAttribute('r',24); circle.setAttribute('fill',fill); g.appendChild(circle);
  const t = document.createElementNS('http://www.w3.org/2000/svg','text');
  const symbolMap = { f:'↘', b:'↙', fb:'↘↙', bf:'↙↘' };
  t.textContent = symbolMap[type] || '↘';
  t.setAttribute('x',x); t.setAttribute('y',y+1);
  t.setAttribute('class','knotText ' + (hexBrightness(fill) < 140 ? 'light' : ''));
  g.appendChild(t);
  g.addEventListener('click', () => onKnotClick(idx));
  svg.appendChild(g);
}

function getKnotPosition(r,c,gapX,gapY,marginL,marginT) {
  const offset = (r % 2) ? gapX/2 : 0;
  return { x: marginL + offset + c*gapX, y: marginT + r*gapY };
}

function renderPattern() {
  const knotCols = state.threads - 1;
  const gapX = 72;
  const gapY = 62;
  const marginL = 78;
  const marginT = 72;
  const contentW = marginL*2 + knotCols*gapX + gapX;
  const contentH = marginT*2 + state.rows*gapY;
  svg.setAttribute('viewBox', `0 0 ${contentW} ${contentH}`);
  svg.setAttribute('width', contentW * state.zoom);
  svg.setAttribute('height', contentH * state.zoom);
  svg.style.transform = `scale(${state.zoom})`;
  svg.innerHTML = '';

  if (state.showLetters) {
    for (let c=0; c<state.threads; c++) {
      const x = marginL + c * gapX - (gapX/2);
      textSVG(letter(c), x, 34, 'axisText');
    }
  }
  if (state.showRows) {
    for (let r=0; r<state.rows; r++) {
      const y = marginT + r*gapY + 6;
      textSVG(String(r+1), 40, y, 'rowText');
      textSVG(String(r+1), contentW-18, y, 'rowText');
    }
  }

  let idx = 0;
  for (let r=0; r<state.rows; r++) {
    for (let c=0; c<knotCols; c++) {
      const {x,y} = getKnotPosition(r,c,gapX,gapY,marginL,marginT);
      const colorA = nodeFillColor(r,c);
      const colorB = nodeFillColor(r,c+1);
      const type = knotType(r,c);
      drawThreadPair(x,y,52,52,colorA,colorB,type);
      drawNode(x,y,nodeFillColor(r,c),type,idx++);
    }
  }
  const note = document.createElementNS('http://www.w3.org/2000/svg','text');
  note.textContent = 'Version 6 · Correctif iPad · Visuel choisi par Calie';
  note.setAttribute('x', marginL);
  note.setAttribute('y', contentH - 18);
  note.setAttribute('class','footer-note');
  svg.appendChild(note);
}

function onKnotClick(idx) {
  if (!state.weave) return;
  if (idx > state.next) return;
  state.done.add(idx);
  while (state.done.has(state.next) && state.next < totalKnots()) state.next++;
  renderAll();
}
function totalKnots() { return state.rows * (state.threads - 1); }

function currentKnotMeta() {
  const knotCols = state.threads - 1;
  const idx = clamp(state.next, 0, Math.max(0, totalKnots()-1));
  const row = Math.floor(idx / knotCols);
  const col = idx % knotCols;
  return { idx, row, col, type: knotType(row,col), fill: nodeFillColor(row,col), left: nodeFillColor(row,col), right: nodeFillColor(row,col+1) };
}

function renderCurrentKnotPreview() {
  const { type, fill, left, right, row, col } = currentKnotMeta();
  const symbol = { f:'↘', b:'↙', fb:'↘↙', bf:'↙↘' }[type];
  currentKnotPreview.innerHTML = `
    <line x1="35" y1="20" x2="78" y2="63" stroke="${left}" stroke-width="16" stroke-linecap="round" />
    <line x1="125" y1="20" x2="82" y2="63" stroke="${right}" stroke-width="16" stroke-linecap="round" />
    <line x1="35" y1="118" x2="78" y2="75" stroke="${left}" stroke-width="16" stroke-linecap="round" opacity=".92" />
    <line x1="125" y1="118" x2="82" y2="75" stroke="${right}" stroke-width="16" stroke-linecap="round" opacity=".45" />
    <circle cx="80" cy="70" r="30" fill="${fill}" stroke="#1f2a44" stroke-width="2" />
    <text x="80" y="72" text-anchor="middle" dominant-baseline="middle" font-size="28" font-weight="900" fill="${hexBrightness(fill)<140?'#fff':'#101625'}">${symbol}</text>
  `;
  const rowNumber = row + 1;
  const knotNumber = col + 1;
  $('#currentKnotText').textContent = `Fais le nœud ${knotNumber} de la rangée ${rowNumber}.`;
}

function renderInfo() {
  $('#threadsValue').textContent = state.threads;
  $('#rowsValue').textContent = state.rows;
  $('#patternSelect').value = state.pattern;
  $('#showRows').checked = state.showRows;
  $('#showLetters').checked = state.showLetters;
  $('#showPreviewGrid').checked = state.showPreviewGrid;
  document.querySelectorAll('.typeBtn').forEach(btn => btn.classList.toggle('active', btn.dataset.type === state.type));
  $('#summaryLabel').textContent = `${state.type === 'alpha' ? 'Alpha' : 'Normal'} · ${$('#patternSelect').selectedOptions[0].textContent} · ${state.colorCount} couleurs`;
  $('#modeBadge').textContent = state.weave ? 'Mode tissage actif' : 'Mode normal';
  $('#modeBadge').style.background = state.weave ? '#e8fff0' : '#eef2ff';
  $('#modeBadge').style.color = state.weave ? '#18803d' : '#4954cf';
  $('#weaveStateBadge').textContent = state.weave ? 'Actif' : 'Inactif';
  $('#weaveStateBadge').classList.toggle('active', state.weave);
  $('#infoBox').innerHTML = `
    Type : <b>${state.type === 'alpha' ? 'Alpha' : 'Normal'}</b><br>
    Fils : <b>${state.threads}</b><br>
    Rangées : <b>${state.rows}</b><br>
    Motif : <b>${$('#patternSelect').selectedOptions[0].textContent}</b><br>
    Couleurs : <b>${state.colorCount}</b><br>
    Nœuds : <b>${totalKnots()}</b>
  `;

  const doneCount = state.done.size;
  const total = totalKnots();
  const percent = total ? Math.round((doneCount/total)*100) : 0;
  const meta = currentKnotMeta();
  $('#weaveProgressText').textContent = `Rangée ${meta.row + 1} sur ${state.rows} · Nœud ${meta.col + 1}`;
  $('#weaveProgressFill').style.width = `${percent}%`;
}

function renderAll() {
  normalizeColors();
  renderPalette();
  renderInfo();
  renderPreview();
  renderPattern();
  renderCurrentKnotPreview();
  saveState();
}

function exportPreviewPng() {
  const link = document.createElement('a');
  link.download = 'bracelet-studio-by-calie-v5.png';
  link.href = previewCanvas.toDataURL('image/png');
  link.click();
}

function resetProject() {
  state.done = new Set();
  state.next = 0;
  state.zoom = 1;
}

function bindUI() {
  document.querySelectorAll('.typeBtn').forEach(btn => btn.onclick = () => { state.type = btn.dataset.type; renderAll(); });
  $('#threadsMinus').onclick = () => { state.threads = clamp(state.threads - 2, 6, 24); renderAll(); };
  $('#threadsPlus').onclick = () => { state.threads = clamp(state.threads + 2, 6, 24); renderAll(); };
  $('#rowsMinus').onclick = () => { state.rows = clamp(state.rows - 1, 6, 60); renderAll(); };
  $('#rowsPlus').onclick = () => { state.rows = clamp(state.rows + 1, 6, 60); renderAll(); };
  $('#colorsMinus').onclick = () => { state.colorCount = clamp(state.colorCount - 1, 2, 12); normalizeColors(); renderAll(); };
  $('#colorsPlus').onclick = () => { state.colorCount = clamp(state.colorCount + 1, 2, 12); normalizeColors(); renderAll(); };
  $('#addColorBtn').onclick = () => { state.colorCount = clamp(state.colorCount + 1, 2, 12); normalizeColors(); renderAll(); };
  $('#patternSelect').onchange = (e) => { state.pattern = e.target.value; resetProject(); renderAll(); };
  $('#showRows').onchange = (e) => { state.showRows = e.target.checked; renderAll(); };
  $('#showLetters').onchange = (e) => { state.showLetters = e.target.checked; renderAll(); };
  $('#showPreviewGrid').onchange = (e) => { state.showPreviewGrid = e.target.checked; renderAll(); };
  $('#newBtn').onclick = () => { if (confirm('Créer un nouveau patron ?')) { resetProject(); renderAll(); } };
  $('#saveBtn').onclick = () => { saveState(); alert('Projet sauvegardé sur cet iPad / navigateur.'); };
  $('#exportBtn').onclick = exportPreviewPng;
  $('#weaveToggle').onclick = () => { state.weave = !state.weave; renderAll(); };
  $('#prevKnotBtn').onclick = () => {
    if (state.next <= 0) return;
    state.next = clamp(state.next - 1, 0, totalKnots()-1);
    state.done.delete(state.next);
    renderAll();
  };
  $('#nextKnotBtn').onclick = () => {
    if (state.next >= totalKnots()) return;
    state.done.add(state.next);
    state.next = clamp(state.next + 1, 0, totalKnots());
    renderAll();
  };
  $('#resetWeaveBtn').onclick = () => { state.done = new Set(); state.next = 0; renderAll(); };
  $('#zoomInBtn').onclick = () => { state.zoom = clamp(state.zoom + 0.1, 0.7, 2); renderAll(); };
  $('#zoomOutBtn').onclick = () => { state.zoom = clamp(state.zoom - 0.1, 0.7, 2); renderAll(); };
  $('#zoomResetBtn').onclick = () => { state.zoom = 1; renderAll(); };

  let pinchDistance = 0;
  scroller.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx,dy);
    if (pinchDistance) {
      state.zoom = clamp(state.zoom + (dist - pinchDistance)/320, 0.7, 2);
      renderPattern();
    }
    pinchDistance = dist;
  }, { passive:false });
  scroller.addEventListener('touchend', () => { pinchDistance = 0; saveState(); });
  window.addEventListener('resize', renderPreview);
}

loadState();
bindUI();
renderAll();
