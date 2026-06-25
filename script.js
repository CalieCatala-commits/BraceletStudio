const STORAGE_KEY = 'braceletStudioByCalieV20';
const DEFAULT_COLORS = ['#A8D8F0','#3D5CB3','#EF0B0B','#90EAAE','#FFFFFF','#26408B','#F6C9D9','#7FC8B7','#111827','#F4E8B2','#7A4CBC','#13A4C8'];

const state = {
  type: 'normal',
  threads: 9,
  rows: 18,
  motifWidth: 14,
  motifHeight: 7,
  colorCount: 4,
  colors: DEFAULT_COLORS.slice(0,4),
  selectedColor: 1,
  showRows: true,
  showLetters: true,
  showPreviewGrid: true,
  previewStyle: 'knots',
  editKnots: false,
  editColors: false,
  customKnots: {},
  customColors: {},
  zoom: 1,
  weave: true,
  next: 0,
  done: new Set(),
  motif: []
};

const $ = (s) => document.querySelector(s);
const svg = $('#patternSvg');
const motifSvg = $('#motifSvg');
const scroller = $('#patternScroller');
const previewCanvas = $('#previewCanvas');
const currentKnotPreview = $('#currentKnotPreview');

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, done: [...state.done] }));
}
function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw) return;
    Object.assign(state, raw);
    state.done = new Set(raw.done || []);
  } catch {}
  normalizeAll();
}
function normalizeAll() {
  state.threads = clamp(Number(state.threads)||9, 3, 40);
  state.rows = clamp(Number(state.rows)||18, 4, 90);
  state.motifWidth = clamp(Number(state.motifWidth)||14, 4, 40);
  state.motifHeight = clamp(Number(state.motifHeight)||7, 3, 24);
  state.colorCount = clamp(Number(state.colorCount)||4, 2, 12);
  while (state.colors.length < state.colorCount) state.colors.push(DEFAULT_COLORS[state.colors.length % DEFAULT_COLORS.length]);
  if (state.colors.length > state.colorCount) state.colors = state.colors.slice(0, state.colorCount);
  state.selectedColor = clamp(Number(state.selectedColor)||0, 0, state.colorCount-1);
  if (!['knots','circles','diamonds'].includes(state.previewStyle)) state.previewStyle = 'knots';
  ensureMotif();
}
function ensureMotif() {
  if (!Array.isArray(state.motif)) state.motif = [];
  if (!state.customKnots || typeof state.customKnots !== 'object') state.customKnots = {};
  if (!state.customColors || typeof state.customColors !== 'object') state.customColors = {};
  const old = state.motif;
  const next = [];
  for (let r=0;r<state.motifHeight;r++) {
    next[r] = [];
    for (let c=0;c<state.motifWidth;c++) {
      next[r][c] = old[r]?.[c] ?? diamondPresetColor(c,r,state.motifWidth,state.motifHeight);
      next[r][c] = clamp(next[r][c], 0, state.colorCount-1);
    }
  }
  state.motif = next;
}
function letter(i) {
  let s='';
  do { s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26) - 1; } while (i >= 0);
  return s;
}
function hexBrightness(hex) {
  const n = parseInt(hex.slice(1),16); const r=(n>>16)&255, g=(n>>8)&255, b=n&255;
  return (r*299 + g*587 + b*114)/1000;
}
function colorAtMotif(col,row) {
  const r = ((row % state.motifHeight) + state.motifHeight) % state.motifHeight;
  const c = ((Math.floor(col) % state.motifWidth) + state.motifWidth) % state.motifWidth;
  return state.motif[r][c] % state.colors.length;
}
function threadColor(threadIndex,row=0) {
  return state.colors[colorAtMotif(threadIndex,row)];
}
function knotFill(left,row) {
  return state.colors[nodeColorIndex(row,left)];
}
function diamondPresetColor(c,r,w=state.motifWidth,h=state.motifHeight) {
  const midX=(w-1)/2, midY=(h-1)/2;
  const d=Math.abs(c-midX)+Math.abs(r-midY)*1.35;
  if (state.colorCount <= 2) return d<3 ? 0 : 1;
  if (d<.8) return 0;
  if (d<2.4) return Math.min(4,state.colorCount-1);
  if (d<4.0) return 1 % state.colorCount;
  return 3 % state.colorCount;
}
function setPreset(kind) {
  for (let r=0;r<state.motifHeight;r++) {
    for (let c=0;c<state.motifWidth;c++) {
      if (kind === 'clear') state.motif[r][c] = 0;
      else if (kind === 'checker') state.motif[r][c] = (c+r)%state.colorCount;
      else if (kind === 'stripe') state.motif[r][c] = c%state.colorCount;
      else state.motif[r][c] = diamondPresetColor(c,r);
    }
  }
  state.customKnots = {};
  state.customColors = {};
  resetWeave();
  renderAll();
}

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
function totalKnots(){ return buildKnotList().length; }
function knotKey(row,left) {
  return `${row}-${left}`;
}
function customColorKey(row,left) {
  return `${row}-${left}`;
}
function nodeColorIndex(row,left) {
  const key = customColorKey(row,left);
  if (state.customColors && state.customColors[key] !== undefined) {
    return state.customColors[key] % state.colors.length;
  }
  return colorAtMotif(left + .5, row);
}
function setNodeColor(row,left,colorIndex) {
  state.customColors[customColorKey(row,left)] = colorIndex % state.colors.length;
}
function autoKnotType(row,left) {
  const a=colorAtMotif(left,row);
  const b=colorAtMotif(left+1,row);
  const belowA=colorAtMotif(left,row+1);
  const belowB=colorAtMotif(left+1,row+1);
  if (a !== b && belowA === b) return 'f';
  if (a !== b && belowB === a) return 'b';
  if ((left + row) % 4 === 0) return 'fb';
  if ((left + row) % 4 === 3) return 'bf';
  return left < (state.threads-1)/2 ? 'f' : 'b';
}
function knotType(row,left) {
  return state.customKnots?.[knotKey(row,left)] || autoKnotType(row,left);
}
function cycleKnotType(row,left) {
  const order = ['f','b','fb','bf'];
  const key = knotKey(row,left);
  const current = knotType(row,left);
  const next = order[(order.indexOf(current) + 1) % order.length];
  state.customKnots[key] = next;
}
function cleanCustomEdits() {
  const valid = new Set(buildKnotList().map(k => knotKey(k.row,k.left)));
  for (const key of Object.keys(state.customKnots || {})) {
    if (!valid.has(key)) delete state.customKnots[key];
  }
  for (const key of Object.keys(state.customColors || {})) {
    if (!valid.has(key)) delete state.customColors[key];
  }
}

