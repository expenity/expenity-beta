/* App-only enhancements: tag library, dashboard layout, history reversal and retained release notes. */
(function () {
 'use strict';
 const EX=window.EX, A=window.EXA, UI=window.UI, S=EX.state, esc=EX.esc;
 const $=(s,r=document)=>r.querySelector(s);
 const copy=x=>JSON.parse(JSON.stringify(x));
 const words={
 en:{tags:'Tags',tagHelp:'Use commas to add tags. Choose existing tags or type new ones.',tagNew:'New tag',tagName:'Tag name',tagRename:'Rename tag',tagRemove:'Remove tag everywhere',tagEmpty:'Create tags here or while adding a record.',tagRequired:'Enter a tag name (up to 32 characters).',tagSearch:'Filter by tag',allTags:'All tags',tagRecords:'Tagged records',suggestions:'Choose a suggested name',ownName:'Write your own name',reminderOff:'Reminders need notifications enabled on this device. Enable them in More → Reminders so you can receive alerts, including when the app is closed.',enableAlerts:'Set up notifications',unpaid:'Mark as unpaid',unreceived:'Mark as not received',reverse:'Reverse this transaction',reverseTitle:'Reverse this record?',reverseText:'The transaction will be removed and the wallet balance recalculated. A linked bill or recurring income will become due again for this occurrence. Later recorded occurrences will stay.',reverseBlocked:'You only have viewing access to this wallet.',browserTitle:'Continue in your browser?',browserWarning:'The browser experience is less complete: you will miss the app window and, on iPhone or iPad, background notifications. You can install later.',handoffTitle:'Open Expenity from your home screen',handoffText:'Finish adding Expenity to your home screen. Then close this browser tab and tap the Expenity icon on your device to continue setup there. If the installed app asks you to sign in, use your existing account.',handoffWaiting:'Setup will continue in the installed app.',changelog:'What’s new',releaseFail:'Could not download the update. Check your connection and try again.',releaseReady:'Update downloaded. Tap to restart.',editHome:'Personalise Home',editHelp:'Hold for 650 ms to personalise. Drag the handles to reorder, resize or hide sections.',done:'Done',cancel:'Cancel',reset:'Reset layout',show:'Show',hide:'Hide',up:'Move up',down:'Move down',compact:'Compact',wide:'Full width',balance:'Balance',welcome:'Account & install tips',due:'Due soon',wallets:'Wallets',ideas:'Ideas for you',goals:'Budgets & goals',recent:'Recent activity',noWidget:'This section has nothing to show yet.',drag:'Drag to reorder',resize:'Section size',releaseLabel:'Version'},
 el:{tags:'Ετικέτες',tagHelp:'Χωρίστε τις ετικέτες με κόμμα. Επιλέξτε υπάρχουσες ή γράψτε νέες.',tagNew:'Νέα ετικέτα',tagName:'Όνομα ετικέτας',tagRename:'Μετονομασία ετικέτας',tagRemove:'Αφαίρεση ετικέτας από παντού',tagEmpty:'Δημιουργήστε ετικέτες εδώ ή κατά την προσθήκη μιας εγγραφής.',tagRequired:'Γράψτε όνομα ετικέτας (έως 32 χαρακτήρες).',tagSearch:'Φίλτρο ετικέτας',allTags:'Όλες οι ετικέτες',tagRecords:'Εγγραφές με ετικέτα',suggestions:'Επιλογή από προτεινόμενα ονόματα',ownName:'Γράψτε το δικό σας όνομα',reminderOff:'Για τις υπενθυμίσεις χρειάζονται ενεργές ειδοποιήσεις σε αυτή τη συσκευή. Ενεργοποιήστε τις από Περισσότερα → Υπενθυμίσεις, ώστε να λαμβάνετε ειδοποιήσεις και όταν η εφαρμογή είναι κλειστή.',enableAlerts:'Ρύθμιση ειδοποιήσεων',unpaid:'Σήμανση ως απλήρωτο',unreceived:'Σήμανση ως μη εισπραχθέν',reverse:'Αναίρεση αυτής της κίνησης',reverseTitle:'Να αναιρεθεί η εγγραφή;',reverseText:'Η κίνηση θα αφαιρεθεί και το υπόλοιπο θα υπολογιστεί ξανά. Ο συνδεδεμένος λογαριασμός ή το επαναλαμβανόμενο έσοδο θα εμφανιστεί ξανά ως εκκρεμές για αυτή την ημερομηνία. Μεταγενέστερες καταχωρισμένες πληρωμές θα παραμείνουν.',reverseBlocked:'Έχετε μόνο δικαίωμα προβολής αυτού του πορτοφολιού.',browserTitle:'Συνέχεια στο πρόγραμμα περιήγησης;',browserWarning:'Η εμπειρία στο πρόγραμμα περιήγησης είναι λιγότερο ολοκληρωμένη: δεν θα έχετε ξεχωριστό παράθυρο εφαρμογής και, σε iPhone ή iPad, ειδοποιήσεις στο παρασκήνιο. Μπορείτε να εγκαταστήσετε την εφαρμογή αργότερα.',handoffTitle:'Ανοίξτε το Expenity από την αρχική οθόνη',handoffText:'Ολοκληρώστε την προσθήκη του Expenity στην αρχική οθόνη. Έπειτα κλείστε αυτή την καρτέλα και πατήστε το εικονίδιο Expenity στη συσκευή σας για να συνεχίσετε τη ρύθμιση εκεί. Αν σας ζητηθεί σύνδεση, χρησιμοποιήστε τον λογαριασμό που ήδη δημιουργήσατε.',handoffWaiting:'Η ρύθμιση θα συνεχιστεί στην εγκατεστημένη εφαρμογή.',changelog:'Τι νέο υπάρχει',releaseFail:'Η λήψη της ενημέρωσης απέτυχε. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.',releaseReady:'Η ενημέρωση κατέβηκε. Πατήστε για επανεκκίνηση.',editHome:'Προσαρμογή Αρχικής',editHelp:'Κρατήστε πατημένο για 650 ms. Σύρετε τις λαβές για αλλαγή σειράς, αλλάξτε μέγεθος ή κρύψτε ενότητες.',done:'Έτοιμο',cancel:'Ακύρωση',reset:'Επαναφορά διάταξης',show:'Εμφάνιση',hide:'Απόκρυψη',up:'Μετακίνηση πάνω',down:'Μετακίνηση κάτω',compact:'Μικρό',wide:'Πλήρες πλάτος',balance:'Υπόλοιπο',welcome:'Συμβουλές λογαριασμού & εγκατάστασης',due:'Πλησιάζουν',wallets:'Πορτοφόλια',ideas:'Ιδέες για εσάς',goals:'Προϋπολογισμοί & στόχοι',recent:'Πρόσφατες κινήσεις',noWidget:'Αυτή η ενότητα δεν έχει ακόμη περιεχόμενο.',drag:'Σύρετε για αλλαγή σειράς',resize:'Μέγεθος ενότητας',releaseLabel:'Έκδοση'}
 };
 A.label=k=>(words[EX.lang()]||words.en)[k]||k;
 Object.assign(EX.I18N.langs.en,{tags:'Tags'});Object.assign(EX.I18N.langs.el,{tags:'Ετικέτες'});
 Object.assign(words.en,{small:'Small',medium:'Medium',full:'Full',chooseWidget:'Tap a card to select it',selected:'Selected',editHelp:'Choose a card. Its accent glow shows exactly what you are editing. Use the arrows to move it, choose a size, or hide it.',editTutorial:'Make Home your own',editTutorialText:'Tap or click the card you want to change: it glows in your theme colour while the others turn grey. Move it with the arrows or drag its handle. Choose Small, Medium or Full, then tap Done to save.',editStart:'Let’s customise',editWatch:'How editing works',editSelect:'Select card',items:'items',open:'Open',editSizeHint:'Small shows a compact summary, Medium is wider, Full spans the dashboard.'});
 Object.assign(words.el,{small:'Μικρό',medium:'Μεσαίο',full:'Πλήρες',chooseWidget:'Πατήστε μια κάρτα για επιλογή',selected:'Επιλεγμένη',editHelp:'Επιλέξτε κάρτα. Το περίγραμμα στο χρώμα του θέματός σας δείχνει ποια επεξεργάζεστε. Μετακινήστε τη με τα βέλη, αλλάξτε μέγεθος ή κρύψτε τη.',editTutorial:'Η Αρχική όπως τη θέλετε',editTutorialText:'Πατήστε την κάρτα που θέλετε να αλλάξετε: τονίζεται στο χρώμα του θέματός σας, ενώ οι υπόλοιπες γίνονται γκρι. Μετακινήστε τη με τα βέλη ή σύροντας τη λαβή της. Επιλέξτε Μικρό, Μεσαίο ή Πλήρες και πατήστε Έτοιμο για αποθήκευση.',editStart:'Ας ξεκινήσουμε',editWatch:'Πώς λειτουργεί η προσαρμογή',editSelect:'Επιλογή κάρτας',items:'εγγραφές',open:'Άνοιγμα',editSizeHint:'Συνοπτικό Μικρό, μεγαλύτερο Μεσαίο και Πλήρες σε όλο το πλάτος.'});
 const L=k=>esc(A.label(k));
 const button=(attr,label,icon='')=>`<button type="button" class="btn btn-ghost" ${attr}>${icon?UI.icon(icon,18):''} ${L(label)}</button>`;
 const head=k=>`<div class="sheet-head"><button type="button" class="ab-btn" data-close aria-label="${esc(EX.t('close'))}">${UI.icon('x',24)}</button><h2 id="sheetTitle">${L(k)}</h2></div>`;
 const collections=()=>['txs','bills','accounts','budgets','goals','incomes'].map(k=>S()[k]||[]);
 const normalise=xs=>{const seen=new Set();return (Array.isArray(xs)?xs:[]).map(x=>String(x).trim().slice(0,32)).filter(x=>{const k=x.toLocaleLowerCase();if(!x||seen.has(k))return false;seen.add(k);return true;}).slice(0,40);};
 const catalogue=()=>normalise([...(S().settings.tags||[]),...collections().flatMap(xs=>xs.flatMap(x=>x.tags||[]))]).sort((a,b)=>a.localeCompare(b,EX.loc()));
 A.tagFilter='';
 A.tagFilterHtml=()=>`<label class="chip select">${UI.icon('tag',18)}<select id="tagFilter" aria-label="${L('tagSearch')}"><option value="">${L('allTags')}</option>${catalogue().map(x=>`<option value="${esc(x)}"${A.tagFilter===x?' selected':''}>${esc(x)}</option>`).join('')}</select></label>`;
 A.tagsField=(tags=[])=>`<div class="tag-field"><label class="f"><span>${UI.icon('tag',18)} ${L('tags')}</span><input name="tags" maxlength="600" autocomplete="off" value="${esc(normalise(tags).join(', '))}" placeholder="${L('tagName')}"></label><small class="muted">${L('tagHelp')}</small><details><summary>${L('tags')} ${UI.icon('chevron-down',16)}</summary><div class="chips wrap">${catalogue().map(x=>`<button type="button" class="chip" data-pick-tag="${esc(x)}">${esc(x)}</button>`).join('')}</div></details></div>`;
 A.readTags=root=>{const el=root&&$('input[name=tags]',root);const existing=catalogue();return normalise(el?el.value.split(','):[]).map(x=>existing.find(t=>t.toLocaleLowerCase()===x.toLocaleLowerCase())||x);};
 A.tagsInline=tags=>{const list=normalise(tags);return list.length?`<span class="row-tags" aria-label="${L('tags')}: ${esc(list.join(', '))}">${list.slice(0,2).map(tag=>`<span class="row-tag">${A.tagIcon?.(tag,12)||UI.icon('tag',12)} ${esc(tag)}</span>`).join('')}${list.length>2?`<span class="row-tag">+${list.length-2}</span>`:''}</span>`:'';};
 A.tagsDisplay=tags=>normalise(tags).length?`<div class="chips wrap record-tags">${normalise(tags).map(x=>`<span class="chip">${A.tagIcon?.(x,14)||UI.icon('tag',14)} ${esc(x)}</span>`).join('')}</div>`:'';
 let selectedTag='';
 A.tagsView=()=>{
 const tags=catalogue(), selected=selectedTag;
 const hits=collections().flatMap((xs,i)=>xs.filter(x=>(x.tags||[]).includes(selected)).map(x=>({x,i})));
 return `<section class="card"><h2>${L('tags')}</h2><p class="muted">${L('tagHelp')}</p><form id="tagCreate"><label class="f"><span>${L('tagNew')}</span><input name="tagName" maxlength="32" required autocomplete="off"></label><details><summary>${esc(EX.t('cIcon'))} · ${esc(EX.t('cColor'))}</summary>${A.stylePicker?.()||''}</details><button class="btn btn-primary" type="submit">${UI.icon('plus',18)} ${L('tagNew')}</button></form></section><section class="card">${tags.length?tags.map((x,i)=>`<div class="tag-library-row"><button type="button" class="chip${selected===x?' on':''}" data-tag-results="${esc(x)}">${A.tagIcon?.(x,18)||UI.icon('tag',18)} ${esc(x)}</button><button type="button" class="ab-btn" data-tag-edit="${i}" aria-label="${L('tagRename')}: ${esc(x)}">${UI.icon('pencil',18)}</button><button type="button" class="ab-btn" data-tag-delete="${i}" aria-label="${L('tagRemove')}: ${esc(x)}">${UI.icon('trash',18)}</button></div>`).join(''):`<p class="muted">${L('tagEmpty')}</p>`}</section>${selected?`<section class="card"><h2>${L('tagRecords')}: ${esc(selected)}</h2><div class="list">${hits.map(({x,i})=>`<button type="button" class="mrow" ${i===0?`data-tag-tx="${esc(x.id)}"`:i===1?`data-tag-bill="${esc(x.id)}"`:i===2?`data-act="edit-wallet" data-id="${esc(x.id)}"`:i===3?`data-plan="edit-budget" data-id="${esc(x.id)}"`:i===4?`data-plan="edit-goal" data-id="${esc(x.id)}"`:`data-plan="edit-income" data-id="${esc(x.id)}"`}>${UI.icon('tag',18)}<span>${esc(x.name||EX.catInfo(x.category).name)}</span>${UI.icon('chevron-right',18)}</button>`).join('')}</div></section>`:''}`;
 };
 const saveState=EX.save;
 EX.save=()=>{S().settings.tags=normalise([...(S().settings.tags||[]),...collections().flatMap(xs=>xs.flatMap(x=>x.tags||[]))]);return saveState();};
 function saveTags(tags){S().settings.tags=normalise(tags);EX.save();}
 function changeTag(old,value){
  const next=normalise([value])[0];
  S().settings.tags=normalise(catalogue().map(x=>x===old?next:x).filter(Boolean));
  collections().forEach(xs=>xs.forEach(x=>{if((x.tags||[]).includes(old)){if(x.account&&EX.role(EX.account(x.account)||{})==='viewer')return;if(x.space&&EX.role(x)==='viewer')return;x.tags=normalise(x.tags.map(t=>t===old?next:t).filter(Boolean));}}));
  selectedTag=next||'';EX.save();
 }
 A.reminderNotice=()=>A.push&&A.push.state()==='on'?'':`<aside class="reminder-notice" role="note">${UI.icon('bell',22)}<div><p>${L('reminderOff')}</p>${button('data-reminder-settings','enableAlerts')}</div></aside>`;
 A.installHandoff=()=>{
  S().device.stage='install';EX.persist();
  $('#flow').innerHTML=`<div class="flow-card install"><div class="flow-body"><div class="handoff-icon">${UI.ci('device-mobile', 'green',80)}</div><h1>${L('handoffTitle')}</h1><p class="lead">${L('handoffText')}</p><p class="muted">${L('handoffWaiting')}</p></div><div class="flow-actions"><button type="button" class="btn btn-text" data-flow="install-skip">${esc(EX.t('instSkip'))}</button></div></div>`;
 };
 async function reverseTx(id){
  const x=S().txs.find(x=>x.id===id);if(!x)return;
  if([x.account,x.toAccount].filter(Boolean).some(id=>EX.role(EX.account(id)||{})==='viewer'))return UI.toast(A.label('reverseBlocked'));
  if(!await A.confirm({title:A.label('reverseTitle'),text:A.label('reverseText'),confirm:EX.t('undo')}))return;
  // Re-fetch after the confirmation: a sync may have changed or removed the record.
  const live=S().txs.find(t=>t.id===id);if(!live)return;if([live.account,live.toAccount].filter(Boolean).some(id=>!EX.canWrite(id)))return UI.toast(A.label('reverseBlocked'));
  const snapshot=copy(live), schedule=live.billId?S().bills.find(b=>b.id===live.billId):live.incomeId?(S().incomes||[]).find(i=>i.id===live.incomeId):null;
  const previous=schedule?copy(schedule):null;
  if(schedule&&live.due){
   if(schedule.done||!schedule.next||live.due<schedule.next){schedule.next=live.due;schedule.done=false;delete schedule.snooze;}
  }
  S().txs=S().txs.filter(t=>t.id!==id);A.st.sel=null;UI.closeSheet();EX.save();
  UI.toast('',()=>{if(!S().txs.some(t=>t.id===snapshot.id))S().txs.push(snapshot);if(schedule&&previous){Object.keys(schedule).forEach(k=>delete schedule[k]);Object.assign(schedule,previous);}EX.save();});
 }
 // When an earlier occurrence is reopened, advance past later occurrences already recorded.
 const nextAfter=EX.nextAfter;
 EX.nextAfter=(schedule,date)=>{
  let next=nextAfter(schedule,date), n=0;
  const linked=schedule.id?S().txs.filter(t=>t.billId===schedule.id||t.incomeId===schedule.id):[];
  while(next&&linked.some(t=>t.due===next)&&n++<1000)next=nextAfter(schedule,next);
  return next;
 };
 EX.on('auth',()=>{A.tagFilter='';selectedTag='';});
 // Retained, bilingual changelog. Seen version is device-local and never consumes dashboard space.
 let releases=null, releasePromise=null, updateRegistration=null;
 const getReleases=async()=>{if(!releasePromise)releasePromise=fetch('releases.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('release');return r.json();}).then(x=>(releases=x)).catch(e=>{releasePromise=null;throw e;});return releasePromise;};
 A.showReleases=async(latest=false)=>{
  try{const data=await getReleases();const running=window.EXPENITY_VERSION;
   let seen;try{seen=localStorage.getItem('expenity.releaseSeen');}catch(e){}
   const currentIndex=data.releases.findIndex(r=>r.version===running),seenIndex=data.releases.findIndex(r=>r.version===seen);
   const notes=latest?data.releases.slice(Math.max(0,currentIndex),seenIndex>currentIndex?seenIndex:Math.max(0,currentIndex)+1):data.releases;
   UI.openSheet(head('changelog')+`<div class="sheet-pad release-notes">${notes.map((r,i)=>`<${latest?'section':'details'}>${latest?`<h3>${L('releaseLabel')} ${esc(r.version)}</h3>`:`<summary>${L('releaseLabel')} ${esc(r.version)} ${r.date?`<small>${esc(r.date)}</small>`:''}</summary>`}<ul>${(r[EX.lang()]||r.en).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></${latest?'section':'details'}>`).join('')}</div>`,{tall:true});
   try{localStorage.setItem('expenity.releaseSeen',running);}catch(e){}
  }catch(e){UI.toast(A.label('releaseFail'));}
 };
 async function downloadRelease(){
  if(!('serviceWorker' in navigator))throw Error('service worker');
  const reg=await navigator.serviceWorker.getRegistration();if(!reg)throw Error('registration');
  await reg.update();
  const worker=reg.installing||reg.waiting;
  if(worker&&worker.state!=='activated')await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{worker.removeEventListener('statechange',changed);reject(Error('timeout'));},45000);
   function changed(){if(worker.state==='activated'){clearTimeout(timer);worker.removeEventListener('statechange',changed);resolve();}else if(worker.state==='redundant'){clearTimeout(timer);worker.removeEventListener('statechange',changed);reject(Error('download'));}}
   worker.addEventListener('statechange',changed);changed();
  });
  updateRegistration=reg;return reg;
 }
 A.checkRelease=async btn=>{
  const b=btn||$('#updBtn'),line=$('#updLine');const say=x=>{if(line)line.textContent=x;};
  if(b)b.disabled=true;say(EX.t('updChecking'));
  try{releasePromise=null;const data=await getReleases();if(data.version!==window.EXPENITY_VERSION){await downloadRelease();say(A.label('releaseReady'));if(b){b.dataset.act='apply-update';b.innerHTML=`${UI.icon('download',20)} ${esc(EX.t('updNow'))}`;}}else say(EX.t('updLatest',{v:window.EXPENITY_VERSION}));}catch(e){say(A.label('releaseFail'));}finally{if(b)b.disabled=false;}
 };
 A.applyRelease=async()=>{try{if(!updateRegistration)await downloadRelease();try{localStorage.setItem('expenity.showRelease','1');}catch(e){}location.reload();}catch(e){UI.toast(A.label('releaseFail'));}};
 A.enhancementsInit=()=>{
  let notifying=false;
  // Show once on upgraded installs; new accounts can open it from the icon instead.
  try { if(!localStorage.getItem('expenity.releaseSeen')&&!S().device.onboarded) localStorage.setItem('expenity.releaseSeen',window.EXPENITY_VERSION); } catch(e) {}
  const notify=()=>{
   if(A.flow.active()||UI.sheetOpen()||document.hidden||document.activeElement?.matches('input,textarea,select'))return;
   if(notifying)return;
   let seen,forced;try{seen=localStorage.getItem('expenity.releaseSeen');forced=localStorage.getItem('expenity.showRelease');}catch(e){}
   if(seen===window.EXPENITY_VERSION&&!forced)return;
   if(!forced&&!seen&&!S().device.onboarded){try{localStorage.setItem('expenity.releaseSeen',window.EXPENITY_VERSION);}catch(e){}return;}
   try{localStorage.removeItem('expenity.showRelease');}catch(e){}
   notifying=true;A.showReleases(true).finally(()=>{notifying=false;});
  };
  setTimeout(notify,1600);document.addEventListener('visibilitychange',notify);
  EX.on('change',()=>{if(!A.flow.active())setTimeout(notify,300);});
 };
 document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-release-notes],[data-reminder-settings],[data-reverse-tx],[data-pick-tag],[data-tag-results],[data-tag-edit],[data-tag-delete],[data-tag-tx],[data-tag-bill],[data-home-ideas]');
  if(!el)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(el.hasAttribute('data-release-notes'))return A.showReleases();
  if(el.hasAttribute('data-reminder-settings')){UI.closeSheet();return A.go('more','reminders');}
  if(el.dataset.reverseTx)return reverseTx(el.dataset.reverseTx);
  if(el.dataset.pickTag){const f=el.closest('.tag-field'),input=$('input[name=tags]',f);input.value=normalise([...input.value.split(','),el.dataset.pickTag]).join(', ');input.dispatchEvent(new Event('input',{bubbles:true}));return;}
  if(el.dataset.tagResults){selectedTag=el.dataset.tagResults;return A.render();}
  if(el.hasAttribute('data-tag-edit')){const name=catalogue()[Number(el.dataset.tagEdit)];UI.openSheet(head('tagRename')+`<form id="tagRename" class="sheet-pad" data-old="${esc(name)}"><label class="f"><span>${L('tagName')}</span><input name="tagName" maxlength="32" required value="${esc(name)}"></label>${A.stylePicker?.(A.tagStyle?.(name))||''}<button class="btn btn-primary" type="submit">${L('done')}</button></form>`);return;}
  if(el.hasAttribute('data-tag-delete')){const tag=catalogue()[Number(el.dataset.tagDelete)];if(await A.confirm({title:A.label('tagRemove'),text:tag,confirm:EX.t('del')}))changeTag(tag,'');return;}
  if(el.dataset.tagTx){const x=S().txs.find(x=>x.id===el.dataset.tagTx);if(x)A.openTx(x);return;}
  if(el.dataset.tagBill){const x=S().bills.find(x=>x.id===el.dataset.tagBill);if(x)A.openBill(x);return;}
  if(el.hasAttribute('data-home-ideas')){A.go('home');const box=document.querySelector('[data-home=ideas]');if(box){UI.openSheet(head('ideas')+`<div class="sheet-pad">${A.ideasHome()}</div>`,{tall:true});}return;}

 },true);
 document.addEventListener('submit',e=>{
  if(!['tagCreate','tagRename'].includes(e.target.id))return;
  e.preventDefault();e.stopImmediatePropagation();const value=e.target.elements.tagName.value.trim();if(!value)return UI.toast(A.label('tagRequired'));
  const style=A.readStyle?.(e.target);if(style)S().settings.tagStyles={...(S().settings.tagStyles||{}),[value]:style};if(e.target.id==='tagRename'){const old=e.target.dataset.old;if(old!==value&&S().settings.tagStyles)delete S().settings.tagStyles[old];changeTag(old,value);UI.closeSheet();}else saveTags([...catalogue(),value]);
 },true);
 document.addEventListener('change',e=>{if(e.target.id==='tagFilter'){A.tagFilter=e.target.value;A.render();return;}});
 // Collapse preset names as soon as typing begins. Never steal focus or open a keyboard.
 document.addEventListener('focusin',e=>{if(e.target.matches('#quick,#txDesc,[name=name],[name=iname],[name=gname]'))document.querySelectorAll('#sheet .name-suggestions,#sheet .saved-names').forEach(x=>x.open=false);});
})();
