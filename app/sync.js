/**
 * Expenity accounts and sync: the passkey ceremonies, the sign-in state, and the sync engine that keeps this
 * device and the server in step. Local first: the app always works from the local copy; syncing happens in the
 * background and never blocks the user. Everything is on window.EX.auth and window.EX.sync.
 *
 * How sync works: every bill, transaction, wallet and category is a record with an id and an updatedAt time.
 * The engine remembers a hash of each record as of the last sync ("base"). Anything whose hash differs is a local
 * change and is sent; anything in the base that no longer exists was deleted and is sent as a deletion. The server
 * keeps the newest version of each record and returns what changed since our last revision. Remote records are
 * applied unless the user changed that same record while the request was in flight.
 */
( function () {
	'use strict';
	const EX = window.EX;
	const S = () => EX.state();

	/* ------------------------------------------------------------------ API */

	const DEFAULT_API = 'https://expenity-api.george-stathopoulos.workers.dev';
	function apiBase() {
		const h = location.hostname;
		if ( h === 'localhost' || h === '127.0.0.1' ) { // only a local copy of the app may point at another API (tests, development)
			const q = new URLSearchParams( location.search ).get( 'api' );
			try { if ( q ) localStorage.setItem( 'expenity.api', q ); const s = localStorage.getItem( 'expenity.api' ); if ( s ) return s; } catch ( e ) { /* ignore */ }
		}
		return window.EXPENITY_API || DEFAULT_API;
	}

	const auth = { token: null, user: null, emailEnabled: false, codesLeft: null };
	const AUTH_KEY = 'expenity.auth';
	function loadAuth() {
		try { const a = JSON.parse( localStorage.getItem( AUTH_KEY ) || 'null' ); if ( a && a.token ) { auth.token = a.token; auth.user = a.user; } } catch ( e ) { /* ignore */ }
	}
	function storeAuth() {
		try { if ( auth.token ) localStorage.setItem( AUTH_KEY, JSON.stringify( { token: auth.token, user: auth.user } ) ); else localStorage.removeItem( AUTH_KEY ); } catch ( e ) { /* ignore */ }
	}
	function setAuth( token, user ) { auth.token = token; auth.user = user; storeAuth(); EX.emit( 'auth', {accountChanged:true} ); }

	EX.api = ( ...a ) => api( ...a );
	async function api( method, path, body, opts = {} ) {
		const headers = { 'Content-Type': 'application/json' };
		if ( auth.token && ! opts.anon ) headers.Authorization = 'Bearer ' + auth.token;
		if ( opts.stepUp ) headers[ 'X-Step-Up' ] = opts.stepUp;
		let res;
		try { res = await fetch( apiBase() + path, { method, headers, body: body === undefined ? undefined : JSON.stringify( body ) } ); } catch ( e ) { return { ok: false, status: 0, error: 'network' }; }
		let json = null;
		try { json = await res.json(); } catch ( e ) { /* none */ }
		if ( res.status === 401 && auth.token && ! opts.anon && json && json.error === 'unauthorized' ) expired();
		return { ok: res.ok, status: res.status, json, error: json && json.error };
	}
	/** The server no longer knows this session (signed out elsewhere, expired, recovered). Keep the local data. */
	function expired() {
		setAuth( null, null );
		S().sync = { rev: 0, base: {}, spaces: {} };
		EX.persist();
		setStatus( 'off' );
		EX.emit( 'authexpired' );
	}

	/* ------------------------------------------------------------------ Passkeys in the browser */

	const toBuf = ( s ) => { const p = s.replace( /-/g, '+' ).replace( /_/g, '/' ); const bin = atob( p + '='.repeat( ( 4 - ( p.length % 4 ) ) % 4 ) ); return Uint8Array.from( bin, ( c ) => c.charCodeAt( 0 ) ).buffer; };
	const toB64 = ( buf ) => btoa( String.fromCharCode( ...new Uint8Array( buf ) ) ).replace( /\+/g, '-' ).replace( /\//g, '_' ).replace( /=+$/, '' );
	const supported = () => !! ( window.PublicKeyCredential && navigator.credentials );
	const errName = ( e ) => ( e && ( e.name === 'NotAllowedError' || e.name === 'AbortError' ) ? 'cancelled' : e && e.name === 'InvalidStateError' ? 'bad_passkey' : 'generic' );

	async function createPasskey( o ) {
		const cred = await navigator.credentials.create( { publicKey: Object.assign( {}, o, {
			challenge: toBuf( o.challenge ), user: Object.assign( {}, o.user, { id: toBuf( o.user.id ) } ),
			excludeCredentials: ( o.excludeCredentials || [] ).map( ( c ) => Object.assign( {}, c, { id: toBuf( c.id ) } ) ),
		} ) } );
		return {
			id: cred.id, rawId: toB64( cred.rawId ), type: cred.type, authenticatorAttachment: cred.authenticatorAttachment || undefined,
			clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
			response: { clientDataJSON: toB64( cred.response.clientDataJSON ), attestationObject: toB64( cred.response.attestationObject ), transports: cred.response.getTransports ? cred.response.getTransports() : [] },
		};
	}
	async function getPasskey( o ) {
		const cred = await navigator.credentials.get( { publicKey: Object.assign( {}, o, {
			challenge: toBuf( o.challenge ), allowCredentials: ( o.allowCredentials || [] ).map( ( c ) => Object.assign( {}, c, { id: toBuf( c.id ) } ) ),
		} ) } );
		const r = cred.response;
		return {
			id: cred.id, rawId: toB64( cred.rawId ), type: cred.type, authenticatorAttachment: cred.authenticatorAttachment || undefined,
			clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
			response: { clientDataJSON: toB64( r.clientDataJSON ), authenticatorData: toB64( r.authenticatorData ), signature: toB64( r.signature ), userHandle: r.userHandle ? toB64( r.userHandle ) : undefined },
		};
	}
	function deviceLabel() {
		const ua = navigator.userAgent;
		const os = /iPhone|iPad/.test( ua ) ? 'iOS' : /Android/.test( ua ) ? 'Android' : /Mac/.test( ua ) ? 'Mac' : /Windows/.test( ua ) ? 'Windows' : /Linux/.test( ua ) ? 'Linux' : '';
		const br = /Edg\//.test( ua ) ? 'Edge' : /Firefox\//.test( ua ) ? 'Firefox' : /Chrome\//.test( ua ) ? 'Chrome' : /Safari\//.test( ua ) ? 'Safari' : 'Browser';
		return `${ br }${ os ? ' on ' + os : '' }`;
	}

	/** Runs a ceremony: server options -> browser prompt -> server verify. Returns { ok, data } or { error }. */
	async function ceremony( kind, optionsCall, verifyPath, extra = {}, opts = {} ) {
		if ( ! supported() ) return { error: 'unsupported' };
		const o = await optionsCall();
		if ( ! o.ok ) return { error: o.error || 'generic' };
		let response;
		try { response = kind === 'create' ? await createPasskey( o.json.options ) : await getPasskey( o.json.options ); } catch ( e ) { return { error: errName( e ) }; }
		const v = await api( 'POST', verifyPath, Object.assign( { challengeId: o.json.challengeId, response }, extra ), opts );
		return v.ok ? { ok: true, data: v.json } : { error: v.error || 'generic' };
	}

	/* ------------------------------------------------------------------ Account actions */

	const A = ( EX.auth = {
		supported,
		isSignedIn: () => !! auth.token,
		user: () => auth.user,
		emailEnabled: () => auth.emailEnabled,
		codesLeft: () => auth.codesLeft,

		async register( email ) {
			const r = await ceremony( 'create', () => api( 'POST', '/api/auth/register/options', { email, lang: EX.lang() }, { anon: true } ), '/api/auth/register/verify', { label: deviceLabel() }, { anon: true } );
			if ( r.error ) return r;
			setAuth( r.data.token, r.data.user );
			auth.codesLeft = 10;
			afterSignIn();
			return { ok: true, recoveryCodes: r.data.recoveryCodes };
		},
		async login() {
			const r = await ceremony( 'get', () => api( 'POST', '/api/auth/login/options', {}, { anon: true } ), '/api/auth/login/verify', {}, { anon: true } );
			if ( r.error ) return r;
			setAuth( r.data.token, r.data.user );
			afterSignIn();
			return { ok: true };
		},
		/** Asks the server to email a one-time code (it answers the same whether or not the email has an account). Needs email to be switched on. */
		async recoverEmailStart( email ) {
			const r = await api( 'POST', '/api/auth/recover/email', { email }, { anon: true } );
			return r.ok ? { ok: true } : { error: r.error || 'generic' };
		},
		async recover( email, code, viaEmail ) {
			const r = await ceremony( 'create', () => api( 'POST', viaEmail ? '/api/auth/recover/email/verify' : '/api/auth/recover/options', { email, code }, { anon: true } ), '/api/auth/recover/verify', { label: deviceLabel() }, { anon: true } );
			if ( r.error ) return r;
			setAuth( r.data.token, r.data.user );
			auth.codesLeft = r.data.recoveryCodesLeft;
			afterSignIn();
			return { ok: true };
		},
		/** A fresh passkey check for a sensitive action. Returns the step-up token. */
		async stepUp() {
			const r = await ceremony( 'get', () => api( 'POST', '/api/auth/stepup/options', {} ), '/api/auth/stepup/verify', {} );
			return r.error ? r : { ok: true, token: r.data.stepUp };
		},
		async addPasskey() {
			const s = await A.stepUp();
			if ( s.error ) return s;
			const r = await ceremony( 'create', () => api( 'POST', '/api/passkeys/options', {}, { stepUp: s.token } ), '/api/passkeys/verify', { label: deviceLabel() } );
			return r.error ? r : { ok: true };
		},
		async removePasskey( id ) {
			const s = await A.stepUp();
			if ( s.error ) return s;
			const r = await api( 'DELETE', '/api/devices/passkey/' + encodeURIComponent( id ), undefined, { stepUp: s.token } );
			return r.ok ? { ok: true } : { error: r.error || 'generic' };
		},
		/** Start over: add a new passkey on this device first (so there is never none), remove all the others, and issue fresh recovery codes. One fingerprint or face check covers all of it. */
		async resetPasskeys() {
			const s = await A.stepUp();
			if ( s.error ) return s;
			const add = await ceremony( 'create', () => api( 'POST', '/api/passkeys/options', {}, { stepUp: s.token } ), '/api/passkeys/verify', { label: deviceLabel() } );
			if ( add.error ) return add;
			const d = await A.devices(); if ( d.error ) return d;
			const list = ( d.data.passkeys || [] ).slice().sort( ( a, b ) => ( a.createdAt || 0 ) - ( b.createdAt || 0 ) );
			for ( const p of list.slice( 0, -1 ) ) await api( 'DELETE', '/api/devices/passkey/' + encodeURIComponent( p.id ), undefined, { stepUp: s.token } );
			const c = await api( 'POST', '/api/recovery/regenerate', {}, { stepUp: s.token } );
			if ( ! c.ok ) return { ok: true, recoveryCodes: null };
			auth.codesLeft = 10;
			return { ok: true, recoveryCodes: c.json.recoveryCodes };
		},
		async revokeSession( id ) {
			const r = await api( 'DELETE', '/api/devices/session/' + encodeURIComponent( id ) );
			return r.ok ? { ok: true } : { error: r.error || 'generic' };
		},
		async regenerateCodes() {
			const s = await A.stepUp();
			if ( s.error ) return s;
			const r = await api( 'POST', '/api/recovery/regenerate', {}, { stepUp: s.token } );
			if ( ! r.ok ) return { error: r.error || 'generic' };
			auth.codesLeft = 10;
			return { ok: true, recoveryCodes: r.json.recoveryCodes };
		},
		async devices() {
			const r = await api( 'GET', '/api/devices' );
			return r.ok ? { ok: true, data: r.json } : { error: r.error || 'generic' };
		},
		async refresh() {
			const r = await api( 'GET', '/api/me' );
			if ( ! r.ok ) return;
			auth.user = r.json.user; auth.emailEnabled = r.json.emailEnabled; auth.codesLeft = r.json.recoveryCodesLeft;
			storeAuth(); EX.emit( 'auth', {accountChanged:false} );
		},
		/** Signs out. The data stays in the account; this device's copy is removed. */
		async logout() {
			await sync.run().catch( () => {} );
			await api( 'POST', '/api/logout', {} ).catch( () => {} );
			wipeLocal();
		},
		async deleteAccount() {
			const s = await A.stepUp();
			if ( s.error ) return s;
			const r = await api( 'DELETE', '/api/account', undefined, { stepUp: s.token } );
			if ( ! r.ok ) return { error: r.error || 'generic' };
			wipeLocal();
			try { localStorage.removeItem( 'expenity.skin' ); localStorage.removeItem( 'expenity.custom' ); } catch ( e ) { /* ignore */ }
			window.EXA && window.EXA.setSkin && window.EXA.setSkin( 'sunset' );
			return { ok: true };
		},
	} );

	function wipeLocal() {
		const dev = S().device;
		setAuth( null, null );
		EX.resetState();
		Object.assign( S().device, { installDismissed: dev.installDismissed, motion: dev.motion } ); // what this device chose stays; the person's data goes
		EX.persist();
		setStatus( 'off' );
		EX.emit( 'remote' );
	}

	/* ------------------------------------------------------------------ Sync engine */

	const collections = () => ( { bill: S().bills, tx: S().txs, account: S().accounts, category: S().categories, budget: S().budgets, goal: S().goals, income: S().incomes } );
	/** Which store a record belongs to: null is the person's own store, otherwise the id of a shared wallet (space). A wallet, its transactions and its bills travel together. */
	const acct = ( id ) => S().accounts.find( ( a ) => a.id === id );
	const scopeOf = ( kind, e ) => ( kind === 'account' ? e.space || null : kind === 'tx' || kind === 'bill' ? ( ( acct( e.account ) || {} ).space || null ) : null );
	const spaces = () => ( S().sync.spaces || ( S().sync.spaces = {} ) );
	const baseOf = ( scope ) => ( scope ? ( spaces()[ scope ] || { base: {} } ).base : S().sync.base );
	const SETTINGS_ID = 'settings';
	const stable = ( o ) => JSON.stringify( o, ( k, v ) => ( k === 'u' ? undefined : v && typeof v === 'object' && ! Array.isArray( v ) ? Object.keys( v ).sort().reduce( ( a, x ) => { a[ x ] = v[ x ]; return a; }, {} ) : v ) );
	const hash = ( o ) => { const s = stable( o ); let h = 5381; for ( let i = 0; i < s.length; i++ ) h = ( ( h << 5 ) + h + s.charCodeAt( i ) ) | 0; return h.toString( 36 ) + ':' + s.length; };

	const sync = ( EX.sync = { status: 'off', last: null } );
	function setStatus( s ) { if ( sync.status !== s ) { sync.status = s; EX.emit( 'syncstatus' ); } }

	/** What differs from the last sync. withSideEffects stamps changed records with the time of the change. */
	function collect( withSideEffects, scope = null ) {
		const base = baseOf( scope );
		const out = [], sent = {}, seen = new Set();
		const now = Date.now();
		Object.entries( collections() ).forEach( ( [ kind, list ] ) => list.forEach( ( e ) => {
			if ( scopeOf( kind, e ) !== scope ) return;
			seen.add( e.id );
			const h = hash( e ), b = base[ e.id ];
			if ( b && b.h === h ) return;
			// A record never seen by the server keeps its own time if it has one (so an old copy cannot overwrite a newer one on sign-in).
			if ( withSideEffects && scope && ! e.by && ( kind === 'tx' || kind === 'bill' ) && auth.user ) e.by = auth.user.id; // who added it, shown to the other members
			if ( withSideEffects && ( ! e.u || b ) ) e.u = now;
			out.push( { id: e.id, kind, data: e, updatedAt: e.u || now } );
			sent[ e.id ] = h;
		} ) );
		const st = S().settings, sb = base[ SETTINGS_ID ], sh = hash( st );
		seen.add( SETTINGS_ID );
		if ( ! scope && ( ! sb || sb.h !== sh ) ) {
			if ( withSideEffects && ( ! st.u || sb ) ) st.u = now;
			out.push( { id: SETTINGS_ID, kind: 'settings', data: st, updatedAt: st.u || now } );
			sent[ SETTINGS_ID ] = sh;
		}
		Object.keys( base ).forEach( ( id ) => { if ( ! seen.has( id ) ) { out.push( { id, kind: base[ id ].k, deleted: true, updatedAt: now } ); sent[ id ] = null; } } );
		return { changes: out, sent };
	}
	sync.pendingChanges=()=>auth.token?[null,...Object.keys(spaces())].flatMap(scope=>collect(false,scope).changes.map(change=>({id:change.id,kind:change.kind,deleted:!!change.deleted,name:change.data?.name||'',scope,account:change.data?.account||'',blocked:!!scope&&EX.role(acct(change.data?.account)||S().accounts.find(a=>a.space===scope)||{})==='viewer'}))):[];
    sync.pending = () => sync.pendingChanges().length;

	// Acknowledgement is per record, including shared scopes; a global green dot alone is insufficient.
	sync.recordStatus=id=>{
	 const tx=S().txs.find(x=>x.id===id);if(!auth.token)return 'device';if(!tx)return 'error';
	 const scope=scopeOf('tx',tx),base=baseOf(scope);if(base[tx.id]?.h===hash(tx))return 'synced';
	 return ['error','off'].includes(sync.status)?'error':'pending';
	};

	function applyRemote( changes, sent, scope = null ) {
		const base = baseOf( scope );
		const cols = collections();
		let changed = false;
		changes.forEach( ( c ) => {
			if ( c.kind === 'settings' && ! scope ) {
				const st = S().settings;
				if ( sent[ c.id ] !== undefined && hash( st ) !== sent[ c.id ] ) return; // edited while the request was in flight
				if ( ! st.u || c.updatedAt >= st.u ) {
					const next = Object.assign( {}, c.data, { u: c.updatedAt } );
					if ( hash( next ) !== hash( st ) ) { Object.assign( st, next ); changed = true; }
				}
				base[ SETTINGS_ID ] = { k: 'settings', h: hash( st ) };
				return;
			}
			const col = cols[ c.kind ];
			if ( ! col ) return;
			const i = col.findIndex( ( e ) => e.id === c.id );
			const sentH = sent[ c.id ];
			if ( sentH !== undefined && ( ( i >= 0 && hash( col[ i ] ) !== sentH ) || ( i < 0 && sentH !== null ) ) ) return; // changed while in flight: next round
			if ( c.deleted ) { if ( i >= 0 ) { col.splice( i, 1 ); changed = true; } delete base[ c.id ]; return; }
			const data = Object.assign( {}, c.data, { u: c.updatedAt } );
			if ( i >= 0 ) { if ( hash( col[ i ] ) !== hash( data ) ) { col[ i ] = data; changed = true; } else col[ i ].u = data.u; } else { col.push( data ); changed = true; }
			base[ c.id ] = { k: c.kind, h: hash( data ) };
		} );
		return changed;
	}

	let running = false, again = false, timer = null, failures = 0, retry = null;
	/** Pull and push one store: the person's own (scope null) or one shared wallet. Returns 'fail' to stop the whole run. */
	async function syncScope( scope ) {
		const path = scope ? `/api/spaces/${ scope }/sync` : '/api/sync';
		const meta = scope ? spaces()[ scope ] : S().sync;
		let rounds = 0, changed = false;
		// A device that has never synced with this store (just signed in) pulls first and pushes second. Otherwise its blank
		// defaults (an empty name, "setup not done") would be sent as the newest copy and overwrite the person's real ones.
		if ( meta.rev === 0 ) {
			let res = await api( 'POST', path, { since: 0, changes: [] } );
			if ( scope && res.status === 404 ) return 'gone';
			if ( ! res.ok ) { setStatus( res.status === 0 ? 'offline' : res.status === 401 ? 'off' : 'error' ); scheduleRetry(); return 'fail'; }
			if ( applyRemote( res.json.changes, {}, scope ) ) changed = true;
			meta.rev = res.json.rev;
			while ( res.json.more ) {
				res = await api( 'POST', path, { since: meta.rev, changes: [] } );
				if ( ! res.ok ) break;
				if ( applyRemote( res.json.changes, {}, scope ) ) changed = true;
				meta.rev = res.json.rev;
			}
			EX.persist();
		}
		do {
			again = false;
			const { changes, sent } = collect( true, scope );
			const batch = changes.slice( 0, 400 );
			const sentBatch = {};
			batch.forEach( ( c ) => { sentBatch[ c.id ] = sent[ c.id ]; } );
			EX.persist();
			let res = await api( 'POST', path, { since: meta.rev, changes: batch.map( ( c ) => ( c.deleted ? { id: c.id, kind: c.kind, deleted: true, updatedAt: c.updatedAt } : { id: c.id, kind: c.kind, data: c.data, updatedAt: c.updatedAt } ) ) } );
			if ( scope && res.status === 404 ) {EX.emit('entryrejected',{scope,changes:collect(false,scope).changes.filter(c=>c.kind==='tx'&&!c.deleted).map(c=>c.data)});return 'gone';} // no longer a member: the next refresh removes it
			if ( scope && res.status === 403 ) { EX.emit('entryrejected', {scope,changes:collect(false,scope).changes.filter(c=>c.kind==='tx'&&!c.deleted).map(c=>c.data)}); forgetSpaceLocal( scope, false ); meta.rev = 0; meta.base = {}; const refreshed=await syncScope(scope); return refreshed==='fail'?'fail':'changed'; } // recover pending input, then immediately restore the server's read-only copy
			if ( ! res.ok ) { setStatus( res.status === 0 ? 'offline' : res.status === 401 ? 'off' : 'error' ); scheduleRetry(); return 'fail'; }
			if ( applyRemote( res.json.changes, sentBatch, scope ) ) changed = true;
			const base = meta.base;
			batch.forEach( ( c ) => { if ( c.deleted ) delete base[ c.id ]; else if ( ! base[ c.id ] || base[ c.id ].h !== sent[ c.id ] ) base[ c.id ] = { k: c.kind, h: sent[ c.id ] }; } );
			meta.rev = res.json.rev;
			while ( res.json.more ) {
				res = await api( 'POST', path, { since: meta.rev, changes: [] } );
				if ( ! res.ok ) break;
				if ( applyRemote( res.json.changes, {}, scope ) ) changed = true;
				meta.rev = res.json.rev;
			}
			EX.persist();
			if ( changes.length > batch.length ) again = true;
			rounds++;
		} while ( again && rounds < 10 );
		return changed ? 'changed' : 'ok';
	}

	/** Remove the local copy of a shared wallet: its account, transactions and bills (and its sync record when `meta`). */
	function forgetSpaceLocal( id, meta = true ) {
		EX.emit('entryrejected',{scope:id,changes:collect(false,id).changes.filter(c=>c.kind==='tx'&&!c.deleted).map(c=>c.data)});
		const ids = new Set( S().accounts.filter( ( a ) => a.space === id ).map( ( a ) => a.id ) );
		S().accounts = S().accounts.filter( ( a ) => a.space !== id );
		S().txs = S().txs.filter( ( x ) => ! ids.has( x.account ) );
		S().bills = S().bills.filter( ( b ) => ! ids.has( b.account ) );
		if ( meta ) delete spaces()[ id ];
	}
	/** Ask the server which shared wallets this person belongs to; drop the ones they left or were removed from. */
	async function refreshSpaces() {
		const r = await api( 'GET', '/api/spaces' );
		if ( ! r.ok || ! r.json ) return false;
		let changed = false;
		const known = spaces(), seen = new Set();
		r.json.spaces.forEach( ( sp ) => {
			seen.add( sp.id );
			const cur = known[ sp.id ];
			if ( ! cur ) { known[ sp.id ] = { name: sp.name, role: sp.role, owner: sp.owner, members: sp.members, rev: 0, base: {} }; changed = true; }
			else if ( cur.role !== sp.role || cur.name !== sp.name || cur.members !== sp.members ) { Object.assign( cur, { name: sp.name, role: sp.role, owner: sp.owner, members: sp.members } ); changed = true; }
		} );
		Object.keys( known ).forEach( ( id ) => { if ( ! seen.has( id ) ) { forgetSpaceLocal( id ); changed = true; } } );
		new Set( S().accounts.map( ( x ) => x.space ).filter( Boolean ) ).forEach( ( id ) => { if ( ! seen.has( id ) ) { forgetSpaceLocal( id ); changed = true; } } ); // a leftover from another account
		if ( changed ) EX.persist();
		return changed;
	}
	sync.forgetSpace = ( id ) => forgetSpaceLocal( id );
	sync.run = async function () {
		if ( ! auth.token ) { setStatus( 'off' ); return; }
		if ( sync.hold ) return; // paused while a wallet changes hands
		if ( running ) { again = true; return; }
		running = true;
		setStatus( 'syncing' );
		let anyChange = false;
		try {
			if ( await refreshSpaces() ) anyChange = true;
			for ( const scope of [ null ].concat( Object.keys( spaces() ) ) ) {
				if ( scope && ! spaces()[ scope ] ) continue;
				const r = await syncScope( scope );
				if ( r === 'fail' ) return;
				if ( r === 'changed' ) anyChange = true;
			}
			failures = 0;
			sync.last = Date.now();
			setStatus( 'ok' );
		} catch ( e ) {
			console.error( e );
			setStatus( 'error' );
			scheduleRetry();
		} finally {
			running = false;
			if ( anyChange ) EX.emit( 'remote' );
			if ( again && sync.status === 'ok' ) sync.run();
		}
	};
	function scheduleRetry() {
		failures += 1;
		clearTimeout( retry );
		retry = setTimeout( () => sync.run(), Math.min( 5 * 60000, 5000 * Math.pow( 2, failures - 1 ) ) );
	}
	sync.schedule = () => { if ( ! auth.token ) return; clearTimeout( timer ); timer = setTimeout( () => sync.run(), 1500 ); };

	/** Right after signing in: an untouched automatic wallet makes way for the account's own wallets. */
	function afterSignIn() {
		const s = S();
		s.sync = { rev: 0, base: {} };
		if ( s.accounts.length === 1 && s.accounts[ 0 ].auto && ! s.txs.some( ( x ) => x.account === s.accounts[ 0 ].id || x.toAccount === s.accounts[ 0 ].id ) && ! s.bills.some( ( b ) => b.account === s.accounts[ 0 ].id ) ) s.accounts = [];
		EX.persist();
		sync.run().then( () => A.refresh() );
	}

	EX.on( 'change', sync.schedule );
	/** Daily exchange rates for approximate totals. Public endpoint, no user data sent. Cached for 12 hours on the device. */
	EX.fetchRates = async () => {
		const age = EX.rates.fetched ? Date.now() - EX.rates.fetched : Infinity;
		if ( age < 12 * 36e5 && EX.rates.rates && Object.keys( EX.rates.rates ).length ) return;
		const r = await api( 'GET', '/api/rates', undefined, { anon: true } );
		if ( r.ok && r.json && r.json.rates && Object.keys( r.json.rates ).length ) EX.setRates( { date: r.json.date, rates: r.json.rates, fetched: Date.now() } );
	};
	sync.init = () => {
		EX.fetchRates().catch( () => {} );
		loadAuth();
		setStatus( auth.token ? 'idle' : 'off' );
		if ( auth.token ) { A.refresh(); sync.run(); }
		window.addEventListener( 'online', () => sync.run() );
		document.addEventListener( 'visibilitychange', () => { if ( document.visibilityState === 'visible' ) sync.run(); } );
		setInterval( () => { if ( document.visibilityState === 'visible' ) sync.run(); }, 60000 );
	};
}() );
