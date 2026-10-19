/**
 * Share Expenity: a card in About and a gentle, once-in-a-while prompt on Home. On phones the button opens the device's own share
 * sheet; everywhere there is Copy link. Sharing sends only the link. Each press adds one to an anonymous daily counter on the server
 * (no account, device or address is stored) so we can see whether sharing works.
 */
( function () {
	'use strict';
	const { EX, UI, EXA } = window, { t, esc } = EX;
	const S = EX.state, D = () => S().device;
	const DAY = 864e5, WAIT_DAYS = 7, MIN_ENTRIES = 3;
	const url = () => 'https://expenity.github.io/expenity/' + ( EX.lang() === 'el' ? 'el/' : '' ) + '?ref=share';
	const count = ( kind ) => { try { EX.api( 'POST', '/api/share', { kind }, { anon: true } ); } catch ( e ) { /* counting never blocks sharing */ } };

	EXA.shareCard = () => `<section class="card share-card"><div class="share-head">${ UI.ci( 'heart', 'pink', 48 ) }<div><h2>${ esc( t( 'shareTitle' ) ) }</h2><p class="muted">${ esc( t( 'shareText' ) ) }</p></div></div>
		<div class="btn-row"><button type="button" class="btn btn-primary" data-share="about">${ UI.icon( 'send', 20 ) } ${ esc( t( 'shareBtn' ) ) }</button><button type="button" class="btn btn-ghost" data-share-copy="about">${ UI.icon( 'copy', 20 ) } ${ esc( t( 'shareCopy' ) ) }</button></div>
		<p class="muted small">${ esc( t( 'shareNote' ) ) }</p></section>`;

	/** On Home, once: a week after first use, with a few entries, and never twice in a row (Maybe later waits a month). */
	EXA.sharePrompt = () => {
		const d = D();
		if ( ! d.firstSeen ) { d.firstSeen = Date.now(); EX.persist(); return ''; }
		if ( d.shareDone || ( d.shareLater && Date.now() < d.shareLater ) ) return '';
		if ( Date.now() - d.firstSeen < WAIT_DAYS * DAY || S().txs.length + S().bills.length < MIN_ENTRIES ) return '';
		return `<section class="promo share-promo"><div class="promo-head">${ UI.ci( 'heart', 'pink', 44 ) }<div><b>${ esc( t( 'sharePromptTitle' ) ) }</b><p>${ esc( t( 'sharePromptText' ) ) }</p></div></div><div class="btn-row"><button type="button" class="btn btn-primary" data-share="prompt">${ esc( t( 'shareBtn' ) ) }</button><button type="button" class="btn btn-text" data-share-later>${ esc( t( 'notNow' ) ) }</button></div></section>`;
	};

	const copy = async ( text ) => {
		try { await navigator.clipboard.writeText( text ); return true; } catch ( e ) { /* older browsers */ }
		const ta = document.createElement( 'textarea' ); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild( ta ); ta.select();
		try { return document.execCommand( 'copy' ); } catch ( e ) { return false; } finally { ta.remove(); }
	};
	document.addEventListener( 'click', async ( e ) => {
		const b = e.target.closest( '[data-share],[data-share-copy],[data-share-later]' ); if ( ! b ) return;
		e.preventDefault();
		if ( b.hasAttribute( 'data-share-later' ) ) { D().shareLater = Date.now() + 30 * DAY; EX.persist(); EXA.render && EXA.render(); return; }
		const src = b.dataset.share || b.dataset.shareCopy, link = url(), message = t( 'shareMessage' );
		if ( b.hasAttribute( 'data-share' ) && navigator.share ) {
			try { await navigator.share( { title: 'Expenity', text: message, url: link } ); count( src + '_native' ); D().shareDone = true; EX.persist(); UI.toast( t( 'shareThanks' ) ); EXA.render && EXA.render(); } catch ( err ) { /* cancelled */ }
			return;
		}
		if ( await copy( message + ' ' + link ) ) { count( src + '_copy' ); D().shareDone = true; EX.persist(); UI.toast( t( 'shareCopied' ) ); EXA.render && EXA.render(); } else UI.toast( link );
	} );

	Object.assign( EX.I18N.langs.en, {
		shareTitle: 'Share the love', shareText: 'Got a friend who loses track of their money? Be the hero who sends them this.',
		shareBtn: 'Share the love', shareCopy: 'Copy link', shareNote: 'Sharing sends only a link. Each press adds one to an anonymous counter, with nothing about you.',
		shareMessage: 'Psst… I found an app that shows me where my money goes (and makes it kind of fun). Free, works on any device. Take a look:',
		shareCopied: 'Copied! Now go spread the word.', shareThanks: 'Thank you for spreading the word!',
		sharePromptTitle: 'Enjoying Expenity?', sharePromptText: 'Know someone who would love it too? Send them the link in two taps.',
	} );
	Object.assign( EX.I18N.langs.el, {
		shareTitle: 'Μοιραστείτε την αγάπη', shareText: 'Έχετε φίλο που χάνει το μέτρημα των χρημάτων του; Γίνετε ο ήρωας που θα του το στείλει.',
		shareBtn: 'Μοιραστείτε την αγάπη', shareCopy: 'Αντιγραφή συνδέσμου', shareNote: 'Η κοινοποίηση στέλνει μόνο έναν σύνδεσμο. Κάθε πάτημα προσθέτει ένα στον ανώνυμο μετρητή, χωρίς κανένα στοιχείο σας.',
		shareMessage: 'Ψιτ… βρήκα μια εφαρμογή που μου δείχνει πού πάνε τα χρήματά μου (και είναι και διασκεδαστική). Δωρεάν, δουλεύει σε κάθε συσκευή. Δείτε την:',
		shareCopied: 'Αντιγράφηκε! Τώρα πείτε το και στους άλλους.', shareThanks: 'Ευχαριστούμε που το μοιραστήκατε!',
		sharePromptTitle: 'Σας αρέσει το Expenity;', sharePromptText: 'Γνωρίζετε κάποιον που θα το λάτρευε κι αυτός; Στείλτε του τον σύνδεσμο με δύο πατήσεις.',
	} );
}() );
