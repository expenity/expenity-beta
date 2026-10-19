/* Expenity start screen: the logo with the tick drawing itself, floating coins and a progress bar. It stays for at least two
 * seconds while the app loads behind it. If the app is still loading after that, a playful message appears (in the language
 * chosen in the app) and changes every couple of seconds until the app is ready. */
( function () {
	'use strict';
	const el = document.getElementById( 'splash' );
	if ( ! el ) return;
	if ( navigator.webdriver ) { el.remove(); window.EXSplashDone = () => {}; return; } // automated tests run without it
	// Only when the app is opened (a new launch or a new tab), never when the page is refreshed or the tab is revisited.
	let again = false;
	try {
		const nav = performance.getEntriesByType( 'navigation' )[ 0 ];
		again = !! nav && ( nav.type === 'reload' || nav.type === 'back_forward' );
		if ( sessionStorage.getItem( 'expenity.splashSeen' ) ) again = true;
		sessionStorage.setItem( 'expenity.splashSeen', '1' );
	} catch ( e ) { /* ignore */ }
	if ( again ) { el.remove(); window.EXSplashDone = () => {}; return; }
	// A custom theme keeps its colours in the browser; the other themes come from the page's own style variables.
	try {
		if ( document.documentElement.dataset.skin === 'custom' ) {
			const p = JSON.parse( localStorage.getItem( 'expenity.custom' ) || '{}' ), ok = ( v ) => /^#[0-9a-f]{6}$/i.test( v || '' );
			[ 'bg', 'surface', 'ink', 'accent' ].forEach( ( k ) => { if ( ok( p[ k ] ) ) el.style.setProperty( '--' + k, p[ k ] ); } );
		}
	} catch ( e ) { /* ignore */ }
	// Animated themes bring their character to the start screen too (and their little friends float by).
	try {
		const ART = {
			mario: { hero: 'mario-pencil-v4.png', floats: [ 'goomba-pencil-v1.png', 'mushroom-pencil-v1.png', 'boo-pencil-v1.png', 'star-pencil-v1.png' ] },
			minnie: { hero: 'minnie-cutout-v1.png' },
			vader: { hero: 'vader-cutout-v1.png', floats: [ 'orbit-fighter.svg', 'orbit-cruiser.svg' ] },
			bricks: { hero: 'brick-pencil-v3.webp', floats: [ 'brick-cluster-v2.webp' ] },
		}[ document.documentElement.dataset.skin || '' ];
		let fxOff = false; try { fxOff = ( localStorage.getItem( 'expenity.fxoff' ) || '' ).split( ',' ).includes( document.documentElement.dataset.skin || '' ); } catch ( e ) { /* ignore */ }
		if ( fxOff ) el.dataset.nofx = '1';
		if ( ART ) {
			const add = ( file, cls, style ) => { const im = document.createElement( 'img' ); im.src = 'assets/themes/' + file; im.alt = ''; im.className = cls; if ( style ) im.style.cssText = style; im.decoding = 'async'; el.appendChild( im ); };
			if ( ART.floats ) { el.dataset.art = '1'; [ [ 8, 70 ], [ 74, 62 ], [ 16, 24 ], [ 80, 22 ], [ 50, 82 ], [ 38, 12 ] ].forEach( ( p, n ) => add( ART.floats[ n % ART.floats.length ], 'sp-img', `left:${ p[ 0 ] }%;top:${ p[ 1 ] }%;--d:${ 5 + n * .4 }s;--w:${ n * .5 }s` ) ); }
			add( ART.hero, 'sp-char' ); el.dataset.skinArt = document.documentElement.dataset.skin;
		}
	} catch ( e ) { /* ignore */ }
	let lang = 'en';
	try { lang = localStorage.getItem( 'expenity.lang' ) || ( /^el/i.test( navigator.language || '' ) ? 'el' : 'en' ); } catch ( e ) { /* ignore */ }
	const MSG = {
		en: [ 'Counting coins…', 'Sharpening pencils…', 'Teaching the piggy bank new tricks…', 'Polishing the receipts…', 'Waking up the calculator…', 'Folding the banknotes neatly…' ],
		el: [ 'Μετράμε τα κέρματα…', 'Ξύνουμε τα μολύβια…', 'Μαθαίνουμε νέα κόλπα στον κουμπαρά…', 'Γυαλίζουμε τις αποδείξεις…', 'Ξυπνάμε την αριθμομηχανή…', 'Διπλώνουμε προσεκτικά τα χαρτονομίσματα…' ],
	};
	const list = MSG[ lang ] || MSG.en, msg = document.getElementById( 'spMsg' );
	const calm = window.matchMedia && window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
	let ready = false, minDone = calm, shown = false, i = Math.floor( Math.random() * list.length ), timer = 0;
	const hide = () => {
		if ( shown ) return; shown = true; clearInterval( timer );
		el.classList.add( 'out' ); setTimeout( () => el.remove(), 600 );
	};
	const say = () => { msg.classList.remove( 'on' ); setTimeout( () => { msg.textContent = list[ i++ % list.length ]; msg.classList.add( 'on' ); }, 220 ); };
	setTimeout( () => {
		minDone = true;
		if ( ready ) return hide();
		say(); timer = setInterval( say, 2200 ); // still loading: keep the person company
	}, 2000 );
	window.EXSplashDone = () => { ready = true; if ( minDone ) hide(); };
	setTimeout( hide, 20000 ); // never block the app
}() );
