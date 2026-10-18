/**
 * Expenity sheets and the actions behind them: the + sheet, the amount-first transaction sheet with its keypad, bills,
 * wallets, categories, sign-in and recovery codes, details, confirmations, and the data actions (pay, skip, delete).
 * Everything opens in the one bottom sheet (UI.openSheet); on wide screens details show in the side pane instead.
 */
( function () {
	'use strict';
	const EX = window.EX, UI = window.UI, EXA = window.EXA;
	const { t, esc, money, iso, parse, today, addDays, dayName, uid } = EX;
	const S = EX.state;
	const $ = ( s, r = document ) => r.querySelector( s );
	const $$ = ( s, r = document ) => [ ...r.querySelectorAll( s ) ];
	const toast = UI.toast;
	const errText = ( code ) => { const k = 'err_' + ( code || 'generic' ); const v = t( k ); return v === k ? t( 'err_generic' ) : v; };
	EXA.errText = errText;
	const X = `<button type="button" class="ab-btn" data-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button>`;
	const head = ( title, right = '' ) => `<div class="sheet-head">${ X }<h2 id="sheetTitle">${ esc( title ) }</h2><span class="sp"></span>${ right }</div>`;

	/* ------------------------------------------------------------------ Data actions */

	function markPaid( id, amount, paidOn, account ) {
		const b = S().bills.find( ( x ) => x.id === id );
		if ( ! b || ! b.next ) return;
		const before = JSON.parse( JSON.stringify( b ) );
		const tx = EX.payBill( b, { amount, date: paidOn || today(), account } );
		tx.scheduleBefore = { next: before.next, done: !!before.done, snooze: before.snooze || '' };
		EXA.playSound?.('success');const nx = EX.nextAfter( b, b.next );
		if ( ! nx || ( b.end && nx > b.end ) ) { b.done = true; } else { b.next = nx; }
		delete b.snooze;
		EXA.st.sel = null;
		EX.save();
		UI.haptic();
		toast( t( 'tPaid', { name: b.name } ), () => {
			S().txs = S().txs.filter( ( x ) => x.id !== tx.id );
			Object.keys( b ).forEach( ( k ) => { delete b[ k ]; } );
			Object.assign( b, before );
			EX.save();
		} );
	}
	function skipBill( id ) {
		const b = S().bills.find( ( x ) => x.id === id );
		if ( ! b ) return;
		const before = b.next, wasDone = b.done;
		const nx = EX.nextAfter( b, b.next );
		if ( ! nx ) { b.done = true; } else { b.next = nx; }
		EXA.st.sel = null;
		EX.save();
		toast( t( 'tSkipped', { name: b.name } ), () => { b.next = before; if ( ! wasDone ) delete b.done; EX.save(); } );
	}
	function snoozeBill( id, days ) {
		const b = S().bills.find( ( x ) => x.id === id );
		if ( ! b ) return;
		b.snooze = addDays( today(), days );
		EX.save();
		toast( t( 'tSnoozed', { name: b.name, date: dayName( b.snooze ) } ) );
	}
	function removeBill( id ) {
		const i = S().bills.findIndex( ( x ) => x.id === id );
		if ( i < 0 ) return;
		const [ b ] = S().bills.splice( i, 1 );
		EXA.st.sel = null;
		EX.save();
		toast( t( 'tDeleted', { name: b.name } ), () => { S().bills.splice( i, 0, b ); EX.save(); } );
	}
	function removeTx( id ) {
		const i = S().txs.findIndex( ( x ) => x.id === id );
		if ( i < 0 ) return;
		const [ x ] = S().txs.splice( i, 1 );
		EXA.st.sel = null;
		EX.save();
		toast( t( 'tTxDeleted' ), () => { S().txs.splice( i, 0, x ); EX.save(); } );
	}
	Object.assign( EXA, { markPaid, skipBill, snoozeBill, removeBill, removeTx } );

	/* ------------------------------------------------------------------ Confirm */

	EXA.confirm = ( { title, text, confirm, danger = true } ) => new Promise( ( resolve ) => {
		let done = false;
		const finish = ( v ) => { if ( done ) return; done = true; resolve( v ); };
		UI.openSheet( `${ head( title ) }<div class="sheet-pad"><p class="muted">${ esc( text || '' ) }</p><div class="btn-row stack"><button type="button" class="btn ${ danger ? 'btn-danger' : 'btn-primary' }" id="confirmYes">${ esc( confirm ) }</button><button type="button" class="btn btn-ghost" data-close>${ esc( t( 'cancel' ) ) }</button></div></div>`, { cls: 'small', onClose: () => finish( false ) } );
		$( '#confirmYes' ).onclick = () => { finish( true ); UI.closeSheet(); };
	} );

	/* ------------------------------------------------------------------ The + sheet */

	EXA.openAdd = () => {
		const row=(act,icon,color,label,sub)=>`<button type="button" class="entry-add-row" data-act="${act}">${UI.ci(icon,color,44)}<span><b>${esc(t(label))}</b><small>${esc(t(sub))}${act.startsWith('tx-')&&restoreDraft(act.slice(3))?' · '+esc(t('entryHasDraft')):''}</small></span>${UI.icon('chevron-right',20)}</button>`;
		UI.openSheet(`${head(t('addShort'))}<div class="sheet-pad entry-add-menu">${recoveries().length?`<button type="button" class="btn btn-ghost" data-entry-recover>${UI.icon('alert-triangle',20)} ${esc(t('entryRecover'))} (${recoveries().length})</button>`:''}${EX.state().settings.receiptScanner!==false?`<button type="button" class="entry-add-row" data-start-receipt>${UI.ci('photo','teal',44)}<span><b>${esc(t('scanReceipt'))}</b><small>${esc(t('scanHoldHint'))}</small></span>${UI.icon('chevron-right',20)}</button>`:''}${row('tx-expense','arrow-up-right','red','typeExpense','entryExpenseSub')}${row('tx-income','arrow-down-left','green','typeIncome','entryIncomeSub')}${row('tx-transfer','arrows-exchange','blue','typeTransfer','entryTransferSub')}${row('add-bill','calendar-event','amber','tileBill','entryBillSub')}</div>`,{cls:'small'});
	};

	/* ------------------------------------------------------------------ Transaction sheet: amount first, big keypad */

	let T = null; // the transaction being entered
	EXA.txOpen = () => !! T && UI.sheetOpen();
	const decimalMark = () => ( EX.lang() === 'el' ? ',' : '.' );
	const curSymbol = ( cur ) => { try { return ( new Intl.NumberFormat( EX.loc(), { style: 'currency', currency: cur } ).formatToParts( 0 ).find( ( p ) => p.type === 'currency' ) || {} ).value || cur; } catch ( e ) { return cur; } };
	const groupMark = () => ( decimalMark() === ',' ? '.' : ',' );
	// Thousands are grouped for reading (20000 shows as 20.000 in Greek and 20,000 in English); the stored value stays plain.
	const showAmt = ( s ) => { if ( s === '' ) return '0'; const [ whole, frac ] = s.split( '.' ); return whole.replace( /\B(?=(\d{3})+(?!\d))/g, groupMark() ) + ( frac !== undefined ? decimalMark() + frac : '' ); };
	const walletCur = ( id ) => ( EX.account( id ) || {} ).currency || S().settings.currency;

	const GUESS = {
		food: [ 'grocer', 'supermarket', 'super market', 'coffee', 'cafe', 'restaurant', 'lunch', 'dinner', 'breakfast', 'pizza', 'σουπερ', 'μαρκετ', 'καφε', 'εστιατορ', 'φαγητ', 'ταβερν' ],
		transport: [ 'taxi', 'uber', 'fuel', 'petrol', 'gasoline', 'parking', 'bus', 'metro', 'ταξι', 'βενζιν', 'καυσιμ', 'εισιτηρι', 'παρκινγκ' ],
		health: [ 'pharmacy', 'doctor', 'dentist', 'φαρμακ', 'γιατρ', 'οδοντ' ], shopping: [ 'shopping', 'clothes', 'amazon', 'ρουχα', 'αγορα' ],
		leisure: [ 'cinema', 'movie', 'concert', 'bar', 'κινηματογραφ', 'συναυλι', 'ποτο' ], salary: [ 'salary', 'wage', 'μισθος' ], freelance: [ 'freelance', 'invoice', 'τιμολογιο' ], gifts: [ 'gift', 'δωρο' ], interest: [ 'interest', 'dividend', 'τοκοι', 'μερισμα' ],
	};
	function guessCategory( name, type ) {
		const low = EX.fold( name || '' );
		const tpl = EX.TEMPLATES.find( ( x ) => low && ( low.startsWith( EX.fold( t( x[ 0 ] ) ) ) || low.startsWith( EX.fold( EX.I18N.langs.en[ x[ 0 ] ] ) ) || low.startsWith( EX.fold( EX.I18N.langs.el[ x[ 0 ] ] ) ) ) );
		if ( tpl && type === 'expense' ) return tpl[ 1 ];
		const allowed = ( type === 'income' ? EX.INCOME_CATS : EX.EXPENSE_CATS ).map( ( c ) => c[ 0 ] );
		const hit = Object.entries( GUESS ).find( ( [ k, words ] ) => allowed.includes( k ) && words.some( ( w ) => low.includes( w ) ) );
		return hit ? hit[ 0 ] : null;
	}
	EXA.guessCategory = guessCategory;

	const copy = x => JSON.parse(JSON.stringify(x));
	const writable = id => EX.writableAccounts().some(a=>a.id===id);
	const contentStamp = tx => JSON.stringify(Object.keys(tx||{}).sort().filter(k=>!['u','by'].includes(k)).map(k=>[k,tx[k]]));
	EXA.scheduleStamp=contentStamp;
	let draftOwner = '', draftTimer = 0;
	const owner = () => EX.auth.isSignedIn() ? 'user:'+EX.auth.user()?.id : 'guest';
	const draftKey = (type,edit='',recovery='') => 'expenity.entryDraft.v1:'+owner()+':'+(edit?'edit:'+edit:recovery?'recovery:'+recovery+':'+type:type);
	const draftValue = () => ({type:T.type,amount:T.amount,toAmount:T.toAmount,account:T.account,toAccount:T.toAccount,name:T.name,note:T.note,category:T.category,date:T.date,tags:T.tags,photo:T.photo,repeat:T.repeat||'once',interval:T.interval,intervalUnit:T.intervalUnit,monthDays:T.monthDays,scheduleDates:T.scheduleDates,weekDays:T.weekDays,shortMonth:T.shortMonth,endMode:T.endMode,end:T.end,endCount:T.endCount,scheduleEnd:T.scheduleEnd,quick:T.quick,quickText:T.quickText,scheduleKind:T.scheduleKind,editScheduleId:T.editScheduleId,sourceStamp:T.sourceStamp,sourceRecord:T.sourceRecord,scheduleTouched:T.scheduleTouched,lead:T.lead,variable:T.variable,autopay:T.autopay,reference:T.reference,payUrl:T.payUrl});
	const meaningful = () => T && ((T.editId||T.editScheduleId) ? JSON.stringify(draftValue())!==T.baseline : !!(T.amount||T.toAmount||T.name.trim()||T.note.trim()||T.tags.length||T.photo||T.date!==today()));
	function storeDraft(){
		clearTimeout(draftTimer);if(!T||draftOwner!==owner()||T.saving||T.committed)return;
		readTxFields();
		try{if(!meaningful())return;const previous=restoreDraft(T.type,T.editId,T.recoveryId);if(previous&&previous.id!==T.id){T.draftFail=true;return;}localStorage.setItem(draftKey(T.type,T.editId,T.recoveryId),JSON.stringify({saved:Date.now(),data:copy(T)}));}
		catch(e){T.draftFail=true;const line=$('#entryDraftStatus');if(line)line.textContent=t('entryDraftFail');}
	}
	function dropDraft(){try{if(T.recoveryId)localStorage.setItem(recoveryKey(),JSON.stringify(recoveries().filter(x=>x.tx.id!==T.recoveryId)));for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k.startsWith('expenity.entryDraft.v1:'+owner()+':')){const v=JSON.parse(localStorage.getItem(k)||'null');if(v?.data?.id===T.id)localStorage.removeItem(k);}}}catch(e){}}
	function restoreDraft(type,edit,recovery){try{const k=draftKey(type,edit,recovery),d=JSON.parse(localStorage.getItem(k)||'null');if(d&&Date.now()-d.saved<86400000&&d.data.type===type&&d.data.editId===(edit||null))return d.data;if(d)localStorage.removeItem(k);}catch(e){}return null;}
	function titleKey(){if(T.scheduleKind)return T.scheduleKind==='bill'?(T.editScheduleId?'editorBillEdit':'editorBillAdd'):(T.editScheduleId?'editorIncomeEdit':'editorIncomeAdd');return T.editId?'entrySaveChanges':T.type==='expense'?'entryAddExpense':T.type==='income'?'entryAddIncome':'entryAddTransfer';}
	function buttonKey(){return T.editScheduleId?'entrySaveChanges':T.editId?'entrySaveChanges':T.type==='expense'?'entrySaveExpense':T.type==='income'?'entrySaveIncome':'entrySaveTransfer';}
	const entryButton=(act,label,icon='')=>`<button type="button" class="btn btn-ghost" data-entry="${act}">${icon?UI.icon(icon,20):''}${esc(t(label))}</button>`;
	function walletChoices(to=false){
		const id=to?T.toAccount:T.account;
		return `<div class="entry-wallet-options" id="${to?'entryToChoices':'entryWalletChoices'}">${EX.writableAccounts().filter(a=>!to||a.id!==T.account&&EX.sameScope(a,EX.account(T.account))).map(a=>`<button type="button" class="chip${a.id===id?' on':''}" ${to?'data-tx-to':'data-tx-wallet'}="${esc(a.id)}">${UI.walletCi(a,26)}<span>${esc(EX.compactAccountName(a))}<small>${esc(a.currency)}${a.space?' · '+esc(t('entryShared')):''}</small></span>${a.id===id?UI.icon('check',18):''}</button>`).join('')}</div>${!to&&T.account?`<label class="entry-check"><input id="entryDefault" type="checkbox"${(T.defaultTouched?T.makeDefault:T.makeDefault||S().settings.defaultAccount===T.account)?' checked':''}>${esc(t('entryDefault'))}</label>`:''}`;
	}
	function walletControl(to=false){const a=EX.account(to?T.toAccount:T.account);return `<button type="button" class="entry-wallet" data-entry="${to?'to-wallet':'wallet'}" aria-expanded="${!!(to?T.toWalletOpen:T.walletOpen)}">${a?UI.walletCi(a,28):UI.icon('wallet',24)}<span>${esc(a?EX.compactAccountName(a):t('entryChooseWallet'))}${a?.space?`<small>${esc(t('entryShared'))}</small>`:''}</span>${UI.icon('chevron-down',18)}</button>`;}
	function entryCategories(){
		const cats=EX.catList(T.type),suggestion=!T.category?guessCategory(T.name,T.type):null;
		const recent=S().txs.filter(x=>x.type===T.type&&x.category).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(x=>x.category);
		let ids=[T.category,suggestion,...recent,...cats.map(c=>c.key)].filter(Boolean);ids=[...new Set(ids)].slice(0,3);
		const tile=c=>`<button type="button" class="catchip${T.category===c.key?' on':''}" data-tx-cat="${esc(c.key)}" aria-pressed="${T.category===c.key}">${UI.catCi(c,36)}<span>${esc(c.name)}${c.key===suggestion?`<small>${esc(t('entrySuggested'))}</small>`:''}</span></button>`;
		return `<div class="entry-label">${esc(t(T.category?'fCategory':'entryChooseCat'))}</div><div class="cats entry-cat-suggestions">${ids.map(id=>tile(EX.catInfo(id))).join('')}<button type="button" class="catchip more" data-tx-catsmore aria-expanded="${!!T.catsOpen}">${UI.ci(T.catsOpen?'chevron-up':'category-2','gray',36)}<span>${esc(t('entryAllCats'))}</span></button></div>${T.catsOpen?`<div class="entry-allcats">${EXA.groupedCategories(cats,tile,T.category)}${entryButton('new-category','entryCreateCategory','plus')}</div>`:''}`;
	}
	function entryGroup(id,label,icon,summary,body){
	 const open=(T.entryGroup??'payment')===id;
	 return `<details name="entry-options" class="entry-group" data-entry-group="${id}"${open?' open':''}><summary>${UI.ci(icon,'teal',36)}<span class="entry-group-copy"><b>${esc(t(label))}</b><small data-group-summary="${id}">${esc(summary)}</small></span>${UI.icon('chevron-down',18)}</summary><div class="entry-group-body">${body}</div></details>`;
	}
	document.addEventListener('toggle',e=>{
	 const group=e.target;if(!T||!group.isConnected||!group.matches?.('#sheet [data-entry-group]'))return;
	 if(group.open){T.entryGroup=group.dataset.entryGroup;$('#sheet').querySelectorAll('[data-entry-group]').forEach(other=>{if(other!==group)other.open=false;});}
	 else if(T.entryGroup===group.dataset.entryGroup)T.entryGroup='';
	 storeDraft();
	},true);

 function scheduleBody(){
  const main=['once','daily','weekly','monthly','yearly','dates','custom'],selected=T.repeat==='monthdays'?'monthly':T.repeat||'once';
  return `<div class="sheet-head entry-head"><button type="button" class="ab-btn" data-entry="schedule-back" aria-label="${esc(t('back'))}">${UI.icon('arrow-left',24)}</button><h2 id="sheetTitle">${esc(t('editorSchedule'))}</h2></div><div class="tx-scroll entry-scroll focused-schedule"><label class="f"><span>${esc(t('entryDate'))}</span><input type="date" id="scheduleStart" name="next" value="${esc(T.date)}"></label><select id="entryRepeat" hidden>${EX.REPEATS.map(r=>`<option value="${r}"${r===(T.repeat||'once')?' selected':''}>${esc(EX.repeatLabel(r))}</option>`).join('')}</select><div class="schedule-frequency" role="group" aria-label="${esc(t('fRepeats'))}">${main.map(r=>`<button type="button" class="btn btn-ghost${selected===r?' on':''}" data-entry="frequency" data-repeat="${r}" aria-pressed="${selected===r}">${UI.icon(r==='dates'?'calendar':r==='once'?'calendar-event':'repeat',20)}<span>${esc(EX.repeatLabel(r))}</span>${selected===r?UI.icon('check',18):''}</button>`).join('')}</div><details class="schedule-other-frequencies"><summary>${esc(t('editorOtherSchedules'))}</summary>${['weekdays','biweekly','quarterly'].map(r=>`<button type="button" class="btn btn-ghost" data-entry="frequency" data-repeat="${r}">${esc(EX.repeatLabel(r))}</button>`).join('')}</details>${EXA.focusedScheduleFields({...T,next:T.date})}<p id="txErr" class="err" hidden role="alert"></p></div><div class="entry-footer"><button type="button" class="btn btn-primary entry-save" data-entry="schedule-use">${UI.icon('check',20)} ${esc(t('editorUseSchedule'))}</button></div>`;
 }

	function txBody() {
        if(T.screen==='schedule')return scheduleBody();
		const cur=walletCur(T.account),toCur=walletCur(T.toAccount),cross=T.type==='transfer'&&T.toAccount&&cur!==toCur;
		return `<div class="sheet-head entry-head">${X}<h2 id="sheetTitle">${esc(t(titleKey()))}</h2><button type="button" class="btn btn-ghost entry-change"${T.scheduleKind?' hidden':''} data-entry="type" aria-expanded="${!!T.typeOpen}">${esc(t('entryChange'))}</button></div>
		<div class="tx-scroll entry-scroll${T.quick?' sentence-entry-mode':''}">
		${T.discard?`<section class="entry-alert" role="alertdialog" aria-labelledby="discardTitle"><h3 id="discardTitle">${esc(t('entryCloseTitle'))}</h3><p>${esc(t('entryCloseText'))}</p><div class="btn-row">${entryButton('keep','entryKeep')}${entryButton('discard','entryDiscard')}</div></section>`:''}
		${T.pendingShortcut!==undefined?`<section class="entry-alert" role="alert"><p>${esc(t('entryReplace'))}</p>${entryButton('apply-shortcut','entryApply')}${entryButton('cancel-shortcut','cancel')}</section>`:''}
		${T.pendingSchedule?`<section class="entry-alert" role="alert"><p>${esc(t('entryLeaveSchedule'))}</p>${entryButton('schedule-go','entryContinue')}${entryButton('schedule-cancel','cancel')}</section>`:''}
		${T.typeOpen?`<div class="entry-type-picker" role="group" aria-label="${esc(t('entryChange'))}">${['expense','income','transfer'].map(type=>`<button type="button" class="chip${type===T.type?' on':''}" data-tx-type="${type}">${esc(t('type'+type[0].toUpperCase()+type.slice(1)))}</button>`).join('')}</div>`:''}
		${!T.editId&&!T.scheduleKind&&T.type!=='transfer'?EXA.pinnedEntries?.(T.type)||'':''}<p class="muted small entry-draft-status" id="entryDraftStatus" role="status">${T.resumed?esc(t('entryResumed')):T.draftFail?esc(t('entryDraftFail')):''}</p>
		${T.notice?`<p class="entry-alert" role="status">${esc(t(T.notice))}</p>`:''}
		${T.type==='transfer'?`<div class="entry-transfer-wallets"><div><span class="entry-label">${esc(t('fromWallet'))}</span>${walletControl()}</div><button type="button" class="ab-btn" data-entry="swap" aria-label="${esc(t('entrySwap'))}">${UI.icon('arrows-exchange',24)}</button><div><span class="entry-label">${esc(t('toWallet'))}</span>${walletControl(true)}</div></div>`:''}

        ${!T.editId&&!T.scheduleKind&&T.type!=='transfer'?T.quick?`<section class="sentence-entry"><label class="f"><span>${esc(t('quickLabel'))}</span><input id="txQuick" autocomplete="off" spellcheck="false" placeholder="${esc(t('quickTxPh'))}" value="${esc(T.quickText||'')}"></label><p class="muted">${esc(t('sentenceHint'))}</p><div class="sentence-preview" aria-live="polite"><b>${esc(T.name||'—')}</b><span>${esc(EX.money(T.amount||0,cur))}</span><small>${esc(EX.dayName(T.date))} · ${esc(EX.scheduleLabel(T))}</small></div><button type="button" class="btn btn-ghost" data-tx="quick-review">${esc(t('sentenceBack'))}</button></section>`:`<button type="button" class="btn btn-ghost entry-sentence-switch" data-tx="quick">${UI.icon('notes',20)} ${esc(t('sentenceAlternative'))}</button>`:''}

		<div class="entry-amount-panel"><div class="entry-amount-context"><span>${esc(t(T.type==='transfer'?'entrySent':'fAmount'))}</span><span class="entry-currency" aria-label="${esc(cur)}">${esc(T.account?cur:'—')}</span></div>
		<button type="button" class="amt-display${T.keypadOpen&&T.target==='amount'?' on':''}" data-tx="target-amount" aria-controls="txKeypad" aria-expanded="${!!T.keypadOpen&&T.target==='amount'}" aria-label="${esc(t('fAmount'))}"><span class="cur">${esc(T.account?curSymbol(cur):'')}</span><span class="val${T.amount===''?' zero':''}" id="amtVal">${esc(showAmt(T.amount))}</span></button><small>${esc(t('entryTap'))}</small>
		${cross?`<span class="entry-label">${esc(t('entryReceived'))} · ${esc(toCur)}</span><button type="button" class="amt-display small" data-tx="target-to" aria-controls="txKeypad" aria-expanded="${!!T.keypadOpen&&T.target==='toAmount'}" aria-label="${esc(t('fToAmount'))}"><span class="cur">${esc(curSymbol(toCur))}</span><span class="val" id="toAmtVal">${esc(showAmt(T.toAmount))}</span></button>`:''}</div>

		${T.currencyReview?`<div class="entry-alert" role="alert"><p>${esc(t('entryCurrencyReview'))}${T.sourceCurrency?' · '+esc(T.sourceCurrency)+' → '+esc(T.account?walletCur(T.account):'—'):''}</p>${entryButton('review-currency','entryReview')}</div>`:''}
		<div class="entry-name"><label for="txDesc">${esc(t(T.scheduleKind?'fName':'entryName'))}</label><input id="txDesc" class="desc" maxlength="80" autocomplete="off" autocorrect="off" data-1p-ignore data-lpignore="true" placeholder="${esc(t('descPh'))}" value="${esc(T.name)}">
		${T.type!=='transfer'?`${EX.savedNames(T.type).length?`<details class="saved-names"><summary>${UI.icon('bookmark',18)}${esc(t('savedNames'))} (${EX.savedNames(T.type).length}) ${UI.icon('chevron-down',16)}</summary><div class="saved-name-grid">${EX.savedNames(T.type).map((x,i)=>`<span><button type="button" class="chip" data-tx-saved="${i}">${esc(x.name)}</button>${EXA.pinControl?.(T.type,i)||''}</span>`).join('')}</div></details>`:''}`:''}</div>
        <div id="entryServices"${T.name.trim()||T.editScheduleId||T.editId?' hidden':''}>${T.type==='expense'?EXA.servicePicker():''}</div>
        ${T.type!=='transfer'?`<div class="editor-wallet-row"><span class="editor-row-label">${esc(t(T.type==='income'?'incTo':'fPayFrom'))}</span>${walletControl()}${T.walletOpen?walletChoices():''}</div>`:''}
        <div class="editor-date-row"><button type="button" class="editor-row" data-entry="date">${UI.ci('calendar','teal',36)}<span><b>${esc(t('entryDate'))}</b><small>${esc(T.date===today()?t('relToday'):EX.parse(T.date).toLocaleDateString(EX.loc(),{day:'numeric',month:'short',year:'numeric'}))}</small></span>${UI.icon('chevron-down',20)}</button>${T.dateOpen?`<div class="entry-date-options"><button type="button" class="chip" data-tx-date="today">${esc(t('relToday'))}</button><button type="button" class="chip" data-tx-date="yesterday">${esc(t('relYesterday'))}</button><label class="f"><span>${esc(t('pickDate'))}</span><input type="date" id="txDate" value="${esc(T.date)}"></label></div>`:''}</div>

        ${T.type!=='transfer'?entryGroup('category','fCategory','category-2',T.category?EX.catInfo(T.category).name:t('entryChooseCat'),`<div class="entry-category" id="entryCategory">${entryCategories()}</div>`):''}
        ${!T.editId&&T.type!=='transfer'?`<button type="button" class="editor-row" data-entry="schedule-open">${UI.ci('repeat','teal',36)}<span><b>${esc(t('fRepeats'))}</b><small>${esc(EX.scheduleLabel(T))}</small></span>${UI.icon('chevron-right',20)}</button>`:''}

		${entryGroup('extras','editorMore','paperclip',[T.photo?t('entryPhoto'):'',T.note?t('entryNote'):''].filter(Boolean).join(' · ')||t('entryExtrasHint'),`${T.type==='expense'&&EX.state().settings.receiptScanner!==false?`<button type="button" class="btn btn-ghost entry-scan" data-receipt-scan>${UI.icon('photo',20)}${esc(t(T.scannedReceipt?'rescanReceipt':'scanReceipt'))}</button>`:''}		<div class="entry-detail-content">${EXA.photos.slot(T.photo)}</div>
		${EXA.tagsField(T.tags)}<div class="entry-detail-content"><label for="txNote">${esc(t('fNote'))}</label><textarea id="txNote" rows="2" maxlength="400" placeholder="${esc(t('notePh'))}">${esc(T.note)}</textarea></div>
		${T.scheduleKind==='bill'?`<label class="f"><span>${esc(t('fRemind'))}</span><select id="entryLead"><option value="">${esc(t('leadDefault'))}</option>${EX.LEADS.map(n=>`<option value="${n}"${T.lead===n?' selected':''}>${esc(t('lead'+n))}</option>`).join('')}</select></label>${EXA.reminderNotice?.()||''}<label class="entry-check"><input type="checkbox" id="entryVariable"${T.variable?' checked':''}>${esc(t('fVariable'))}</label><label class="entry-check"><input type="checkbox" id="entryAutopay"${T.autopay?' checked':''}>${esc(t('fAutopay'))}</label><label class="f"><span>${esc(t('fRef'))}</span><input id="entryReference" value="${esc(T.reference||'')}"></label><label class="f"><span>${esc(t('fUrl'))}</span><input id="entryPayUrl" type="url" value="${esc(T.payUrl||'')}"></label>`:''}<div class="entry-more">
		${T.type!=='transfer'?`<div class="entry-shortcut-options"><label class="remember-name"${T.name.trim()?'':' hidden'}><input type="checkbox" id="rememberName"${T.rememberName?' checked':''}>${UI.icon('bookmark',18)}${esc(t('entryNext'))}</label><b>${esc(t('entryShortcut'))}</b><label class="entry-check"><input id="entryRememberWallet" type="checkbox"${T.rememberWallet?' checked':''}>${esc(t('entryRememberWallet'))}</label><label class="entry-check"><input id="entryRememberAmount" type="checkbox"${T.rememberAmount?' checked':''}>${esc(t('entryRememberAmount'))}</label>${EX.savedNames(T.type).length?`<details><summary>${esc(t('entryManageNames'))}</summary>${EX.savedNames(T.type).map((x,i)=>`<button type="button" class="btn btn-ghost" data-tx-forget="${i}">${UI.icon('trash',18)} ${esc(x.name)}</button>`).join('')}</details>`:''}</div>`:''}
		</div>`)}
		${T.editScheduleId?`<details class="editor-record-options"><summary>${UI.icon('dots',20)} ${esc(t('editorOptions'))}</summary><button type="button" class="btn btn-ghost" data-entry="duplicate-record">${UI.icon('copy',20)} ${esc(t('duplicateRecord'))}</button><button type="button" class="btn btn-danger" data-entry="delete-record">${UI.icon('trash',20)} ${esc(t('del'))}</button></details>`:''}${T.confirmDelete?`<div class="entry-alert" role="alertdialog"><b>${esc(t('editorDeleteConfirm'))}</b><p>${esc(t('editorDeleteWarning'))}</p><button type="button" class="btn btn-danger" data-entry="delete-confirm">${esc(t('del'))}</button><button type="button" class="btn btn-ghost" data-entry="delete-cancel">${esc(t('cancel'))}</button></div>`:''}<p class="err entry-error" id="txErr" role="alert" hidden></p></div>
		<div class="entry-footer"><div class="tx-field-actions"${T.editingField?'':' hidden'}><button type="button" class="btn btn-ghost" data-tx="field-done">${UI.icon('check',20)}${esc(t('entryDone'))}</button></div><button type="button" class="btn btn-primary entry-save" data-tx="${T.quick?'quick-review':'save'}"${T.saving?' disabled':''}>${esc(t(T.quick?'sentenceReview':T.editScheduleId?'entrySaveChanges':!T.editId&&T.type!=='transfer'&&((T.repeat||'once')!=='once'||T.date>today())?(T.type==='income'?'entryScheduleIncome':'entryScheduleBill'):buttonKey()))}</button></div>
		<div id="txKeypad" class="keypad"${T.keypadOpen?'':' hidden'} role="group" aria-label="${esc(t('fAmount'))}"><div class="keypad-head"><span>${esc(t(T.target==='toAmount'?'fToAmount':'fAmount'))}</span><button type="button" class="btn btn-ghost" data-tx="amount-done">${UI.icon('check',20)}${esc(t('entryDone'))}</button></div>${['1','2','3','4','5','6','7','8','9','.','0','<'].map(k=>`<button type="button" class="key" data-key="${k}" aria-label="${k==='<'?esc(t('del')):k==='.'?esc(decimalMark()):k}">${k==='<'?UI.icon('backspace',26):k==='.'?esc(decimalMark()):k}</button>`).join('')}</div>`;
	}
	function readTxFields() {
        if(T&&$('#scheduleStart')?.value)T.date=$('#scheduleStart').value;
        if(T&&$('#entryRepeat')){T.repeat=$('#entryRepeat').value;Object.assign(T,EXA.readSchedule($('#sheet')));}
		if(!T||!$('#txDesc'))return;
		T.name=$('#txDesc').value;if($('#entryLead')){T.lead=$('#entryLead').value===''?null:Number($('#entryLead').value);T.variable=$('#entryVariable').checked;T.autopay=$('#entryAutopay').checked;T.reference=$('#entryReference').value.trim();T.payUrl=$('#entryPayUrl').value.trim();}T.tags=EXA.readTags($('#sheet'));T.rememberName=!!$('#rememberName')?.checked;
		T.rememberWallet=!!$('#entryRememberWallet')?.checked;T.rememberAmount=!!$('#entryRememberAmount')?.checked;
		const def=$('#entryDefault');if(def)T.makeDefault=def.checked;
		const ph=$('.photo-slot');if(ph)T.photo=EXA.photos.value(ph);
		const n=$('#txNote');if(n)T.note=n.value;const q=$('#txQuick');if(q)T.quickText=q.value;const dt=$('#txDate');if(dt?.value)T.date=dt.value;
	}
	function drawTx(keepScroll,read=true){
		if(read)readTxFields();T.editingField=false;T.keypadOpen=false;const sc=$('.tx-scroll'),top=sc?.scrollTop||0;$('.sheet-body').innerHTML=txBody();if(keepScroll)$('.tx-scroll').scrollTop=top;
	}
	function guardEntryClose(){
		if(!T||T.committed)return true;if(T.screen==='schedule'){readTxFields();T.scheduleTouched=true;T.screen='main';drawTx(false,false);return false;}readTxFields();if(EXA.photos.busy){toast(t('photoWorking'));return false;}
		if(!meaningful())return true;T.discard=true;setKeypad(false);drawTx(false,false);$('#discardTitle')?.scrollIntoView({block:'nearest'});$('[data-entry=keep]')?.focus();return false;
	}
	EXA.openTx=(tx,preset={})=>{
		if(T&&UI.sheetOpen()&&!T.committed){if(meaningful()){UI.closeSheet();return;}UI.closeSheet(true);}
		EX.ensureWallet();const ws=EX.writableAccounts(),def=ws.find(a=>a.id===S().settings.defaultAccount),account=def?.id||(ws.length===1?ws[0].id:'');
		const v={type:'expense',repeat:'once',date:today(),account,amount:'',toAmount:'',name:'',note:'',category:null,...(tx||preset)};
		T={...v,tags:copy(v.tags||[]),photo:v.photo||'',id:tx?.id||uid(),editId:tx?.id||null,target:'amount',keypadOpen:false,editingField:false,rememberName:false,rememberWallet:false,rememberAmount:false,quick:false,quickText:'',noteOpen:false,makeDefault:false,original:tx?contentStamp(tx):null};
		if(T.type==='transfer'&&!T.toAccount)T.toAccount=EX.peerAccount(T.account)?.id||'';
		T.baseline=JSON.stringify(draftValue());const restored=restoreDraft(T.type,T.editId,T.recoveryId);if(restored){T={...restored,keypadOpen:false,editingField:false,saving:false,committed:false,discard:false,resumed:true,pendingSchedule:false,pendingShortcut:undefined};}
		draftOwner=owner();T.dateMode=T.date===today()?'today':T.date===addDays(today(),-1)?'yesterday':'other';
		UI.openSheet(txBody(),{full:true,cls:'tx entry-composer',beforeClose:guardEntryClose,onClose:()=>{clearTimeout(draftTimer);T=null;$('#sheet').style.removeProperty('--entry-height');$('#sheet').style.removeProperty('--entry-top');}});entryViewport();
	};
    EXA.cancelScanEntry=id=>{if(T&&T.id===id&&T.scanOrigin&&!T.committed){dropDraft();T.committed=true;UI.closeSheet(true);}};
	EXA.receiptContext=()=>{if(!T||T.type!=='expense'||T.committed)return null;readTxFields();return {id:T.id,type:T.type,currency:T.account?walletCur(T.account):'',photo:T.photo};};
	EXA.applyReceipt=data=>{if(!T||T.type!=='expense'||T.id!==data.id||T.committed)return false;readTxFields();
	 if(data.name!==undefined)T.name=data.name.slice(0,80);if(data.amount!==undefined){T.amount=data.amount;if(data.currency&&(!T.account||data.currency!==walletCur(T.account))){T.sourceCurrency=data.currency;T.currencyReview=true;}}
	 if(data.date!==undefined){T.date=data.date;T.dateMode=data.date===today()?'today':data.date===addDays(today(),-1)?'yesterday':'other';if(data.date>today()){T.notice='entryFuture';T.moreOpen=true;}}
	 T.scannedReceipt=true;if(data.photo)T.photo=data.photo;drawTx(true,false);storeDraft();return true;
	};

	const pressKey = ( k ) => {
		const key = T.target === 'toAmount' ? 'toAmount' : 'amount';
		let s = T[ key ];
		if ( k === '<' ) s = s.slice( 0, -1 );
		else if ( k === '.' ) { if ( ! s.includes( '.' ) ) s = ( s === '' ? '0' : s ) + '.'; }
		else if ( /^\d$/.test( k ) ) {
			if ( s === '0' ) s = k; else if ( s.includes( '.' ) ? s.split( '.' )[ 1 ].length < 2 : s.length < 9 ) s += k;
		}
		T[ key ] = s;
		UI.haptic( 6 );
		const el = $( key === 'toAmount' ? '#toAmtVal' : '#amtVal' );
		if ( el ) { el.textContent = showAmt( s ); el.classList.toggle( 'zero', s === '' ); }
	};
	function setKeypad( open, target = T.target ) {
		readTxFields();
		T.keypadOpen = open; T.target = target; T.editingField = false;
		const active = document.activeElement;
		if ( active && /^(INPUT|TEXTAREA)$/.test( active.tagName ) ) active.blur();
		$( '#txKeypad' ).hidden = ! open;
		$( '.keypad-head span' ).textContent = t( target === 'toAmount' ? 'fToAmount' : 'fAmount' );
		$( '.tx-field-actions' ).hidden = true;
		$$( '.amt-display' ).forEach( b => { const on = open && ( b.dataset.tx === 'target-to' ? target === 'toAmount' : target === 'amount' ); b.classList.toggle( 'on', on ); b.setAttribute( 'aria-expanded', String( on ) ); } );
		$( target === 'toAmount' ? '[data-tx=target-to]' : '[data-tx=target-amount]' )?.focus( { preventScroll: true } );
	}
	function finishField() {
		readTxFields(); T.editingField = false;
		document.activeElement?.blur();
		$( '.tx-field-actions' ).hidden = true;
		$( '.sheet-body' ).focus( { preventScroll: true } );
	}
	document.addEventListener( 'focusin', e => {
		if ( ! T || !( [ 'txDesc', 'txQuick', 'txNote', 'txDate' ].includes( e.target.id ) || (e.target.name === 'tags' && e.target.closest('#sheet')) ) ) return;
		T.keypadOpen = false; T.editingField = true;
		$( '#txKeypad' ).hidden = true;
		$( '.tx-field-actions' ).hidden = false;
		$$( '.amt-display' ).forEach( b => { b.classList.remove( 'on' ); b.setAttribute( 'aria-expanded', 'false' ); } );
	} );

	EXA.captureScheduleDraft=()=>{if(T&&($('#txDesc')||T.screen==='schedule')){readTxFields();storeDraft();}};
	EXA.refreshEntry=()=>{if(T&&$('#txDesc')){readTxFields();drawTx(true,false);storeDraft();}};
	EXA.categoryCreated=item=>{if(T&&$('#txDesc')&&item.type===T.type){readTxFields();T.category=item.id;T.catsOpen=false;drawTx(true,false);storeDraft();}};
	EXA.applySavedEntry=i=>{if(!T)return;readTxFields();applyShortcut(i);};
	EXA.txKey = pressKey;
	function onTxQuick() {
		const q = $( '#txQuick' ); if ( ! q ) return;readTxFields();
		T.quickText = q.value;
		if ( ! q.value.trim() ) return;
		const p = EX.parseQuick( q.value, { past: true } );
		if ( p.type && T.type !== 'transfer' ) { T.type = p.type; }
		if ( p.name ) T.name = p.name;
		if ( p.amount ) T.amount = p.amount;
        if(p.repeat)T.repeat=p.repeat;
		if ( p.date ) { T.date = p.date; T.dateMode = p.date === today() ? 'today' : p.date === addDays( today(), -1 ) ? 'yesterday' : 'other'; }
		if ( T.type !== 'transfer' ) { const c = guessCategory( p.name, T.type ); const list = EX.catList( T.type === 'income' ? 'income' : 'expense' ).map( ( x ) => x.key ); if(T.category&&!list.includes(T.category)&&T.category!=='uncategorized')T.category=null; }
		const hadFocus = document.activeElement && document.activeElement.id === 'txQuick';
		drawTx( true, false );
		if ( hadFocus ) { const n = $( '#txQuick' ); n.focus(); n.setSelectionRange( n.value.length, n.value.length ); }
	}
	function entryError(key,selector){EXA.playSound?.('error');const e=$('#txErr');e.textContent=t(key);e.hidden=false;const field=$(selector||'[data-tx=save]');const group=field?.closest('[data-entry-group]');if(group){group.open=true;T.entryGroup=group.dataset.entryGroup;}field?.setAttribute('aria-invalid','true');field?.setAttribute('aria-describedby','txErr');field?.scrollIntoView({block:'center'});field?.focus({preventScroll:true});}
	function saveTx(){
		if(!T||T.saving||T.committed)return;if(EXA.photos.busy)return toast(t('photoWorking'));readTxFields();
		const amount=T.amount.replace(/\.$/,'');
        const failures=[];
        if(!(T.scheduleKind==='bill'&&amount==='')&&(!/^\d{1,9}(\.\d{1,2})?$/.test(amount)||EX.cents(amount)<=0))failures.push(['errAmountReq','[data-tx=target-amount]']);
        if(!writable(T.account))failures.push(['entryWalletGone','[data-entry=wallet]']);
        if(T.type!=='transfer'&&(!T.category||(!EX.catList(T.type).some(c=>c.key===T.category)&&T.category!=='uncategorized')))failures.push(['entryCategoryError','[data-entry-group=category]>summary']);
        if(!T.editId&&T.type!=='transfer'&&(T.scheduleKind||(T.repeat||'once')!=='once'||T.date>today())&&!T.name.trim())failures.push(['errNameReq','#txDesc']);
        if(!T.date||!/^\d{4}-\d{2}-\d{2}$/.test(T.date))failures.push(['errDate','[data-entry=date]']);
        if(T.type==='transfer'&&(!writable(T.toAccount)||T.toAccount===T.account))failures.push(['errTransferSame','[data-entry=to-wallet]']);
        $('#sheet').querySelectorAll('[aria-invalid]').forEach(el=>el.removeAttribute('aria-invalid'));
        if(failures.length){const err=$('#txErr');err.textContent=failures.map(([key])=>t(key)).join(' · ');err.hidden=false;for(const [,selector] of failures){const field=$(selector);field?.setAttribute('aria-invalid','true');field?.setAttribute('aria-describedby','txErr');}const first=$(failures[0][1]);first?.scrollIntoView({block:'center',behavior:'smooth'});first?.focus({preventScroll:true});EXA.playSound?.('error');return;}

		if(!(T.scheduleKind==='bill'&&amount==='')&&(!/^\d{1,9}(\.\d{1,2})?$/.test(amount)||EX.cents(amount)<=0))return entryError('errAmountReq','[data-tx=target-amount]');
		if(!T.date||!/^\d{4}-\d{2}-\d{2}$/.test(T.date))return entryError('errDate','#txDate');
		if(T.date>today()&&(T.editId||T.type==='transfer'))return entryError('entryFuture','#txDate');
		if(!writable(T.account)){T.walletOpen=true;drawTx(true,false);return entryError('entryWalletGone','[data-entry=wallet]');}
		if(T.currencyReview)return entryError('entryCurrencyReview','[data-entry=review-currency]');
		if(T.type!=='transfer'&&!T.category){T.catsOpen=true;T.entryGroup='category';drawTx(true,false);return entryError('entryCategoryError','[data-tx-cat=uncategorized]');}
		if(T.type!=='transfer'&&!EX.catList(T.type).some(c=>c.key===T.category)&&T.category!=='uncategorized')return entryError('entryCategoryError','[data-tx-catsmore]');
		if(!T.editId&&T.type!=='transfer'&&(T.scheduleKind||(T.repeat||'once')!=='once'||T.date>today())){
          if(!T.name.trim())return entryError('errNameReq','#txDesc');
          const list=T.type==='income'?S().incomes:S().bills;
          const target=T.editScheduleId?list.find(x=>x.id===T.editScheduleId):null;if(T.editScheduleId&&(!target||contentStamp(target)!==T.sourceStamp))return entryError('entryChanged');if(!target&&list.some(x=>x.id===T.id))return;
          const schedule={...EXA.scheduleData(T),...EXA.readSchedule($('#sheet'))},scheduleError=EXA.scheduleError({...T,...schedule});if(scheduleError)return entryError(scheduleError);Object.assign(T,schedule);const prepared=target&&!T.scheduleTouched&&T.date===target.next?{...schedule,next:target.next,day:target.day,scheduleEnd:target.scheduleEnd}:EX.prepareSchedule({repeat:T.repeat||'once',...schedule,day:target&&target.next===T.date?target.day:parse(T.date).getDate()},T.date),next=prepared.next;if(!next)return entryError(prepared.endMode==='date'?'scheduleEndError':'schedulePickDates','#entryRepeat');
          if(T.scheduleKind==='bill'&&T.payUrl&&!/^https?:\/\//i.test(T.payUrl))return entryError('errUrl');const record={...prepared,id:target?.id||T.id,name:T.name.trim(),amount,account:T.account,currency:walletCur(T.account),category:T.category,tags:copy(T.tags),photo:T.photo||'',scannedReceipt:!!T.scannedReceipt,repeat:T.repeat||'once',next,day:prepared.day||parse(T.date).getDate(),...(T.type==='income'?{note:T.note.trim()}:{notes:T.note.trim(),lead:T.lead??null,variable:!!T.variable,autopay:!!T.autopay,reference:T.reference||'',payUrl:T.payUrl||''})};
          T.saving=true;const old=target?copy(target):null;if(target){Object.assign(target,record);delete target.done;}else{list.push(record);if(T.type==='income')EXA.settleIncome?.(record);}if(!EX.save()){if(target){Object.keys(target).forEach(k=>delete target[k]);Object.assign(target,old);}else list.splice(list.indexOf(record),1);T.saving=false;return entryError('tSaveFail');}
          const type=T.type;EXA.playSound?.('success');T.committed=true;dropDraft();UI.closeSheet(true);if(type==='income'){EXA.st.txFilter.type='income';EXA.st.incomeMode='recurring';}EXA.go(type==='income'?'activity':'bills');return;
        }
		const tx={type:T.type,amount,account:T.account,date:T.date,name:T.name.trim(),note:T.note.trim(),photo:T.photo||'',scannedReceipt:!!T.scannedReceipt,tags:T.tags||[]};
		if(T.type==='transfer'){
		 if(!writable(T.toAccount)||T.toAccount===T.account){T.toWalletOpen=true;drawTx(true,false);return entryError('errTransferSame','[data-entry=to-wallet]');}
		 if(!EX.sameScope(EX.account(T.account),EX.account(T.toAccount)))return entryError('errTransferSpace','[data-entry=to-wallet]');
		 tx.toAccount=T.toAccount;
		 if(walletCur(T.account)!==walletCur(T.toAccount)){const ta=(T.toAmount||'').replace(/\.$/,'');if(!/^\d{1,9}(\.\d{1,2})?$/.test(ta)||EX.cents(ta)<=0)return entryError('errToAmount','[data-tx=target-to]');tx.toAmount=ta;}
		}else tx.category=T.category;
		const editing=T.editId?S().txs.find(x=>x.id===T.editId):null;
		if(T.editId&&(!editing||contentStamp(editing)!==T.original))return entryError('entryChanged');
		if(editing&&(!writable(editing.account)||(editing.type==='transfer'&&!writable(editing.toAccount))))return entryError('entryWalletGone');
		if(!editing&&S().txs.some(x=>x.id===T.id)){T.committed=true;dropDraft();UI.closeSheet(true);return;}
		if(!editing&&!T.dupOk&&EXA.dupFind){const dup=EXA.dupFind(tx);if(dup){EXA.dupWarn(dup).then(go=>{if(go){T.dupOk=true;saveTx();}});return;}}
		T.saving=true;const old=editing?copy(editing):null,oldNames=copy(S().settings.savedNames||[]),oldDefault=S().settings.defaultAccount,oldReceipt=S().device.entryReceipt;
		if(T.rememberName&&T.type!=='transfer')EX.rememberName(T.type,tx.name,tx.category,{account:T.rememberWallet?T.account:'',amount:T.rememberAmount?amount:''});
		if(T.makeDefault)S().settings.defaultAccount=T.account;
		else if(T.defaultTouched&&S().settings.defaultAccount===T.account)delete S().settings.defaultAccount;
		let record;
		if(editing){record=Object.assign(editing,tx);if(tx.type!=='transfer'){delete record.toAccount;delete record.toAmount;}else{delete record.category;if(!tx.toAmount)delete record.toAmount;}}
		else{record={id:T.id,...tx};S().txs.push(record);}
		S().device.entryReceipt={id:record.id,owner:owner(),at:Date.now()};
		if(!EX.persist()){
		 if(editing){Object.keys(editing).forEach(k=>delete editing[k]);Object.assign(editing,old);}else S().txs=S().txs.filter(x=>x.id!==record.id);
		 S().settings.savedNames=oldNames;if(oldDefault===undefined)delete S().settings.defaultAccount;else S().settings.defaultAccount=oldDefault;S().device.entryReceipt=oldReceipt;
		 T.saving=false;return entryError('entryNotSaved');
		}
		const expected=contentStamp(record),id=record.id;T.committed=true;dropDraft();UI.closeSheet(true);EX.emit('change');UI.haptic(20);EXA.playSound?.('success');
		if(!editing)toast('',()=>{
		 const current=S().txs.find(x=>x.id===id);
		 if(!current||contentStamp(current)!==expected||!writable(current.account)||(current.type==='transfer'&&!writable(current.toAccount)))return toast(t('entryUndoChanged'));
		 const pos=S().txs.indexOf(current),receipt=S().device.entryReceipt;S().txs.splice(pos,1);if(receipt?.id===id)delete S().device.entryReceipt;if(!EX.save()){S().txs.splice(pos,0,current);S().device.entryReceipt=receipt;return toast(t('entryNotSaved'));}
		});else toast(t('tSaved'));
	}
	function applyShortcut(i){
		const x=EX.savedNames(T.type)[i];if(!x)return;T.name=x.name;T.rememberName=false;
		if(x.category==='uncategorized'||EX.catList(T.type).some(c=>c.key===x.category))T.category=x.category;
		if(x.amount)T.amount=x.amount;
		if(x.account){if(writable(x.account)){if(T.amount&&walletCur(T.account)!==walletCur(x.account)&&!x.amount)T.currencyReview=true;T.account=x.account;}else{T.account='';T.notice='entryUnavailable';T.walletOpen=true;}}
		delete T.pendingShortcut;drawTx(true,false);storeDraft();
	}
	function changeWallet(id,to=false){
		readTxFields();if(!writable(id))return;
		const prev=walletCur(T.account),prevTo=walletCur(T.toAccount);
		if(to){if(id===T.account||!EX.sameScope(EX.account(id),EX.account(T.account)))return;T.toAccount=id;T.toWalletOpen=false;}
		else{T.account=id;T.walletOpen=false;T.makeDefault=S().settings.defaultAccount===id;T.defaultTouched=false;if(T.toAccount===id||!EX.sameScope(EX.account(T.toAccount),EX.account(id)))T.toAccount='';}
		if(T.amount&&prev!==walletCur(T.account)||T.toAmount&&prevTo!==walletCur(T.toAccount)||T.sourceCurrency&&T.amount){if(!T.currencyReview)T.sourceCurrency=prev;T.currencyReview=true;}
		drawTx(true,false);storeDraft();
	}
	function changeType(type){
		if(type===T.type){T.typeOpen=false;drawTx(true);return;}
		readTxFields();const existing=restoreDraft(type,T.editId,T.recoveryId);if(existing&&existing.id!==T.id){T.notice='entryExistingDraft';T.typeOpen=false;drawTx(true,false);return;}storeDraft();const common={name:T.name,note:T.note,tags:copy(T.tags),photo:T.photo,date:T.date};
		const oldType=T.type,oldCategory=T.category;
		if(T.editId){const record=S().txs.find(x=>x.id===T.editId);if(record&&(record.billId||record.incomeId||record.goalId)){T.notice='entryLinkedType';T.typeOpen=false;drawTx(true,false);return;}}
		T.typeDrafts=T.typeDrafts||{};T.typeDrafts[oldType]={amount:T.amount,toAmount:T.toAmount,account:T.account,toAccount:T.toAccount,category:T.category};
		const back=T.typeDrafts[type]||{amount:T.amount,toAmount:'',account:T.account,toAccount:'',category:null};
		Object.assign(T,back,common,{type,typeOpen:false,keypadOpen:false,editingField:false,pendingShortcut:undefined,moreOpen:false});
		if(T.editId&&(oldType==='transfer'||type==='transfer'||oldCategory!==T.category))T.notice='entryPendingReview';
		drawTx(true,false);storeDraft();
	}
	EXA.txClick=e=>{
		if(!T||(!$('#txDesc')&&T.screen!=='schedule'))return false;const g=sel=>e.target.closest(sel);let el;
		if((el=g('[data-key]'))){pressKey(el.dataset.key);storeDraft();return true;}
		if((el=g('[data-tx-saved]'))){readTxFields();const x=EX.savedNames(T.type)[Number(el.dataset.txSaved)];if(x&&(T.name.trim()&&T.name!==x.name||x.amount&&T.amount&&T.amount!==x.amount||x.account&&T.account&&T.account!==x.account)){T.pendingShortcut=Number(el.dataset.txSaved);drawTx(false,false);}else applyShortcut(Number(el.dataset.txSaved));return true;}
		if((el=g('[data-tx-forget]'))){readTxFields();const x=EX.savedNames(T.type)[Number(el.dataset.txForget)];if(x){S().settings.savedNames=S().settings.savedNames.filter(n=>n!==x);EX.save();drawTx(true,false);}return true;}
		if((el=g('[data-tx-type]'))){changeType(el.dataset.txType);return true;}
		if(g('[data-tx-catsmore]')){readTxFields();T.catsOpen=!T.catsOpen;drawTx(true,false);return true;}
		if((el=g('[data-service-preset]'))){const p=EX.SERVICE_PRESETS[Number(el.dataset.servicePreset)];if(p){readTxFields();T.name=EXA.servicePresetName(p);T.category=p[2];drawTx(true,false);storeDraft();}return true;}
		if((el=g('[data-tx-cat]'))){readTxFields();T.entryGroup='category';T.category=el.dataset.txCat;T.catsOpen=false;drawTx(true,false);storeDraft();return true;}
		if((el=g('[data-tx-wallet]'))){changeWallet(el.dataset.txWallet);return true;}
		if((el=g('[data-tx-to]'))){changeWallet(el.dataset.txTo,true);return true;}
		if((el=g('[data-tx-date]'))){readTxFields();T.dateMode=el.dataset.txDate;T.date=T.dateMode==='today'?today():T.dateMode==='yesterday'?addDays(today(),-1):T.date;T.dateOpen=T.dateMode==='other';drawTx(true,false);storeDraft();return true;}
		if((el=g('[data-entry]'))){
		 readTxFields();const a=el.dataset.entry;
         if(a==='schedule-open'){T.screen='schedule';drawTx(false,false);return true;}
         if(a==='frequency'){T.repeat=el.dataset.repeat==='monthly'?'monthdays':el.dataset.repeat;if(T.repeat==='monthdays'&&!T.monthDays?.length)T.monthDays=[parse(T.date).getDate()];T.scheduleTouched=true;drawTx(true,false);storeDraft();return true;}
         if(a==='schedule-back'||a==='schedule-use'){let error=EXA.scheduleError({...T,next:T.date});if(!error&&!EX.prepareSchedule({...T,day:parse(T.date).getDate()},T.date).next)error='scheduleEndError';if(error&&a==='schedule-use')return entryError(error);T.scheduleTouched=true;T.screen='main';drawTx(false,false);storeDraft();return true;}
         if(a==='delete-record'||a==='delete-cancel'){T.confirmDelete=a==='delete-record';drawTx(true,false);return true;}
         if(a==='delete-confirm'){const list=T.scheduleKind==='bill'?S().bills:S().incomes,index=list.findIndex(x=>x.id===T.editScheduleId);if(index>=0&&writable(list[index].account)){list.splice(index,1);T.committed=true;dropDraft();UI.closeSheet(true);EX.save();EXA.playSound?.('success');}return true;}
         if(a==='duplicate-record'){EXA.duplicateRecord(T.scheduleKind,T.editScheduleId);return true;}
		 if(a==='discard'){dropDraft();T.committed=true;UI.closeSheet(true);return true;}
		 if(a==='keep'){T.discard=false;drawTx(true,false);return true;}
		 if(a==='apply-shortcut'){applyShortcut(T.pendingShortcut);return true;}
		 if(a==='cancel-shortcut'){delete T.pendingShortcut;drawTx(true,false);return true;}
		 if(a==='review-currency'){if(!writable(T.account)){T.walletOpen=true;drawTx(true,false);entryError('entryWalletGone','[data-entry=wallet]');return true;}T.currencyReview=false;delete T.sourceCurrency;drawTx(true,false);storeDraft();return true;}
		 if(a==='swap'){
		  if(T.account&&T.toAccount){const was=walletCur(T.account);[T.account,T.toAccount]=[T.toAccount,T.account];if(was!==walletCur(T.account)){[T.amount,T.toAmount]=[T.toAmount||'',T.amount];}drawTx(true,false);storeDraft();}return true;
		 }
		 if(a==='schedule'){T.pendingSchedule=true;drawTx(false,false);return true;}
		 if(a==='schedule-cancel'){T.pendingSchedule=false;drawTx(true,false);return true;}
		 if(a==='schedule-go'){
		  storeDraft();const v={name:T.name,amount:T.amount,account:T.account,category:T.category||'uncategorized',photo:T.photo,tags:copy(T.tags),notes:T.note,next:T.date>today()?T.date:addDays(today(),7)},type=T.type;
		  T.committed=true;UI.closeSheet(true);T=null;
		  if(type==='income'){EXA.go('activity');EXA.st.txFilter.type='income';EXA.st.incomeMode='recurring';EXA.openIncome(null,v);}else EXA.openBill(null,v);return true;
		 }
		 if(a==='new-category'){EXA.openCategory(null,T.type);return true;}
		 if(a==='create-category'){const name=$('#entryCategoryName')?.value.trim();if(name){const id=uid();S().categories.push({id,name,type:T.type,iconName:$('#entryCategoryIcon')?.value||'tag',color:'teal'});if(EX.save()){T.category=id;T.catsOpen=false;drawTx(true,false);storeDraft();}}return true;}
		 const field={type:'typeOpen',wallet:'walletOpen','to-wallet':'toWalletOpen',date:'dateOpen',photo:'photoOpen',tags:'tagsOpen',note:'noteOpen',more:'moreOpen'}[a];
		 if(field){if(['wallet','to-wallet','date'].includes(a))T.entryGroup='payment';T[field]=!T[field];drawTx(true,false);return true;}return true;
		}
		if((el=g('[data-tx]'))){const a=el.dataset.tx;
		 if(a==='quick-review'){readTxFields();T.quick=false;drawTx(true,false);storeDraft();}else if(a==='save')saveTx();else if(a==='target-amount')setKeypad(true,'amount');else if(a==='target-to')setKeypad(true,'toAmount');else if(a==='amount-done'){setKeypad(false);storeDraft();}else if(a==='field-done'){finishField();drawTx(true,false);storeDraft();}else if(a==='quick'){readTxFields();T.quick=true;T.moreOpen=true;T.entryGroup='extras';drawTx(true,false);$('#txQuick')?.focus();}else if(a==='note'){readTxFields();T.noteOpen=!T.noteOpen;drawTx(true,false);}
		 return true;
		}return false;
	};
	EXA.txInput=e=>{if(!T||(!$('#txDesc')&&T.screen!=='schedule'))return false;
		if(e.target.closest('[data-schedule-panel]')){readTxFields();storeDraft();return true;}
        if(e.target.id==='entryRepeat'){readTxFields();drawTx(true,false);storeDraft();return true;}
		if(e.target.id==='txQuick'){onTxQuick();storeDraft();return true;}
		if(e.target.id==='txDesc'&&e.type==='input'){T.name=e.target.value;const services=$('#entryServices');if(services)services.hidden=!!T.name.trim()||!!T.editScheduleId||!!T.editId;const r=$('.remember-name');if(r)r.hidden=!T.name.trim();const cat=$('#entryCategory');if(cat)cat.innerHTML=entryCategories();}
		if(e.target.id==='entryCategoryIcon'){const preview=$('.entry-icon-preview');if(preview)preview.innerHTML=UI.ci(e.target.value,'teal',40);}
		if(['entryRememberAmount','entryRememberWallet'].includes(e.target.id)&&e.target.checked){if(T.name.trim()){T.rememberName=true;$('#rememberName').checked=true;}else{e.target.checked=false;toast(t('entryNoName'));}}
		if(e.target.id==='entryDefault'){T.defaultTouched=true;T.makeDefault=e.target.checked;}
		const summary=$('[data-group-summary=category]');if(summary)summary.textContent=[T.category?EX.catInfo(T.category).name:t('entryChooseCat'),...EXA.readTags($('#sheet'))].join(' · ');const extra=$('[data-group-summary=extras]');if(extra)extra.textContent=[T.photo?t('entryPhoto'):'',$('#txNote')?.value?t('entryNote'):''].filter(Boolean).join(' · ')||t('entryExtrasHint');clearTimeout(draftTimer);draftTimer=setTimeout(storeDraft,120);return false;
	};
	window.addEventListener('pagehide',storeDraft);
	document.addEventListener('visibilitychange',()=>{if(document.hidden)storeDraft();});
	document.addEventListener('change',e=>{if(T&&e.target.closest('#sheet')){EXA.txInput(e);storeDraft();}});
	document.addEventListener('click',()=>{if(T)queueMicrotask(()=>{if(T)storeDraft();});});
	EX.on('auth',event=>{if(!event?.accountChanged)return;if(T){clearTimeout(draftTimer);T.committed=true;T=null;UI.closeSheet(true);}try{for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k.startsWith('expenity.entryDraft.v1:')||k.startsWith('expenity.entryRecovery.v1:'))localStorage.removeItem(k);}}catch(e){}});
	EX.on('photochange',()=>{if(T){readTxFields();storeDraft();const btn=$('[data-entry=photo]');if(btn){btn.classList.toggle('populated',!!T.photo);btn.querySelector('small')?.remove();if(T.photo)btn.insertAdjacentHTML('beforeend','<small>1</small>');}}});
	EX.on('lang',()=>{if(T&&$('#txDesc')){readTxFields();drawTx(true,false);}});
	EXA.entryStatus=id=>{const state=EX.sync.recordStatus(id),key=state==='synced'?'entrySynced':state==='device'?'entryGuestSaved':state==='error'?'entrySyncError':'entrySavedDevice';return `${UI.icon(state==='synced'?'cloud-check':state==='error'?'alert-triangle':'clock',18)}${esc(t(key))}`;};

	EXA.entryReceipt=()=>{const r=S().device.entryReceipt;if(!r||r.owner!==owner()||Date.now()-r.at>86400000)return '';const state=EX.sync.recordStatus(r.id),key=state==='synced'?'entrySynced':state==='device'?'entryGuestSaved':state==='error'?'entrySyncError':'entrySavedDevice';return `<p class="entry-receipt" id="entryReceipt" role="status">${UI.icon(state==='synced'?'cloud-check':state==='error'?'alert-triangle':'clock',18)}${esc(t(key))}</p>`;};
	EX.on('syncstatus',()=>{const line=$('#entryReceipt');if(line)line.outerHTML=EXA.entryReceipt();document.querySelectorAll('[data-entry-status]').forEach(el=>el.innerHTML=EXA.entryStatus(el.dataset.entryStatus));});
	const recoveryKey=()=> 'expenity.entryRecovery.v1:'+owner();
	function recoveries(){try{return (JSON.parse(localStorage.getItem(recoveryKey())||'[]')).filter(x=>Date.now()-x.saved<86400000);}catch(e){return [];}}
	EX.on('entryrejected',event=>{if(!event.changes.length)return;try{const all=recoveries();for(const tx of event.changes){const i=all.findIndex(x=>x.tx.id===tx.id);const item={saved:Date.now(),currency:EX.account(tx.account)?.currency||S().settings.currency,tx:copy(tx)};if(i<0)all.push(item);else all[i]=item;}localStorage.setItem(recoveryKey(),JSON.stringify(all));}catch(e){toast(t('entryDraftFail'));}});
	document.addEventListener('click',e=>{const b=e.target.closest('[data-entry-recover],[data-entry-recovery]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();
	 if(b.hasAttribute('data-entry-recover')){UI.openSheet(head(t('entryRecover'))+`<div class="sheet-pad"><p>${esc(t('entryRecoveryHint'))}</p>${recoveries().map(({tx,currency},i)=>`<button type="button" class="entry-add-row" data-entry-recovery="${i}">${UI.icon('receipt',24)}<span><b>${esc(tx.name||EX.catInfo(tx.category).name)}</b><small>${esc(EX.money(tx.amount,currency))}</small></span>${UI.icon('chevron-right',20)}</button>`).join('')}</div>`,{cls:'small'});return;}
	 const item=recoveries()[Number(b.dataset.entryRecovery)];if(item){EXA.openTx(null,{...item.tx,account:'',toAccount:'',notice:'entryWalletGone',currencyReview:true,sourceCurrency:item.currency,recoveryId:item.tx.id});}
	},true);

	// Keep the footer above the software keyboard in Safari as well as resize-content browsers.
	function entryViewport(){if(!T||!window.visualViewport){$('#sheet').style.removeProperty('--entry-height');return;}const vv=visualViewport;$('#sheet').style.setProperty('--entry-height',Math.round(vv.height)+'px');$('#sheet').style.setProperty('--entry-top',Math.round(vv.offsetTop)+'px');}
	window.visualViewport?.addEventListener('resize',entryViewport);window.visualViewport?.addEventListener('scroll',entryViewport);

	// A hardware keyboard works too: digits, comma or dot, backspace and Enter.
	document.addEventListener( 'keydown', ( e ) => {
		if ( ! T || ! UI.sheetOpen() || e.ctrlKey || e.metaKey || e.altKey ) return;
		const tag = ( document.activeElement && document.activeElement.tagName ) || '';
		if ( /INPUT|TEXTAREA|SELECT/.test( tag ) && document.activeElement.type !== 'radio' ) { if ( e.key === 'Enter' && tag === 'INPUT' && document.activeElement.id !== 'txQuick' ) { e.preventDefault(); finishField(); } return; }
		if ( ! T.keypadOpen ) return;
		if ( /^\d$/.test( e.key ) ) { pressKey( e.key ); e.preventDefault(); }
		else if ( e.key === ',' || e.key === '.' ) { pressKey( '.' ); e.preventDefault(); }
		else if ( e.key === 'Backspace' ) { pressKey( '<' ); e.preventDefault(); }
		else if ( e.key === 'Enter' ) { setKeypad( false ); e.preventDefault(); }
	} );

	/* ------------------------------------------------------------------ Bill sheet */

	let editingBill = null, quickDay = null;
	// A grid, never a sideways scroller: the first few categories plus a visible "More" tile that opens the rest.
	const CAT_SHOW = 7;
	const catGrid = ( cats, selected, attr, open, moreAttr ) => {
		const tile = ( c ) => `<button type="button" class="catchip${ selected === c.key ? ' on' : '' }" ${ attr }="${ esc( c.key ) }">${ UI.catCi( c, 40 ) }<span>${ esc( c.name ) }</span></button>`;
		if ( cats.length <= CAT_SHOW + 1 ) return cats.map( tile ).join( '' );
		let shown = open ? cats : cats.slice( 0, CAT_SHOW );
		if ( ! open && selected && ! shown.some( ( c ) => c.key === selected ) ) { const s = cats.find( ( c ) => c.key === selected ); if ( s ) shown = shown.slice( 0, CAT_SHOW - 1 ).concat( s ); }
		return (open?`<div class="catalog-category-groups">${EXA.groupedCategories(cats,tile,selected)}</div>`:shown.map(tile).join('')) + `<button type="button" class="catchip more" ${ moreAttr }>${ UI.ci( open ? 'chevron-up' : 'chevron-down', 'gray', 40 ) }<span>${ esc( t( open ? 'catsLess' : 'catsMore', { n: cats.length - CAT_SHOW } ) ) }</span></button>`;
	};
	let billCatsOpen = false;
	const catChips = ( selected ) => catGrid( EX.catList( 'expense' ), selected, 'data-bill-cat', billCatsOpen, 'data-bill-catsmore' );
	EXA.openBill = ( bill, prefill ) => {
		EX.ensureWallet();
		editingBill = bill || null; quickDay = null;
		const billDefault=EX.writableAccounts().find(a=>a.id===S().settings.defaultAccount)?.id||(EX.writableAccounts().length===1?EX.writableAccounts()[0].id:'');
		const v = bill ? Object.assign( {}, bill ) : Object.assign( { currency: S().settings.currency, repeat: 'monthly', category: 'other', lead: null, next: addDays( today(), 7 ), amount: '', name: '', account: billDefault }, prefill || {} );
		return EXA.openTx(null,{...v,type:'expense',date:v.next,note:v.notes||'',scheduleKind:'bill',editScheduleId:bill?.id||null,sourceStamp:bill?contentStamp(bill):null,sourceRecord:bill?copy(bill):null,recoveryId:'bill-'+(bill?.id||'new')});
		const wallets = EX.writableAccounts();
		UI.openSheet( `${ head( t( bill ? 'editTitle' : 'addTitle' ) ) }<form id="billForm" novalidate class="sheet-pad">
			<label class="f"><span>${ esc( t( 'fName' ) ) }</span><input name="name" required maxlength="80" autocomplete="off" placeholder="${esc(EXA.label('ownName'))}" value="${ esc( v.name ) }"></label>
			${ bill ? '' : `<div class="quick"><label for="quick">${ esc( t( 'quickLabel' ) ) }</label><input id="quick" type="text" autocomplete="off" placeholder="${ esc( t( 'quickPh' ) ) }" spellcheck="false"><div class="chips-out" id="chips" aria-live="polite"></div><details class="name-suggestions"><summary>${UI.icon('chevron-down',18)} ${esc(EXA.label('suggestions'))}</summary><div class="chip-scroll" id="tpls">${ EX.TEMPLATES.map( ( x, i ) => `<button type="button" class="chip" data-tpl="${ i }">${ UI.icon( EX.CAT_STYLE[ x[ 1 ] ][ 0 ], 18 ) } ${ esc( t( x[ 0 ] ) ) }</button>` ).join( '' ) }</div></details></div>` }

			<label class="f"><span>${ esc( t( 'fPayFrom' ) ) }</span><select name="account"><option value="">${esc(t('entryChooseWallet'))}</option>${ wallets.map( ( a ) => `<option value="${ esc( a.id ) }"${ v.account === a.id ? ' selected' : '' }>${ esc( EX.accountName( a ) ) } (${ esc( a.currency ) })</option>` ).join( '' ) }</select></label>
			${EXA.servicePicker()}<label class="f"><span>${ esc( t( 'fAmount' ) ) }</span><input name="amount" inputmode="decimal" placeholder="0.00" autocomplete="off" value="${ esc( v.amount ) }"></label>
			<div class="grid2"><label class="f"><span>${ esc( t( 'fNext' ) ) }</span><input name="next" type="date" required value="${ esc( v.next || '' ) }"></label>
			<label class="f"><span>${ esc( t( 'fRepeats' ) ) }</span><select name="repeat">${ EX.REPEATS.map( ( r ) => `<option value="${ r }"${ v.repeat === r ? ' selected' : '' }>${ esc( t( 'r' + r.charAt( 0 ).toUpperCase() + r.slice( 1 ) ) ) }</option>` ).join( '' ) }</select></label></div>${EXA.scheduleFields(v)}
			<div class="lbl">${ esc( t( 'fCategory' ) ) }</div><div class="cats" id="billCats">${ catChips( v.category ) }</div><input type="hidden" name="category" value="${ esc( v.category ) }"><button type="button" class="btn btn-ghost" data-inline-category="expense">${esc(t('entryCreateCategory'))}</button>
			<div><label class="f"><span>${ esc( t( 'fRemind' ) ) }</span><select name="lead"><option value="">${ esc( t( 'leadDefault' ) ) }</option>${ EX.LEADS.map( ( x ) => `<option value="${ x }"${ v.lead === x ? ' selected' : '' }>${ esc( t( 'lead' + x ) ) }</option>` ).join( '' ) }</select></label>${EXA.reminderNotice()}
</div>
			<label class="f chk"><input type="checkbox" name="variable"${ v.variable ? ' checked' : '' }> <span>${ esc( t( 'fVariable' ) ) }</span></label>
			<label class="f chk"><input type="checkbox" name="autopay"${ v.autopay ? ' checked' : '' }> <span>${ esc( t( 'fAutopay' ) ) }</span></label>
			<details class="more-opts"><summary>${ esc( t( 'tabMore' ) ) }</summary>

			<label class="f"><span>${ esc( t( 'fRef' ) ) }</span><input name="reference" maxlength="80" autocomplete="off" placeholder="${ esc( t( 'fRefPh' ) ) }" value="${ esc( v.reference || '' ) }"></label>
			<label class="f"><span>${ esc( t( 'fUrl' ) ) }</span><input name="payUrl" type="url" placeholder="https://" autocomplete="off" value="${ esc( v.payUrl || '' ) }"></label>
			<label class="f"><span>${ esc( t( 'fNotes' ) ) }</span><textarea name="notes" rows="2" maxlength="400">${ esc( v.notes || '' ) }</textarea></label></details>
			${ EXA.tagsField(v.tags) }${ EXA.photos.slot( v.photo ) }<p class="err" id="formErr" role="alert" hidden></p>
			<div class="btn-row sticky-actions">${ bill ? `<button type="button" class="btn btn-danger" id="delBtn">${ esc( t( 'del' ) ) }</button>` : '' }<span class="sp"></span><button type="submit" class="btn btn-primary" id="saveBtn">${ esc( t( bill?'saveBill':'entryScheduleBill' ) ) }</button></div></form>`, { tall: true, cls: 'billsheet' } );
		if ( ! bill && matchMedia( '(min-width: 600px) and (pointer: fine)' ).matches ) $( '#quick' ).focus();
	};
	EXA.billClick = ( e ) => {
		const f = $( '#billForm' ); if ( ! f ) return false;
		let el;
		const preset=e.target.closest('[data-service-preset]');if(preset){const p=EX.SERVICE_PRESETS[Number(preset.dataset.servicePreset)];if(p){f.elements.name.value=EXA.servicePresetName(p);f.elements.category.value=p[2];$('#billCats').innerHTML=catChips(p[2]);}return true;}
		if ( e.target.closest( '[data-bill-catsmore]' ) ) { billCatsOpen = ! billCatsOpen; const bc = $( '#billCats' ); if ( bc ) bc.innerHTML = catChips( f.elements.category.value ); return true; }
		if ( ( el = e.target.closest( '[data-bill-cat]' ) ) ) { f.elements.category.value = el.dataset.billCat; $$( '#billCats .catchip' ).forEach( ( b ) => b.classList.toggle( 'on', b === el ) ); return true; }
		if ( ( el = e.target.closest( '[data-tpl]' ) ) ) {
			const x = EX.TEMPLATES[ Number( el.dataset.tpl ) ];
			f.elements.name.value = t( x[ 0 ] ); f.elements.category.value = x[ 1 ]; f.elements.repeat.value = x[ 2 ];
			$$( '#billCats .catchip' ).forEach( ( b ) => b.classList.toggle( 'on', b.dataset.billCat === x[ 1 ] ) );
			f.elements.amount.focus(); return true;
		}
		if ( e.target.closest( '#delBtn' ) ) { const id = editingBill && editingBill.id; UI.closeSheet(); if ( id ) removeBill( id ); return true; }
		return false;
	};
	EXA.billInput = ( e ) => {
		if ( e.target.id !== 'quick' ) return false;
		const f = $( '#billForm' ), p = EX.parseQuick( e.target.value );
		const chips = [];
		if ( e.target.value.trim() ) {
			if ( p.name ) { f.elements.name.value = p.name; chips.push( p.name ); }
			if ( p.amount ) { f.elements.amount.value = p.amount; chips.push( ( p.variable ? '~' : '' ) + p.amount + ' ' + ( ( EX.account( f.elements.account.value ) || {} ).currency || S().settings.currency ) ); }
			if ( p.variable ) f.elements.variable.checked = true;
			if ( p.repeat ) { f.elements.repeat.value = p.repeat; chips.push( EX.repeatLabel( p.repeat ) ); }
			if ( p.next ) { f.elements.next.value = p.next; chips.push( dayName( p.next ) ); }
			const cat = guessCategory( p.name, 'expense' );
			if ( cat ) { f.elements.category.value = cat; $$( '#billCats .catchip' ).forEach( ( b ) => b.classList.toggle( 'on', b.dataset.billCat === cat ) ); }
			quickDay = p.day || null;
		}
		$( '#chips' ).innerHTML = chips.map( ( c ) => `<span class="chip tag">${ esc( c ) }</span>` ).join( '' );
		return true;
	};
	EXA.billSubmit = () => {
		const f = $( '#billForm' ), g = ( n ) => f.elements[ n ];
		const err = ( m ) => { const e = $( '#formErr' ); e.textContent = m; e.hidden = false; };
		const name = g( 'name' ).value.trim(), next = g( 'next' ).value, amountRaw = g( 'amount' ).value.trim().replace( ',', '.' );
		if ( ! name ) return err( t( 'errName' ) );
		if ( ! next ) return err( t( 'errNext' ) );
		if ( amountRaw && ! /^\d+(\.\d{1,2})?$/.test( amountRaw ) ) return err( t( 'errAmount' ) );
		const wallet = EX.account( g( 'account' ).value );
		if(!wallet||!writable(wallet.id))return err(t('entryWalletGone'));
		const cur = wallet ? wallet.currency : S().settings.currency;
		const end = !['once','dates'].includes(g('repeat').value)&&g('scheduleEndMode').value==='date'?g('end').value:'';
		if ( end && end < next ) return err( t( 'errEnd' ) );
		const payUrl = g( 'payUrl' ).value.trim();
		if ( payUrl && ! /^https?:\/\//i.test( payUrl ) ) return err( t( 'errUrl' ) );
		const schedule=EXA.readSchedule(f),scheduleError=EXA.scheduleError({repeat:g('repeat').value,...schedule,next});if(scheduleError)return err(t(scheduleError));const prepared=EX.prepareSchedule({repeat:g('repeat').value,...schedule,day:editingBill&&editingBill.next===next?editingBill.day:parse(next).getDate()},next),first=prepared.next;if(!first)return err(t(prepared.endMode==='date'?'scheduleEndError':'schedulePickDates'));if(end&&first>end)return err(t('errEnd'));
        const b = { ...prepared,name, amount: amountRaw, currency: cur, next:first, repeat: g( 'repeat' ).value, category: g( 'category' ).value || 'other', end: prepared.end || '', account: g( 'account' ).value || '',
			lead: g( 'lead' ).value === '' ? null : Number( g( 'lead' ).value ), variable: g( 'variable' ).checked, autopay: g( 'autopay' ).checked, reference: g( 'reference' ).value.trim(), payUrl, notes: g( 'notes' ).value.trim(), photo: g( 'photo' ).value, tags: EXA.readTags(f) };
		const was = !! editingBill;
		if ( editingBill ) { const keepDay = editingBill.next === b.next && editingBill.day ? editingBill.day : null; Object.assign( editingBill, b, { day: keepDay || parse( b.next ).getDate() } ); delete editingBill.done; }
		else S().bills.push( Object.assign( { id: uid(), day: quickDay || parse( b.next ).getDate(), created: today() }, b ) );
		quickDay = null;
		UI.closeSheet();
		EX.save();
		toast( was ? t( 'tSaved' ) : t( 'tAdded', { name: b.name, lead: t( 'lead' + ( EX.LEADS.includes( EXA.lead( b ) ) ? EXA.lead( b ) : 3 ) ).toLowerCase() } ) );
	};

	/* ------------------------------------------------------------------ Pay sheet */

	EXA.openPay = ( bill ) => {
		EX.ensureWallet();
		const wallets = EX.writableAccounts(), sel = bill.account || ( wallets[ 0 ] || {} ).id;
		UI.openSheet( `${ head( t( 'payTitle' ) ) }<form id="payForm" class="sheet-pad" data-id="${ esc( bill.id ) }"><p class="muted">${ esc( t( 'payFor', { name: bill.name, date: dayName( bill.next ) } ) ) }</p>
			<div class="grid2"><label class="f"><span>${ esc( t( 'payAmount' ) ) }</span><input name="amount" inputmode="decimal" autocomplete="off" value="${ esc( bill.amount ) }" autofocus></label><label class="f"><span>${ esc( t( 'payOn' ) ) }</span><input name="paidOn" type="date" required value="${ today() }"></label></div>
			<label class="f"><span>${ esc( t( 'fPayFrom' ) ) }</span><select name="account">${ wallets.map( ( a ) => `<option value="${ esc( a.id ) }"${ a.id === sel ? ' selected' : '' }>${ esc( EX.accountName( a ) ) } (${ esc( a.currency ) })</option>` ).join( '' ) }</select></label>
			<p class="err" id="payErr" role="alert" hidden></p><div class="btn-row"><button type="submit" class="btn btn-primary wide">${ UI.icon( 'check', 22 ) } ${ esc( t( 'markPaid' ) ) }</button></div></form>`, { cls: 'small' } );
		if ( matchMedia( '(min-width: 600px) and (pointer: fine)' ).matches ) $( '#payForm [name=amount]' ).select();
	};
	EXA.paySubmit = () => {
		const pf = $( '#payForm' ), amt = pf.elements.amount.value.trim().replace( ',', '.' );
		if ( ! amt || ! /^\d+(\.\d{1,2})?$/.test( amt ) ) { const e = $( '#payErr' ); e.textContent = t( 'numberHint' ); e.hidden = false; return; }
		const id = pf.dataset.id, paidOn = pf.elements.paidOn.value, account = pf.elements.account.value;
		UI.closeSheet();
		markPaid( id, amt, paidOn, account );
	};

	/* ------------------------------------------------------------------ Wallet and category sheets */

	let editingWallet = null;
	EXA.openWallet = ( id ) => {
		const a = id ? EX.account( id ) : null;
		editingWallet = a;
		const v = a || { name: '', type: 'bank', currency: S().settings.currency, opening: '', archived: false };
		UI.openSheet( `${ head( t( a ? 'walletEdit' : 'walletAdd' ) ) }<form id="walletForm" novalidate class="sheet-pad">
			<label class="f"><span>${ esc( t( 'wName' ) ) }</span><input name="name" required maxlength="40" autocomplete="off" value="${ esc( EX.accountName(v) ) }" autofocus></label>
			<div class="lbl">${ esc( t( 'wType' ) ) }</div><div class="chip-scroll" id="wTypes">${ EX.WALLET_TYPES.map( ( w ) => `<button type="button" class="chip big${ v.type === w[ 0 ] ? ' on' : '' }" data-wtype="${ w[ 0 ] }">${ UI.icon( EX.WALLET_ICON[ w[ 0 ] ], 20 ) } ${ esc( t( 'wt' + w[ 0 ].charAt( 0 ).toUpperCase() + w[ 0 ].slice( 1 ) ) ) }</button>` ).join( '' ) }</div><input type="hidden" name="type" value="${ esc( v.type ) }">
			<div class="grid2"><label class="f"><span>${ esc( t( 'wCurrency' ) ) }</span><input name="currency" list="curList" maxlength="3" autocomplete="off" value="${ esc( v.currency ) }"></label><label class="f"><span>${ esc( t( 'wOpening' ) ) }</span><input name="opening" inputmode="decimal" placeholder="0.00" autocomplete="off" value="${ esc( v.opening === '0' ? '' : v.opening ) }"></label></div>
			${ EXA.walletColorField ? EXA.walletColorField( v ) : '' }
			<label class="f chk"><input type="checkbox" name="archived"${ v.archived ? ' checked' : '' }> <span>${ esc( t( 'wArchived' ) ) }</span></label>
			${ a ? EXA.shareRow( a ) : '' }
			${ EXA.tagsField(v.tags) }${ EXA.photos.slot( v.photo ) }<p class="err" id="walletErr" role="alert" hidden></p>
			<div class="btn-row sticky-actions">${ a ? `<button type="button" class="btn btn-danger" id="walletDel">${ esc( t( 'del' ) ) }</button>` : '' }<span class="sp"></span><button type="submit" class="btn btn-primary">${ esc( t( 'saveTx' ) ) }</button></div></form>`, { cls: 'small' } );
	};
	EXA.walletClick = ( e ) => {
		const pick = e.target.closest( '[data-cat-icon], [data-cat-color]' );
		if ( pick && catSel ) {
			if ( pick.dataset.catIcon ) catSel.icon = pick.dataset.catIcon; else catSel.color = pick.dataset.catColor;
			$( '#catPick' ).innerHTML = catPicker(); $( '#catPrev' ).innerHTML = UI.ci( catSel.icon, catSel.color, 56 );
			return true;
		}
		const el = e.target.closest( '[data-wtype]' );
		if ( el ) { $( '#walletForm' ).elements.type.value = el.dataset.wtype; $$( '#wTypes .chip' ).forEach( ( b ) => b.classList.toggle( 'on', b === el ) ); return true; }
		if ( e.target.closest( '#walletDel' ) ) {
			const a = editingWallet; if ( ! a ) return true;
			const used = S().txs.some( ( x ) => x.account === a.id || x.toAccount === a.id ) || S().bills.some( ( b ) => b.account === a.id );
			UI.closeSheet();
			if ( used ) { a.archived = true; EX.save(); toast( t( 'wBlocked' ) ); return true; }
			S().accounts = S().accounts.filter( ( x ) => x.id !== a.id ); EX.save(); toast( t( 'tDeleted', { name: a.name } ) );
			return true;
		}
		return false;
	};
	EXA.walletSubmit = () => {
		const f = $( '#walletForm' ).elements;
		const err = ( k ) => { const e = $( '#walletErr' ); e.textContent = t( k ); e.hidden = false; };
		const name = f.name.value.trim(), cur = ( f.currency.value.trim() || S().settings.currency ).toUpperCase(), opening = f.opening.value.trim().replace( ',', '.' ) || '0';
		if ( ! name ) return err( 'errNameReq' );
		if ( ! /^[A-Z]{3}$/.test( cur ) ) return err( 'errCur' );
		if ( ! /^-?\d+(\.\d{1,2})?$/.test( opening ) ) return err( 'errAmount' );
		const v = { name, type: f.type.value, currency: cur, opening, archived: f.archived.checked, color: f.color ? f.color.value : '', photo: f.photo.value, tags: EXA.readTags(document.querySelector('#walletForm')) };
		if ( ! v.color ) delete v.color;
		if ( editingWallet ) { Object.assign( editingWallet, v ); if ( ! v.color ) delete editingWallet.color; delete editingWallet.auto; } else S().accounts.push( Object.assign( { id: uid() }, v ) );
		EX.repairCurrencies();
		UI.closeSheet(); EX.save(); toast( t( 'tWalletSaved' ) );
	};
	const CAT_ICONS = ['tag', 'shopping-cart', 'shopping-bag', 'home', 'car', 'bus', 'bike', 'gas-station', 'coffee', 'pizza', 'glass-full', 'heartbeat', 'pill', 'first-aid-kit', 'school', 'book', 'gift', 'plane', 'briefcase', 'heart', 'users', 'paw', 'baby-carriage', 'device-gamepad-2', 'ball-football', 'barbell', 'music', 'movie', 'shirt', 'scissors', 'tools', 'phone', 'wifi', 'bulb', 'droplet', 'flame', 'tree', 'building-store', 'receipt', 'pig-money'].concat(EX.EXTRA_ICONS);
	const CAT_COLORS = ['teal', 'blue', 'purple', 'pink', 'red', 'amber', 'green', 'gray'];
	let catSel = null;
	const catPicker = () => `<div class="lbl">${ esc( t( 'cIcon' ) ) }</div><div class="icon-pick cat-icons" role="radiogroup" aria-label="${ esc( t( 'cIcon' ) ) }">${ CAT_ICONS.map( ( n ) => `<button type="button" class="ipick${ catSel.icon === n ? ' on' : '' }" data-cat-icon="${ n }" role="radio" aria-checked="${ catSel.icon === n }" aria-label="${ n }">${ UI.icon( n, 24 ) }</button>` ).join( '' ) }</div>
		<div class="lbl">${ esc( t( 'cColor' ) ) }</div><div class="color-pick" role="radiogroup" aria-label="${ esc( t( 'cColor' ) ) }">${ CAT_COLORS.map( ( c ) => `<button type="button" class="cpick tint-${ c }${ catSel.color === c ? ' on' : '' }" data-cat-color="${ c }" role="radio" aria-checked="${ catSel.color === c }" aria-label="${ c }"><i></i></button>` ).join( '' ) }</div>`;
	EXA.openCat = () => {
		catSel = { icon: 'tag', color: 'teal' };
		UI.openSheet( `${ head( t( 'catAdd' ) ) }<form id="catForm" novalidate class="sheet-pad"><div class="cat-prev" id="catPrev">${ UI.ci( catSel.icon, catSel.color, 56 ) }</div>
			<label class="f"><span>${ esc( t( 'cName' ) ) }</span><input name="name" required maxlength="30" autocomplete="off" autofocus></label>
			<label class="f"><span>${ esc( t( 'cType' ) ) }</span><select name="type"><option value="expense">${ esc( t( 'typeExpense' ) ) }</option><option value="income">${ esc( t( 'typeIncome' ) ) }</option></select></label>
			<div id="catPick">${ catPicker() }</div>
			<p class="err" id="catErr" role="alert" hidden></p><div class="btn-row"><button type="submit" class="btn btn-primary wide">${ esc( t( 'saveTx' ) ) }</button></div></form>`, { cls: 'small' } );
	};
	EXA.catSubmit = () => {
		const f = $( '#catForm' ).elements, name = f.name.value.trim();
		if ( ! name ) { const e = $( '#catErr' ); e.textContent = t( 'errNameReq' ); e.hidden = false; return; }
		S().categories.push( { id: uid(), name, iconName: catSel.icon, color: catSel.color, type: f.type.value } );
		UI.closeSheet(); EX.save(); toast( t( 'tCatSaved' ) );
	};

	/* ------------------------------------------------------------------ Sign in, create account, recover, recovery codes */

	let authBusy = false;
	EXA.openAuth = ( mode = 'start' ) => {
		let h;
		if ( ! EX.auth.supported() ) h = `${ head( t( 'authTitle' ) ) }<div class="sheet-pad"><p class="err">${ esc( t( 'err_unsupported' ) ) }</p></div>`;
		else if ( mode === 'recover' ) {
			h = `${ head( t( 'recoverTitle' ) ) }<div class="sheet-pad"><p class="muted">${ esc( t( 'recoverText' ) ) }</p><form id="recoverForm" novalidate><label class="f"><span>${ esc( t( 'authEmail' ) ) }</span><input name="email" type="email" autocomplete="email" required autofocus></label><label class="f"><span>${ esc( t( 'recoverCode' ) ) }</span><input name="code" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX" required></label><p class="err" id="authErr" role="alert" hidden></p><div class="btn-row stack"><button type="submit" class="btn btn-primary">${ esc( t( 'recoverBtn' ) ) }</button><button type="button" class="btn btn-ghost" data-act="auth-back">${ esc( t( 'authBack' ) ) }</button></div></form></div>`;
		} else {
			h = `${ head( t( 'authTitle' ) ) }<div class="sheet-pad"><div class="auth-hero">${ UI.ci( 'key', 'teal', 64 ) }</div><p class="muted center">${ esc( t( 'authPasskeyHelp' ) ) }</p><div class="btn-row stack"><button type="button" class="btn btn-primary" id="authLogin">${ UI.icon( 'key', 22 ) } ${ esc( t( 'authSignIn' ) ) }</button></div><p class="or"><span>${ esc( t( 'authOr' ) ) }</span></p>
				<form id="registerForm" novalidate><label class="f"><span>${ esc( t( 'authEmail' ) ) }</span><input name="email" type="email" autocomplete="email" required></label><p class="muted small">${ esc( t( 'authEmailHelp' ) ) }</p><p class="err" id="authErr" role="alert" hidden></p><div class="btn-row stack"><button type="submit" class="btn btn-ghost">${ esc( t( 'authCreate' ) ) }</button></div></form>
				<p class="center"><button type="button" class="link small" data-act="auth-recover">${ esc( t( 'authLost' ) ) }</button></p></div>`;
		}
		UI.openSheet( h, { cls: 'small' } );
	};
	const authError = ( code ) => { const e = $( '#authErr' ); if ( e ) { e.textContent = errText( code ); e.hidden = false; } else toast( errText( code ) ); };
	async function withBusy( fn ) {
		if ( authBusy ) return;
		authBusy = true;
		const btns = $$( '.sheet-body button' );
		btns.forEach( ( b ) => { b.disabled = true; } );
		// Only the buttons that were on screen when it started come back; a sheet opened meanwhile (the recovery codes) keeps its own state.
		try { await fn(); } finally { authBusy = false; btns.forEach( ( b ) => { if ( b.isConnected ) b.disabled = false; } ); }
	}
	EXA.authLogin = () => withBusy( async () => {
		const r = await EX.auth.login();
		if ( r.error ) return authError( r.error );
		UI.closeSheet(); toast( t( 'tSignedIn' ) ); EXA.render();
	} );
	EXA.authSubmit = ( f ) => {
		if ( f.id === 'registerForm' ) withBusy( async () => {
			const r = await EX.auth.register( f.elements.email.value.trim() );
			if ( r.error ) return authError( r.error );
			toast( t( 'tAccountCreated' ) ); EXA.render();
			EXA.showCodes( r.recoveryCodes, () => EXA.render() );
		} );
		else if ( f.id === 'recoverForm' ) withBusy( async () => {
			const r = await EX.auth.recover( f.elements.email.value.trim(), f.elements.code.value.trim() );
			if ( r.error ) return authError( r.error );
			UI.closeSheet(); toast( t( 'tRecovered' ) ); EXA.render();
		} );
	};
	EXA.showCodes = ( codes, then ) => {
		UI.openSheet( `${ head( t( 'codesTitle' ) ).replace( X, '' ) }<div class="sheet-pad"><p class="muted">${ esc( t( 'codesText' ) ) }</p><ol class="codes">${ codes.map( ( c ) => `<li><code>${ esc( c ) }</code></li>` ).join( '' ) }</ol>
			<div class="btn-row"><button type="button" class="btn btn-ghost" id="codesCopy">${ UI.icon( 'copy', 20 ) } ${ esc( t( 'codesCopy' ) ) }</button><button type="button" class="btn btn-ghost" id="codesDownload">${ UI.icon( 'download', 20 ) } ${ esc( t( 'codesDownload' ) ) }</button></div>
			<label class="f chk"><input type="checkbox" id="codesSaved"> <span>${ esc( t( 'codesSaved' ) ) }</span></label><div class="btn-row"><button type="button" class="btn btn-primary wide" id="codesDone" disabled>${ esc( t( 'codesDone' ) ) }</button></div></div>`, { lock: true, cls: 'small' } );
		$( '#codesSaved' ).onchange = ( e ) => { $( '#codesDone' ).disabled = ! e.target.checked; };
		$( '#codesCopy' ).onclick = () => { if ( navigator.clipboard ) navigator.clipboard.writeText( codes.join( '\n' ) ).then( () => toast( t( 'codesCopied' ) ) ); };
		$( '#codesDownload' ).onclick = () => EXA.download( 'expenity-recovery-codes.txt', `Expenity recovery codes (${ ( EX.auth.user() || {} ).email || '' })\nEach code works once.\n\n${ codes.join( '\n' ) }\n`, 'text/plain' );
		$( '#codesDone' ).onclick = () => { UI.closeSheet(); if ( then ) then(); };
	};

	/* ------------------------------------------------------------------ Details (sheet on phones, side pane on wide screens) */

	function txDetailHtml( x ) {
		const cur = EX.txCurrency( x );
		const info = x.type === 'transfer' ? { iconName: 'arrows-exchange', color: 'blue', name: t( 'catTransfer' ) } : EX.catInfo( x.category );
		const sign = x.type === 'income' ? '+' : x.type === 'expense' ? '−' : '';
		const rows = [ [ t( 'dDate' ), dayName( x.date ) ], [ t( 'dWallet' ), x.type === 'transfer' ? `${ EXA.walletName( x.account ) } → ${ EXA.walletName( x.toAccount ) }` : EXA.walletName( x.account ) ], x.type === 'transfer' ? null : [ t( 'dCategory' ), info.name ], x.note ? [ t( 'dNote' ), x.note ] : null, x.billId ? [ t( 'dBill' ), ( S().bills.find( ( b ) => b.id === x.billId ) || {} ).name || '' ] : null, x.by && ( EX.account( x.account ) || {} ).space ? [ t( 'dAddedBy' ), EX.spaces.nameOf( x.by, EX.account( x.account ).space ) ] : null ].filter( Boolean );
		return `<div class="detail"><div class="detail-top">${ UI.catCi( info.iconName ? info : EX.catInfo( x.category ), 64 ) }<h3>${ esc( x.name || info.name ) }</h3><div class="big ${ x.type }">${ sign }${ esc( money( Number( x.amount ), cur ) ) }</div></div>
			<p class="entry-receipt" data-entry-status="${esc(x.id)}" role="status">${EXA.entryStatus(x.id)}</p>
			${ EXA.tagsDisplay(x.tags) }${ EXA.photos.button( x.photo ) }<dl class="facts">${ rows.map( ( [ k, v ] ) => `<div><dt>${ esc( k ) }</dt><dd>${ esc( v ) }</dd></div>` ).join( '' ) }</dl>
			<div class="btn-row stack"><button type="button" class="btn btn-ghost" data-duplicate="tx" data-id="${esc(x.id)}">${UI.icon('copy',20)} ${esc(t('duplicateRecord'))}</button><button type="button" class="btn btn-ghost" data-reverse-tx="${esc(x.id)}">${UI.icon('refresh',20)} ${esc(EXA.label(x.billId ? 'unpaid' : x.incomeId ? 'unreceived' : 'reverse'))}</button><button type="button" class="btn btn-primary" data-act="edit-tx" data-id="${ esc( x.id ) }">${ UI.icon( 'pencil', 20 ) } ${ esc( t( 'actEdit' ) ) }</button><button type="button" class="btn btn-danger-ghost" data-act="del-tx" data-id="${ esc( x.id ) }">${ UI.icon( 'trash', 20 ) } ${ esc( t( 'actDelete' ) ) }</button></div></div>`;
	}
	function billDetailHtml( b ) {
		const rows = [ [ t( 'dDue' ), `${ EXA.rel( b.next ) } · ${ dayName( b.next ) }` ], [ t( 'dRepeats' ), EX.scheduleLabel(b) ], b.account ? [ t( 'dWallet' ), EXA.walletName( b.account ) ] : null, [ t( 'fRemind' ), t( 'lead' + EXA.lead( b ) ) ], b.reference ? [ t( 'dReference' ), b.reference ] : null, b.notes ? [ t( 'dNote' ), b.notes ] : null, b.by && ( EX.account( b.account ) || {} ).space ? [ t( 'dAddedBy' ), EX.spaces.nameOf( b.by, EX.account( b.account ).space ) ] : null ].filter( Boolean );
		return `<div class="detail"><div class="detail-top">${ UI.catCi( EX.catInfo( b.category ), 64 ) }<h3>${ esc( b.name ) }</h3><div class="big">${ esc( EXA.amountText( b ) ) }</div></div>
			${ EXA.tagsDisplay(b.tags) }${ EXA.photos.button( b.photo ) }<dl class="facts">${ rows.map( ( [ k, v ] ) => `<div><dt>${ esc( k ) }</dt><dd>${ esc( v ) }</dd></div>` ).join( '' ) }</dl>
			<div class="btn-row stack"><button type="button" class="btn btn-primary" data-act="pay-bill" data-id="${ esc( b.id ) }">${ UI.icon( 'check', 20 ) } ${ esc( b.autopay ? t( 'checked' ) : t( 'actPaid' ) ) }</button>
			<div class="btn-row two"><button type="button" class="btn btn-ghost" data-act="snooze1" data-id="${ esc( b.id ) }">${ UI.icon( 'clock-pause', 20 ) } ${ esc( t( 'snooze1' ) ) }</button>${ b.repeat !== 'once' ? `<button type="button" class="btn btn-ghost" data-act="skip" data-id="${ esc( b.id ) }">${ UI.icon( 'player-skip-forward', 20 ) } ${ esc( t( 'skipThis' ) ) }</button>` : '' }</div>
			<div class="btn-row two">${ b.payUrl ? `<a class="btn btn-ghost" href="${ esc( b.payUrl ) }" target="_blank" rel="noopener noreferrer">${ UI.icon( 'link', 20 ) } ${ esc( t( 'openLink' ) ) }</a>` : '' }${ b.reference ? `<button type="button" class="btn btn-ghost" data-act="copyref" data-id="${ esc( b.id ) }">${ UI.icon( 'copy', 20 ) } ${ esc( t( 'copyRef' ) ) }</button>` : '' }</div>
			<button type="button" class="btn btn-ghost" data-duplicate="bill" data-id="${esc(b.id)}">${UI.icon('copy',20)} ${esc(t('duplicateRecord'))}</button><div class="btn-row two"><button type="button" class="btn btn-ghost" data-act="edit-bill" data-id="${ esc( b.id ) }">${ UI.icon( 'pencil', 20 ) } ${ esc( t( 'actEdit' ) ) }</button><button type="button" class="btn btn-danger-ghost" data-act="del-bill" data-id="${ esc( b.id ) }">${ UI.icon( 'trash', 20 ) } ${ esc( t( 'actDelete' ) ) }</button></div></div></div>`;
	}
	EXA.detailHtml = ( sel ) => {
		if ( ! sel ) return '';
		if ( sel.kind === 'tx' ) { const x = S().txs.find( ( z ) => z.id === sel.id ); return x ? txDetailHtml( x ) : ''; }
		const b = S().bills.find( ( z ) => z.id === sel.id );
		return b ? billDetailHtml( b ) : '';
	};
	EXA.openDetail = ( kind, id ) => {
		const sel = { kind, id };
		if ( UI.isWide() ) { EXA.st.sel = sel; EXA.render(); return; }
		const h = EXA.detailHtml( sel );
		if ( h ) UI.openSheet( `${ head( kind === 'tx' ? t( 'tabActivity' ) : t( 'tabBills' ) ) }<div class="sheet-pad">${ h }</div>`, { cls: 'small' } );
	};
}() );
