/** Disables pinch and Ctrl-scroll zoom (double-tap zoom is off through touch-action: manipulation). iOS Safari ignores user-scalable=no, so its gesture events are cancelled too. */
( function () {
	'use strict';
	const stop = ( e ) => e.preventDefault();
	[ 'gesturestart', 'gesturechange', 'gestureend' ].forEach( ( n ) => document.addEventListener( n, stop, { passive: false } ) );
	document.addEventListener( 'touchmove', ( e ) => { if ( e.touches && e.touches.length > 1 && ! e.target.closest( '.receipt-focus-stage' ) ) e.preventDefault(); }, { passive: false } );
	window.addEventListener( 'wheel', ( e ) => { if ( e.ctrlKey ) e.preventDefault(); }, { passive: false } );
	window.addEventListener( 'keydown', ( e ) => { if ( ( e.ctrlKey || e.metaKey ) && [ '+', '-', '=', '0' ].includes( e.key ) ) e.preventDefault(); } );
}() );

/**
 * The keyboard never opens on its own on a touch device: a text field takes focus only when the person taps it (or its label).
 * Anything that tries to focus a field by itself (a form that opens, an `autofocus`, a script) is ignored. Desktop is unchanged.
 * `EXKB.allow()` lets code keep the keyboard open for a person who is already typing (for example when a field is swapped while they type).
 */
( function () {
	'use strict';
	let touch = false;
	try { touch = ( window.matchMedia && matchMedia( '(pointer: coarse)' ).matches ) || ( 'ontouchstart' in window && navigator.maxTouchPoints > 0 ); } catch ( e ) { /* ignore */ }
	if ( ! touch || ( navigator.webdriver && ! window.EXKB_TEST ) ) return; // automated test drivers focus fields by script, so they are exempt (the keyboard test turns the guard on)
	let last = { el: null, t: 0 };
	[ 'pointerdown', 'touchstart', 'mousedown', 'click' ].forEach( ( n ) => document.addEventListener( n, ( e ) => { last = { el: e.target, t: Date.now() }; }, true ) );
	window.EXKB = { allow() { last = { el: '*', t: Date.now() }; } };
	const opensKeyboard = ( el ) => el.tagName === 'TEXTAREA' || ( el.tagName === 'INPUT' && /^(text|search|email|url|tel|password|number|)$/i.test( el.type || '' ) );
	const allowed = ( el ) => {
		if ( Date.now() - last.t > 600 ) return false; const t = last.el; if ( t === '*' || t === el ) return true;
		if ( ! t || ! t.closest ) return false; const lab = t.closest( 'label' ); return !! ( lab && lab.contains( el ) ) || el.contains( t );
	};
	[ HTMLInputElement.prototype, HTMLTextAreaElement.prototype ].forEach( ( proto ) => [ 'focus', 'select' ].forEach( ( m ) => {
		const orig = proto[ m ]; if ( ! orig ) return;
		proto[ m ] = function ( ...a ) { if ( opensKeyboard( this ) && ! allowed( this ) ) return undefined; return orig.apply( this, a ); };
	} ) );
	document.addEventListener( 'keydown', ( e ) => { if ( e.key === 'Tab' ) last = { el: '*', t: Date.now() }; }, true );
	// The browser itself can focus an `autofocus` field without calling focus(): close it again at once, before the keyboard shows.
	document.addEventListener( 'focusin', ( e ) => { const el = e.target; if ( el && el.tagName && opensKeyboard( el ) && ! allowed( el ) ) { try { el.blur(); } catch ( x ) { /* ignore */ } } }, true );
	const strip = ( root ) => { if ( root.nodeType !== 1 ) return; if ( root.hasAttribute && root.hasAttribute( 'autofocus' ) && opensKeyboard( root ) ) root.removeAttribute( 'autofocus' ); root.querySelectorAll && root.querySelectorAll( 'input[autofocus], textarea[autofocus]' ).forEach( ( x ) => x.removeAttribute( 'autofocus' ) ); };
	strip( document.documentElement ); new MutationObserver( ( ms ) => ms.forEach( ( m ) => m.addedNodes.forEach( strip ) ) ).observe( document.documentElement, { childList: true, subtree: true } );
}() );
