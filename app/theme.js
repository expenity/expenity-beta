// Applies the saved theme, mode and motion setting before the page draws, so there is no flash. (A separate file because the page's security policy forbids inline scripts.)
try {
	var r = document.documentElement, g = function ( k ) { return localStorage.getItem( k ); };
	var t = g( 'expenity.theme' ), s = g( 'expenity.skin' ), m = g( 'expenity.motion' );
	if ( t === 'dark' || t === 'light' ) r.dataset.theme = t;
	if ( s && /^(vader|mario|bricks|minnie|minimal|paper|ledger|terminal|synthwave|amberwave|ion|custom|blueprint|candy|oled|glass|sunset|chalk)$/.test( s ) ) r.dataset.skin = s;
	if ( m === 'full' || m === 'reduced' || m === 'off' ) r.dataset.motion = m;
} catch ( e ) { /* ignore */ }
