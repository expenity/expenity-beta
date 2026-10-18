/** Contact form: feedback and problem reports with simple formatting and up to four photos (shrunk here before they are sent). */
( function () {
	'use strict';
	const { EX, EXA, UI } = window, { t, esc } = EX;
	const C = ( EXA.contact = {} );
	const CATS = [ 'feedback', 'bug', 'idea', 'question' ];
	let photos = [], cat = 'feedback', busy = false;
	const head = ( title ) => `<div class="sheet-head"><button class="ab-btn" data-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button><h2>${ esc( title ) }</h2></div>`;
	const tool = ( cmd, icon, label, val ) => `<button type="button" class="rt-btn" data-rt="${ cmd }"${ val ? ` data-rt-val="${ val }"` : '' } aria-label="${ esc( t( label ) ) }" title="${ esc( t( label ) ) }">${ icon }</button>`;
	C.shrink = async ( file ) => {
		if ( ! /^image\/(jpeg|png|webp|heic|heif)$/.test( file.type ) || file.size > 25 * 1024 * 1024 ) throw Error( 'contactPhotoType' );
		let img; try { img = await createImageBitmap( file, { imageOrientation: 'from-image' } ); } catch ( e ) { throw Error( 'contactPhotoType' ); }
		try {
			let edge = 1280;
			while ( edge >= 480 ) {
				const k = Math.min( 1, edge / Math.max( img.width, img.height ) ), c = document.createElement( 'canvas' ); c.width = Math.max( 1, Math.round( img.width * k ) ); c.height = Math.max( 1, Math.round( img.height * k ) );
				const g = c.getContext( '2d' ); g.fillStyle = '#fff'; g.fillRect( 0, 0, c.width, c.height ); g.drawImage( img, 0, 0, c.width, c.height );
				for ( const q of [ .72, .6, .48, .38 ] ) { const d = c.toDataURL( 'image/jpeg', q ); if ( d.length <= 420000 ) return d; }
				edge = Math.floor( edge * .75 );
			}
			throw Error( 'contactPhotoType' );
		} finally { img.close(); }
	};
	const thumbs = () => photos.map( ( p, i ) => `<span class="ct-thumb"><img alt="" src="${ p }"><button type="button" data-ct-rm="${ i }" aria-label="${ esc( t( 'photoRemove' ) ) }">${ UI.icon( 'x', 14 ) }</button></span>` ).join( '' );
	C.open = () => {
		photos = []; cat = 'feedback'; busy = false;
		const u = EX.auth.user() || {};
		UI.openSheet( head( t( 'contactTitle' ) ) + `<form class="sheet-pad ct" id="contactForm" novalidate>
			<p class="muted small">${ esc( t( 'contactIntro' ) ) }</p>
			<div class="chips wrap" role="radiogroup" aria-label="${ esc( t( 'contactType' ) ) }">${ CATS.map( ( c ) => `<button type="button" class="chip${ c === cat ? ' on' : '' }" role="radio" aria-checked="${ c === cat }" data-ct-cat="${ c }">${ esc( t( 'contactCat_' + c ) ) }</button>` ).join( '' ) }</div>
			<label class="f"><span>${ esc( t( 'contactSubject' ) ) }</span><input name="subject" maxlength="100" autocomplete="off"></label>
			<div class="f"><span id="ctMsgLabel">${ esc( t( 'contactMessage' ) ) }</span>
				<div class="rt-bar" role="toolbar" aria-label="${ esc( t( 'contactFormat' ) ) }">${ tool( 'bold', '<b>B</b>', 'rtBold' ) }${ tool( 'italic', '<i>I</i>', 'rtItalic' ) }${ tool( 'underline', '<u>U</u>', 'rtUnderline' ) }${ tool( 'insertUnorderedList', UI.icon( 'list-details', 18 ), 'rtBullets' ) }${ tool( 'insertOrderedList', '1.', 'rtNumbers' ) }${ tool( 'formatBlock', 'H', 'rtHeading', 'h3' ) }${ tool( 'formatBlock', '❝', 'rtQuote', 'blockquote' ) }${ tool( 'createLink', UI.icon( 'link', 18 ), 'rtLink' ) }${ tool( 'removeFormat', '✕', 'rtClear' ) }</div>
				<div class="rt-edit" id="ctEditor" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="ctMsgLabel" data-ph="${ esc( t( 'contactPlaceholder' ) ) }"></div></div>
			<div class="f"><span>${ esc( t( 'contactPhotos' ) ) }</span><div class="ct-thumbs" id="ctThumbs"></div><input type="file" id="ctFile" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple hidden>
				<button type="button" class="btn btn-ghost" data-ct-add>${ UI.icon( 'photo', 20 ) } ${ esc( t( 'contactAddPhoto' ) ) }</button><small class="muted">${ esc( t( 'contactPhotoHint' ) ) }</small></div>
			<label class="f"><span>${ esc( t( 'contactEmail' ) ) }</span><input name="email" type="email" inputmode="email" autocomplete="email" value="${ esc( u.email || '' ) }" placeholder="${ esc( t( 'contactEmailPh' ) ) }"></label>
			<label class="entry-check"><input type="checkbox" name="info" checked> ${ esc( t( 'contactInfo' ) ) }</label>
			<input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;opacity:0;height:0">
			<p class="err" id="ctErr" role="alert" hidden></p>
			<div class="btn-row"><button type="button" class="btn btn-ghost" data-close>${ esc( t( 'cancel' ) ) }</button><button type="submit" class="btn btn-primary" id="ctSend">${ UI.icon( 'send', 20 ) } ${ esc( t( 'contactSend' ) ) }</button></div></form>`, { tall: true } );
		document.getElementById( 'ctThumbs' ).innerHTML = '';
	};
	const err = ( k ) => { const e = document.getElementById( 'ctErr' ); if ( e ) { e.textContent = t( k ); e.hidden = ! k; } };
	document.addEventListener( 'click', ( e ) => {
		const b = e.target.closest( '[data-contact-open],[data-rt],[data-ct-cat],[data-ct-add],[data-ct-rm]' ); if ( ! b ) return;
		if ( b.hasAttribute( 'data-contact-open' ) ) { e.preventDefault(); e.stopImmediatePropagation(); C.open(); return; }
		if ( b.dataset.ctCat ) { cat = b.dataset.ctCat; document.querySelectorAll( '[data-ct-cat]' ).forEach( ( x ) => { x.classList.toggle( 'on', x === b ); x.setAttribute( 'aria-checked', String( x === b ) ); } ); return; }
		if ( b.hasAttribute( 'data-ct-add' ) ) { if ( photos.length >= 4 ) { err( 'contactPhotoMax' ); return; } document.getElementById( 'ctFile' ).click(); return; }
		if ( b.dataset.ctRm !== undefined ) { photos.splice( Number( b.dataset.ctRm ), 1 ); document.getElementById( 'ctThumbs' ).innerHTML = thumbs(); return; }
		if ( b.dataset.rt ) {
			e.preventDefault(); const ed = document.getElementById( 'ctEditor' ); ed.focus(); let val = b.dataset.rtVal || null;
			if ( b.dataset.rt === 'createLink' ) { val = window.prompt( t( 'rtLinkPrompt' ), 'https://' ); if ( ! val || ! /^https?:\/\//i.test( val ) ) return; }
			try { document.execCommand( b.dataset.rt, false, val ); } catch ( x ) { /* ignore */ }
		}
	} );
	// Toolbar buttons must not steal the editor's selection.
	document.addEventListener( 'mousedown', ( e ) => { if ( e.target.closest( '.rt-btn' ) ) e.preventDefault(); } );
	// Paste as plain text so no foreign styling comes along.
	document.addEventListener( 'paste', ( e ) => { if ( ! e.target.closest || ! e.target.closest( '#ctEditor' ) ) return; e.preventDefault(); const txt = ( e.clipboardData || window.clipboardData ).getData( 'text/plain' ); document.execCommand( 'insertText', false, txt ); } );
	document.addEventListener( 'change', async ( e ) => {
		if ( e.target.id !== 'ctFile' ) return;
		const files = [ ...e.target.files ]; e.target.value = ''; err( '' );
		for ( const f of files ) {
			if ( photos.length >= 4 ) { err( 'contactPhotoMax' ); break; }
			try { photos.push( await C.shrink( f ) ); } catch ( x ) { err( x.message === 'contactPhotoType' ? 'contactPhotoType' : 'contactFail' ); }
		}
		const th = document.getElementById( 'ctThumbs' ); if ( th ) th.innerHTML = thumbs();
	} );
	document.addEventListener( 'submit', async ( e ) => {
		if ( e.target.id !== 'contactForm' ) return; e.preventDefault(); e.stopImmediatePropagation();
		if ( busy ) return; err( '' );
		const f = e.target.elements, ed = document.getElementById( 'ctEditor' ), html = ed.innerHTML, text = ed.innerText.trim();
		if ( text.length < 5 ) { err( 'contactEmpty' ); ed.focus(); return; }
		const email = f.email.value.trim(); if ( email && ! /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test( email ) ) { err( 'contactBadEmail' ); f.email.focus(); return; }
		busy = true; const btn = document.getElementById( 'ctSend' ); btn.disabled = true; btn.textContent = t( 'contactSending' );
		const meta = f.info.checked ? { version: window.EXPENITY_VERSION, lang: EX.lang(), plan: EXA.features ? EXA.features.plan() : '', signedIn: EX.auth.isSignedIn(), ua: navigator.userAgent } : {};
		const r = await EX.api( 'POST', '/api/contact', { category: cat, subject: f.subject.value, html, email, name: ( EX.state().settings.name || '' ), photos, website: f.website.value, meta }, { anon: true } );
		busy = false;
		if ( r.ok ) { UI.closeSheet( true ); UI.done( t( 'contactSent' ) ); return; }
		btn.disabled = false; btn.innerHTML = `${ UI.icon( 'send', 20 ) } ${ esc( t( 'contactSend' ) ) }`;
		err( r.error === 'rate_limited' ? 'contactRate' : r.error === 'not_configured' ? 'contactNotConfigured' : r.status === 0 || r.error === 'network' ? 'contactOffline' : 'contactFail' );
	}, true );
}() );
