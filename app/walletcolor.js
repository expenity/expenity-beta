/**
 * Wallet colors. A wallet with no color of its own gets one that follows the current theme: the theme's accent for the first
 * wallet and hue steps around it for the next ones. A person can pick a color for any wallet (More, Wallets).
 */
( function () {
	'use strict';
	const { EX, EXA, UI } = window, { t, esc } = EX;
	const PALETTE = [ '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#64748b' ];
	const isHex = ( v ) => /^#[0-9a-f]{6}$/i.test( v || '' );
	const rgbToHsl = ( r, g, b ) => { r /= 255; g /= 255; b /= 255; const mx = Math.max( r, g, b ), mn = Math.min( r, g, b ); let h = 0, s = 0; const l = ( mx + mn ) / 2; if ( mx !== mn ) { const d = mx - mn; s = l > .5 ? d / ( 2 - mx - mn ) : d / ( mx + mn ); h = mx === r ? ( g - b ) / d + ( g < b ? 6 : 0 ) : mx === g ? ( b - r ) / d + 2 : ( r - g ) / d + 4; h *= 60; } return [ h, s * 100, l * 100 ]; };
	const parseColor = ( c ) => { const cv = document.createElement( 'canvas' ).getContext( '2d' ); cv.fillStyle = '#888888'; cv.fillStyle = c; const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec( cv.fillStyle ); return m ? [ parseInt( m[ 1 ], 16 ), parseInt( m[ 2 ], 16 ), parseInt( m[ 3 ], 16 ) ] : [ 136, 136, 136 ]; };
	/** The theme's accent as [h, s, l]. */
	const accent = () => { const css = getComputedStyle( document.documentElement ).getPropertyValue( '--accent' ).trim() || '#0a8f6a'; const [ r, g, b ] = parseColor( css ); return rgbToHsl( r, g, b ); };
	/** The color of a wallet: its own, or one derived from the theme by the wallet's position. */
	EX.walletColor = ( w ) => {
		if ( isHex( w.color ) ) return { fg: w.color, bg: `color-mix(in srgb, ${ w.color } 20%, var(--surface))` };
		const i = Math.max( 0, EX.state().accounts.findIndex( ( x ) => x.id === w.id ) ), [ h, s, l ] = accent();
		const fg = `hsl(${ Math.round( ( h + i * 47 ) % 360 ) } ${ Math.round( Math.max( 38, s ) ) }% ${ Math.round( Math.min( 52, Math.max( 34, l ) ) ) }%)`;
		return { fg, bg: `color-mix(in srgb, ${ fg } 20%, var(--surface))` };
	};
	UI.walletCi = ( w, size = 40 ) => { const c = EX.walletColor( w ); return `<span class="ci" style="--s:${ size }px;background:${ c.bg };color:${ c.fg }">${ UI.icon( EX.WALLET_ICON[ w.type ] || 'wallet', Math.round( size * 0.52 ) ) }</span>`; };
	EXA.walletColorField = ( v ) => `<div class="lbl">${ esc( t( 'wColor' ) ) }</div><div class="wcolors" id="wColors" role="radiogroup" aria-label="${ esc( t( 'wColor' ) ) }"><input type="hidden" name="color" value="${ isHex( v.color ) ? v.color : '' }">
		<button type="button" class="wsw auto${ isHex( v.color ) ? '' : ' on' }" role="radio" aria-checked="${ ! isHex( v.color ) }" data-wcolor="">${ esc( t( 'wColorTheme' ) ) }</button>${ PALETTE.map( ( c ) => `<button type="button" class="wsw${ v.color === c ? ' on' : '' }" role="radio" aria-checked="${ v.color === c }" data-wcolor="${ c }" style="background:${ c }" aria-label="${ c }"></button>` ).join( '' ) }<label class="wsw custom${ isHex( v.color ) && ! PALETTE.includes( v.color ) ? ' on' : '' }" title="${ esc( t( 'wColorCustom' ) ) }"><input type="color" value="${ isHex( v.color ) ? v.color : '#3b82f6' }" data-wcolor-pick aria-label="${ esc( t( 'wColorCustom' ) ) }"><span>+</span></label></div>`;
	const set = ( box, val, from ) => { box.querySelector( '[name=color]' ).value = val; box.querySelectorAll( '.wsw' ).forEach( ( x ) => { const on = x === from; x.classList.toggle( 'on', on ); if ( x.hasAttribute( 'role' ) ) x.setAttribute( 'aria-checked', String( on ) ); } ); };
	document.addEventListener( 'click', ( e ) => { const b = e.target.closest( '[data-wcolor]' ); if ( ! b ) return; e.preventDefault(); set( b.closest( '#wColors' ), b.dataset.wcolor, b ); } );
	document.addEventListener( 'input', ( e ) => { if ( ! e.target.matches( '[data-wcolor-pick]' ) ) return; set( e.target.closest( '#wColors' ), e.target.value, e.target.closest( '.wsw' ) ); } );
}() );
