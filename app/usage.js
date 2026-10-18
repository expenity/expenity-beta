/**
 * ============================================================================================================================
 *  THIS FEATURE IS FULLY DISABLED. NOTHING IS COLLECTED OR SENT.
 *  Expenity is a privacy-focused app. The anonymous daily usage ping below was built and then switched off on purpose.
 *  It must only ever be switched on again if people are asked and agree to it themselves (opt-in), with a clear explanation
 *  in the app, the privacy documentation and the website. To enable it in the future set ENABLED to true AND enable it on the
 *  server (USAGE_ENABLED = "1" in worker/wrangler.toml); until then both sides ignore it. Do not enable it for everyone.
 * ============================================================================================================================
 */
( function () {
	'use strict';
	const { EX, EXA, UI } = window, { t, esc } = EX;
	const ENABLED = false; // FULLY DISABLED, see the notice at the top of this file.
	const D = () => EX.state().device;
	const live = () => ENABLED && ! window.EXPENITY_DEMO && ( /(^|\.)github\.io$/.test( location.hostname ) || window.EXPENITY_USAGE_TEST === true );
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
	EXA.usageCard = () => ! ENABLED ? '' : `<section class="card"><h2>${ esc( t( 'usageTitle' ) ) }</h2><p class="muted small">${ esc( t( 'usageText' ) ) }</p><label class="fx-row"><span class="mid"><b>${ esc( t( 'usageSwitch' ) ) }</b></span><input type="checkbox" role="switch" data-usage-toggle${ D().usageOff ? '' : ' checked' }></label></section>`;
	document.addEventListener( 'change', ( e ) => { if ( ! e.target.matches( '[data-usage-toggle]' ) ) return; e.stopImmediatePropagation(); D().usageOff = ! e.target.checked; EX.persist(); if ( ! D().usageOff ) send(); }, true );
	if ( ENABLED ) { setTimeout( send, 6000 ); document.addEventListener( 'visibilitychange', () => { if ( document.visibilityState === 'visible' ) send(); } ); }
}() );
