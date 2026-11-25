(()=>{
const cfg=window.BAUDICHT_CONFIG||{};
const ready=cfg.SUPABASE_URL?.startsWith('https://')&&cfg.SUPABASE_ANON_KEY?.length>20&&window.supabase;
const db=ready?window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY):null;
const fallbackTeams=Array.from({length:24},(_,i)=>`Team ${i+1}`);
let data={teams:fallbackTeams,matches:[],playoffs:{}};
window.BC={db,ready,data};

async function load(){
  const st=document.getElementById('status');
  try{
    if(!db){if(st)st.textContent='Supabase-Verbindung fehlt';render();return;}
    const {data:d,error}=await db.from('tournament_state').select('payload').eq('id',1).single();
    if(error)throw error;
    if(d?.payload)data=d.payload;
    data.teams=data.teams||fallbackTeams;data.matches=data.matches||[];
    if(!data.playoffs||Array.isArray(data.playoffs)||typeof data.playoffs!=='object')data.playoffs={};
    window.BC.data=data;
    const changed=advance();render();
    if(changed){const {error:saveError}=await db.from('tournament_state').upsert({id:1,payload:data});if(saveError)console.error('Playoffs speichern fehlgeschlagen:',saveError);}
    if(st)st.textContent='Live-Verbindung aktiv';
  }catch(err){console.error('Live-Laden fehlgeschlagen:',err);if(st)st.textContent='Fehler beim Laden: '+(err.message||err.code||'unbekannter Fehler');}
}

function standings(){
  let s=data.teams.map((t,i)=>({idx:i,team:t,mp:0,w:0,d:0,l:0,gf:0,ga:0,pts:0}));
  data.matches.forEach(m=>{
    if(m.hs==null||m.as==null)return;
    let a=s[m.h],b=s[m.a];
    if(!a||!b)return;
    a.mp++;b.mp++;
    a.gf+=m.hs;a.ga+=m.as;
    b.gf+=m.as;b.ga+=m.hs;
    if(m.hs>m.as){a.w++;b.l++;a.pts+=3}
    else if(m.hs<m.as){b.w++;a.l++;b.pts+=3}
    else{a.d++;b.d++;a.pts++;b.pts++}
  });
  return s.sort((a,b)=>
    b.pts-a.pts||
    (b.gf-b.ga)-(a.gf-a.ga)||
    b.gf-a.gf||
    a.team.localeCompare(b.team)
  );
}

function esc(s){
  return String(s).replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function teamName(i){
  return data.teams[i]||`Team ${i+1}`;
}

function matchHtml(m){
  const h=typeof m.h==='string'?m.h:teamName(m.h);
  const a=typeof m.a==='string'?m.a:teamName(m.a);
  return `<div class="match">
    <div class="home">${esc(m.hname||h)}</div>
    <div class="score">${m.hs==null?'–':m.hs} : ${m.as==null?'–':m.as}</div>
    <div>${esc(m.aname||a)}</div>
  </div>`;
}

function renderTable(){
  let el=document.getElementById('standings');
  if(!el)return;
  let s=standings();
  el.innerHTML=`<table><thead><tr>
  <th>#</th><th>Team</th><th>Sp</th><th>S</th><th>U</th><th>N</th><th>TD</th><th>Pkt</th>
  </tr></thead><tbody>${s.map((x,i)=>`<tr>
  <td>${i+1}</td><td>${esc(x.team)}</td><td>${x.mp}</td><td>${x.w}</td><td>${x.d}</td><td>${x.l}</td><td>${x.gf-x.ga}</td><td><b>${x.pts}</b></td>
  </tr>`).join('')}</tbody></table>`;
}

function renderMatches(){
  let el=document.getElementById('matchlist');
  if(el)el.innerHTML=data.matches.map(matchHtml).join('')||'Noch kein Spielplan.';
}

function roundLabel(k){
  return {playin:'Playoff (Rang 9–24)',r16:'Achtelfinale',qf:'Viertelfinale',sf:'Halbfinale',f:'Finale'}[k]||k;
}

function renderPlayoffs(){
  let el=document.getElementById('playofflist');
  if(!el)return;
  let p=data.playoffs;
  if(!p||Array.isArray(p)||typeof p!=='object'){p={};data.playoffs=p;}
  let keys=['playin','r16','qf','sf','f'];
  el.innerHTML=keys.map(k=>p[k]?.length?
    `<h3>${roundLabel(k)}</h3>${p[k].map(matchHtml).join('')}`:''
  ).join('')||'<p>Die Playoff-Runden erscheinen automatisch, sobald alle Ligaspiele abgeschlossen sind.</p>';
}

function allDone(ms){
  return ms?.length>0&&ms.every(m=>m.hs!=null&&m.as!=null);
}

function winner(m){
  if(!m||m.hs==null||m.as==null||m.hs===m.as)return null;
  return m.hs>m.as?m.h:m.a;
}

function namedMatch(h,a){
  return {h,a,hs:null,as:null};
}

function advance(){
  let p=data.playoffs||{};

  // Playoff 9–24 nach Abschluss aller Ligaspiele
  if(allDone(data.matches)&&!p.playin){
    let rank=standings().map(x=>x.idx);
    p.playin=[];
    for(let i=8;i<16;i++){
      p.playin.push(namedMatch(rank[i],rank[23-(i-8)]));
    }
    data.playoffs=p;
  }

  // Achtelfinale: Top 8 plus Playoff-Sieger
  if(allDone(p.playin)&&!p.r16){
    let rank=standings().map(x=>x.idx);
    let wins=p.playin.map(winner);
    if(wins.every(x=>x!==null)){
      p.r16=[];
      for(let i=0;i<8;i++)p.r16.push(namedMatch(rank[i],wins[7-i]));
      data.playoffs=p;
    }
  }

  // Viertelfinale
  if(allDone(p.r16)&&!p.qf){
    let w=p.r16.map(winner);
    if(w.every(x=>x!==null)){
      p.qf=[
        namedMatch(w[0],w[1]),
        namedMatch(w[2],w[3]),
        namedMatch(w[4],w[5]),
        namedMatch(w[6],w[7])
      ];
      data.playoffs=p;
    }
  }

  // Halbfinale
  if(allDone(p.qf)&&!p.sf){
    let w=p.qf.map(winner);
    if(w.every(x=>x!==null)){
      p.sf=[namedMatch(w[0],w[1]),namedMatch(w[2],w[3])];
      data.playoffs=p;
    }
  }

  // Finale
  if(allDone(p.sf)&&!p.f){
    let w=p.sf.map(winner);
    if(w.every(x=>x!==null)){
      p.f=[namedMatch(w[0],w[1])];
      data.playoffs=p;
    }
  }
}

function render(){
  advance();
  renderTable();
  renderMatches();
  renderPlayoffs();
}

document.querySelectorAll('[data-tab]').forEach(b=>{
  b.onclick=()=>{
    document.querySelectorAll('[data-tab]').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(x=>x.classList.add('hidden'));
    b.classList.add('active');
    document.getElementById(b.dataset.tab).classList.remove('hidden');
  };
});

if(db){
  db.channel('baudicht-live').on('postgres_changes',{
    event:'*',schema:'public',table:'tournament_state'
  },load).subscribe();
}

load();

window.BC.load=load;
window.BC.render=render;
window.BC.standings=standings;
window.BC.esc=esc;

window.BC.save=async()=>{
  data=window.BC.data;
  advance();
  const {error}=await db.from('tournament_state').upsert({id:1,payload:data});
  if(error)throw error;
  render();
};
})();
