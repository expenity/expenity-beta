/**
 * Animated tutorials (pure CSS, no video): scanning receipts, swiping rows, press-and-hold menu, sentence entry, theme editing.
 * They live in More → Help & about → Tutorials, and a short tour of the first three opens once after first-run setup.
 */
( function () {
	'use strict';
	const { EX, EXA, UI } = window, { t, esc } = EX;
	const T = ( EXA.tutorials = {} );
	const rows = ( n = 3 ) => Array.from( { length: n }, ( _, i ) => `<div class="tt-row"><i class="tt-ic c${ i }"></i><span><b></b><u></u></span><em></em></div>` ).join( '' );
	const bar = ( fab ) => `<div class="tt-bar"><i></i><i></i>${ fab ? '<s class="tt-fab"></s>' : '<s class="tt-fab dim"></s>' }<i></i><i></i></div>`;
	const d = ( n ) => `style="--d:${ n }s"`;
	const chip = ( x, n, cls = '' ) => `<s class="tt-chip tt-in ${ cls }" ${ d( n ) }>${ x }</s>`;
	const phone = ( inner, fab = false ) => `<div class="tt-screen">${ inner }</div>${ bar( fab ) }`;
	const grid = ( n, cls = '' ) => Array.from( { length: n }, ( _, k ) => `<i class="tt-cell tt-in ${ cls }" ${ d( k * .25 ) }></i>` ).join( '' );
	const DEMOS = {
		scan: () => `<div class="tt-screen">${ rows() }</div>${ bar( true ) }<span class="tt-ring"></span><span class="tt-finger scan"></span>
			<div class="tt-sheet scan"><div class="tt-receipt"><b></b><u></u><u></u><u></u><u class="tot"></u><i class="tt-scanline"></i></div><div class="tt-fields"><span class="f1"></span><span class="f2"></span></div><svg class="tt-check" viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="11" fill="#22a06b"/><path d="M6.5 12.5l3.8 3.8 7.2-8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`,
		swipe: () => `<div class="tt-screen">${ rows( 1 ) }<div class="tt-sw"><div class="tt-back"><s class="g">✓</s><s class="b">✎</s><s class="b2">⧉</s><s class="r">✕</s></div><div class="tt-front"><i class="tt-ic c1"></i><span><b></b><u></u></span><em></em></div></div>${ rows( 1 ) }</div>${ bar( false ) }<span class="tt-finger swipe"></span>`,
		hold: () => `<div class="tt-screen">${ rows( 1 ) }<div class="tt-row held"><i class="tt-ic c1"></i><span><b></b><u></u></span><em></em><span class="tt-ring row"></span></div>${ rows( 1 ) }</div>${ bar( false ) }<span class="tt-finger hold"></span><div class="tt-menu"><p>✎</p><p>⧉</p><p class="d">✕</p></div>`,
		quick: () => `<div class="tt-screen"><div class="tt-input"><span class="tt-type">Coffee 3.50 yesterday</span></div><div class="tt-chips">${ chip( 'Coffee', 2.4 ) }${ chip( '3.50', 3 ) }${ chip( '−1d', 3.6 ) }</div>${ rows( 1 ) }</div>${ bar( true ) }`,
		first: () => phone( `<div class="tt-form"><div class="tt-hl" ${ d( 0 ) }><b class="tt-pill">Cash</b></div><div class="tt-amt tt-hl" ${ d( 1 ) }>€ 12.50</div><div class="tt-cats">${ grid( 8 ) }</div><div class="tt-btn tt-hl" ${ d( 3.4 ) }></div></div>` ),
		bills: () => phone( `<div class="tt-sw"><div class="tt-back"><s class="g">✓</s></div><div class="tt-front bill"><i class="tt-ic c2"></i><span><b></b><u></u></span><em class="late"></em></div></div>${ rows( 2 ) }` ) + '<span class="tt-finger bill"></span>',
		recurring: () => phone( `<div class="tt-form"><div class="tt-sel tt-hl" ${ d( 0 ) }><span>⟳</span><b></b></div><div class="tt-sel tt-hl" ${ d( 1 ) }><span>31</span><b></b></div>${ rows( 3 ).replace( /<div class="tt-row">/g, '<div class="tt-row tt-in" ' + d( 2 ) + '>' ) }</div>` ),
		budgets: () => phone( `<div class="tt-bgt"><div class="tt-track"><i class="tt-fill"></i></div><div class="tt-track"><i class="tt-fill b2"></i></div><div class="tt-ringbox"><svg viewBox="0 0 36 36" width="76" height="76"><circle cx="18" cy="18" r="15" fill="none" stroke="var(--line)" stroke-width="4"/><circle class="tt-arc" cx="18" cy="18" r="15" fill="none" stroke="#22a06b" stroke-width="4" stroke-linecap="round" transform="rotate(-90 18 18)"/></svg></div></div>` ),
		reports: () => phone( `<div class="tt-tabs"><s class="tt-hl" ${ d( 0 ) }></s><s class="tt-hl" ${ d( 1.4 ) }></s><s class="tt-hl" ${ d( 2.8 ) }></s></div><div class="tt-bars">${ [ 40, 70, 55, 85, 60, 95 ].map( ( h, k ) => `<i class="tt-bar-i" style="--h:${ h }%;animation-delay:${ k * .15 }s"></i>` ).join( '' ) }</div>` ),
		notify: () => phone( `<div class="tt-bell">🔔</div><div class="tt-sel tt-hl" ${ d( 1 ) }><span>09</span><b></b></div>` ) + `<div class="tt-push"><i></i><span><b></b><u></u></span></div>`,
		themes: () => `<div class="tt-screen"><div class="tt-themes"><div class="tt-theme a"><i class="tt-pen">✎</i></div><div class="tt-theme b"></div><div class="tt-theme c"></div><div class="tt-theme d"></div></div></div>${ bar( false ) }<span class="tt-finger theme"></span>`,
		features: () => phone( [ 0, 1, 2 ].map( ( k ) => `<div class="tt-plan tt-hl" ${ d( k * 1.6 ) }><b></b><u></u></div>` ).join( '' ) + [ 0, 1, 2 ].map( ( k ) => `<div class="tt-trow"><span><b></b></span><i class="tt-tog" ${ d( k * .8 ) }></i></div>` ).join( '' ) ),
		avatar: () => phone( `<div class="tt-avgrid">${ [ '#fbbf24', '#93c5fd', '#fdba74', '#bbf7d0', '#c4b5fd', '#fbcfe8', '#a5f3fc', '#fde68a' ].map( ( c, k ) => `<i style="background:${ c }" class="${ k === 5 ? 'pick' : '' }">${ k === 5 ? '<s>✓</s>' : '' }</i>` ).join( '' ) }</div><div class="tt-btnrow"><b></b><b class="p"></b></div>` ),
		home: () => phone( `<div class="tt-hcards"><div class="tt-hc a"></div><div class="tt-hc b"></div><div class="tt-hc c"></div></div>` ) + '<span class="tt-finger home"></span>',
		sync: () => `<div class="tt-two"><div class="tt-mini a">${ rows( 2 ) }</div><i class="tt-link"><s></s></i><div class="tt-mini b">${ rows( 2 ).replace( /<div class="tt-row">/g, '<div class="tt-row tt-in" ' + d( 1.6 ) + '>' ) }</div></div>`,
		shared: () => `<div class="tt-two"><div class="tt-person a"><i></i></div><div class="tt-wal"><b></b><span><s>owner</s><s>edit</s><s>view</s></span></div><div class="tt-person b"><i></i></div></div>`,
		backup: () => phone( `<div class="tt-file tt-in" ${ d( 0 ) }>⭳</div><div class="tt-reset tt-in" ${ d( 2.4 ) }>↺</div>${ rows( 1 ) }` ),
		wallets: () => phone( `<div class="tt-wcards"><div class="tt-wc a tt-in" ${ d( 0 ) }><i></i><b></b><u></u></div><div class="tt-wc b tt-in" ${ d( 1 ) }><i></i><b></b><u></u></div><div class="tt-wc c tt-in" ${ d( 2 ) }><i></i><b></b><u></u></div><div class="tt-wplus tt-hl" ${ d( 3 ) }>+</div></div>` ),
		attach: () => phone( `<div class="tt-row"><i class="tt-ic"></i><span><b></b><u></u></span><em></em><span class="tt-badges"><s class="tt-badge r tt-in" ${ d( 1.4 ) }>🧾</s><s class="tt-badge p tt-in" ${ d( 2.2 ) }>🖼</s></span></div><div class="tt-attach"><s class="tt-photo tt-hl" ${ d( .4 ) }>🖼</s><svg class="tt-check2" viewBox="0 0 24 24" width="28" height="28"><circle cx="12" cy="12" r="11" fill="#22a06b"/><path d="M6.5 12.5l3.8 3.8 7.2-8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>` ),
		dup: () => phone( `<div class="tt-form"><div class="tt-pill">Cash</div><div class="tt-amt">€ 3.50</div><div class="tt-row"><i class="tt-ic"></i><span><b></b><u></u></span><em></em></div></div>` ) + `<div class="tt-modal"><div class="tt-twins"><i class="tt-twin a"></i><i class="tt-twin b"></i><s class="tt-eq">=</s></div><div class="tt-mrow"><b></b><u></u></div><div class="tt-mbtns"><s class="x"></s><s class="ok"></s></div></div><span class="tt-finger dup"></span>`,
		daily: () => phone( `<div class="tt-dcard"><svg viewBox="0 0 36 36" width="66" height="66"><circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="4"/><circle class="tt-arc2" cx="18" cy="18" r="15" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" transform="rotate(-90 18 18)"/></svg><div><u></u><span class="tt-big"><b style="--d:0s">€48</b><b style="--d:1.4s">€42</b><b style="--d:2.8s">€37</b></span></div></div><div class="tt-fx">${ chip( 'bills', 0.6 ) }${ chip( 'budget', 1.6 ) }${ chip( 'today', 2.6 ) }</div>${ rows( 1 ) }` ),
		filters: () => phone( `<div class="tt-fgrid"><div class="tt-inp tt-hl" ${ d( 0 ) }><b>5</b></div><div class="tt-inp tt-hl" ${ d( .9 ) }><b>50</b></div><div class="tt-inp tt-hl" ${ d( 1.8 ) }><b>1/10</b></div><div class="tt-inp tt-hl" ${ d( 2.7 ) }><b>31/10</b></div></div><div class="tt-row fade1"><i class="tt-ic"></i><span><b></b><u></u></span><em></em></div><div class="tt-row"><i class="tt-ic c1"></i><span><b></b><u></u></span><em></em></div><div class="tt-row fade2"><i class="tt-ic c2"></i><span><b></b><u></u></span><em></em></div>` ),
		trash: () => phone( `<div class="tt-row tt-del"><i class="tt-ic"></i><span><b></b><u></u></span><em></em></div>${ rows( 1 ) }<div class="tt-bin">🗑</div><div class="tt-back-row tt-restore"><i class="tt-ic"></i><span><b></b><u></u></span><s>↺</s></div>` ),
		streak: () => phone( `<div class="tt-flamebox"><svg class="tt-flame" viewBox="0 0 24 32" width="64" height="84"><path d="M12 1c1 5 8 8 8 17a8 8 0 0 1-16 0c0-4 2-6 3-9 1 2 2 3 3 3 1-3 1-6 2-11z" fill="#ff7a18"/><path class="tt-core" d="M12 14c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-5 .5 1 1 1.5 1.5 1.5.5-1.500.5-3 .5-4.5z" fill="#ffd23f"/></svg><span class="tt-count2">${ [ 1, 2, 3, 4, 5 ].map( ( n ) => `<b style="--d:${ ( n - 1 ) * .9 }s" class="${ n === 5 ? 'last' : '' }">${ n }</b>` ).join( '' ) }</span></div><div class="tt-weekdots">${ Array.from( { length: 7 }, ( _, k ) => `<i class="tt-dot" ${ d( k * .55 ) }></i>` ).join( '' ) }</div>` ),
		price: () => phone( `<div class="tt-row"><i class="tt-ic c2"></i><span><b></b><u></u></span><em class="late"></em><s class="tt-chip2">↗ 12%</s></div>${ rows( 1 ) }<div class="tt-pricetoast"><i></i><span><b></b><u></u></span></div>` ),
	};
	const LIST = [
		{ id: 'scan', icon: 'receipt', feature: 'receipts', tour: 1 }, { id: 'swipe', icon: 'arrows-sort', tour: 1 }, { id: 'hold', icon: 'hand-click', tour: 1 }, { id: 'quick', icon: 'pencil', tour: 1 },
		{ id: 'first', icon: 'plus' }, { id: 'wallets', icon: 'wallet' }, { id: 'attach', icon: 'photo', feature: 'photos' }, { id: 'bills', icon: 'calendar-event' }, { id: 'recurring', icon: 'repeat', feature: 'recurring' },
		{ id: 'budgets', icon: 'target', feature: 'plan' }, { id: 'reports', icon: 'chart-pie' }, { id: 'notify', icon: 'bell', feature: 'push' },
		{ id: 'themes', icon: 'palette', feature: 'themeEdit' }, { id: 'features', icon: 'sparkles' }, { id: 'avatar', icon: 'mood-smile', feature: 'avatar' },
		{ id: 'home', icon: 'layout-dashboard', feature: 'homeEdit' },
		{ id: 'dup', icon: 'copy', feature: 'dupGuard', fresh: 1 }, { id: 'daily', icon: 'sun', feature: 'daily', fresh: 1 }, { id: 'filters', icon: 'adjustments-horizontal', feature: 'filters', fresh: 1 }, { id: 'trash', icon: 'trash', feature: 'trash', fresh: 1 }, { id: 'streak', icon: 'flame', feature: 'streaks', fresh: 1 }, { id: 'price', icon: 'trending-up', feature: 'priceAlert', fresh: 1 }, { id: 'sync', icon: 'refresh' }, { id: 'shared', icon: 'users', feature: 'shared' }, { id: 'backup', icon: 'database-export' },
	];
	T.list = () => LIST.filter( ( x ) => ! x.feature || EX.feature?.( x.feature ) !== false );
	const touch = () => UI.isPhone();
	const isNew = ( id ) => !! LIST.find( ( x ) => x.id === id && x.fresh );
	const body = ( id ) => `<div class="tt-phone${ isNew( id ) ? ' fancy' : '' }" aria-hidden="true">${ DEMOS[ id ]() }</div><ol class="tt-steps">${ [ 1, 2, 3 ].map( ( n ) => `<li>${ esc( t( `tut_${ id }_${ n }` ) ) }</li>` ).join( '' ) }</ol>`;
	const head = ( title, close = true ) => `<div class="sheet-head">${ close ? `<button class="ab-btn" data-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button>` : '' }<h2>${ esc( title ) }</h2></div>`;
	T.body = body;
	/** A few of the newer helpers, one animated slide at a time (used in first-time setup). */
	T.carousel = () => {
		const ids = [ 'daily', 'streak', 'dup', 'filters', 'trash', 'price' ].filter( ( id ) => T.list().some( ( x ) => x.id === id ) ); if ( ! ids.length ) return '';
		return `<div class="tt-car" data-car="0"><div class="tt-car-slides">${ ids.map( ( id, i ) => `<div class="tt-slide${ i ? '' : ' on' }" data-slide="${ i }"><div class="tt-phone fancy" aria-hidden="true">${ DEMOS[ id ]() }</div><h3>${ esc( t( 'tut_' + id ) ) }</h3><p>${ esc( t( 'tutD_' + id ) ) }</p></div>` ).join( '' ) }</div><div class="tt-navbar"><button type="button" class="btn btn-ghost tt-nav" data-car-nav="-1" aria-label="${ esc( t( 'tutPrev' ) ) }">${ UI.icon( 'chevron-left', 22 ) }</button><span class="tt-pos"><b data-car-pos>1</b> / ${ ids.length }</span><button type="button" class="btn btn-ghost tt-nav" data-car-nav="1" aria-label="${ esc( t( 'tutNext' ) ) }">${ UI.icon( 'chevron-right', 22 ) }</button></div></div>`;
	};
	document.addEventListener( 'click', ( e ) => {
		const b = e.target.closest( '[data-car-nav]' ); if ( ! b ) return; e.preventDefault(); e.stopImmediatePropagation();
		const car = b.closest( '[data-car]' ), slides = [ ...car.querySelectorAll( '.tt-slide' ) ], cur = slides.findIndex( ( s ) => s.classList.contains( 'on' ) ), next = Math.max( 0, Math.min( slides.length - 1, cur + Number( b.dataset.carNav ) ) );
		slides.forEach( ( s, i ) => s.classList.toggle( 'on', i === next ) ); car.querySelector( '[data-car-pos]' ).textContent = String( next + 1 );
	}, true );
	T.view = () => `<section class="card"><p class="muted small">${ esc( t( 'tutIntro' ) ) }</p><div class="list mlist">${ T.list().map( ( x ) => `<button type="button" class="mrow" data-tut="${ x.id }">${ UI.ci( x.icon, 'teal', 36 ) }<span class="mid"><b>${ esc( t( 'tut_' + x.id ) ) }${ x.fresh ? `<span class="tut-new">${ esc( t( 'tutNew' ) ) }</span>` : '' }</b><small>${ esc( t( 'tutD_' + x.id ) ) }</small></span>${ UI.icon( 'chevron-right', 18 ) }</button>` ).join( '' ) }</div><div class="btn-row"><button type="button" class="btn btn-ghost" data-tour="start">${ UI.icon( 'refresh', 20 ) } ${ esc( t( 'tourReplay' ) ) }</button></div></section>`;
	T.open = ( id ) => {
		const ids = T.list().map( ( x ) => x.id ), i = ids.indexOf( id );
		const nav = ( dir, icon, off, label ) => `<button type="button" class="btn btn-ghost tt-nav" data-tut-nav="${ dir }"${ off ? ' disabled' : '' } aria-label="${ esc( t( label ) ) }">${ UI.icon( icon, 22 ) }</button>`;
		UI.openSheet( head( t( 'tut_' + id ) ) + `<div class="sheet-pad tt">${ body( id ) }<div class="tt-navbar">${ nav( 'prev', 'chevron-left', i <= 0, 'tutPrev' ) }<span class="tt-pos">${ i + 1 } / ${ ids.length }</span>${ nav( 'next', 'chevron-right', i >= ids.length - 1, 'tutNext' ) }</div><div class="btn-row"><button type="button" class="btn btn-primary" data-close>${ esc( t( 'tutDone' ) ) }</button></div></div>`, { tall: true } );
		T.current = id;
	};

	/* ---- tour */
	let seq = [], at = 0;
	const step = () => {
		const id = seq[ at ], last = at === seq.length - 1;
		UI.openSheet( head( t( 'tut_' + id ), false ) + `<div class="sheet-pad tt"><p class="tt-count">${ esc( t( 'tourStep', { n: at + 1, total: seq.length } ) ) }</p>${ body( id ) }<div class="btn-row"><button type="button" class="btn btn-ghost" data-tour="skip">${ esc( t( 'tourSkip' ) ) }</button><button type="button" class="btn btn-primary" data-tour="next">${ esc( t( last ? 'tourDone' : 'tourNext' ) ) }</button></div></div>`, { tall: true, lock: true } );
	};
	const end = () => { EX.state().device.tourDone = true; EX.persist(); UI.closeSheet( true ); };
	const tourIds = () => T.list().filter( ( x ) => x.tour ).map( ( x ) => x.id ).filter( ( id ) => touch() || ! [ 'swipe', 'hold' ].includes( id ) );
	T.start = () => { seq = tourIds(); if ( ! seq.length ) return; at = 0; step(); };
	T.maybeStart = () => { const d = EX.state().device; if ( d.tourDone || EXA.flow.active() ) return; T.start(); };
	document.addEventListener( 'click', ( e ) => {
		const nv = e.target.closest( '[data-tut-nav]' );
		if ( nv ) { e.preventDefault(); e.stopImmediatePropagation(); const ids = T.list().map( ( x ) => x.id ), i = ids.indexOf( T.current ) + ( nv.dataset.tutNav === 'next' ? 1 : -1 ); if ( ids[ i ] ) T.open( ids[ i ] ); return; }
		const b = e.target.closest( '[data-tut],[data-tour]' ); if ( ! b ) return;
		e.preventDefault(); e.stopImmediatePropagation();
		if ( b.dataset.tut ) { T.open( b.dataset.tut ); return; }
		const a = b.dataset.tour;
		if ( a === 'start' ) { UI.closeSheet( true ); seq = tourIds(); at = 0; step(); }
		else if ( a === 'skip' ) end();
		else if ( a === 'next' ) { if ( at >= seq.length - 1 ) end(); else { at++; step(); } }
	}, true );
}() );
