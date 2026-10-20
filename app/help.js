/**
 * Help while you work: a small help icon on screens that have a tutorial. It opens the animated tutorial in a popup on top of
 * the current screen, so nothing is closed or lost, with "All tutorials" at the bottom. The icons can be switched off.
 */
( function () {
	'use strict';
	const { EX, EXA, UI } = window, { t, esc } = EX;
	const T = EXA.tutorials, H = ( EXA.help = {} );
	H.enabled = () => EX.state().settings.helpIcons !== false;
	const dismissed = () => EX.state().settings.helpDismissed || [];
	H.hidden = ( id ) => dismissed().includes( id );
	const hide = ( id, yes ) => { const s = EX.state().settings, l = new Set( dismissed() ); if ( yes ) l.add( id ); else l.delete( id ); s.helpDismissed = [ ...l ]; s.u = Date.now(); EX.persist(); };
	const live = ( id ) => T.list().some( ( x ) => x.id === id ) ? id : '';
	/** Which tutorial fits what is on screen now. */
	H.forSheet = () => {
		const sh = document.getElementById( 'sheet' ); if ( ! sh || ! sh.open ) return '';
		const q = ( s ) => !! sh.querySelector( s );
		if(q('[data-advanced-group="splits"][open]'))return live('split');if(q('[data-advanced-group="reimbursement"][open],#amPayment'))return live('reimburse');
		if ( sh.classList.contains( 'entry-composer' ) ) return live( q( '[data-entry=schedule-back]' ) ? 'recurring' : q( '#txQuick' ) ? 'quick' : ( live( 'smart' ) || 'quick' ) );
		if ( q( '#billForm' ) ) return live( 'bills' ); if ( q( '#walletForm' ) ) return live( 'wallets' );
		if ( q( '#efPlanForm' ) ) return live( 'efriend' ); if ( q( '#budgetForm,#goalForm,#contribForm' ) ) return live( 'budgets' ); if ( q( '#incomeForm' ) ) return live( 'recurring' );
		if ( q( '#customThemeForm' ) ) return live( 'themes' ); if ( q( '.safe-details' ) ) return live( 'daily' );
		if ( q( '.av-grid' ) ) return live( 'avatar' ); if ( q( '.rm' ) ) return live( 'swipe' );
		return '';
	};
	H.forPage = () => {
		const s = EXA.st, v = s.view, m = s.more;
		const map = { activity: 'filters', reports: 'reports', plan: 'budgets', bills: 'bills', home: 'home' };
		const sub = { features: 'features', reminders: 'notify', trash: 'trash', appearance: 'themes', tags: 'tags', data: 'backup', account: 'sync', wallets: 'wallets', tutorials: '', drafts: 'quick' };
		if ( v === 'home' && EXA.dashboardEditing && EXA.dashboardEditing() ) return live( 'homereports' ) || live( 'home' );
		if ( v === 'more' && m === 'account' && EXA.sharedWallets && EXA.sharedWallets().length ) return live( 'leaveshared' ) || live( 'sync' );
		return live( v === 'more' ? ( m === 'root' ? '' : sub[ m ] || '' ) : map[ v ] || '' );
	};
	const btn = ( id ) => `<button type="button" class="ab-btn help-ic" data-help="${ id }" aria-label="${ esc( t( 'helpIcon' ) ) }" title="${ esc( t( 'helpIcon' ) ) }">${ UI.icon( 'help-circle', 24 ) }</button>`;
	// Pages: the icon sits in the top bar.
	const appbar = EXA.appbar;
	EXA.appbar = () => appbar(); // the page's help icon now lives in the top bar's menu (see EXA.barMenu)
	H.pageHelp = () => { const id = H.enabled() ? H.forPage() : ''; return id && ! H.hidden( id ) ? id : ''; };
	// Sheets: the icon sits in the sheet's header.
	const place = () => {
		const sh = document.getElementById( 'sheet' ); if ( ! sh ) return;
		const old = sh.querySelector( '.help-ic' ); if ( ! H.enabled() ) { old && old.remove(); return; }
		const id = H.forSheet(), head = sh.querySelector( '.entry-head, .sheet-head' );
		if ( ! id || ! head || H.hidden( id ) ) { old && old.remove(); return; }
		if ( old && old.dataset.help === id && head.contains( old ) ) return; old && old.remove();
		head.insertAdjacentHTML( 'beforeend', btn( id ) );
	};
	let queued = false;
	const body = () => document.querySelector( '#sheet .sheet-body' );
	const watch = () => { const b = body(); if ( ! b ) return setTimeout( watch, 400 ); new MutationObserver( () => { if ( queued ) return; queued = true; requestAnimationFrame( () => { queued = false; place(); } ); } ).observe( b, { childList: true, subtree: true } ); };
	watch();
	document.addEventListener('toggle',e=>{if(e.target.matches?.('[data-advanced-group]'))requestAnimationFrame(place);},true);

	/* The popup: its own dialog above the current sheet. It never navigates. */
	let pop = null;
	const close = () => { if ( pop ) { pop.close(); pop.remove(); pop = null; } };
	const nav = ( id ) => { const ids = T.list().map( ( x ) => x.id ), i = ids.indexOf( id ), b = ( dir, ic, off ) => `<button type="button" class="btn btn-ghost tt-nav" data-hp-nav="${ dir }"${ off ? ' disabled' : '' }>${ UI.icon( ic, 22 ) }</button>`; return `<div class="tt-navbar">${ b( 'prev', 'chevron-left', i <= 0 ) }<span class="tt-pos">${ i + 1 } / ${ ids.length }</span>${ b( 'next', 'chevron-right', i >= ids.length - 1 ) }</div>`; };
	const draw = ( id, listMode ) => {
		if ( ! pop ) return;
		const hd = ( title, back ) => `<div class="hp-head">${ back ? `<button type="button" class="ab-btn" data-hp-back aria-label="${ esc( t( 'helpBack' ) ) }">${ UI.icon( 'arrow-left', 22 ) }</button>` : '' }<h2>${ esc( title ) }</h2><button type="button" class="ab-btn" data-hp-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 22 ) }</button></div>`;
		if ( listMode ) pop.innerHTML = hd( t( 'helpAll' ), !! H.current ) + `<div class="hp-body"><div class="list mlist">${ T.list().map( ( x ) => `<button type="button" class="mrow" data-hp-open="${ x.id }">${ UI.ci( x.icon, 'teal', 36 ) }<span class="mid"><b>${ esc( t( 'tut_' + x.id ) ) }${ x.fresh ? `<span class="tut-new">${ esc( t( 'tutNew' ) ) }</span>` : '' }</b><small>${ esc( t( 'tutD_' + x.id ) ) }</small></span>${ UI.icon( 'chevron-right', 18 ) }</button>` ).join( '' ) }</div></div>`;
		else { H.current = id; pop.innerHTML = hd( t( 'tut_' + id ), false ) + `<div class="hp-body tt">${ T.body( id ) }${ nav( id ) }</div><div class="hp-foot"><button type="button" class="btn btn-ghost wide" data-hp-all>${ UI.icon( 'list-details', 20 ) } ${ esc( t( 'helpAll' ) ) }</button>${ H.fromIcon && H.current === H.fromId && ! H.hidden( H.fromId ) ? `<button type="button" class="link wide hp-never" data-hp-never>${ esc( t( 'helpNever' ) ) }</button>` : '' }<button type="button" class="link wide hp-never" data-hp-settings>${ UI.icon( 'settings', 16 ) } ${ esc( t( 'helpManageAll' ) ) }</button></div>`; }
	};
	H.open = ( id, fromIcon ) => {
		close(); H.fromIcon = !! fromIcon; pop = document.createElement( 'dialog' ); pop.className = 'help-pop'; pop.setAttribute( 'aria-label', t( 'helpTitle' ) );
		document.body.appendChild( pop ); H.current = id; draw( id ); pop.showModal();
		pop.addEventListener( 'click', ( e ) => { if ( e.target === pop ) close(); } ); pop.addEventListener( 'cancel', ( e ) => { e.preventDefault(); close(); } );
	};
	document.addEventListener( 'click', ( e ) => {
		const h = e.target.closest( '[data-help]' ); if ( h ) { e.preventDefault(); e.stopImmediatePropagation(); H.fromId = h.dataset.help; H.open( h.dataset.help, true ); return; }
		if ( ! pop || ! pop.contains( e.target ) ) return;
		const o = e.target.closest( '[data-hp-open]' ), n = e.target.closest( '[data-hp-nav]' );
		if ( e.target.closest( '[data-hp-close]' ) ) { close(); return; }
		if ( e.target.closest( '[data-hp-settings]' ) ) { close(); UI.closeSheet( true ); EXA.st.view = 'more'; EXA.st.more = 'helpicons'; EXA.render(); return; }
		if ( e.target.closest( '[data-hp-never]' ) ) { const id = H.fromId; close(); hide( id, true ); place(); EXA.render(); UI.toast( t( 'helpHidden' ) ); return; }
		if ( e.target.closest( '[data-hp-all]' ) ) { draw( H.current, true ); return; }
		if ( e.target.closest( '[data-hp-back]' ) ) { draw( H.current ); return; }
		if ( o ) { draw( o.dataset.hpOpen ); return; }
		if ( n ) { const ids = T.list().map( ( x ) => x.id ), i = ids.indexOf( H.current ) + ( n.dataset.hpNav === 'next' ? 1 : -1 ); if ( ids[ i ] ) draw( ids[ i ] ); }
	}, true );

	/* More → Help icons: one switch for all of them, and one per screen. */
	H.view = () => `<section class="card"><label class="fx-row"><span class="mid"><b>${ esc( t( 'helpToggle' ) ) }</b><small>${ esc( t( 'helpToggleDesc' ) ) }</small></span><input type="checkbox" role="switch" data-help-toggle${ H.enabled() ? ' checked' : '' }></label></section>
		<section class="card"><h2>${ esc( t( 'helpPerScreen' ) ) }</h2><p class="muted small">${ esc( t( 'helpPerScreenHelp' ) ) }</p><div class="fx-rows">${ T.list().map( ( x ) => `<label class="fx-row">${ UI.ci( x.icon, 'teal', 36 ) }<span class="mid"><b>${ esc( t( 'tut_' + x.id ) ) }</b></span><input type="checkbox" role="switch" data-help-screen="${ x.id }"${ H.hidden( x.id ) ? '' : ' checked' }${ H.enabled() ? '' : ' disabled' }></label>` ).join( '' ) }</div><div class="btn-row"><button type="button" class="btn btn-ghost" data-help-reset>${ esc( t( 'helpShowAll' ) ) }</button></div></section>`;
	document.addEventListener( 'change', ( e ) => { const c = e.target.closest( '[data-help-screen]' ); if ( ! c ) return; e.stopImmediatePropagation(); hide( c.dataset.helpScreen, ! c.checked ); place(); EXA.render(); }, true );
	document.addEventListener( 'click', ( e ) => { if ( ! e.target.closest( '[data-help-reset]' ) ) return; e.preventDefault(); e.stopImmediatePropagation(); const s = EX.state().settings; s.helpDismissed = []; s.helpIcons = true; s.u = Date.now(); EX.persist(); place(); EXA.render(); UI.done( t( 'helpRestored' ) ); }, true );
	/* The switch also sits on the Tutorials page. */
	const view = T.view;
	T.view = () => `<section class="card"><label class="fx-row"><span class="mid"><b>${ esc( t( 'helpToggle' ) ) }</b><small>${ esc( t( 'helpToggleDesc' ) ) }</small></span><input type="checkbox" role="switch" data-help-toggle${ H.enabled() ? ' checked' : '' }></label></section>` + view();
	document.addEventListener( 'change', ( e ) => { if ( ! e.target.matches( '[data-help-toggle]' ) ) return; e.stopImmediatePropagation(); const s = EX.state().settings; s.helpIcons = e.target.checked; s.u = Date.now(); EX.persist(); place(); EXA.render(); }, true );
}() );
