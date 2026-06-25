const $ = s => document.querySelector(s);
const state = JSON.parse(localStorage.getItem('braceletStudioV2') || 'null') || {
  mode:'normal', pattern:'chevron', threads:12, rows:30, alphaText:'LOVE',
  colors:['#ef4444','#f97316','#facc15','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899'],
  done:{}
};

const els = {
  threads: $('#threadsInput'), rows: $('#rowsInput'), threadsValue: $('#threadsValue'), rowsValue: $('#rowsValue'),
  pattern: $('#patternSelect'), alphaText: $('#alphaText'), palette: $('#palette'), bracelet: $('#braceletCanvas'), patternCanvas: $('#patternCanvas'),
  status: $('#statusText'), gridWrap: $('#gridWrap'), alphaTextWrap: $('#alphaTextWrap')
};
const bctx = els.bracelet.getContext('2d');
const pctx = els.patternCanvas.getContext('2d');
let grid = [], zoom = 1, lastDist = 0;

function save(){ localStorage.setItem('braceletStudioV2', JSON.stringify(state)); }
function init(){
  els.threads.value = state.threads; els.rows.value = state.rows; els.pattern.value = state.pattern; els.alphaText.value = state.alphaText;
  document.querySelectorAll('.segmented button').forEach(b=>b.classList.toggle('active', b.dataset.mode===state.mode));
  drawPalette(); bind(); render(); if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
function bind(){
  document.querySelectorAll('.segmented button').forEach(btn=>btn.onclick=()=>{state.mode=btn.dataset.mode; if(state.mode==='alpha') state.pattern='alphaName'; else if(state.pattern==='alphaName') state.pattern='chevron'; save(); init();});
  els.threads.oninput=e=>{state.threads=+e.target.value; render(true)};
  els.rows.oninput=e=>{state.rows=+e.target.value; render(true)};
  els.pattern.onchange=e=>{state.pattern=e.target.value; state.mode=e.target.value==='alphaName'?'alpha':'normal'; save(); init();};
  els.alphaText.oninput=e=>{state.alphaText=e.target.value.toUpperCase(); render(true)};
  $('#addColorBtn').onclick=()=>{state.colors.push('#'+Math.floor(Math.random()*16777215).toString(16).padStart(6,'0')); drawPalette(); render(true)};
  $('#saveBtn').onclick=()=>{save(); flash('Sauvegardé sur cet iPad')};
  $('#resetBtn').onclick=()=>{state.done={}; state.rows=30; state.threads=12; save(); init();};
  $('#clearProgressBtn').onclick=()=>{state.done={}; render(true); flash('Progression effacée')};
  $('#exportBtn').onclick=exportPNG;
  els.patternCanvas.onclick = markDone;
  els.gridWrap.addEventListener('touchmove', pinchZoom, {passive:false});
  els.gridWrap.addEventListener('touchend', ()=>lastDist=0);
}
function flash(text){ els.status.textContent=text; els.status.classList.add('doneToast'); setTimeout(()=>{els.status.textContent='Prêt';els.status.classList.remove('doneToast')},1800); }
function drawPalette(){
  els.palette.innerHTML='';
  state.colors.forEach((c,i)=>{
    const d=document.createElement('div'); d.className='swatch'; d.style.background=c;
    const input=document.createElement('input'); input.type='color'; input.value=c;
    input.oninput=e=>{state.colors[i]=e.target.value; d.style.background=e.target.value; render(true)};
    d.appendChild(input); els.palette.appendChild(d);
  });
}
function render(shouldSave=false){
  if(shouldSave) save();
  els.threadsValue.textContent=state.threads; els.rowsValue.textContent=state.rows;
  els.alphaTextWrap.style.display = state.mode==='alpha' ? 'block' : 'none';
  grid = state.mode==='alpha' ? makeAlphaGrid() : makeNormalGrid();
  drawBracelet(); drawPattern();
}
function makeNormalGrid(){
  const arr=[]; const types=['↘','↙','↘↙','↙↘'];
  for(let r=0;r<state.rows;r++){
    const row=[]; const offset=r%2;
    for(let c=0;c<state.threads-1;c++){
      let type='↘', color=(c+r)%state.colors.length;
      if(state.pattern==='diamonds'){ type=types[(Math.floor(Math.abs(c-state.threads/2)+r/2))%4]; color=(Math.abs(c-state.threads/2)+r)%state.colors.length; }
      else if(state.pattern==='waves'){ type=types[(Math.floor((Math.sin((c+r)/2)+1)*2))%4]; color=(c+Math.floor(r/3))%state.colors.length; }
      else if(state.pattern==='hearts'){ type=(Math.abs(c-state.threads/2)<(r%12)/2)?'↙↘':'↘'; color=(Math.abs(c-state.threads/2)<3 && r%12>2)?7:c%state.colors.length; }
      else { type=c<state.threads/2 ? '↘' : '↙'; color=(c<state.threads/2?c:state.threads-c)%state.colors.length; }
      row.push({type,color,offset,done:!!state.done[`${r}-${c}`]});
    } arr.push(row);
  } return arr;
}
const font = {
 A:['01110','10001','11111','10001','10001'], B:['11110','10001','11110','10001','11110'], C:['01111','10000','10000','10000','01111'], D:['11110','10001','10001','10001','11110'], E:['11111','10000','11110','10000','11111'], F:['11111','10000','11110','10000','10000'], G:['01111','10000','10011','10001','01110'], H:['10001','10001','11111','10001','10001'], I:['11111','00100','00100','00100','11111'], J:['00111','00010','00010','10010','01100'], K:['10001','10010','11100','10010','10001'], L:['10000','10000','10000','10000','11111'], M:['10001','11011','10101','10001','10001'], N:['10001','11001','10101','10011','10001'], O:['01110','10001','10001','10001','01110'], P:['11110','10001','11110','10000','10000'], Q:['01110','10001','10101','10010','01101'], R:['11110','10001','11110','10010','10001'], S:['01111','10000','01110','00001','11110'], T:['11111','00100','00100','00100','00100'], U:['10001','10001','10001','10001','01110'], V:['10001','10001','10001','01010','00100'], W:['10001','10001','10101','11011','10001'], X:['10001','01010','00100','01010','10001'], Y:['10001','01010','00100','00100','00100'], Z:['11111','00010','00100','01000','11111'], ' ':['000','000','000','000','000']
};
function makeAlphaGrid(){
  const text=(state.alphaText||'LOVE').toUpperCase();
  const pixels=[[],[],[],[],[]];
  for(const ch of text){ const g=font[ch]||font[' ']; for(let y=0;y<5;y++) pixels[y].push(...g[y].split('').map(Number),0); }
  const scale=Math.max(1, Math.floor(state.rows/12)); const arr=[];
  for(let y=0;y<Math.max(state.rows, pixels.length*scale);y++){
    const src=pixels[Math.floor(y/scale)%5]; const row=[];
    for(let x=0;x<state.threads-1;x++){ const bit=src[x%src.length]||0; row.push({type:bit?'●':'○',color:bit?1:5,done:!!state.done[`${y}-${x}`]}); }
    arr.push(row);
  }
  return arr.slice(0,state.rows);
}
function drawBracelet(){
  const w=els.bracelet.width,h=els.bracelet.height; bctx.clearRect(0,0,w,h);
  bctx.lineCap='round'; bctx.lineWidth=16;
  const gap=w/(state.threads+1);
  for(let i=0;i<state.threads;i++){
    bctx.strokeStyle=state.colors[i%state.colors.length]; bctx.beginPath();
    for(let x=0;x<w;x+=24){ const y=h/2 + Math.sin((x/38)+i)*18 + (i-state.threads/2)*2; x?bctx.lineTo(x,y):bctx.moveTo(x,y); }
    bctx.stroke();
  }
  bctx.fillStyle='rgba(255,255,255,.75)'; bctx.roundRect(22,22,w-44,h-44,26); bctx.strokeStyle='rgba(124,58,237,.28)'; bctx.lineWidth=3; bctx.stroke();
}
CanvasRenderingContext2D.prototype.roundRect ??= function(x,y,w,h,r){this.beginPath();this.moveTo(x+r,y);this.arcTo(x+w,y,x+w,y+h,r);this.arcTo(x+w,y+h,x,y+h,r);this.arcTo(x,y+h,x,y,r);this.arcTo(x,y,x+w,y,r);this.closePath();return this;};
function drawPattern(){
  const cell=42, left=70, top=55; const rows=grid.length, cols=state.threads-1;
  els.patternCanvas.height=Math.max(700, top+rows*cell+80); els.patternCanvas.width=Math.max(900,left+cols*cell+120);
  pctx.clearRect(0,0,els.patternCanvas.width,els.patternCanvas.height); pctx.font='bold 18px system-ui'; pctx.textAlign='center'; pctx.textBaseline='middle';
  for(let c=0;c<state.threads;c++){pctx.fillStyle=state.colors[c%state.colors.length]; pctx.beginPath(); pctx.arc(left+c*cell,24,12,0,Math.PI*2); pctx.fill(); pctx.fillStyle='#6b5b7b'; pctx.fillText(String.fromCharCode(65+c),left+c*cell,45)}
  for(let r=0;r<rows;r++){
    pctx.fillStyle='#8a7b99'; pctx.fillText(r+1,26,top+r*cell);
    for(let c=0;c<cols;c++){
      const item=grid[r][c]; const x=left+c*cell+cell/2, y=top+r*cell;
      pctx.strokeStyle='#ded1f8'; pctx.lineWidth=2; pctx.beginPath(); pctx.moveTo(x-cell/2,y-cell/2); pctx.lineTo(x+cell/2,y+cell/2); pctx.moveTo(x+cell/2,y-cell/2); pctx.lineTo(x-cell/2,y+cell/2); pctx.stroke();
      pctx.fillStyle=item.done?'#16a34a':state.colors[item.color%state.colors.length]; pctx.beginPath(); pctx.arc(x,y,15,0,Math.PI*2); pctx.fill();
      pctx.fillStyle='white'; pctx.font= state.mode==='alpha' ? 'bold 16px system-ui' : 'bold 13px system-ui'; pctx.fillText(item.type,x,y+1);
    }
  }
}
function markDone(e){
  const rect=els.patternCanvas.getBoundingClientRect(); const scaleX=els.patternCanvas.width/rect.width, scaleY=els.patternCanvas.height/rect.height;
  const x=(e.clientX-rect.left)*scaleX, y=(e.clientY-rect.top)*scaleY; const cell=42,left=70,top=55;
  const r=Math.round((y-top)/cell), c=Math.round((x-left-cell/2)/cell);
  if(grid[r]&&grid[r][c]){ const key=`${r}-${c}`; state.done[key]=!state.done[key]; save(); render(); }
}
function pinchZoom(e){
  if(e.touches.length!==2) return; e.preventDefault();
  const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
  if(lastDist){ zoom=Math.min(2.2,Math.max(.75,zoom*d/lastDist)); els.patternCanvas.style.transform=`scale(${zoom})`; }
  lastDist=d;
}
function exportPNG(){
  const link=document.createElement('a'); link.download='bracelet-studio-patron.png'; link.href=els.patternCanvas.toDataURL('image/png'); link.click();
}
init();
