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
	const hideToast = ( el ) => { el.hidden = true; try { if ( el.matches( ':popover-open' ) ) el.hidePopover(); } catch ( e ) { /* ignore */ } };
	UI.toast = ( msg, undo ) => {
		const el = $( '#toast' );
		el.innerHTML = `${ undo ? '' : `<span>${ EX.esc( msg ) }</span>` }${ undo ? `<button type="button" class="link">${ EX.esc( EX.t( 'undo' ) ) }</button>` : '' }`;
		el.hidden = false;
		try { if ( ! el.hasAttribute( 'popover' ) ) el.setAttribute( 'popover', 'manual' ); if ( el.matches( ':popover-open' ) ) el.hidePopover(); el.showPopover(); } catch ( e ) { /* older browsers: the toast stays where it is */ }
		el.classList.remove( 'show' ); void el.offsetWidth; el.classList.add( 'show' );
		if ( undo ) $( 'button', el ).onclick = () => { undo(); window.EXA?.playSound?.('undo'); hideToast( el ); };
		clearTimeout( toastTimer );
		toastTimer = setTimeout( () => hideToast( el ), undo ? 7000 : 4500 );
	};

	/** A confirmation: the toast with an animated checkmark in front of the message. */
	UI.done = ( msg ) => {
		UI.toast( msg );
		const el = $( '#toast' );
		el.insertAdjacentHTML( 'afterbegin', '<svg class="toast-check" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#34d399"/><path d="M6.5 12.5l3.8 3.8 7.2-8" fill="none" stroke="#10201a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' );
		window.EXA?.playSound?.( 'success' );
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

/* Dropdowns: every <select> looks the same (see style.css), and on a computer its list is a slick menu instead of the browser's plain one.
   On touch screens the phone's own picker is kept, because it is the best one there is. */
( function () {
	'use strict';
	if ( ! window.matchMedia || ! window.matchMedia( '(hover: hover) and (pointer: fine)' ).matches ) return;
	let menu = null, owner = null, cursor = -1, openedAt = 0;
	const close = () => { if ( ! menu ) return; try { if ( menu.matches( ':popover-open' ) ) menu.hidePopover(); } catch ( e ) { /* ignore */ } menu.remove(); menu = null; if ( owner ) owner.classList.remove( 'dd-open' ); owner = null; cursor = -1; };
	const items = () => [ ...menu.querySelectorAll( '[role=option]' ) ];
	const mark = ( i ) => { const l = items(); if ( ! l.length ) return; cursor = ( i + l.length ) % l.length; l.forEach( ( x, n ) => x.classList.toggle( 'cur', n === cursor ) ); const el = l[ cursor ]; if ( el.offsetTop < menu.scrollTop ) menu.scrollTop = el.offsetTop - 6; else if ( el.offsetTop + el.offsetHeight > menu.scrollTop + menu.clientHeight ) menu.scrollTop = el.offsetTop + el.offsetHeight - menu.clientHeight + 6; };
	const choose = ( opt ) => { const sel = owner; close(); if ( ! sel || opt.disabled ) return; if ( sel.value !== opt.value ) { sel.value = opt.value; sel.dispatchEvent( new Event( 'input', { bubbles: true } ) ); sel.dispatchEvent( new Event( 'change', { bubbles: true } ) ); } sel.focus( { preventScroll: true } ); };
	const open = ( sel ) => {
		close(); owner = sel; openedAt = Date.now(); sel.classList.add( 'dd-open' );
		const esc = ( s ) => String( s ).replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' );
		const row = ( o, i ) => `<div role="option" class="dd-opt${ o.selected ? ' sel' : '' }${ o.disabled ? ' off' : '' }" data-i="${ i }" aria-selected="${ o.selected }">${ esc( o.textContent ) }${ o.selected ? '<i class="dd-tick" aria-hidden="true"></i>' : '' }</div>`;
		let html = '', n = 0; const opts = [ ...sel.options ];
		[ ...sel.children ].forEach( ( c ) => { if ( c.tagName === 'OPTGROUP' ) { html += `<div class="dd-group">${ esc( c.label ) }</div>`; [ ...c.children ].forEach( ( o ) => { html += row( o, opts.indexOf( o ) ); n++; } ); } else { html += row( c, opts.indexOf( c ) ); n++; } } );
		menu = document.createElement( 'div' ); menu.className = 'dd-menu'; menu.setAttribute( 'role', 'listbox' ); menu.setAttribute( 'popover', 'manual' ); menu.innerHTML = html;
		( sel.closest( 'dialog' ) || document.body ).appendChild( menu );
		const r = sel.getBoundingClientRect(); menu.style.minWidth = r.width + 'px';
		try { menu.showPopover(); } catch ( e ) { /* older browsers: still shown in place */ }
		const h = Math.min( menu.scrollHeight, 288 ), below = innerHeight - r.bottom - 12, up = below < h && r.top > below;
		menu.style.left = Math.max( 8, Math.min( r.left, innerWidth - menu.offsetWidth - 8 ) ) + 'px'; menu.style.top = ( up ? Math.max( 8, r.top - h - 6 ) : r.bottom + 6 ) + 'px'; menu.style.maxHeight = ( up ? r.top - 14 : below ) + 'px';
		mark( sel.selectedIndex >= 0 ? items().findIndex( ( x ) => Number( x.dataset.i ) === sel.selectedIndex ) : 0 );
		menu.addEventListener( 'mousedown', ( e ) => e.preventDefault() );
		menu.addEventListener( 'click', ( e ) => { const o = e.target.closest( '[role=option]' ); if ( o ) choose( sel.options[ Number( o.dataset.i ) ] ); } );
		menu.addEventListener( 'mousemove', ( e ) => { const o = e.target.closest( '[role=option]' ); if ( o ) mark( items().indexOf( o ) ); } );
	};
	document.addEventListener( 'mousedown', ( e ) => {
		const sel = e.target.closest && e.target.closest( 'select' );
		if ( sel && ! sel.multiple && ! sel.disabled && sel.size <= 1 && e.button === 0 ) { e.preventDefault(); if ( owner === sel ) close(); else { sel.focus( { preventScroll: true } ); open( sel ); } return; }
		if ( menu && ! e.target.closest( '.dd-menu' ) ) close();
	}, true );
	document.addEventListener( 'keydown', ( e ) => {
		if ( menu ) {
			if ( e.key === 'Escape' ) { e.preventDefault(); e.stopPropagation(); const s = owner; close(); s && s.focus(); }
			else if ( e.key === 'ArrowDown' ) { e.preventDefault(); mark( cursor + 1 ); } else if ( e.key === 'ArrowUp' ) { e.preventDefault(); mark( cursor - 1 ); }
			else if ( e.key === 'Enter' || e.key === ' ' ) { e.preventDefault(); const o = items()[ cursor ]; if ( o ) choose( owner.options[ Number( o.dataset.i ) ] ); }
			else if ( e.key === 'Tab' ) close();
			return;
		}
		const sel = e.target.closest && e.target.closest( 'select' );
		if ( sel && ! sel.multiple && ( e.key === 'Enter' || e.key === ' ' || ( e.altKey && e.key === 'ArrowDown' ) ) ) { e.preventDefault(); open( sel ); }
	}, true );
	window.addEventListener( 'resize', close ); document.addEventListener( 'scroll', ( e ) => { if ( menu && Date.now() - openedAt > 300 && ! e.target.closest?.( '.dd-menu' ) ) close(); }, true );
}() );

/* Date picker: a modern calendar instead of the browser's, on computers. Touch screens keep the phone's own date picker. */
( function () {
	'use strict';
	if ( ! window.matchMedia || ! window.matchMedia( '(hover: hover) and (pointer: fine)' ).matches ) return;
	let pop = null, input = null, view = null, cur = null, openedAt = 0;
	const pad = ( n ) => String( n ).padStart( 2, '0' ), iso = ( d ) => `${ d.getFullYear() }-${ pad( d.getMonth() + 1 ) }-${ pad( d.getDate() ) }`;
	const parse = ( v ) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec( v || '' ); return m ? new Date( +m[ 1 ], +m[ 2 ] - 1, +m[ 3 ] ) : null; };
	const T = ( k ) => ( window.EX && window.EX.t ? window.EX.t( k ) : k ), loc = () => ( window.EX && window.EX.loc ? window.EX.loc() : undefined );
	const close = () => { if ( ! pop ) return; try { if ( pop.matches( ':popover-open' ) ) pop.hidePopover(); } catch ( e ) { /* ignore */ } pop.remove(); pop = null; if ( input ) input.classList.remove( 'dd-open' ); input = null; };
	const inRange = ( d ) => { const lo = parse( input.min ), hi = parse( input.max ); return ( ! lo || d >= lo ) && ( ! hi || d <= hi ); };
	const setValue = ( d ) => { const el = input; el.value = d ? iso( d ) : ''; el.dispatchEvent( new Event( 'input', { bubbles: true } ) ); el.dispatchEvent( new Event( 'change', { bubbles: true } ) ); };
	const draw = () => {
		const y = view.getFullYear(), m = view.getMonth(), first = new Date( y, m, 1 ), lead = ( first.getDay() + 6 ) % 7, sel = parse( input.value ), today = new Date(); today.setHours( 0, 0, 0, 0 );
		const wd = Array.from( { length: 7 }, ( _, i ) => new Intl.DateTimeFormat( loc(), { weekday: 'short' } ).format( new Date( 2024, 0, 1 + i ) ).slice( 0, 2 ) );
		let cells = ''; for ( let i = 0; i < 42; i++ ) { const d = new Date( y, m, 1 - lead + i ), out = d.getMonth() !== m, v = iso( d ), dis = ! inRange( d );
			cells += `<button type="button" class="dp-day${ out ? ' out' : '' }${ sel && iso( sel ) === v ? ' sel' : '' }${ iso( today ) === v ? ' today' : '' }${ cur && iso( cur ) === v ? ' cur' : '' }" data-d="${ v }"${ dis ? ' disabled' : '' } tabindex="-1">${ d.getDate() }</button>`; }
		const quick = [ [ 'dpToday', 0 ], [ 'dpTomorrow', 1 ], [ 'dpNextWeek', 7 ] ].map( ( [ k, n ] ) => { const d = new Date( today ); d.setDate( d.getDate() + n ); return inRange( d ) ? `<button type="button" class="dp-chip" data-q="${ iso( d ) }">${ T( k ) }</button>` : ''; } ).join( '' );
		pop.innerHTML = `<div class="dp-head"><button type="button" class="dp-nav" data-nav="-1" aria-label="${ T( 'dpPrev' ) }">‹</button><b>${ new Intl.DateTimeFormat( loc(), { month: 'long', year: 'numeric' } ).format( view ) }</b><button type="button" class="dp-nav" data-nav="1" aria-label="${ T( 'dpNext' ) }">›</button></div>
			<div class="dp-wd">${ wd.map( ( x ) => `<span>${ x }</span>` ).join( '' ) }</div><div class="dp-grid">${ cells }</div><div class="dp-foot">${ quick }${ input.required ? '' : `<button type="button" class="dp-chip ghost" data-clear>${ T( 'dpClear' ) }</button>` }</div>`;
	};
	const place = () => { const r = input.getBoundingClientRect(), h = pop.offsetHeight, below = innerHeight - r.bottom - 10, up = below < h && r.top > below; pop.style.left = Math.max( 8, Math.min( r.left, innerWidth - pop.offsetWidth - 8 ) ) + 'px'; pop.style.top = Math.max( 8, up ? r.top - h - 6 : r.bottom + 6 ) + 'px'; };
	const open = ( el ) => {
		close(); input = el; openedAt = Date.now(); el.classList.add( 'dd-open' ); cur = parse( el.value ) || new Date(); cur.setHours( 0, 0, 0, 0 ); view = new Date( cur.getFullYear(), cur.getMonth(), 1 );
		pop = document.createElement( 'div' ); pop.className = 'dp'; pop.setAttribute( 'role', 'dialog' ); pop.setAttribute( 'popover', 'manual' ); ( el.closest( 'dialog' ) || document.body ).appendChild( pop );
		draw(); try { pop.showPopover(); } catch ( e ) { /* older browsers */ } place();
		pop.addEventListener( 'mousedown', ( e ) => e.preventDefault() );
		pop.addEventListener( 'click', ( e ) => {
			const n = e.target.closest( '[data-nav]' ), d = e.target.closest( '[data-d]' ), q = e.target.closest( '[data-q]' );
			if ( n ) { view = new Date( view.getFullYear(), view.getMonth() + Number( n.dataset.nav ), 1 ); draw(); place(); return; }
			const pick = d ? d.dataset.d : q ? q.dataset.q : null; if ( pick ) { const el2 = input; setValue( parse( pick ) ); close(); el2.focus( { preventScroll: true } ); return; }
			if ( e.target.closest( '[data-clear]' ) ) { const el2 = input; setValue( null ); close(); el2.focus( { preventScroll: true } ); }
		} );
	};
	const isDate = ( t ) => t && t.matches && t.matches( 'input[type=date]' ) && ! t.disabled && ! t.readOnly;
	document.addEventListener( 'mousedown', ( e ) => {
		if ( isDate( e.target ) ) { e.preventDefault(); if ( input === e.target ) close(); else { e.target.focus( { preventScroll: true } ); open( e.target ); } return; }
		if ( pop && ! e.target.closest( '.dp' ) ) close();
	}, true );
	document.addEventListener( 'click', ( e ) => { if ( isDate( e.target ) ) e.preventDefault(); }, true );
	document.addEventListener( 'keydown', ( e ) => {
		if ( pop ) {
			const mv = ( days, months ) => { const d = new Date( cur ); if ( months ) d.setMonth( d.getMonth() + months ); d.setDate( d.getDate() + days ); cur = d; view = new Date( d.getFullYear(), d.getMonth(), 1 ); draw(); place(); };
			if ( e.key === 'Escape' ) { e.preventDefault(); e.stopPropagation(); const el = input; close(); el && el.focus( { preventScroll: true } ); }
			else if ( e.key === 'ArrowLeft' ) { e.preventDefault(); mv( -1, 0 ); } else if ( e.key === 'ArrowRight' ) { e.preventDefault(); mv( 1, 0 ); }
			else if ( e.key === 'ArrowUp' ) { e.preventDefault(); mv( -7, 0 ); } else if ( e.key === 'ArrowDown' ) { e.preventDefault(); mv( 7, 0 ); }
			else if ( e.key === 'PageUp' ) { e.preventDefault(); mv( 0, -1 ); } else if ( e.key === 'PageDown' ) { e.preventDefault(); mv( 0, 1 ); }
			else if ( e.key === 'Enter' ) { e.preventDefault(); if ( inRange( cur ) ) { const el = input; setValue( cur ); close(); el.focus( { preventScroll: true } ); } }
			else if ( e.key === 'Tab' ) close();
			return;
		}
		if ( isDate( e.target ) && ( e.key === 'Enter' || ( e.altKey && e.key === 'ArrowDown' ) ) ) { e.preventDefault(); open( e.target ); }
	}, true );
	window.addEventListener( 'resize', close ); document.addEventListener( 'scroll', ( e ) => { if ( pop && Date.now() - openedAt > 300 && ! e.target.closest?.( '.dp' ) ) close(); }, true );
}() );
