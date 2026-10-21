/** Demo mode for the website's live preview (?demo=1): sample data, no setup, and nothing is saved (see theme.js). */
( function () {
	'use strict';
	if ( ! window.EXPENITY_DEMO ) return;
	// The playable chat on the website: a cover hides the app while it loads in the background, then fades away on the chat.
	let cover = null;
	// In the embedded demo the visit ends where the plan would be made: nothing else of the app (account, settings, reset) is reachable.
	window.EXAEmbedEnd = () => {
		if ( document.querySelector( '.ef-embed-end' ) ) return;
		const el = ( window.EX && EX.lang && EX.lang() ) === 'el', lang = el ? 'el' : 'en';
		const box = document.createElement( 'div' ); box.className = 'ef-embed-end'; box.setAttribute( 'role', 'dialog' ); box.setAttribute( 'aria-modal', 'true' );
		const app = location.pathname.replace( /[^/]*$/, '' ) + '?lang=' + lang;
		box.innerHTML = `<div class="ef-end-card"><div class="ef-end-em">🎬</div><h2>${ el ? 'Αυτό ήταν το demo!' : 'That is the demo!' }</h2><p>${ el ? 'Αυτό ήταν το eFriend, ζωντανά. Για να φτιάξετε δικό σας σχέδιο, ανοίξτε το Expenity.' : 'That was eFriend, live. To make a plan of your own, open Expenity.' }</p><div class="ef-end-btns"><a class="btn btn-primary" href="${ app }" target="_top" rel="noopener">${ el ? 'Άνοιγμα του Expenity' : 'Open Expenity' }</a><a class="btn btn-ghost" href="${ location.pathname }?demo=1&ask=1&lang=${ lang }">${ el ? '↻ Ξανά από την αρχή' : '↻ Try again' }</a></div></div>`;
		document.body.appendChild( box );
	};
	const waitMode = /[?&]ask=wait/.test( location.search ); let ready = false, wanted = false, doOpen = null;
	window.addEventListener( 'message', ( e ) => { if ( e.data === 'ef-open' ) { if ( ready && doOpen ) doOpen(); else wanted = true; } } );
	if ( /[?&]ask=(1|wait)/.test( location.search ) ) {
		document.documentElement.classList.add( 'ef-embed' );
		cover = document.createElement( 'div' ); cover.className = 'ef-embed-load'; cover.setAttribute( 'aria-hidden', 'true' );
		cover.innerHTML = '<svg viewBox="0 0 120 100" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M24 28q-3-18 12-20 8 4 10 14M96 28q3-18-12-20-8 4-10 14"/><rect x="20" y="18" width="80" height="66" rx="28"/><rect x="31" y="31" width="58" height="40" rx="15"/><rect x="41" y="42" width="10" height="12" rx="3" fill="currentColor" stroke="none"/><path d="M70 48h12M52 62q8 7 16 0"/></svg><span class="dots"><i></i><i></i><i></i></span>';
		( document.body || document.documentElement ).appendChild( cover );
	}
	let tries = 0;
	const seed = () => {
		const X = window.EX, A = window.EXA;
		if ( ! X || ! A || ! A.skipFlow || ! document.querySelector( '#tabbar button' ) ) { if ( tries++ < 100 ) setTimeout( seed, 100 ); return; }
		const S = X.state(), td = X.today(), t = X.t, el = X.lang() === 'el';
		S.settings.currency = 'EUR'; S.settings.name = el ? 'Δανάη' : 'Danae'; S.settings.aims = [ 'save', 'subs', 'spend' ]; S.settings.helpIcons = false; S.accounts.length = 0;
		S.accounts.push( { id: 'w1', name: t( 'wtBank' ), type: 'bank', currency: 'EUR', opening: '1200' }, { id: 'w2', name: t( 'wtCash' ), type: 'cash', currency: 'EUR', opening: '80' }, { id: 'w3', name: t( 'wtSavings' ), type: 'savings', currency: 'EUR', opening: '5400' } );
		const add = ( type, amount, category, off, name, account = 'w1' ) => S.txs.push( { id: X.uid(), type, amount: String( amount ), category, date: X.addDays( td, off ), name, account } );
		for ( let m = 0; m < 6; m++ ) { add( 'income', 1800 + m * 40, 'salary', -m * 30 - 9, t( 'cat_salary' ) ); [ [ 'food', 210 + m * 15 ], [ 'transport', 80 + m * 5 ], [ 'leisure', 90 ], [ 'shopping', 120 + m * 20 ], [ 'health', 35 ] ].forEach( ( [ c, a ], i ) => add( 'expense', a, c, -m * 30 - i * 2 - 1, t( 'cat_' + c ) ) ); }
		add( 'expense', 3.5, 'food', 0, t( 'sampleCoffee' ), 'w2' ); add( 'expense', 42.3, 'food', -1, t( 'cat_food' ) ); add( 'expense', 18.4, 'food', -3, 'efood' ); add( 'expense', 22.1, 'food', -9, 'Wolt' );
		const mk = ( key, amount, cat, repeat, off, extra = {} ) => S.bills.push( Object.assign( { id: X.uid(), name: t( key ), amount: String( amount ), currency: 'EUR', category: cat, repeat, next: X.addDays( td, off ), day: X.parse( X.addDays( td, off ) ).getDate(), lead: null, account: 'w1' }, extra ) );
		mk( 'sampleRent', 850, 'housing', 'monthly', 4 ); mk( 'sampleElectricity', 64.2, 'utilities', 'monthly', -2, { variable: true } ); mk( 'tourSubscription', 15.99, 'subscriptions', 'monthly', 1 ); mk( 'sampleGym', 35, 'health', 'monthly', 16 );
		S.budgets.push( { id: 'bg1', category: 'food', amount: '300', period: 'monthly', rollover: false }, { id: 'bg3', category: 'all', amount: '1500', period: 'monthly', rollover: true } );
		S.goals.push( { id: 'g1', name: t( 'goalPreset_trip' ), target: '2000', deadline: X.addDays( td, 150 ), icon: 'plane' } );
		S.txs.push( { id: 'gt1', type: 'expense', amount: '700', account: 'w1', category: 'goal', date: X.addDays( td, -20 ), name: t( 'goalPreset_trip' ), goalId: 'g1' } );
		S.incomes.push( { id: 'i1', name: t( 'cat_salary' ), amount: '1900', currency: 'EUR', account: 'w1', repeat: 'monthly', next: X.addDays( td, 11 ), day: 1, category: 'salary' } );
		Object.assign( S.device, { bannerDismissed: true, scanHoldHintSeen: true, installDismissed: true, tourDone: true, efOnboard: 1, goalsDiscovered: true, dashboardHintSeen: true } );
		A.skipFlow(); A.go( 'home' );
		if ( cover ) { doOpen = () => { doOpen = null; if ( A.efriendAskOpen ) A.efriendAskOpen(); setTimeout( () => { cover.classList.add( 'out' ); setTimeout( () => cover.remove(), 800 ); }, 300 ); }; setTimeout( () => { ready = true; if ( ! waitMode || wanted ) doOpen(); }, 1800 ); } // the playable chat on the eFriend page
		document.documentElement.dataset.demoReady = '1';
	};
	seed();
}() );
