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
