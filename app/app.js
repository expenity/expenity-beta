/**
 * Expenity app: starts everything, draws the shell, routes clicks and swipes, and holds the first-run flow, the install
 * prompt, notifications, the calendar file and backups. Data and language: core.js. Accounts and sync: sync.js.
 * Sheets and forms: forms.js. Screens: views.js. Helpers: ui.js.
 */
( function () {
	'use strict';
	const EX = window.EX, UI = window.UI, EXA = window.EXA;
	const { t, esc, money, today, addDays, diffDays } = EX;
	const S = EX.state;
	const st = EXA.st;
	const $ = ( s, r = document ) => r.querySelector( s );
	const $$ = ( s, r = document ) => [ ...r.querySelectorAll( s ) ];
	const toast = UI.toast;
	window.EXPENITY_VERSION = '0.18.1';

 const seenCharacters=new Set();try{for(const skin of JSON.parse(sessionStorage.getItem('expenity.charactersSeen')||'[]'))seenCharacters.add(skin);}catch(_){}
 const characterSeen=skin=>seenCharacters.has(skin);
 const rememberCharacter=skin=>{seenCharacters.add(skin);try{sessionStorage.setItem('expenity.charactersSeen',JSON.stringify([...seenCharacters]));}catch(_){}};

	/* ------------------------------------------------------------------ Drawing the shell */

	let logoSvg = '';
    let billAttentionUntil=0,billAttentionTimer=0;
	function paneHtml() {
		const h = EXA.detailHtml( st.sel );
		return `<div class="pane-head"><h2>${ esc( t( 'paneTitle' ) ) }</h2></div>${ h || `<div class="empty small">${ UI.ci( 'point', 'gray', 56 ) }<p>${ esc( t( 'paneEmpty' ) ) }</p></div>` }`;
	}
	function render() {
        EXA.applyCustomTheme?.();
        if(st.characterSkin!==EXA.skin()){clearTimeout(st.characterCollapseTimer);st.characterSkin=EXA.skin();st.characterRetreated=characterSeen(EXA.skin());st.characterCollapsed=st.characterRetreated;}
		const view = $( '#view' );
		const keep = view.dataset.key === st.view + ':' + st.more ? view.scrollTop : 0;
        if(view.dataset.key!==st.view+':'+st.more){billAttentionUntil=['home','bills'].includes(st.view)?Date.now()+3000:0;}
        clearTimeout(billAttentionTimer);view.classList.toggle('bill-attention',billAttentionUntil>Date.now());
        if(billAttentionUntil>Date.now()){view.style.setProperty('--bill-attention-elapsed',((Date.now()-billAttentionUntil+3000)/-1000)+'s');billAttentionTimer=setTimeout(()=>view.classList.remove('bill-attention'),billAttentionUntil-Date.now());}
		// A redraw (a sync, a change elsewhere) must not steal the field someone is typing in: remember it and put it back.
		const ae = document.activeElement, inView = ae && ae.id && $( '#view' ).contains( ae ) && /^(INPUT|TEXTAREA|SELECT)$/.test( ae.tagName );
		const keep0 = inView ? { id: ae.id, value: ae.value, from: ae.selectionStart, to: ae.selectionEnd } : null;
		const focusId = null, caret = null;
		$( '#appbar' ).innerHTML = EXA.appbar();
		$( '#tabbar' ).innerHTML = EXA.tabbar();
		$( '#rail' ).innerHTML = EXA.rail();
		view.innerHTML = EXA.screen();
		view.dataset.key = st.view + ':' + st.more;
		view.scrollTop = keep;
		$( '#pane' ).innerHTML = paneHtml();
		if ( logoSvg ) $$( '#logo' ).forEach( ( l ) => { l.innerHTML = logoSvg; } );
		if ( keep0 ) { const el = document.getElementById( keep0.id ); if ( el && $( '#view' ).contains( el ) ) { if ( el.tagName !== 'SELECT' && el.value !== keep0.value ) el.value = keep0.value; el.focus(); try { if ( keep0.from != null ) el.setSelectionRange( keep0.from, keep0.to ); } catch ( err ) { /* inputs like date have no caret */ } } }
		document.body.dataset.view = st.view;
		document.documentElement.lang = EX.I18N.langs[ EX.lang() ].htmlLang;
		document.title = '[Beta] ' + t( 'title' );
        if(st.view==='home'){EXA.scanShortcutHint?.();if(['mario','minnie','vader'].includes(EXA.skin())&&!st.characterRetreated&&!EXA.flow.active()&&document.documentElement.dataset.funMotion==='on')rememberCharacter(EXA.skin());}
	}
	EXA.render = render;
	EXA.applyMotion = () => { const m = S().device.motion || 'auto'; if ( m === 'auto' ) delete document.documentElement.dataset.motion; else document.documentElement.dataset.motion = m; try { if ( m === 'auto' ) localStorage.removeItem( 'expenity.motion' ); else localStorage.setItem( 'expenity.motion', m ); } catch ( e ) { /* ignore */ } };
	function go( view, more = 'root' ) {
		if(view==='home'&&st.view!=='home'){clearTimeout(st.characterCollapseTimer);st.characterRetreated=characterSeen(EXA.skin());st.characterCollapsed=st.characterRetreated;}
		if ( view !== st.view ) st.prev = { view: st.view, more: st.more };
		st.view = view; st.more = more; st.sel = null;
		if ( view === 'plan' ) { S().device.goalsDiscovered = true; EX.persist(); }
		if ( view !== 'activity' ) { st.searchOpen = false; st.txFilter.q = ''; }
		$( '#view' ).dataset.key = '';
		render();
		$( '#view' ).scrollTop = 0;
		enter();
		if ( view === 'more' && more === 'account' ) loadDevices();
	}
	EXA.go = go;
	// A short entrance animation when the screen changes (not on every redraw, so typing and editing stay calm).
	function enter() {
		const v = $( '#view' );
		v.classList.remove( 'enter' ); void v.offsetWidth; v.classList.add( 'enter' );
		clearTimeout( enter.t ); enter.t = setTimeout( () => v.classList.remove( 'enter' ), 1000 );
		$$( '[data-count]', v ).forEach( countUp );
		const ic = $( '.tab.on svg, .rail-item.on svg' ); if ( ic ) { ic.classList.remove( 'pop' ); void ic.getBoundingClientRect(); ic.classList.add( 'pop' ); }
	}
	const motionOn = () => { const m = document.documentElement.dataset.motion; return m === 'full' || ( m !== 'off' && m !== 'reduced' && ! window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches ); };
	EXA.motionOn = motionOn;
	/** Numbers roll up from zero when a screen opens. The real text is put back at the end, so nothing depends on the animation. */
	const counters = new WeakMap();
	function countUp( el ) {
		const previous = counters.get( el );
		if ( previous ) { cancelAnimationFrame( previous.frame ); el.textContent = previous.text; }
		if ( ! motionOn() ) return;
		const target = Math.round( Number( el.dataset.count ) * 100 ), cur = el.dataset.cur;
		if ( ! Number.isSafeInteger( target ) || ! target ) return;
		const state = { text: el.textContent, frame: 0, start: null, last: 0 };
		counters.set( el, state );
		const tick = ( now ) => {
			if ( counters.get( el ) !== state || ! el.isConnected ) return;
			if ( state.start === null ) state.start = now;
			const p = Math.max( 0, Math.min( 1, ( now - state.start ) / 850 ) );
			const cents = Math.min( Math.abs( target ), Math.max( state.last, Math.floor( Math.abs( target ) * ( 1 - Math.pow( 1 - p, 3 ) ) ) ) );
			state.last = cents;
			el.textContent = p < 1 && motionOn() ? money( Math.sign( target ) * cents / 100, cur ) : state.text;
			if ( p < 1 && motionOn() ) state.frame = requestAnimationFrame( tick ); else counters.delete( el );
		};
		state.frame = requestAnimationFrame( tick );
	}
	EXA.enter = enter;
	async function loadDevices() {
		if ( ! EX.auth.isSignedIn() ) return;
		const r = await EX.auth.devices();
		if ( r.ok ) { st.devCache = r.data; if ( st.view === 'more' ) render(); }
	}

	/* ------------------------------------------------------------------ Calendar file, backup, notifications */

	const icsEscape = ( s ) => String( s ).replace( /\\/g, '\\\\' ).replace( /;/g, '\\;' ).replace( /,/g, '\\,' ).replace( /\n/g, '\\n' );
	function buildIcs() {
		const stamp = new Date().toISOString().replace( /[-:]/g, '' ).replace( /\.\d+/, '' );
		const L = [ 'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Expenity//Bills//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + icsEscape( t( 'icsCal' ) ) ];
		const rule = { weekly: 'FREQ=WEEKLY', biweekly: 'FREQ=WEEKLY;INTERVAL=2', monthly: 'FREQ=MONTHLY', quarterly: 'FREQ=MONTHLY;INTERVAL=3', yearly: 'FREQ=YEARLY' };
		EXA.active().forEach( ( b ) => {
			const amt = b.amount !== '' && b.amount != null ? ` (${ EXA.amountText( b ) })` : '';
			L.push( 'BEGIN:VEVENT', `UID:${ b.id }@expenity`, `DTSTAMP:${ stamp }`, `DTSTART;VALUE=DATE:${ b.next.replace( /-/g, '' ) }`, `SUMMARY:${ icsEscape( t( 'icsPay', { name: b.name, amt } ) ) }` );
			if ( rule[ b.repeat ] ) L.push( 'RRULE:' + rule[ b.repeat ] + ( b.end ? ';UNTIL=' + b.end.replace( /-/g, '' ) : '' ) );
			const desc = [ b.reference && t( 'icsRef' ) + ': ' + b.reference, b.payUrl && t( 'icsPayLink' ) + ': ' + b.payUrl, b.notes ].filter( Boolean ).join( '\n' );
			if ( desc ) L.push( 'DESCRIPTION:' + icsEscape( desc ) );
			L.push( 'TRANSP:TRANSPARENT' );
			if ( EXA.lead( b ) > 0 ) L.push( 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${ icsEscape( t( 'icsDueIn', { name: b.name, n: EXA.lead( b ) } ) ) }`, `TRIGGER:-PT${ EXA.lead( b ) * 24 - 9 }H`, 'END:VALARM' );
			L.push( 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${ icsEscape( t( 'icsToday', { name: b.name } ) ) }`, 'TRIGGER:PT9H', 'END:VALARM', 'END:VEVENT' );
		} );
		L.push( 'END:VCALENDAR' );
		return L.join( '\r\n' ) + '\r\n';
	}
	EXA.download = ( name, text, type ) => {
		const a = document.createElement( 'a' );
		a.href = URL.createObjectURL( new Blob( [ text ], { type } ) );
		a.download = name; document.body.appendChild( a ); a.click(); a.remove();
		setTimeout( () => URL.revokeObjectURL( a.href ), 2000 );
	};
	const csvCell = ( v ) => { let s = String( v == null ? '' : v ); if ( /^[=+\-@]/.test( s ) ) s = "'" + s; return /[",\n]/.test( s ) ? '"' + s.replace( /"/g, '""' ) + '"' : s; };
	function checkNotifications() {
		if ( typeof Notification === 'undefined' || Notification.permission !== 'granted' || ! S().device.notify || S().device.push ) return; // with push on, the server sends them
		const td = today();
		const due = EXA.active().filter( ( b ) => ( ! b.snooze || b.snooze <= td ) && diffDays( b.next, td ) <= EXA.lead( b ) && S().device.lastNotified[ b.id ] !== td );
		if ( ! due.length ) return;
		due.forEach( ( b ) => { S().device.lastNotified[ b.id ] = td; } );
		EX.persist();
		const body = due.slice( 0, 4 ).map( ( b ) => `${ b.name }: ${ EXA.rel( b.next ).toLowerCase() }` ).join( '\n' ) + ( due.length > 4 ? '\n' + t( 'nMore', { n: due.length - 4 } ) : '' );
		const title = due.length === 1 ? t( 'nTitle1' ) : t( 'nTitleN', { n: due.length } );
		try {
			if ( navigator.serviceWorker && navigator.serviceWorker.ready ) navigator.serviceWorker.ready.then( ( r ) => r.showNotification( title, { body, icon: 'icon-192.png', tag: 'expenity-due' } ) ).catch( () => new Notification( title, { body } ) );
			else new Notification( title, { body } );
		} catch ( e ) { /* notifications unavailable */ }
	}
	const SAMPLE = () => {
		EX.ensureWallet();
		const td = today(), w = EX.activeAccounts()[ 0 ].id, uid = EX.uid;
		const mk = ( key, amount, cat, repeat, off, extra = {} ) => Object.assign( { id: uid(), name: t( key ), amount: String( amount ), currency: S().settings.currency, category: cat, repeat, next: addDays( td, off ), day: EX.parse( addDays( td, off ) ).getDate(), lead: null, created: td, account: w }, extra );
		const bills = [ mk( 'sampleRent', 850, 'housing', 'monthly', 4 ), mk( 'sampleElectricity', 64.2, 'utilities', 'monthly', -2, { variable: true } ), mk( 'sampleInternet', 29.9, 'utilities', 'monthly', 9 ),
			mk( 'tplNetflix', 15.99, 'subscriptions', 'monthly', 1 ), mk( 'tplSpotify', 10.99, 'subscriptions', 'monthly', 12 ), mk( 'sampleCarIns', 420, 'insurance', 'yearly', 38 ), mk( 'sampleCard', 180, 'loans', 'monthly', 6, { autopay: true } ), mk( 'sampleGym', 35, 'health', 'monthly', 16 ) ];
		const tx = ( type, amount, category, off, name ) => ( { id: uid(), type, amount: String( amount ), account: w, category, date: addDays( td, off ), name } );
		return { bills, txs: [ tx( 'income', 1800, 'salary', -9, t( 'cat_salary' ) ), tx( 'expense', 42.3, 'food', -1, t( 'cat_food' ) ), tx( 'expense', 3.5, 'food', 0, t( 'sampleCoffee' ) ), tx( 'expense', 25, 'transport', -3, t( 'cat_transport' ) ), tx( 'expense', 60, 'leisure', -5, t( 'cat_leisure' ) ), tx( 'expense', 89, 'shopping', -7, t( 'cat_shopping' ) ) ] };
	};

	/* ------------------------------------------------------------------ Events */

	const quickPay = ( b ) => {
		EX.ensureWallet();
		if ( b.amount && ! b.variable ) EXA.markPaid( b.id, b.amount, today(), b.account || ( EX.activeAccounts()[ 0 ] || {} ).id );
		else EXA.openPay( b );
	};

	async function onAction( act, el ) {
		const holder = el.dataset.id ? el : el.closest( '[data-id]' );
		const id = holder ? holder.dataset.id : null;
		const bill = id ? S().bills.find( ( b ) => b.id === id ) : null;
		const tx = id ? S().txs.find( ( x ) => x.id === id ) : null;
		switch ( act ) {
			case 'add': EXA.openAdd(); break;
			case 'tx-expense': case 'tx-income': case 'tx-transfer': EXA.openTx( null, { type: act.slice( 3 ) } ); break;
			case 'add-bill': EXA.openBill(); break;
			case 'open-tx': if ( ! UI.justSwiped ) EXA.openDetail( 'tx', id ); break;
			case 'open-bill': if ( ! UI.justSwiped ) EXA.openDetail( 'bill', id ); break;
			case 'edit-tx': if ( tx ) EXA.openTx( tx ); break;
			case 'del-tx': UI.closeSheet(); EXA.removeTx( id ); break;
			case 'edit-bill': if ( bill ) EXA.openBill( bill ); break;
			case 'del-bill': UI.closeSheet(); EXA.removeBill( id ); break;
			case 'pay-bill': if ( bill ) EXA.openPay( bill ); break;
			case 'snooze1': UI.closeSheet(); EXA.snoozeBill( id, 1 ); break;
			case 'skip': UI.closeSheet(); EXA.skipBill( id ); break;
			case 'copyref': if ( bill ) { if ( navigator.clipboard ) navigator.clipboard.writeText( bill.reference ).then( () => toast( t( 'tRefCopied' ) ), () => toast( bill.reference ) ); else toast( bill.reference ); } break;
			case 'add-wallet': EXA.openWallet( null ); break;
			case 'join-wallet': EXA.openJoin(); break;
			case 'edit-wallet': EXA.openWallet( el.dataset.id ); break;
			case 'add-cat': EXA.openCat(); break;
			case 'del-cat': S().categories = S().categories.filter( ( c ) => c.id !== el.dataset.id ); EX.save(); break;
			case 'toggle-search': st.searchOpen = ! st.searchOpen; if ( ! st.searchOpen ) st.txFilter.q = ''; render(); if ( st.searchOpen ) { const i = $( '#txSearch' ); if ( i ) i.focus(); } break;
			case 'dismiss-banner': S().device.bannerDismissed = true; EX.persist(); render(); break;
			case 'dismiss-install': S().device.installDismissed = true; EX.persist(); render(); break;
			case 'install': if ( EXA.installEvent ) { EXA.installEvent.prompt(); try { await EXA.installEvent.userChoice; } catch ( e ) { /* ignore */ } EXA.installEvent = null; render(); } break;
			case 'sample': { const s = SAMPLE(); S().bills.push( ...s.bills ); S().txs.push( ...s.txs ); EX.save(); toast( t( 'tSample' ) ); break; }
			case 'plan-back': { const p = st.prev && st.prev.view !== 'plan' ? st.prev : { view: 'home', more: 'root' }; go( p.view, p.more ); break; }
			case 'more-back': st.more = 'root'; render(); $( '#view' ).scrollTop = 0; break;
			case 'auth-create': case 'auth-signin': case 'auth-back': EXA.openAuth( 'start' ); break;
			case 'auth-recover': EXA.openAuth( 'recover' ); break;
			case 'sync-now': EX.sync.run().then( () => toast( t( 'syncDone' ) ) ); break;
			case 'add-passkey': { const r = await EX.auth.addPasskey(); if ( r.ok ) { toast( t( 'tPasskeyAdded' ) ); loadDevices(); } else toast( EXA.errText( r.error ) ); break; }
			case 'rm-passkey': { const r = await EX.auth.removePasskey( el.dataset.id ); if ( r.ok ) { toast( t( 'tPasskeyRemoved' ) ); loadDevices(); } else toast( EXA.errText( r.error ) ); break; }
			case 'rm-session': { const r = await EX.auth.revokeSession( el.dataset.id ); if ( r.ok ) { toast( t( 'tDeviceOut' ) ); loadDevices(); } else toast( EXA.errText( r.error ) ); break; }
			case 'new-codes': { const r = await EX.auth.regenerateCodes(); if ( r.ok ) EXA.showCodes( r.recoveryCodes, () => render() ); else toast( EXA.errText( r.error ) ); break; }
			case 'flip-hero': if(['vader','mario','minnie'].includes(EXA.skin())){if(!st.characterRetreated){st.characterCollapseTimer=setTimeout(()=>{st.characterCollapsed=true;if(st.view==='home')document.querySelector('.hero-flip')?.classList.add('character-collapsed');},1000);}st.characterRetreated=true;rememberCharacter(EXA.skin());el.classList.add('character-retreating');setTimeout(()=>{el.classList.remove('character-retreating');el.classList.add('character-retreated');},900);} st.heroFlip = ! el.classList.contains( 'flipped' ); el.classList.toggle( 'flipped', st.heroFlip ); el.setAttribute( 'aria-pressed', String( st.heroFlip ) ); UI.haptic(); break;
			case 'delete-photos': await EXA.photos.deleteAll(); break;
			case 'check-update': checkUpdate( el ); break;
			case 'apply-update': await EXA.applyRelease(); break;
			case 'sign-out': {
				if ( ! await EXA.confirm( { title: t( 'signOut' ), text: t( EX.sync.pending() ? 'confirmSignOutUnsynced' : 'confirmSignOut' ), confirm: t( 'signOut' ) } ) ) break;
				await EX.auth.logout(); st.devCache = null; toast( t( 'tSignedOut' ) ); go( 'home' ); break;
			}
			case 'delete-account': {
				if ( ! await EXA.confirm( { title: t( 'devDelete' ), text: t( 'confirmDeleteAcct' ), confirm: t( 'devDelete' ) } ) ) break;
				const r = await EX.auth.deleteAccount();
				if ( r.ok ) { st.devCache = null; toast( t( 'tAccountDeleted' ) ); go( 'home' ); } else toast( EXA.errText( r.error ) );
				break;
			}
			default: break;
		}
	}

	async function checkUpdate(btn) { await EXA.checkRelease(btn); }

	function init() {
		EX.load();
		fetch( 'favicon.svg' ).then( ( r ) => r.text() ).then( ( svg ) => { logoSvg = svg.replace( '<svg ', '<svg width="34" height="34" aria-hidden="true" ' ); EXA.logoSvg = logoSvg; $$( '#logo' ).forEach( ( l ) => { l.innerHTML = logoSvg; } ); } ).catch( () => {} );
		UI.initSheet();
		UI.initSwipe( document.body );
		UI.initPull( $( '#view' ), () => { EX.sync.run().then( () => toast( t( 'syncDone' ) ) ); }, () => EX.auth.isSignedIn() && ! UI.sheetOpen() && ! EXA.dashboardEditing() );
		EXA.readJoinLink();
		EX.sync.init();
		EXA.applyMotion();
		render();
		EXA.flow.init();
		EXA.enhancementsInit();
		if ( ! EXA.flow.active() ) enter();
		EXA.tryJoin();
		EXA.push.check();
		checkNotifications();
		setInterval( checkNotifications, 60000 );

		EX.on( 'change', render );
		EX.on( 'remote', () => { if ( ! S().device.stage ) EXA.flow.init(); render(); } );
		EX.on( 'lang', () => { render(); if ( EXA.flow.active() ) EXA.flow.show(); } );
		EX.on( 'syncstatus', () => { $$( '.avatar .dot' ).forEach( ( d ) => { d.className = 'dot ' + EX.sync.status; } ); const l = $( '#syncLine' ); if ( l ) l.innerHTML = EXA.syncLine(); } );
		EX.on( 'auth', () => { if ( ! S().device.stage ) EXA.flow.init(); render(); EXA.tryJoin(); if ( st.view === 'more' && st.more === 'account' ) loadDevices(); } );
		EX.on( 'authexpired', () => { st.devCache = null; toast( t( 'err_unauthorized' ) ); render(); } );
		EX.on( 'savefail', () => toast( t( 'tSaveFail' ) ) );

		window.addEventListener( 'beforeinstallprompt', ( e ) => { e.preventDefault(); EXA.installEvent = e; render(); } );
		window.addEventListener( 'appinstalled', () => { EXA.installEvent = null; if(EXA.flow.active() && S().device.stage === 'install') EXA.installHandoff(); else { S().device.installDismissed = true; EX.persist(); render(); } } );
		window.matchMedia( '(min-width: 1200px)' ).addEventListener( 'change', () => { st.sel = null; render(); } );

		document.addEventListener( 'click', async ( e ) => {
			if ( e.target.closest( '[data-close]' ) ) { UI.closeSheet(); return; }
			if ( UI.sheetOpen() && ( EXA.txClick( e ) || EXA.billClick( e ) || EXA.walletClick( e ) ) ) return;
			if ( e.target.id === 'authLogin' ) { EXA.authLogin(); return; }
			if ( EXA.flow.onClick( e ) || EXA.flow.onStepClick( e ) || EXA.pushClick( e ) || EXA.ideasClick( e ) || EXA.shareClick( e ) || EXA.planClick( e ) || EXA.repClick( e ) ) return;
			let el;
			if ( ( el = e.target.closest( '[data-income-mode]' ) ) ) { st.incomeMode = el.dataset.incomeMode; render(); return; }
			if ( ( el = e.target.closest( '[data-go]' ) ) ) { UI.closeSheet(); go( el.dataset.go ); return; }
			if ( ( el = e.target.closest( '[data-more]' ) ) ) { st.view = 'more'; st.more = el.dataset.more; render(); $( '#view' ).scrollTop = 0; if ( st.more === 'account' ) loadDevices(); return; }
			if ( ( el = e.target.closest( '[data-lang]' ) ) ) { EX.setLang( el.dataset.lang ); return; }
			if ( ( el = e.target.closest( '[data-tpl]' ) ) ) { const x = EX.TEMPLATES[ Number( el.dataset.tpl ) ]; EXA.openBill( null, { name: t( x[ 0 ] ), category: x[ 1 ], repeat: x[ 2 ] } ); return; }
			if ( ( el = e.target.closest( '[data-txmonth]' ) ) ) { const n = Number( el.dataset.txmonth ); st.txMonth = n === 0 ? st.nowMonth() : st.txMonth + n; render(); return; }
			if ( ( el = e.target.closest( '[data-txtype]' ) ) ) { st.txFilter.type = el.dataset.txtype; render(); return; }
			if ( ( el = e.target.closest( '[data-billsmode]' ) ) ) { st.billsMode = el.dataset.billsmode; render(); return; }
			if ( ( el = e.target.closest( '[data-cal]' ) ) ) { const n = Number( el.dataset.cal ); st.calMonth = n === 0 ? st.nowMonth() : st.calMonth + n; st.calDay = null; render(); return; }
			if ( ( el = e.target.closest( '[data-day]' ) ) ) { st.calDay = el.dataset.day; render(); return; }
			if ( ( el = e.target.closest( '[data-period]' ) ) ) { st.repPeriod = el.dataset.period; render(); return; }
			if ( ( el = e.target.closest( '[data-motion-set]' ) ) ) { EXA.setMotion( el.dataset.motionSet ); render(); return; }
			if ( ( el = e.target.closest( '[data-skin-set]' ) ) ) { EXA.setSkin( el.dataset.skinSet ); if ( EXA.flow.active() ) EXA.flow.show( true ); else render(); return; }
			if ( ( el = e.target.closest( '[data-mode-set]' ) ) ) { EXA.setMode( el.dataset.modeSet ); if ( EXA.flow.active() ) EXA.flow.show( true ); else render(); return; }
			if ( ( el = e.target.closest( '[data-act]' ) ) ) { onAction( el.dataset.act, el ); return; }
			const id = e.target.closest( 'button, label' ) ? ( e.target.closest( 'button, label' ).id || '' ) : '';
			if ( id === 'icsBtn' ) { if ( ! EXA.active().length ) { toast( t( 'tNeedBill' ) ); return; } EXA.download( 'expenity-bills.ics', buildIcs(), 'text/calendar' ); toast( t( 'tIcs' ) ); }
			else if ( id === 'expJson' ) { const s = S(); EXA.download( 'expenity-backup-' + today() + '.json', JSON.stringify( { version: 2, bills: s.bills, txs: s.txs, accounts: s.accounts, categories: s.categories, budgets: s.budgets, goals: s.goals, incomes: s.incomes, settings: s.settings }, null, 1 ), 'application/json' ); }
			else if ( id === 'expCsv' ) {
				const rows = [ t( 'csvHead2' ) ].concat( S().txs.slice().sort( ( a, b ) => ( a.date < b.date ? 1 : -1 ) ).map( ( x ) => [ x.date, t( x.type === 'income' ? 'typeIncome' : x.type === 'transfer' ? 'typeTransfer' : 'typeExpense' ), x.name || '', x.type === 'transfer' ? t( 'catTransfer' ) : EX.catInfo( x.category ).name, EXA.walletName( x.account ), x.amount, EX.txCurrency( x ), x.toAccount ? EXA.walletName( x.toAccount ) : '', x.note || '' ] ) );
				EXA.download( 'expenity-transactions.csv', '﻿' + rows.map( ( r ) => r.map( csvCell ).join( ',' ) ).join( '\n' ), 'text/csv;charset=utf-8' );
			} else if ( id === 'notifyBtn' ) {
				if ( S().device.notify && Notification.permission === 'granted' ) { S().device.notify = false; EX.persist(); render(); return; }
				const p = await Notification.requestPermission();
				S().device.notify = p === 'granted'; EX.persist(); render(); if ( p === 'granted' ) { S().device.lastNotified = {}; checkNotifications(); }
			} else if ( id === 'wipeBtn' ) {
				if ( await EXA.confirm( { title: t( 'wipe' ), text: t( 'confirmWipe' ), confirm: t( 'wipe' ) } ) ) { EX.resetState(); EX.save(); EXA.flow.init(); toast( t( 'tWiped' ) ); }
			}
		} );

		document.addEventListener( 'keydown', ( e ) => { const h = e.target.closest && e.target.closest( '[data-act=flip-hero]' ); if ( h && ( e.key === 'Enter' || e.key === ' ' ) ) { e.preventDefault(); h.click(); } } );
		document.addEventListener( 'swipeaction', async ( e ) => {
			const { action, id, kind } = e.detail;
			const rowEl = e.target.closest ? e.target.closest( '.sw' ) : null;
			if ( rowEl && ( action === 'del' || action === 'paid' ) && motionOn() ) { rowEl.classList.add( action === 'del' ? 'leaving' : 'paid-out' ); await new Promise( ( r ) => setTimeout( r, 280 ) ); }
			if ( kind === 'tx' ) { const x = S().txs.find( ( z ) => z.id === id ); if(action==='duplicate'&&x){EXA.duplicateRecord('tx',id);return;} if ( action === 'edit' && x ) EXA.openTx( x ); else if ( action === 'del' ) EXA.removeTx( id ); }
			else { const b = S().bills.find( ( z ) => z.id === id ); if(action==='duplicate'&&b){EXA.duplicateRecord('bill',id);return;} if ( action === 'paid' && b ) quickPay( b ); else if ( action === 'edit' && b ) EXA.openBill( b ); else if ( action === 'del' ) EXA.removeBill( id ); }
		} );

		document.addEventListener( 'submit', ( e ) => {
			e.preventDefault();
			const f = e.target;
			if ( f.id === 'billForm' ) EXA.billSubmit(); else if ( f.id === 'payForm' ) EXA.paySubmit(); else if ( f.id === 'walletForm' ) EXA.walletSubmit(); else if ( f.id === 'catForm' ) EXA.catSubmit();
			else if ( f.id === 'registerForm' || f.id === 'recoverForm' ) EXA.authSubmit( f ); else if ( ! EXA.planSubmit( f ) && ! EXA.repSubmit( f ) && ! EXA.shareSubmit( f ) ) EXA.flow.onSubmit( f );
		} );
		document.addEventListener( 'input', ( e ) => {
			if ( EXA.flow.onInput( e ) ) return;
			if ( e.target.id === 'txSearch' ) { st.txFilter.q = e.target.value; if ( ! e.isComposing ) render(); return; }
			if ( EXA.txInput( e ) ) return;
			EXA.billInput( e );
		} );
		document.addEventListener( 'compositionend', ( e ) => { if ( e.target.id === 'txSearch' ) { st.txFilter.q = e.target.value; render(); } } );
		document.addEventListener( 'change', ( e ) => {
			if ( EXA.repChange( e ) || EXA.shareChange( e ) || EXA.pushChange( e ) ) return;
			const id = e.target.id;
			if ( id === 'txWalletFilter' ) { st.txFilter.account = e.target.value; render(); }
			else if ( id === 'setLead' ) { S().settings.lead = Number( e.target.value ); EX.save(); }
			else if ( id === 'setCur' ) { const v = e.target.value.trim().toUpperCase(); if ( /^[A-Z]{3}$/.test( v ) ) { S().settings.currency = v; EX.save(); } }
			else if ( id === 'impJson' ) {
				const file = e.target.files[ 0 ]; if ( ! file ) return;
				file.text().then( async ( txt ) => {
					const d = JSON.parse( txt );
					if ( ! d || ! Array.isArray( d.bills ) ) throw new Error( 'bad' );
					if ( ! await EXA.confirm( { title: t( 'restore' ), text: t( 'confirmRestore', { n: d.bills.length } ), confirm: t( 'restore' ) } ) ) return;
					const keep = { device: S().device, sync: S().sync };
					EX.replaceState( Object.assign( { bills: d.bills, txs: d.txs || [], accounts: d.accounts || [], categories: d.categories || [], budgets: d.budgets || [], goals: d.goals || [], incomes: d.incomes || [], settings: d.settings }, keep ) );
					EX.ensureWallet(); EX.save(); toast( t( 'tRestored' ) );
				} ).catch( () => toast( t( 'tBadBackup' ) ) );
			}
		} );
		// Desktop keyboard: n adds, / searches, Escape closes the details pane.
		document.addEventListener( 'keydown', ( e ) => {
			const tag = ( document.activeElement && document.activeElement.tagName ) || '';
			if ( /INPUT|TEXTAREA|SELECT/.test( tag ) || UI.sheetOpen() || e.ctrlKey || e.metaKey || e.altKey ) return;
			if ( e.key === 'n' ) { EXA.openAdd(); e.preventDefault(); }
			else if ( e.key === '/' ) { go( 'activity' ); st.searchOpen = true; render(); const i = $( '#txSearch' ); if ( i ) i.focus(); e.preventDefault(); }
			else if ( e.key === 'Escape' && st.sel ) { st.sel = null; render(); }
		} );

		if ( 'serviceWorker' in navigator && location.protocol.startsWith( 'http' ) ) navigator.serviceWorker.register( 'sw.js' ).catch( () => {} );
	}

	window.EXApp = { buildIcs, goTo: go, render };
	init();
} )();
