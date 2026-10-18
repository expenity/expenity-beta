/** Disables pinch and Ctrl-scroll zoom (double-tap zoom is off through touch-action: manipulation). iOS Safari ignores user-scalable=no, so its gesture events are cancelled too. */
( function () {
	'use strict';
	const stop = ( e ) => e.preventDefault();
	[ 'gesturestart', 'gesturechange', 'gestureend' ].forEach( ( n ) => document.addEventListener( n, stop, { passive: false } ) );
	document.addEventListener( 'touchmove', ( e ) => { if ( e.touches && e.touches.length > 1 && ! e.target.closest( '.receipt-focus-stage' ) ) e.preventDefault(); }, { passive: false } );
	window.addEventListener( 'wheel', ( e ) => { if ( e.ctrlKey ) e.preventDefault(); }, { passive: false } );
	window.addEventListener( 'keydown', ( e ) => { if ( ( e.ctrlKey || e.metaKey ) && [ '+', '-', '=', '0' ].includes( e.key ) ) e.preventDefault(); } );
}() );
