/* Direct-manipulation Home editor. Only Done commits the draft to synced settings. */
(function(){
 'use strict';
 const EX=window.EX,A=window.EXA,UI=window.UI,S=EX.state,esc=EX.esc;
 const $=(s,r=document)=>r.querySelector(s),all=(s,r=document)=>[...r.querySelectorAll(s)];
 const originalHome=A.home,keys=['balance','welcome','due','wallets','safe','ideas','goals','recent'];
 const words={en:{safe:'Safe to spend',title:'Customize Home',done:'Done',cancel:'Cancel',cards:'Cards',add:'Add cards',hidden:'Hidden cards',empty:'All available cards are on Home.',reset:'Reset layout',small:'Small',medium:'Medium',full:'Full',size:'Resize',hide:'Hide',restore:'Add',hint:'Drag to move · Pull the corner to resize',dismiss:'Dismiss hint',drag:'Drag to move. Use arrow keys to move, Enter to resize.',smallHelp:'Half-width summary',mediumHelp:'Wide, short card',fullHelp:'Wide, more detail',noData:'Nothing to show yet.',balance:'Balance',welcome:'Account & install',due:'Due soon',wallets:'Wallets',ideas:'Ideas for you',goals:'Budgets & goals',recent:'Recent activity'},el:{safe:'Περιθώριο εξόδων',title:'Προσαρμογή Αρχικής',done:'Έτοιμο',cancel:'Ακύρωση',cards:'Κάρτες',add:'Προσθήκη καρτών',hidden:'Κρυμμένες κάρτες',empty:'Όλες οι διαθέσιμες κάρτες βρίσκονται στην Αρχική.',reset:'Επαναφορά διάταξης',small:'Μικρό',medium:'Μεσαίο',full:'Πλήρες',size:'Αλλαγή μεγέθους',hide:'Απόκρυψη',restore:'Προσθήκη',hint:'Σύρετε για μετακίνηση · Τραβήξτε τη γωνία για μέγεθος',dismiss:'Απόκρυψη οδηγίας',drag:'Σύρετε για μετακίνηση. Χρησιμοποιήστε τα βέλη για σειρά και Enter για μέγεθος.',smallHelp:'Σύνοψη στο μισό πλάτος',mediumHelp:'Οριζόντια, χαμηλή κάρτα',fullHelp:'Οριζόντια, περισσότερα στοιχεία',noData:'Δεν υπάρχει ακόμη περιεχόμενο.',balance:'Υπόλοιπο',welcome:'Λογαριασμός & εγκατάσταση',due:'Πλησιάζουν',wallets:'Πορτοφόλια',ideas:'Ιδέες για εσάς',goals:'Προϋπολογισμοί & στόχοι',recent:'Πρόσφατες κινήσεις'}};
 const t=k=>(words[EX.lang()]||words.en)[k],L=k=>esc(t(k));
 const copy=x=>JSON.parse(JSON.stringify(x));
 const sizeOf=s=>s==='compact'?'medium':s==='wide'?'full':['small','medium','full'].includes(s)?s:'full';
 let draft=null,source=null,selected=null,hold=null,drag=null,resize=null,blockClickUntil=0,blockToolbarUntil=0,scrollFrame=0,suppressRelease=false;
 A.dashboardEditing=()=>draft!==null;
 const layout=()=>{const value=draft??S().settings.homeLayout;return Array.isArray(value)?value.filter(x=>x&&keys.includes(x.id)):[];};
 const widget=id=>all('#homeGrid>[data-home]').find(x=>x.dataset.home===id);
 const entry=id=>{let x=draft.find(x=>x.id===id);if(!x){x={id,size:'full',hidden:false};draft.push(x);}return x;};
 const order=()=>all('#homeGrid>[data-home]').map(x=>x.dataset.home);
 const motion=()=>{const m=document.documentElement.dataset.motion;return m!=='off'&&m!=='reduced'&&(m==='full'||!matchMedia('(prefers-reduced-motion:reduce)').matches);};
 const moneyTotal=()=>EX.sumByCur(EX.activeAccounts().map(a=>({amount:EX.balance(a)/100,currency:a.currency})))||EX.money(0);
 function smallMarkup(id){
  if(id==='safe')return A.safeSmall();
  const stats={balance:[moneyTotal(),'wallet',''],wallets:[String(EX.activeAccounts().length),'wallet','data-more="wallets"'],due:[String(A.active().length),'calendar-event','data-go="bills"'],recent:[String(S().txs.length),'arrows-sort','data-go="activity"'],goals:[String(S().budgets.length+S().goals.length),'target','data-go="plan"'],ideas:['','info-circle','data-home-ideas'],welcome:['','user-circle','data-more="account"']};
  const [value,icon,action]=stats[id];return `<div class="dash-summary${id==='balance'?' dash-summary-balance':''}"><span>${UI.icon(icon,20)} ${L(id)}</span><strong>${esc(value)}</strong>${id==='balance'?`<small>${esc(EX.t('ovBalance'))}</small>`:`<button type="button" class="link" ${action}>${esc(EX.t('seeAll'))} ${UI.icon('chevron-right',16)}</button>`}</div>`;
 }
 function sizedContent(id,size,html){
  if(size==='small')return smallMarkup(id);
  if(size!=='medium')return html;
  const tmp=document.createElement('template');tmp.innerHTML=html;
  if(id==='balance'){
   const flip=$('.hero-flip',tmp.content);if(flip){flip.classList.remove('flipped');['role','tabindex','data-act','aria-pressed','aria-label'].forEach(k=>flip.removeAttribute(k));all('.hero-back,.flip-ic',flip).forEach(x=>x.remove());}
  }
  if(id==='wallets'){
   const items=all('.wc:not(.add)',tmp.content);items.slice(2).forEach(x=>x.remove());$('.wc.add',tmp.content)?.remove();
   if(items.length>2){const p=document.createElement('button');p.type='button';p.className='link dash-see-all';p.dataset.more='wallets';p.textContent=EX.t('seeAll')+' ('+items.length+')';tmp.content.append(p);}
  }
  if(id==='due'||id==='recent')all('.list>li',tmp.content).slice(2).forEach(x=>x.remove());
  if(id==='goals')all('.bcard,.gcard',tmp.content).slice(2).forEach(x=>x.remove());
  return tmp.innerHTML;
 }
 function readSource(){const tmp=document.createElement('template');tmp.innerHTML=originalHome();return [...tmp.content.children].filter(x=>x.hasAttribute('data-home'));}
 function renderWidget(el){
  const id=el.dataset.home,c=layout().find(x=>x.id===id)||{},size=sizeOf(c.size),html=el.innerHTML;
  el.classList.add('home-widget','dash-widget','dash-'+size);el.dataset.size=size;
  el.innerHTML=`<div class="dash-content">${sizedContent(id,size,html)}</div>`;
  if(draft!==null){
   el.dataset.selected=String(selected===id);
   el.insertAdjacentHTML('beforeend',`<button type="button" class="dash-drag" data-dash-drag="${id}" aria-label="${L(id)}. ${L('drag')}"></button><button type="button" class="dash-remove" data-dash-hide="${id}" aria-label="${L('hide')}: ${L(id)}">${UI.icon('minus',20)}</button><span class="dash-size-badge">${L(size)}</span><button type="button" class="dash-resize" data-dash-resize="${id}" aria-label="${L('size')}: ${L(id)}">${UI.icon('arrows-diagonal',20)}</button>`);
  }
  return el.outerHTML;
 }
 A.home=()=>{
  let nodes=draft!==null&&source?source.map(x=>x.cloneNode(true)):readSource();
  const config=layout(),ids=config.map(x=>x.id);
  if(ids.length)nodes.sort((a,b)=>(ids.includes(a.dataset.home)?ids.indexOf(a.dataset.home):99)-(ids.includes(b.dataset.home)?ids.indexOf(b.dataset.home):99));
  nodes=nodes.filter(x=>!(config.find(c=>c.id===x.dataset.home)||{}).hidden&&x.innerHTML.trim());
  const bar=draft!==null?`<div class="dash-editbar" role="toolbar" aria-label="${L('title')}"><button type="button" class="btn btn-ghost" data-dash-cancel>${L('cancel')}</button><button type="button" class="btn btn-ghost dash-add-cards" data-dash-cards aria-label="${L('add')}">${UI.icon('plus',20)} ${L('cards')}</button><button type="button" class="btn btn-ghost" data-dash-appearance>${UI.icon('palette',20)} ${esc(EX.t('homeAppearance'))}</button><button type="button" class="btn btn-primary" data-dash-done>${L('done')}</button></div>${!S().device.dashboardHintSeen?`<div class="dash-hint" role="status"><span>${L('hint')}</span><button type="button" class="ab-btn" data-dash-dismiss aria-label="${L('dismiss')}">${UI.icon('x',18)}</button></div>`:''}`:'';
  return bar+`<div id="homeGrid" class="dashboard-grid dash-grid${draft!==null?' dashboard-editing':''}">${nodes.map(renderWidget).join('')}</div><div id="dashAnnounce" class="sr-only" aria-live="polite"></div>`;
 };
 function select(id){selected=id;all('#homeGrid>[data-home]').forEach(x=>x.dataset.selected=String(x.dataset.home===id));}
 function begin(id){
  if(draft!==null||UI.sheetOpen()||A.flow.active())return;
  A.homeLookDraft=copy(S().settings.themeLooks||{});source=readSource();draft=copy(layout()).map(x=>({...x,size:sizeOf(x.size)}));
  source.forEach(x=>entry(x.dataset.home));selected=id||null;A.render();UI.haptic(25);
 }
 function closeEditor(save){
  stopGesture(true);if(save){const defaults=source.map(x=>x.dataset.home);const unchanged=draft.length===defaults.length&&draft.every((x,i)=>x.id===defaults[i]&&!x.hidden&&sizeOf(x.size)==='full');S().settings.homeLayout=unchanged?[]:copy(draft||[]);S().device.dashboardHintSeen=true;}
  if(save)S().settings.themeLooks=copy(A.homeLookDraft||{});delete A.homeLookDraft;A.applyCustomTheme();draft=null;source=null;selected=null;
  if(save)EX.save();else A.render();
 }
 const sheetHead=title=>`<div class="sheet-head"><button type="button" class="ab-btn" data-close aria-label="${esc(EX.t('close'))}">${UI.icon('x',24)}</button><h2 id="sheetTitle">${esc(title)}</h2></div>`;
 function sizePicker(id){
  if(draft===null)return;select(id);const value=sizeOf(entry(id).size);
  UI.openSheet(sheetHead(t('size')+' · '+t(id))+`<div class="sheet-pad"><div class="dash-size-choices" role="group" aria-label="${L('size')}">${['small','medium','full'].map(size=>`<button type="button" class="dash-size-choice" data-dash-size="${size}" data-id="${id}" aria-pressed="${value===size}"><span class="dash-size-picture ${size}" aria-hidden="true"><i></i></span><strong>${L(size)}</strong><small>${L(size+'Help')}</small></button>`).join('')}</div></div>`,{cls:'small'});
 }
 function cardsPicker(){
  if(draft===null)return;
  const hidden=draft.filter(x=>x.hidden&&source.some(n=>n.dataset.home===x.id&&n.innerHTML.trim()));
  UI.openSheet(sheetHead(t('hidden'))+`<div class="sheet-pad">${hidden.length?hidden.map(x=>`<button type="button" class="mrow" data-dash-restore="${x.id}">${UI.ci('layout-dashboard','blue',36)}<span class="mid"><b>${L(x.id)}</b></span>${UI.icon('plus',22)}</button>`).join(''):`<p class="muted">${L('empty')}</p>`}<button type="button" class="btn btn-ghost" data-dash-reset>${UI.icon('refresh',20)} ${L('reset')}</button></div>`,{cls:'small'});
 }
 function applySize(id,size){
  if(draft===null)return;entry(id).size=size;select(id);
  const el=widget(id),original=source.find(n=>n.dataset.home===id);if(!el||!original)return;
  el.classList.remove('dash-small','dash-medium','dash-full');el.classList.add('dash-'+size);el.dataset.size=size;
  $('.dash-content',el).innerHTML=sizedContent(id,size,original.innerHTML);$('.dash-size-badge',el).textContent=t(size);
  $('#dashAnnounce').textContent=t(id)+': '+t(size);
 }
 function move(id,target){
  const ids=order(),from=ids.indexOf(id),to=ids.indexOf(target);if(from<0||to<0||from===to)return;
  const grid=$('#homeGrid'),before=new Map(all('[data-home]',grid).map(el=>[el,el.getBoundingClientRect()]));
  ids.splice(from,1);ids.splice(to,0,id);
  draft=ids.map(entry).concat(draft.filter(x=>!ids.includes(x.id)));
  ids.forEach(key=>grid.append(widget(key)));
  if(motion())before.forEach((r,el)=>{if(el.dataset.home===id)return;const n=el.getBoundingClientRect();if(Math.abs(r.left-n.left)+Math.abs(r.top-n.top)>2)el.animate([{transform:`translate(${r.left-n.left}px,${r.top-n.top}px)`},{transform:'translate(0,0)'}],{duration:180,easing:'ease-out'});});
  $('#dashAnnounce').textContent=t(id);
 }
 function releaseCapture(pointer){try{if(document.body.hasPointerCapture(pointer))document.body.releasePointerCapture(pointer);}catch(e){/* pointer already ended */}}
 function stopGesture(cancel=false){
  if(hold){clearTimeout(hold.timer);hold=null;}
  cancelAnimationFrame(scrollFrame);scrollFrame=0;
  if(drag){const d=drag;drag=null;d.ghost?.remove();widget(d.id)?.classList.remove('dash-placeholder');$('#homeGrid')?.classList.remove('dash-moving');releaseCapture(d.pointer);if(d.started&&!cancel)blockClickUntil=performance.now()+350;}
  if(resize){const r=resize;resize=null;releaseCapture(r.pointer);if(cancel&&r.started)applySize(r.id,r.base);if(!cancel){blockClickUntil=performance.now()+350;if(!r.started)sizePicker(r.id);}}
 }
 function dragStep(x,y){
  if(!drag?.started)return;drag.x=x;drag.y=y;
  drag.ghost.style.transform=`translate(${x-drag.startX}px,${y-drag.startY}px) scale(1.025)`;
  const hit=document.elementFromPoint(x,y)?.closest('#homeGrid>[data-home]');
  if(hit&&hit.dataset.home!==drag.id){const ids=order(),from=ids.indexOf(drag.id),to=ids.indexOf(hit.dataset.home),r=hit.getBoundingClientRect(),own=widget(drag.id)?.getBoundingClientRect();const horizontal=own&&Math.abs(own.top-r.top)<24;const after=horizontal?x>r.left+r.width/2:y>r.top+r.height/2;if((to>from&&after)||(to<from&&!after))move(drag.id,hit.dataset.home);}
 }
 function autoScroll(){
  if(!drag?.started)return;const view=$('#view'),r=view.getBoundingClientRect(),top=r.top+Math.min(80,r.height*.16),bottom=r.bottom-60;
  const delta=drag.y<top?-Math.min(16,(top-drag.y)*.3):drag.y>bottom?Math.min(16,(drag.y-bottom)*.3):0;
  if(delta){view.scrollTop+=delta;dragStep(drag.x,drag.y);}scrollFrame=requestAnimationFrame(autoScroll);
 }
 function startDrag(){
  const el=widget(drag.id),rect=el.getBoundingClientRect();drag.started=true;
  const ghost=el.cloneNode(true);ghost.removeAttribute('data-home');ghost.setAttribute('aria-hidden','true');all('[id]',ghost).forEach(x=>x.removeAttribute('id'));ghost.classList.add('dash-ghost');ghost.style.cssText=`position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;margin:0;pointer-events:none;z-index:9999`;
  document.body.append(ghost);drag.ghost=ghost;el.classList.add('dash-placeholder');$('#homeGrid').classList.add('dash-moving');UI.haptic(12);autoScroll();
 }
 document.addEventListener('pointerdown',e=>{
  if(e.target.closest('[data-act=add]'))return;
  if(e.button!==0||UI.sheetOpen()||A.st.view!=='home')return;
  if(draft!==null){
   const handle=e.target.closest('[data-dash-resize]'),card=e.target.closest('[data-dash-drag]');if(!handle&&!card)return;
   const id=handle?handle.dataset.dashResize:card.dataset.dashDrag;select(id);document.body.setPointerCapture(e.pointerId);
   if(handle)resize={id,pointer:e.pointerId,startX:e.clientX,startY:e.clientY,base:sizeOf(entry(id).size),started:false};
   else drag={id,pointer:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,started:false};
   e.preventDefault();e.stopPropagation();return;
  }
  const el=e.target.closest('#homeGrid>[data-home]');if(!el||e.pointerType!=='touch'||e.target.closest('input,textarea,select,a'))return;
  hold={x:e.clientX,y:e.clientY,timer:setTimeout(()=>{const id=el.dataset.home;hold=null;suppressRelease=true;blockToolbarUntil=performance.now()+700;blockClickUntil=performance.now()+700;begin(id);},650)};
 });
 document.addEventListener('pointermove',e=>{
  if(hold&&Math.hypot(e.clientX-hold.x,e.clientY-hold.y)>10){clearTimeout(hold.timer);hold=null;}
  if(resize&&e.pointerId===resize.pointer){
   const dx=e.clientX-resize.startX,dy=e.clientY-resize.startY;if(Math.hypot(dx,dy)>8)resize.started=true;if(!resize.started)return;e.preventDefault();
   let next=resize.base;
   if(next==='small')next=dy>135?'full':dx>35||dy>40?'medium':'small';
   else if(next==='medium')next=dx<-45||dy<-70?'small':dy>70?'full':'medium';
   else next=dx<-45?'small':dy<-70?'medium':'full';
   if(next!==entry(resize.id).size){applySize(resize.id,next);UI.haptic(8);}return;
  }
  if(!drag||e.pointerId!==drag.pointer)return;
  if(!drag.started&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>7)startDrag();
  if(drag.started){e.preventDefault();dragStep(e.clientX,e.clientY);}
 },{passive:false});
 document.addEventListener('pointerup',()=>{if(suppressRelease){suppressRelease=false;blockToolbarUntil=performance.now()+80;blockClickUntil=performance.now()+80;}stopGesture();});
 document.addEventListener('pointercancel',()=>stopGesture(true));
 document.addEventListener('click',e=>{
  if(performance.now()<blockClickUntil&&e.target.closest('#homeGrid,.dash-ghost')||performance.now()<blockToolbarUntil&&e.target.closest('.dash-editbar,.dash-hint')){e.preventDefault();e.stopImmediatePropagation();return;}
  const el=e.target.closest('[data-home-settings],[data-dash-done],[data-dash-cancel],[data-dash-cards],[data-dash-appearance],[data-dash-dismiss],[data-dash-hide],[data-dash-resize],[data-dash-size],[data-dash-restore],[data-dash-reset],[data-dash-drag]');
  if(!el)return;e.preventDefault();e.stopImmediatePropagation();
  if(el.hasAttribute('data-home-settings')){UI.closeSheet();A.go('home');begin();return;}
  if(el.hasAttribute('data-dash-appearance'))return A.editHomeAppearance();
  if(el.hasAttribute('data-dash-done'))return closeEditor(true);
  if(el.hasAttribute('data-dash-cancel'))return closeEditor(false);
  if(el.hasAttribute('data-dash-cards'))return cardsPicker();
  if(el.hasAttribute('data-dash-dismiss')){S().device.dashboardHintSeen=true;EX.persist();$('.dash-hint')?.remove();return;}
  if(draft===null)return;
  if(el.dataset.dashHide){entry(el.dataset.dashHide).hidden=true;selected=null;A.render();return;}
  if(el.dataset.dashResize)return sizePicker(el.dataset.dashResize);
  if(el.dataset.dashSize){applySize(el.dataset.id,el.dataset.dashSize);UI.closeSheet();return;}
  if(el.dataset.dashRestore){entry(el.dataset.dashRestore).hidden=false;UI.closeSheet();A.render();return;}
  if(el.hasAttribute('data-dash-reset')){draft=[];source.forEach(x=>entry(x.dataset.home));selected=null;UI.closeSheet();A.render();return;}
  if(el.dataset.dashDrag)select(el.dataset.dashDrag);
 },true);
 document.addEventListener('keydown',e=>{
  if(draft===null||UI.sheetOpen())return;
  if(e.key==='Escape'){e.preventDefault();closeEditor(false);return;}
  const el=e.target.closest('[data-dash-drag]');if(!el)return;const id=el.dataset.dashDrag,ids=order(),i=ids.indexOf(id),step=['ArrowUp','ArrowLeft'].includes(e.key)?-1:['ArrowDown','ArrowRight'].includes(e.key)?1:0;
  if(step&&ids[i+step]){e.preventDefault();move(id,ids[i+step]);el.focus({preventScroll:true});}
  if(e.key==='Enter'){e.preventDefault();sizePicker(id);}
 });
 EX.on('auth',()=>{stopGesture(true);delete A.homeLookDraft;A.applyCustomTheme();draft=null;source=null;selected=null;});
})();
