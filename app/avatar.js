/** Profile picture: one of 20 built-in characters, or a tiny photo kept in the account settings. Shows a discreet pulse when offline. */
( function () {
	'use strict';
	const { EX, EXA, UI } = window, { t, esc } = EX;
	const A = ( EXA.avatar = {} );
	const eyes = ( x1, x2, y, r = 2.6, c = '#1b2430' ) => `<g class="av-eyes"><circle cx="${ x1 }" cy="${ y }" r="${ r }" fill="${ c }"/><circle cx="${ x2 }" cy="${ y }" r="${ r }" fill="${ c }"/></g>`;
	const smile = ( y = 33, w = 7 ) => `<path d="M${ 24 - w } ${ y }q${ w } ${ w * .9 } ${ w * 2 } 0" fill="none" stroke="#1b2430" stroke-width="2.2" stroke-linecap="round"/>`;
	// [id, background, class for extra motion, drawing in a 48x48 box]
	const P = [
		[ 'cat', '#fbbf24', 'bob', `<path d="M10 22l2-13 9 6h6l9-6 2 13a15 14 0 0 1-28 0z" fill="#fff7e6"/>${ eyes( 19, 29, 26 ) }<path d="M22 30h4l-2 2.4z" fill="#ec6f8c"/>${ smile( 34, 3.5 ) }` ],
		[ 'dog', '#93c5fd', 'bob', `<path d="M9 14c-3 8-2 16 3 18l3-10zM39 14c3 8 2 16-3 18l-3-10z" fill="#8a5a36" class="av-ear"/><circle cx="24" cy="26" r="14" fill="#f5deb8"/>${ eyes( 19, 29, 24 ) }<ellipse cx="24" cy="30" rx="4" ry="3" fill="#1b2430"/>` ],
		[ 'fox', '#fdba74', 'bob', `<path d="M8 10l10 8h12l10-8-2 20-14 10-14-10z" fill="#ea6a1f"/><path d="M16 28l8 12 8-12-8-4z" fill="#fff"/>${ eyes( 18, 30, 24, 2.2 ) }<circle cx="24" cy="36" r="2.2" fill="#1b2430"/>` ],
		[ 'panda', '#bbf7d0', 'bob', `<circle cx="12" cy="12" r="6" fill="#222"/><circle cx="36" cy="12" r="6" fill="#222"/><circle cx="24" cy="26" r="15" fill="#fff"/><ellipse cx="18" cy="25" rx="4.2" ry="5.2" fill="#222"/><ellipse cx="30" cy="25" rx="4.2" ry="5.2" fill="#222"/><circle cx="18" cy="25" r="1.6" fill="#fff" class="av-eyes"/><circle cx="30" cy="25" r="1.6" fill="#fff" class="av-eyes"/><ellipse cx="24" cy="32" rx="2.6" ry="1.8" fill="#222"/>` ],
		[ 'frog', '#86efac', 'hop', `<circle cx="14" cy="15" r="7" fill="#22a05a"/><circle cx="34" cy="15" r="7" fill="#22a05a"/><ellipse cx="24" cy="28" rx="16" ry="13" fill="#34c070"/><circle cx="14" cy="15" r="3.6" fill="#fff"/><circle cx="34" cy="15" r="3.6" fill="#fff"/>${ eyes( 14, 34, 15, 1.9 ) }${ smile( 31, 9 ) }` ],
		[ 'alien', '#c4b5fd', 'bob', `<path d="M24 6c11 0 17 9 15 19-1 10-8 17-15 17S10 35 9 25C7 15 13 6 24 6z" fill="#7ddf64"/><ellipse cx="17" cy="23" rx="5" ry="7" fill="#1b2430" transform="rotate(20 17 23)"/><ellipse cx="31" cy="23" rx="5" ry="7" fill="#1b2430" transform="rotate(-20 31 23)"/><path d="M21 34q3 2 6 0" stroke="#1b2430" stroke-width="2" fill="none" stroke-linecap="round"/>` ],
		[ 'ghost', '#c7d2fe', 'float', `<path d="M11 40V22a13 13 0 0 1 26 0v18l-4.3-3.6-4.3 3.6-4.4-3.6-4.4 3.6-4.3-3.6z" fill="#fff"/>${ eyes( 19, 29, 23, 2.8 ) }<ellipse cx="24" cy="31" rx="2.6" ry="3.2" fill="#1b2430"/>` ],
		[ 'robot', '#a5f3fc', 'bob', `<rect x="10" y="14" width="28" height="24" rx="6" fill="#cbd5e1"/><path d="M24 14V8" stroke="#64748b" stroke-width="2.4"/><circle cx="24" cy="7" r="2.8" fill="#ef4444" class="av-led"/><rect x="14" y="20" width="20" height="9" rx="4.5" fill="#1b2430"/><g class="av-eyes"><circle cx="19.5" cy="24.5" r="2.4" fill="#4ade80"/><circle cx="28.5" cy="24.5" r="2.4" fill="#4ade80"/></g><path d="M18 34h12" stroke="#64748b" stroke-width="2.4" stroke-linecap="round"/>` ],
		[ 'octopus', '#fbcfe8', 'float', `<path d="M10 24a14 14 0 0 1 28 0v6c0 3-2 5-4 5s-2-3-4-3-2 4-6 4-4-4-6-4-2 3-4 3-4-2-4-5z" fill="#d946a8"/>${ eyes( 19, 29, 23, 2.6, '#fff' ) }${ eyes( 19.4, 29.4, 23.4, 1.2 ) }${ smile( 30, 3.5 ) }` ],
		[ 'owl', '#fde68a', 'bob', `<path d="M10 14l7 4h14l7-4v18a14 12 0 0 1-28 0z" fill="#9a6b3e"/><circle cx="18" cy="24" r="6" fill="#fff"/><circle cx="30" cy="24" r="6" fill="#fff"/>${ eyes( 18, 30, 24, 2.6 ) }<path d="M21.5 29h5l-2.5 4z" fill="#f59e0b"/>` ],
		[ 'bear', '#fed7aa', 'bob', `<circle cx="11" cy="13" r="5.5" fill="#8b5a2b"/><circle cx="37" cy="13" r="5.5" fill="#8b5a2b"/><circle cx="24" cy="26" r="15" fill="#a9733c"/><ellipse cx="24" cy="31" rx="7" ry="5.2" fill="#e8c9a0"/>${ eyes( 18, 30, 22, 2.2 ) }<ellipse cx="24" cy="29.5" rx="2.4" ry="1.8" fill="#1b2430"/>` ],
		[ 'bunny', '#fecdd3', 'hop', `<ellipse cx="17" cy="11" rx="4" ry="10" fill="#fff"/><ellipse cx="31" cy="11" rx="4" ry="10" fill="#fff"/><ellipse cx="17" cy="11" rx="1.8" ry="7" fill="#f9a8b8"/><ellipse cx="31" cy="11" rx="1.8" ry="7" fill="#f9a8b8"/><circle cx="24" cy="29" r="13" fill="#fff"/>${ eyes( 19, 29, 27 ) }<path d="M22 32h4l-2 2z" fill="#f472a0"/>` ],
		[ 'monster', '#fdba74', 'bob', `<path d="M13 12l3 6M35 12l-3 6" stroke="#6d28d9" stroke-width="3" stroke-linecap="round"/><rect x="9" y="14" width="30" height="27" rx="13" fill="#8b5cf6"/><circle cx="24" cy="25" r="7" fill="#fff"/><circle cx="24" cy="25" r="3.4" fill="#1b2430" class="av-eyes"/><path d="M15 34h18l-3 4-3-3-3 3-3-3-3 3z" fill="#fff"/>` ],
		[ 'unicorn', '#e9d5ff', 'float', `<path d="M24 3l3 10h-6z" fill="#fbbf24"/><path d="M11 17c-3 6-2 15 4 19l4-8z" fill="#f472b6"/><circle cx="25" cy="27" r="13" fill="#fff"/>${ eyes( 20, 30, 26 ) }${ smile( 32, 3.5 ) }` ],
		[ 'chick', '#fef08a', 'hop', `<circle cx="24" cy="26" r="15" fill="#facc15"/><path d="M24 7q-3 3-1 6M24 7q3 2 2 6" stroke="#eab308" stroke-width="2.4" fill="none" stroke-linecap="round"/>${ eyes( 18, 30, 24 ) }<path d="M20.5 29h7l-3.5 5z" fill="#f97316"/>` ],
		[ 'cactus', '#fde68a', 'float', `<rect x="17" y="10" width="14" height="30" rx="7" fill="#3da35d"/><path d="M17 22h-4a3 3 0 0 1-3-3v-4M31 26h4a3 3 0 0 0 3-3v-5" fill="none" stroke="#3da35d" stroke-width="5" stroke-linecap="round"/>${ eyes( 21.5, 26.5, 22, 1.8 ) }${ smile( 28, 2.5 ) }<circle cx="24" cy="9" r="3" fill="#f472b6"/>` ],
		[ 'sun', '#7dd3fc', 'spin', `<g class="av-rays" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"><path d="M24 4v6M24 38v6M4 24h6M38 24h6M10 10l4 4M34 34l4 4M38 10l-4 4M14 34l-4 4"/></g><circle cx="24" cy="24" r="11" fill="#fbbf24"/>${ eyes( 20, 28, 22, 1.8 ) }${ smile( 27, 4 ) }` ],
		[ 'rings', '#1f2937', 'spin', `<circle cx="24" cy="24" r="16" fill="none" stroke="#34d399" stroke-width="3"/><circle cx="24" cy="24" r="10" fill="none" stroke="#60a5fa" stroke-width="3"/><circle cx="24" cy="24" r="4" fill="#f9a8d4"/>` ],
		[ 'halves', '#e5e7eb', '', `<path d="M24 8a16 16 0 0 0 0 32z" fill="#111827"/><path d="M24 8a16 16 0 0 1 0 32z" fill="#10b981"/>` ],
		[ 'peaks', '#bfdbfe', '', `<path d="M4 38l14-22 9 13 6-8 11 17z" fill="#1e3a8a"/><circle cx="35" cy="12" r="4" fill="#fbbf24"/>` ],
	];
	A.presets = P.map( ( p ) => p[ 0 ] );
	const find = ( id ) => P.find( ( p ) => p[ 0 ] === id );
	A.svg = ( id ) => { const p = find( id ); return p ? `<svg viewBox="0 0 48 48" class="av-art av-${ p[ 2 ] || 'still' }" aria-hidden="true"><rect width="48" height="48" fill="${ p[ 1 ] }"/><g class="av-body">${ p[ 3 ] }</g></svg>` : ''; };
	A.current = () => { const a = EX.state().settings.avatar; return a && ( a.type === 'preset' ? find( a.id ) && a : a.type === 'photo' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test( a.data || '' ) && a ) || null; };
	/** The inside of an avatar circle; `fallback` is used when nothing was chosen. */
	A.inner = ( fallback ) => { const a = A.current(); return a ? ( a.type === 'photo' ? `<img class="av-photo" alt="" src="${ a.data }">` : A.svg( a.id ) ) : fallback; };
	A.has = () => !! A.current();
	A.offline = () => navigator.onLine === false || ( EX.auth.isSignedIn() && EX.sync.status === 'offline' );
	const mark = () => document.querySelectorAll( '.avatar' ).forEach( ( el ) => el.classList.toggle( 'offline', A.offline() ) );
	window.addEventListener( 'online', mark ); window.addEventListener( 'offline', mark );
	EX.on( 'syncstatus', mark );

	/** Shrinks a photo to a small centred square JPEG that fits comfortably inside the synced settings. */
	A.compress = async ( file ) => {
		if ( ! /^image\/(jpeg|png|webp|heic|heif)$/.test( file.type ) || file.size > 20 * 1024 * 1024 ) throw Error( 'photoType' );
		let img; try { img = await createImageBitmap( file, { imageOrientation: 'from-image' } ); } catch ( e ) { throw Error( 'photoType' ); }
		try {
			const s = Math.min( img.width, img.height ), sx = ( img.width - s ) / 2, sy = ( img.height - s ) / 2;
			for ( const edge of [ 96, 80, 64, 48 ] ) {
				const c = document.createElement( 'canvas' ); c.width = c.height = edge;
				const g = c.getContext( '2d' ); g.fillStyle = '#fff'; g.fillRect( 0, 0, edge, edge ); g.drawImage( img, sx, sy, s, s, 0, 0, edge, edge );
				for ( const q of [ .8, .65, .5 ] ) { const d = c.toDataURL( 'image/jpeg', q ); if ( d.length <= 3500 ) return d; }
			}
			throw Error( 'photoType' );
		} finally { img.close(); }
	};
	const set = ( v ) => { const s = EX.state().settings; if ( v ) s.avatar = v; else delete s.avatar; s.u = Date.now(); EX.persist(); EXA.render(); };
	const CHECK = '<i class="av-check" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M5.5 12.5l4.2 4.2 8.8-9.2" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></i>';
	// Choices are only a preview until Save; Cancel (or the X) leaves the picture as it was.
	let pending, undef;
	const sheet = ( fresh ) => {
		if ( fresh === true ) pending = undef;
		const saved = A.current(), cur = pending === undef ? saved : pending;
		UI.openSheet( `<div class="sheet-head"><button class="ab-btn" data-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button><h2>${ esc( t( 'avatarTitle' ) ) }</h2></div><div class="sheet-pad">
			<div class="av-grid" role="radiogroup" aria-label="${ esc( t( 'avatarTitle' ) ) }">${ A.presets.map( ( id ) => `<button type="button" class="avatar av-pick${ cur && cur.id === id ? ' sel' : '' }" role="radio" aria-checked="${ !! ( cur && cur.id === id ) }" aria-label="${ esc( t( 'av_' + id ) ) }" data-avatar-preset="${ id }">${ A.svg( id ) }${ cur && cur.id === id ? CHECK : '' }</button>` ).join( '' ) }</div>
			${ cur && cur.type === 'photo' ? `<div class="av-photo-row"><span class="avatar big av-pick sel pic"><img class="av-photo" alt="" src="${ cur.data }">${ CHECK }</span><span class="mid"><b>${ esc( t( 'avatarPhotoActive' ) ) }</b><small>${ esc( t( 'avatarPhotoPreview' ) ) }</small></span></div>` : '' }
			<div class="btn-row"><button type="button" class="btn btn-ghost" data-avatar-photo>${ UI.icon( 'photo', 20 ) } ${ esc( t( cur && cur.type === 'photo' ? 'avatarPhotoChange' : 'avatarPhoto' ) ) }</button>${ cur ? `<button type="button" class="btn btn-ghost" data-avatar-clear>${ esc( t( 'avatarClear' ) ) }</button>` : '' }<input type="file" id="avatarFile" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden></div>
			<p class="muted small">${ esc( t( 'avatarHint' ) ) }</p><p class="photo-status" id="avatarStatus" role="status"></p><div class="btn-row av-actions"><button type="button" class="btn btn-ghost" data-avatar-cancel>${ esc( t( 'cancel' ) ) }</button><button type="button" class="btn btn-primary" data-avatar-save>${ esc( t( 'save' ) ) }</button></div></div>`, { tall: true } );
	};
	A.open = sheet;
	document.addEventListener( 'click', ( e ) => {
		const b = e.target.closest( '[data-avatar-open],[data-avatar-preset],[data-avatar-photo],[data-avatar-clear],[data-avatar-save],[data-avatar-cancel]' ); if ( ! b ) return;
		e.preventDefault(); e.stopImmediatePropagation();
		if ( b.hasAttribute( 'data-avatar-open' ) ) sheet( true );
		else if ( b.dataset.avatarPreset ) { pending = { type: 'preset', id: b.dataset.avatarPreset }; sheet(); }
		else if ( b.hasAttribute( 'data-avatar-clear' ) ) { pending = null; sheet(); }
		else if ( b.hasAttribute( 'data-avatar-save' ) ) { set( pending === undef ? A.current() : pending ); pending = undef; UI.closeSheet( true ); UI.done( t( 'tSaved' ) ); }
		else if ( b.hasAttribute( 'data-avatar-cancel' ) ) { pending = undef; UI.closeSheet( true ); }
		else document.getElementById( 'avatarFile' ).click();
	}, true );
	document.addEventListener( 'change', async ( e ) => {
		if ( e.target.id !== 'avatarFile' || ! e.target.files[ 0 ] ) return;
		const st = document.getElementById( 'avatarStatus' );
		try { const data = await A.compress( e.target.files[ 0 ] ); pending = { type: 'photo', data }; sheet(); }
		catch ( err ) { if ( st ) st.textContent = t( 'photoType' ); }
		e.target.value = '';
	} );
}() );
