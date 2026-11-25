
(()=>{
let B=window.BC;
if(!B||!B.db)return;

const login=document.getElementById('login');
const admin=document.getElementById('admin');
if(!login)return;

const email=document.getElementById('email');
const pw=document.getElementById('pw');
const loginmsg=document.getElementById('loginmsg');
const logout=document.getElementById('logoutbtn');

async function gate(){
 const {data:{session}}=await B.db.auth.getSession();
 if(session){
  const {data:ok,error}=await B.db.rpc('is_baudicht_admin');
  if(!error&&ok){
   loginmsg.textContent='';
   login.classList.add('hidden');
   admin.classList.remove('hidden');
   logout.classList.remove('hidden');
   await B.load();
   draw();
   return;
  }
  loginmsg.textContent=error?'Admin-Prüfung fehlgeschlagen: '+error.message:'Login erfolgreich, aber dieses Konto ist nicht als Admin freigeschaltet.';
 } else {
  loginmsg.textContent='Bitte mit deinem Admin-Konto anmelden.';
 }
 login.classList.remove('hidden');
 admin.classList.add('hidden');
}

document.getElementById('loginbtn').onclick=async()=>{
 const {error}=await B.db.auth.signInWithPassword({
  email:email.value,
  password:pw.value
 });
 if(error){
  loginmsg.textContent='Login fehlgeschlagen: '+error.message;
  return;
 }
 await gate();
};

logout.onclick=async()=>{
 await B.db.auth.signOut();
 await gate();
};

function participant(m,side){
 let v=m[side];
 return typeof v==='string'?v:(B.data.teams[v]||'—');
}

function row(m,i,round){
 return `<div class="adminrow">
 <span>${B.esc(participant(m,'h'))}</span>
 <input type="number" min="0" data-round="${round}" data-i="${i}" data-side="hs" value="${m.hs??''}">
 <input type="number" min="0" data-round="${round}" data-i="${i}" data-side="as" value="${m.as??''}">
 <span>${B.esc(participant(m,'a'))}</span>
 </div>`;
}

function roundsMarkup(p){
 let keys=['playin','r16','qf','sf','f'];
 let labels={
  playin:'Playoff (9–24)',
  r16:'Achtelfinale',
  qf:'Viertelfinale',
  sf:'Halbfinale',
  f:'Finale'
 };
 return keys.map(k=>{
  if(!p[k]?.length)return `<section class="admin-round"><h3>${labels[k]}</h3><p class="round-note">${k==='playin'?'Wird nach Abschluss aller Ligaspiele automatisch erstellt.':k==='r16'?'Wird nach den Playoff-Spielen automatisch erstellt.':'Wird nach Abschluss der vorherigen KO-Runde automatisch erstellt.'}</p></section>`;
  return `<section class="admin-round"><h3>${labels[k]}</h3>${p[k].map((m,i)=>row(m,i,k)).join('')}</section>`;
 }).join('');
}

function draw(){
 let d=B.data;
 document.getElementById('teams').value=d.teams.join('\n');

 document.getElementById('adminmatches').innerHTML=
 `<h3>Ligaspiele</h3>
 ${d.matches.map((m,i)=>row(m,i,'matches')).join('')}
 ${roundsMarkup(d.playoffs||{})}`;

 document.querySelectorAll('#adminmatches input').forEach(x=>{
  x.onchange=async()=>{
   let round=x.dataset.round;
   let i=Number(x.dataset.i);
   let side=x.dataset.side;
   let arr=round==='matches'?d.matches:d.playoffs[round];

   if(!arr||!arr[i])return;

   arr[i][side]=x.value===''?null:Number(x.value);

   try{
    await B.save();
    draw();
    status('Resultat gespeichert.');
   }catch(e){
    status('Speichern fehlgeschlagen: '+e.message);
   }
  };
 });
}

function status(t){
 document.getElementById('adminstatus').textContent=t;
}

document.getElementById('refresh').onclick=async()=>{
 await B.load();
 draw();
 status('Daten aktualisiert.');
};

document.getElementById('saveteams').onclick=async()=>{
 let names=document.getElementById('teams').value
 .split('\n').map(x=>x.trim()).filter(Boolean);

 if(names.length!==24){
  status('Bitte genau 24 Teamnamen eingeben.');
  return;
 }

 B.data.teams=names;

 try{
  await B.save();
  draw();
  status('Teams gespeichert.');
 }catch(e){
  status(e.message);
 }
};

document.getElementById('newfixtures').onclick=async()=>{
 let indices=Array.from({length:24},(_,i)=>i);
 let games=[];
 let degree=Array(24).fill(0);
 let pairs=new Set();

 for(let tries=0;tries<10000&&games.length<48;tries++){
  let shuffled=indices.slice().sort(()=>Math.random()-.5);
  let pick=null;

  for(let i=0;i<shuffled.length&&!pick;i++){
   for(let j=i+1;j<shuffled.length;j++){
    let a=shuffled[i],b=shuffled[j];
    let key=[a,b].sort((x,y)=>x-y).join('-');

    if(degree[a]<4&&degree[b]<4&&!pairs.has(key)){
     pick=[a,b,key];
     break;
    }
   }
  }

  if(!pick)continue;

  let [a,b,key]=pick;
  games.push({h:a,a:b,hs:null,as:null});
  degree[a]++;
  degree[b]++;
  pairs.add(key);
 }

 if(games.length!==48){
  status('Spielplan konnte nicht erstellt werden.');
  return;
 }

 B.data.matches=games;
 B.data.playoffs={};

 try{
  await B.save();
  draw();
  status('48 Ligaspiele erstellt.');
 }catch(e){
  status(e.message);
 }
};

B.db.auth.onAuthStateChange(()=>gate());
gate();
})();
