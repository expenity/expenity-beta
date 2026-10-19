/**
 * Amount fields show proper separators as you type, inside the field: 1234567.5 becomes 1,234,567.5 (or 1.234.567,5 in a locale that
 * uses the comma for decimals). Behind the scenes `input.value` still returns the plain number ("1234567.5"), so nothing that
 * reads these fields has to change. Applies to every input with inputmode="decimal", including ones drawn later.
 */
( function () {
	'use strict';
	const EX = window.EX, NATIVE = Object.getOwnPropertyDescriptor( HTMLInputElement.prototype, 'value' );
	const seps = () => {
		try { const p = new Intl.NumberFormat( ( EX.loc && EX.loc() ) || undefined ).formatToParts( 1234567.8 ); return { group: ( p.find( ( x ) => x.type === 'group' ) || {} ).value || ',', dec: ( p.find( ( x ) => x.type === 'decimal' ) || {} ).value || '.' }; } catch ( e ) { return { group: ',', dec: '.' }; }
	};
	/** What the person typed (any mix of digits, . and ,) to { neg, int, dec } where dec is undefined when there is no decimal part. */
	const parse = ( text, plain ) => {
		const s = String( text == null ? '' : text ), neg = /^\s*-/.test( s ), t = s.replace( /[^0-9.,]/g, '' );
		if ( plain ) { const [ a, b ] = t.replace( /,/g, '' ).split( '.' ); return { neg, int: a || '', dec: b === undefined ? undefined : b.slice( 0, 2 ) }; }
		if ( /[.,]$/.test( t ) ) {   // a separator typed last: the decimal point is coming, unless the number already has one
			const p = parse( t.slice( 0, -1 ) ); return p.dec !== undefined ? p : { neg, int: p.int, dec: '' };
		}
		const last = Math.max( t.lastIndexOf( '.' ), t.lastIndexOf( ',' ) );
		if ( last < 0 ) return { neg, int: t, dec: undefined };
		const after = t.slice( last + 1 ), before = t.slice( 0, last );
		// Up to two digits after the last separator, and that separator not already used for grouping: the decimal point. (Three digits: 1,234.)
		if ( after.length <= 2 && ! before.includes( t[ last ] ) ) return { neg, int: before.replace( /[.,]/g, '' ), dec: after };
		return { neg, int: t.replace( /[.,]/g, '' ), dec: undefined };
	};
	const cleanOf = ( p ) => ( p.neg ? '-' : '' ) + ( p.int === '' && p.dec !== undefined ? '0' : p.int ) + ( p.dec !== undefined ? '.' + p.dec : '' );
	const show = ( p ) => {
		const { group, dec } = seps(), int = p.int.replace( /^0+(?=\d)/, '' ).replace( /\B(?=(\d{3})+(?!\d))/g, group );
		return ( p.neg ? '-' : '' ) + ( int === '' && p.dec !== undefined ? '0' : int ) + ( p.dec !== undefined ? dec + p.dec : '' );
	};
	const enhance = ( el ) => {
		if ( el.__amt ) return; el.__amt = true;
		const initial = NATIVE.get.call( el );
		Object.defineProperty( el, 'value', {
			configurable: true,
			get() { return cleanOf( parse( NATIVE.get.call( el ) ) ); },
			set( v ) { NATIVE.set.call( el, v === '' || v == null ? '' : show( parse( v, true ) ) ); },
		} );
		if ( initial !== '' ) NATIVE.set.call( el, show( parse( initial, true ) ) );
	};
	const scan = ( root ) => { if ( root.nodeType !== 1 ) return; if ( root.matches && root.matches( 'input[inputmode="decimal"]' ) ) enhance( root ); root.querySelectorAll && root.querySelectorAll( 'input[inputmode="decimal"]' ).forEach( enhance ); };
	new MutationObserver( ( list ) => list.forEach( ( m ) => m.addedNodes.forEach( scan ) ) ).observe( document.documentElement, { childList: true, subtree: true } );
	scan( document.documentElement );
	// Typing, pasting or deleting: re-draw the separators and keep the caret next to the same digit.
	document.addEventListener( 'input', ( e ) => {
		const el = e.target; if ( ! el || ! el.matches || ! el.matches( 'input[inputmode="decimal"]' ) || e.isComposing ) return;
		enhance( el );
		const raw = NATIVE.get.call( el ), caret = el.selectionStart == null ? raw.length : el.selectionStart;
		const significant = raw.slice( 0, caret ).replace( /[^0-9.,\-]/g, '' ).length;   // everything before the caret that counts
		const shown = show( parse( raw ) );
		if ( shown === raw ) return;
		NATIVE.set.call( el, shown );
		let seen = 0, pos = shown.length; const { group } = seps();
		for ( let i = 0; i < shown.length; i++ ) { if ( seen >= significant ) { pos = i; break; } if ( shown[ i ] !== group ) seen++; }
		try { el.setSelectionRange( pos, pos ); } catch ( err ) { /* some input types do not allow it */ }
	}, true );
	EX.on && EX.on( 'lang', () => document.querySelectorAll( 'input[inputmode="decimal"]' ).forEach( ( el ) => { const c = el.value; el.value = c; } ) );
}() );
