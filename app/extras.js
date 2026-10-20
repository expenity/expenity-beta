/**
 * Six helpers: duplicate guard, a daily "you can spend today" number, richer Activity filters, a recently-deleted list,
 * day streaks (a flame for consecutive days under budget) and bill price-change alerts. Each one is a feature in the plans.
 */
( function () {
	'use strict';
	const { EX, EXA, UI } = window, { t, esc } = EX;
	const S = () => EX.state(), today = () => EX.today(), main = () => S().settings.currency;
	const on = ( id ) => ! EX.feature || EX.feature( id ) !== false;
	const money = ( cents, cur = main() ) => EX.money( cents / 100, cur );
	const cents = ( x ) => EX.mainCents( [ { amount: x.amount, currency: EX.txCurrency( x ) } ] );

	/* ------------------------------------------------------------------ 1. Duplicate guard */
	EXA.dupFind = ( tx ) => {
		if ( ! on( 'dupGuard' ) || tx.type === 'transfer' ) return null;
		const name = EX.fold( ( tx.name || '' ).trim() ), amt = EX.cents( tx.amount );
		return S().txs.find( ( x ) => x.type === tx.type && x.account === tx.account && EX.cents( x.amount ) === amt && Math.abs( EX.diffDays( x.date, tx.date ) ) <= 3
			&& ( name ? EX.fold( ( x.name || '' ).trim() ) === name : ( ! x.name && x.category === tx.category ) ) ) || null;
	};
	EXA.dupWarn = ( dup ) => EXA.confirm( { title: t( 'dupTitle' ), text: t( 'dupText', { what: ( dup.name || EX.catInfo( dup.category ).name ) + ' · ' + EX.money( Number( dup.amount ), EX.txCurrency( dup ) ), when: EX.dayName( dup.date ) } ), confirm: t( 'dupAdd' ), danger: false } );

	/* ------------------------------------------------------------------ 2. Daily number */
	const spentOn = ( d ) => EX.reportTxs().filter( ( x ) => x.type === 'expense' && ! x.goalId && x.date === d ).reduce( ( n, x ) => n + cents( x ), 0 );
	/* Targets: the automatic figure, or the person's own spending target (day, week or month) and an optional income target. */
	const tg = () => { const x = S().settings.targets; return { spend: Object.assign( { period: 'auto', amount: '' }, x && x.spend ), income: Object.assign( { period: 'off', amount: '' }, x && x.income ), limits: Object.assign( { day: '', week: '', month: '' }, x && x.limits ) }; };
	const range = ( period, ref = today() ) => {
		if ( period === 'week' ) { const d = EX.parse( ref ), from = EX.addDays( ref, -( ( d.getDay() + 6 ) % 7 ) ); return { from, to: EX.addDays( from, 6 ) }; }
		if ( period === 'month' ) { const d = EX.parse( ref ); return { from: EX.iso( new Date( d.getFullYear(), d.getMonth(), 1 ) ), to: EX.iso( new Date( d.getFullYear(), d.getMonth() + 1, 0 ) ) }; }
		return { from: ref, to: ref };
	};
	const sumIn = ( type, r ) => EX.reportTxs().filter( ( x ) => x.type === type && ! x.goalId && x.date >= r.from && x.date <= r.to ).reduce( ( n, x ) => n + cents( x ), 0 );
	const ringSvg = ( share ) => `<svg class="daily-ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" stroke-opacity=".18" stroke-width="3.5"/><circle class="daily-arc" cx="18" cy="18" r="15" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="94.2" stroke-dashoffset="${ ( 94.2 * ( 1 - share ) ).toFixed( 1 ) }" transform="rotate(-90 18 18)"/></svg>`;
	const editBtn = `<button type="button" class="ab-btn daily-edit" data-target-edit aria-label="${ esc( t( 'targetEdit' ) ) }" title="${ esc( t( 'targetEdit' ) ) }">${ UI.icon( 'pencil', 20 ) }</button>`;
	const spendCard = () => {
		const c = tg().spend, amt = Math.round( ( parseFloat( String( c.amount ).replace( ',', '.' ) ) || 0 ) * 100 );
		if ( c.period !== 'auto' && amt > 0 ) {
			const r = range( c.period ), spent = sumIn( 'expense', r ), left = amt - spent, over = left < 0, share = Math.max( 0, Math.min( 1, left / amt ) );
			return `<div class="daily-card${ over ? ' over' : '' }">${ ringSvg( share ) }<div class="daily-copy"><small>${ esc( t( over ? 'targetOver_' + c.period : 'targetLeft_' + c.period ) ) }</small><strong>${ esc( money( Math.abs( left ) ) ) }</strong><span>${ esc( t( 'targetOf_' + c.period, { amount: money( amt ), date: EX.dayName( r.to ) } ) ) }</span></div>${ editBtn }</div>`;
		}
		if ( ! EX.safeSpend ) return '';
		const r = EX.safeSpend.calculate(); if ( ! r.valid || ! Number.isFinite( r.daily ) ) return '';
		const left = Math.max( 0, r.daily ), spent = sumIn( 'expense', range( 'day' ) ), share = left + spent ? Math.max( 0, Math.min( 1, left / ( left + spent ) ) ) : 1, over = r.shortfall > 0 && left === 0;
		return `<div class="daily-card${ over ? ' over' : '' }">${ ringSvg( share ) }<div class="daily-copy"><small>${ esc( t( over ? 'dailyOver' : 'dailyTitle' ) ) }</small><strong>${ esc( money( over ? r.shortfall : Math.floor( left ) ) ) }</strong><span>${ esc( t( 'dailyUntil', { date: EX.dayName( r.end ) } ) ) }</span></div>${ editBtn }<button type="button" class="link" data-safe="details" aria-label="${ esc( t( 'safeOpen' ) ) }">${ UI.icon( 'chevron-right', 20 ) }</button></div>`;
	};
	const incomeCard = () => {
		const c = tg().income, amt = Math.round( ( parseFloat( String( c.amount ).replace( ',', '.' ) ) || 0 ) * 100 ); if ( c.period === 'off' || amt <= 0 ) return '';
		const r = range( c.period ), got = sumIn( 'income', r ), share = Math.max( 0, Math.min( 1, got / amt ) ), done = got >= amt;
		return `<div class="income-target${ done ? ' done' : '' }"><div class="it-top"><span>${ UI.icon( 'trending-up', 20 ) } ${ esc( t( 'targetEarned_' + c.period ) ) }</span><b>${ esc( money( got ) ) }</b></div><div class="it-bar"><i style="width:${ ( share * 100 ).toFixed( 1 ) }%"></i></div><small>${ esc( done ? t( 'targetReached' ) : t( 'targetToGo', { amount: money( amt - got ), total: money( amt ) } ) ) }</small></div>`;
	};
	EXA.dailyHome = () => { if ( ! on( 'daily' ) ) return ''; const a = spendCard(), b = incomeCard(); return a || b ? a + b : ''; };
	EXA.targetSheet = () => {
		const c = tg(), chip = ( group, v, label, cur ) => `<button type="button" class="chip${ cur === v ? ' on' : '' }" role="radio" aria-checked="${ cur === v }" data-tg="${ group }:${ v }">${ esc( t( label ) ) }</button>`;
		UI.openSheet( `<div class="sheet-head"><button class="ab-btn" data-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button><h2>${ esc( t( 'targetTitle' ) ) }</h2></div><form class="sheet-pad" id="targetForm" novalidate>
			<p class="muted small">${ esc( t( 'targetHelp' ) ) }</p>
			<h3>${ esc( t( 'targetSpend' ) ) }</h3><div class="chips wrap" role="radiogroup" id="tgSpend">${ chip( 'spend', 'auto', 'targetAuto', c.spend.period ) }${ chip( 'spend', 'day', 'targetDay', c.spend.period ) }${ chip( 'spend', 'week', 'targetWeek', c.spend.period ) }${ chip( 'spend', 'month', 'targetMonth', c.spend.period ) }</div>
			<label class="f" id="tgSpendAmt"${ c.spend.period === 'auto' ? ' hidden' : '' }><span>${ esc( t( 'targetAmount', { cur: main() } ) ) }</span><input name="spend" inputmode="decimal" value="${ esc( c.spend.amount ) }" placeholder="0"></label>
			<h3>${ esc( t( 'targetIncome' ) ) }</h3><div class="chips wrap" role="radiogroup" id="tgIncome">${ chip( 'income', 'off', 'targetOff', c.income.period ) }${ chip( 'income', 'day', 'targetDay', c.income.period ) }${ chip( 'income', 'week', 'targetWeek', c.income.period ) }${ chip( 'income', 'month', 'targetMonth', c.income.period ) }</div>
			<label class="f" id="tgIncomeAmt"${ c.income.period === 'off' ? ' hidden' : '' }><span>${ esc( t( 'targetAmount', { cur: main() } ) ) }</span><input name="income" inputmode="decimal" value="${ esc( c.income.amount ) }" placeholder="0"></label>
			<p class="err" id="tgErr" role="alert" hidden></p><div class="btn-row"><button type="button" class="btn btn-ghost" data-close>${ esc( t( 'cancel' ) ) }</button><button type="submit" class="btn btn-primary">${ esc( t( 'saveTx' ) ) }</button></div></form>`, { tall: true } );
	};
	let pick = null;
	document.addEventListener( 'click', ( e ) => {
		if ( e.target.closest( '[data-target-edit]' ) ) { e.preventDefault(); e.stopImmediatePropagation(); pick = null; EXA.targetSheet(); return; }
		const b = e.target.closest( '[data-tg]' ); if ( ! b ) return; e.preventDefault();
		const [ g, v ] = b.dataset.tg.split( ':' ); ( pick = pick || {} )[ g ] = v;
		b.parentElement.querySelectorAll( '[data-tg]' ).forEach( ( x ) => { x.classList.toggle( 'on', x === b ); x.setAttribute( 'aria-checked', String( x === b ) ); } );
		const amt = document.getElementById( g === 'spend' ? 'tgSpendAmt' : 'tgIncomeAmt' ); if ( amt ) amt.hidden = v === 'auto' || v === 'off';
	} );
	document.addEventListener( 'submit', ( e ) => {
		if ( e.target.id !== 'targetForm' ) return; e.preventDefault(); e.stopImmediatePropagation();
		const f = e.target.elements, cur = tg(), sp = ( pick && pick.spend ) || cur.spend.period, ip = ( pick && pick.income ) || cur.income.period, err = document.getElementById( 'tgErr' );
		const ok = ( v ) => /^\d{1,9}([.,]\d{1,2})?$/.test( String( v ).trim() ) && parseFloat( String( v ).replace( ',', '.' ) ) > 0;
		if ( ( sp !== 'auto' && ! ok( f.spend.value ) ) || ( ip !== 'off' && ! ok( f.income.value ) ) ) { err.textContent = t( 'targetBad' ); err.hidden = false; return; }
		const lim = {}; for ( const [ k, n ] of [ [ 'day', 'limDay' ], [ 'week', 'limWeek' ], [ 'month', 'limMonth' ] ] ) { const v = f[ n ] ? f[ n ].value.trim().replace( ',', '.' ) : ''; if ( v && ! ok( v ) ) { err.textContent = t( 'targetBad' ); err.hidden = false; return; } lim[ k ] = v; }
		const s = S().settings; s.targets = { spend: { period: sp, amount: sp === 'auto' ? '' : f.spend.value.trim().replace( ',', '.' ) }, income: { period: ip, amount: ip === 'off' ? '' : f.income.value.trim().replace( ',', '.' ) }, limits: lim }; s.u = Date.now();
		EX.save(); pick = null; UI.closeSheet( true ); UI.done( t( 'tSaved' ) ); EXA.render();
	}, true );

	/* ------------------------------------------------------------------ 3. Filters */
	const fl = () => EXA.st.txFilter;
	EXA.filtersActive = () => on( 'filters' ) && [ 'min', 'max', 'from', 'to' ].filter( ( k ) => fl()[ k ] ).length;
	EXA.applyFilters = ( list ) => {
		if ( ! on( 'filters' ) ) return list; const f = fl(), min = parseFloat( String( f.min || '' ).replace( ',', '.' ) ), max = parseFloat( String( f.max || '' ).replace( ',', '.' ) );
		return list.filter( ( x ) => ( isNaN( min ) || Number( x.amount ) >= min ) && ( isNaN( max ) || Number( x.amount ) <= max ) && ( ! f.from || x.date >= f.from ) && ( ! f.to || x.date <= f.to ) );
	};
	EXA.rangeTxs = () => { const f = fl(); if ( ! on( 'filters' ) || ( ! f.from && ! f.to ) ) return null; return S().txs.slice().sort( ( a, b ) => ( a.date < b.date ? 1 : a.date > b.date ? -1 : 0 ) ); };
	EXA.filterPanel = () => {
		if ( ! on( 'filters' ) ) return ''; const f = fl(), n = EXA.filtersActive();
		return `<details class="filter-panel card"${ n ? ' open' : '' }><summary>${ UI.icon( 'adjustments-horizontal', 20 ) } ${ esc( t( 'filtersTitle' ) ) }${ n ? ` <em class="filter-count">${ n }</em>` : '' }</summary>
			<div class="filter-grid"><label class="f"><span>${ esc( t( 'filterMin' ) ) }</span><input id="fMin" inputmode="decimal" value="${ esc( f.min || '' ) }" placeholder="0"></label><label class="f"><span>${ esc( t( 'filterMax' ) ) }</span><input id="fMax" inputmode="decimal" value="${ esc( f.max || '' ) }" placeholder="∞"></label>
			<label class="f"><span>${ esc( t( 'filterFrom' ) ) }</span><input id="fFrom" type="date" value="${ esc( f.from || '' ) }"></label><label class="f"><span>${ esc( t( 'filterTo' ) ) }</span><input id="fTo" type="date" value="${ esc( f.to || '' ) }"></label></div>
			${ n ? `<button type="button" class="btn btn-ghost" data-filter-clear>${ esc( t( 'filterClear' ) ) }</button>` : '' }</details>`;
	};
	document.addEventListener( 'change', ( e ) => {
		const map = { fMin: 'min', fMax: 'max', fFrom: 'from', fTo: 'to' }, k = map[ e.target.id ]; if ( ! k ) return;
		fl()[ k ] = e.target.value; EXA.render();
	} );
	document.addEventListener( 'click', ( e ) => { if ( e.target.closest( '[data-filter-clear]' ) ) { e.preventDefault(); Object.assign( fl(), { min: '', max: '', from: '', to: '' } ); EXA.render(); } } );

	/* ------------------------------------------------------------------ 4. Recently deleted */
	const trash = () => ( S().device.trash = ( S().device.trash || [] ).filter( ( x ) => Date.now() - x.at < 30 * 864e5 ).slice( 0, 60 ) );
	const keep = ( kind, rec ) => { if ( ! rec || ! on( 'trash' ) ) return; const l = trash(); l.unshift( { kind, rec: JSON.parse( JSON.stringify( rec ) ), at: Date.now() } ); S().device.trash = l.slice( 0, 60 ); EX.persist(); };
	const wrapRemove = ( key, kind, list ) => { const f = EXA[ key ]; if ( typeof f !== 'function' ) return; EXA[ key ] = function ( id ) { const rec = S()[ list ].find( ( x ) => x.id === id ); const r = f.apply( this, arguments ); keep( kind, rec ); return r; }; };
	wrapRemove( 'removeTx', 'tx', 'txs' ); wrapRemove( 'removeBill', 'bill', 'bills' );
	EXA.trashView = () => {
		const live = new Set( [ ...S().txs, ...S().bills ].map( ( x ) => x.id ) ), l = trash().filter( ( x ) => ! live.has( x.rec.id ) );
		const row = ( x, i ) => { const r = x.rec, isTx = x.kind === 'tx', title = r.name || ( EX.catInfo( r.category ) || {} ).name || '', cur = isTx ? EX.txCurrency( r ) : ( r.currency || main() );
			return `<li class="trash-row">${ UI.catCi( EX.catInfo( r.category ) ) }<span class="mid"><b>${ esc( title ) }</b><small>${ esc( t( isTx ? 'trashTx' : 'trashBill' ) ) } · ${ esc( EX.money( Number( r.amount ) || 0, cur ) ) } · ${ esc( new Date( x.at ).toLocaleDateString( EX.loc(), { day: 'numeric', month: 'short' } ) ) }</small></span><button type="button" class="btn btn-ghost" data-trash-restore="${ i }">${ UI.icon( 'refresh', 18 ) } ${ esc( t( 'trashRestore' ) ) }</button></li>`; };
		return `<section class="card"><p class="muted small">${ esc( t( 'trashHelp' ) ) }</p>${ l.length ? `<ul class="list trash-list">${ l.map( row ).join( '' ) }</ul><div class="btn-row"><button type="button" class="btn btn-ghost" data-trash-empty>${ esc( t( 'trashEmpty' ) ) }</button></div>` : `<p class="muted pad">${ esc( t( 'trashNone' ) ) }</p>` }</section>`;
	};
	document.addEventListener( 'click', ( e ) => {
		const r = e.target.closest( '[data-trash-restore]' ), em = e.target.closest( '[data-trash-empty]' ); if ( ! r && ! em ) return; e.preventDefault(); e.stopImmediatePropagation();
		if ( em ) { S().device.trash = []; EX.persist(); EXA.render(); return; }
		const live = new Set( [ ...S().txs, ...S().bills ].map( ( x ) => x.id ) ), l = trash().filter( ( x ) => ! live.has( x.rec.id ) ), item = l[ Number( r.dataset.trashRestore ) ]; if ( ! item ) return;
		const rec = Object.assign( JSON.parse( JSON.stringify( item.rec ) ), { id: EX.uid() } ); delete rec.u;
		( item.kind === 'tx' ? S().txs : S().bills ).push( rec );
		S().device.trash = trash().filter( ( x ) => x !== trash().find( ( y ) => y.at === item.at && y.rec.id === item.rec.id ) );
		EX.save(); UI.done( t( 'trashRestored' ) ); EXA.render();
	}, true );

	/* ------------------------------------------------------------------ 5. Streaks */
	const dim = ( d ) => new Date( EX.parse( d ).getFullYear(), EX.parse( d ).getMonth() + 1, 0 ).getDate();
	const limitFor = ( d ) => { let all = 0, cat = 0; for ( const b of S().budgets ) { const a = Math.round( ( Number( b.amount ) || 0 ) * 100 ), days = b.period === 'weekly' ? 7 : b.period === 'yearly' ? 365 : dim( d ), per = a / days; if ( b.category === 'all' ) all += per; else cat += per; } return Math.floor( Math.max( all, cat ) ); };
	EXA.streak = () => {
		const txs = EX.reportTxs().filter( ( x ) => x.type === 'expense' && ! x.goalId ), by = new Map();
		txs.forEach( ( x ) => by.set( x.date, ( by.get( x.date ) || 0 ) + cents( x ) ) );
		const dates = S().txs.map( ( x ) => x.date ).sort(), first = dates[ 0 ], td = today();
		if ( ! first ) return { cur: 0, best: 0, week: [], noSpend: 0, mode: 'nospend' };
		const ok = ( d ) => ( by.get( d ) || 0 ) <= limitFor( d ), hasBudgets = S().budgets.length > 0;
		let cur = 0, d = td; while ( d >= first && cur < 400 && ok( d ) ) { cur++; d = EX.addDays( d, -1 ); }
		let best = 0, run = 0; for ( let k = 0, dd = EX.addDays( td, -399 ); k < 400; k++, dd = EX.addDays( dd, 1 ) ) { if ( dd >= first && ok( dd ) ) { run++; best = Math.max( best, run ); } else run = 0; }
		const week = Array.from( { length: 7 }, ( _, k ) => { const dd = EX.addDays( td, k - 6 ); return { d: dd, ok: dd >= first && ok( dd ), on: dd >= first }; } );
		const ms = td.slice( 0, 7 ); let noSpend = 0; for ( let k = 1; k <= Number( td.slice( 8 ) ); k++ ) { const dd = ms + '-' + String( k ).padStart( 2, '0' ); if ( dd >= first && ! ( by.get( dd ) || 0 ) ) noSpend++; }
		return { cur, best, week, noSpend, mode: hasBudgets ? 'budget' : 'nospend' };
	};
	EXA.streakHome = () => {
		if ( ! on( 'streaks' ) ) return ''; const s = EXA.streak(); if ( ! S().txs.length ) return '';
		return `<div class="streak-card${ s.cur ? ' hot' : '' }"><div class="flame" aria-hidden="true"><svg viewBox="0 0 24 32" width="38" height="50"><path class="fl-o" d="M12 1c1 5 8 8 8 17a8 8 0 0 1-16 0c0-4 2-6 3-9 1 2 2 3 3 3 1-3 1-6 2-11z" fill="#ff7a18"/><path class="fl-i" d="M12 14c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-5 .5 1 1 1.500 1.500 1.500.5-1.500.5-3 .5-4.500z" fill="#ffd23f"/></svg></div>
			<div class="streak-copy"><strong>${ esc( t( s.cur === 1 ? 'streakDay' : 'streakDays', { n: s.cur } ) ) }</strong><small>${ esc( t( s.mode === 'budget' ? 'streakUnder' : 'streakNoSpend' ) ) } · ${ esc( t( 'streakBest', { n: s.best } ) ) }</small><div class="streak-week">${ s.week.map( ( w ) => `<i class="${ ! w.on ? 'na' : w.ok ? 'ok' : 'miss' }" title="${ esc( EX.dayName( w.d ) ) }"></i>` ).join( '' ) }</div></div><span class="streak-ns"><b>${ s.noSpend }</b><small>${ esc( t( 'streakNoSpendDays' ) ) }</small></span></div>`;
	};

	/* ------------------------------------------------------------------ 6. Bill price changes */
	EXA.priceChange = ( b ) => {
		if ( ! on( 'priceAlert' ) ) return null;
		const pays = S().txs.filter( ( x ) => x.billId === b.id && x.type === 'expense' ).sort( ( a, c ) => ( a.date < c.date ? 1 : a.date > c.date ? -1 : ( a.id < c.id ? 1 : -1 ) ) );
		if ( pays.length < 2 ) return null; const to = Number( pays[ 0 ].amount ), from = Number( pays[ 1 ].amount );
		if ( ! ( from > 0 ) || to <= from * 1.02 ) return null;
		return { from, to, pct: Math.round( ( to / from - 1 ) * 100 ), cur: EX.txCurrency( pays[ 0 ] ) };
	};
	EXA.priceChip = ( b ) => { const c = EXA.priceChange( b ); return c ? `<span class="price-chip" title="${ esc( t( 'priceChipTitle', { from: EX.money( c.from, c.cur ), to: EX.money( c.to, c.cur ) } ) ) }">${ UI.icon( 'trending-up', 14 ) } +${ c.pct }%</span>` : ''; };
	const pay = EX.payBill;
	if ( typeof pay === 'function' ) EX.payBill = function ( bill ) {
		const tx = pay.apply( this, arguments );
		setTimeout( () => { const c = EXA.priceChange( bill ); if ( c && S().txs.some( ( x ) => x.id === tx.id ) ) UI.toast( t( 'priceAlert', { name: bill.name, pct: c.pct, from: EX.money( c.from, c.cur ), to: EX.money( c.to, c.cur ) } ) ); }, 1400 );
		return tx;
	};

	/* ------------------------------------------------------------------ Home sections */
	const home = EXA.home;
	EXA.home = () => {
		const tmp = document.createElement( 'template' ); tmp.innerHTML = home();
		const mk = ( id, html ) => { if ( ! html ) return null; const s = document.createElement( 'section' ); s.dataset.home = id; s.innerHTML = html; return s; };
		const bal = tmp.content.querySelector( '[data-home=balance]' ), d = mk( 'daily', EXA.dailyHome() ), st = mk( 'streak', EXA.streakHome() );
		if ( bal ) { if ( st ) bal.after( st ); if ( d ) bal.after( d ); } else { if ( d ) tmp.content.prepend( d ); if ( st ) tmp.content.append( st ); }
		return tmp.innerHTML;
	};
}() );
