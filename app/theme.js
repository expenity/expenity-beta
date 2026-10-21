// Demo mode (?demo=1 is what the website's live preview loads): everything is kept in memory, so a visitor's own data, theme and language are never touched.
try {
	if ( /[?&]demo=1(&|$)/.test( location.search ) ) {
		var mem = {}, ms = { getItem: function ( k ) { return Object.prototype.hasOwnProperty.call( mem, k ) ? mem[ k ] : null; }, setItem: function ( k, v ) { mem[ k ] = String( v ); }, removeItem: function ( k ) { delete mem[ k ]; }, clear: function () { mem = {}; }, key: function ( i ) { return Object.keys( mem )[ i ] || null; } };
		Object.defineProperty( ms, 'length', { get: function () { return Object.keys( mem ).length; } } );
		Object.defineProperty( window, 'localStorage', { value: ms, configurable: true } );
		window.EXPENITY_DEMO = true;
		var sk = /[?&]skin=([a-z]+)/.exec( location.search ); if ( sk ) mem[ 'expenity.skin' ] = sk[ 1 ];
	}
} catch ( e ) { /* ignore */ }
// Applies the saved theme, mode and motion setting before the page draws, so there is no flash. (A separate file because the page's security policy forbids inline scripts.)
try {
	var r = document.documentElement, g = function ( k ) { return localStorage.getItem( k ); };
	var t = g( 'expenity.theme' ), s = g( 'expenity.skin' ), m = g( 'expenity.motion' );
	if ( t === 'dark' || t === 'light' ) r.dataset.theme = t;
	if ( ! s && ! g( 'expenity.v2' ) ) { s = 'sunset'; localStorage.setItem( 'expenity.skin', s ); } // first visit: Sunset. People who already use the app and never chose a theme keep the original green.
	if ( s && /^(vader|mario|bricks|minnie|minimal|mobie|paper|ledger|terminal|synthwave|amberwave|ion|custom|blueprint|candy|oled|glass|sunset|chalk|cassette)$/.test( s ) ) r.dataset.skin = s;
	if ( m === 'full' || m === 'reduced' || m === 'off' ) r.dataset.motion = m;
	if ( g( 'expenity.density' ) === 'compact' ) r.dataset.density = 'compact';
	var ss = g( 'expenity.status' ); r.dataset.status = /^(off|low|normal|full)$/.test( ss ) ? ss : 'normal'; // status colours: normal for everyone unless chosen otherwise
} catch ( e ) { /* ignore */ }
// The app is never meant to be shown inside another page (clickjacking). GitHub Pages cannot send frame-ancestors, so it is enforced here.
try { if ( window.top !== window.self && ! window.EXPENITY_DEMO ) { document.documentElement.style.display = 'none'; window.top.location = window.self.location; } } catch ( e ) { document.documentElement.style.display = 'none'; }
