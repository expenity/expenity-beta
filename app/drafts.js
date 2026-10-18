/**
 * Drafts: an entry that was started but not saved (closed app, flat battery) is kept on this device by the entry form.
 * This file lists them, points them out on Home when the app opens, and lets the person continue or dismiss each one.
 */
( function () {
	'use strict';
	const { EX, EXA, UI } = window, { t, esc } = EX;
	const D = ( EXA.drafts = {} );
	const owner = () => ( EX.auth.isSignedIn() ? 'user:' + ( EX.auth.user() || {} ).id : 'guest' );
	const prefix = () => 'expenity.entryDraft.v1:' + owner() + ':';
	D.list = () => {
		const out = [];
		try {
			for ( let i = 0; i < localStorage.length; i++ ) {
				const k = localStorage.key( i ); if ( ! k || ! k.startsWith( prefix() ) ) continue;
				const rest = k.slice( prefix().length ); if ( rest.startsWith( 'edit:' ) || rest.startsWith( 'recovery:' ) ) continue;
				let v = null; try { v = JSON.parse( localStorage.getItem( k ) || 'null' ); } catch ( e ) { /* skip */ }
				if ( ! v || ! v.data || Date.now() - v.saved > 86400000 ) continue;
				const d = v.data; if ( ! ( d.amount || d.toAmount || ( d.name || '' ).trim() || ( d.note || '' ).trim() ) ) continue;
				out.push( { key: k, saved: v.saved, d } );
			}
		} catch ( e ) { /* storage unavailable */ }
		return out.sort( ( a, b ) => b.saved - a.saved );
	};
	const kindLabel = ( d ) => t( d.scheduleKind === 'bill' ? 'draftBill' : d.scheduleKind === 'income' ? 'draftIncome' : d.type === 'income' ? 'draftIncomeTx' : d.type === 'transfer' ? 'draftTransfer' : 'draftExpense' );
	const when = ( ts ) => { const m = Math.max(0, Math.round( ( Date.now() - ts ) / 60000 )); try { const r = new Intl.RelativeTimeFormat( EX.loc(), { numeric: 'auto' } ); return m < 60 ? r.format( -m, 'minute' ) : r.format( -Math.round( m / 60 ), 'hour' ); } catch ( e ) { return ''; } };
	const summary = ( x ) => { const d = x.d, acc = EX.account( d.account ), cur = acc ? acc.currency : EX.state().settings.currency, amt = d.amount ? EX.money( Number( d.amount ), cur ) : '', name = ( d.name || '' ).trim();
		return { title: [ kindLabel( d ), name ].filter( Boolean ).join( ' · ' ), sub: [ amt, when( x.saved ) ].filter( Boolean ).join( ' · ' ) }; };
	const rowHtml = ( x, i ) => { const s = summary( x ); return `<li class="draft-row"><span class="mid"><b>${ esc( s.title ) }</b><small>${ esc( s.sub ) }</small></span><button type="button" class="btn btn-primary btn-sm" data-draft-open="${ i }">${ UI.icon( 'pencil', 18 ) } ${ esc( t( 'draftContinue' ) ) }</button><button type="button" class="btn btn-ghost btn-sm" data-draft-dismiss="${ i }" aria-label="${ esc( t( 'draftDismiss' ) ) }">${ UI.icon( 'x', 18 ) }</button></li>`; };
	D.view = () => { const l = D.list(); return `<section class="card"><p class="muted small">${ esc( t( 'draftHelp' ) ) }</p>${ l.length ? `<ul class="list draft-list">${ l.map( rowHtml ).join( '' ) }</ul>` : `<p class="muted pad">${ esc( t( 'draftNone' ) ) }</p>` }</section>`; };
	D.home = () => {
		if ( EX.feature && EX.feature( 'drafts' ) === false ) return ''; const l = D.list(); if ( ! l.length ) return '';
		const s = summary( l[ 0 ] );
		return `<div class="draft-nudge" role="status"><span class="dn-ic" aria-hidden="true">${ UI.icon( 'pencil', 22 ) }</span><div class="mid"><b>${ esc( t( l.length > 1 ? 'draftNudgeMany' : 'draftNudge', { n: l.length } ) ) }</b><small>${ esc( s.title + ( s.sub ? ' · ' + s.sub : '' ) ) }</small></div>
			<div class="dn-actions"><button type="button" class="btn btn-primary btn-sm" data-draft-open="0">${ esc( t( 'draftContinue' ) ) }</button>${ l.length > 1 ? `<button type="button" class="btn btn-ghost btn-sm" data-draft-all>${ esc( t( 'draftAll' ) ) }</button>` : '' }<button type="button" class="ab-btn" data-draft-dismiss="0" aria-label="${ esc( t( 'draftDismiss' ) ) }">${ UI.icon( 'x', 20 ) }</button></div></div>`;
	};
	const home = EXA.home;
	EXA.home = () => { const tmp = document.createElement( 'template' ); tmp.innerHTML = home(); const h = D.home(); if ( h ) { const s = document.createElement( 'section' ); s.dataset.home = 'drafts'; s.innerHTML = h; tmp.content.prepend( s ); } return tmp.innerHTML; };
	document.addEventListener( 'click', ( e ) => {
		const o = e.target.closest( '[data-draft-open]' ), x = e.target.closest( '[data-draft-dismiss]' ), all = e.target.closest( '[data-draft-all]' ); if ( ! o && ! x && ! all ) return;
		e.preventDefault(); e.stopImmediatePropagation();
		if ( all ) { EXA.go( 'more', 'drafts' ); return; }
		const l = D.list(), item = l[ Number( ( o || x ).dataset.draftOpen ?? ( o || x ).dataset.draftDismiss ) ]; if ( ! item ) { EXA.render(); return; }
		if ( x ) { try { localStorage.removeItem( item.key ); } catch ( err ) { /* ignore */ } EXA.render(); UI.toast( t( 'draftDismissed' ) ); return; }
		EXA.openTx( null, { type: item.d.type } );
	}, true );
	// Bring the person's attention to a draft when the app opens or someone signs in.
	EX.on( 'auth', () => EXA.render() );
}() );
