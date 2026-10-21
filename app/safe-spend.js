/* Spending room is a conservative, local calculation. Unreceived income never funds today's allowance. */
(function(){
 'use strict';
 const {EX,EXA:A,UI}=window,S=EX.state,{t,esc,today,addDays}=EX;
 const DAY=864e5,validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&EX.iso(EX.parse(d))===d;
 const days=(a,b)=>Math.round((EX.parse(b)-EX.parse(a))/DAY)+1;
 const amount=x=>/^\d+(\.\d{1,2})?$/.test(String(x))&&Number.isFinite(Number(x))?Number(x):null;
 const main=()=>S().settings.currency,fmt=c=>EX.money((Object.is(c,-0)?0:c)/100,main());
 const config=()=>({horizon:'income',buffer:'0',planned:'0',savings:'0',useBudgets:true,...S().settings.safeSpend});
 const defaultIds=()=>EX.activeAccounts().filter(a=>!a.space&&['cash','bank'].includes(a.type)).map(a=>a.id);
 const F=EX.safeSpend={config};
 F.calculate=(ref=today(),override={})=>{
  const c={...config(),...override},selected=new Set(Array.isArray(c.wallets)?c.wallets:defaultIds()),wallets=EX.activeAccounts().filter(a=>selected.has(a.id));
  const issues=new Set(),warnings=new Set(),rows=[];let fx=false;
  const convert=(v,cur)=>{if(!Number.isFinite(Number(v))){issues.add('safeBudgetUnknown');return 0;}if(cur!==main()){fx=true;const date=EX.rates.date;if(!date||date<addDays(ref,-7)){issues.add('safeFxStale');}}
   const n=EX.convert(Number(v),cur,main());if(n==null||!Number.isFinite(n)){issues.add('safeFxMissing');return 0;}return Math.round(n*100);};
  if(!wallets.length)issues.add('safeNoWallets');if(wallets.length!==selected.size)issues.add('safeMissingWallet');if(wallets.some(a=>a.space))warnings.add('safeShared');
  const incomes=S().incomes.filter(i=>!i.done&&selected.has(i.account)&&validDate(i.next));
  if(incomes.some(i=>i.next<ref))warnings.add('safeIncomeOverdue');
  const boundary=incomes.filter(i=>i.next>=ref&&i.next<=addDays(ref,90)).sort((a,b)=>a.next.localeCompare(b.next))[0];
  let end=c.horizon==='week'?addDays(ref,6):c.horizon==='month'?addDays(ref,29):boundary?boundary.next>ref?addDays(boundary.next,-1):ref:addDays(ref,29);
  if(c.horizon==='income'&&!boundary)warnings.add('safeNoIncome');
  const nDays=days(ref,end);let balance=0,future=0;
  const signedOpening=/^-?\d+(\.\d{1,2})?$/;
  for(const a of wallets){if(!signedOpening.test(String(a.opening||'0')))issues.add('safeBudgetUnknown');balance+=convert(Number(a.opening||0),a.currency);}
  for(const x of S().txs){
   const from=selected.has(x.account),to=x.type==='transfer'&&selected.has(x.toAccount);if(!from&&!to)continue;
   if(!validDate(x.date)){issues.add('safeBudgetUnknown');continue;}const n=amount(x.amount);if(n==null){issues.add('safeBudgetUnknown');continue;}
   let delta=from?convert(n,EX.account(x.account)?.currency||EX.txCurrency(x))*(x.type==='income'?1:-1):0;
   if(to){const incoming=amount(x.toAmount||x.amount);if(incoming==null)issues.add('safeBudgetUnknown');else delta+=convert(incoming,EX.account(x.toAccount)?.currency||main());}
   if(x.date<=ref)balance+=delta;
   else if(x.date<=end){
    // An unreceived future income or incoming transfer is not spending money. Reserve outgoing net transfers once.
    const reserve=EX.isAdjust(x)?0:Math.max(0,-delta);if(reserve){future+=reserve;rows.push({budgetEligible:x.type==='expense'&&!x.goalId,kind:'transaction',id:x.id,date:x.date,amount:reserve,category:x.category||'uncategorized',name:x.name||EX.catInfo(x.category).name});}
   }
  }
  let bills=0;
  for(const b of S().bills){
   if(b.done||b.account&&!selected.has(b.account))continue;if(!b.account)warnings.add('safeScopeWarning');
   if(!validDate(b.next)||b.end&&!validDate(b.end)){issues.add('safeOldSchedule');continue;}let d=b.next,k=0;
   while(d&&d<=end&&(!b.end||d<=b.end)&&k++<600){
    if(!S().txs.some(x=>x.billId===b.id&&x.due===d)){
     const v=amount(b.amount);if(v==null||v===0)issues.add('safeUnknownBill');else{const n=convert(v,EX.account(b.account)?.currency||b.currency||main());bills+=n;rows.push({budgetEligible:true,kind:'bill',id:b.id,date:d,amount:n,category:b.category||'uncategorized',name:b.name,overdue:d<ref});}
    }
    const next=EX.nextAfter(b,d);if(next&&next<=d){issues.add('safeOldSchedule');break;}d=next;
   }
   if(k>=600&&d&&d<=end)issues.add('safeOldSchedule');
  }
  // Reserve budget allowance once. Daily maxima avoid overlapping weekly/monthly/all-category limits being summed.
  const daily=new Map();if(c.useBudgets){
   if(wallets.length!==EX.activeAccounts().length&&S().budgets.length)warnings.add('safeScopeWarning');
   for(const b of S().budgets){const limit=amount(b.amount);if(limit==null){issues.add('safeBudgetUnknown');continue;}let cursor=ref,guard=0;
    while(cursor<=end&&guard++<95){const p=EX.plan.period(b,cursor);if(!validDate(p.end)||p.end<cursor){issues.add('safeBudgetUnknown');break;}
     const current=p.start<=ref&&p.end>=ref;
     const spent=current?EX.reportTxs().filter(x=>x.type==='expense'&&!x.goalId&&x.date>=p.start&&x.date<=ref&&(b.category==='all'||x.category===b.category)).reduce((n,x)=>n+convert(Number(x.amount),EX.txCurrency(x)),0):0;
     const eff=current?EX.plan.budget(b).eff:Math.round(limit*100);if(!Number.isFinite(eff)){issues.add('safeBudgetUnknown');break;}
     const per=Math.max(0,eff-spent)/days(cursor,p.end),stop=p.end<end?p.end:end;
     for(let date=cursor;date<=stop;date=addDays(date,1)){const key=date+'|'+(b.category||'all');daily.set(key,Math.max(daily.get(key)||0,per));}
     cursor=addDays(stop,1);
    }
   }
  }
  const groups={};for(const [key,v] of daily){const cat=key.slice(11);groups[cat]=(groups[cat]||0)+v;}
  const committed=rows.filter(x=>x.budgetEligible).reduce((n,x)=>n+x.amount,0);
  let categories=0;for(const [cat,v] of Object.entries(groups)){if(cat==='all')continue;categories+=Math.max(0,v-rows.filter(x=>x.budgetEligible&&x.category===cat).reduce((n,x)=>n+x.amount,0));}
  const budget=Math.ceil(Math.max(0,(groups.all||0)-committed,categories));
  const reserve={};for(const key of ['buffer','planned','savings']){const n=amount(c[key]);if(n==null){issues.add('safeBadAmount');reserve[key]=0;}else reserve[key]=Math.round(n*100);}
  const raw=balance-bills-future-budget-reserve.planned-reserve.savings-reserve.buffer;
  return {valid:!issues.size,issues:[...issues],warnings:[...warnings],wallets,selected:[...selected],ref,end,days:nDays,boundary:c.horizon==='income'?boundary:null,balance,bills,future,budget,...reserve,raw,total:Math.max(0,raw),shortfall:Math.max(0,-raw),daily:Math.floor(Math.max(0,raw)/nDays),rows:rows.sort((a,b)=>a.date.localeCompare(b.date)),fx,rateDate:EX.rates.date,config:c};
 };
 const head=title=>`<div class="sheet-head"><button type="button" class="ab-btn" data-close aria-label="${esc(t('close'))}">${UI.icon('x',24)}</button><h2 id="sheetTitle">${esc(title)}</h2></div>`;
 const warningHtml=r=>[...r.issues,...r.warnings].map(k=>`<p class="safe-notice">${UI.icon('info-circle',18)}${esc(t(k))}</p>`).join('')+(r.fx?`<p class="muted small">${esc(t('safeFxApprox'))} ${esc(r.rateDate||'—')}</p>`:'');
 A.safeHome=()=>{const r=F.calculate();return `<div class="safe-card"><div class="sec-head"><h2>${UI.icon('wallet',22)} ${esc(t('safeTitle'))}</h2></div><small>${esc(t('safeEstimate'))}</small><strong class="safe-number">${r.valid?esc(fmt(r.total)):'—'}</strong><p>${r.valid?`${esc(fmt(r.daily))} ${esc(t('safePerDay'))} · `:''}${esc(t('safeUntil'))} ${esc(EX.dayName(r.end))}</p>${r.valid&&r.shortfall?`<p class="bad">${esc(t('safeShortfall'))}: ${esc(fmt(r.shortfall))}</p>`:''}${!r.valid?`<p class="muted">${esc(t(r.issues[0]))}</p>`:''}<button type="button" class="btn btn-ghost" data-safe="details">${esc(t('safeOpen'))}${UI.icon('chevron-right',18)}</button></div>`;};
 A.safeSmall=()=>{const r=F.calculate();return `<div class="dash-summary"><span>${UI.icon('wallet',20)}${esc(t('safeTitle'))}</span><strong>${r.valid?esc(fmt(r.total)):'—'}</strong><button type="button" class="link" data-safe="details">${esc(t('safeOpen'))}${UI.icon('chevron-right',16)}</button></div>`;};
 function showDetails(){const r=F.calculate(),facts=[['safeBalance',r.balance],['safeBills',-r.bills],['safeFuture',-r.future],['safeBudget',-r.budget],['safePlanned',-r.planned],['safeSavings',-r.savings],['safeBuffer',-r.buffer]];
  UI.openSheet(head(t('safeTitle'))+`<div class="sheet-pad safe-details"><p class="muted">${esc(t('safeUntil'))} ${esc(EX.dayName(r.end))} · ${r.days} ${esc(t('safeDays'))}</p><strong class="safe-number">${r.valid?esc(fmt(r.total)):'—'}</strong>${r.valid?`<p>${esc(fmt(r.daily))} ${esc(t('safePerDay'))}</p>`:`<p>${esc(t('safeUnavailable'))}</p>`}${r.shortfall&&r.valid?`<p class="bad">${esc(t('safeShortfall'))}: ${esc(fmt(r.shortfall))}</p>`:''}${warningHtml(r)}<dl class="facts">${facts.map(([k,n])=>`<div><dt>${esc(t(k))}</dt><dd>${r.issues.some(k=>['safeFxMissing','safeFxStale'].includes(k))?'—':esc(fmt(n))}</dd></div>`).join('')}</dl><p>${esc(t('safeIncomeExcluded'))}</p>${r.boundary?`<p class="muted small">${esc(t('safeIncomeDate'))}: ${esc(r.boundary.name)} · ${esc(EX.dayName(r.boundary.next))}</p>`:''}<details><summary>${esc(t('safeBills'))}</summary>${r.rows.length?`<ul class="safe-commitments">${r.rows.map(x=>`<li><span>${esc(x.name)}<small>${esc(EX.dayName(x.date))}${x.overdue?' · '+esc(t('safeOverdue')):''}</small></span><b>${esc(fmt(x.amount))}</b></li>`).join('')}</ul>`:`<p class="muted">${esc(t('safeNoItems'))}</p>`}</details><p class="muted small">${esc(t('safeLimits'))}</p><button type="button" class="btn btn-primary" data-safe="settings">${UI.icon('settings',20)}${esc(t('safeSettings'))}</button></div>`,{tall:true,cls:'safe-sheet'});
 }
 function showSettings(){const c=config(),ids=new Set(Array.isArray(c.wallets)?c.wallets:defaultIds());UI.openSheet(head(t('safeSettings'))+`<form id="safeSpendForm" class="sheet-pad"><label class="f"><span>${esc(t('safeHorizon'))}</span><select name="horizon">${[['income','safeNextIncome'],['week','safeWeek'],['month','safeMonth']].map(([v,k])=>`<option value="${v}"${c.horizon===v?' selected':''}>${esc(t(k))}</option>`).join('')}</select></label><fieldset><legend>${esc(t('safeWallets'))}</legend><p class="muted small">${esc(t('safeWalletHelp'))}</p>${EX.activeAccounts().map(a=>`<label class="entry-check"><input type="checkbox" name="wallets" value="${esc(a.id)}"${ids.has(a.id)?' checked':''}>${UI.walletCi(a,26)}<span>${esc(EX.accountName(a))} · ${esc(a.currency)}${a.space?' · '+esc(t('entryShared')):''}</span></label>`).join('')}</fieldset><label class="entry-check"><input type="checkbox" name="budgets"${c.useBudgets?' checked':''}>${esc(t('safeUseBudgets'))}</label><p class="muted small">${esc(t('safeBudgetHelp'))}</p>${['planned','savings','buffer'].map(k=>`<label class="f"><span>${esc(t('safe'+k[0].toUpperCase()+k.slice(1)))} · ${esc(main())}</span><input name="${k}" inputmode="decimal" autocomplete="off" value="${esc(c[k])}"></label>`).join('')}<p class="muted small">${esc(t('safeAdditionalHelp'))}</p><p class="muted small">${esc(t('safeGoalsHelp'))}</p><p class="err" id="safeError" role="alert" hidden></p><button type="submit" class="btn btn-primary wide">${esc(t('safeSave'))}</button></form>`,{tall:true,cls:'safe-sheet'});}
 document.addEventListener('click',e=>{const b=e.target.closest('[data-safe]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();if(b.dataset.safe==='settings')showSettings();else showDetails();},true);
 document.addEventListener('submit',e=>{if(e.target.id!=='safeSpendForm')return;e.preventDefault();e.stopImmediatePropagation();const f=e.target,values={};for(const k of ['planned','savings','buffer']){values[k]=f.elements[k].value.trim().replace(',','.');if(amount(values[k])==null){const err=f.querySelector('#safeError');err.hidden=false;err.textContent=t('safeBadAmount');f.elements[k].focus();return;}}
  const old=S().settings.safeSpend;S().settings.safeSpend={...values,horizon:f.elements.horizon.value,useBudgets:f.elements.budgets.checked,wallets:[...f.querySelectorAll('[name=wallets]:checked')].map(x=>x.value)};if(EX.save())showDetails();else{S().settings.safeSpend=old;UI.toast(t('entryNotSaved'));}
 },true);
 EX.on('rates',()=>{if(A.st.view==='home'&&!A.flow.active()&&!A.dashboardEditing?.())A.render();});
 // Add a customizable Home card without replacing the user's stored widget order.
 const home=A.home;A.home=()=>{const tmp=document.createElement('template');tmp.innerHTML=home();const section=document.createElement('section');section.dataset.home='safe';section.innerHTML=A.safeHome();tmp.content.querySelector('[data-home=wallets]')?.after(section);return tmp.innerHTML;};
})();
