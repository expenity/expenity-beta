/**
 * Adjust balance: the person types what a wallet really holds, and the app records the difference as a labelled entry dated
 * today in the built-in category "Wallet adjustment". It changes the wallet balance but is neither income nor spending
 * (EX.isAdjust, see core.js). Also the gentle "Does this still match your bank?" card on Home.
 */
( function () {
	'use strict';
	const { EX, EXA, UI } = window, { t, esc } = EX;
	const S = () => EX.state();
	const A = ( EXA.adjust = {} );
	const money = ( c, cur ) => EX.money( c / 100, cur );
	const signed = ( x ) => ( x.type === 'income' ? 1 : -1 ) * EX.cents( x.amount );
	const head = ( title ) => `<div class="sheet-head"><button type="button" class="ab-btn" data-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button><h2 id="sheetTitle">${ esc( title ) }</h2><span class="sp"></span></div>`;
	const amountOf = ( v ) => { v = String( v || '' ).trim().replace( ',', '.' ); return /^-?\d+(\.\d{1,2})?$/.test( v ) ? EX.cents( v ) : null; };
	A.can = ( a ) => !! a && ! a.archived && EX.canWrite( a.id );

	/* ------------------------------------------------------------------ The sheet */

	let st = null, shownType = '';
	A.open = ( accId, txId ) => {
		const a = EX.account( accId ); if ( ! a || ! EX.canWrite( a.id ) ) return;
		const tx = txId ? S().txs.find( ( x ) => x.id === txId ) : null, now = EX.balance( a );
		st = { a, tx, base: now - ( tx ? signed( tx ) : 0 ) };
		shownType = ''; // the category list is built fresh for every sheet (it stayed empty when editing an entry after adjusting before)
		const fine = matchMedia( '(pointer: fine)' ).matches; // the keyboard never opens by itself on touch devices
		UI.openSheet( `${ head( t( 'adjTitle' ) ) }<form id="adjForm" novalidate class="sheet-pad">
			<p class="adj-now">${ esc( t( 'adjNow', { wallet: EX.accountName( a ), amount: money( now, a.currency ) } ) ) }</p>
			<label class="f"><span>${ esc( t( 'adjHolds', { cur: a.currency } ) ) }</span><input name="real" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${ tx ? esc( EX.fromCents( now ) ) : '' }"${ fine ? ' autofocus' : '' }></label>
			<p class="adj-diff muted" id="adjDiff" aria-live="polite"></p>
			<div id="adjWhere" hidden><label class="f"><span id="adjWhereLbl"></span><select name="cat"></select></label><p class="muted small">${ esc( t( 'adjWhereHint' ) ) }</p></div>
			<p class="muted small">${ esc( t( 'adjNote' ) ) }</p>
			<div class="btn-row sticky-actions">${ tx ? `<button type="button" class="btn btn-danger" id="adjDel">${ esc( t( 'del' ) ) }</button>` : '' }<span class="sp"></span><button type="submit" class="btn btn-primary">${ esc( t( 'adjSave' ) ) }</button></div></form>`, { cls: 'small' } );
		diff();
	};
	function diff() {
		const f = document.getElementById( 'adjForm' ); if ( ! f || ! st ) return;
		const real = amountOf( f.elements.real.value ), d = real == null ? 0 : real - st.base, where = document.getElementById( 'adjWhere' ), out = document.getElementById( 'adjDiff' );
		out.textContent = real == null || ( d === 0 && ! st.tx ) ? '' : d === 0 ? t( 'adjSame' ) : t( d > 0 ? 'adjUp' : 'adjDown', { amount: money( Math.abs( d ), st.a.currency ) } );
		where.hidden = d === 0 || real == null;
		const type = d > 0 ? 'income' : 'expense';
		if ( ! where.hidden && type !== shownType ) {
			shownType = type; const sel = f.elements.cat;
			document.getElementById( 'adjWhereLbl' ).textContent = t( d > 0 ? 'adjWhereUp' : 'adjWhereDown' );
			sel.innerHTML = `<option value="${ EX.ADJUST_CAT }">${ esc( t( 'cat_walletAdjust' ) ) }</option>` + EX.catList( type ).filter( ( c ) => c.key !== 'uncategorized' ).map( ( c ) => `<option value="${ esc( c.key ) }">${ esc( c.name ) }</option>` ).join( '' );
			if ( st.tx && ! EX.isAdjust( st.tx ) && st.tx.type === type ) sel.value = st.tx.category;
		}
	}
	function submit() {
		const f = document.getElementById( 'adjForm' ).elements, real = amountOf( f.real.value );
		if ( real == null ) { UI.flagField( f.real, '' ); return; }
		const { a, tx } = st, d = real - st.base;
		if ( d === 0 ) {
			if ( tx ) return remove( tx ); // the entry is no longer needed
			A.mark( a.id ); UI.closeSheet(); UI.done( t( 'adjMatches' ) ); EXA.render(); return;
		}
		const cat = f.cat.value || EX.ADJUST_CAT, isAdj = cat === EX.ADJUST_CAT;
		const rec = { id: tx ? tx.id : EX.uid(), type: d > 0 ? 'income' : 'expense', amount: EX.fromCents( Math.abs( d ) ), account: a.id, category: cat, date: tx ? tx.date : EX.today(), name: isAdj ? '' : t( 'adjName' ) };
		if ( isAdj ) rec.adjust = true;
		const list = S().txs, i = tx ? list.indexOf( tx ) : -1, before = tx ? Object.assign( {}, tx ) : null;
		if ( i >= 0 ) list[ i ] = rec; else list.push( rec );
		A.mark( a.id ); UI.closeSheet(); EX.save(); UI.haptic();
		UI.toast( t( 'adjDone', { amount: money( EX.balance( a ), a.currency ) } ), () => { const k = S().txs.findIndex( ( x ) => x.id === rec.id ); if ( k < 0 ) return; if ( before ) S().txs[ k ] = before; else S().txs.splice( k, 1 ); EX.save(); } );
	}
	function remove( tx ) {
		const i = S().txs.indexOf( tx ); if ( i < 0 ) return;
		S().txs.splice( i, 1 ); UI.closeSheet(); EX.save();
		UI.toast( t( 'tTxDeleted' ), () => { S().txs.splice( i, 0, tx ); EX.save(); } );
	}
	document.addEventListener( 'input', ( e ) => { if ( e.target.closest && e.target.closest( '#adjForm' ) && e.target.name === 'real' ) diff(); } );
	document.addEventListener( 'submit', ( e ) => { if ( e.target.id !== 'adjForm' ) return; e.preventDefault(); e.stopImmediatePropagation(); submit(); }, true );
	document.addEventListener( 'click', ( e ) => {
		const o = e.target.closest( '[data-adj-open]' );
		if ( o ) { e.preventDefault(); e.stopImmediatePropagation(); const id = o.dataset.adjOpen; if ( UI.sheetOpen() ) UI.closeSheet( true ); setTimeout( () => A.open( id ), 0 ); return; }
		if ( e.target.closest( '#adjDel' ) && st && st.tx ) { e.preventDefault(); e.stopImmediatePropagation(); remove( st.tx ); return; }
		const ok = e.target.closest( '[data-adj-ok]' ), later = e.target.closest( '[data-adj-later]' );
		if ( ok || later ) { e.preventDefault(); e.stopImmediatePropagation(); const id = ( ok || later ).dataset.adjOk || ( ok || later ).dataset.adjLater; if ( ok ) A.mark( id ); else A.snooze( id ); EX.persist(); EXA.render(); }
	}, true );
	// Editing an adjustment opens this sheet, not the entry editor.
	const openTx = EXA.openTx;
	EXA.openTx = function ( tx ) { if ( tx && EX.isAdjust( tx ) && EX.account( tx.account ) ) return A.open( tx.account, tx.id ); return openTx.apply( this, arguments ); };
	// The button inside the wallet sheet (reached from the wallet cards on Home and from More → Wallets).
	A.walletButton = ( a ) => ( A.can( a ) ? `<div class="adj-wallet"><span class="mid"><b>${ esc( t( 'adjTitle' ) ) }</b><small>${ esc( t( 'adjWalletHint', { amount: money( EX.balance( a ), a.currency ) } ) ) }</small></span><button type="button" class="btn btn-ghost" data-adj-open="${ esc( a.id ) }">${ UI.icon( 'adjustments', 20 ) } ${ esc( t( 'adjTitle' ) ) }</button></div>` : '' );

	/* ------------------------------------------------------------------ The Home nudge */
	// device.adjN = { walletId: [ lastCheckedDay, snoozedUntilDay ] }: this device only, a few bytes per wallet.
	const DAYS = 3, FIRST = 2;
	const rec = () => { const d = S().device; if ( ! d.adjN || typeof d.adjN !== 'object' ) d.adjN = {}; return d.adjN; };
	A.mark = ( id ) => { rec()[ id ] = [ EX.today(), '' ]; EX.persist(); };
	A.snooze = ( id ) => { const r = rec(), c = r[ id ] || [ EX.today(), '' ]; r[ id ] = [ c[ 0 ], EX.addDays( EX.today(), 1 ) ]; EX.persist(); };
	A.enabled = () => EX.feature( 'balanceNudge' ) !== false && S().settings.adjNudge !== false;
	/** The one wallet to ask about now, or null. */
	A.pending = () => {
		if ( ! A.enabled() || ( EXA.flow && EXA.flow.active() ) ) return null;
		const d = S().device, now = EX.today();
		if ( ! d.firstSeen ) { d.firstSeen = Date.now(); EX.persist(); }
		if ( Date.now() - d.firstSeen < FIRST * 864e5 ) return null;
		const r = rec(); let best = null, changed = false;
		EX.activeAccounts().forEach( ( a ) => {
			if ( ! A.can( a ) ) return;
			if ( ! r[ a.id ] ) { r[ a.id ] = [ now, '' ]; changed = true; return; } // a new wallet's timer starts when it is first seen
			const [ checked, snoozed ] = r[ a.id ];
			if ( EX.diffDays( now, checked ) < DAYS || ( snoozed && snoozed > now ) ) return;
			if ( ! best || checked < best.checked ) best = { a, checked };
		} );
		if ( changed ) EX.persist();
		return best && best.a;
	};
	A.card = () => {
		const a = A.pending(); if ( ! a ) return '';
		return `<aside class="card adj-nudge" data-adj-nudge="${ esc( a.id ) }"><h2>${ UI.icon( 'wallet', 22 ) } ${ esc( t( 'adjNudgeQ' ) ) }</h2><p>${ esc( t( 'adjNudgeLine', { wallet: EX.accountName( a ), amount: money( EX.balance( a ), a.currency ) } ) ) }</p>
			<div class="btn-row adj-btns"><button type="button" class="btn btn-primary" data-adj-ok="${ esc( a.id ) }">${ esc( t( 'adjLooksRight' ) ) }</button><button type="button" class="btn btn-ghost" data-adj-open="${ esc( a.id ) }">${ esc( t( 'adjAdjust' ) ) }</button><button type="button" class="btn btn-ghost" data-adj-later="${ esc( a.id ) }">${ esc( t( 'adjLater' ) ) }</button></div></aside>`;
	};
	const home = EXA.home; EXA.home = function () { return ( EXA.dashboardEditing && EXA.dashboardEditing() ? '' : A.card() ) + home.apply( this, arguments ); }; // wraps the dashboard, so it loads after dashboard.js
	// The off switch also sits on More → Wallets.
	A.setting = () => `<section class="card"><label class="fx-row"><span class="mid"><b>${ esc( t( 'adjNudgeSet' ) ) }</b><small>${ esc( t( 'adjNudgeSetHint' ) ) }</small></span><input type="checkbox" role="switch" data-adj-nudge-set${ S().settings.adjNudge !== false ? ' checked' : '' }></label></section>`;
	document.addEventListener( 'change', ( e ) => { if ( ! e.target.matches || ! e.target.matches( '[data-adj-nudge-set]' ) ) return; e.stopImmediatePropagation(); const s = S().settings; s.adjNudge = e.target.checked; s.u = Date.now(); EX.persist(); EXA.render(); }, true );

	/* ------------------------------------------------------------------ Strings (new, unreviewed) */
	Object.assign( EX.I18N.langs.en, {
		cat_walletAdjust: 'Wallet adjustment', adjName: 'Balance correction', adjTitle: 'Adjust balance', adjNow: '{wallet}: the app shows {amount}', adjHolds: 'What it holds now ({cur})',
		adjSame: 'This matches what the app shows.', adjUp: 'That is {amount} more than the app shows.', adjDown: 'That is {amount} less than the app shows.',
		adjWhereDown: 'Where did it go?', adjWhereUp: 'Where did it come from?', adjWhereHint: 'Wallet adjustment keeps your reports and budgets clean. Pick a real category only if you know what it was.',
		adjNote: 'The difference is saved as one entry dated today. It changes this wallet only, not your income or spending.', adjSave: 'Save balance', adjDone: 'Balance is now {amount}', adjMatches: 'Already matches, nothing to adjust',
		adjWalletHint: 'Currently {amount}. Fix it if it is not what you really have.', adjNudgeQ: 'Does this still match your bank?', adjNudgeLine: '{wallet} shows {amount}.',
		adjLooksRight: 'Looks right', adjAdjust: 'Adjust', adjLater: 'Later', adjNudgeSet: 'Balance check reminder', adjNudgeSetHint: 'Every few days Home asks if a wallet still matches your bank.',
		fx_balanceNudge: 'Balance check reminder', fxD_balanceNudge: 'Now and then Home asks whether a wallet balance still matches your bank, with a quick way to correct it.',
		tut_adjust: 'Adjust a wallet balance', tutD_adjust: 'Make the app match what you really have',
		tut_adjust_1: 'Open **More → Money organisation → Wallets** (or tap a wallet card on Home), choose the wallet and tap **Adjust balance**.',
		tut_adjust_2: 'Type what the wallet really holds now. The app shows the difference and saves it as a **Wallet adjustment** dated today.',
		tut_adjust_3: 'It changes the balance only, not your income or spending. Not happy? Tap **Undo**, or open the entry in **Activity** to edit or delete it.',
	} );
	Object.assign( EX.I18N.langs.el, {
		cat_walletAdjust: 'Προσαρμογή πορτοφολιού', adjName: 'Διόρθωση υπολοίπου', adjTitle: 'Προσαρμογή υπολοίπου', adjNow: '{wallet}: η εφαρμογή δείχνει {amount}', adjHolds: 'Τι έχει τώρα ({cur})',
		adjSame: 'Συμφωνεί με αυτό που δείχνει η εφαρμογή.', adjUp: 'Είναι {amount} περισσότερα από όσα δείχνει η εφαρμογή.', adjDown: 'Είναι {amount} λιγότερα από όσα δείχνει η εφαρμογή.',
		adjWhereDown: 'Πού πήγαν;', adjWhereUp: 'Από πού ήρθαν;', adjWhereHint: 'Η προσαρμογή πορτοφολιού κρατά καθαρές τις αναφορές και τους προϋπολογισμούς σας. Διαλέξτε πραγματική κατηγορία μόνο αν ξέρετε τι ήταν.',
		adjNote: 'Η διαφορά αποθηκεύεται ως μία εγγραφή με σημερινή ημερομηνία. Αλλάζει μόνο αυτό το πορτοφόλι, όχι τα έσοδα ή τα έξοδά σας.', adjSave: 'Αποθήκευση υπολοίπου', adjDone: 'Το υπόλοιπο είναι τώρα {amount}', adjMatches: 'Ήδη συμφωνεί, δεν χρειάζεται προσαρμογή',
		adjWalletHint: 'Τώρα {amount}. Διορθώστε το αν δεν είναι αυτό που πραγματικά έχετε.', adjNudgeQ: 'Συμφωνεί ακόμα με την τράπεζά σας;', adjNudgeLine: 'Το πορτοφόλι «{wallet}» δείχνει {amount}.',
		adjLooksRight: 'Σωστό', adjAdjust: 'Προσαρμογή', adjLater: 'Αργότερα', adjNudgeSet: 'Υπενθύμιση ελέγχου υπολοίπου', adjNudgeSetHint: 'Κάθε λίγες ημέρες η Αρχική ρωτά αν ένα πορτοφόλι συμφωνεί ακόμα με την τράπεζά σας.',
		fx_balanceNudge: 'Υπενθύμιση ελέγχου υπολοίπου', fxD_balanceNudge: 'Πού και πού η Αρχική ρωτά αν το υπόλοιπο ενός πορτοφολιού συμφωνεί με την τράπεζά σας, με γρήγορο τρόπο διόρθωσης.',
		tut_adjust: 'Προσαρμογή υπολοίπου πορτοφολιού', tutD_adjust: 'Κάντε την εφαρμογή να δείχνει ό,τι πραγματικά έχετε',
		tut_adjust_1: 'Ανοίξτε **Περισσότερα → Οργάνωση οικονομικών → Πορτοφόλια** (ή πατήστε μια κάρτα πορτοφολιού στην Αρχική), διαλέξτε το πορτοφόλι και πατήστε **Προσαρμογή υπολοίπου**.',
		tut_adjust_2: 'Γράψτε τι έχει πραγματικά τώρα το πορτοφόλι. Η εφαρμογή δείχνει τη διαφορά και την αποθηκεύει ως **Προσαρμογή πορτοφολιού** με σημερινή ημερομηνία.',
		tut_adjust_3: 'Αλλάζει μόνο το υπόλοιπο, όχι τα έσοδα ή τα έξοδά σας. Δεν σας αρέσει; Πατήστε **Αναίρεση** ή ανοίξτε την εγγραφή στη **Δραστηριότητα** για να την αλλάξετε ή να τη διαγράψετε.',
	} );
}() );
