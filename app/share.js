/**
 * Expenity shared wallets. A wallet can be shared with other Expenity accounts through a single-use invite code or
 * link. Members have a role: owner, editor (adds and changes) or viewer (read only). The wallet, its transactions and
 * its bills sync through their own store on the server (sync.js, "spaces"); everything else a person has stays private.
 * The server enforces roles on every write; this file is the interface and the local guard rails.
 */
( function () {
	'use strict';
	const EX = window.EX, UI = window.UI, EXA = window.EXA;
	const { t, esc } = EX;
	const S = EX.state;
	const $ = ( s, r = document ) => r.querySelector( s );
	const toast = UI.toast;
	const spaces = () => ( S().sync.spaces || ( S().sync.spaces = {} ) );
	const X = `<button type="button" class="ab-btn" data-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button>`;
	const head = ( title ) => `<div class="sheet-head">${ X }<h2 id="sheetTitle">${ esc( title ) }</h2><span class="sp"></span></div>`;
	const SP = ( EX.spaces = {} );

	/* ------------------------------------------------------------------ Server calls */

	const call = async ( method, path, body ) => {
		const r = await EX.api( method, path, body );
		return r.ok ? { ok: true, json: r.json } : { ok: false, error: r.error || ( r.status === 0 ? 'network' : 'generic' ) };
	};
	SP.names = () => ( S().sync.names || ( S().sync.names = {} ) );
	SP.members = async ( id ) => {
		const r = await call( 'GET', `/api/spaces/${ id }/members` );
		if ( r.ok ) r.json.members.forEach( ( m ) => { SP.names()[ m.id ] = m.email; } );
		return r;
	};
	SP.nameOf = ( userId, spaceId ) => {
		const me = EX.auth.user();
		if ( me && me.id === userId ) return t( 'youTag' );
		const e = SP.names()[ userId ];
		if ( ! e && spaceId ) SP.members( spaceId ).then( () => {} ); // fill the cache for next time
		return e ? e.split( '@' )[ 0 ] : t( 'someone' );
	};
	SP.create = async ( account ) => {
		const r = await call( 'POST', '/api/spaces', { name: account.name } );
		if ( ! r.ok ) return r;
		spaces()[ r.json.id ] = { name: r.json.name, role: 'owner', owner: true, members: 1, rev: 0, base: {} };
		account.space = r.json.id;
		EX.save();
		return r;
	};
	SP.invite = ( id, role ) => call( 'POST', `/api/spaces/${ id }/invites`, { role } );
	SP.revoke = ( id, inv ) => call( 'DELETE', `/api/spaces/${ id }/invites/${ inv }` );
	SP.setRole = ( id, user, role ) => call( 'POST', `/api/spaces/${ id }/members/${ user }`, { role } );
	SP.remove = ( id, user ) => call( 'DELETE', `/api/spaces/${ id }/members/${ user }` );
	SP.accept = async ( code ) => {
		const r = await call( 'POST', '/api/invites/accept', { code } );
		if ( r.ok && ! spaces()[ r.json.id ] ) { spaces()[ r.json.id ] = { name: r.json.name, role: r.json.role, owner: false, members: 0, rev: 0, base: {} }; EX.persist(); }
		if ( r.ok ) EX.sync.run();
		return r;
	};
	/** A member leaves: the server forgets them and the local copy of the wallet goes. */
	SP.leave = async ( id ) => {
		const me = EX.auth.user();
		const r = await SP.remove( id, me.id );
		if ( r.ok ) { EX.sync.forgetSpace( id ); EX.save(); }
		return r;
	};
	/** The owner stops sharing but keeps everything as a private wallet. Syncing is paused so the local copy is not mistaken for a removed one. */
	SP.stop = async ( id ) => {
		EX.sync.hold = true;
		try {
			const r = await call( 'DELETE', `/api/spaces/${ id }` );
			if ( ! r.ok ) return r;
			S().accounts.forEach( ( a ) => { if ( a.space === id ) delete a.space; } );
			delete spaces()[ id ];
			EX.save();
			return r;
		} finally { EX.sync.hold = false; EX.sync.run(); }
	};

	/* ------------------------------------------------------------------ Guard rails: a viewer cannot change things */

	const readOnly = ( accountId ) => { if ( EX.canWrite( accountId ) ) return false; toast( t( 'readOnly' ) ); return true; };
	const guard = ( name, accountOf ) => { const f = EXA[ name ]; if ( ! f ) return; EXA[ name ] = ( ...a ) => ( readOnly( accountOf( ...a ) ) ? undefined : f( ...a ) ); };
	const billAcct = ( id ) => ( S().bills.find( ( b ) => b.id === id ) || {} ).account;
	guard( 'openTx', ( tx ) => tx && tx.account );
	guard( 'removeTx', ( id ) => ( S().txs.find( ( x ) => x.id === id ) || {} ).account );
	guard( 'markPaid', billAcct ); guard( 'skipBill', billAcct ); guard( 'snoozeBill', billAcct ); guard( 'removeBill', billAcct );
	guard( 'openBill', ( b ) => b && b.account ); guard( 'openPay', ( b ) => b && b.account );
	{ const ow = EXA.openWallet; EXA.openWallet = ( id ) => ( id && ! EX.canWrite( id ) ? EXA.openShare( id ) : ow( id ) ); } // a viewer opens the sharing sheet, which has Leave

	/* ------------------------------------------------------------------ Sheets */

	const ROLE_KEY = { owner: 'roleOwner', editor: 'roleEditor', viewer: 'roleViewer' };
	const ctx = { id: null, role: 'editor', invite: null };
	const link = ( code ) => `${ location.origin }${ location.pathname }#join=${ code }`;
	const dateOf = ( ms ) => new Date( ms ).toLocaleDateString( EX.loc(), { day: 'numeric', month: 'short' } );

	/** The row in the wallet sheet that opens sharing. */
	EXA.shareRow = ( a ) => {
		if ( ! EX.auth.isSignedIn() ) return `<p class="muted small">${ UI.icon( 'users', 16 ) } ${ esc( t( 'shareNeedAccount' ) ) }</p>`;
		const sp = a.space && spaces()[ a.space ];
		return `<button type="button" class="btn btn-ghost wide" data-share="open" data-id="${ esc( a.id ) }">${ UI.icon( 'users', 20 ) } ${ esc( sp ? t( 'sharingN', { n: sp.members || 1 } ) : t( 'shareTitle' ) ) }</button>`;
	};
	function renderShare( a, data ) {
		const sp = a.space ? spaces()[ a.space ] : null, role = EX.role( a ), me = ( EX.auth.user() || {} ).id;
		let body;
		if ( ! sp ) {
			body = `<p>${ esc( t( 'shareSub' ) ) }</p><p class="muted small">${ esc( t( 'shareNote' ) ) }</p><p class="err" id="shareErr" role="alert" hidden></p><div class="btn-row"><button type="button" class="btn btn-primary wide" data-share="start">${ UI.icon( 'users', 20 ) } ${ esc( t( 'shareStart' ) ) }</button></div>`;
		} else {
			const people = data ? data.members.map( ( m ) => `<li class="prow"><span class="mid"><b>${ esc( m.email.split( '@' )[ 0 ] ) }${ m.you ? ` <em>(${ esc( t( 'youTag' ) ) })</em>` : '' }</b><small>${ esc( m.email ) }</small></span>${ role === 'owner' && m.role !== 'owner' ? `<select data-share-role="${ esc( m.id ) }" aria-label="${ esc( t( 'roleLabel' ) ) }"><option value="editor"${ m.role === 'editor' ? ' selected' : '' }>${ esc( t( 'roleEditor' ) ) }</option><option value="viewer"${ m.role === 'viewer' ? ' selected' : '' }>${ esc( t( 'roleViewer' ) ) }</option></select><button type="button" class="btn btn-ghost sm" data-share="remove" data-user="${ esc( m.id ) }" aria-label="${ esc( t( 'memberRemove' ) ) }">${ UI.icon( 'user-minus', 18 ) }</button>` : `<span class="tagp">${ esc( t( ROLE_KEY[ m.role ] ) ) }</span>` }</li>` ).join( '' ) : `<li class="muted">${ esc( t( 'loading' ) ) }</li>`;
			const inv = data && data.invites.length ? `<h3 class="sub">${ esc( t( 'inviteActive' ) ) }</h3><ul class="plain">${ data.invites.map( ( i ) => `<li class="prow"><span class="mid">${ esc( t( ROLE_KEY[ i.role ] ) ) } · ${ esc( t( 'inviteUntil', { date: dateOf( i.expiresAt ) } ) ) }</span><button type="button" class="btn btn-ghost sm" data-share="revoke" data-inv="${ esc( i.id ) }">${ esc( t( 'inviteRevoke' ) ) }</button></li>` ).join( '' ) }</ul>` : '';
			const code = ctx.invite ? `<div class="invite-box"><small>${ esc( t( 'inviteCodeLabel' ) ) }</small><b class="code">${ esc( ctx.invite.code.slice( 0, 5 ) + ' ' + ctx.invite.code.slice( 5 ) ) }</b><p class="muted small">${ esc( t( 'inviteNote', { date: dateOf( ctx.invite.expiresAt ) } ) ) }</p><div class="btn-row"><button type="button" class="btn btn-primary" data-share="copylink">${ UI.icon( 'link', 18 ) } ${ esc( t( 'inviteLink' ) ) }</button><button type="button" class="btn btn-ghost" data-share="copycode">${ UI.icon( 'copy', 18 ) } ${ esc( t( 'inviteCopyCode' ) ) }</button></div></div>` : '';
			const invite = role === 'owner' ? `<h3 class="sub">${ esc( t( 'inviteTitle' ) ) }</h3><div class="chips wrap">${ [ 'editor', 'viewer' ].map( ( r ) => `<button type="button" class="chip big${ ctx.role === r ? ' on' : '' }" data-share="pickrole" data-role="${ r }">${ esc( t( ROLE_KEY[ r ] ) ) }</button>` ).join( '' ) }</div><p class="muted small">${ esc( t( ctx.role === 'editor' ? 'roleEditorD' : 'roleViewerD' ) ) }</p><div class="btn-row"><button type="button" class="btn btn-primary" data-share="invite">${ UI.icon( 'user-plus', 20 ) } ${ esc( t( 'inviteBtn' ) ) }</button></div>${ code }` : '';
			const out = role === 'owner' ? `<button type="button" class="btn btn-ghost wide" data-share="stop">${ esc( t( 'stopShare' ) ) }</button>` : `<button type="button" class="btn btn-danger wide" data-share="leave">${ esc( t( 'leaveWallet' ) ) }</button>`;
			body = `<p class="muted small">${ UI.icon( 'lock', 14 ) } ${ esc( t( 'shareNote' ) ) }</p><h3 class="sub">${ esc( t( 'membersTitle' ) ) }</h3><ul class="plain people">${ people }</ul>${ inv }${ invite }<p class="err" id="shareErr" role="alert" hidden></p><div class="btn-row">${ out }</div>`;
			void me;
		}
		UI.openSheet( `${ head( t( 'shareTitle' ) + ': ' + EX.accountName(a) ) }<div class="sheet-pad share" data-account="${ esc( a.id ) }">${ body }</div>`, { cls: 'small' } );
	}
	async function openShare( id ) {
		const a = EX.account( id );
		if ( ! a ) return;
		if ( ! EX.auth.isSignedIn() ) { toast( t( 'shareNeedAccount' ) ); return; }
		ctx.id = id; ctx.invite = null;
		renderShare( a, null );
		if ( a.space ) { const r = await SP.members( a.space ); if ( r.ok ) renderShare( a, r.json ); }
	}
	EXA.openShare = openShare;
	const shareErr = ( code ) => { const e = $( '#shareErr' ); const k = 'err_' + code, v = t( k ); const msg = v === k ? t( 'err_generic' ) : v; if ( e ) { e.textContent = msg; e.hidden = false; } else toast( msg ); };
	async function refresh() { const a = EX.account( ctx.id ); if ( ! a ) return; const r = a.space ? await SP.members( a.space ) : { ok: false }; renderShare( a, r.ok ? r.json : null ); }

	EXA.openJoin = ( code = '' ) => {
		UI.openSheet( `${ head( t( 'joinTitle' ) ) }<form id="joinForm" class="sheet-pad" novalidate><p class="muted">${ esc( t( 'joinText' ) ) }</p><label class="f"><span>${ esc( t( 'joinCode' ) ) }</span><input name="code" maxlength="14" autocomplete="off" autocapitalize="characters" spellcheck="false" class="codein" value="${ esc( code ) }" autofocus></label><p class="err" id="joinErr" role="alert" hidden></p><div class="btn-row"><button type="submit" class="btn btn-primary wide">${ esc( t( 'joinBtn' ) ) }</button></div></form>`, { cls: 'small' } );
	};
	async function join( code ) {
		const r = await SP.accept( code );
		if ( ! r.ok ) { const e = $( '#joinErr' ); const k = 'err_' + r.error, v = t( k ); const msg = v === k ? t( 'err_generic' ) : v; if ( e ) { e.textContent = msg; e.hidden = false; } else toast( msg ); return false; }
		UI.closeSheet(); toast( t( 'tJoined', { name: r.json.name } ) );
		return true;
	}

	/* ------------------------------------------------------------------ Events */

	const copy = async ( text, done ) => { try { await navigator.clipboard.writeText( text ); toast( done ); } catch ( e ) { toast( text ); } };
	EXA.shareClick = ( e ) => {
		const el = e.target.closest( '[data-share]' );
		if ( ! el ) return false;
		onShare( el );
		return true;
	};
	async function onShare( el ) {
		const a = EX.account( ctx.id || el.dataset.id ), act = el.dataset.share;
		if ( act === 'open' ) { openShare( el.dataset.id ); return; }
		if ( ! a ) return;
		if ( act === 'start' ) {
			const r = await SP.create( a );
			if ( ! r.ok ) { shareErr( r.error ); return; }
			toast( t( 'tShared', { name: EX.accountName(a) } ) ); EX.sync.run(); renderShare( a, { members: [ { id: ( EX.auth.user() || {} ).id, email: ( EX.auth.user() || {} ).email || '', role: 'owner', you: true } ], invites: [] } );
		} else if ( act === 'pickrole' ) { ctx.role = el.dataset.role; renderShare( a, ( await SP.members( a.space ) ).json ); }
		else if ( act === 'invite' ) { const r = await SP.invite( a.space, ctx.role ); if ( ! r.ok ) { shareErr( r.error ); return; } ctx.invite = r.json; await refresh(); }
		else if ( act === 'copylink' && ctx.invite ) copy( link( ctx.invite.code ), t( 'tLinkCopied' ) );
		else if ( act === 'copycode' && ctx.invite ) copy( ctx.invite.code, t( 'tCodeCopied' ) );
		else if ( act === 'revoke' ) { await SP.revoke( a.space, el.dataset.inv ); await refresh(); }
		else if ( act === 'remove' ) { if ( await EXA.confirm( { title: t( 'memberRemove' ), text: t( 'memberRemoveText' ), confirm: t( 'memberRemove' ) } ) ) { await SP.remove( a.space, el.dataset.user ); toast( t( 'tMemberRemoved' ) ); } openShare( a.id ); }
		else if ( act === 'leave' ) { if ( await EXA.confirm( { title: t( 'leaveWallet' ), text: t( 'leaveConfirm' ), confirm: t( 'leaveWallet' ) } ) ) { const r = await SP.leave( a.space ); if ( r.ok ) { UI.closeSheet(); toast( t( 'tLeft' ) ); } else shareErr( r.error ); } else openShare( a.id ); }
		else if ( act === 'stop' ) { if ( await EXA.confirm( { title: t( 'stopShare' ), text: t( 'stopConfirm' ), confirm: t( 'stopShareBtn' ) } ) ) { const r = await SP.stop( a.space ); if ( r.ok ) { UI.closeSheet(); toast( t( 'tStopped' ) ); } else shareErr( r.error ); } else openShare( a.id ); }
	}
	EXA.shareChange = ( e ) => {
		const u = e.target.dataset && e.target.dataset.shareRole;
		if ( ! u ) return false;
		const a = EX.account( ctx.id ), v = e.target.value;
		if ( a && a.space ) SP.setRole( a.space, u, v ).then( () => toast( t( 'tRoleSaved' ) ) );
		return true;
	};
	EXA.shareSubmit = ( f ) => {
		if ( f.id !== 'joinForm' ) return false;
		const code = f.elements.code.value.trim();
		if ( ! code ) return true;
		if ( ! EX.auth.isSignedIn() ) { UI.closeSheet(); stash( code ); EXA.tryJoin(); return true; }
		join( code );
		return true;
	};

	/* ------------------------------------------------------------------ Joining from a link */

	const KEY = 'expenity.join';
	const stash = ( code ) => { try { localStorage.setItem( KEY, code ); } catch ( e ) { /* ignore */ } };
	const stashed = () => { try { return localStorage.getItem( KEY ) || ''; } catch ( e ) { return ''; } };
	EXA.pendingJoin = () => stashed();
	/** A link ends in #join=CODE. Keep the code, tidy the address, and join as soon as the person is signed in. */
	EXA.readJoinLink = () => {
		const m = /[#&]join=([A-Za-z0-9]{6,14})/.exec( location.hash );
		if ( ! m ) return;
		stash( m[ 1 ].toUpperCase() );
		try { history.replaceState( null, '', location.pathname + location.search ); } catch ( e ) { /* ignore */ }
	};
	EXA.tryJoin = async () => {
		const code = stashed();
		if ( ! code ) return;
		if ( ! EX.auth.isSignedIn() ) { if ( ! EXA.flow.active() ) { toast( t( 'joinNeedAccount' ) ); EXA.openAuth( 'start' ); } return; }
		if ( EXA.flow.active() ) return;
		stash( '' ); try { localStorage.removeItem( KEY ); } catch ( e ) { /* ignore */ }
		const r = await SP.accept( code );
		if ( r.ok ) { toast( t( 'tJoined', { name: r.json.name } ) ); EXA.go( 'more', 'wallets' ); } else { const k = 'err_' + r.error, v = t( k ); toast( v === k ? t( 'err_generic' ) : v ); }
	};
}() );
