/** Start fresh: removes every record and setting (here and, for an account, on the server) and begins setup again, like a new person. */
( function () {
	'use strict';
	const { EX, EXA, UI } = window, { t } = EX;
	EXA.startFresh = async () => {
		const S = EX.state();
		if ( S.accounts.some( ( a ) => a.space ) ) { UI.toast( t( 'freshShared' ) ); return; }
		if ( ! await EXA.confirm( { title: t( 'freshTitle' ), text: t( 'freshConfirm' ), confirm: t( 'freshBtn' ) } ) ) return;
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
