/** Press and hold an entry or bill: a menu with Edit, Duplicate, Delete (and Paid for bills), plus a small animation showing that holding is not needed, dragging the row sideways does the same. */
( function () {
	'use strict';
	const { EX, UI } = window, { t, esc } = EX;
	let timer = null, x0 = 0, y0 = 0, row = null, fired = 0;
	const HOLD = 480;
	const act = ( icon, key, name, cls = '' ) => `<button type="button" class="rm-act ${ cls }" data-rm="${ name }">${ UI.icon( icon, 22 ) }<span>${ esc( t( key ) ) }</span></button>`;
	function open( r ) {
		const kind = r.dataset.kind, id = r.dataset.id;
		const rec = ( kind === 'tx' ? EX.state().txs : EX.state().bills ).find( ( x ) => x.id === id ); if ( ! rec ) return;
		const title = rec.name || ( EX.catInfo( rec.category ) || {} ).name || '';
		UI.haptic && UI.haptic( 30 );
		UI.openSheet( `<div class="sheet-head"><button class="ab-btn" data-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button><h2>${ esc( title ) }</h2></div><div class="sheet-pad rm">
			<div class="rm-list">${ kind === 'bill' ? act( 'check', 'actPaid', 'paid', 'ok' ) : '' }${ act( 'pencil', 'actEdit', 'edit' ) }${ act( 'copy', 'duplicateRecord', 'duplicate' ) }${ act( 'trash', 'actDelete', 'del', 'danger' ) }</div>
			<div class="rm-tip" aria-hidden="true"><div class="rm-demo"><i class="rm-back l"></i><i class="rm-back r"></i><b class="rm-front"><span></span><span></span></b><em class="rm-finger"></em></div><p>${ esc( t( 'rowMenuTip' ) ) }</p></div></div>`, { cls: 'small' } );
		const sheet = document.getElementById( 'sheet' );
		sheet.querySelector( '.rm' ).addEventListener( 'click', ( e ) => {
			const b = e.target.closest( '[data-rm]' ); if ( ! b ) return;
			const action = b.dataset.rm; UI.closeSheet( true );
			setTimeout( () => r.isConnected && r.dispatchEvent( new CustomEvent( 'swipeaction', { bubbles: true, detail: { action, id, kind } } ) ), 60 );
		} );
	}
	const cancel = () => { clearTimeout( timer ); timer = null; row = null; };
	document.addEventListener( 'pointerdown', ( e ) => {
		if ( e.button > 0 || e.target.closest( '.sw-act' ) ) return;
		const r = e.target.closest( '.sw' ); if ( ! r || r.classList.contains( 'open' ) ) return;
		row = r; x0 = e.clientX; y0 = e.clientY; clearTimeout( timer );
		timer = setTimeout( () => { const target = row; cancel(); if ( target ) { fired = performance.now(); if ( UI.swipeClose ) UI.swipeClose(); open( target ); } }, HOLD );
	}, { passive: true } );
	document.addEventListener( 'pointermove', ( e ) => { if ( timer && Math.hypot( e.clientX - x0, e.clientY - y0 ) > 9 ) cancel(); }, { passive: true } );
	[ 'pointerup', 'pointercancel', 'scroll' ].forEach( ( n ) => document.addEventListener( n, cancel, { passive: true, capture: true } ) );
	// The release after a long press must not also open the row.
	document.addEventListener( 'click', ( e ) => { if ( performance.now() - fired < 700 && e.target.closest( '.sw' ) ) { e.preventDefault(); e.stopImmediatePropagation(); } }, true );
	// Holding must never start a text selection (iOS shows selection handles otherwise).
	document.addEventListener( 'selectstart', ( e ) => { const n = e.target.nodeType === 1 ? e.target : e.target.parentElement; if ( n && ! n.closest( 'input, textarea, select, [contenteditable], pre, code, .selectable' ) ) e.preventDefault(); } );
	document.addEventListener( 'contextmenu', ( e ) => { if ( e.target.closest( '.sw' ) ) e.preventDefault(); } );
}() );