function setCanvasSize(canvas, cssHeight) {
  const width = canvas.clientWidth || canvas.parentElement.clientWidth;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width*dpr);
  canvas.height = Math.floor(cssHeight*dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return {width,height:cssHeight,ctx};
}
function roundRect(ctx,x,y,w,h,r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
function diamondPath(ctx,cx,cy,w,h) {
  ctx.beginPath();
  ctx.moveTo(cx,cy-h/2);
  ctx.lineTo(cx+w/2,cy);
  ctx.lineTo(cx,cy+h/2);
  ctx.lineTo(cx-w/2,cy);
  ctx.closePath();
}
function fillDiamond(ctx,cx,cy,w,h,fill,stroke='rgba(22,31,55,.32)') {
  diamondPath(ctx,cx,cy,w,h);
  ctx.fillStyle=fill; ctx.fill();
  ctx.strokeStyle=stroke; ctx.lineWidth=1.05; ctx.stroke();
  ctx.save(); diamondPath(ctx,cx,cy,w,h); ctx.clip();
  ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=1.2;
  ctx.beginPath(); ctx.moveTo(cx-w*.22,cy-h*.15); ctx.lineTo(cx+w*.04,cy-h*.40); ctx.stroke();
  ctx.restore();
}
function renderPreview() {
  const {width,height,ctx}=setCanvasSize(previewCanvas,180);
  ctx.clearRect(0,0,width,height);

  ctx.fillStyle='#fff';
  roundRect(ctx,0,0,width,height,20);
  ctx.fill();

  const padX=24, padY=18;
  const bandX=padX, bandY=padY, bandW=width-padX*2, bandH=height-padY*2;

  ctx.save();
  ctx.shadowColor='rgba(15,23,42,.10)';
  ctx.shadowBlur=16;
  ctx.shadowOffsetY=4;
  ctx.fillStyle='#fff';
  roundRect(ctx,bandX,bandY,bandW,bandH,18);
  ctx.fill();
  ctx.restore();

  roundRect(ctx,bandX,bandY,bandW,bandH,18);
  ctx.fillStyle='#fbfdff';
  ctx.fill();
  ctx.strokeStyle='#dfe4f4';
  ctx.lineWidth=1.2;
  ctx.stroke();

  ctx.save();
  roundRect(ctx,bandX,bandY,bandW,bandH,18);
  ctx.clip();

  const knots = buildKnotList();
  const rows = Math.max(1,state.rows);
  const maxKnotsInRow = Math.ceil(state.threads / 2);

  const tileH = clamp((bandH - 32) / (rows * .62), 14, 32);
  const tileW = tileH * .92;
  const xStep = tileW * .86;
  const yStep = tileH * .62;

  const blockW = (maxKnotsInRow - 1) * xStep + tileW * 1.9;
  const blockH = (rows - 1) * yStep + tileH * 1.1;
  const startX = bandX + (bandW - blockW) / 2 + tileW;
  const startY = bandY + (bandH - blockH) / 2 + tileH / 2;

  function drawPreviewStrands(cx, cy, size, leftColor, rightColor, type) {
    ctx.save();
    ctx.lineCap='round';
    ctx.lineJoin='round';
    ctx.lineWidth=Math.max(3, size*.34);

    const leftDominant = type === 'f' || type === 'fb';
    const rightDominant = type === 'b' || type === 'bf';

    ctx.globalAlpha=leftDominant ? .78 : .30;
    ctx.strokeStyle=leftColor;
    ctx.beginPath();
    ctx.moveTo(cx-size*.95, cy-size*.82);
    ctx.lineTo(cx+size*.95, cy+size*.82);
    ctx.stroke();

    ctx.globalAlpha=rightDominant ? .78 : .30;
    ctx.strokeStyle=rightColor;
    ctx.beginPath();
    ctx.moveTo(cx+size*.95, cy-size*.82);
    ctx.lineTo(cx-size*.95, cy+size*.82);
    ctx.stroke();

    // petit effet de croisement central
    ctx.globalAlpha=.18;
    ctx.strokeStyle='#0f172a';
    ctx.lineWidth=Math.max(1, size*.10);
    ctx.beginPath();
    ctx.arc(cx,cy,size*.72,0,Math.PI*2);
    ctx.stroke();
    ctx.restore();
  }

  function drawTrueMiniKnot(cx, cy, size, fill, type, leftColor, rightColor) {
    const symbols={f:'↘',b:'↙',fb:'↘↙',bf:'↙↘'};
    drawPreviewStrands(cx, cy, size, leftColor, rightColor, type);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx,cy,size,0,Math.PI*2);
    ctx.fillStyle=fill;
    ctx.fill();
    ctx.strokeStyle='rgba(22,31,55,.75)';
    ctx.lineWidth=Math.max(1.1,size*.11);
    ctx.stroke();

    // reflet léger
    ctx.beginPath();
    ctx.arc(cx-size*.28,cy-size*.32,size*.23,0,Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,.22)';
    ctx.fill();

    ctx.fillStyle=hexBrightness(fill)<140?'#fff':'#111827';
    ctx.font=`900 ${Math.max(8, size*.78)}px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif`;
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText(symbols[type]||'↘', cx, cy+0.5);
    ctx.restore();
  }

  function drawSimpleCircle(cx, cy, size, fill) {
    ctx.beginPath();
    ctx.arc(cx,cy,size,0,Math.PI*2);
    ctx.fillStyle=fill;
    ctx.fill();
    ctx.strokeStyle='rgba(22,31,55,.34)';
    ctx.lineWidth=1.1;
    ctx.stroke();
  }

  knots.forEach(k => {
    const rowKnots = [];
    const start = k.row % 2 === 0 ? 0 : 1;
    for (let left=start; left < state.threads - 1; left += 2) rowKnots.push(left);
    const pos = rowKnots.indexOf(k.left);
    const rowOffset = (k.row % 2) ? xStep * .50 : 0;
    const cx = startX + pos * xStep + rowOffset;
    const cy = startY + k.row * yStep;

    const fill = knotFill(k.left,k.row);
    const type = knotType(k.row,k.left);
    const leftColor = threadColor(k.left,k.row);
    const rightColor = threadColor(k.right,k.row);
    const size = tileH * .43;

    if (state.previewStyle === 'circles') {
      drawSimpleCircle(cx,cy,size,fill);
    } else if (state.previewStyle === 'diamonds') {
      fillDiamond(ctx,cx,cy,tileW,tileH,fill,'rgba(22,31,55,.32)');
    } else {
      drawTrueMiniKnot(cx,cy,size,fill,type,leftColor,rightColor);
    }
  });

  ctx.restore();

  roundRect(ctx,bandX,bandY,bandW,bandH,18);
  ctx.strokeStyle='rgba(44,28,135,.16)';
  ctx.lineWidth=1.1;
  ctx.stroke();

  const label = state.previewStyle === 'circles' ? 'ronds' : (state.previewStyle === 'diamonds' ? 'losanges' : 'mini-nœuds');
  ctx.fillStyle='rgba(23,32,51,.62)';
  ctx.font='700 12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
  ctx.fillText(`${knots.length} ${label} = ${knots.length} nœuds`, bandX + 14, bandY + bandH - 12);
}

