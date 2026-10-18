/**
 * Anonymous usage statistics: once a day this device sends a random id (hashed on the server), the app version, language,
 * theme, plan, whether it runs installed or in a browser, and a coarse device class. The server adds the country and a coarse
 * OS and browser from the request. No account, email, IP address or financial data is sent or stored. People can switch it off
 * in More, Account, Usage statistics. It never runs in the website's live preview or on localhost.
 */
( function () {
	'use strict';
	const { EX, EXA, UI } = window, { t, esc } = EX;
	const D = () => EX.state().device;
	const live = () => ! window.EXPENITY_DEMO && ( /(^|\.)github\.io$/.test( location.hostname ) || window.EXPENITY_USAGE_TEST === true );
	const today = () => new Date().toISOString().slice( 0, 10 );
	const did = () => { try { let v = localStorage.getItem( 'expenity.did' ); if ( ! v ) { v = EX.uid(); localStorage.setItem( 'expenity.did', v ); } return v; } catch ( e ) { return ''; } };
	const cls = () => { const w = Math.min( screen.width, screen.height ); return w < 600 ? 'phone' : ( w < 1000 && matchMedia( '(pointer: coarse)' ).matches ) ? 'tablet' : 'desktop'; };
	let busy = false;
	const send = async () => {
		if ( busy || ! live() || D().usageOff || D().usageLast === today() ) return;
		const id = did(); if ( ! id ) return; busy = true;
		const r = await EX.api( 'POST', '/api/usage', { id, v: window.EXPENITY_VERSION, lang: EX.lang(), nlang: navigator.language || '', mode: UI.isStandalone() ? 'app' : 'browser', cls: cls(), plan: EXA.features ? EXA.features.plan() : '', skin: EXA.skin(), signed: EX.auth.isSignedIn(), chan: /beta/.test( location.pathname ) ? 'beta' : 'live' }, { anon: true } ).catch( () => ( { ok: false } ) );
		if ( r && r.ok ) { D().usageLast = today(); EX.persist(); }
		busy = false;
	};
	EXA.usageSend = send;
	EXA.usageCard = () => `<section class="card"><h2>${ esc( t( 'usageTitle' ) ) }</h2><p class="muted small">${ esc( t( 'usageText' ) ) }</p><label class="fx-row"><span class="mid"><b>${ esc( t( 'usageSwitch' ) ) }</b></span><input type="checkbox" role="switch" data-usage-toggle${ D().usageOff ? '' : ' checked' }></label></section>`;
	document.addEventListener( 'change', ( e ) => { if ( ! e.target.matches( '[data-usage-toggle]' ) ) return; e.stopImmediatePropagation(); D().usageOff = ! e.target.checked; EX.persist(); if ( ! D().usageOff ) send(); }, true );
	setTimeout( send, 6000 );
	document.addEventListener( 'visibilitychange', () => { if ( document.visibilityState === 'visible' ) send(); } );
}() );
