/**
 * Right-click menu (computers): the app's own menu instead of the browser's. On an entry or a bill it offers the same actions
 * as swiping or holding a row; on empty space it offers the quick add actions, Search and Reports. Text fields keep the
 * browser's menu (copy, paste, spelling), and Shift + right-click always opens it. Touch screens use the hold menu (rowmenu.js).
 */
( function () {
	'use strict';
	const { EX, UI, EXA } = window, { t, esc } = EX;
	let menu = null;
	const close = () => { const m = menu; menu = null; if ( m && m.isConnected ) m.remove(); };
	const item = ( icon, key, name, cls = '' ) => `<button type="button" role="menuitem" class="cm-item ${ cls }" data-cm="${ name }">${ UI.icon( icon, 20 ) }<span>${ esc( t( key ) ) }</span></button>`;
	const show = ( x, y, html ) => {
		close();
		menu = document.createElement( 'div' ); menu.className = 'ctxmenu'; menu.setAttribute( 'role', 'menu' ); menu.innerHTML = html;
		document.body.append( menu );
		const w = menu.offsetWidth, h = menu.offsetHeight;
		menu.style.left = Math.max( 8, Math.min( x, innerWidth - w - 8 ) ) + 'px'; menu.style.top = Math.max( 8, Math.min( y, innerHeight - h - 8 ) ) + 'px';
		const first = menu.querySelector( '.cm-item' ); if ( first ) first.focus();
	};
	const on = () => ! ( EX.feature && EX.feature( 'ctxMenu' ) === false ) && ! ( EXA.flow && EXA.flow.active() );
	document.addEventListener( 'contextmenu', ( e ) => {
		if ( e.shiftKey || ! on() || e.pointerType === 'touch' || ( window.matchMedia && window.matchMedia( '(hover: none)' ).matches ) ) return;
		if ( UI.sheetOpen() || document.querySelector( 'dialog[open]' ) ) return;
		if ( e.target.closest( 'input, textarea, select, [contenteditable], a[href], pre, code, .selectable, .ctxmenu' ) ) return;
		e.preventDefault();
		const row = e.target.closest( '.sw' );
		if ( row && row.dataset.id ) {
			const kind = row.dataset.kind, id = row.dataset.id;
			show( e.clientX, e.clientY, `${ kind === 'bill' ? item( 'check', 'actPaid', 'paid', 'ok' ) : '' }${ item( 'pencil', 'actEdit', 'edit' ) }${ item( 'copy', 'duplicateRecord', 'duplicate' ) }${ item( 'trash', 'actDelete', 'del', 'danger' ) }` );
			menu.dataset.kind = kind; menu.dataset.id = id; return;
		}
		show( e.clientX, e.clientY, `${ item( 'arrow-up-right', 'typeExpense', 'expense' ) }${ item( 'arrow-down-left', 'typeIncome', 'income' ) }${ item( 'calendar-event', 'tileBill', 'bill' ) }<hr>${ item( 'search', 'searchOpen', 'search' ) }${ item( 'chart-pie', 'tabReports', 'reports' ) }` );
	} );
	document.addEventListener( 'click', ( e ) => {
		const b = e.target.closest( '.ctxmenu [data-cm]' );
		if ( ! b ) { if ( menu && ! e.target.closest( '.ctxmenu' ) ) close(); return; }
		const a = b.dataset.cm, kind = menu.dataset.kind, id = menu.dataset.id; close();
		if ( id ) { const live = document.querySelector( `.sw[data-id="${ id }"]` ) || document; live.dispatchEvent( new CustomEvent( 'swipeaction', { bubbles: true, detail: { action: a, id, kind } } ) ); return; }
		if ( a === 'expense' ) EXA.openTx( null, { type: 'expense' } );
		else if ( a === 'income' ) EXA.openTx( null, { type: 'income' } );
		else if ( a === 'bill' ) EXA.openBill();
		else if ( a === 'search' ) document.dispatchEvent( new KeyboardEvent( 'keydown', { key: '/', bubbles: true } ) );
		else if ( a === 'reports' ) EXA.go( 'reports' );
	} );
	document.addEventListener( 'keydown', ( e ) => {
		if ( ! menu ) return;
		if ( e.key === 'Escape' ) { close(); e.preventDefault(); return; }
		if ( e.key === 'ArrowDown' || e.key === 'ArrowUp' ) {
			const items = [ ...menu.querySelectorAll( '.cm-item' ) ], i = items.indexOf( document.activeElement );
			items[ ( i + ( e.key === 'ArrowDown' ? 1 : -1 ) + items.length ) % items.length ].focus(); e.preventDefault();
		}
	} );
	[ 'scroll', 'resize' ].forEach( ( n ) => window.addEventListener( n, close, true ) );
	window.addEventListener( 'blur', ( e ) => { if ( e.target === window ) close(); } );
}() );

Object.assign( window.EX.I18N.langs.en, { fx_ctxMenu: 'Right-click menu', fxD_ctxMenu: 'A menu with quick actions when you right-click on a computer.' } );
Object.assign( window.EX.I18N.langs.el, { fx_ctxMenu: 'Μενού δεξιού κλικ', fxD_ctxMenu: 'Ένα μενού με γρήγορες ενέργειες όταν κάνετε δεξί κλικ σε υπολογιστή.' } );
