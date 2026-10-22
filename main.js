(() => {
  "use strict";
  const canvas = document.getElementById("world");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const $ = id => document.getElementById(id);
  const regions = ["Pradaria Serena","Floresta Verdejante","Pomar Selvagem","Margens do Rio","Pântano das Ervas","Colinas Rochosas","Caverna dos Cogumelos","Jardim Esquecido"];
  const regionColors = {
    "Pradaria Serena":["#8dbb72","#6ea35d"],"Floresta Verdejante":["#5d9861","#427d51"],
    "Pomar Selvagem":["#a9c779","#7ca85d"],"Margens do Rio":["#7bb58b","#579b76"],
    "Pântano das Ervas":["#779d76","#547c67"],"Colinas Rochosas":["#a6b17b","#8b9b6b"],
    "Caverna dos Cogumelos":["#536d62","#3e594f"],"Jardim Esquecido":["#91b777","#719c63"]
  };
  const W=960,H=600,TILE=32;
  let running=false, paused=false, currentSave=0, toastTimer=null, panelType=null;
  let keys={};
  const freshState = name => ({
    name:name||"Explorador", day:1, minutes:480, x:W/2, y:H/2, region:regions[0],
    health:100, maxHealth:100, inventory:{}, chest:{}, discovered:{}, firstDay:{},
    collectedNodes:{}, unlocked:{[regions[0]]:true}, visited:{[regions[0]]:true},
    defeated:0, playSeconds:0, lastSaved:Date.now(), facing:{x:0,y:1}, attackCooldown:0,
    invulnerable:0, monsters:[], nodes:[], worldSeed:Math.floor(Math.random()*999999), sleeping:false
  });
  let state=freshState("Explorador");
  const capacity=20;
  const saveKey=i=>"verdalia_save_"+i;
  function safeParse(raw){try{return JSON.parse(raw)}catch(e){return null}}
  function loadSlot(i){return safeParse(localStorage.getItem(saveKey(i)))}
  function saveGame(silent=false){
    if(!state)return;
    state.lastSaved=Date.now();
    try{localStorage.setItem(saveKey(currentSave),JSON.stringify(state));if(!silent)toast("Progresso salvo no arquivo "+(currentSave+1)+".");}
    catch(e){toast("Não foi possível salvar. Verifique o espaço do navegador.");}
    updateHUD();
  }
  function toast(msg){
    const el=$("toast");el.textContent=msg;el.classList.add("show");
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2300);
  }
  function startGame(slot,newGame){
    currentSave=slot;
    if(newGame){state=freshState($("playerName").value.trim()||"Explorador");state.nodes=makeNodes();state.monsters=[];localStorage.setItem(saveKey(slot),JSON.stringify(state));}
    else {const loaded=loadSlot(slot);if(!loaded){toast("Esse arquivo está vazio.");return;}state=loaded;state.nodes=state.nodes||makeNodes();state.monsters=state.monsters||[];state.inventory=state.inventory||{};state.discovered=state.discovered||{};state.firstDay=state.firstDay||{};state.unlocked=state.unlocked||{[regions[0]]:true};}
    $("menu").classList.add("hidden");$("game").classList.remove("hidden");running=true;paused=false;closePanel();lastFrame=performance.now();updateHUD();toast("Bem-vindo(a), "+state.name+"! Explore com curiosidade.");requestAnimationFrame(loop);
  }
  function makeNodes(){
    let arr=[];const spots=[
      [150,130],[240,230],[390,150],[500,390],[680,170],[760,410],[300,470],[590,260],[820,270],[120,400],[450,280],[700,500],[210,340],[540,100],[860,500],[370,520]
    ];
    for(let i=0;i<spots.length;i++){
      const candidates=SPECIES.filter(s=>s.region===state.region);
      const pool=candidates.length?candidates:SPECIES;
      const spec=pool[(i*7+state.day)%pool.length];
      arr.push({id:"node"+i,speciesId:spec.id,x:spots[i][0],y:spots[i][1],available:true,respawnDay:0});
    }
    return arr;
  }
  function ensureNodes(){
    if(!state.nodes||!state.nodes.length)state.nodes=makeNodes();
    // Add enough distinct species to every region to make exploration rewarding.
    const desired=22;
    while(state.nodes.length<desired){
      const i=state.nodes.length, spec=SPECIES[(i*13+state.day*3)%SPECIES.length];
      state.nodes.push({id:"node"+i,speciesId:spec.id,x:60+((i*137)%820),y:70+((i*91)%470),available:true,respawnDay:0});
    }
  }
  function nearestNode(){
    let best=null,dist=48;
    for(const n of state.nodes||[]){if(!n.available)continue;const d=Math.hypot(n.x-state.x,n.y-state.y);if(d<dist){best=n;dist=d;}}
    return best;
  }
  function speciesById(id){return SPECIES.find(s=>s.id===id)||SPECIES[0]}
  function discover(s){
    if(!state.discovered[s.id]){
      state.discovered[s.id]=true;state.firstDay[s.id]=state.day;
      toast("Nova descoberta: "+s.name+"!");
      $("fieldNote").textContent=s.name+": "+s.description;
      saveGame(true);
      if(Object.keys(state.discovered).length===100)toast("Catálogo completo! Você é guardião(ã) de Verdália!");
    }else toast(s.name+" já está registrado no diário.");
    updateHUD();
  }
  function itemCount(){return Object.values(state.inventory).reduce((a,b)=>a+b,0)}
  function collectNode(node){
    const s=speciesById(node.speciesId);
    if(itemCount()>=capacity){toast("Bolsa cheia! Guarde itens no baú da casa.");return;}
    state.inventory[s.id]=(state.inventory[s.id]||0)+1;
    node.available=false;node.respawnDay=state.day+1;
    toast("+1 "+s.name);
    $("fieldNote").textContent="Coletado: "+s.name+". Lembre-se de registrar suas observações.";
    saveGame(true);updateHUD();
  }
  function observe(){
    const node=nearestNode();
    if(!node){if(Math.hypot(state.x-480,state.y-300)<70){openChestPanel();return;}toast("Aproxime-se de uma planta para observar.");return;}
    const s=speciesById(node.speciesId);discover(s);
    showSpeciesPanel(s,node);
  }
  function showSpeciesPanel(s,node){
    openPanel("species",`<div class="panel-top"><h2>${s.emoji} ${s.name}</h2><button class="close" data-close>✕</button></div>
      <p><b>${s.category}</b> · ${s.rarity} · ${s.region}</p><p>${s.description}</p>
      <p><b>Observação:</b> observe formas, cores e o ambiente em que a espécie cresce. Este registro é educativo e não deve ser usado para identificar plantas silvestres para consumo.</p>
      <div class="panel-toolbar"><button data-collect="${s.id}" data-node="${node.id}">🧺 Coletar amostra</button><button data-close>Continuar explorando</button></div>`);
  }
  function openPanel(type,html){
    panelType=type;paused=true;const p=$("panel");p.innerHTML=html;p.classList.remove("hidden");
    p.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",closePanel));
    p.querySelectorAll("[data-collect]").forEach(b=>b.addEventListener("click",()=>{
      const n=state.nodes.find(x=>x.id===b.dataset.node);if(n&&n.available)collectNode(n);closePanel();
    }));
  }
  function closePanel(){panelType=null;paused=false;$("panel").classList.add("hidden");}
  function openJournal(){
    const discovered=Object.keys(state.discovered||{}).length;
    openPanel("journal",`<div class="panel-top"><h2>📖 Diário botânico</h2><button class="close" data-close>✕</button></div>
      <p>Descobertas: <b>${discovered}/100 — ${discovered}%</b>. Os registros desconhecidos permanecem ocultos até serem observados.</p>
      <div class="panel-toolbar"><select id="filterCategory"><option value="Todas">Todas as categorias</option><option>Planta</option><option>Fruta</option><option>Vegetal</option></select>
      <select id="filterRarity"><option value="Todas">Todas as raridades</option><option>Comum</option><option>Incomum</option><option>Raro</option></select>
      <select id="filterRegion"><option value="Todas">Todas as regiões</option>${regions.map(r=>`<option>${r}</option>`).join("")}</select></div><div id="speciesGrid" class="species-grid"></div>`);
    const draw=()=>{
      const cat=$("filterCategory").value,rar=$("filterRarity").value,reg=$("filterRegion").value;
      $("speciesGrid").innerHTML=SPECIES.filter(s=>(cat==="Todas"||s.category===cat)&&(rar==="Todas"||s.rarity===rar)&&(reg==="Todas"||s.region===reg)).map(s=>{
        const known=!!state.discovered[s.id];
        return `<div class="species-card ${known?"":"unknown"}"><div class="emoji">${known?s.emoji:"❔"}</div><b>${known?s.name:"Espécie desconhecida"}</b><small>${known?s.category+" · "+s.region:"Observe no mundo para revelar"}</small>${known?`<small>Coletadas: ${state.inventory[s.id]||0} · Dia ${state.firstDay[s.id]||"—"}</small>`:""}</div>`;
      }).join("");
    };
    ["filterCategory","filterRarity","filterRegion"].forEach(id=>$(id).addEventListener("change",draw));draw();
  }
  function openInventory(){
    const entries=Object.entries(state.inventory).filter(([,n])=>n>0);
    openPanel("inventory",`<div class="panel-top"><h2>🎒 Bolsa do explorador</h2><button class="close" data-close>✕</button></div><p>Capacidade: ${itemCount()}/${capacity} itens. O inventário não descarta itens automaticamente.</p>
      <div class="item-list">${entries.length?entries.map(([id,n])=>{const s=speciesById(id);return `<div class="item-row"><b>${s.emoji} ${s.name}</b><p>${s.category} · ${n} unidade(s)</p><button data-store="${id}">Guardar no baú (em casa)</button></div>`}).join(""):"<p>A bolsa está vazia. Encontre uma espécie e colete uma amostra.</p>"}</div>`);
    $("panel").querySelectorAll("[data-store]").forEach(b=>b.addEventListener("click",()=>{if(!nearHouse()){toast("Você precisa estar perto da casa para guardar itens.");return;}const id=b.dataset.store;state.chest[id]=(state.chest[id]||0)+state.inventory[id];delete state.inventory[id];saveGame(true);openInventory();}));
  }
  function openChestPanel(){
    const entries=Object.entries(state.chest||{}).filter(([,n])=>n>0);
    openPanel("chest",`<div class="panel-top"><h2>🧰 Baú da casa</h2><button class="close" data-close>✕</button></div><p>Organize suas amostras aqui. A bolsa comporta ${capacity} unidades.</p><div class="item-list">${entries.length?entries.map(([id,n])=>{const s=speciesById(id);return `<div class="item-row"><b>${s.emoji} ${s.name}</b><p>No baú: ${n}</p><button data-take="${id}">Retirar 1</button></div>`}).join(""):"<p>O baú está vazio. Fique perto da casa para guardar ou retirar amostras.</p>"}</div>`);
    $("panel").querySelectorAll("[data-take]").forEach(b=>b.addEventListener("click",()=>{const id=b.dataset.take;if(itemCount()>=capacity){toast("Bolsa cheia.");return;}state.chest[id]--;state.inventory[id]=(state.inventory[id]||0)+1;if(state.chest[id]<=0)delete state.chest[id];saveGame(true);openChestPanel();}));
  }
  function nearHouse(){return Math.hypot(state.x-480,state.y-300)<85}
  function openMap(){
    openPanel("map",`<div class="panel-top"><h2>🗺 Mapa de Verdália</h2><button class="close" data-close>✕</button></div><p>As regiões ficam disponíveis conforme sua exploração. Escolha uma região já conhecida para viajar pelo caminho de trilha.</p><div class="map-grid">${regions.map((r,i)=>{const unlocked=!!state.unlocked[r];return `<button class="map-region ${unlocked?"":"locked"}" data-region="${r}" ${unlocked?"":"disabled"}><b>${["🌾","🌳","🍎","🏞️","🌿","⛰️","🍄","🌷"][i]}</b>${r}${state.visited[r]?"<br><small>Visitada</small>":""}</button>`}).join("")}</div>`);
    $("panel").querySelectorAll("[data-region]").forEach(b=>b.addEventListener("click",()=>travel(b.dataset.region)));
  }
  function travel(region){
    state.region=region;state.visited[region]=true;
    // Unlock the next region when exploring; keeps the demo's progression understandable.
    const idx=regions.indexOf(region);if(idx<regions.length-1)state.unlocked[regions[idx+1]]=true;
    state.x=480;state.y=320;state.nodes=makeNodes();ensureNodes();state.monsters=[];
    closePanel();saveGame(true);updateHUD();toast("Você chegou a: "+region+".");
  }
  function openHelp(){
    openPanel("help",`<div class="panel-top"><h2>❔ Como jogar</h2><button class="close" data-close>✕</button></div>
      <p><b>WASD / setas:</b> mover o personagem.</p><p><b>E:</b> observar uma espécie próxima; a primeira observação registra no diário.</p><p><b>Espaço:</b> atacar monstros com a espada.</p><p><b>J:</b> abrir diário · <b>I:</b> inventário · <b>M:</b> mapa · <b>Esc:</b> fechar painel/pausar.</p><p><b>Casa:</b> aproxime-se da cabana no centro e pressione E para abrir o baú. Para dormir, aproxime-se da cama (ícone de cama dentro da casa, perto do centro) e pressione E.</p><p>À noite aparecem criaturas de musgo. Derrote-as ou volte para casa. A observação não exige coleta.</p><p><b>Nota escolar:</b> as descrições são simplificadas e não servem para identificar plantas silvestres para consumo.</p>`);
  }
  function openSaves(){
    const html=`<div class="panel-top"><h2>💾 Gerenciar saves</h2><button class="close" data-close>✕</button></div><p>Até cinco arquivos independentes ficam salvos neste navegador.</p><div class="save-list">${[0,1,2,3,4].map(i=>{const s=loadSlot(i);return `<div class="save-card"><div class="save-info"><b>Arquivo ${i+1}: ${s?s.name:"Vazio"}</b><small>${s?`Dia ${s.day} · ${Object.keys(s.discovered||{}).length}/100 descobertas · ${s.region}`:"Nenhum progresso salvo"}</small></div>${s?`<button data-load="${i}">Carregar</button><button data-delete="${i}">Excluir</button>`:`<button data-new="${i}">Criar novo</button>`}</div>`}).join("")}</div>`;
    openPanel("saves",html);
    $("panel").querySelectorAll("[data-load]").forEach(b=>b.addEventListener("click",()=>startGame(+b.dataset.load,false)));
    $("panel").querySelectorAll("[data-new]").forEach(b=>b.addEventListener("click",()=>{closePanel();$("playerName").value=($("playerName").value||"Explorador");startGame(+b.dataset.new,true)}));
    $("panel").querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>{const i=+b.dataset.delete;if(confirm("Excluir definitivamente o Arquivo "+(i+1)+"? Esta ação não pode ser desfeita.")){localStorage.removeItem(saveKey(i));openSaves();}}));
  }
  function openCredits(){openPanel("credits",`<div class="panel-top"><h2>Créditos</h2><button class="close" data-close>✕</button></div><div style="text-align:center;padding:30px 10px"><div style="font-size:42px;color:#86a86f">✿</div><h2 style="font-size:30px;color:#416748">Giulia Cabanas</h2><p>Obrigado por explorar Verdália.</p><p>Arte e sistemas desenhados em Canvas 2D com formas e símbolos originais. Fontes: DM Sans e Fraunces via Google Fonts, quando houver conexão.</p></div>`);}
  function sleep(){
    state.day++;state.minutes=420;state.health=state.maxHealth;state.x=480;state.y=320;
    state.monsters=[];for(const n of state.nodes||[]){if(!n.available&&n.respawnDay<=state.day)n.available=true;}
    saveGame(true);closePanel();updateHUD();toast("Bom dia! Você descansou e recuperou a vida.");
  }
  function interact(){
    // House/cabin central zone: chest on the west side, bed on the east side.
    if(nearHouse()){
      if(state.x<480){openChestPanel();return;}
      openPanel("sleep",`<div class="panel-top"><h2>🛏️ Hora de descansar?</h2><button class="close" data-close>✕</button></div><p>Encerrar o dia recupera toda a vida, avança o calendário e faz os recursos reaparecerem.</p><div class="panel-toolbar"><button class="primary" id="sleepNow">Dormir e salvar</button><button data-close>Continuar acordado</button></div>`);
      $("sleepNow").addEventListener("click",sleep);return;
    }
    observe();
  }
  function attack(){
    if(state.attackCooldown>0)return;
    state.attackCooldown=.45;
    const dir=state.facing||{x:0,y:1};
    let hit=false;
    for(const m of state.monsters||[]){
      const dx=m.x-state.x,dy=m.y-state.y,d=Math.hypot(dx,dy);
      const dot=(dx*dir.x+dy*dir.y)/(d||1);
      if(d<67&&dot>-.05){m.hp-=35;hit=true;m.flash=.16;if(m.hp<=0){state.defeated++;state.inventory["sp100"]=(state.inventory["sp100"]||0)+0;toast("Criatura derrotada!");}}
    }
    state.monsters=state.monsters.filter(m=>m.hp>0);
    if(hit)toast("Golpe de espada!");else toast("A espada cortou o ar.");
    updateHUD();
  }
  function spawnMonsters(){
    if(state.minutes>=1080||state.minutes<360){
      if(state.monsters.length<4&&Math.random()<.012){
        let x=state.x+(Math.random()<.5?-1:1)*(140+Math.random()*100),y=state.y+(Math.random()<.5?-1:1)*(110+Math.random()*100);
        x=Math.max(35,Math.min(W-35,x));y=Math.max(35,Math.min(H-35,y));
        state.monsters.push({x,y,hp:60,maxHp:60,speed:30+Math.random()*12,damage:9,attackWait:0,flash:0});
      }
    }else state.monsters=[];
  }
  function update(dt){
    state.playSeconds=(state.playSeconds||0)+dt;
    state.minutes+=dt*1.15;if(state.minutes>=1440){state.minutes=360;state.day++;}
    state.attackCooldown=Math.max(0,state.attackCooldown-dt);state.invulnerable=Math.max(0,state.invulnerable-dt);
    const sp=150*dt;let dx=0,dy=0;
    if(keys.w||keys.arrowup)dy-=1;if(keys.s||keys.arrowdown)dy+=1;if(keys.a||keys.arrowleft)dx-=1;if(keys.d||keys.arrowright)dx+=1;
    if(dx||dy){const l=Math.hypot(dx,dy);dx/=l;dy/=l;state.facing={x:dx,y:dy};
      const nx=state.x+dx*sp,ny=state.y+dy*sp;
      if(nx>25&&nx<W-25)state.x=nx;if(ny>40&&ny<H-25)state.y=ny;
    }
    // Keep the cabin area walkable but block the solid cabin body.
    if(Math.abs(state.x-480)<65&&state.y>245&&state.y<330){state.x+=state.x<480?-sp:sp;}
    spawnMonsters();
    for(const m of state.monsters){
      const vx=state.x-m.x,vy=state.y-m.y,d=Math.hypot(vx,vy)||1;
      if(d>28){m.x+=vx/d*m.speed*dt;m.y+=vy/d*m.speed*dt;}
      else if(m.attackWait<=0&&state.invulnerable<=0){state.health=Math.max(0,state.health-m.damage);state.invulnerable=1.15;m.attackWait=.9;toast("Você sofreu dano!");}
      m.attackWait=Math.max(0,m.attackWait-dt);m.flash=Math.max(0,m.flash-dt);
    }
    // Safe return after defeat.
    if(state.health<=0){state.health=50;state.x=480;state.y=320;state.monsters=[];toast("Você desmaiou e voltou para casa com metade da vida.");saveGame(true);}
    ensureNodes();
  }
  function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h))}
  function drawTree(x,y,scale=1){
    rect(x-5*scale,y+7*scale,10*scale,18*scale,"#76553a");
    rect(x-15*scale,y-7*scale,30*scale,20*scale,"#2f7047");
    rect(x-11*scale,y-13*scale,22*scale,15*scale,"#4f9656");
    rect(x-6*scale,y-16*scale,10*scale,7*scale,"#75b568");
    rect(x-11*scale,y-6*scale,5*scale,5*scale,"#77b96a");
  }
  function drawWorld(){
    const colors=regionColors[state.region]||regionColors[regions[0]];
    rect(0,0,W,H,colors[0]);
    // Patchy pixel-grass texture, deterministic for the current map.
    for(let i=0;i<220;i++){let x=(i*137+state.worldSeed%97)%W,y=(i*83+state.worldSeed%67)%H;rect(x,y,3,3,i%3===0?colors[1]:"#9ac77d");}
    // winding trail
    ctx.fillStyle="#cbbd8a";ctx.beginPath();ctx.moveTo(0,470);ctx.lineTo(0,500);ctx.lineTo(250,410);ctx.lineTo(450,440);ctx.lineTo(690,360);ctx.lineTo(960,385);ctx.lineTo(960,410);ctx.lineTo(680,390);ctx.lineTo(450,470);ctx.lineTo(245,440);ctx.closePath();ctx.fill();
    // river on river map
    if(state.region==="Margens do Rio"){rect(0,70,960,75,"#66b7d2");rect(0,80,960,5,"#a3dce5");for(let i=0;i<20;i++)rect(i*51,104+(i%3)*7,26,3,"#a3dce5");}
    // rocks and decorative flora
    for(let i=0;i<16;i++){
      const x=(i*191+80)%900+25,y=(i*113+70)%500+40;
      if(Math.hypot(x-state.x,y-state.y)>40) {
        if(i%3===0)drawTree(x,y,.8+(i%2)*.2);
        else {rect(x-10,y-5,20,13,"#7b8c6c");rect(x-6,y-10,12,8,"#a6b49a");}
      }
    }
    // Cabin, chest and bed
    rect(402,245,156,93,"#d8b783");rect(392,237,176,17,"#815d44");rect(414,255,132,74,"#f0d8a9");
    ctx.fillStyle="#a9654c";ctx.beginPath();ctx.moveTo(386,247);ctx.lineTo(480,190);ctx.lineTo(574,247);ctx.closePath();ctx.fill();
    rect(461,282,38,56,"#78533b");rect(467,288,26,50,"#9e6d48");rect(422,265,27,24,"#6a9aaf");rect(511,265,27,24,"#6a9aaf");
    rect(360,303,28,21,"#956d42");rect(364,307,20,13,"#c9a46d");
    // bed marker inside cabin
    rect(520,304,20,10,"#e9e6d6");rect(520,304,8,10,"#9ab8ce");
    // plants
    for(const n of state.nodes||[]){
      if(!n.available)continue;
      const s=speciesById(n.speciesId);
      rect(n.x-5,n.y+5,10,4,"#5d7c43");
      rect(n.x-2,n.y-4,4,10,"#34764a");
      rect(n.x-7,n.y-5,5,5,"#f2d98a");rect(n.x+2,n.y-7,5,5,"#f0e9d0");
      if(s.category==="Fruta"){rect(n.x-5,n.y-7,5,5,"#d7655b");rect(n.x+2,n.y-4,5,5,"#d7655b");}
      if(s.category==="Vegetal"){rect(n.x-7,n.y-5,5,5,"#6a9c54");rect(n.x+2,n.y-7,5,5,"#80b95f");}
    }
    // monsters
    for(const m of state.monsters||[]){
      rect(m.x-10,m.y-10,20,20,m.flash>0?"#fff":"#354f50");rect(m.x-7,m.y-14,14,8,"#547d68");rect(m.x-6,m.y-3,4,4,"#f2d27c");rect(m.x+3,m.y-3,4,4,"#f2d27c");
      rect(m.x-13,m.y-20,26,4,"#453e42");rect(m.x-13,m.y-20,26*(m.hp/m.maxHp),4,"#dc7165");
    }
    // player sprite, blinking during invulnerability
    if(state.invulnerable<=0||Math.floor(performance.now()/90)%2===0){
      rect(state.x-7,state.y-8,14,17,"#f0c29b");rect(state.x-8,state.y-14,16,9,"#5c4937");rect(state.x-7,state.y+7,5,9,"#395c79");rect(state.x+2,state.y+7,5,9,"#395c79");
      rect(state.x-4,state.y-3,2,2,"#28382e");rect(state.x+3,state.y-3,2,2,"#28382e");
      // sword points in facing direction
      if(state.attackCooldown>.25){rect(state.x+state.facing.x*13-2,state.y+state.facing.y*13-2,5,15,"#e7e7d4");}
    }
    // night overlay
    const night=state.minutes>=1080||state.minutes<360;
    let alpha=0;
    if(state.minutes>=1020&&state.minutes<1200)alpha=(state.minutes-1020)/180*.48;
    else if(state.minutes>=1200||state.minutes<300)alpha=.52;
    else if(state.minutes>=300&&state.minutes<420)alpha=(420-state.minutes)/120*.52;
    if(alpha>0){rect(0,0,W,H,`rgba(19,31,53,${Math.max(0,Math.min(.56,alpha))})`);}
    // interaction ring and house labels
    const node=nearestNode();
    if(node){ctx.strokeStyle="#fff4c2";ctx.lineWidth=2;ctx.beginPath();ctx.arc(node.x,node.y,17,0,Math.PI*2);ctx.stroke();}
    ctx.fillStyle="#fff7d8";ctx.font="bold 12px DM Sans";ctx.textAlign="center";
    if(nearHouse())ctx.fillText(state.x<480?"E · Baú":"E · Dormir",state.x,state.y-25);
    else if(node)ctx.fillText("E · Observar",node.x,node.y-22);
    ctx.textAlign="left";
  }
  function updateHUD(){
    $("healthFill").style.width=(state.health/state.maxHealth*100)+"%";$("healthText").textContent=Math.ceil(state.health)+"/"+state.maxHealth;
    $("dayText").textContent="Dia "+state.day;
    const mins=Math.floor(state.minutes)%1440,h=Math.floor(mins/60),m=mins%60;
    $("timeText").textContent=String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");
    $("discoveryText").textContent=Object.keys(state.discovered||{}).length+"/100";
    $("progressPercent").textContent=Object.keys(state.discovered||{}).length+"%";
    $("progressFill").style.width=Object.keys(state.discovered||{}).length+"%";
    $("bagCount").textContent=itemCount()+"/"+capacity;$("enemyCount").textContent=state.defeated||0;$("regionName").textContent=state.region;
  }
  let lastFrame=0,uiAccumulator=0;
  function loop(now){
    if(!running)return;
    const dt=Math.min(.05,(now-lastFrame)/1000||0);lastFrame=now;
    if(!paused)update(dt);
    drawWorld();uiAccumulator+=dt;if(uiAccumulator>.2){updateHUD();uiAccumulator=0;}
    requestAnimationFrame(loop);
  }
  window.addEventListener("keydown",e=>{
    const k=e.key.toLowerCase();
    if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k))e.preventDefault();
    if(!running)return;
    if(k==="escape"){if(panelType)closePanel();else{paused=!paused;toast(paused?"Jogo pausado.":"Jogo retomado.");}return;}
    if(panelType)return;
    keys[k]=true;
    if(k==="e")interact();if(k===" " )attack();if(k==="j")openJournal();if(k==="i")openInventory();if(k==="m")openMap();
  });
  window.addEventListener("keyup",e=>{keys[e.key.toLowerCase()]=false});
  $("newGame").addEventListener("click",()=>{let slot=[0,1,2,3,4].find(i=>!loadSlot(i));if(slot===undefined){alert("Os cinco arquivos estão ocupados. Exclua um save em Gerenciar saves.");return;}startGame(slot,true);});
  $("continueGame").addEventListener("click",()=>{const slots=[0,1,2,3,4].map(i=>({i,s:loadSlot(i)})).filter(x=>x.s);if(!slots.length){alert("Ainda não há um jogo salvo. Escolha Novo jogo.");return;}slots.sort((a,b)=>(b.s.lastSaved||0)-(a.s.lastSaved||0));startGame(slots[0].i,false);});
  $("manageSaves").addEventListener("click",()=>{ // save manager as a temporary overlay on the menu
    $("menu").classList.add("hidden");$("game").classList.remove("hidden");running=false;state=freshState("Explorador");openSaves();
    $("backMenu").textContent="Voltar ao menu";$("panel").classList.remove("hidden");
  });
  $("creditsButton").addEventListener("click",()=>{ $("menu").classList.add("hidden");$("game").classList.remove("hidden");running=false;state=freshState("Explorador");openCredits();});
  document.querySelectorAll("[data-panel]").forEach(b=>b.addEventListener("click",()=>{if(!running)return;const t=b.dataset.panel;if(t==="journal")openJournal();if(t==="inventory")openInventory();if(t==="map")openMap();if(t==="help")openHelp();}));
  $("saveButton").addEventListener("click",()=>saveGame(false));
  $("pauseButton").addEventListener("click",()=>{paused=!paused;toast(paused?"Jogo pausado.":"Jogo retomado.");});
  $("backMenu").addEventListener("click",()=>{if(confirm("Voltar ao menu? O progresso recente será salvo.")){if(running)saveGame(true);running=false;paused=false;closePanel();$("game").classList.add("hidden");$("menu").classList.remove("hidden");}});
  // Any unused click on the game canvas can also trigger a sword swing.
  canvas.addEventListener("click",()=>{if(running&&!paused)attack();});
})();