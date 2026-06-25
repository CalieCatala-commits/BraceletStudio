const letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
let state={threads:12,rows:12,type:'diamonds',showRows:true,showLetters:true,mirrorH:false,colors:['#7ddfc4','#12696d','#fff4cf','#d9046f','#7a3fa1','#1e1e1e','#aeb0b4','#f59bc4','#02a7b8','#a79be8','#075fbd','#ffffff']};
const $=id=>document.getElementById(id);
function knotFor(r,c){const cols=state.threads; const cc=state.mirrorH?Math.min(c,cols-1-c):c; let idx,type;if(state.type==='chevrons'){idx=Math.abs(cc-cols/2+.5)+r;type=(cc<cols/2)?0:1}else if(state.type==='waves'){idx=Math.floor((Math.sin((cc+r)/2)+1)*3)+r;type=(r+c)%4}else{idx=Math.abs(cc-cols/2+.5)+Math.abs(r-state.rows/2+.5);type=(r+c)%4} return {color:state.colors[Math.floor(idx)%state.colors.length],symbol:['↘','↙','⇄','⇆'][type]};}
function render(){
 $('threadsLabel').textContent=state.threads; $('rowsInput').value=state.rows; $('patternType').value=state.type; $('showRows').checked=state.showRows; $('showLetters').checked=state.showLetters; $('mirrorH').checked=state.mirrorH; $('infoThreads').textContent=state.threads; $('infoRows').textContent=state.rows;
 const pal=$('palette'); pal.innerHTML=''; state.colors.forEach((c,i)=>{const input=document.createElement('input'); input.type='color'; input.value=c; input.oninput=e=>{state.colors[i]=e.target.value; renderPatternOnly()}; pal.appendChild(input)});
 renderPatternOnly();
}
function renderPatternOnly(){
 const bracelet=$('bracelet'); bracelet.innerHTML=''; for(let i=0;i<52;i++){const s=document.createElement('span');s.style.background=state.colors[(i+Math.floor(i/3))%state.colors.length];bracelet.appendChild(s)}
 const p=$('pattern'); p.innerHTML=''; p.style.gridTemplateColumns=`40px repeat(${state.threads},54px) 40px`;
 p.appendChild(document.createElement('div')); for(let i=0;i<state.threads;i++){let b=document.createElement('b');b.className='letter';b.textContent=state.showLetters?letters[i]||'?':'';p.appendChild(b)} p.appendChild(document.createElement('div'));
 for(let r=0;r<state.rows;r++){let rn=document.createElement('b');rn.className='rownum';rn.textContent=state.showRows?r+1:'';p.appendChild(rn); for(let c=0;c<state.threads;c++){const k=knotFor(r,c);let d=document.createElement('div');d.className='knot';d.style.background=k.color;d.textContent=k.symbol;p.appendChild(d)} let rn2=document.createElement('b');rn2.className='rownum';rn2.textContent=state.showRows?r+1:'';p.appendChild(rn2)}
 p.appendChild(document.createElement('div')); for(let i=0;i<state.threads;i++){let b=document.createElement('b');b.className='letter';b.textContent=state.showLetters?letters[i]||'?':'';p.appendChild(b)} p.appendChild(document.createElement('div'));
}
$('minusThreads').onclick=()=>{state.threads=Math.max(4,state.threads-2);render()}; $('plusThreads').onclick=()=>{state.threads=Math.min(26,state.threads+2);render()};
$('rowsInput').onchange=e=>{state.rows=Math.max(2,Math.min(80,+e.target.value||12));render()}; $('patternType').onchange=e=>{state.type=e.target.value;render()};
['showRows','showLetters','mirrorH'].forEach(id=>$(id).onchange=e=>{state[id]=e.target.checked;render()}); $('generateBtn').onclick=()=>render();
$('saveBtn').onclick=()=>{localStorage.setItem('bracelet-studio',JSON.stringify(state));alert('Projet enregistré sur cet appareil.')};
$('openBtn').onclick=()=>{const saved=localStorage.getItem('bracelet-studio'); if(!saved)return alert('Aucun projet enregistré.'); state=JSON.parse(saved); render()};
$('newBtn').onclick=()=>{if(confirm('Créer un nouveau projet ?')){localStorage.removeItem('bracelet-studio'); location.reload()}};
$('exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='bracelet-studio-projet.json';a.click()};
if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{})} render();
