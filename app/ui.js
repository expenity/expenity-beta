/**
 * Expenity UI helpers: icons, bottom sheets (with the browser's back button), toasts, swipe actions and pull to refresh.
 * No screens here: those are in views.js and forms.js. Everything is on window.UI.
 */
( function () {
	'use strict';
	const EX = window.EX;
	const UI = ( window.UI = {} );
	const $ = ( s, r = document ) => r.querySelector( s );

	/* ------------------------------------------------------------------ Icons */

	UI.icon = ( name, size = 24, cls = '' ) => ( cls ? window.EXI_SVG( name, size ).replace( 'class="i"', `class="i ${ cls }"` ) : window.EXI_SVG( name, size ) );
	/** A colored circle with an icon, the way every category, wallet and action is shown. */
	UI.ci = ( name, color = 'gray', size = 40 ) => `<span class="ci tint-${ color }" style="--s:${ size }px">${ UI.icon( name, Math.round( size * 0.52 ) ) }</span>`;
	UI.catCi = ( info, size = 40 ) => ( info.iconName ? UI.ci( info.iconName, info.color, size ) : `<span class="ci tint-gray" style="--s:${ size }px"><span class="em" aria-hidden="true">${ EX.esc( info.icon ) }</span></span>` );
	UI.walletCi = ( w, size = 40 ) => UI.ci( EX.WALLET_ICON[ w.type ] || 'wallet', 'teal', size );

	/* ------------------------------------------------------------------ Layout helpers */

	UI.isPhone = () => window.matchMedia( '(max-width: 599px)' ).matches;
	UI.isWide = () => window.matchMedia( '(min-width: 1200px)' ).matches;
	/** A short burst of confetti, for a goal reached. Skipped when animations are off. */
	UI.confetti = ( from ) => {
		const m = document.documentElement.dataset.motion;
		if ( m === 'off' || m === 'reduced' || ( m !== 'full' && window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches ) ) return;
		const box = document.createElement( 'div' ); box.className = 'confetti-burst'; box.setAttribute( 'aria-hidden', 'true' );
		const colors = [ '#14b08a', '#f5a524', '#ec5f95', '#8b5cf6', '#3b82f6' ];
		for ( let i = 0; i < 36; i++ ) { const p = document.createElement( 'i' ); const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 220; p.style.cssText = `--x:${ Math.cos( a ) * d }px;--y:${ Math.sin( a ) * d - 120 }px;--r:${ Math.random() * 720 - 360 }deg;background:${ colors[ i % colors.length ] };animation-delay:${ Math.random() * 120 }ms`; box.appendChild( p ); }
		document.body.appendChild( box ); setTimeout( () => box.remove(), 1700 );
	};
	UI.isStandalone = () => window.matchMedia( '(display-mode: standalone)' ).matches || window.navigator.standalone === true;
	UI.haptic = ( ms = 12 ) => { try { if ( navigator.vibrate ) navigator.vibrate( ms ); } catch ( e ) { /* not available */ } };

	/* ------------------------------------------------------------------ Toast */

	let toastTimer = null;
	UI.toast = ( msg, undo ) => {
		const el = $( '#toast' );
		el.innerHTML = `${ undo ? '' : `<span>${ EX.esc( msg ) }</span>` }${ undo ? `<button type="button" class="link">${ EX.esc( EX.t( 'undo' ) ) }</button>` : '' }`;
		el.hidden = false;
		el.classList.remove( 'show' ); void el.offsetWidth; el.classList.add( 'show' );
		if ( undo ) $( 'button', el ).onclick = () => { undo(); window.EXA?.playSound?.('undo'); el.hidden = true; };
		clearTimeout( toastTimer );
		toastTimer = setTimeout( () => { el.hidden = true; }, undo ? 7000 : 4500 );
	};

	/* ------------------------------------------------------------------ Bottom sheet */
	// One <dialog id="sheet"> serves every form and detail. On phones it is a bottom sheet or full-screen sheet; on larger
	// screens the same markup is a centered dialog (CSS only). Opening pushes a history entry so the back button closes it.

	let lock = false, onClose = null, fromPop = false, pendingBack = false, beforeClose = null;
	const dlg = () => $( '#sheet' );
	UI.sheetOpen = () => dlg().open;
	UI.openSheet = ( html, o = {} ) => {
		const d = dlg();
		$( '.sheet-body', d ).innerHTML = html;
		// Keep focus off editable fields until the person taps one on a touch device.
		d.querySelectorAll( '.sheet-body [autofocus]' ).forEach( el => el.removeAttribute( 'autofocus' ) );
		d.className = 'sheet' + ( o.full ? ' full' : '' ) + ( o.tall ? ' tall' : '' ) + ( o.cls ? ' ' + o.cls : '' );
		lock = !! o.lock;
		onClose = o.onClose || null; beforeClose = o.beforeClose || null;
		$( '.sheet-scroll', d ).scrollTop = 0;
		if ( ! d.open ) { d.showModal(); history.pushState( { xsheet: 1 }, '' ); }
		$( '.sheet-body', d ).focus();
	};
	UI.closeSheet = ( force = false ) => { const d = dlg(); if ( !force && beforeClose && beforeClose() === false ) return false; if ( d.open ) d.close(); return true; };

	UI.initSheet = () => {
		const d = dlg();
		d.addEventListener( 'close', () => {
			// A native close event is queued: it must not clear a sheet that has already reopened.
			if ( d.open ) return;
			const cb = onClose; onClose = null; beforeClose = null; lock = false;
			if ( ! fromPop && history.state && history.state.xsheet ) { pendingBack = true; history.back(); }
			if ( cb ) cb();
		} );
		d.addEventListener( 'cancel', ( e ) => { e.preventDefault(); if(!lock) UI.closeSheet(); } );
		d.addEventListener( 'click', ( e ) => { if ( e.target === d && ! lock ) UI.closeSheet(); } );
		window.addEventListener( 'popstate', () => {
			if ( pendingBack ) { pendingBack = false; return; }
			if ( ! d.open ) return;
			if ( lock ) { history.pushState( { xsheet: 1 }, '' ); return; }
			if(beforeClose && beforeClose()===false){history.pushState({xsheet:1},'');return;}
			fromPop = true; d.close(); fromPop = false;
		} );
		// Pull the sheet down by its handle to close it (phones).
		const grab = $( '.sheet-grab', d );
		let y0 = 0, dy = 0, drag = false;
		grab.addEventListener( 'pointerdown', ( e ) => { drag = true; y0 = e.clientY; dy = 0; d.style.transition = 'none'; grab.setPointerCapture( e.pointerId ); } );
		grab.addEventListener( 'pointermove', ( e ) => { if ( ! drag ) return; dy = Math.max( 0, e.clientY - y0 ); d.style.transform = `translateY(${ dy }px)`; } );
		const end = () => { if ( ! drag ) return; drag = false; d.style.transition = ''; d.style.transform = ''; if ( dy > 110 && ! lock ) UI.closeSheet(); dy = 0; };
		grab.addEventListener( 'pointerup', end ); grab.addEventListener( 'pointercancel', end );
	};

	/* ------------------------------------------------------------------ Swipe actions on rows */
	// Markup: <li class="sw" data-swr="edit" data-swl="del"> <div class="sw-back">…</div> <div class="sw-front">…</div> </li>
	// A touch drag right triggers data-swr, left triggers data-swl. Fires a "swipeaction" event on the row.

	UI.justSwiped = false;
	UI.initSwipe = ( root ) => {
		// A swipe slides the row to reveal buttons. It never acts on its own: the person taps Paid, Edit or Delete.
		let row = null, front = null, x0 = 0, y0 = 0, base = 0, dx = 0, mode = '', wL = 0, wR = 0, timer = null;
		const closeAll = ( except ) => { document.querySelectorAll( '.sw.open' ).forEach( ( r ) => { if ( r === except ) return; r.classList.remove( 'open' ); const f = $( '.sw-front', r ); if ( f ) f.style.transform = ''; } ); };
		UI.swipeClose = () => closeAll();
		// An opened row slides back by itself after two seconds without a touch.
		const armClose = () => { clearTimeout( timer ); timer = setTimeout( () => closeAll(), 2000 ); };
		window.addEventListener( 'resize', () => closeAll() );
		root.addEventListener( 'pointerdown', ( e ) => {
			if ( e.pointerType === 'mouse' || ! UI.isPhone() ) return; // swipes are for phones; larger screens click a row to open its panel
			clearTimeout( timer );
			const r = e.target.closest( '.sw' );
			if ( ! r ) { closeAll(); return; }
			if ( e.target.closest( '.sw-act' ) ) return;
			closeAll( r );
			row = r; front = $( '.sw-front', r ); x0 = e.clientX; y0 = e.clientY; dx = 0; mode = '';
			wL = $( '.sw-l', r ) ? $( '.sw-l', r ).offsetWidth : 0; wR = $( '.sw-r', r ) ? $( '.sw-r', r ).offsetWidth : 0;
			base = r.classList.contains( 'open-l' ) ? wL : r.classList.contains( 'open-r' ) ? -wR : 0;
		}, { passive: true } );
		root.addEventListener( 'pointermove', ( e ) => {
			if ( ! row ) return;
			const mx = e.clientX - x0, my = e.clientY - y0;
			if ( ! mode ) { if ( Math.abs( mx ) > 10 && Math.abs( mx ) > Math.abs( my ) * 1.4 ) mode = 'x'; else if ( Math.abs( my ) > 10 ) { row = null; return; } else return; }
			dx = Math.max( -wR, Math.min( wL, base + mx ) );
			front.style.transition = 'none';
			front.style.transform = `translateX(${ dx }px)`;
		}, { passive: true } );
		const finish = () => {
			if ( ! row ) return;
			const r = row, f = front; row = null; front = null;
			f.style.transition = '';
			if ( mode === 'x' ) {
				UI.justSwiped = true; setTimeout( () => { UI.justSwiped = false; }, 120 );
				const open = dx > wL * 0.5 ? 'l' : dx < -wR * 0.5 ? 'r' : '';
				r.classList.remove( 'open-l', 'open-r' );
				if ( open ) { r.classList.add( 'open', 'open-' + open ); f.style.transform = `translateX(${ open === 'l' ? wL : -wR }px)`; UI.haptic(); armClose(); } else { r.classList.remove( 'open' ); f.style.transform = ''; }
			}
			mode = '';
		};
		root.addEventListener( 'pointerup', finish ); root.addEventListener( 'pointercancel', finish );
		// While a row is open, the next tap either presses one of its buttons or just closes it.
		root.addEventListener( 'click', ( e ) => {
			const openRow = document.querySelector( '.sw.open' );
			if ( ! openRow ) return;
			const btn = e.target.closest( '.sw-act' );
			e.stopPropagation(); e.preventDefault();
			if ( btn && openRow.contains( btn ) ) { const d = { action: btn.dataset.sw, id: openRow.dataset.id, kind: openRow.dataset.kind }; closeAll(); openRow.dispatchEvent( new CustomEvent( 'swipeaction', { bubbles: true, detail: d } ) ); }
			else closeAll();
		}, true );
	};

	/* ------------------------------------------------------------------ Pull to refresh */

	UI.initPull = ( scroller, onRefresh, enabled ) => {
		let y0 = 0, pulling = false, dy = 0;
		const ind = $( '#ptr' );
		scroller.addEventListener( 'touchstart', ( e ) => { if ( scroller.scrollTop <= 0 && enabled() ) { y0 = e.touches[ 0 ].clientY; pulling = true; dy = 0; } }, { passive: true } );
		scroller.addEventListener( 'touchmove', ( e ) => {
			if ( ! pulling ) return;
			dy = e.touches[ 0 ].clientY - y0;
			if ( dy > 0 && scroller.scrollTop <= 0 ) {
				if ( e.cancelable ) e.preventDefault();
				const p = Math.min( 1, dy / 90 );
				ind.style.opacity = String( p ); ind.style.transform = `translate(-50%, ${ Math.min( 70, dy * 0.6 ) }px)`; ind.classList.toggle( 'ready', dy > 90 );
				ind.querySelector( 'span' ).textContent = EX.t( dy > 90 ? 'releaseSync' : 'pullSync' );
			} else { pulling = false; ind.style.opacity = '0'; }
		}, { passive: false } );
		const end = () => {
			if ( ! pulling ) return;
			pulling = false;
			const go = dy > 90;
			ind.style.opacity = '0'; ind.style.transform = 'translate(-50%, 0)'; ind.classList.remove( 'ready' );
			if ( go ) onRefresh();
		};
		scroller.addEventListener( 'touchend', end ); scroller.addEventListener( 'touchcancel', end );
	};
}() );

/* One expanded sibling group at a time; nested groups retain their parent. */
document.addEventListener('toggle',event=>{
 const current=event.target;if(!(current instanceof HTMLDetailsElement)||!current.open)return;
 const parent=current.parentElement.closest('details');
 const scope=parent||current.closest('dialog,#view')||current.parentElement;
 scope.querySelectorAll('details[open]').forEach(other=>{if(other!==current&&!other.contains(current)&&other.parentElement.closest('details')===parent)other.open=false;});
},true);
