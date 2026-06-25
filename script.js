const STORAGE_KEY = 'braceletStudioByCalieV8';
const DEFAULT_COLORS = ['#A8D8F0','#3D5CB3','#EF0B0B','#90EAAE','#FFFFFF','#26408B','#F6C9D9','#7FC8B7','#111827','#F4E8B2','#7A4CBC','#13A4C8'];

const state = {
  type: 'normal',
  pattern: 'diamonds',
  threads: 9,
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
    state.threads = clamp(Number(state.threads) || 9, 3, 40);
    state.rows = clamp(Number(state.rows) || 18, 4, 80);
  } catch (e) {}
}
function normalizeColors() {
  state.colorCount = clamp(Number(state.colorCount) || 4, 2, 12);
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

/* Motif visuel : diamants, chevrons, rayures et cœurs */
function nearestDiamondCenter(col, row) {
  const periodX = 8, periodY = 8, baseX = 3.5, baseY = 3.5;
  let best = { d: Infinity, cx: baseX, cy: baseY };
  for (let ix=-2; ix<6; ix++) {
    for (let iy=-2; iy<8; iy++) {
      const cx = baseX + ix*periodX;
      const cy = baseY + iy*periodY;
      const d = Math.abs(col-cx) + Math.abs(row-cy);
      if (d < best.d) best = { d, cx, cy };
    }
  }
  return best;
}
function motifColorIndex(col, row) {
  const count = state.colorCount;
  if (state.pattern === 'stripes') return (Math.floor(col) + row) % count;
  if (state.pattern === 'chevrons') {
    const mid = (state.threads-1)/2;
    const dist = Math.abs(col - mid);
    return Math.floor(dist) % count;
  }
  if (state.pattern === 'hearts') {
    const cx = (state.threads-1)/2;
    const dy = row % 8;
    const dx = Math.abs(col-cx);
    if ((dy===1 && dx<1.2) || (dy===2 && dx<2.2) || (dy===3 && dx<3.2) || (dy===4 && dx<2.2) || (dy===5 && dx<1.1)) return 0;
    return (1 + Math.floor(col) + row) % count;
  }
  const { d } = nearestDiamondCenter(col, row);
  if (count <= 2) return d <= 2.4 ? 0 : 1;
  if (count === 3) {
    if (d <= 0.8) return 0;
    if (d <= 2.4) return 2;
    return 1;
  }
  if (d <= 0.8) return 0;
  if (d <= 2.2) return 4 % count; // often white
  if (d <= 3.7) return 1;
  if (d <= 4.9) return 3;
  return (Math.floor(d) + row) % count;
}
function threadColor(threadIndex, row=0) {
  return state.colors[motifColorIndex(threadIndex, row) % state.colors.length];
}
function knotType(row, leftThread) {
  if (state.pattern === 'chevrons') {
    const mid = (state.threads-1)/2;
    return leftThread < mid ? 'f' : 'b';
  }
  if (state.pattern === 'stripes') return row % 2 ? 'b' : 'f';
  if (state.pattern === 'hearts') {
    const cx = (state.threads-1)/2;
    if (Math.abs(leftThread-cx) < 1.5 && (row % 8) < 3) return row % 2 ? 'fb' : 'bf';
    return (leftThread + row) % 2 ? 'f' : 'b';
  }
  const { cx, cy } = nearestDiamondCenter(leftThread + .5, row);
  const dx = leftThread + .5 - cx;
  const dy = row - cy;
  if (Math.abs(dx) < 0.7 && Math.abs(dy) < 0.7) return 'bf';
  if (dx <= 0 && dy <= 0) return 'f';
  if (dx >= 0 && dy <= 0) return 'b';
  if (dx <= 0 && dy >= 0) return 'fb';
  return 'bf';
}

/* Important V7 : vraies paires de fils, donc pair OU impair. */
function buildKnotList() {
  const knots = [];
  for (let r=0; r<state.rows; r++) {
    const start = r % 2 === 0 ? 0 : 1;
    for (let left=start; left < state.threads - 1; left += 2) {
      knots.push({ row:r, left, right:left+1, type:knotType(r,left) });
    }
  }
  return knots;
}
function totalKnots() { return buildKnotList().length; }

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
function drawPreviewDiamond(ctx, x, y, w, h, fill, stroke='rgba(43,51,77,.28)') {
  ctx.save();
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
  // soft woven highlight
  ctx.beginPath();
  ctx.moveTo(x - w*0.22, y - h*0.18);
  ctx.lineTo(x + w*0.02, y - h*0.42);
  ctx.strokeStyle = 'rgba(255,255,255,.45)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // subtle shadow on lower-right edge
  ctx.beginPath();
  ctx.moveTo(x + w*0.05, y + h*0.40);
  ctx.lineTo(x + w*0.24, y + h*0.18);
  ctx.strokeStyle = 'rgba(0,0,0,.10)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}
function drawBandShape(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
function renderPreview() {
  const { width, height, ctx } = setCanvasSize(previewCanvas, 150);
  ctx.clearRect(0,0,width,height);

  // outer card
  ctx.fillStyle = '#fdfdff';
  roundRect(ctx, 0, 0, width, height, 18);
  ctx.fill();

  // bracelet band area
  const pad = 14;
  const bandX = pad;
  const bandY = 16;
  const bandW = width - pad*2;
  const bandH = height - 32;
  drawBandShape(ctx, bandX, bandY, bandW, bandH, 18);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#e6e8f4';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // little braided ends to feel more bracelet-like
  const endW = 10;
  ctx.save();
  drawBandShape(ctx, bandX, bandY, bandW, bandH, 18);
  ctx.clip();
  for (let i=0;i<3;i++) {
    const yy = bandY + 18 + i*18;
    ctx.strokeStyle = i%2 ? '#d7dff2' : '#edf1fa';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bandX + 2, yy);
    ctx.lineTo(bandX + 16, yy + 12);
    ctx.moveTo(bandX + 2, yy + 12);
    ctx.lineTo(bandX + 16, yy);
    ctx.moveTo(bandX + bandW - 16, yy);
    ctx.lineTo(bandX + bandW - 2, yy + 12);
    ctx.moveTo(bandX + bandW - 16, yy + 12);
    ctx.lineTo(bandX + bandW - 2, yy);
    ctx.stroke();
  }

  // preview motif: larger, cleaner diamonds closer to a real bracelet visual
  const rows = state.pattern === 'chevrons' ? 6 : 5;
  const tileH = Math.min(26, (bandH - 16) / rows);
  const tileW = tileH * 0.92;
  const xStep = tileW * 0.94;
  const yStep = tileH * 0.80;
  const startX = bandX + 18;
  const startY = bandY + (bandH - ((rows-1)*yStep + tileH)) / 2 + tileH/2;
  const cols = Math.ceil((bandW - 36) / xStep) + 1;

  for (let c=0; c<cols; c++) {
    for (let r=0; r<rows; r++) {
      const x = startX + c * xStep;
      const y = startY + r * yStep + (c % 2 ? tileH*0.38 : 0);
      const refCol = (c % Math.max(state.threads, 4));
      let color = state.colors[motifColorIndex(refCol, r) % state.colors.length];
      if (state.pattern === 'diamonds' && state.colorCount >= 4) {
        // make the central white/light areas cleaner and more intentional
        const d = nearestDiamondCenter(refCol, r).d;
        if (d <= 2.2) color = state.colors[Math.min(4, state.colors.length-1)];
      }
      drawPreviewDiamond(ctx, x, y, tileW, tileH, color);
    }
  }

  // soft horizontal yarn texture
  for (let i=0;i<6;i++) {
    const y = bandY + 10 + i * (bandH-20)/5;
    ctx.strokeStyle = 'rgba(255,255,255,.16)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(bandX + 14, y);
    ctx.lineTo(bandX + bandW - 14, y);
    ctx.stroke();
  }

  ctx.restore();
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

function textSVG(txt,x,y,cls,parent=svg) {
  const t = document.createElementNS('http://www.w3.org/2000/svg','text');
  t.textContent = txt; t.setAttribute('x',x); t.setAttribute('y',y); t.setAttribute('class',cls); parent.appendChild(t);
}
function lineSVG(x1,y1,x2,y2,cls,stroke,width,parent=svg) {
  const l = document.createElementNS('http://www.w3.org/2000/svg','line');
  l.setAttribute('x1',x1); l.setAttribute('y1',y1); l.setAttribute('x2',x2); l.setAttribute('y2',y2);
  l.setAttribute('class',cls); l.setAttribute('stroke',stroke); l.setAttribute('stroke-width',width); parent.appendChild(l);
}
function drawNode(x,y,fill,type,idx) {
  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
  g.setAttribute('class','node');
  if (state.done.has(idx)) g.classList.add('done');
  if (state.weave && idx === state.next) g.classList.add('next');

  const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
  circle.setAttribute('cx',x); circle.setAttribute('cy',y); circle.setAttribute('r',23); circle.setAttribute('fill',fill); g.appendChild(circle);

  const t = document.createElementNS('http://www.w3.org/2000/svg','text');
  const symbolMap = { f:'↘', b:'↙', fb:'↘↙', bf:'↙↘' };
  t.textContent = symbolMap[type] || '↘';
  t.setAttribute('x',x); t.setAttribute('y',y+1);
  t.setAttribute('class','knotText ' + (hexBrightness(fill) < 140 ? 'light' : ''));
  g.appendChild(t);

  g.addEventListener('click', () => onKnotClick(idx));
  svg.appendChild(g);
}
function drawUnpairedMarker(x,y) {
  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
  g.setAttribute('class','node unpaired');
  const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
  circle.setAttribute('cx',x); circle.setAttribute('cy',y); circle.setAttribute('r',15); g.appendChild(circle);
  const t = document.createElementNS('http://www.w3.org/2000/svg','text');
  t.textContent = 'repos';
  t.setAttribute('x',x); t.setAttribute('y',y+1); t.setAttribute('class','unpairedText'); g.appendChild(t);
  svg.appendChild(g);
}

function renderPattern() {
  const gapX = 72;
  const gapY = 62;
  const marginL = 82;
  const marginT = 78;
  const contentW = marginL*2 + (state.threads-1)*gapX;
  const contentH = marginT*2 + (state.rows-1)*gapY + 56;
  svg.setAttribute('viewBox', `0 0 ${contentW} ${contentH}`);
  svg.setAttribute('width', contentW * state.zoom);
  svg.setAttribute('height', contentH * state.zoom);
  svg.style.transform = `scale(${state.zoom})`;
  svg.innerHTML = '';

  // light vertical guides + top threads
  for (let t=0; t<state.threads; t++) {
    const x = marginL + t*gapX;
    lineSVG(x, marginT-46, x, marginT + (state.rows-1)*gapY + 44, 'threadColumnGuide', '#ecedf5', 2);
    lineSVG(x, marginT-54, x, marginT-24, 'threadStart', threadColor(t,0), 14);
    if (state.showLetters) {
      textSVG(letter(t), x, 34, 'axisText');
      textSVG(letter(t), x, contentH-18, 'axisText');
    }
  }

  if (state.showRows) {
    for (let r=0; r<state.rows; r++) {
      const y = marginT + r*gapY + 6;
      textSVG(String(r+1), 44, y, 'rowText');
      textSVG(String(r+1), contentW-18, y, 'rowText');
    }
  }

  let idx = 0;
  for (let r=0; r<state.rows; r++) {
    const start = r % 2 === 0 ? 0 : 1;
    const y = marginT + r*gapY;

    // visual marker for thread resting alone on odd/even alternating rows
    if (state.threads % 2 === 1) {
      const restingThread = start === 0 ? state.threads - 1 : 0;
      const restX = marginL + restingThread * gapX;
      drawUnpairedMarker(restX, y);
    }

    for (let left=start; left<state.threads-1; left+=2) {
      const right = left + 1;
      const x1 = marginL + left * gapX;
      const x2 = marginL + right * gapX;
      const x = (x1 + x2) / 2;
      const type = knotType(r,left);
      const colorLeft = threadColor(left,r);
      const colorRight = threadColor(right,r);
      const mainFirst = type === 'f' || type === 'fb';
      lineSVG(x1, y-25, x2, y+25, 'threadLine' + (mainFirst ? '' : ' threadGhost'), colorLeft, mainFirst ? 13 : 9);
      lineSVG(x2, y-25, x1, y+25, 'threadLine' + (!mainFirst ? '' : ' threadGhost'), colorRight, !mainFirst ? 13 : 9);
      const fill = state.colors[motifColorIndex(left + .5, r) % state.colors.length];
      drawNode(x,y,fill,type,idx++);
    }
  }

  const note = document.createElementNS('http://www.w3.org/2000/svg','text');
  note.textContent = 'Version 8 · Aperçu du bracelet amélioré · Créé avec Calie';
  note.setAttribute('x', marginL);
  note.setAttribute('y', contentH - 42);
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
function currentKnotMeta() {
  const knots = buildKnotList();
  if (!knots.length) return { row:0, left:0, right:1, type:'f', fill:state.colors[0], leftColor:state.colors[0], rightColor:state.colors[1] || state.colors[0] };
  const idx = clamp(state.next, 0, Math.max(0, knots.length-1));
  const k = knots[idx];
  return {
    idx,
    row:k.row,
    left:k.left,
    right:k.right,
    type:k.type,
    fill: state.colors[motifColorIndex(k.left + .5, k.row) % state.colors.length],
    leftColor: threadColor(k.left,k.row),
    rightColor: threadColor(k.right,k.row)
  };
}
function renderCurrentKnotPreview() {
  const { type, fill, leftColor, rightColor, row, left } = currentKnotMeta();
  const symbol = { f:'↘', b:'↙', fb:'↘↙', bf:'↙↘' }[type];
  currentKnotPreview.innerHTML = `
    <line x1="35" y1="20" x2="125" y2="118" stroke="${leftColor}" stroke-width="16" stroke-linecap="round" opacity="${type==='f'||type==='fb'?'1':'.45'}" />
    <line x1="125" y1="20" x2="35" y2="118" stroke="${rightColor}" stroke-width="16" stroke-linecap="round" opacity="${type==='b'||type==='bf'?'1':'.45'}" />
    <circle cx="80" cy="70" r="30" fill="${fill}" stroke="#1f2a44" stroke-width="2" />
    <text x="80" y="72" text-anchor="middle" dominant-baseline="middle" font-size="28" font-weight="900" fill="${hexBrightness(fill)<140?'#fff':'#101625'}">${symbol}</text>
  `;
  $('#currentKnotText').textContent = `Fais le nœud entre les fils ${letter(left)} et ${letter(left+1)}, rangée ${row+1}.`;
}
function renderInfo() {
  $('#threadsValue').textContent = state.threads;
  $('#rowsValue').textContent = state.rows;
  $('#patternSelect').value = state.pattern;
  $('#showRows').checked = state.showRows;
  $('#showLetters').checked = state.showLetters;
  $('#showPreviewGrid').checked = state.showPreviewGrid;
  document.querySelectorAll('.typeBtn').forEach(btn => btn.classList.toggle('active', btn.dataset.type === state.type));

  const patternLabel = $('#patternSelect').selectedOptions[0].textContent;
  $('#summaryLabel').innerHTML = `${state.type === 'alpha' ? 'Alpha' : 'Normal'} · ${patternLabel} · <b>${state.threads} fils</b> · ${state.colorCount} couleurs`;
  $('#modeBadge').textContent = state.weave ? 'Mode tissage actif' : 'Mode normal';
  $('#modeBadge').style.background = state.weave ? '#e8fff0' : '#eef2ff';
  $('#modeBadge').style.color = state.weave ? '#18803d' : '#4954cf';
  $('#weaveStateBadge').textContent = state.weave ? 'Actif' : 'Inactif';
  $('#weaveStateBadge').classList.toggle('active', state.weave);

  $('#infoBox').innerHTML = `
    Type : <b>${state.type === 'alpha' ? 'Alpha' : 'Normal'}</b><br>
    Fils : <b>${state.threads}</b> ${state.threads % 2 ? '· impair' : '· pair'}<br>
    Rangées : <b>${state.rows}</b><br>
    Motif : <b>${patternLabel}</b><br>
    Couleurs : <b>${state.colorCount}</b><br>
    Nœuds : <b>${totalKnots()}</b>
  `;

  const total = totalKnots();
  state.next = clamp(state.next, 0, total);
  const doneCount = state.done.size;
  const percent = total ? Math.round((doneCount/total)*100) : 0;
  const meta = currentKnotMeta();
  $('#weaveProgressText').textContent = `Rangée ${meta.row + 1} sur ${state.rows} · ${doneCount}/${total} nœuds`;
  $('#weaveProgressFill').style.width = `${percent}%`;
}
function renderAll() {
  normalizeColors();
  // remove invalid done values after thread/row changes
  const max = totalKnots();
  state.done = new Set([...state.done].filter(v => v >= 0 && v < max));
  state.next = clamp(state.next, 0, max);
  renderPalette();
  renderInfo();
  renderPreview();
  renderPattern();
  renderCurrentKnotPreview();
  saveState();
}
function resetProject() {
  state.done = new Set();
  state.next = 0;
}
function exportPreviewPng() {
  const link = document.createElement('a');
  link.download = 'bracelet-studio-by-calie-v8.png';
  link.href = previewCanvas.toDataURL('image/png');
  link.click();
}
function bindUI() {
  document.querySelectorAll('.typeBtn').forEach(btn => btn.onclick = () => { state.type = btn.dataset.type; resetProject(); renderAll(); });

  // V7 : + / - par 1, pour accepter les fils impairs
  $('#threadsMinus').onclick = () => { state.threads = clamp(state.threads - 1, 3, 40); resetProject(); renderAll(); };
  $('#threadsPlus').onclick = () => { state.threads = clamp(state.threads + 1, 3, 40); resetProject(); renderAll(); };

  $('#rowsMinus').onclick = () => { state.rows = clamp(state.rows - 1, 4, 80); resetProject(); renderAll(); };
  $('#rowsPlus').onclick = () => { state.rows = clamp(state.rows + 1, 4, 80); resetProject(); renderAll(); };
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
  $('#resetWeaveBtn').onclick = () => { resetProject(); renderAll(); };
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
