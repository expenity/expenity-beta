/** Reset account: removes every record and setting (here and, for an account, on the server and so on every device after its next sync) and begins setup again, like a new person. */
( function () {
	'use strict';
	const { EX, EXA, UI } = window, { t } = EX;
	/** The wallets shared with other people: [{ a: wallet, owner: true when this person owns the sharing }]. */
	EXA.sharedWallets = () => { const sp = ( EX.state().sync && EX.state().sync.spaces ) || {}; return EX.state().accounts.filter( ( a ) => a.space ).map( ( a ) => ( { a, owner: !! ( sp[ a.space ] && sp[ a.space ].owner ) } ) ); };
	// A place to see and leave shared wallets, so nobody has to hunt for it before a reset or a deletion.
	EXA.sharedWalletsCard = () => {
		const list = EXA.sharedWallets(); if ( ! list.length ) return '';
		const rows = list.map( ( { a, owner } ) => `<div class="mrow"><span class="mid"><b>${ EX.esc( EX.accountName ? EX.accountName( a ) : a.name ) }</b><small>${ EX.esc( t( owner ? 'sharedRoleOwner' : 'sharedRoleMember' ) ) }</small></span><button type="button" class="btn btn-ghost" ${ owner ? 'data-shared-stop' : 'data-shared-leave' }="${ EX.esc( a.space ) }">${ EX.esc( t( owner ? 'stopShareBtn' : 'leaveWallet' ) ) }</button></div>` ).join( '' );
		return `<section class="card"><h2>${ EX.esc( t( 'sharedWalletsTitle' ) ) }</h2><p class="muted small">${ EX.esc( t( 'sharedWalletsText' ) ) }</p><div class="list mlist">${ rows }</div></section>`;
	};
	document.addEventListener( 'click', async ( e ) => {
		const b = e.target.closest( '[data-shared-leave],[data-shared-stop]' ); if ( ! b ) return;
		e.preventDefault(); e.stopImmediatePropagation();
		const leave = b.hasAttribute( 'data-shared-leave' ), id = b.getAttribute( leave ? 'data-shared-leave' : 'data-shared-stop' );
		if ( ! await EXA.confirm( leave ? { title: t( 'leaveWallet' ), text: t( 'leaveConfirm' ), confirm: t( 'leaveWallet' ) } : { title: t( 'stopShare' ), text: t( 'stopConfirm' ), confirm: t( 'stopShareBtn' ) } ) ) return;
		const r = leave ? await EX.spaces.leave( id ) : await EX.spaces.stop( id );
		if ( r && r.ok ) { UI.toast( t( leave ? 'tLeft' : 'tStopped' ) ); EXA.render(); } else UI.toast( EXA.errText ? EXA.errText( r && r.error ) : t( 'sharedResetFail' ) );
	}, true );
	EXA.resetAccount = EXA.startFresh = async () => {
		const S = EX.state();
		// Shared wallets no longer block a reset: the person is shown what happens to each one, then leaves or stops sharing them first.
		const shared = EXA.sharedWallets();
		if ( shared.length ) {
			const html = `<ul class="plain shared-reset">${ shared.map( ( { a, owner } ) => `<li><b>${ EX.esc( EX.accountName ? EX.accountName( a ) : a.name ) }</b><br><small>${ EX.esc( t( owner ? 'sharedResetOwner' : 'sharedResetMember' ) ) }</small></li>` ).join( '' ) }</ul>`;
			if ( ! await EXA.confirm( { title: t( 'sharedResetTitle' ), text: t( 'sharedResetText' ), html, confirm: t( 'sharedResetGo' ) } ) ) return;
			for ( const { a, owner } of shared ) { const r = owner ? await EX.spaces.stop( a.space ) : await EX.spaces.leave( a.space ); if ( ! r || ! r.ok ) { UI.toast( t( 'sharedResetFail' ) ); return; } }
		}
		if ( ! await EXA.confirm( { title: t( 'freshTitle' ), text: t( 'freshConfirm' ), confirm: t( 'freshBtn' ), word: 'RESET' } ) ) return;
		let proof = null;
		if ( EX.auth.isSignedIn() ) { proof = await EX.auth.stepUp(); if ( ! proof.ok ) { UI.toast( EXA.errText( proof.error ) ); return; } }
		if ( proof ) await EX.api( 'DELETE', '/api/photos', {}, { stepUp: proof.token } );
		[ 'bills', 'txs', 'accounts', 'categories', 'budgets', 'goals', 'incomes' ].forEach( ( k ) => { S[ k ] = []; } );
		S.settings = { currency: 'EUR', lead: 3, name: '', setupDone: false, aims: [], tipsOff: [], u: Date.now() };
		Object.assign( S.device, { stage: 'setup', setupStep: 0, onboarded: false, tourDone: false, goalsDiscovered: false, dashboardHintSeen: false, push: undefined } );
		delete S.device.push;
		if ( ! EX.save() ) { UI.toast( t( 'freshFail' ) ); return; }
		if ( proof ) await EX.sync.run();
		EXA.flow.restart();
		UI.toast( t( 'freshDone' ) );
	};
	document.addEventListener( 'click', ( e ) => { if ( ! e.target.closest( '[data-fresh]' ) ) return; e.preventDefault(); e.stopImmediatePropagation(); EXA.startFresh(); }, true );
}() );
