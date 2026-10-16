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
		const nx = EX.nextAfter( b, b.next );
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
		const tile = ( act, icon, color, label, sub ) => `<button type="button" class="tile-btn tint-${ color }" data-act="${ act }">${ UI.icon( icon, 30 ) }<b>${ esc( label ) }</b><small>${ esc( sub ) }</small></button>`;
		UI.openSheet( `${ head( t( 'addShort' ) ) }<div class="sheet-pad"><div class="tiles-grid">${ tile( 'tx-expense', 'arrow-up-right', 'red', t( 'typeExpense' ), t( 'tileExpenseSub' ) ) }${ tile( 'tx-income', 'arrow-down-left', 'green', t( 'typeIncome' ), t( 'tileIncomeSub' ) ) }${ tile( 'tx-transfer', 'arrows-exchange', 'blue', t( 'typeTransfer' ), t( 'tileTransferSub' ) ) }${ tile( 'add-bill', 'calendar-event', 'amber', t( 'tileBill' ), t( 'tileBillSub' ) ) }</div></div>`, { cls: 'small' } );
	};

	/* ------------------------------------------------------------------ Transaction sheet: amount first, big keypad */

	let T = null; // the transaction being entered
	EXA.txOpen = () => !! T && UI.sheetOpen();
	const decimalMark = () => ( EX.lang() === 'el' ? ',' : '.' );
	const curSymbol = ( cur ) => { try { return ( new Intl.NumberFormat( EX.loc(), { style: 'currency', currency: cur } ).formatToParts( 0 ).find( ( p ) => p.type === 'currency' ) || {} ).value || cur; } catch ( e ) { return cur; } };
	const showAmt = ( s ) => ( s === '' ? '0' : s.replace( '.', decimalMark() ) );
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

	function txBody() {
		const wallets = EX.writableAccounts().concat( S().accounts.filter( ( a ) => ( a.archived || EX.role( a ) === 'viewer' ) && ( a.id === T.account || a.id === T.toAccount ) ) );
		const type = T.type, cur = walletCur( T.account ), toCur = walletCur( T.toAccount );
		const cross = type === 'transfer' && T.toAccount && cur !== toCur;
		const typeBtn = ( v, label ) => `<button type="button" class="${ type === v ? 'on' : '' }" data-tx-type="${ v }" role="tab" aria-selected="${ type === v }">${ esc( label ) }</button>`;
		const wchip = ( a, sel, attr ) => `<button type="button" class="chip big${ sel === a.id ? ' on' : '' }" ${ attr }="${ esc( a.id ) }">${ UI.walletCi( a, 26 ) } ${ esc( EX.accountName( a ) ) }</button>`;
		const cats = EX.catList( type === 'income' ? 'income' : 'expense' );
		const dm = T.dateMode;
		return `<div class="sheet-head">${ X }<div class="segm tx-seg" role="tablist" aria-label="${ esc( t( 'addTx' ) ) }">${ typeBtn( 'expense', t( 'typeExpense' ) ) }${ typeBtn( 'income', t( 'typeIncome' ) ) }${ typeBtn( 'transfer', t( 'typeTransfer' ) ) }</div><button type="button" class="ab-btn ok" data-tx="save" aria-label="${ esc( t( 'saveTx' ) ) }">${ UI.icon( 'check', 26 ) }</button></div>
			<div class="tx-scroll"><div class="tx-main">
				<button type="button" class="amt-display${ T.keypadOpen && T.target === 'amount' ? ' on' : '' }" data-tx="target-amount" aria-controls="txKeypad" aria-expanded="${ !! T.keypadOpen && T.target === 'amount' }" aria-label="${ esc( t( 'fAmount' ) ) }"><span class="cur">${ esc( curSymbol( cur ) ) }</span><span class="val ${ T.amount === '' ? 'zero' : '' }" id="amtVal">${ esc( showAmt( T.amount ) ) }</span></button>
				${ cross ? `<button type="button" class="amt-display small${ T.keypadOpen && T.target === 'toAmount' ? ' on' : '' }" data-tx="target-to" aria-controls="txKeypad" aria-expanded="${ !! T.keypadOpen && T.target === 'toAmount' }" aria-label="${ esc( t( 'fToAmount' ) ) }"><small>${ esc( t( 'received' ) ) }</small><span class="cur">${ esc( curSymbol( toCur ) ) }</span><span class="val ${ T.toAmount === '' ? 'zero' : '' }" id="toAmtVal">${ esc( showAmt( T.toAmount ) ) }</span></button>` : '' }
				<input class="desc" id="txDesc" name="desc" maxlength="80" autocomplete="off" autocorrect="off" data-1p-ignore data-lpignore="true" placeholder="${ esc( t( 'descPh' ) ) }" aria-label="${ esc( t( 'fWhat' ) ) }" value="${ esc( T.name ) }">
				${ T.type !== 'transfer' ? `<label class="remember-name"><input type="checkbox" id="rememberName"${ T.rememberName ? ' checked' : '' }> ${ esc(t('rememberName')) }</label>${ EX.savedNames(T.type).length ? `<details class="saved-names"><summary>${ UI.icon('bookmark',18) } ${ esc(t('savedNames')) } (${ EX.savedNames(T.type).length }) ${ UI.icon('chevron-down',16) }</summary><div class="saved-name-grid">${ EX.savedNames(T.type).map((x,i)=>`<span><button type="button" class="chip" data-tx-saved="${i}">${esc(x.name)}</button><button type="button" class="ab-btn" data-tx-forget="${i}" aria-label="${esc(t('forgetName'))}: ${esc(x.name)}">${UI.icon('x',18)}</button></span>`).join('') }</div></details>` : '' }` : '' }

				${ T.editId ? '' : `<div class="quickline">${ T.quick ? `<input id="txQuick" type="text" autocomplete="off" spellcheck="false" placeholder="${ esc( t( 'quickTxPh' ) ) }" aria-label="${ esc( t( 'quickLabel' ) ) }" value="${ esc( T.quickText || '' ) }">` : `<button type="button" class="link small" data-tx="quick">${ esc( t( 'typeIt' ) ) }</button>` }</div>` }
			</div>
			${ type === 'transfer' ? `<div class="lbl">${ esc( t( 'fromWallet' ) ) }</div><div class="chip-scroll">${ wallets.map( ( a ) => wchip( a, T.account, 'data-tx-wallet' ) ).join( '' ) }</div><div class="lbl">${ esc( t( 'toWallet' ) ) }</div><div class="chip-scroll">${ wallets.filter( ( a ) => a.id !== T.account && EX.sameScope( a, EX.account( T.account ) ) ).map( ( a ) => wchip( a, T.toAccount, 'data-tx-to' ) ).join( '' ) }</div>`
				: `<div class="cats" role="group" aria-label="${ esc( t( 'fCategory' ) ) }">${ catGrid( cats, T.category, 'data-tx-cat', T.catsOpen, 'data-tx-catsmore' ) }</div><div class="lbl">${ esc( t( 'fWallet' ) ) }</div><div class="chip-scroll">${ wallets.map( ( a ) => wchip( a, T.account, 'data-tx-wallet' ) ).join( '' ) }</div>` }
			<div class="chip-scroll dates"><button type="button" class="chip${ dm === 'today' ? ' on' : '' }" data-tx-date="today">${ esc( t( 'relToday' ) ) }</button><button type="button" class="chip${ dm === 'yesterday' ? ' on' : '' }" data-tx-date="yesterday">${ esc( t( 'relYesterday' ) ) }</button><button type="button" class="chip${ dm === 'other' ? ' on' : '' }" data-tx-date="other">${ UI.icon( 'calendar', 18 ) } ${ dm === 'other' ? esc( dayName( T.date ) ) : esc( t( 'pickDate' ) ) }</button><button type="button" class="chip${ T.note || T.noteOpen ? ' on' : '' }" data-tx="note">${ UI.icon( 'notes', 18 ) } ${ esc( t( 'addNote' ) ) }</button></div>
			${ dm === 'other' ? `<div class="sheet-pad tight"><input type="date" id="txDate" value="${ esc( T.date ) }" aria-label="${ esc( t( 'fDate' ) ) }"></div>` : '' }
			${ EXA.photos.slot( T.photo ) }
			${ T.noteOpen || T.note ? `<div class="sheet-pad tight"><textarea id="txNote" rows="2" maxlength="400" placeholder="${ esc( t( 'notePh' ) ) }" aria-label="${ esc( t( 'fNote' ) ) }">${ esc( T.note ) }</textarea></div>` : '' }
			<p class="err sheet-pad tight" id="txErr" role="alert" hidden></p>
			</div><div class="tx-field-actions"${ T.editingField ? '' : ' hidden' }><button type="button" class="btn btn-primary" data-tx="field-done">${ UI.icon( 'check', 20 ) } ${ esc( t( 'entryDone' ) ) }</button></div><div id="txKeypad" class="keypad"${ T.keypadOpen ? '' : ' hidden' } role="group" aria-label="${ esc( t( 'fAmount' ) ) }"><div class="keypad-head"><span>${ esc( t( T.target === 'toAmount' ? 'fToAmount' : 'fAmount' ) ) }</span><button type="button" class="btn btn-primary" data-tx="amount-done">${ UI.icon( 'check', 20 ) } ${ esc( t( 'entryDone' ) ) }</button></div>${ [ '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '<' ].map( ( k ) => `<button type="button" class="key" data-key="${ k }" aria-label="${ k === '<' ? esc( t( 'del' ) ) : k === '.' ? esc( decimalMark() ) : k }">${ k === '<' ? UI.icon( 'backspace', 26 ) : k === '.' ? esc( decimalMark() ) : k }</button>` ).join( '' ) }</div>`;
	}
	function readTxFields() {
		const d = $( '#txDesc' ); if ( d ) T.name = d.value;
		const remember = $('#rememberName'); if(remember) T.rememberName = remember.checked;
		const ph = $( '.photo-slot' ); if ( ph ) T.photo = EXA.photos.value( ph );
		const n = $( '#txNote' ); if ( n ) T.note = n.value;
		const q = $( '#txQuick' ); if ( q ) T.quickText = q.value;
		const dt = $( '#txDate' ); if ( dt && dt.value ) T.date = dt.value;
	}
	function drawTx( keepScroll, read = true ) {
		if(read) readTxFields();
		const sc = $( '.tx-scroll' ), top = sc ? sc.scrollTop : 0;
		$( '.sheet-body' ).innerHTML = txBody();
		const nsc = $( '.tx-scroll' ); if ( keepScroll && nsc ) nsc.scrollTop = top;
	}
	EXA.openTx = ( tx, preset = {} ) => {
		EX.ensureWallet();
		const base = { type: 'expense', date: today(), account: ( EX.writableAccounts()[ 0 ] || {} ).id, amount: '', toAmount: '', name: '', note: '', category: null };
		const v = Object.assign( base, tx || preset );
		T = { type: v.type, amount: v.amount || '', toAmount: v.toAmount || '', account: v.account, toAccount: v.toAccount || '', category: v.category || null, date: v.date, name: v.name || '', note: v.note || '', photo: v.photo || '', editId: tx ? tx.id : null, target: 'amount', keypadOpen: false, editingField: false, rememberName: false, quick: false, quickText: '', noteOpen: false };
		T.dateMode = T.date === today() ? 'today' : T.date === addDays( today(), -1 ) ? 'yesterday' : 'other';
		if ( T.type !== 'transfer' && ! T.category ) T.category = ( EX.catList( T.type === 'income' ? 'income' : 'expense' )[ 0 ] || {} ).key;
		if ( T.type === 'transfer' && ! T.toAccount ) T.toAccount = ( EX.peerAccount( T.account ) || {} ).id || '';
		UI.openSheet( txBody(), { full: true, cls: 'tx', onClose: () => { T = null; } } );
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
		if ( ! T || ! [ 'txDesc', 'txQuick', 'txNote', 'txDate' ].includes( e.target.id ) ) return;
		T.keypadOpen = false; T.editingField = true;
		$( '#txKeypad' ).hidden = true;
		$( '.tx-field-actions' ).hidden = false;
		$$( '.amt-display' ).forEach( b => { b.classList.remove( 'on' ); b.setAttribute( 'aria-expanded', 'false' ); } );
	} );

	EXA.txKey = pressKey;
	function onTxQuick() {
		const q = $( '#txQuick' ); if ( ! q ) return;
		T.quickText = q.value;
		if ( ! q.value.trim() ) return;
		const p = EX.parseQuick( q.value, { past: true } );
		if ( p.type && T.type !== 'transfer' ) { T.type = p.type; }
		if ( p.name ) T.name = p.name;
		if ( p.amount ) T.amount = p.amount;
		if ( p.date ) { T.date = p.date; T.dateMode = p.date === today() ? 'today' : p.date === addDays( today(), -1 ) ? 'yesterday' : 'other'; }
		if ( T.type !== 'transfer' ) { const c = guessCategory( p.name, T.type ); const list = EX.catList( T.type === 'income' ? 'income' : 'expense' ).map( ( x ) => x.key ); T.category = c && list.includes( c ) ? c : ( list.includes( T.category ) ? T.category : list[ 0 ] ); }
		const hadFocus = document.activeElement && document.activeElement.id === 'txQuick';
		drawTx( true );
		if ( hadFocus ) { const n = $( '#txQuick' ); n.focus(); n.setSelectionRange( n.value.length, n.value.length ); }
	}
	function saveTx() {
		if ( EXA.photos.busy ) { toast( t( 'photoWorking' ) ); return; }
		readTxFields();
		const err = ( k ) => { const e = $( '#txErr' ); e.textContent = t( k ); e.hidden = false; };
		const amount = T.amount.replace( /\.$/, '' );
		if ( ! amount || EX.cents( amount ) <= 0 ) return err( 'errAmountReq' );
		if ( ! T.date ) return err( 'errDate' );
		if ( ! T.account ) return err( 'errWallet' );
		const tx = { type: T.type, amount, account: T.account, date: T.date, name: T.name.trim(), note: T.note.trim(), photo: T.photo || '' };
		if ( T.type === 'transfer' ) {
			if ( ! T.toAccount || T.toAccount === T.account ) return err( 'errTransferSame' );
			if ( ! EX.sameScope( EX.account( T.account ), EX.account( T.toAccount ) ) ) return err( 'errTransferSpace' );
			tx.toAccount = T.toAccount;
			if ( walletCur( T.account ) !== walletCur( T.toAccount ) ) {
				const ta = T.toAmount.replace( /\.$/, '' );
				if ( ! ta || EX.cents( ta ) <= 0 ) return err( 'errToAmount' );
				tx.toAmount = ta;
			}
		} else tx.category = T.category;
		if(T.rememberName)EX.rememberName(T.type,tx.name,tx.category);
		const editing = T.editId ? S().txs.find( ( x ) => x.id === T.editId ) : null;
		if ( editing ) {
			const keep = { id: editing.id, u: editing.u, billId: editing.billId, due: editing.due };
			Object.keys( editing ).forEach( ( k ) => { delete editing[ k ]; } );
			Object.assign( editing, tx, keep );
			Object.keys( editing ).forEach( ( k ) => { if ( editing[ k ] === undefined ) delete editing[ k ]; } );
			toast( t( 'tSaved' ) );
		} else {
			S().txs.push( Object.assign( { id: uid() }, tx ) );
			toast( t( 'tTxAdded', { name: tx.name || ( T.type === 'transfer' ? t( 'catTransfer' ) : EX.catInfo( tx.category ).name ) } ) );
		}
		UI.haptic( 20 );
		UI.closeSheet();
		EX.save();
	}
	/** Clicks and typing inside the transaction sheet. Returns true if it handled the event. */
	EXA.txClick = ( e ) => {
		if ( ! T ) return false;
		const g = ( sel ) => e.target.closest( sel );
		let el;
		if((el=g('[data-tx-saved]'))){readTxFields();const x=EX.savedNames(T.type)[Number(el.dataset.txSaved)];if(x){T.name=x.name;if(EX.catList(T.type).some(c=>c.key===x.category))T.category=x.category;drawTx(true,false);}return true;}
		if((el=g('[data-tx-forget]'))){readTxFields();const x=EX.savedNames(T.type)[Number(el.dataset.txForget)];if(x){S().settings.savedNames=(S().settings.savedNames||[]).filter(n=>n!==x);EX.save();drawTx(true);}return true;}
		if ( ( el = g( '[data-key]' ) ) ) { pressKey( el.dataset.key ); return true; }
		if ( ( el = g( '[data-tx-type]' ) ) ) {
			readTxFields();
			T.type = el.dataset.txType;
			if ( T.type === 'transfer' ) { if ( ! T.toAccount || T.toAccount === T.account ) T.toAccount = ( EX.peerAccount( T.account ) || {} ).id || ''; }
			else { const list = EX.catList( T.type === 'income' ? 'income' : 'expense' ).map( ( x ) => x.key ); if ( ! list.includes( T.category ) ) T.category = list[ 0 ]; }
			T.target = 'amount'; drawTx( true ); return true;
		}
		if ( g( '[data-tx-catsmore]' ) ) { readTxFields(); T.catsOpen = ! T.catsOpen; drawTx( true ); return true; }
		if ( ( el = g( '[data-tx-cat]' ) ) ) { T.category = el.dataset.txCat; readTxFields(); $$( '.catchip' ).forEach( ( b ) => b.classList.toggle( 'on', b === el ) ); return true; }
		if ( ( el = g( '[data-tx-wallet]' ) ) ) { readTxFields(); T.account = el.dataset.txWallet; if ( T.toAccount === T.account ) T.toAccount = ( EX.peerAccount( T.account ) || {} ).id || ''; drawTx( true ); return true; }
		if ( ( el = g( '[data-tx-to]' ) ) ) { readTxFields(); T.toAccount = el.dataset.txTo; drawTx( true ); return true; }
		if ( ( el = g( '[data-tx-date]' ) ) ) {
			readTxFields();
			const m = el.dataset.txDate;
			T.dateMode = m;
			if ( m === 'today' ) T.date = today(); else if ( m === 'yesterday' ) T.date = addDays( today(), -1 );
			drawTx( true );
			if ( m === 'other' ) { const d = $( '#txDate' ); if ( d ) { d.focus(); if ( d.showPicker ) { try { d.showPicker(); } catch ( err ) { /* needs a gesture */ } } } }
			return true;
		}
		if ( ( el = g( '[data-tx]' ) ) ) {
			const a = el.dataset.tx;
			if ( a === 'save' ) saveTx();
			else if ( a === 'target-amount' ) setKeypad( true, 'amount' );
			else if ( a === 'target-to' ) setKeypad( true, 'toAmount' );
			else if ( a === 'amount-done' ) setKeypad( false );
			else if ( a === 'field-done' ) finishField();
			else if ( a === 'quick' ) { T.quick = true; drawTx( true ); const q = $( '#txQuick' ); if ( q ) q.focus(); }
			else if ( a === 'note' ) { readTxFields(); T.noteOpen = ! T.noteOpen; drawTx( true ); if ( T.noteOpen ) { const n = $( '#txNote' ); if ( n ) n.focus(); } }
			return true;
		}
		return false;
	};
	EXA.txInput = ( e ) => { if ( T && e.target.id === 'txQuick' ) { onTxQuick(); return true; } return false; };
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
		return shown.map( tile ).join( '' ) + `<button type="button" class="catchip more" ${ moreAttr }>${ UI.ci( open ? 'chevron-up' : 'chevron-down', 'gray', 40 ) }<span>${ esc( t( open ? 'catsLess' : 'catsMore', { n: cats.length - CAT_SHOW } ) ) }</span></button>`;
	};
	let billCatsOpen = false;
	const catChips = ( selected ) => catGrid( EX.catList( 'expense' ), selected, 'data-bill-cat', billCatsOpen, 'data-bill-catsmore' );
	EXA.openBill = ( bill, prefill ) => {
		EX.ensureWallet();
		editingBill = bill || null; quickDay = null;
		const v = bill ? Object.assign( {}, bill ) : Object.assign( { currency: S().settings.currency, repeat: 'monthly', category: 'other', lead: null, next: addDays( today(), 7 ), amount: '', name: '', account: '' }, prefill || {} );
		const wallets = EX.writableAccounts();
		UI.openSheet( `${ head( t( bill ? 'editTitle' : 'addTitle' ) ) }<form id="billForm" novalidate class="sheet-pad">
			${ bill ? '' : `<div class="quick"><label for="quick">${ esc( t( 'quickLabel' ) ) }</label><input id="quick" type="text" autocomplete="off" placeholder="${ esc( t( 'quickPh' ) ) }" spellcheck="false"><div class="chips-out" id="chips" aria-live="polite"></div><div class="chip-scroll" id="tpls">${ EX.TEMPLATES.map( ( x, i ) => `<button type="button" class="chip" data-tpl="${ i }">${ UI.icon( EX.CAT_STYLE[ x[ 1 ] ][ 0 ], 18 ) } ${ esc( t( x[ 0 ] ) ) }</button>` ).join( '' ) }</div></div>` }
			<label class="f"><span>${ esc( t( 'fName' ) ) }</span><input name="name" required maxlength="80" autocomplete="off" value="${ esc( v.name ) }"></label>
			<label class="f"><span>${ esc( t( 'fPayFrom' ) ) }</span><select name="account">${ wallets.map( ( a ) => `<option value="${ esc( a.id ) }"${ ( v.account || ( wallets[ 0 ] || {} ).id ) === a.id ? ' selected' : '' }>${ esc( EX.accountName( a ) ) } (${ esc( a.currency ) })</option>` ).join( '' ) }</select></label>
			<label class="f"><span>${ esc( t( 'fAmount' ) ) }</span><input name="amount" inputmode="decimal" placeholder="0.00" autocomplete="off" value="${ esc( v.amount ) }"></label>
			<div class="grid2"><label class="f"><span>${ esc( t( 'fNext' ) ) }</span><input name="next" type="date" required value="${ esc( v.next || '' ) }"></label>
			<label class="f"><span>${ esc( t( 'fRepeats' ) ) }</span><select name="repeat">${ EX.REPEATS.map( ( r ) => `<option value="${ r }"${ v.repeat === r ? ' selected' : '' }>${ esc( t( 'r' + r.charAt( 0 ).toUpperCase() + r.slice( 1 ) ) ) }</option>` ).join( '' ) }</select></label></div>
			<div class="lbl">${ esc( t( 'fCategory' ) ) }</div><div class="cats" id="billCats">${ catChips( v.category ) }</div><input type="hidden" name="category" value="${ esc( v.category ) }">
			<div><label class="f"><span>${ esc( t( 'fRemind' ) ) }</span><select name="lead"><option value="">${ esc( t( 'leadDefault' ) ) }</option>${ EX.LEADS.map( ( x ) => `<option value="${ x }"${ v.lead === x ? ' selected' : '' }>${ esc( t( 'lead' + x ) ) }</option>` ).join( '' ) }</select></label>
</div>
			<label class="f chk"><input type="checkbox" name="variable"${ v.variable ? ' checked' : '' }> <span>${ esc( t( 'fVariable' ) ) }</span></label>
			<label class="f chk"><input type="checkbox" name="autopay"${ v.autopay ? ' checked' : '' }> <span>${ esc( t( 'fAutopay' ) ) }</span></label>
			<details class="more-opts"><summary>${ esc( t( 'tabMore' ) ) }</summary>
			<label class="f"><span>${ esc( t( 'fEnd' ) ) }</span><input name="end" type="date" value="${ esc( v.end || '' ) }"></label>
			<label class="f"><span>${ esc( t( 'fRef' ) ) }</span><input name="reference" maxlength="80" autocomplete="off" placeholder="${ esc( t( 'fRefPh' ) ) }" value="${ esc( v.reference || '' ) }"></label>
			<label class="f"><span>${ esc( t( 'fUrl' ) ) }</span><input name="payUrl" type="url" placeholder="https://" autocomplete="off" value="${ esc( v.payUrl || '' ) }"></label>
			<label class="f"><span>${ esc( t( 'fNotes' ) ) }</span><textarea name="notes" rows="2" maxlength="400">${ esc( v.notes || '' ) }</textarea></label></details>
			${ EXA.photos.slot( v.photo ) }<p class="err" id="formErr" role="alert" hidden></p>
			<div class="btn-row sticky-actions">${ bill ? `<button type="button" class="btn btn-danger" id="delBtn">${ esc( t( 'del' ) ) }</button>` : '' }<span class="sp"></span><button type="submit" class="btn btn-primary" id="saveBtn">${ esc( t( 'saveBill' ) ) }</button></div></form>`, { tall: true, cls: 'billsheet' } );
		if ( ! bill && matchMedia( '(min-width: 600px) and (pointer: fine)' ).matches ) $( '#quick' ).focus();
	};
	EXA.billClick = ( e ) => {
		const f = $( '#billForm' ); if ( ! f ) return false;
		let el;
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
		const cur = wallet ? wallet.currency : S().settings.currency;
		const end = g( 'end' ).value;
		if ( end && end < next ) return err( t( 'errEnd' ) );
		const payUrl = g( 'payUrl' ).value.trim();
		if ( payUrl && ! /^https?:\/\//i.test( payUrl ) ) return err( t( 'errUrl' ) );
		const b = { name, amount: amountRaw, currency: cur, next, repeat: g( 'repeat' ).value, category: g( 'category' ).value || 'other', end: end || '', account: g( 'account' ).value || '',
			lead: g( 'lead' ).value === '' ? null : Number( g( 'lead' ).value ), variable: g( 'variable' ).checked, autopay: g( 'autopay' ).checked, reference: g( 'reference' ).value.trim(), payUrl, notes: g( 'notes' ).value.trim(), photo: g( 'photo' ).value };
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
			<label class="f chk"><input type="checkbox" name="archived"${ v.archived ? ' checked' : '' }> <span>${ esc( t( 'wArchived' ) ) }</span></label>
			${ a ? EXA.shareRow( a ) : '' }
			${ EXA.photos.slot( v.photo ) }<p class="err" id="walletErr" role="alert" hidden></p>
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
		const v = { name, type: f.type.value, currency: cur, opening, archived: f.archived.checked, photo: f.photo.value };
		if ( editingWallet ) { Object.assign( editingWallet, v ); delete editingWallet.auto; } else S().accounts.push( Object.assign( { id: uid() }, v ) );
		EX.repairCurrencies();
		UI.closeSheet(); EX.save(); toast( t( 'tWalletSaved' ) );
	};
	const CAT_ICONS = ['tag', 'shopping-cart', 'shopping-bag', 'home', 'car', 'bus', 'bike', 'gas-station', 'coffee', 'pizza', 'glass-full', 'heartbeat', 'pill', 'first-aid-kit', 'school', 'book', 'gift', 'plane', 'briefcase', 'heart', 'users', 'paw', 'baby-carriage', 'device-gamepad-2', 'ball-football', 'barbell', 'music', 'movie', 'shirt', 'scissors', 'tools', 'phone', 'wifi', 'bulb', 'droplet', 'flame', 'tree', 'building-store', 'receipt', 'pig-money'];
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
			${ EXA.photos.button( x.photo ) }<dl class="facts">${ rows.map( ( [ k, v ] ) => `<div><dt>${ esc( k ) }</dt><dd>${ esc( v ) }</dd></div>` ).join( '' ) }</dl>
			<div class="btn-row stack"><button type="button" class="btn btn-primary" data-act="edit-tx" data-id="${ esc( x.id ) }">${ UI.icon( 'pencil', 20 ) } ${ esc( t( 'actEdit' ) ) }</button><button type="button" class="btn btn-danger-ghost" data-act="del-tx" data-id="${ esc( x.id ) }">${ UI.icon( 'trash', 20 ) } ${ esc( t( 'actDelete' ) ) }</button></div></div>`;
	}
	function billDetailHtml( b ) {
		const rows = [ [ t( 'dDue' ), `${ EXA.rel( b.next ) } · ${ dayName( b.next ) }` ], [ t( 'dRepeats' ), EX.repeatLabel( b.repeat ) ], b.account ? [ t( 'dWallet' ), EXA.walletName( b.account ) ] : null, [ t( 'fRemind' ), t( 'lead' + EXA.lead( b ) ) ], b.reference ? [ t( 'dReference' ), b.reference ] : null, b.notes ? [ t( 'dNote' ), b.notes ] : null, b.by && ( EX.account( b.account ) || {} ).space ? [ t( 'dAddedBy' ), EX.spaces.nameOf( b.by, EX.account( b.account ).space ) ] : null ].filter( Boolean );
		return `<div class="detail"><div class="detail-top">${ UI.catCi( EX.catInfo( b.category ), 64 ) }<h3>${ esc( b.name ) }</h3><div class="big">${ esc( EXA.amountText( b ) ) }</div></div>
			${ EXA.photos.button( b.photo ) }<dl class="facts">${ rows.map( ( [ k, v ] ) => `<div><dt>${ esc( k ) }</dt><dd>${ esc( v ) }</dd></div>` ).join( '' ) }</dl>
			<div class="btn-row stack"><button type="button" class="btn btn-primary" data-act="pay-bill" data-id="${ esc( b.id ) }">${ UI.icon( 'check', 20 ) } ${ esc( b.autopay ? t( 'checked' ) : t( 'actPaid' ) ) }</button>
			<div class="btn-row two"><button type="button" class="btn btn-ghost" data-act="snooze1" data-id="${ esc( b.id ) }">${ UI.icon( 'clock-pause', 20 ) } ${ esc( t( 'snooze1' ) ) }</button>${ b.repeat !== 'once' ? `<button type="button" class="btn btn-ghost" data-act="skip" data-id="${ esc( b.id ) }">${ UI.icon( 'player-skip-forward', 20 ) } ${ esc( t( 'skipThis' ) ) }</button>` : '' }</div>
			<div class="btn-row two">${ b.payUrl ? `<a class="btn btn-ghost" href="${ esc( b.payUrl ) }" target="_blank" rel="noopener noreferrer">${ UI.icon( 'link', 20 ) } ${ esc( t( 'openLink' ) ) }</a>` : '' }${ b.reference ? `<button type="button" class="btn btn-ghost" data-act="copyref" data-id="${ esc( b.id ) }">${ UI.icon( 'copy', 20 ) } ${ esc( t( 'copyRef' ) ) }</button>` : '' }</div>
			<div class="btn-row two"><button type="button" class="btn btn-ghost" data-act="edit-bill" data-id="${ esc( b.id ) }">${ UI.icon( 'pencil', 20 ) } ${ esc( t( 'actEdit' ) ) }</button><button type="button" class="btn btn-danger-ghost" data-act="del-bill" data-id="${ esc( b.id ) }">${ UI.icon( 'trash', 20 ) } ${ esc( t( 'actDelete' ) ) }</button></div></div></div>`;
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