function renderMotifEditor() {
  if (!motifSvg) return;
  const cellW=42, cellH=48, margin=32;
  const w=margin*2 + state.motifWidth*cellW;
  const h=margin*2 + state.motifHeight*(cellH*.78)+cellH*.3;
  motifSvg.setAttribute('viewBox',`0 0 ${w} ${h}`);
  motifSvg.setAttribute('width',w);
  motifSvg.setAttribute('height',h);
  motifSvg.innerHTML='';

  for (let r=0;r<state.motifHeight;r++) {
    for (let c=0;c<state.motifWidth;c++) {
      const cx=margin + c*cellW + cellW/2 + (r%2 ? cellW*.38 : 0);
      const cy=margin + r*(cellH*.78) + cellH/2;
      const poly=document.createElementNS('http://www.w3.org/2000/svg','polygon');
      const pts=[[cx,cy-cellH/2],[cx+cellW/2,cy],[cx,cy+cellH/2],[cx-cellW/2,cy]].map(p=>p.join(',')).join(' ');
      poly.setAttribute('points',pts);
      poly.setAttribute('fill',state.colors[state.motif[r][c]]);
      poly.setAttribute('stroke','#24304a');
      poly.setAttribute('stroke-width','1.1');
      poly.setAttribute('class','motifCell');
      if (state.motif[r][c]===state.selectedColor) poly.classList.add('active');
      poly.addEventListener('click',()=>{ state.motif[r][c]=state.selectedColor; resetWeave(); renderAll(); });
      poly.addEventListener('dblclick',()=>{ state.motif[r][c]=(state.motif[r][c]+1)%state.colorCount; resetWeave(); renderAll(); });
      motifSvg.appendChild(poly);
    }
  }
}

