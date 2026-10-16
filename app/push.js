/**
 * Expenity notifications on this device, also when the app is closed (Web Push). The service worker (sw.js) shows them;
 * the Worker sends one summary a day at the chosen hour (worker/src/push.js). Needs an account, because the server has
 * to know which bills are due. On iPhone and iPad it works for the app added to the home screen.
 */
( function () {
	'use strict';
	const EX = window.EX, UI = window.UI, EXA = window.EXA;
	const { t, esc } = EX;
	const S = EX.state;
	const P = ( EXA.push = {} );
	const toast = UI.toast;
	const isIos = () => /iPhone|iPad|iPod/.test( navigator.userAgent ) || ( /Mac/.test( navigator.userAgent ) && navigator.maxTouchPoints > 1 );
	const u8 = ( b64 ) => { const s = atob( b64.replace( /-/g, '+' ).replace( /_/g, '/' ) ); return Uint8Array.from( s, ( c ) => c.charCodeAt( 0 ) ); };
	const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch ( e ) { return 'UTC'; } };

	P.supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
	/** unsupported, guest, needs-install, denied, off or on */
	P.state = () => {
		if ( ! EX.auth.isSignedIn() ) return 'guest';
		if ( ! P.supported() ) return isIos() && ! UI.isStandalone() ? 'needs-install' : 'unsupported';
		if ( Notification.permission === 'denied' ) return 'denied';
		return Notification.permission === 'granted' && S().device.push ? 'on' : 'off';
	};
	const subscribeBody = ( sub, hour ) => ( { subscription: sub.toJSON(), tz: tz(), hour, lang: EX.lang() } );
	const current = async () => { const reg = await navigator.serviceWorker.ready; return { reg, sub: await reg.pushManager.getSubscription() }; };

	P.enable = async ( hour = 9 ) => {
		const perm = await Notification.requestPermission();
		if ( perm !== 'granted' ) return { error: 'denied' };
		const key = await EX.api( 'GET', '/api/push/key', undefined, { anon: true } );
		if ( ! key.ok || ! key.json || ! key.json.publicKey ) return { error: 'network' };
		const { reg, sub: old } = await current();
		let sub = old;
		if ( ! sub ) { try { sub = await reg.pushManager.subscribe( { userVisibleOnly: true, applicationServerKey: u8( key.json.publicKey ) } ); } catch ( e ) { return { error: 'unsupported' }; } }
		const r = await EX.api( 'POST', '/api/push/subscribe', subscribeBody( sub, hour ) );
		if ( ! r.ok ) { try { await sub.unsubscribe(); } catch ( e ) { /* ignore */ } return { error: r.error || 'network' }; }
		S().device.push = { hour }; S().device.notify = false; EX.persist();
		return { ok: true };
	};
	P.disable = async () => {
		const { sub } = await current();
		if ( sub ) { EX.api( 'POST', '/api/push/unsubscribe', { endpoint: sub.endpoint } ); try { await sub.unsubscribe(); } catch ( e ) { /* ignore */ } }
		delete S().device.push; EX.persist();
	};
	P.setHour = async ( hour ) => {
		const { sub } = await current();
		if ( ! sub ) return;
		const r = await EX.api( 'POST', '/api/push/subscribe', subscribeBody( sub, hour ) );
		if ( r.ok ) { S().device.push = { hour }; EX.persist(); }
	};
	P.test = () => EX.api( 'POST', '/api/push/test', {} );
	/** On start: if the browser has lost the subscription (cleared data, revoked permission), say it is off. */
	P.check = async () => {
		if ( ! S().device.push || ! P.supported() ) return;
		const { sub } = await current();
		if ( ! sub || Notification.permission !== 'granted' ) { delete S().device.push; EX.persist(); EXA.render(); }
		else if ( EX.auth.isSignedIn() ) EX.api( 'POST', '/api/push/subscribe', subscribeBody( sub, S().device.push.hour ) ); // keeps the language and time zone current
	};

	const hourLabel = ( h ) => new Date( 2024, 0, 1, h ).toLocaleTimeString( EX.loc(), { hour: '2-digit', minute: '2-digit' } );
	EXA.pushCard = () => {
		const st = P.state(), hour = ( S().device.push || {} ).hour;
		const msg = { guest: 'pushNeedAccount', 'needs-install': 'pushNeedInstall', unsupported: 'pushUnsupported', denied: 'notifDenied' }[ st ];
		let body = msg ? `<p class="muted small">${ esc( t( msg ) ) }</p>` : `<p class="muted small">${ esc( t( 'pushDesc' ) ) }</p>`;
		if ( st === 'off' ) body += `<div class="btn-row"><button type="button" class="btn btn-primary" data-push="on">${ UI.icon( 'bell', 20 ) } ${ esc( t( 'turnOn' ) ) }</button></div>`;
		if ( st === 'on' ) body += `<label class="f"><span>${ esc( t( 'pushHour' ) ) }</span><select id="pushHour">${ Array.from( { length: 17 }, ( _, i ) => i + 6 ).map( ( h ) => `<option value="${ h }"${ h === hour ? ' selected' : '' }>${ esc( hourLabel( h ) ) }</option>` ).join( '' ) }</select></label><div class="btn-row"><button type="button" class="btn btn-ghost" data-push="test">${ esc( t( 'pushTest' ) ) }</button><button type="button" class="btn btn-ghost" data-push="off">${ esc( t( 'turnOff' ) ) }</button></div>`;
		return `<section class="card"><h2>${ esc( t( 'pushTitle' ) ) }</h2>${ body }</section>`;
	};
	EXA.pushClick = ( e ) => {
		const el = e.target.closest( '[data-push]' );
		if ( ! el ) return false;
		const a = el.dataset.push;
		( async () => {
			if ( a === 'on' ) { el.disabled = true; const r = await P.enable( 9 ); el.disabled = false; if ( r.ok ) toast( t( 'tPushOn' ) ); else toast( r.error === 'denied' ? t( 'notifDenied' ) : t( 'tPushFail' ) ); EXA.render(); }
			else if ( a === 'off' ) { await P.disable(); toast( t( 'tPushOff' ) ); EXA.render(); }
			else if ( a === 'test' ) { const r = await P.test(); toast( r.ok && r.json && r.json.sent ? t( 'tPushTestSent' ) : t( 'tPushFail' ) ); }
		} )();
		return true;
	};
	EXA.pushChange = ( e ) => {
		if ( e.target.id !== 'pushHour' ) return false;
		P.setHour( Number( e.target.value ) ).then( () => toast( t( 'tSaved' ) ) );
		return true;
	};
	EX.on( 'lang', () => { if ( S().device.push ) P.check(); } );
	EX.on( 'auth', () => { if ( ! EX.auth.isSignedIn() && S().device.push ) { P.disable(); } } );
}() );