function svgText(parent,txt,x,y,cls) {
  const t=document.createElementNS('http://www.w3.org/2000/svg','text');
  t.textContent=txt; t.setAttribute('x',x); t.setAttribute('y',y); t.setAttribute('class',cls); parent.appendChild(t);
}
function svgLine(parent,x1,y1,x2,y2,cls,stroke,width) {
  const l=document.createElementNS('http://www.w3.org/2000/svg','line');
  l.setAttribute('x1',x1); l.setAttribute('y1',y1); l.setAttribute('x2',x2); l.setAttribute('y2',y2);
  l.setAttribute('class',cls); l.setAttribute('stroke',stroke); l.setAttribute('stroke-width',width); parent.appendChild(l);
}
function arrowHeadPoints(x1,y1,x2,y2,headLen,headWidth) {
  const len = Math.hypot(x2-x1, y2-y1) || 1;
  const ux = (x2-x1)/len, uy = (y2-y1)/len;
  return [
    [x2 - ux*headLen - uy*headWidth, y2 - uy*headLen + ux*headWidth],
    [x2, y2],
    [x2 - ux*headLen + uy*headWidth, y2 - uy*headLen - ux*headWidth]
  ];
}
function arrowMarkup(x1,y1,x2,y2,stroke,width) {
  const pts = arrowHeadPoints(x1,y1,x2,y2,width*2.4,width*1.65);
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" />
          <path d="M ${pts[0][0]} ${pts[0][1]} L ${pts[1][0]} ${pts[1][1]} L ${pts[2][0]} ${pts[2][1]}" stroke="${stroke}" stroke-width="${width}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`;
}
function polylineArrowMarkup(points, stroke, width) {
  const d = points.map((p, i) => `${i===0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
  const p1 = points[points.length-2], p2 = points[points.length-1];
  const head = arrowHeadPoints(p1[0], p1[1], p2[0], p2[1], width*2.2, width*1.55);
  return `<path d="${d}" stroke="${stroke}" stroke-width="${width}" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M ${head[0][0]} ${head[0][1]} L ${head[1][0]} ${head[1][1]} L ${head[2][0]} ${head[2][1]}" stroke="${stroke}" stroke-width="${width}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`;
}
function knotGlyphMarkup(type, x, y, size, stroke='#111827', width=3.1) {
  switch(type) {
    case 'f':
      return arrowMarkup(x-size*.42, y-size*.42, x+size*.34, y+size*.34, stroke, width);
    case 'b':
      return arrowMarkup(x+size*.42, y-size*.42, x-size*.34, y+size*.34, stroke, width);
    case 'fb':
      return polylineArrowMarkup([[x+size*.34, y-size*.40], [x-size*.02, y], [x-size*.34, y+size*.38]], stroke, width);
    case 'bf':
      return polylineArrowMarkup([[x-size*.34, y-size*.40], [x+size*.02, y], [x+size*.34, y+size*.38]], stroke, width);
    default:
      return arrowMarkup(x-size*.42, y-size*.42, x+size*.34, y+size*.34, stroke, width);
  }
}
function knotCardMarkup(type) {
  return `<svg viewBox="0 0 96 96" width="70" height="70" aria-hidden="true">
    <rect x="3" y="3" width="90" height="90" rx="0" fill="#fff" stroke="#ef4444" stroke-width="6"/>
    <line x1="9" y1="9" x2="87" y2="87" stroke="#b8d93a" stroke-width="11" stroke-linecap="round"/>
    <line x1="87" y1="9" x2="9" y2="87" stroke="#b4001c" stroke-width="11" stroke-linecap="round"/>
    <circle cx="48" cy="48" r="18" fill="#b8d93a" stroke="#111827" stroke-width="2.5"/>
    <g>${knotGlyphMarkup(type, 48, 48, 18, '#111827', 3.2)}</g>
  </svg>`;
}
function renderLegendIcons() {
  document.querySelectorAll('.knot-icon-card').forEach(el => {
    el.innerHTML = knotCardMarkup(el.dataset.knot || 'f');
  });
}
function drawNode(x,y,fill,type,idx) {
  const g=document.createElementNS('http://www.w3.org/2000/svg','g');
  g.setAttribute('class','node');
  if (state.done.has(idx)) g.classList.add('done');
  if (state.weave && !state.editKnots && idx===state.next) g.classList.add('next');
  if (state.editKnots) g.classList.add('editing');
  if (state.editColors) g.classList.add('colorEditing');
  const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
  circle.setAttribute('cx',x); circle.setAttribute('cy',y); circle.setAttribute('r',23); circle.setAttribute('fill',fill); g.appendChild(circle);
  const t=document.createElementNS('http://www.w3.org/2000/svg','text');
  const symbols={f:'↘',b:'↙',fb:'↘↙',bf:'↙↘'};
  t.textContent=symbols[type]||'↘'; t.setAttribute('x',x); t.setAttribute('y',y+1);
  t.setAttribute('class','knotText '+(hexBrightness(fill)<140?'light':''));
  g.appendChild(t);
  g.addEventListener('click',()=>onKnotClick(idx));
  svg.appendChild(g);
}
function drawUnpairedMarker(x,y) {
  const g=document.createElementNS('http://www.w3.org/2000/svg','g');
  g.setAttribute('class','node unpaired');
  const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
  circle.setAttribute('cx',x); circle.setAttribute('cy',y); circle.setAttribute('r',15); g.appendChild(circle);
  const t=document.createElementNS('http://www.w3.org/2000/svg','text');
  t.textContent='repos'; t.setAttribute('x',x); t.setAttribute('y',y+1); t.setAttribute('class','unpairedText'); g.appendChild(t);
  svg.appendChild(g);
}
function renderPattern() {
  const gapX=72, gapY=62, marginL=82, marginT=78;
  const contentW=marginL*2 + (state.threads-1)*gapX;
  const contentH=marginT*2 + (state.rows-1)*gapY + 56;
  svg.setAttribute('viewBox',`0 0 ${contentW} ${contentH}`);
  svg.setAttribute('width',contentW*state.zoom);
  svg.setAttribute('height',contentH*state.zoom);
  svg.style.transform=`scale(${state.zoom})`;
  svg.innerHTML='';

  for (let t=0;t<state.threads;t++) {
    const x=marginL+t*gapX;
    svgLine(svg,x,marginT-46,x,marginT+(state.rows-1)*gapY+44,'threadColumnGuide','#ecedf5',2);
    svgLine(svg,x,marginT-54,x,marginT-24,'threadStart',threadColor(t,0),14);
    if (state.showLetters) { svgText(svg,letter(t),x,34,'axisText'); svgText(svg,letter(t),x,contentH-18,'axisText'); }
  }
  if (state.showRows) {
    for (let r=0;r<state.rows;r++) {
      const y=marginT+r*gapY+6;
      svgText(svg,String(r+1),44,y,'rowText');
      svgText(svg,String(r+1),contentW-18,y,'rowText');
    }
  }
  let idx=0;
  for (let r=0;r<state.rows;r++) {
    const start=r%2===0?0:1;
    const y=marginT+r*gapY;
    if (state.threads%2===1) {
      const resting=start===0 ? state.threads-1 : 0;
      drawUnpairedMarker(marginL+resting*gapX,y);
    }
    for (let left=start;left<state.threads-1;left+=2) {
      const right=left+1;
      const x1=marginL+left*gapX, x2=marginL+right*gapX, x=(x1+x2)/2;
      const type=knotType(r,left);
      const colorLeft=threadColor(left,r), colorRight=threadColor(right,r);
      const mainFirst=type==='f'||type==='fb';
      svgLine(svg,x1,y-25,x2,y+25,'threadLine'+(mainFirst?'':' threadGhost'),colorLeft,mainFirst?13:9);
      svgLine(svg,x2,y-25,x1,y+25,'threadLine'+(!mainFirst?'':' threadGhost'),colorRight,!mainFirst?13:9);
      drawNode(x,y,knotFill(left,r),type,idx++);
    }
  }
  svgText(svg,'Version 20 · Nœuds brésiliens · Créé avec Calie',marginL,contentH-42,'footer-note');
}
function onKnotClick(idx) {
  const knots = buildKnotList();
  const k = knots[idx];
  if (!k) return;

  if (state.editColors) {
    setNodeColor(k.row, k.left, state.selectedColor);
    renderAll();
    return;
  }

  if (state.editKnots) {
    cycleKnotType(k.row, k.left);
    renderAll();
    return;
  }

  if (!state.weave) return;
  if (idx>state.next) return;
  state.done.add(idx);
  while (state.done.has(state.next) && state.next<totalKnots()) state.next++;
  renderAll();
}
function currentKnotMeta() {
  const knots=buildKnotList();
  if (!knots.length) return {row:0,left:0,right:1,type:'f'};
  const idx=clamp(state.next,0,Math.max(0,knots.length-1));
  return knots[idx];
}
function renderCurrentKnotPreview() {
  const k=currentKnotMeta();
  const fill=knotFill(k.left,k.row);
  const leftColor=threadColor(k.left,k.row), rightColor=threadColor(k.right,k.row);
  const mainLeft = k.type==='f' || k.type==='fb';
  const mainRight = k.type==='b' || k.type==='bf';
  currentKnotPreview.innerHTML=`
    <rect x="8" y="8" width="144" height="124" rx="14" fill="#ffffff" stroke="#ef4444" stroke-width="4" />
    <line x1="28" y1="20" x2="132" y2="120" stroke="${leftColor}" stroke-width="15" stroke-linecap="round" opacity="${mainLeft?'1':'.42'}" />
    <line x1="132" y1="20" x2="28" y2="120" stroke="${rightColor}" stroke-width="15" stroke-linecap="round" opacity="${mainRight?'1':'.42'}" />
    <circle cx="80" cy="70" r="30" fill="${fill}" stroke="#1f2a44" stroke-width="2.5" />
    <g>${knotGlyphMarkup(k.type, 80, 70, 23, hexBrightness(fill)<140 ? '#ffffff' : '#111827', 4)}</g>
  `;
  $('#currentKnotText').textContent=state.editColors ? `Mode couleurs : choisis une couleur puis touche les cercles du patron.` : (state.editKnots ? `Mode flèches : touche un cercle pour changer sa flèche.` : `Fais le nœud entre ${letter(k.left)} et ${letter(k.right)}, rangée ${k.row+1}.`);
}
function renderPalette() {
  normalizeAll();
  $('#colorsValue').textContent=state.colorCount;
  const list=$('#paletteList'); list.innerHTML='';
  state.colors.forEach((hex,i)=>{
    const row=document.createElement('div');
    row.className='palette-row';
    row.innerHTML=`<div class="index-badge">${i+1}</div><button class="palette-swatch ${i===state.selectedColor?'active':''}" style="background:${hex}" title="Couleur ${i+1}"></button><code>${hex.toUpperCase()}</code><button class="icon-btn ghost" title="Supprimer">✕</button>`;
    row.querySelector('.palette-swatch').onclick=()=>{
      state.selectedColor=i;
      const picker=$('#colorPicker');
      picker.value=hex;
      picker.oninput=(e)=>{ state.colors[i]=e.target.value.toUpperCase(); renderAll(); };
      renderAll();
    };
    row.querySelector('.palette-swatch').ondblclick=()=>{
      const picker=$('#colorPicker');
      picker.value=hex;
      picker.oninput=(e)=>{ state.colors[i]=e.target.value.toUpperCase(); renderAll(); };
      picker.click();
    };
    row.querySelector('.icon-btn').onclick=()=>{
      if (state.colorCount<=2) return;
      state.colors.splice(i,1);
      state.colorCount--;
      state.selectedColor=clamp(state.selectedColor,0,state.colorCount-1);
      for (let r=0;r<state.motifHeight;r++) for (let c=0;c<state.motifWidth;c++) state.motif[r][c]%=state.colorCount;
      resetWeave(); renderAll();
    };
    list.appendChild(row);
  });
  const btn=$('#selectedColorBtn');
  if (btn) {
    btn.style.background=state.colors[state.selectedColor];
    btn.style.color=hexBrightness(state.colors[state.selectedColor])<140?'#fff':'#111827';
    btn.textContent=`Couleur active ${state.selectedColor+1}`;
  }
}
function renderInfo() {
  $('#threadsValue').textContent=state.threads;
  $('#rowsValue').textContent=state.rows;
  $('#motifWidthValue').textContent=state.motifWidth;
  $('#motifHeightValue').textContent=state.motifHeight;
  $('#showRows').checked=state.showRows;
  $('#showLetters').checked=state.showLetters;
  $('#showPreviewGrid').checked=state.showPreviewGrid;
  const pss=$('#previewStyleSelect'); if (pss) pss.value = state.previewStyle;
  document.querySelectorAll('.typeBtn').forEach(btn=>btn.classList.toggle('active',btn.dataset.type===state.type));
  $('#summaryLabel').innerHTML=`${state.type==='alpha'?'Alpha':'Normal'} · <b>${state.threads} fils</b> · motif ${state.motifWidth}×${state.motifHeight} · ${state.colorCount} couleurs`;
  $('#modeBadge').textContent=state.editColors?'Mode édition des couleurs':(state.editKnots?'Mode édition des flèches':(state.weave?'Mode tissage actif':'Mode normal'));
  $('#weaveStateBadge').textContent=(state.editKnots||state.editColors)?'Pause édition':(state.weave?'Actif':'Inactif');
  $('#weaveStateBadge').classList.toggle('active',state.weave && !state.editKnots && !state.editColors);
  $('#infoBox').innerHTML=`Type : <b>${state.type==='alpha'?'Alpha':'Normal'}</b><br>Fils : <b>${state.threads}</b> ${state.threads%2?'· impair':'· pair'}<br>Rangées : <b>${state.rows}</b><br>Motif : <b>${state.motifWidth}×${state.motifHeight}</b><br>Couleurs : <b>${state.colorCount}</b><br>Nœuds : <b>${totalKnots()}</b><br>Flèches modifiées : <b>${Object.keys(state.customKnots||{}).length}</b><br>Couleurs modifiées sur le patron : <b>${Object.keys(state.customColors||{}).length}</b>`;
  const editBtn=$('#editKnotsToggle'); if(editBtn){editBtn.classList.toggle('active',state.editKnots); editBtn.textContent=state.editKnots?'Édition flèches active':'Modifier les flèches';}
  const colorEditBtn=$('#editColorsToggle'); if(colorEditBtn){colorEditBtn.classList.toggle('active',state.editColors); colorEditBtn.textContent=state.editColors?'Édition couleurs active':'Modifier les couleurs';}
  const total=totalKnots();
  state.next=clamp(state.next,0,total);
  const pct=total?Math.round((state.done.size/total)*100):0;
  const k=currentKnotMeta();
  $('#weaveProgressText').textContent=`Rangée ${k.row+1} sur ${state.rows} · ${state.done.size}/${total} nœuds`;
  $('#weaveProgressFill').style.width=`${pct}%`;
}
function resetWeave(){ state.done=new Set(); state.next=0; }
function renderAll() {
  normalizeAll();
  cleanCustomEdits();
  const max=totalKnots();
  state.done=new Set([...state.done].filter(v=>v>=0&&v<max));
  state.next=clamp(state.next,0,max);
  renderPalette(); renderInfo(); renderPreview(); renderMotifEditor(); renderPattern(); renderCurrentKnotPreview(); renderLegendIcons(); saveState();
}
function exportPreviewPng() {
  const link=document.createElement('a');
  link.download='bracelet-studio-by-calie-v20.png';
  link.href=previewCanvas.toDataURL('image/png');
  link.click();
}
function bindUI() {
  document.querySelectorAll('.typeBtn').forEach(btn=>btn.onclick=()=>{state.type=btn.dataset.type;resetWeave();renderAll();});
  $('#threadsMinus').onclick=()=>{state.threads=clamp(state.threads-1,3,40);resetWeave();renderAll();};
  $('#threadsPlus').onclick=()=>{state.threads=clamp(state.threads+1,3,40);resetWeave();renderAll();};
  $('#rowsMinus').onclick=()=>{state.rows=clamp(state.rows-1,4,90);resetWeave();renderAll();};
  $('#rowsPlus').onclick=()=>{state.rows=clamp(state.rows+1,4,90);resetWeave();renderAll();};
  $('#motifWidthMinus').onclick=()=>{state.motifWidth=clamp(state.motifWidth-1,4,40);ensureMotif();resetWeave();renderAll();};
  $('#motifWidthPlus').onclick=()=>{state.motifWidth=clamp(state.motifWidth+1,4,40);ensureMotif();resetWeave();renderAll();};
  $('#motifHeightMinus').onclick=()=>{state.motifHeight=clamp(state.motifHeight-1,3,24);ensureMotif();resetWeave();renderAll();};
  $('#motifHeightPlus').onclick=()=>{state.motifHeight=clamp(state.motifHeight+1,3,24);ensureMotif();resetWeave();renderAll();};
  $('#colorsMinus').onclick=()=>{state.colorCount=clamp(state.colorCount-1,2,12);normalizeAll();resetWeave();renderAll();};
  $('#colorsPlus').onclick=()=>{state.colorCount=clamp(state.colorCount+1,2,12);normalizeAll();resetWeave();renderAll();};
  $('#addColorBtn').onclick=()=>{state.colorCount=clamp(state.colorCount+1,2,12);normalizeAll();renderAll();};
  $('#diamondPreset').onclick=()=>setPreset('diamond');
  $('#checkerPreset').onclick=()=>setPreset('checker');
  $('#stripePreset').onclick=()=>setPreset('stripe');
  $('#clearPreset').onclick=()=>setPreset('clear');
  $('#showRows').onchange=e=>{state.showRows=e.target.checked;renderAll();};
  $('#showLetters').onchange=e=>{state.showLetters=e.target.checked;renderAll();};
  $('#showPreviewGrid').onchange=e=>{state.showPreviewGrid=e.target.checked;renderAll();};
  const pss=$('#previewStyleSelect'); if (pss) pss.onchange=e=>{state.previewStyle=e.target.value; renderAll();};
  $('#newBtn').onclick=()=>{if(confirm('Créer un nouveau motif ?')){setPreset('diamond');}};
  $('#saveBtn').onclick=()=>{saveState();alert('Projet sauvegardé sur cet iPad / navigateur.');};
  $('#exportBtn').onclick=exportPreviewPng;
  $('#editColorsToggle').onclick=()=>{state.editColors=!state.editColors;if(state.editColors)state.editKnots=false;renderAll();};
  $('#editKnotsToggle').onclick=()=>{state.editKnots=!state.editKnots;if(state.editKnots)state.editColors=false;renderAll();};
  $('#weaveToggle').onclick=()=>{state.weave=!state.weave;if(state.weave){state.editKnots=false;state.editColors=false;}renderAll();};
  $('#prevKnotBtn').onclick=()=>{if(state.next<=0)return;state.next=clamp(state.next-1,0,totalKnots()-1);state.done.delete(state.next);renderAll();};
  $('#nextKnotBtn').onclick=()=>{if(state.next>=totalKnots())return;state.done.add(state.next);state.next=clamp(state.next+1,0,totalKnots());renderAll();};
  $('#resetWeaveBtn').onclick=()=>{resetWeave();renderAll();};
  const changeThreads = (delta)=>{state.threads=clamp(state.threads+delta,3,40);resetWeave();renderAll();};
  const changeRows = (delta)=>{state.rows=clamp(state.rows+delta,4,90);resetWeave();renderAll();};
  $('#addThreadLeft').onclick=()=>changeThreads(1);
  $('#addThreadRight').onclick=()=>changeThreads(1);
  $('#removeThreadLeft').onclick=()=>changeThreads(-1);
  $('#removeThreadRight').onclick=()=>changeThreads(-1);
  $('#addRowTop').onclick=()=>changeRows(1);
  $('#addRowBottom').onclick=()=>changeRows(1);
  $('#removeRowTop').onclick=()=>changeRows(-1);
  $('#removeRowBottom').onclick=()=>changeRows(-1);
  $('#zoomInBtn').onclick=()=>{state.zoom=clamp(state.zoom+.1,.7,2);renderAll();};
  $('#zoomOutBtn').onclick=()=>{state.zoom=clamp(state.zoom-.1,.7,2);renderAll();};
  $('#zoomResetBtn').onclick=()=>{state.zoom=1;renderAll();};
  let pinchDistance=0;
  scroller.addEventListener('touchmove',e=>{
    if(e.touches.length!==2)return;
    e.preventDefault();
    const dx=e.touches[0].clientX-e.touches[1].clientX;
    const dy=e.touches[0].clientY-e.touches[1].clientY;
    const dist=Math.hypot(dx,dy);
    if(pinchDistance){state.zoom=clamp(state.zoom+(dist-pinchDistance)/320,.7,2);renderPattern();}
    pinchDistance=dist;
  },{passive:false});
  scroller.addEventListener('touchend',()=>{pinchDistance=0;saveState();});
  window.addEventListener('resize',renderPreview);
}
loadState();
bindUI();
renderAll();
