/**
 * eFriend: a small animated companion that checks whether you can afford a plan (a trip, a big purchase) by its date. It is not a savings goal:
 * you do not put money into it. An optional link to a goal counts what is saved there.
 * It reads what Expenity already knows: wallet balances, upcoming and overdue bills, scheduled income and your spending habits,
 * sorts spending into Must (rent, phone, insurance...), Need (groceries, fuel...) and Want (dining out, streaming...), forecasts
 * what you will have by the date and says, kindly and with jokes, whether the goal will happen and what would help.
 * Everything is calculated on the device; there is no AI call. The maths is in EX.efriend, the screens in EXA.efriendHome / openEfriend.
 */
( function () {
	'use strict';
	const EX = window.EX, UI = window.UI, EXA = window.EXA;
	const { t, esc, money, parse, today, addDays } = EX;
	const S = EX.state, diff = EX.diffDays;
	const F = ( EX.efriend = {} );
	const main = () => S().settings.currency;
	const num = ( v ) => Number( String( v == null ? '' : v ).replace( ',', '.' ) ) || 0;
	/** Readable text: **bold** for numbers, one idea per line, an emoji in front of each point. */
	const rich = ( x ) => esc( x ).replace( /\*\*(.+?)\*\*/g, '<b>$1</b>' );
	const points = ( lines ) => `<ul class="ef-points">${ lines.filter( Boolean ).flatMap( ( l ) => String( l ).split( '\n' ) ).map( ( l ) => { const m = String( l ).match( /^((?:\p{Extended_Pictographic}\uFE0F?\u200D?)+)\s*(.*)$/u ); return m ? `<li><span class="ef-em" aria-hidden="true">${ m[ 1 ] }</span><span>${ rich( m[ 2 ] ) }</span></li>` : `<li class="plain"><span>${ rich( l ) }</span></li>`; } ).join( '' ) }</ul>`;
	const para = ( key, vars ) => points( String( t( key, vars ) ).split( '\n' ) );
	const fold = ( s ) => String( s || '' ).toLowerCase().normalize( 'NFD' ).replace( /[̀-ͯ]/g, '' );

	/* ------------------------------------------------------------------ Must / Need / Want */
	// Words decide first (a phone bill is a Must, a streaming plan is a Want, even though both sit in "subscriptions"), then the category.
	const MUST_WORDS = {
		housing: [ 'rent', 'mortgage', 'enoikio', 'stegasi', 'housing', 'koinochrista', 'building charges', 'common charges' ],
		utility: [ 'electric', 'power bill', 'ρευμα', 'revma', 'dei', 'water', 'nero', 'gas bill', 'heating', 'thermansi', 'utilities', 'utility' ],
		telecom: [ 'internet', 'wifi', 'wi-fi', 'broadband', 'fiber', 'phone', 'mobile', 'cellular', 'kinito', 'tilefono', 'telephone', 'sim ' ],
		insurance: [ 'insurance', 'asfal', 'premium' ],
		loan: [ 'loan', 'mortgage', 'daneio', 'credit card', 'kartas', 'instalment', 'installment', 'doseis' ],
		tax: [ 'tax', 'forol', 'foros', 'enfia', 'efka', 'social insurance' ],
		childcare: [ 'childcare', 'daycare', 'nursery', 'school fee', 'tuition', 'paidikos stathmos', 'frontistirio', 'private lesson' ],
	};
	const WANT_WORDS = [ 'netflix', 'spotify', 'disney', 'hbo', 'streaming', 'prime video', 'youtube premium', 'gym', 'fitness', 'magazine', 'game', 'gaming', 'cinema', 'restaurant', 'dining', 'takeaway', 'delivery', 'coffee', 'kafes', 'bar ', 'cocktail', 'clothes', 'shopping', 'hobby', 'subscription box' ];
	const NEED_WORDS = [ 'grocer', 'supermarket', 'super market', 'fuel', 'petrol', 'gasoline', 'bus ', 'metro', 'ticket', 'pharmacy', 'doctor', 'dentist', 'medicine' ];
	const CAT_DEFAULT = {
		housing: 'must', utilities: 'must', insurance: 'must', loans: 'must', taxes: 'must', childcare: 'must', education: 'must', property_tax: 'must', vehicle_tax: 'must', social: 'must', building: 'must',
		health: 'need', food: 'need', fuel: 'need', publicTransport: 'need', transport: 'need', pharmacy: 'need', dental: 'need', vision: 'need', cleaning: 'need', 'home repairs': 'need',
		leisure: 'want', shopping: 'want', dining: 'want', coffee: 'want', delivery: 'want', subscriptions: 'want', presents: 'want', hobbies: 'want', sports: 'want', personalCare: 'want', clothing: 'want', electronics: 'want', furniture: 'want', travel: 'want', accommodation: 'want', donations: 'want', apps: 'want', cloud: 'want', bank_fees: 'must',
	};
	const hit = ( text, words ) => words.some( ( w ) => text.includes( w ) );
	/** 'must' | 'need' | 'want' with the reason key, for a bill or an entry ({ name, category, id }). */
	F.importance = ( item ) => {
		const ov = S().settings.importance || {}, name = fold( item.name ), cat = item.category || '';
		const pick = ov[ 'item:' + ( item.id || '' ) ] || ov[ 'cat:' + cat ];
		if ( pick ) return { level: pick, why: 'custom' };
		for ( const [ why, words ] of Object.entries( MUST_WORDS ) ) if ( hit( name, words ) ) return { level: 'must', why };
		if ( hit( name, WANT_WORDS ) ) return { level: 'want', why: 'want' };
		if ( hit( name, NEED_WORDS ) ) return { level: 'need', why: 'need' };
		const d = CAT_DEFAULT[ cat ];
		if ( d ) return { level: d, why: d === 'must' ? ( cat === 'utilities' ? 'utility' : cat === 'housing' ? 'housing' : cat === 'insurance' ? 'insurance' : cat === 'taxes' ? 'tax' : cat === 'loans' ? 'loan' : 'must' ) : d };
		return { level: 'need', why: 'need' };
	};

	/* ------------------------------------------------------------------ The forecast */
	const centsOf = ( amount, cur ) => { const v = EX.convert( num( amount ), cur || main(), main() ); return v == null ? 0 : Math.round( v * 100 ); };
	const on = () => ! EX.feature || EX.feature( 'efriend' ) !== false;
	/** A plan is something to check, not money to collect: it has a cost, a date and the wallets it may use. It lives in the goals list so it syncs and backs up, but is shown here, not in Plan. */
	const isPlan = ( g ) => g.kind === 'efriend' || g.coach === true;
	EX.isEfPlan = isPlan;
	F.plans = () => S().goals.filter( ( g ) => isPlan( g ) && ! g.state );
	F.achieved = () => S().goals.filter( ( g ) => isPlan( g ) && g.state === 'done' ).sort( ( a, b ) => ( ( b.doneOn || '' ) > ( a.doneOn || '' ) ? 1 : -1 ) );
	F.past = () => S().goals.filter( ( g ) => isPlan( g ) && g.state === 'dropped' );
	/** Plans whose date has arrived and that have not been answered today. */
	F.due = () => { const td = today(), sn = S().settings.efSnooze || {}; return F.plans().filter( ( g ) => g.deadline && g.deadline <= td && sn[ g.id ] !== td ); };
	F.goals = () => ( on() ? F.plans().filter( ( g ) => g.deadline ) : [] );
	/** The most you are comfortable spending (day, week, month). They live with your spending targets. eFriend plans around the lower of these and your usual habits. */
	F.limits = () => {
		const tt = S().settings.targets || {}, L = tt.limits || {}, n = ( v ) => { const x = parseFloat( String( v || '' ).replace( ',', '.' ) ); return x > 0 ? Math.round( x * 100 ) : 0; };
		const out = { day: n( L.day ), week: n( L.week ), month: n( L.month ) }, sp = tt.spend;
		if ( sp && sp.period && sp.period !== 'auto' ) { const a = n( sp.amount ); if ( a && ! out[ sp.period ] ) out[ sp.period ] = a; }
		return out;
	};
	F.limitPerDay = () => { const L = F.limits(), c = []; if ( L.day ) c.push( L.day ); if ( L.week ) c.push( L.week / 7 ); if ( L.month ) c.push( L.month / 30 ); return c.length ? Math.min( ...c ) : 0; };
	/** Limits that do not line up (for example 40 a day is about 1,200 a month, but the monthly limit is 900). The stricter one wins. */
	F.limitNotes = () => { const L = F.limits(), m = ( c ) => money( c / 100, main() ), out = []; if ( L.day && L.month && L.day * 30 > L.month * 1.05 ) out.push( t( 'efLimNoteDayMonth', { a: m( L.day ), a30: m( L.day * 30 ), b: m( L.month ) } ) ); if ( L.day && L.week && L.day * 7 > L.week * 1.05 ) out.push( t( 'efLimNoteDayWeek', { a: m( L.day ), a7: m( L.day * 7 ), b: m( L.week ) } ) ); if ( L.week && L.month && L.week * 4.35 > L.month * 1.05 ) out.push( t( 'efLimNoteWeekMonth', { a: m( L.week ), a4: m( L.week * 4.35 ), b: m( L.month ) } ) ); return out; };
	F.saveLimits = ( key, value ) => { const s = S().settings, tt = s.targets = s.targets || {}; tt.limits = Object.assign( { day: '', week: '', month: '' }, tt.limits ); tt.limits[ key ] = String( value || '' ).trim().replace( ',', '.' ); s.u = Date.now(); try { EX.persist(); } catch ( e ) { /* ignore */ } };
	F.forecast = ( goal, reserved = 0 ) => {
		const now = today(), end = goal.deadline, days = diff( end, now );
		const linked = goal.linkedGoal && S().goals.find( ( x ) => x.id === goal.linkedGoal && ! isPlan( x ) ), saved = linked && EX.plan ? EX.plan.saved( linked ) : ( EX.plan && ! goal.linkedGoal ? EX.plan.saved( goal ) : 0 ), target = EX.cents( goal.target ), remaining = Math.max( 0, target - saved );
		const wallets = ( goal.wallets && goal.wallets.length ? goal.wallets.map( ( id ) => EX.account( id ) ).filter( Boolean ) : EX.activeAccounts() );
		const out = { goal, days, saved, target, remaining, wallets, done: remaining === 0 };
		if ( out.done ) { out.verdict = 'done'; return out; }
		if ( days <= 0 ) { out.verdict = 'unlikely'; out.late = true; out.projectedFree = 0; out.gap = remaining; out.confidence = 'low'; return out; }
		const balance = EX.mainCents( wallets.map( ( a ) => ( { amount: EX.balance( a ) / 100, currency: a.currency } ) ) );
		// Habits: the last 90 days (at least 14), without goal money, transfers and bill payments (bills are counted from their own schedule).
		const txs = S().txs.filter( ( x ) => x.type !== 'transfer' && ! x.goalId && ! x.efPlan ), first = txs.reduce( ( m, x ) => ( x.date < m ? x.date : m ), now );
		const win = Math.max( 14, Math.min( 90, diff( now, first ) + 1 ) ), since = addDays( now, -win );
		const inWin = txs.filter( ( x ) => x.date >= since && x.date <= now );
		const perCat = {}; inWin.filter( ( x ) => x.type === 'expense' && ! x.billId ).forEach( ( x ) => { perCat[ x.category || 'other' ] = ( perCat[ x.category || 'other' ] || 0 ) + centsOf( x.amount, EX.txCurrency( x ) ); } );
		const level = { must: 0, need: 0, want: 0 }, cats = [];
		Object.entries( perCat ).forEach( ( [ cat, c ] ) => { const imp = F.importance( { category: cat, name: EX.catInfo( cat ).name } ), future = ( c / win ) * days; level[ imp.level ] += future; cats.push( { cat, level: imp.level, why: imp.why, perDay: c / win, future } ); } );
		cats.sort( ( a, b ) => b.future - a.future );
		// Bills until the date (overdue ones included: they must be paid first).
		const bills = []; let billsDue = 0, overdue = 0;
		S().bills.filter( ( b ) => ! b.done && b.next ).forEach( ( b ) => {
			const imp = F.importance( { id: b.id, name: b.name, category: b.category } );
			EX.occurrences( b, end ).forEach( ( d ) => { const c = centsOf( b.amount, b.currency ); billsDue += c; if ( d < now ) overdue += c; bills.push( { b, d, c, level: imp.level, why: imp.why, late: d < now } ); } );
		} );
		// Income: scheduled income exactly, other income at 70% of its usual pace.
		let incomeSched = 0; S().incomes.filter( ( i ) => ! i.done && i.next ).forEach( ( i ) => { EX.occurrences( i, end ).forEach( () => { incomeSched += centsOf( i.amount, i.currency ); } ); } );
		const otherInc = inWin.filter( ( x ) => x.type === 'income' && ! x.incomeId ).reduce( ( s, x ) => s + centsOf( x.amount, EX.txCurrency( x ) ), 0 );
		const incomeOther = Math.round( ( otherInc / win ) * 0.7 * days );
		// Your own limit: eFriend plans around the lower of your limit and your habits (bills are fixed, so the limit applies to what is left for habits).
		const lpd = F.limitPerDay(), habitPD = ( level.must + level.need + level.want ) / days, billsPD = billsDue / days; let limitApplied = false;
		if ( lpd > 0 && habitPD > 0 ) { const capPD = Math.max( 0, lpd - billsPD ); if ( habitPD > capPD ) { const k = capPD / habitPD; level.must *= k; level.need *= k; level.want *= k; cats.forEach( ( c ) => { c.future *= k; c.perDay *= k; } ); limitApplied = true; } }
		const buffer = Math.round( ( ( level.must + level.need ) / days ) * 7 );
		const spend = level.must + level.need + level.want;
		const projectedFree = balance + incomeSched + incomeOther - billsDue - spend - buffer - reserved;
		const ratio = remaining ? projectedFree / remaining : 9;
		// A month of your life: usual spending (habits plus bills) and the income you can count on, so "what is left" can be judged against next month.
		const m30 = addDays( now, 62 ), per = 62 / 30; let bills30 = 0, inc30 = 0;
		S().bills.filter( ( b ) => ! b.done && b.next ).forEach( ( b ) => { EX.occurrences( b, m30 ).forEach( () => { bills30 += centsOf( b.amount, b.currency ) / per; } ); } );
		S().incomes.filter( ( i ) => ! i.done && i.next ).forEach( ( i ) => { EX.occurrences( i, m30 ).forEach( () => { inc30 += centsOf( i.amount, i.currency ) / per; } ); } );
		const monthly = Math.round( ( spend / days ) * 30 + bills30 ), incomeMonthly = Math.round( inc30 + ( otherInc / win ) * 0.7 * 30 );
		const left = projectedFree - remaining, cushion = Math.round( F.cushion() * monthly ), hasIncome = S().incomes.length > 0 || otherInc > 0;
		// Safe: the chosen cushion is still there. Fits: it is not, but next month's income covers it. Otherwise at risk or no.
		// Stricter when you spend more than you earn: then it is about how long what is left lasts at your real monthly loss (the runway).
		const deficit = hasIncome ? Math.max( 0, monthly - incomeMonthly ) : 0, runway = deficit > 0 ? left / deficit : Infinity;
		if ( left < 0 ) out.verdict = ratio >= 0.6 ? 'atrisk' : 'unlikely';
		else if ( deficit > 0 ) out.verdict = runway >= 6 && left >= cushion ? 'comfortable' : runway >= 3 ? 'ontrack' : runway >= 1 ? 'tight' : 'atrisk';
		else out.verdict = left >= cushion ? 'comfortable' : ( ( incomeMonthly > 0 && left + incomeMonthly >= monthly ) || left >= cushion / 2 ? 'ontrack' : 'tight' );
		out.deficit = deficit; out.runway = Number.isFinite( runway ) ? runway : null;
		Object.assign( out, { reserved, balance, incomeSched, incomeOther, billsDue, overdue, spend, level, buffer, projectedFree, gap: Math.max( 0, remaining - projectedFree ), extra: Math.max( 0, projectedFree - remaining ), ratio, bills, cats, perWeek: Math.ceil( remaining / Math.max( 1, days / 7 ) ), win, left, cushion, monthly, incomeMonthly, hasIncome, limitPerDay: lpd, limitApplied, usualPerDay: habitPD + billsPD, leftMonths: monthly > 0 ? left / monthly : null, history: Math.max( 1, diff( now, first ) + 1 ) } );
		out.confidence = win >= 60 && inWin.length >= 25 ? 'good' : win >= 28 && inWin.length >= 10 ? 'medium' : 'low';
		// What would help: a quarter off the biggest Wants, and subscriptions that could pause.
		const sugg = cats.filter( ( c ) => c.level === 'want' ).map( ( c ) => ( { kind: 'cut', cat: c.cat, gain: Math.round( c.future * 0.25 ) } ) );
		bills.filter( ( x ) => x.level === 'want' && ! x.late ).reduce( ( m, x ) => { const k = x.b.id; ( m[ k ] = m[ k ] || { kind: 'pause', name: x.b.name, gain: 0 } ).gain += x.c; return m; }, ( out._pause = {} ) );
		Object.values( out._pause ).forEach( ( p ) => sugg.push( p ) ); delete out._pause;
		out.suggestions = sugg.filter( ( s ) => s.gain >= Math.max( 100, remaining * 0.01 ) ).sort( ( a, b ) => b.gain - a.gain ).slice( 0, 4 );
		out.gain = out.suggestions.reduce( ( s, x ) => s + x.gain, 0 );
		// Other ways: a smaller goal, or a later date.
		out.affordable = Math.max( 0, projectedFree + saved );
		const perDay = ( projectedFree + buffer ) / days;
		out.laterDays = out.gap > 0 && perDay > 0 ? Math.ceil( out.gap / perDay ) : null;
		{ const g = {}; bills.filter( ( x ) => x.level === 'must' ).sort( ( a, b ) => ( a.d < b.d ? -1 : 1 ) ).forEach( ( x ) => { const k = x.b.id, r = g[ k ] = g[ k ] || { b: x.b, why: x.why, level: x.level, c: 0, n: 0, late: false, d: x.d }; r.c += x.c; r.n++; r.late = r.late || x.late; } ); out.mustList = Object.values( g ).slice( 0, 6 ); }
		return out;
	};

	/** The earliest date the plan is safe (the cushion is still there after buying), looking up to a year ahead. null means not within a year. */
	F.earliest = ( g, reserved = 0 ) => {
		const base = today(), at = ( d ) => F.forecast( Object.assign( {}, g, { deadline: addDays( base, d ) } ), reserved );
		const ok = ( f ) => f.done || ( f.left != null && f.left >= f.cushion );
		if ( EX.cents( g.target ) <= 0 ) return null;
		for ( let d = 7; d <= 365; d += 7 ) { if ( ok( at( d ) ) ) { for ( let k = Math.max( 1, d - 6 ); k <= d; k++ ) if ( ok( at( k ) ) ) return addDays( base, k ); return addDays( base, d ); } }
		return null;
	};
	/** Every plan, by date. A plan only gets what is left after the earlier plans that use the same wallets, so together they never count the same money twice. */
	const walletSet = ( g ) => new Set( g.wallets && g.wallets.length ? g.wallets : EX.activeAccounts().map( ( a ) => a.id ) );
	const RANK = { unlikely: 0, atrisk: 1, tight: 2, ontrack: 3, comfortable: 4, done: 5 };
	/** How careful eFriend is: a plan counts as safe when this much of its cost (1.25 = 125%) is expected to be free. The person sets it with a slider. */
	F.cushion = () => { const m = Number( S().settings.efCushion ); return Number.isFinite( m ) ? Math.max( 0, Math.min( 6, m ) ) : 1; };
	const prioOf = ( g ) => ( Number.isFinite( g.prio ) ? g.prio : 1e9 );
	const byPriority = ( list ) => list.slice().sort( ( a, b ) => ( prioOf( a ) - prioOf( b ) ) || ( a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0 ) );
	F.ordered = () => byPriority( F.plans() );
	/** Plans by priority (the person's own order, then by date). A plan only gets what the higher-priority plans leave in the same wallets. `skip` asks "what if this plan were dropped?". */
	F.all = ( o = {} ) => {
		const plans = byPriority( F.goals().filter( ( g ) => g.id !== o.skip ) ), out = [];
		plans.forEach( ( g ) => { const ws = walletSet( g ); let reserved = 0; out.forEach( ( p ) => { if ( p.done || p.late ) return; if ( [ ...walletSet( p.goal ) ].some( ( w ) => ws.has( w ) ) ) reserved += p.remaining; } ); out.push( F.forecast( g, reserved ) ); } );
		return out;
	};
	F.of = ( id ) => F.all().find( ( f ) => f.goal.id === id );
	F.groups = () => { const names = []; F.all().forEach( ( f ) => { const n = ( f.goal.group || '' ).trim(); if ( n && ! names.includes( n ) ) names.push( n ); } ); return names; };
	/** One verdict for a set of plans: the worst one, the total cost and the money likely free before the first of them. */
	F.summary = ( list ) => {
		const latest = list.slice().sort( ( a, b ) => ( a.goal.deadline < b.goal.deadline ? 1 : -1 ) )[ 0 ], worst = list.slice().sort( ( a, b ) => RANK[ a.verdict ] - RANK[ b.verdict ] )[ 0 ];
		return { n: list.length, list, worst, verdict: worst.verdict, cost: list.reduce( ( s, f ) => s + f.remaining, 0 ), free: Math.max( 0, ( latest.projectedFree || 0 ) + ( latest.reserved || 0 ) ), lastDate: latest.goal.deadline, firstBad: list.find( ( f ) => RANK[ f.verdict ] <= 2 ) };
	};
	/** Priorities: the order is the person's. When the plans together cost more than the money likely free, eFriend asks which matters most (once per set of plans) and never drops a plan by itself. */
	F.sig = () => F.plans().map( ( g ) => g.id ).sort().join( ',' );
	F.conflict = () => { const all = F.all(); if ( all.length < 2 ) return false; const sm = F.summary( all ); return sm.cost > sm.free; };
	F.needAsk = () => F.conflict() && S().settings.efAsked !== F.sig();
	F.setOrder = ( ids ) => {
		const bef = F.measure(); let changed = false; S().settings.efAsked = F.sig();
		ids.forEach( ( id, i ) => { const g = S().goals.find( ( x ) => x.id === id ); if ( g && g.prio !== i + 1 ) { g.prio = i + 1; changed = true; } } );
		if ( changed ) { F.logChange( bef, [ [ 'prio', '', '' ] ] ); S().settings.u = Date.now(); EX.save(); }
	};
	/** eFriend's own suggestion: cheapest first, so the most plans can happen. */
	F.suggestOrder = () => F.plans().slice().sort( ( a, b ) => ( EX.cents( a.target ) - EX.cents( b.target ) ) || ( a.deadline < b.deadline ? -1 : 1 ) ).map( ( g ) => g.id );
	/** Which safety cushion would give the best outcome with this order: the biggest one that still keeps as many plans as possible workable. */
	F.suggestCushion = ( order ) => {
		const goals = F.plans(), keepP = goals.map( ( g ) => g.prio ), keepC = S().settings.efCushion, res = [];
		order.forEach( ( id, i ) => { const g = goals.find( ( x ) => x.id === id ); if ( g ) g.prio = i + 1; } );
		[ 0.5, 1, 1.5, 2, 3 ].forEach( ( m ) => { S().settings.efCushion = m; const all = F.all(); res.push( { m, fits: all.filter( ( f ) => F.status( f.verdict ) === 'safe' || F.status( f.verdict ) === 'fits' ).length, safe: all.filter( ( f ) => F.status( f.verdict ) === 'safe' ).length } ); } );
		goals.forEach( ( g, i ) => { g.prio = keepP[ i ]; } ); S().settings.efCushion = keepC;
		const top = Math.max( ...res.map( ( r ) => r.fits ) ), best = res.filter( ( r ) => r.fits === top ).pop();
		return { m: best.m, fits: best.fits, n: goals.length, was: F.cushion() };
	};
	F.applySuggest = ( withCushion ) => {
		const order = F.suggestOrder(), c = withCushion ? F.suggestCushion( order ) : null;
		F.setOrder( order ); if ( c ) { S().settings.efCushion = c.m; S().settings.u = Date.now(); EX.save(); }
	};
	/** Safe, fits, at risk, or does not fit: the four groups the person hears about. */
	F.status = ( v ) => ( v === 'comfortable' || v === 'done' ? 'safe' : v === 'ontrack' ? 'fits' : v === 'unlikely' ? 'no' : 'risk' );
	/** If a lower-priority plan were dropped, would the first plan that does not fit now fit? */
	F.whatIf = ( list ) => {
		const bad = list.find( ( f ) => RANK[ f.verdict ] <= 2 ); if ( ! bad ) return null;
		const idx = list.indexOf( bad ), lower = list.slice( idx + 1 ).reverse();
		for ( const y of lower ) { const again = F.all( { skip: y.goal.id } ).find( ( f ) => f.goal.id === bad.goal.id ); if ( again && RANK[ again.verdict ] >= 3 ) return { plan: bad, drop: y.goal }; }
		return { plan: bad, drop: null };
	};

	/* ------------------------------------------------------------------ The character */
	/* ---- the two eFriends: Chip (the robot) and Boogie (the vintage cassette with a Nixie tube) ---- */
	const CHARS = { chip: { name: 'Chip' }, boogie: { name: 'Boogie' } };
	F.char = () => ( S().settings.efChar !== 'chip' && window.EXBOOGIE ? 'boogie' : 'chip' ); // Boogie unless the person chose Chip
	F.charName = () => CHARS[ F.char() ].name;
	F.setChar = ( c ) => { if ( ! CHARS[ c ] ) return; S().settings.efChar = c; S().settings.u = Date.now(); EX.save(); };
	/* Boogie's light: how bright the Nixie tube glows and what colour the bulb is. It is kept in the settings and applied as CSS variables, so every Boogie on screen changes at once. */
	const hex3 = ( h ) => [ 1, 3, 5 ].map( ( k ) => parseInt( h.slice( k, k + 2 ), 16 ) ), toHex3 = ( a ) => '#' + a.map( ( v ) => Math.max( 0, Math.min( 255, Math.round( v ) ) ).toString( 16 ).padStart( 2, '0' ) ).join( '' );
	const mixc = ( a, b, k ) => { const x = hex3( a ), y = hex3( b ); return toHex3( x.map( ( v, n ) => v + ( y[ n ] - v ) * k ) ); };
	F.LIGHTS = [ [ 'amber', '#ff941f' ], [ 'blue', '#33b5ff' ], [ 'green', '#39ff14' ] ]; // the default, a blue and a fluorescent green
	F.LEVELS = [ [ 'low', 40 ], [ 'normal', 70 ], [ 'high', 100 ] ]; // High is the brightest it can be
	F.light = () => { const l = S().settings.efLight || {}, i = Number( l.i ), v = Number.isFinite( i ) ? i : 70, lv = F.LEVELS.reduce( ( best, x ) => ( Math.abs( x[ 1 ] - v ) < Math.abs( best[ 1 ] - v ) ? x : best ), F.LEVELS[ 1 ] ), c = ( l.c || '' ).toLowerCase(); return { i: lv[ 1 ], lvl: lv[ 0 ], c: F.LIGHTS.some( ( x ) => x[ 1 ] === c ) ? c : F.LIGHTS[ 0 ][ 1 ] }; };
	F.applyLight = () => { const { i, c } = F.light(), st = document.documentElement.style; st.setProperty( '--ef-glow', ( i / 100 ).toFixed( 2 ) ); st.setProperty( '--ef-tm', c ); st.setProperty( '--ef-te', mixc( c, '#000000', .25 ) ); st.setProperty( '--ef-tc', mixc( c, '#ffffff', .78 ) ); st.setProperty( '--ef-tl', mixc( c, '#ffffff', .18 ) ); };
	F.setLight = ( patch, final ) => { const cur = F.light(); S().settings.efLight = { i: cur.i, c: cur.c, ...patch }; S().settings.u = Date.now(); F.applyLight(); if ( final ) EX.save(); else EX.persist(); };
	EX.on( 'change', () => F.applyLight() ); F.applyLight();
	/** The vintage control plate: a bat-handle toggle for the brightness and three lamp buttons for the bulb colour. Used in the eFriend menu and on the picker. */
	F.lightControls = () => {
		const l = F.light(), pos = F.LEVELS.findIndex( ( x ) => x[ 0 ] === l.lvl );
		return `<div class="ef-panel" role="group" aria-label="${ esc( t( 'efLightTitle' ) ) }"><i class="ef-screw a"></i><i class="ef-screw b"></i><i class="ef-screw c"></i><i class="ef-screw d"></i>
			<div class="ef-psec"><div class="ef-eng">${ esc( t( 'efLightBright' ) ) }</div>
				<div class="ef-toggle" data-pos="${ pos }" role="radiogroup" aria-label="${ esc( t( 'efLightBright' ) ) }">
					<button type="button" class="ef-lever" data-ef-lightcycle tabindex="-1" aria-hidden="true"><svg viewBox="0 0 120 84" width="120" height="84"><defs><radialGradient id="efNut" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#fdfdfd"/><stop offset=".55" stop-color="#b9bec3"/><stop offset="1" stop-color="#6b7075"/></radialGradient><linearGradient id="efArm" x1="0" x2="1"><stop offset="0" stop-color="#7c8186"/><stop offset=".4" stop-color="#f4f6f8"/><stop offset="1" stop-color="#8b9096"/></linearGradient><radialGradient id="efBall" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#c7ccd1"/><stop offset="1" stop-color="#6f7479"/></radialGradient></defs>
						<path d="M16 60 A44 44 0 0 1 104 60" fill="none" stroke="#5a3d12" stroke-opacity=".45" stroke-width="1.6" stroke-dasharray="2 5"/>
						<g class="ef-lever-arm"><path d="M54 62 L58 14 Q60 8 62 14 L66 62 Z" fill="url(#efArm)" stroke="#555a60" stroke-width=".8"/><circle cx="60" cy="12" r="9" fill="url(#efBall)" stroke="#555a60" stroke-width=".8"/></g>
						<circle cx="60" cy="64" r="15" fill="url(#efNut)" stroke="#4d5257" stroke-width="1"/><circle cx="60" cy="64" r="7" fill="#3b3f43" stroke="#9aa0a6" stroke-width=".8"/></svg></button>
					<div class="ef-pos">${ F.LEVELS.map( ( [ k, v ], n ) => `<button type="button" class="ef-lvl${ pos === n ? ' on' : '' }" data-ef-lightlvl="${ v }" role="radio" aria-checked="${ pos === n }" tabindex="${ pos === n ? 0 : -1 }">${ esc( t( 'efLvl_' + k ) ) }</button>` ).join( '' ) }</div></div></div>
			<div class="ef-psec"><div class="ef-eng">${ esc( t( 'efLightColor' ) ) }</div><div class="ef-lamps" role="radiogroup" aria-label="${ esc( t( 'efLightColor' ) ) }">${ F.LIGHTS.map( ( [ k, c ] ) => `<button type="button" class="ef-lamp${ l.c === c ? ' on' : '' }" style="--c:${ c }" data-ef-lightc="${ c }" role="radio" aria-checked="${ l.c === c }" aria-label="${ esc( t( 'efLight_' + k ) ) }" title="${ esc( t( 'efLight_' + k ) ) }"><i></i></button>` ).join( '' ) }</div></div></div>`;
	};
	let lightTimer = 0; const saveLight = () => { clearTimeout( lightTimer ); lightTimer = setTimeout( () => { S().settings.u = Date.now(); EX.save(); }, 500 ); };
	/** Moves the lever and the labels in place (no redraw), so the flick animation plays. */
	const showLevel = ( panel, v ) => { const pos = F.LEVELS.findIndex( ( x ) => x[ 1 ] === v ), tg = panel.querySelector( '.ef-toggle' ); if ( ! tg ) return; tg.dataset.pos = pos; tg.querySelectorAll( '[data-ef-lightlvl]' ).forEach( ( b, n ) => { b.classList.toggle( 'on', n === pos ); b.setAttribute( 'aria-checked', n === pos ? 'true' : 'false' ); b.tabIndex = n === pos ? 0 : -1; } ); };
	const setLevel = ( el, v ) => { const panel = el.closest( '.ef-panel' ); if ( ! panel || F.light().i === v ) return; F.setLight( { i: v }, false ); showLevel( panel, v ); F.sound( 'click' ); saveLight(); };
	document.addEventListener( 'click', ( e ) => {
		const lv = e.target.closest && e.target.closest( '[data-ef-lightlvl]' ); if ( lv ) { setLevel( lv, Number( lv.dataset.efLightlvl ) ); return; }
		const cy = e.target.closest && e.target.closest( '[data-ef-lightcycle]' ); if ( cy ) { const i = F.LEVELS.findIndex( ( x ) => x[ 1 ] === F.light().i ); setLevel( cy, F.LEVELS[ ( i + 1 ) % 3 ][ 1 ] ); return; }
		const b = e.target.closest && e.target.closest( '[data-ef-lightc]' ); if ( ! b ) return;
		F.setLight( { c: b.dataset.efLightc }, false ); b.closest( '.ef-panel' ).querySelectorAll( '[data-ef-lightc]' ).forEach( ( x ) => { const on = x === b; x.classList.toggle( 'on', on ); x.setAttribute( 'aria-checked', on ? 'true' : 'false' ); } ); F.sound( 'click' ); saveLight();
	} );
	document.addEventListener( 'keydown', ( e ) => { const lv = e.target.closest && e.target.closest( '[data-ef-lightlvl]' ); if ( ! lv || ! [ 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown' ].includes( e.key ) ) return; e.preventDefault(); const i = F.LEVELS.findIndex( ( x ) => x[ 1 ] === F.light().i ), n = Math.max( 0, Math.min( 2, i + ( e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1 ) ) ); setLevel( lv, F.LEVELS[ n ][ 1 ] ); lv.closest( '.ef-panel' ).querySelector( '[data-ef-lightlvl].on' ).focus(); } );

	const BMOOD = { comfortable: 'cheer', done: 'cheer', ontrack: 'happy', tight: 'meh', atrisk: 'worried', unlikely: 'worried', nodata: 'meh', cheer: 'cheer', happy: 'happy', meh: 'meh', worried: 'worried' };
	let bserial = 0;
	F.boogieMascot = ( verdict, size = 72 ) => {
		const B = window.EXBOOGIE; if ( ! B ) return F.chipMascot( verdict, size );
		const mood = BMOOD[ verdict ] || 'happy', thinking = verdict === 'thinking' ? ' ef-thinking' : '', h = Number.isFinite( Number( size ) ) ? Math.min( 1024, Math.max( 16, Number( size ) ) ) : 72, prefix = 'efcassette-' + ( ++bserial ) + '-';
		let svg = B.svg.replace( /<style>[\s\S]*?<\/style>/, '' ).replace( 'ef-cassette ef-happy"', 'ef-cassette ef-' + mood + thinking + '"' ).replace( /width="288" height="260"/, 'width="' + ( h * 154 / 140 ) + '" height="' + h + '"' );
		for ( const m of [ ...svg.matchAll( /\bid="([^"]+)"/g ) ] ) { const id = m[ 1 ]; svg = svg.replaceAll( 'id="' + id + '"', 'id="' + prefix + id + '"' ).replaceAll( 'url(#' + id + ')', 'url(#' + prefix + id + ')' ); }
		// the bulb takes its colour from the light settings (CSS variables), so it can change without redrawing
		svg = svg.replace( /stop-color="#ffa526"/g, 'style="stop-color:var(--ef-tl)"' ).replace( /stop-color="#ff8220"/g, 'style="stop-color:var(--ef-tm)"' ).replace( /stop-color="#ff7b00"/g, 'style="stop-color:var(--ef-te)"' ).replace( /stroke="#ff7417"/g, 'style="stroke:var(--ef-te)"' ).replace( /stroke="#ff941f"/g, 'style="stroke:var(--ef-tm)"' ).replace( /stroke="#ffe6a6"/g, 'style="stroke:var(--ef-tc)"' );
		// a bright blaze behind the glass of the Nixie tube (it pulses in style.css)
		const bid = prefix + 'blaze';
		svg = svg.replace( '<g class="tube-light">', `<defs><radialGradient id="${ bid }"><stop offset="0" style="stop-color:var(--ef-tc)" stop-opacity=".95"/><stop offset=".25" style="stop-color:var(--ef-tm)" stop-opacity=".9"/><stop offset=".6" style="stop-color:var(--ef-te)" stop-opacity=".55"/><stop offset="1" style="stop-color:var(--ef-te)" stop-opacity="0"/></radialGradient></defs><ellipse class="tube-blaze" cx="45" cy="3" rx="34" ry="38" fill="url(#${ bid })"/><g class="tube-light">` );
		// the light falls on his body too: the upper left of the shell glows from the tube and pulses with it
		const cid = prefix + 'cast', kid = prefix + 'castclip';
		svg = svg.replace( '</g><g class="ef-fx">', `<defs><radialGradient id="${ cid }" cx="45" cy="22" r="64" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:var(--ef-tc)" stop-opacity=".95"/><stop offset=".3" style="stop-color:var(--ef-tm)" stop-opacity=".7"/><stop offset=".65" style="stop-color:var(--ef-te)" stop-opacity=".3"/><stop offset="1" style="stop-color:var(--ef-te)" stop-opacity="0"/></radialGradient><clipPath id="${ kid }"><rect x="20" y="20" width="104" height="80" rx="12"/></clipPath></defs><rect class="tube-cast" x="20" y="20" width="104" height="80" rx="12" fill="url(#${ cid })" clip-path="url(#${ kid })"/></g><g class="ef-fx">` );
		return svg;
	};
	F.boogieIcon = ( size = 28 ) => ( window.EXBOOGIE ? window.EXBOOGIE.icon.replace( 'width="40" height="36"', 'class="ef-ico" width="' + size + '" height="' + ( size * 0.9 ) + '"' ) : F.chipIcon( size ) );
	F.mascotOf = ( c, verdict, size ) => ( c === 'boogie' ? F.boogieMascot( verdict, size ) : F.chipMascot( verdict, size ) );
	F.mascot = ( verdict, size = 72 ) => F.mascotOf( F.char(), verdict, size );
	F.icon = ( size = 28 ) => ( F.char() === 'boogie' ? F.boogieIcon( size ) : F.chipIcon( size ) );
	const MOODS = { comfortable: 'cheer', done: 'cheer', ontrack: 'happy', tight: 'meh', atrisk: 'worried', unlikely: 'worried', nodata: 'meh' };
	let gid = 0;
	/** A glossy floating robot with a glass screen face: hovers, waves, blinks, and changes its expression with the news. */
	/** A small outline of eFriend, for places where the full robot would be too much. */
	F.chipIcon = ( size = 28 ) => `<svg class="ef-ico" width="${ size }" height="${ size * 0.83 }" viewBox="0 0 120 100" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="eFriend"><path d="M24 28q-3-18 12-20 8 4 10 14M96 28q3-18-12-20-8 4-10 14"/><rect x="20" y="18" width="80" height="66" rx="28"/><rect x="31" y="31" width="58" height="40" rx="15"/><rect x="41" y="42" width="10" height="12" rx="3" fill="currentColor" stroke="none"/><path d="M70 48h12M52 62q8 7 16 0"/></svg>`;
	F.chipMascot = ( verdict, size = 72 ) => {
		const mood = MOODS[ verdict ] || 'happy', id = 'efg' + ( ++gid ), G = '#9ff3e6';
		const eyeL = mood === 'cheer' ? `<path d="M38 50q6-9 12 0" class="ef-glow ef-stk"/>` : `<rect class="ef-eye" x="${ mood === 'meh' ? 38 : 39 }" y="${ mood === 'meh' ? 47 : 42 }" width="11" height="${ mood === 'meh' ? 5 : mood === 'worried' ? 9 : 12 }" rx="3" fill="${ G }"/>`;
		const eyeR = mood === 'cheer' ? `<path d="M70 50q6-9 12 0" class="ef-glow ef-stk"/>` : mood === 'happy' ? `<path d="M70 48h12" class="ef-glow ef-stk"/>` : `<rect class="ef-eye" x="70" y="${ mood === 'meh' ? 47 : 42 }" width="11" height="${ mood === 'meh' ? 5 : mood === 'worried' ? 9 : 12 }" rx="3" fill="${ G }"/>`;
		const brows = mood === 'worried' ? `<path d="M38 40l12-3M82 40l-12-3" class="ef-glow ef-stk ef-thin"/>` : '';
		const mouth = { cheer: `<path d="M50 60q10 12 20 0z" fill="${ G }" class="ef-glow"/>`, happy: `<path d="M52 61q8 7 16 0" class="ef-glow ef-stk"/>`, meh: `<path d="M53 63h14" class="ef-glow ef-stk"/>`, worried: `<path d="M51 64q4-5 9-2t9-1" class="ef-glow ef-stk"/>` }[ mood ];
		const extra = mood === 'cheer' ? '<g class="ef-spark"><path d="M104 14l2.4 6 6 2.4-6 2.4-2.4 6-2.4-6-6-2.4 6-2.4z" fill="#ffc94d"/><path d="M12 28l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" fill="#ffc94d"/></g>' : mood === 'worried' ? '<path class="ef-drop" d="M96 26q5 8 0 12t-5-6z" fill="#7cc4ff"/>' : '';
		return `<svg class="ef-mascot ef-${ mood }" width="${ size * 1.2 }" height="${ size }" viewBox="0 0 120 100" role="img" aria-label="eFriend"><defs>
			<linearGradient id="${ id }s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#eef1f6"/><stop offset="1" stop-color="#cfd6e2"/></linearGradient>
			<linearGradient id="${ id }a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#cfd6e2"/></linearGradient></defs>
			<ellipse class="ef-shadow" cx="60" cy="94" rx="27" ry="4.5" fill="rgba(0,0,0,.16)"/>
			<g class="ef-body">
			<path d="M24 26q-2-14 12-16 8 3 10 12zM96 26q2-14-12-16-8 3-10 12z" fill="url(#${ id }a)" stroke="#c3cbd9" stroke-width="1.2" stroke-linejoin="round"/>
			<path d="M30 22q0-7 8-8M90 22q0-7-8-8" fill="none" stroke="#0f766e" stroke-width="3" stroke-linecap="round"/>
			<rect x="14" y="18" width="92" height="70" rx="34" fill="url(#${ id }s)" stroke="#c3cbd9" stroke-width="1.2"/>
			<rect x="24" y="27" width="72" height="52" rx="24" fill="#13171f"/>
			<g transform="translate(15 64)"><g class="ef-armL"><rect x="-6.5" y="-4" width="13" height="32" rx="6.5" fill="url(#${ id }a)" stroke="#8f9bb2" stroke-width="1.6"/><rect x="-6.5" y="-4" width="13" height="7" rx="3.5" fill="#0f766e" opacity=".9"/></g></g><g transform="translate(105 64)"><g class="ef-armR"><rect x="-6.5" y="-4" width="13" height="32" rx="6.5" fill="url(#${ id }a)" stroke="#8f9bb2" stroke-width="1.6"/><rect x="-6.5" y="-4" width="13" height="7" rx="3.5" fill="#0f766e" opacity=".9"/></g></g>
			<path d="M32 36q6-6 20-6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".22"/>
			<g class="ef-face-base"><g class="ef-eyes">${ eyeL }${ eyeR }</g>${ brows }${ mouth }</g>
			<g class="ef-face-smile"><path d="M38 50q6-9 12 0M70 50q6-9 12 0" class="ef-glow ef-stk"/><path d="M50 58q10 14 20 0z" fill="${ G }" class="ef-glow"/><circle cx="33" cy="60" r="3.5" fill="#ff9db0" opacity=".7"/><circle cx="87" cy="60" r="3.5" fill="#ff9db0" opacity=".7"/></g>
			<g class="ef-face-giggle"><path d="M38 42l9 6-9 6M82 42l-9 6 9 6" class="ef-glow ef-stk"/><path d="M48 58q12 18 24 0z" fill="${ G }" class="ef-glow"/></g>
			<g class="ef-face-angry"><path d="M36 38l14 6M84 38l-14 6" class="ef-glow ef-stk ef-red"/><rect x="39" y="46" width="11" height="8" rx="2" fill="#ff8a80" class="ef-glow ef-redglow"/><rect x="70" y="46" width="11" height="8" rx="2" fill="#ff8a80" class="ef-glow ef-redglow"/><path d="M50 66q10-9 20 0" class="ef-glow ef-stk ef-red"/></g>
			<path d="m52 84 4 4 8-9" fill="none" stroke="#ffc94d" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>${ extra }</g><g class="ef-fx"><path class="ef-heart h1" d="M60 24c-5-8-16 0-8 8l8 7 8-7c8-8-3-16-8-8z" fill="#ff6b8a"/><path class="ef-steam s1" d="M30 20q-6-6 0-12M90 20q6-6 0-12" fill="none" stroke="#9aa4b5" stroke-width="3" stroke-linecap="round"/></g></svg>`;
	};

	/* ------------------------------------------------------------------ Sounds: a smile chirps, a giggle trills, anger growls (synthesised here, nothing is downloaded) */
	let actx = null;
	const soundOn = () => ( S().settings.efSound !== false ) && ( ( S().settings.sounds || {} ).volume == null || S().settings.sounds.volume > 0 );
	F.sound = ( kind ) => {
		if ( ! soundOn() || document.hidden ) return;
		try {
			const C = window.AudioContext || window.webkitAudioContext; if ( ! C ) return; actx = actx || new C(); if ( actx.state === 'suspended' ) actx.resume().catch( () => {} );
			const c = actx, vol = Math.max( 0.15, Math.min( 1, ( S().settings.sounds || {} ).volume ?? 0.6 ) ) * 0.5, t0 = c.currentTime;
			const tone = ( type, f1, f2, start, dur, g ) => { const o = c.createOscillator(), a = c.createGain(); o.type = type; o.frequency.setValueAtTime( f1, t0 + start ); if ( f2 ) o.frequency.exponentialRampToValueAtTime( f2, t0 + start + dur ); a.gain.setValueAtTime( 0.0001, t0 + start ); a.gain.exponentialRampToValueAtTime( vol * g, t0 + start + 0.015 ); a.gain.exponentialRampToValueAtTime( 0.0001, t0 + start + dur ); o.connect( a ).connect( c.destination ); o.start( t0 + start ); o.stop( t0 + start + dur + 0.02 ); };
			if ( kind === 'smile' ) { tone( 'sine', 660, 880, 0, 0.12, 1 ); tone( 'sine', 880, 1175, 0.11, 0.16, 1 ); }
			else if ( kind === 'click' ) { tone( 'square', 2100, 600, 0, 0.03, 0.7 ); tone( 'triangle', 320, 120, 0.012, 0.06, 0.6 ); }
			else if ( kind === 'giggle' ) { [ 0, 1, 2, 3, 4 ].forEach( ( i ) => tone( 'triangle', i % 2 ? 1000 : 780, i % 2 ? 900 : 1100, i * 0.075, 0.07, 0.9 ) ); }
			else {
				const o = c.createOscillator(), o2 = c.createOscillator(), a = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(), f = c.createBiquadFilter();
				o.type = 'sawtooth'; o2.type = 'square'; o.frequency.setValueAtTime( 120, t0 ); o.frequency.exponentialRampToValueAtTime( 70, t0 + 0.7 ); o2.frequency.setValueAtTime( 123, t0 ); o2.frequency.exponentialRampToValueAtTime( 66, t0 + 0.7 );
				f.type = 'lowpass'; f.frequency.value = 520; lfo.frequency.value = 28; lg.gain.value = vol * 0.5; a.gain.setValueAtTime( 0.0001, t0 ); a.gain.exponentialRampToValueAtTime( vol * 0.9, t0 + 0.04 ); a.gain.exponentialRampToValueAtTime( 0.0001, t0 + 0.75 );
				lfo.connect( lg ).connect( a.gain ); o.connect( f ); o2.connect( f ); f.connect( a ).connect( c.destination ); [ o, o2, lfo ].forEach( ( x ) => { x.start( t0 ); x.stop( t0 + 0.8 ); } );
			}
		} catch ( e ) { /* no sound is fine */ }
	};

	/* Poke it: a click smiles and waves, a few giggle, many make it angry and shake. */
	const pokes = new WeakMap();
	document.addEventListener( 'click', ( e ) => {
		const m = e.target.closest && e.target.closest( '.ef-mascot' ); if ( ! m ) return;
		e.preventDefault(); e.stopPropagation();
		const now = performance.now(), st = pokes.get( m ) || { t: [], timer: 0 }; pokes.set( m, st );
		st.t = st.t.filter( ( x ) => now - x < 2500 ); st.t.push( now );
		const n = st.t.length, cls = n >= 5 ? 'angry' : n >= 3 ? 'giggle' : 'smile';
		F.sound( cls ); m.classList.remove( 'ef-poke-smile', 'ef-poke-giggle', 'ef-poke-angry' ); void m.getBoundingClientRect(); m.classList.add( 'ef-poke-' + cls );
		clearTimeout( st.timer ); st.timer = setTimeout( () => m.classList.remove( 'ef-poke-smile', 'ef-poke-giggle', 'ef-poke-angry' ), cls === 'angry' ? 2400 : 1300 );
	}, true );

	/* ------------------------------------------------------------------ Words (funny on purpose) */
	const lastLine = {};
	/** The person's first name, if they gave one: eFriend uses it to talk to them. */
	F.name = () => String( S().settings.name || '' ).trim().split( /\s+/ )[ 0 ];
	const named = ( key, vars ) => { const n = F.name(); if ( ! n ) return []; const v = t( key + '_n', Object.assign( { name: n }, vars ) ); return typeof v === 'string' && v !== key + '_n' ? String( v ).split( '|' ) : []; };
	const pickLine = ( verdict ) => { const lines = t( 'ef_' + verdict ).split( '|' ).concat( named( 'ef_' + verdict ) ); let i = Math.floor( Math.random() * lines.length ); if ( lines.length > 1 && lines[ i ] === lastLine[ verdict ] ) i = ( i + 1 ) % lines.length; lastLine[ verdict ] = lines[ i ]; return lines[ i ]; };
	F.line = pickLine;
	F.sentences = ( f ) => {
		if ( f.verdict === 'done' ) return [ t( 'efDone' ) ];
		if ( f.late ) return [ t( 'efLate' ) ];
		const m = ( c ) => money( c / 100, main() ), out = [ t( 'efCost', { a: m( f.target ), b: m( Math.max( 0, ( f.projectedFree || 0 ) + f.saved ) ) } ) ];
		out.push( f.gap > 0 ? t( 'efShort', { a: m( f.gap ) } ) : t( 'efSpare', { a: m( f.extra ) } ) );
		if ( f.reserved > 0 ) out.push( t( 'efAfter', { a: m( f.reserved ) } ) );
		if ( f.overdue > 0 ) out.push( t( 'efOverdue', { a: m( f.overdue ) } ) );
		const s = f.suggestions && f.suggestions[ 0 ]; if ( f.gap > 0 && s ) out.push( s.kind === 'cut' ? t( 'efTipCut', { name: EX.catInfo( s.cat ).name, a: m( s.gain ) } ) : t( 'efTipPause', { name: s.name, a: m( s.gain ) } ) );
		return out;
	};

	F.allSentences = ( sm ) => {
		const m = ( c ) => money( c / 100, main() ), out = [ t( 'efAllLine', { a: m( sm.cost ), b: m( sm.free ), d: EX.dayName( sm.lastDate ) } ) ];
		out.push( sm.firstBad ? t( 'efFirstBad', { name: sm.firstBad.goal.name } ) : t( 'efAllFits' ) );
		if ( sm.firstBad && sm.firstBad.suggestions && sm.firstBad.suggestions[ 0 ] ) { const x = sm.firstBad.suggestions[ 0 ]; out.push( x.kind === 'cut' ? t( 'efTipCut', { name: EX.catInfo( x.cat ).name, a: m( x.gain ) } ) : t( 'efTipPause', { name: x.name, a: m( x.gain ) } ) ); }
		return out;
	};

	/* ------------------------------------------------------------------ Home widget */
	const LABEL = { comfortable: 'Comfortable', ontrack: 'On track', tight: 'Tight', atrisk: 'At risk', unlikely: 'Unlikely', done: 'Done' };
	const chip = ( v ) => `<span class="ef-chip v-${ v }">${ LABEL[ v ] }</span>`;

	const pickGoal = () => { const l = F.all(); if ( ! l.length ) return null; return l.slice().sort( ( a, b ) => ( RANK[ a.verdict ] - RANK[ b.verdict ] ) || ( a.days - b.days ) )[ 0 ]; };
	const askBanner = () => ( F.needAsk() ? `<div class="ef-ask"><span class="ef-ask-em">💬</span><span>${ rich( t( 'efAskBanner' ) ) }</span><button type="button" class="btn btn-primary sm" data-ef-prio>${ esc( t( 'efAskBtn' ) ) }</button></div>` : '' );
	let bootChecked = false;
	EXA.efriendHome = () => {
		if ( ! on() ) return '';
		if ( ! bootChecked ) { bootChecked = true; try { histList(); F.trimSettings(); EX.persist(); } catch ( x ) { /* ignore */ } const lv = ( S().device || {} ).efLiveChat; if ( lv && ! document.querySelector( '.ef-cp' ) ) { const r = histList().find( ( x ) => x.id === lv.id ); delete S().device.efLiveChat; try { EX.persist(); } catch ( x ) { /* ignore */ } if ( r ) setTimeout( () => EXA.efriendAskOpen( { sleep: r } ), 900 ); } }
		try { F.tickAlloc(); } catch ( e ) { /* ignore */ }
		const html = home0(), pr = proposalsHtml() + lowBanner();
		if ( ! pr ) return html;
		return html ? html.replace( '<section data-home="efriend">', '<section data-home="efriend">' + pr ) : `<section data-home="efriend">${ pr }</section>`;
	};
	const home0 = () => {
		if ( ! ( S().device || {} ).efOnboard && ! navigator.webdriver && ! document.querySelector( '.ef-ob' ) ) { try { S().device.efOnboard = 1; EX.persist(); } catch ( e ) { /* ignore */ } setTimeout( () => EXA.efriendOnboard(), 600 ); }
		if ( F.due().length && ! navigator.webdriver && ! dueOpen && ! document.querySelector( '.ef-ob' ) && ! ( EXA.flow && EXA.flow.active && EXA.flow.active() ) ) setTimeout( () => EXA.efriendDue(), 900 );
		const f = pickGoal(); if ( f ) F.snapshot();
		if ( ! f ) {
			const g = F.plans()[ 0 ];
			return `<section data-home="efriend"><div class="ef-card ef-promo"><div class="ef-top">${ F.mascot( 'happy' ) }<div class="ef-bubble"><b>${ esc( t( 'efMeet' ) ) }</b>${ esc( g ? t( 'efPromoDate', { name: g.name } ) : t( 'efPromoWish' ) ) }</div></div>${ g ? '' : wishChips() }<div class="btn-row"><button type="button" class="btn btn-primary sm" data-ef-try="${ g ? esc( g.id ) : '' }">${ esc( g ? t( 'efAddDate' ) : t( 'efTry' ) ) }</button><button type="button" class="btn btn-ghost sm" data-ef-ask>💬 ${ esc( t( 'efAskShort' ) ) }</button></div></div></section>`;
		}
		if ( ! EXA.flipCard ) return '';
		const all = F.all();
		if ( all.length > 1 ) {
			const sm = F.summary( all ), v = sm.verdict, m = ( c ) => money( c / 100, main() );
			const front = `<div class="ef-card ef-${ v }"><div class="ef-top">${ F.mascot( v ) }<div class="ef-bubble ef-tkb" data-ef-bubble="${ v }"><div class="ef-ticker"><span class="ef-tk">${ esc( pickLine( v ) ) }</span></div></div></div>
				<div class="ef-meta">${ chip( v ) }<span>${ esc( t( 'efPlansN', { n: sm.n } ) ) }</span></div>
				<ul class="ef-mini-list">${ all.slice( 0, 4 ).map( ( x ) => `<li role="button" tabindex="0" data-ef-open="${ esc( x.goal.id ) }"><span class="ef-mi">${ all.indexOf( x ) === 0 ? '🏆' : UI.icon( x.goal.icon || 'plane', 18 ) }</span><b>${ esc( x.goal.name ) }</b>${ chip( x.verdict ) }</li>` ).join( '' ) }</ul>
				${ all.length > 4 ? `<small>${ esc( t( 'efMorePlans', { n: all.length - 4 } ) ) }</small>` : '' }<small>${ esc( t( 'efTogether', { a: m( sm.cost ), b: m( sm.free ) } ) ) }</small></div>`;
			const back = `<div class="wk-back ef-back"><span class="wk-ic bob">${ UI.icon( 'sparkles', 30 ) }</span><h3>${ esc( t( 'efAllPlans' ) ) }</h3>${ points( F.allSentences( sm ) ) }<button type="button" class="btn btn-primary" data-ef-all="">${ esc( t( 'efOpen' ) ) }</button></div>`;
			return `<section data-home="efriend"><div class="sec-head"><h2>${ esc( t( 'efAllPlans' ) ) }</h2><span class="sec-acts"><button type="button" class="link" data-ef-ask>💬 ${ esc( t( 'efAskShort' ) ) }</button>${ EXA.flipBtn( 'efriend' ) }</span></div>${ askBanner() }${ EXA.flipCard( 'efriend', front, back, 'fc-ef' ) }</section>`;
		}
		const g = f.goal, have = Math.max( 0, ( f.projectedFree || 0 ) + f.saved ), pct = f.done ? 100 : f.target ? Math.min( 100, Math.round( have / f.target * 100 ) ) : 0, label = { comfortable: 'Comfortable', ontrack: 'On track', tight: 'Tight', atrisk: 'At risk', unlikely: 'Unlikely', done: 'Done' }[ f.verdict ];
		const front = `<div class="ef-card ef-${ f.verdict }"><div class="ef-top">${ F.mascot( f.verdict ) }<div class="ef-bubble ef-tkb" data-ef-bubble="${ f.verdict }"><div class="ef-ticker"><span class="ef-tk">${ esc( pickLine( f.verdict ) ) }</span></div></div></div>
			<div class="ef-meta">${ chip( f.verdict ) }<span>${ esc( t( 'efDaysLeft', { n: Math.max( 0, f.days ) } ) ) }</span></div>
			<div class="ef-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${ pct }"><i style="width:${ pct }%"></i><span class="ef-suit" style="left:${ pct }%">${ UI.icon( g.icon || 'plane', 18 ) }</span></div>
			<small>${ esc( f.left < 0 ? t( 'efShortLine', { a: money( -f.left / 100, main() ) } ) : t( 'efLeftLine', { a: money( f.left / 100, main() ), m: monthsText( f.leftMonths == null ? 0 : f.leftMonths ) } ) ) }</small></div>`;
		const back = `<div class="wk-back ef-back"><span class="wk-ic bob">${ UI.icon( 'sparkles', 30 ) }</span><h3>${ esc( g.name ) }</h3>${ points( F.sentences( f ).concat( F.tips( f ).slice( 0, 1 ).map( ( x ) => x.text ) ) ) }<button type="button" class="btn btn-primary" data-ef-open="${ esc( g.id ) }">${ esc( t( 'efOpen' ) ) }</button><button type="button" class="btn btn-ghost sm" data-ef-edit="${ esc( g.id ) }">${ UI.icon( 'pencil', 18 ) } ${ esc( t( 'efEdit' ) ) }</button></div>`;
		return `<section data-home="efriend"><div class="sec-head"><h2>${ esc( g.name ) }</h2><span class="sec-acts"><button type="button" class="link" data-ef-ask>💬 ${ esc( t( 'efAskShort' ) ) }</button>${ EXA.flipBtn( 'efriend' ) }</span></div>${ EXA.flipCard( 'efriend', front, back, 'fc-ef' ) }</section>`;
	};

	/** Smart tips. A budget is eFriend's best friend: off target, it proposes budgets for the categories that cost the most and links straight to the form. */
	const monthlyOf = ( b ) => num( b.amount ) * ( b.period === 'weekly' ? 52 / 12 : b.period === 'yearly' ? 1 / 12 : 1 );
	F.tips = ( f ) => {
		if ( ! f || f.done || f.late || ! f.cats ) return [];
		const m = ( c ) => money( c / 100, main() ), months = Math.max( 0.3, f.days / 30 ), off = RANK[ f.verdict ] <= 2, out = [], budgets = S().budgets || [];
		const cand = f.cats.filter( ( c ) => c.level === 'want' ).concat( f.cats.filter( ( c ) => c.level === 'need' ) ).slice( 0, off ? 2 : 1 );
		cand.forEach( ( c ) => {
			const habit = c.perDay * 30 / 100, suggested = Math.max( 5, Math.round( habit * 0.75 / 5 ) * 5 ), name = EX.catInfo( c.cat ).name, ex = budgets.find( ( b ) => b.category === c.cat ), gain = Math.round( Math.max( 0, habit - suggested ) * months * 100 );
			if ( ! ex ) out.push( { k: 'budget', text: off ? t( 'efTipBudgetNew', { name, a: money( suggested, main() ), g: m( gain ) } ) : t( 'efTipBudgetFriend', { name, a: money( suggested, main() ) } ), act: { type: 'new', cat: c.cat, amount: suggested }, gain } );
			else if ( monthlyOf( ex ) > suggested * 1.15 ) out.push( { k: 'budget', text: t( 'efTipBudgetLower', { name, a: money( suggested, main() ), g: m( gain ) } ), act: { type: 'edit', id: ex.id }, gain } );
			else if ( off ) out.push( { k: 'budget', text: t( 'efTipBudgetKeep', { name } ), act: { type: 'edit', id: ex.id }, gain: 0 } );
		} );
		if ( off ) {
			const perDay = ( f.level.want || 0 ) / Math.max( 1, f.days ), weeks = f.days / 7;
			if ( perDay > 0 ) out.push( { k: 'tip', text: t( 'efTipNoSpend', { a: m( Math.round( perDay * 2 * weeks ) ) } ), gain: Math.round( perDay * 2 * weeks ) } );
			out.push( { k: 'tip', text: t( 'efTipWait' ), gain: 0 } );
		}
		return out;
	};
	const tipsHtml = ( tips ) => tips.length ? `<ul class="ef-points ef-tips">${ tips.map( ( x ) => { const mm = String( x.text ).match( /^((?:\p{Extended_Pictographic}\uFE0F?\u200D?)+)\s*(.*)$/u ), body = mm ? mm[ 2 ] : x.text, em = mm ? mm[ 1 ] : '💡'; return `<li><span class="ef-em" aria-hidden="true">${ em }</span><span>${ rich( body ) }${ x.act ? `<br><button type="button" class="btn btn-ghost sm" ${ x.act.type === 'new' ? `data-ef-budget="${ esc( x.act.cat ) }" data-amt="${ x.act.amount }"` : `data-ef-budget-edit="${ esc( x.act.id ) }"` }>${ UI.icon( 'target', 16 ) } ${ esc( t( x.act.type === 'new' ? 'efSetBudget' : 'efOpenBudget' ) ) }</button>` : '' }</span></li>`; } ).join( '' ) }</ul>` : '';
	document.addEventListener( 'click', ( e ) => {
		const nb = e.target.closest( '[data-ef-budget]' ), eb = e.target.closest( '[data-ef-budget-edit]' );
		if ( nb ) { e.preventDefault(); UI.closeSheet(); setTimeout( () => EXA.openBudget( null, { category: nb.dataset.efBudget, amount: nb.dataset.amt, period: 'monthly' } ), 220 ); }
		else if ( eb ) { e.preventDefault(); const b = ( S().budgets || [] ).find( ( x ) => x.id === eb.dataset.efBudgetEdit ); UI.closeSheet(); if ( b ) setTimeout( () => EXA.openBudget( b ), 220 ); }
	}, true );

	/* ------------------------------------------------------------------ Full analysis */
	EXA.openEfriend = ( id ) => {
		const g = S().goals.find( ( x ) => x.id === id ); if ( ! g ) return;
		F.view = { k: 'one', id };
		const f = F.of( id ) || F.forecast( g ), m = ( c ) => money( c / 100, main() ), label = { comfortable: 'Comfortable', ontrack: 'On track', tight: 'Tight', atrisk: 'At risk', unlikely: 'Unlikely', done: 'Done' }[ f.verdict ];
		const why = ( k ) => t( 'efWhy_' + k ) || t( 'efWhy_must' );
		const mustRows = ( f.mustList || [] ).map( ( x ) => `<li><div><b>${ esc( x.b.name ) }${ x.n > 1 ? ' ×' + x.n : '' }</b><small>${ esc( why( x.why ) ) }</small></div><span>${ x.late ? '<i class="ef-late">Overdue</i> ' : '' }${ esc( m( x.c ) ) }</span></li>` ).join( '' );
		const suggRows = ( f.suggestions || [] ).map( ( s ) => `<li><div><b>${ esc( s.kind === 'cut' ? t( 'efCutLabel', { name: EX.catInfo( s.cat ).name } ) : t( 'efPauseLabel', { name: s.name } ) ) }</b></div><span class="ef-gain">+${ esc( m( s.gain ) ) }</span></li>` ).join( '' );
		const catRows = ( f.cats || [] ).slice( 0, 8 ).map( ( c ) => `<li><div><b>${ esc( EX.catInfo( c.cat ).name ) }</b></div><div class="ef-tri" role="group" aria-label="${ esc( EX.catInfo( c.cat ).name ) }">${ [ 'must', 'need', 'want' ].map( ( l ) => `<button type="button" data-ef-level="${ esc( c.cat ) }" data-ef-to="${ l }" aria-pressed="${ c.level === l }" class="${ c.level === l ? 'on ' : '' }ef-l-${ l }">${ esc( t( 'ef_lvl_' + l ) ) }</button>` ).join( '' ) }</div></li>` ).join( '' );
		const alt = [];
		if ( f.gap > 0 ) { if ( f.affordable >= f.target * 0.1 ) alt.push( t( 'efAltSmaller', { a: m( Math.round( f.affordable ) ), p: Math.min( 99, Math.round( ( 1 - f.affordable / f.target ) * 100 ) ) } ) ); if ( f.laterDays ) alt.push( t( 'efAltLater', { d: EX.dayName( addDays( g.deadline, f.laterDays ) ) } ) ); }
		const sec = ( em, title, body, det ) => ( body ? ( det ? `<details class="ef-sec ef-det"><summary><span class="ef-sec-em">${ em }</span><b>${ esc( title ) }</b></summary>${ body }</details>` : `<section class="ef-psec"><h3 class="ef-h"><span class="ef-sec-em">${ em }</span>${ esc( title ) }</h3>${ body }</section>` ) : '' );
		const tile = ( em, label, value, cls = '', sub = '' ) => `<div class="ef-tile ${ cls }"><span class="ef-tile-em" aria-hidden="true">${ em }</span><small>${ esc( label ) }</small><b>${ value }</b>${ sub ? `<small class="ef-tile-sub">${ esc( sub ) }</small>` : '' }</div>`;
		const free = ( f.projectedFree || 0 ) + f.saved;
		const tiles = f.verdict === 'done' ? '' : `<div class="ef-tiles">${ tile( '💶', t( 'efTileCost' ), esc( m( f.target ) ) ) }${ tile( '🏦', t( 'efTileFree' ), esc( m( free ) ), free < 0 ? 'bad' : '' ) }${ f.left < 0 ? tile( '⚠️', t( 'efTileShort' ), esc( m( -f.left ) ), 'bad' ) : tile( '🛟', t( 'efTileLeft' ), esc( m( f.left ) ), f.left >= f.cushion ? 'good' : '', f.leftMonths == null ? '' : monthsText( f.leftMonths ) ) }${ tile( '📅', t( 'efTileDays' ), String( Math.max( 0, f.days ) ) ) }</div><p class="ef-conf">🎚️ ${ esc( t( 'efConfidence' ) ) } <b>${ esc( t( 'efConf_' + f.confidence ) ) }</b></p>`;
		const er = ! f.done && ! f.late && RANK[ f.verdict ] < 4 ? F.earliest( g, f.reserved || 0 ) : undefined;
		const callouts = [ f.verdict === 'done' ? t( 'efDone' ) : f.late ? t( 'efLate' ) : '', f.reserved > 0 ? t( 'efAfter', { a: m( f.reserved ) } ) : '', f.overdue > 0 ? t( 'efOverdue', { a: m( f.overdue ) } ) : '',
			! f.done && ! f.late && f.left >= 0 && f.monthly > 0 ? t( 'efCover', { n: monthsText( f.leftMonths ), s: m( f.monthly ) } ) : '', ! f.done && ! f.late && f.deficit > 0 ? t( 'efDeficit', { a: m( Math.round( f.deficit ) ), r: f.left >= 0 ? monthsShort( f.runway ) : '0' } ) : '', ! f.done && ! f.late && f.left >= 0 && f.hasIncome && ! ( f.deficit > 0 ) ? ( f.incomeMonthly > 0 && f.left + f.incomeMonthly >= f.monthly ? t( 'efIncomeOk' ) : t( 'efIncomeNo' ) ) : '', ! f.done && ! f.late && ! f.hasIncome ? t( 'efNoIncomeAsk' ) : '',
			f.limitPerDay > 0 && f.usualPerDay > f.limitPerDay * 1.05 ? t( 'efLimitOver', { a: m( Math.round( f.usualPerDay ) ), b: m( Math.round( f.limitPerDay ) ) } ) : '', ...F.limitNotes(),
			er ? t( 'efEarliest', { d: EX.dayName( er ) } ) : er === null ? t( 'efEarliestNone' ) : '',
			t( 'efAccuracy', { d: f.history || 1 } ) ].filter( Boolean );
		const tp = F.tips( f ), helpBody = suggRows ? `<ul class="ef-list">${ suggRows }</ul>${ points( [ t( 'efHelpsNote', { a: m( f.gain ) } ) ] ) }` : '';
		UI.openSheet( `<div class="sheet-head"><h2>${ esc( g.name ) }</h2><span class="sp"></span><button type="button" class="ab-btn" data-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button></div>
			<div class="sheet-pad ef-sheet"><div class="ef-editrow"><button type="button" class="btn btn-ghost sm" data-ef-edit="${ esc( id ) }">${ UI.icon( 'pencil', 18 ) } ${ esc( t( 'efEdit' ) ) }</button></div>
			<div class="ef-top">${ F.mascot( f.verdict, 84 ) }<div class="ef-bubble"><b>${ esc( pickLine( f.verdict ) ) }</b>${ chip( f.verdict ) }</div></div>
			${ tiles }${ callouts.length ? `<div class="ef-callouts">${ points( callouts ) }${ er ? `<button type="button" class="btn btn-primary sm" data-ef-usedate="${ esc( id ) }" data-d="${ er }">📅 ${ esc( t( 'efUseDate' ) ) }</button>` : '' }${ ! f.hasIncome && ! f.done ? `<button type="button" class="btn btn-ghost sm" data-ef-income>💶 ${ esc( t( 'efAddIncome' ) ) }</button>` : '' }</div>` : '' }
			${ sec( '💡', t( 'efTipsTitle' ), tipsHtml( tp ) ) }${ sec( '✂️', t( 'efHelps' ), helpBody ) }${ sec( '🔀', t( 'efOtherWays' ), alt.length ? points( alt ) : '' ) }
			${ sec( '🧾', t( 'efMustTitle' ), mustRows ? `<ul class="ef-list">${ mustRows }</ul>` : '' ) }
			${ sec( '🔒', t( 'efSortTitle' ), catRows ? `${ para( 'efSortText' ) }<ul class="ef-list">${ catRows }</ul><button type="button" class="btn btn-ghost wide" data-ef-redo="${ esc( id ) }">${ esc( t( 'efRedo' ) ) }</button>` : '', true ) }
			<p class="muted small ef-disc">ℹ️ ${ esc( t( 'efDisclaimer' ) ) }</p></div>`, { tall: true } );
		document.querySelector( '.ef-sheet' ).addEventListener( 'click', ( e ) => { const s = e.target.closest( '[data-ef-to]' ); if ( ! s ) return; const o = S().settings.importance = S().settings.importance || {}, bef = F.measure(); o[ 'cat:' + s.dataset.efLevel ] = s.dataset.efTo; F.logChange( bef, [ [ 'sort', s.dataset.efLevel, s.dataset.efTo ] ] ); EX.save(); EXA.render(); } );
	};
	document.addEventListener( 'click', ( e ) => { const ed = e.target.closest( '[data-ef-edit]' ); if ( ed ) { e.preventDefault(); e.stopImmediatePropagation(); const g = S().goals.find( ( x ) => x.id === ed.dataset.efEdit ); if ( g ) { UI.closeSheet(); setTimeout( () => EXA.openEfPlan( g ), 220 ); } return; } const tr = e.target.closest( '[data-ef-try]' ); if ( tr ) { e.preventDefault(); EXA.openEfPlan( S().goals.find( ( x ) => x.id === tr.dataset.efTry ) ); return; } const r = e.target.closest( '[data-ef-redo]' ); if ( r ) { UI.closeSheet(); setTimeout( () => EXA.efriendOnboard( r.dataset.efRedo, 'sort' ), 200 ); return; } const b = e.target.closest( '[data-ef-open]' ); if ( b ) { e.preventDefault(); e.stopImmediatePropagation(); EXA.openEfriend( b.dataset.efOpen ); } }, true );

	/* ------------------------------------------------------------------ The plan form */
	const PLAN_ICONS = [ 'plane', 'beach', 'gift', 'car', 'home', 'heart', 'school', 'device-laptop', 'device-mobile', 'rocket', 'trophy' ];
	const WISHES = [ [ 'trip', 'plane', '✈️', 'efWishTrip' ], [ 'shoes', 'heart', '👟', 'efWishShoes' ], [ 'phone', 'device-mobile', '📱', 'efWishPhone' ], [ 'gift', 'gift', '🎁', 'efWishGift' ], [ 'car', 'car', '🚗', 'efWishCar' ], [ 'holiday', 'beach', '🏖️', 'efWishHoliday' ], [ 'laptop', 'device-laptop', '💻', 'efWishLaptop' ], [ 'home', 'home', '🏠', 'efWishHome' ] ];
	const wishChips = ( on = [] ) => `<div class="ef-wishes">${ WISHES.map( ( w ) => `<button type="button" class="ef-wish${ on.includes( w[ 0 ] ) ? ' on' : '' }" data-ef-wish="${ w[ 0 ] }">${ w[ 2 ] } ${ esc( t( w[ 3 ] ) ) }</button>` ).join( '' ) }</div>`;
	EXA.openEfPlan = ( p, pre ) => {
		if ( document.querySelector( '.ef-cp' ) ) closeChat(); // making a plan from a chat leaves the chat
		const ws = EX.writableAccounts(), chosen = p && p.wallets && p.wallets.length ? p.wallets : ws.map( ( w ) => w.id );
		const goals = S().goals.filter( ( x ) => ! isPlan( x ) ), v = p || Object.assign( { name: '', target: '', deadline: '', icon: 'plane' }, pre || {} );
		const X = `<button type="button" class="ab-btn" data-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button>`;
		UI.openSheet( `<div class="sheet-head">${ X }<h2 id="sheetTitle">${ esc( p ? p.name : t( 'efPlanNew' ) ) }</h2><span class="sp"></span></div>
			<form id="efPlanForm" novalidate class="sheet-pad"><div class="ef-intro"><span class="ef-mini">${ F.mascot( 'happy', 44 ) }</span><div><small>${ esc( t( 'efMeetText' ) ) }</small></div></div>
			<label class="f"><span>${ esc( t( 'efPlanName' ) ) }</span><input name="pname" maxlength="60" autocomplete="off" placeholder="${ esc( t( 'efPlanNamePh' ) ) }" value="${ esc( v.name ) }"></label>
			<div class="grid2"><label class="f"><span>${ esc( t( 'efPlanCost' ) ) } (${ esc( main() ) })</span><input name="pcost" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${ esc( v.target ) }"></label>
			<label class="f"><span>${ esc( t( 'efPlanDate' ) ) }</span><input name="pdate" type="date" value="${ esc( v.deadline || '' ) }"></label></div>
			<div class="ef-datehelp"><button type="button" class="btn btn-ghost sm" data-ef-suggestdate>📅 ${ esc( t( 'efSuggestDate' ) ) }</button><span id="efDateNote"></span></div>
			<label class="f"><span>${ esc( t( 'efGroupLabel' ) ) }</span><input name="pgroup" list="efGroups" maxlength="40" autocomplete="off" placeholder="${ esc( t( 'efGroupPh' ) ) }" value="${ esc( v.group || '' ) }"><datalist id="efGroups">${ F.groups().map( ( n ) => `<option value="${ esc( n ) }">` ).join( '' ) }</datalist><span class="ef-hint">${ para( 'efGroupHint' ) }</span></label>
			<div class="lbl">${ esc( t( 'goalIcon' ) ) }</div><div class="icon-pick" id="efIcons">${ PLAN_ICONS.map( ( n ) => `<button type="button" class="ipick${ v.icon === n ? ' on' : '' }" data-ef-icon="${ n }" aria-label="${ n }">${ UI.icon( n, 22 ) }</button>` ).join( '' ) }</div><input type="hidden" name="picon" value="${ esc( v.icon || 'plane' ) }">
			<div class="lbl">${ esc( t( 'efPlanWallets' ) ) }</div><div class="chips wrap">${ ws.map( ( w ) => `<label class="chip ef-wallet"><input type="checkbox" name="gw" value="${ esc( w.id ) }"${ chosen.includes( w.id ) ? ' checked' : '' }> ${ esc( EX.accountName( w ) ) }</label>` ).join( '' ) }</div>
			${ goals.length ? `<label class="f"><span>${ esc( t( 'efPlanLink' ) ) }</span><select name="plink"><option value="">${ esc( t( 'efPlanLinkNone' ) ) }</option>${ goals.map( ( g ) => `<option value="${ esc( g.id ) }"${ ( p || pre || {} ).linkedGoal === g.id ? ' selected' : '' }>${ esc( g.name ) }</option>` ).join( '' ) }</select><span class="ef-hint">${ para( 'efPlanLinkHint' ) }</span></label>` : '' }
			<p class="err" id="efErr" role="alert" hidden></p>
			<div class="btn-row sticky-actions">${ p ? `<button type="button" class="btn btn-danger" data-ef-del="${ esc( p.id ) }">${ esc( t( 'del' ) ) }</button>` : '' }<span class="sp"></span><button type="submit" class="btn btn-primary">${ esc( t( 'saveTx' ) ) }</button></div></form>` );
		document.getElementById( 'efPlanForm' ).dataset.id = p ? p.id : ''; document.getElementById( 'efPlanForm' ).dataset.convert = ( pre && pre.convertGoal ) || '';
	};
	document.addEventListener( 'click', ( e ) => {
		const ud = e.target.closest( '[data-ef-usedate]' ); if ( ud ) { e.preventDefault(); const g = S().goals.find( ( x ) => x.id === ud.dataset.efUsedate ); if ( g ) { const bef = F.measure(), old = g.deadline; g.deadline = ud.dataset.d; const sn = S().settings.efSnooze; if ( sn ) delete sn[ g.id ]; F.logChange( bef, [ [ 'date', old, g.deadline ] ], [ g.id ] ); EX.save(); } return; }
		const sd = e.target.closest( '[data-ef-suggestdate]' ); if ( sd ) {
			e.preventDefault(); const f = sd.closest( 'form' ), el = f.elements, note = f.querySelector( '#efDateNote' ), id = f.dataset.id;
			const tmp = { id: 'tmp', target: String( num( el.pcost.value ) || 0 ), wallets: [ ...f.querySelectorAll( '[name=gw]:checked' ) ].map( ( x ) => x.value ), linkedGoal: el.plink ? el.plink.value : '' };
			const ws = walletSet( tmp ), reserved = F.all().filter( ( x ) => x.goal.id !== id && ! x.done && ! x.late && [ ...walletSet( x.goal ) ].some( ( w ) => ws.has( w ) ) ).reduce( ( s2, x ) => s2 + x.remaining, 0 );
			if ( ! ( num( el.pcost.value ) > 0 ) ) { note.innerHTML = points( [ t( 'efNeedCost' ) ] ); return; }
			const d = F.earliest( tmp, reserved ); if ( d ) { el.pdate.value = d; el.pdate.dispatchEvent( new Event( 'change', { bubbles: true } ) ); note.innerHTML = points( [ t( 'efEarliest', { d: EX.dayName( d ) } ) ] ); } else note.innerHTML = points( [ t( 'efEarliestNone' ) ] );
			return;
		}
		const wc = e.target.closest( '.ef-wish[data-ef-wish]' ); if ( wc && ! wc.closest( '.ef-ob' ) ) { const w = WISHES.find( ( x ) => x[ 0 ] === wc.dataset.efWish ); if ( w ) EXA.openEfPlan( null, { name: t( w[ 3 ] ), icon: w[ 1 ] } ); return; }
		const cv = e.target.closest( '[data-ef-convert]' ); if ( cv ) { const g = S().goals.find( ( x ) => x.id === cv.dataset.efConvert ); if ( g ) { UI.closeSheet && UI.closeSheet( true ); setTimeout( () => EXA.openEfPlan( null, { name: g.name, target: String( g.target ), deadline: g.deadline && g.deadline > today() ? g.deadline : '', icon: PLAN_ICONS.includes( g.icon ) ? g.icon : 'plane', convertGoal: g.id } ), 220 ); } return; }
		const fg = e.target.closest( '[data-ef-fromgoal]' ); if ( fg ) { const g = S().goals.find( ( x ) => x.id === fg.dataset.efFromgoal ); if ( g ) EXA.openEfPlan( null, { name: g.name, target: String( g.target ), deadline: g.deadline && g.deadline > today() ? g.deadline : '', icon: PLAN_ICONS.includes( g.icon ) ? g.icon : 'plane', linkedGoal: g.id } ); return; }
		if ( e.target.closest( '[data-ef-income]' ) && ! e.target.closest( '.ef-ob' ) ) { e.preventDefault(); UI.closeSheet && UI.closeSheet(); setTimeout( () => EXA.openIncome && EXA.openIncome(), 220 ); return; }
		const nu = e.target.closest( '[data-ef-nudge]' ); if ( nu ) { EXA.st.view = 'more'; EXA.st.more = 'efriend'; EXA.render(); return; }
		const ic = e.target.closest( '[data-ef-icon]' ); if ( ic ) { const f = ic.closest( 'form' ); f.elements.picon.value = ic.dataset.efIcon; f.querySelectorAll( '[data-ef-icon]' ).forEach( ( b ) => b.classList.toggle( 'on', b === ic ) ); return; }
		const del = e.target.closest( '[data-ef-del]' ); if ( del ) { S().goals = S().goals.filter( ( g ) => g.id !== del.dataset.efDel ); S().settings.u = Date.now(); EX.save(); UI.closeSheet(); EXA.render(); }
	} );
	document.addEventListener( 'submit', ( e ) => {
		const f = e.target; if ( f.id !== 'efPlanForm' ) return; e.preventDefault();
		const el = f.elements, err = ( k ) => { const p = document.getElementById( 'efErr' ); p.textContent = t( k ); p.hidden = false; return false; };
		const name = el.pname.value.trim(), cost = num( el.pcost.value ), date = el.pdate.value, wallets = [ ...f.querySelectorAll( '[name=gw]:checked' ) ].map( ( x ) => x.value );
		if ( ! name ) return err( 'efNeedName' ); if ( ! ( cost > 0 ) ) return err( 'efNeedCost' ); if ( ! date || date <= today() ) return err( 'efNeedFuture' ); if ( ! wallets.length ) return err( 'efNeedWallet' );
		const v = { name, target: String( cost ), deadline: date, icon: el.picon.value || 'plane', wallets, linkedGoal: el.plink ? el.plink.value : '', group: el.pgroup.value.trim(), kind: 'efriend' }, id = f.dataset.id;
		if ( ! id ) v.created = today();
		let rec = id && S().goals.find( ( g ) => g.id === id ), before = null, changes = [];
		const conv = ! rec && f.dataset.convert ? S().goals.find( ( g ) => g.id === f.dataset.convert ) : null;
		if ( conv ) { Object.assign( conv, v, { prio: F.plans().length + 1, created: today() } ); delete conv.coach; rec = conv; }
		if ( rec ) { before = F.measure(); if ( String( rec.target ) !== v.target ) changes.push( [ 'cost', rec.target, v.target ] ); if ( rec.deadline !== v.deadline ) changes.push( [ 'date', rec.deadline, v.deadline ] ); if ( ( rec.wallets || [] ).join() !== v.wallets.join() ) changes.push( [ 'wallets', ( rec.wallets || [] ).length, v.wallets.length ] ); if ( ( rec.linkedGoal || '' ) !== v.linkedGoal ) changes.push( [ 'link', '', '' ] ); }
		if ( rec && ! conv ) { delete rec.coach; Object.assign( rec, v ); } else if ( ! rec ) { rec = Object.assign( { id: EX.uid(), prio: F.plans().length + 1 }, v ); if ( window.EXA && EXA.autoTags ) EXA.autoTags.apply( rec, 'goal' ); S().goals.push( rec ); }
		if ( before && changes.length ) F.logChange( before, changes, [ rec.id ] );
		S().settings.u = Date.now(); EX.save(); UI.closeSheet(); EXA.render();
		setTimeout( () => ( ( S().device || {} ).efOnboard ? EXA.openEfriend( rec.id ) : EXA.efriendOnboard( rec.id ) ), 350 );
	} );

	/* ------------------------------------------------------------------ Intro: the Expenity logo turns into "eFriend" */
	// The E and its tick become "e" and "F", then "riend" types itself in and the character hops out. Reduced motion shows the final word.
	// The word is set in Pacifico (SIL Open Font License), turned into outlines so no font file is needed. "e" is the logo teal and "F" the logo gold.
	const TEAL = '#0f766e', GOLD = '#f2b01e';
	const WORD = [["e", "M52.2 -17.8Q52.2 -13.8 50.3 -11.6Q46.6 -7.1 39.9 -3.3Q33.1 0.5 25.4 0.5Q14.9 0.5 9.1 -5.2Q3.3 -10.9 3.3 -20.8Q3.3 -27.7 6.2 -33.7Q9.1 -39.6 14.2 -43.1Q19.4 -46.6 25.9 -46.6Q31.7 -46.6 35.2 -43.2Q38.7 -39.7 38.7 -33.8Q38.7 -26.9 33.8 -22Q28.8 -17 17 -14.1Q19.5 -9.5 26.5 -9.5Q31 -9.5 36.8 -12.7Q42.5 -15.8 46.7 -20.9Q47.9 -22.3 49.4 -22.3Q50.7 -22.3 51.5 -21.1Q52.2 -19.9 52.2 -17.8ZM15.4 -22.1V-21.9Q21.3 -23.3 24.7 -26.1Q28.1 -28.9 28.1 -32.6Q28.1 -34.5 27.1 -35.7Q26 -36.8 24.2 -36.8Q20.5 -36.8 17.9 -32.5Q15.4 -28.2 15.4 -22.1Z"], ["F", "M132.9 -77.8Q132.9 -70.9 125.5 -71.4L122 -71.7Q116.1 -72.2 110.3 -72.5Q104.4 -72.8 98 -72.8H93.5Q92.3 -58 91 -45.8L108.2 -46.1Q111.9 -46.1 113.2 -44.8Q114.4 -43.5 114.4 -41.3Q114.4 -37.9 112.4 -36Q110.4 -34 106.7 -34H89.6L89 -29.7Q86.9 -13.2 80.1 -6.2Q73.2 0.8 61.2 0.8Q54.4 0.8 48.7 -2.2Q43 -5.1 40.3 -9.3Q39.2 -11 39.2 -13.4Q39.2 -15.8 40.4 -17.6Q41.5 -19.4 43.2 -19.4Q44.4 -19.4 45.6 -18.6Q46.7 -17.8 48.5 -15.5Q53.3 -9.2 60.4 -9.2Q66.1 -9.2 70 -13.9Q73.8 -18.5 74.9 -28.5L75.5 -34H70.7Q68.4 -34 66.8 -35.3Q65.1 -36.6 65.1 -39Q65.1 -42.1 66.7 -43.8Q68.3 -45.4 71.4 -45.4Q74.2 -45.4 76.9 -45.5Q78.1 -56.5 79.5 -72.2Q68.7 -71.2 64.3 -68.7Q59.9 -66.2 59.9 -61.3Q59.9 -57.9 61.9 -54.8Q62.5 -53.9 62.5 -53Q62.5 -51.2 60.5 -49.9Q58.5 -48.5 56 -48.5Q53.3 -48.5 51.4 -50.1Q50.2 -51.1 49.1 -54.2Q48 -57.3 48 -61.1Q48 -73.5 60.8 -79.1Q73.5 -84.7 98 -84.7Q115 -84.7 128 -82.9Q130.8 -82.5 131.9 -81.2Q132.9 -79.9 132.9 -77.8Z"], ["r", "M115.5 -16.3Q115.5 -29.3 119.2 -41Q120.1 -43.9 122.2 -45.2Q124.2 -46.6 127.9 -46.6Q129.9 -46.6 130.7 -46.1Q131.5 -45.6 131.5 -44.2Q131.5 -42.6 130 -37Q129 -33 128.4 -30Q127.8 -27 127.4 -22.6Q130.7 -31.2 134.8 -36.6Q138.9 -42 142.9 -44.3Q146.8 -46.6 150.1 -46.6Q156.6 -46.6 156.6 -40.1Q156.6 -38.8 155.7 -33.8Q154.9 -29.8 154.9 -28.8Q154.9 -25.3 157.4 -25.3Q160.2 -25.3 164.6 -29.7Q165.9 -31 167.3 -31Q168.6 -31 169.3 -29.9Q170.1 -28.7 170.1 -26.8Q170.1 -23.1 168.1 -21Q165.3 -18.1 161.6 -16.1Q157.8 -14 153.6 -14Q148.3 -14 145.6 -16.7Q142.8 -19.4 142.8 -24Q142.8 -25.5 143.1 -27Q143.3 -29 143.3 -29.7Q143.3 -31.3 142.2 -31.3Q140.7 -31.3 138.2 -28Q135.8 -24.6 133.4 -19.1Q131 -13.6 129.5 -7.5Q128.4 -2.8 127 -1.2Q125.5 0.5 122.4 0.5Q118.6 0.5 117 -3.5Q115.5 -7.5 115.5 -16.3Z"], ["i", "M165.5 -60.6Q165.5 -64.1 168.2 -66.5Q171 -68.8 175.1 -68.8Q178.8 -68.8 181.1 -67Q183.4 -65.2 183.4 -61.9Q183.4 -57.9 180.8 -55.6Q178.2 -53.2 173.9 -53.2Q169.7 -53.2 167.6 -55.2Q165.5 -57.1 165.5 -60.6ZM160.7 -16.3Q160.7 -20.8 161.8 -27.9Q163 -34.9 164.8 -41Q165.7 -44.2 167.2 -45.4Q168.7 -46.6 172 -46.6Q177.1 -46.6 177.1 -43.2Q177.1 -40.7 175.2 -31.6Q172.8 -20.6 172.8 -16.7Q172.8 -13.7 173.6 -12.1Q174.4 -10.5 176.3 -10.5Q178.1 -10.5 180.8 -13Q183.5 -15.5 188 -20.9Q189.2 -22.3 190.7 -22.3Q192 -22.3 192.8 -21.1Q193.5 -19.9 193.5 -17.8Q193.5 -13.8 191.6 -11.6Q181.7 0.5 173.1 0.5Q166.6 0.5 163.6 -4.1Q160.7 -8.7 160.7 -16.3Z"], ["e", "M232.8 -17.8Q232.8 -13.8 230.9 -11.6Q227.2 -7.1 220.5 -3.3Q213.7 0.5 206 0.5Q195.5 0.5 189.7 -5.2Q183.9 -10.9 183.9 -20.8Q183.9 -27.7 186.8 -33.7Q189.7 -39.6 194.9 -43.1Q200 -46.6 206.5 -46.6Q212.3 -46.6 215.8 -43.2Q219.3 -39.7 219.3 -33.8Q219.3 -26.9 214.4 -22Q209.4 -17 197.6 -14.1Q200.1 -9.5 207.1 -9.5Q211.6 -9.5 217.4 -12.7Q223.1 -15.8 227.3 -20.9Q228.5 -22.3 230 -22.3Q231.3 -22.3 232.1 -21.1Q232.8 -19.9 232.8 -17.8ZM196 -22.1V-21.9Q201.9 -23.3 205.3 -26.1Q208.7 -28.9 208.7 -32.6Q208.7 -34.5 207.7 -35.7Q206.6 -36.8 204.8 -36.8Q201.1 -36.8 198.6 -32.5Q196 -28.2 196 -22.1Z"], ["n", "M224.9 -16.3Q224.9 -29.3 228.6 -41Q229.5 -43.9 231.6 -45.2Q233.6 -46.6 237.3 -46.6Q239.3 -46.6 240.1 -46.1Q240.9 -45.6 240.9 -44.2Q240.9 -42.6 239.4 -37Q238.4 -33 237.8 -30Q237.2 -27 236.8 -22.6Q240.1 -31.2 244.2 -36.6Q248.3 -42 252.2 -44.3Q256.2 -46.6 259.5 -46.6Q266 -46.6 266 -40.1Q266 -36.2 263.8 -26Q261.9 -17.3 261.9 -14.5Q261.9 -10.5 264.8 -10.5Q266.8 -10.5 269.6 -12.9Q272.3 -15.4 276.9 -20.9Q278.1 -22.3 279.6 -22.3Q280.9 -22.3 281.6 -21.1Q282.4 -19.9 282.4 -17.8Q282.4 -13.8 280.5 -11.6Q276.2 -6.3 271.2 -2.9Q266.3 0.5 260 0.5Q254.9 0.5 252.3 -2.5Q249.7 -5.4 249.7 -11Q249.7 -13.8 251.1 -21Q252.4 -27.3 252.4 -29.7Q252.4 -31.3 251.3 -31.3Q250 -31.3 247.7 -28Q245.3 -24.6 242.9 -19.1Q240.4 -13.6 238.9 -7.5Q237.8 -2.8 236.4 -1.2Q234.9 0.5 231.8 0.5Q228 0.5 226.4 -3.5Q224.9 -7.5 224.9 -16.3Z"], ["d", "M333.9 -17.8Q333.9 -13.8 332 -11.6Q327.9 -6.6 323 -3.1Q318.1 0.5 313.3 0.5Q305.7 0.5 301.7 -8.4Q297.5 -3.1 294.4 -1.3Q291.2 0.5 287 0.5Q280.9 0.5 276.9 -4Q273 -8.6 273 -15.9Q273 -23.9 276.4 -30.8Q279.8 -37.6 285.8 -42Q291.7 -46.3 299.1 -47.1Q301 -66.5 306.4 -80.2Q311.7 -94 320.4 -94Q324.7 -94 327.5 -90.1Q330.4 -86.2 330.4 -78.3Q330.4 -67.1 324.9 -52.1Q319.4 -37.1 310.2 -21.3Q310.6 -15.5 312 -13Q313.3 -10.5 315.4 -10.5Q318.1 -10.5 320.9 -12.9Q323.7 -15.3 328.4 -20.9Q329.6 -22.3 331.1 -22.3Q332.4 -22.3 333.1 -21.1Q333.9 -19.9 333.9 -17.8ZM310.3 -37Q321.5 -61.4 321.5 -76.2Q321.5 -80 320.9 -82.1Q320.2 -84.2 319.3 -84.2Q317.4 -84.2 315.5 -77.5Q313.6 -70.7 312.2 -59.8Q310.9 -48.9 310.3 -37ZM299.1 -16.9Q298.1 -22.3 298.1 -29Q298.1 -31.4 298.3 -36.8Q292.8 -35.1 289.1 -29.5Q285.5 -23.8 285.5 -16.9Q285.5 -9.6 290.5 -9.6Q292.4 -9.6 294.3 -11.2Q296.2 -12.7 299.1 -16.9Z"]];
	// Morph paths: the logo's E becomes the "e" and its tick becomes the "F" (same number of curve segments, so they can be interpolated).
	const M_E = 'M40 -2 C30.0 -2.0 20.0 -2.0 10 -2 C10.0 -16.0 10.0 -30.0 10 -44 C20.0 -44.0 30.0 -44.0 40 -44 C40.0 -44.0 40.0 -44.0 40 -44', M_e = 'M50 -14 C42 -6 30 -2 22 -3 C10 -5 3 -15 6 -27 C9 -39 22 -45 31 -39 C38 -34 33 -26 22 -22', M_T = 'M16 -24 C19.0 -20.7 22.0 -17.3 25 -14 C30.0 -20.0 35.0 -26.0 40 -32 C40.0 -32.0 40.0 -32.0 40 -32', M_F = 'M46 -12 C55 -4 72 -6 78 -22 C82 -36 85 -56 88 -77 C100 -78 114 -78 127 -75';
	const M_HOOK = 'M88 -77 C66 -76 50 -68 53 -52', M_BAR = 'M68 -42 L108 -44', EASE = 'calcMode="spline" keyTimes="0;1" keySplines=".6 0 .25 1"';
	F.logoWord = ( cls = '' ) => {
		const play = /\bplay\b/.test( cls );
		const strokes = play ? `<g class="ef-m" fill="none" stroke-linecap="round" stroke-linejoin="round">
			<path class="ef-m-e" d="${ M_E }" stroke="${ TEAL }" stroke-width="8"><animate attributeName="d" values="${ M_E };${ M_e }" dur=".9s" begin="1.1s" fill="freeze" ${ EASE }/></path>
			<path class="ef-m-t" d="${ M_T }" stroke="#ffc94d" stroke-width="7"><animate attributeName="d" values="${ M_T };${ M_F }" dur=".9s" begin="1.1s" fill="freeze" ${ EASE }/><animate attributeName="stroke-width" values="7;8" dur=".9s" begin="1.1s" fill="freeze"/><animate attributeName="stroke" values="#ffc94d;${ GOLD }" dur=".9s" begin="1.1s" fill="freeze"/></path>
			<path class="ef-m-hook" pathLength="1" d="${ M_HOOK }" stroke="${ GOLD }" stroke-width="8"/><path class="ef-m-bar" pathLength="1" d="${ M_BAR }" stroke="${ GOLD }" stroke-width="8"/></g>` : '';
		return `<svg class="ef-logo ${ cls }" viewBox="-44 -102 392 146" role="img" aria-label="eFriend">${ strokes }
		${ WORD.map( ( [ , d ], i ) => `<path class="ef-lg-w ${ i < 2 ? 'sw' : 'ty' }" style="--d:${ i < 2 ? 2.6 : ( 3.1 + ( i - 2 ) * .22 ).toFixed( 2 ) }s" d="${ d }" fill="${ i === 0 ? TEAL : i === 1 ? GOLD : 'var(--ink)' }"/>` ).join( '' ) }</svg>`;
	};
	EXA.efriendIntro = () => {
		const d = document.createElement( 'div' ); d.className = 'ef-intro-ov'; d.setAttribute( 'role', 'dialog' ); d.setAttribute( 'aria-label', 'eFriend' );
		d.innerHTML = `<div class="ef-intro-card">${ F.logoWord( 'play' ) }<div class="ef-hop">${ F.mascot( 'cheer', 96 ) }</div>${ para( 'efMeetText' ) }<button type="button" class="btn btn-primary">${ esc( t( 'tutDone' ) ) }</button></div>`;
		document.body.appendChild( d ); d.querySelector( 'button' ).addEventListener( 'click', () => d.remove() ); d.addEventListener( 'click', ( e ) => { if ( e.target === d ) d.remove(); } );
		try { S().device.efIntro = 1; } catch ( e ) { /* ignore */ }
	};

	/* ------------------------------------------------------------------ Onboarding: one page, pre-sorted, you adjust */
	// Your spending categories, each already sorted as Must / Need / Want by the rules above. A 3-way toggle changes any of them.
	const LVL = [ 'must', 'need', 'want' ];
	F.sortRows = () => {
		const since = addDays( today(), -90 ), tot = {};
		S().txs.filter( ( x ) => x.type === 'expense' && x.date >= since && ! x.goalId ).forEach( ( x ) => { const c = x.category || 'other'; tot[ c ] = ( tot[ c ] || 0 ) + centsOf( x.amount, EX.txCurrency( x ) ); } );
		S().bills.forEach( ( b ) => { const c = b.category || 'other'; tot[ c ] = tot[ c ] || 1; } );
		const ov = S().settings.importance || {};
		return Object.keys( tot ).sort( ( a, b ) => tot[ b ] - tot[ a ] ).slice( 0, 14 ).map( ( cat ) => {
			const auto = F.importance( { category: cat, name: EX.catInfo( cat ).name, id: '' } );
			const base = ov[ 'cat:' + cat ] ? CAT_DEFAULT[ cat ] || auto.level : auto.level;
			return { cat, spent: tot[ cat ] > 1 ? tot[ cat ] : 0, auto: base, level: ov[ 'cat:' + cat ] || auto.level };
		} );
	};
	/** Full-screen stepped onboarding: meet it, see the Home card, check the sorting, know where to find it. `only: 'sort'` shows just the sorting step. */
	EXA.efriendOnboard = ( goalId, only ) => {
		if ( document.querySelector( '.ef-ob' ) ) return;
		try { S().device.efOnboard = 1; EX.persist(); } catch ( e ) { /* ignore */ }
		const rows = F.sortRows(), pick = {}; rows.forEach( ( r ) => { pick[ r.cat ] = r.level; } );
		const steps = only === 'sort' ? [ 'sort' ] : [ 'meet', 'how' ].concat( S().incomes.length ? [] : [ 'income' ] ).concat( [ 'limits', 'wishes', 'budgets', 'priority', 'moves', 'see', 'sort', 'where' ] );
		let i = 0, wr = [], added = [], wErr = false, madePlans = false;
		const ov = document.createElement( 'div' ); ov.className = 'ef-ob'; ov.setAttribute( 'role', 'dialog' ); ov.setAttribute( 'aria-modal', 'true' ); ov.setAttribute( 'aria-label', 'eFriend' );
		const mock = ( kind ) => kind === 'see'
			? `<div class="ef-phone"><div class="ef-ph-bar"></div><div class="ef-ph-block short"></div><div class="ef-ph-block"></div>
				<div class="ef-ph-widget"><div class="ef-top">${ F.mascot( 'ontrack', 56 ) }<div class="ef-bubble ef-type"><b>${ esc( t( 'ef_ontrack' ).split( '|' )[ 0 ] ) }</b></div></div>
				<div class="ef-meta"><span class="ef-chip">On track</span><span>${ esc( t( 'efDaysLeft', { n: 112 } ) ) }</span></div><div class="ef-bar"><i class="ef-demo-fill"></i><span class="ef-suit ef-demo-suit">${ UI.icon( 'plane', 16 ) }</span></div></div>
				<div class="ef-ph-block"></div><div class="ef-ph-block short"></div></div>`
			: `<div class="ef-phone"><div class="ef-ph-title">${ esc( t( 'barMore' ) ) }</div><div class="ef-ph-row"></div><div class="ef-ph-row"></div><div class="ef-ph-row hot"><span class="ef-ph-ic">${ UI.icon( 'sparkles', 18 ) }</span><b>eFriend</b><i class="ef-tap"></i></div><div class="ef-ph-row"></div><div class="ef-ph-row"></div></div>`;
		const body = ( id ) => {
			if ( id === 'meet' ) return `${ F.logoWord( 'play' ) }<div class="ef-hop">${ F.mascot( 'cheer', 110 ) }</div>${ para( 'efMeetText' ) }`;
			if ( id === 'how' ) { const m = ( n ) => money( n, main() ), row = ( cls, k, v, i ) => `<li class="ef-how-${ cls }" style="--i:${ i }"><span>${ esc( t( k ) ) }</span><b>${ v }</b></li>`; return `<h2>${ esc( t( 'efObHowTitle' ) ) }</h2><ul class="ef-how">${ row( 'plus', 'efHowWallets', '+ ' + m( 900 ), 0 ) }${ row( 'plus', 'efHowIncome', '+ ' + m( 300 ), 1 ) }${ row( 'minus', 'efHowBills', '− ' + m( 300 ), 2 ) }${ row( 'minus', 'efHowSpend', '− ' + m( 350 ), 3 ) }${ row( 'total', 'efHowFree', '= ' + m( 550 ), 4 ) }<li class="ef-how-cmp" style="--i:5"><span>${ F.mascot( 'comfortable', 40 ) }</span><b>${ m( 550 ) } &gt; ${ m( 400 ) } ✓</b></li></ul>${ para( 'efObHowText' ) }${ para( 'efObHowLink' ) }`; }
			if ( id === 'income' ) return `<h2>${ esc( t( 'efObIncTitle' ) ) }</h2><div class="ef-inc-demo"><span class="ef-inc-pay">💶</span><span class="ef-inc-arrow">➜</span>${ F.mascot( 'cheer', 70 ) }</div>${ para( 'efObIncText' ) }${ S().incomes.length ? `<div class="ef-callouts">${ points( [ t( 'efObIncDone' ) ] ) }</div>` : `<button type="button" class="btn btn-primary" data-ef-ob-income>💶 ${ esc( t( 'efAddIncome' ) ) }</button><p class="muted small">${ esc( t( 'efObIncSkip' ) ) }</p>` }`;
			if ( id === 'limits' ) { const L = ( S().settings.targets || {} ).limits || {}; const sg = F.suggestLimits(), none = ! L.day && ! L.week && ! L.month, mm = ( c ) => money( c / 100, main() ); return `<h2>${ esc( t( 'efLimTitle' ) ) }</h2>${ para( 'efLimText' ) }${ none ? ( sg ? `<div class="ef-callouts">${ points( [ t( 'efLimSuggest', { n: sg.days, d: mm( sg.day ), w: mm( sg.week ), m: mm( sg.month ) } ) ] ) }<button type="button" class="btn btn-primary sm" data-ef-limuse>${ esc( t( 'efLimUse' ) ) }</button></div>` : `<div class="ef-callouts">${ points( [ t( 'efLimNoData' ) ] ) }</div>` ) : '' }<div class="ef-lim">${ [ [ 'day', 'efLimDay' ], [ 'week', 'efLimWeek' ], [ 'month', 'efLimMonth' ] ].map( ( [ k, lab ] ) => `<label class="f"><span>${ esc( t( lab ) ) } (${ esc( main() ) })</span><input data-lim="${ k }" inputmode="decimal" autocomplete="off" placeholder="0" value="${ esc( L[ k ] || '' ) }"></label>` ).join( '' ) }</div><div class="ef-lim-note">${ points( F.limitNotes() ) }</div><p class="muted small">${ esc( t( 'efLimSaved' ) ) }</p>`; }
			if ( id === 'wishes' ) return `<h2>${ esc( t( 'efWishTitle' ) ) }</h2>${ para( 'efWishText' ) }${ added.length ? points( [ t( 'efWishAdded', { names: added.join( ', ' ) } ) ] ) : '' }${ wishChips( wr.map( ( r ) => r.k ) ) }<button type="button" class="ef-wish ef-wish-other" data-ef-wish-other>＋ ${ esc( t( 'efWishOther' ) ) }</button><div class="ef-wish-rows">${ wr.map( ( r, n ) => `<div class="ef-wish-row" data-n="${ n }"><div class="ef-wish-head"><span>${ r.em }</span><input data-w="name" maxlength="60" autocomplete="off" placeholder="${ esc( t( 'efWishName' ) ) }" value="${ esc( r.name ) }"><button type="button" class="ef-wish-del" data-w-del aria-label="${ esc( t( 'efWishRemove' ) ) }">✕</button></div><div class="grid2"><label class="f"><span>${ esc( t( 'efPlanCost' ) ) } (${ esc( main() ) })</span><input data-w="cost" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${ esc( r.cost ) }"></label><label class="f"><span>${ esc( t( 'efPlanDate' ) ) }</span><input data-w="date" type="date" value="${ esc( r.date ) }"></label></div></div>` ).join( '' ) }</div>${ wErr ? `<p class="err">${ esc( t( 'efWishIncomplete' ) ) }</p>` : '' }`;
			if ( id === 'priority' ) { const list = F.all(); return `<h2>${ esc( t( 'efObPrioTitle' ) ) }</h2><div class="ef-shuf" aria-hidden="true"><span class="s1">✈️ ${ esc( t( 'efWishTrip' ) ) }</span><span class="s2">👟 ${ esc( t( 'efWishShoes' ) ) }</span><span class="s3"><i>🏆</i> 🚗 ${ esc( t( 'efWishCar' ) ) }</span></div>${ para( 'efObPrioText' ) }${ list.length > 1 ? prioList( list ) : '' }${ riskHtml() }`; }
			if ( id === 'moves' ) return `<h2>${ esc( t( 'efObMovesTitle' ) ) }</h2><div class="ef-moves-demo"><span class="ef-md-a">💰</span><span class="ef-md-ar">➜</span><span class="ef-md-b">🎯</span><span class="ef-md-ok">✋ ✅</span></div>${ para( 'efObMovesText' ) }<p class="muted small">${ esc( t( 'efObMovesLater' ) ) }</p>`;
			if ( id === 'budgets' ) return `<h2>${ esc( t( 'efObBudTitle' ) ) }</h2><div class="ef-bud-demo"><div class="ef-bud-card"><div class="ef-bud-top"><b>🍕 ${ esc( t( 'efObBudCat' ) ) }</b><span>${ money( 120, main() ) } / ${ esc( t( 'efObBudMonth' ) ) }</span></div><div class="ef-bar"><i class="ef-bud-fill"></i></div><div class="ef-bud-ok">✅ ${ esc( t( 'efObBudInside' ) ) }</div></div><div class="ef-bud-bot">${ F.mascot( 'cheer', 70 ) }<span class="ef-bud-gain">+${ money( 45, main() ) } ✈️</span></div></div>${ para( 'efObBudText' ) }${ budIdeasHtml() }`;
			if ( id === 'see' ) return `<h2>${ esc( t( 'efObSeeTitle' ) ) }</h2>${ mock( 'see' ) }${ para( 'efObSeeText' ) }`;
			if ( id === 'where' ) return `<h2>${ esc( t( 'efObWhereTitle' ) ) }</h2>${ mock( 'where' ) }${ para( 'efObWhereText' ) }`;
			const row = ( r ) => `<li data-ef-row="${ esc( r.cat ) }"><div><b>${ esc( EX.catInfo( r.cat ).name ) }</b>${ r.spent ? `<small>${ esc( money( r.spent / 100, main() ) ) }</small>` : '' }</div><div class="ef-tri" role="group" aria-label="${ esc( EX.catInfo( r.cat ).name ) }">${ LVL.map( ( l ) => `<button type="button" data-ef-set="${ l }" aria-pressed="${ pick[ r.cat ] === l }" class="${ pick[ r.cat ] === l ? 'on ' : '' }ef-l-${ l }">${ esc( t( 'ef_lvl_' + l ) ) }</button>` ).join( '' ) }</div></li>`;
			return `<div class="ef-top">${ F.mascot( 'happy', 72 ) }<div class="ef-bubble"><b>${ esc( t( 'efOnbHi' ) ) }</b></div></div>${ para( 'efSortText' ) }${ rows.length ? `<ul class="ef-list">${ rows.map( row ).join( '' ) }</ul>` : `<p class="muted">${ esc( t( 'efNoSpend' ) ) }</p>` }`;
		};
		const commitWishes = () => {
			const keep = []; let ok = true; const wallets = EX.writableAccounts().map( ( w ) => w.id );
			wr.forEach( ( r ) => {
				const cost = num( r.cost ), empty = ! r.name.trim() && ! r.cost && ! r.date;
				if ( empty ) return;
				if ( r.name.trim() && cost > 0 && r.date && r.date > today() ) { S().goals.push( { id: EX.uid(), name: r.name.trim(), target: String( cost ), deadline: r.date, icon: r.icon, wallets, kind: 'efriend', prio: F.plans().length + 1, created: today(), group: '', linkedGoal: '' } ); added.push( r.name.trim() ); madePlans = true; }
				else { keep.push( r ); ok = false; }
			} );
			wr = keep; if ( madePlans ) { S().settings.u = Date.now(); EX.save(); } return ok;
		};
		const finish = ( save ) => {
			if ( save && rows.length ) { const o = S().settings.importance = S().settings.importance || {}, bef = F.measure(), ch = rows.filter( ( r ) => pick[ r.cat ] !== r.level ).map( ( r ) => [ 'sort', r.cat, pick[ r.cat ] ] ); rows.forEach( ( r ) => { if ( pick[ r.cat ] === r.auto ) delete o[ 'cat:' + r.cat ]; else o[ 'cat:' + r.cat ] = pick[ r.cat ]; } ); if ( ch.length ) F.logChange( bef, ch ); S().settings.u = Date.now(); EX.save(); }
			ov.remove(); document.body.classList.remove( 'ef-ob-open' ); EXA.render();
			if ( goalId ) setTimeout( () => EXA.openEfriend( goalId ), 250 );
			else if ( only === 'sort' ) setTimeout( () => { const l = F.all(); if ( l.length > 1 ) EXA.openEfriendAll(); else if ( l.length === 1 ) EXA.openEfriend( l[ 0 ].goal.id ); }, 250 );
			else if ( madePlans ) setTimeout( () => { const l = F.all(); if ( l.length > 1 ) EXA.openEfriendAll(); else if ( l.length ) EXA.openEfriend( l[ 0 ].goal.id ); }, 300 );
			else if ( ! F.plans().length ) setTimeout( () => EXA.openEfPlan(), 300 );
		};
		const draw = () => {
			const id = steps[ i ], last = i === steps.length - 1;
			ov.innerHTML = `<div class="ef-ob-head"><span class="ef-dots">${ steps.map( ( x, n ) => `<i class="${ n === i ? 'on' : n < i ? 'done' : '' }"></i>` ).join( '' ) }</span><button type="button" class="btn btn-ghost sm" data-ef-ob="skip">${ esc( t( 'efSkip' ) ) }</button></div>
				<div class="ef-ob-main ef-ob-${ id }" key="${ id }">${ body( id ) }</div>
				<div class="ef-ob-foot">${ i ? `<button type="button" class="btn btn-ghost" data-ef-ob="back">${ esc( t( 'back' ) ) }</button>` : '<span></span>' }<button type="button" class="btn btn-primary" data-ef-ob="next">${ esc( last ? t( only ? 'efOnbSave' : 'efLetsGo' ) : t( 'efNext' ) ) }</button></div>`;
			ov.querySelector( '.ef-ob-main' ).scrollTop = 0;
		};
		ov.addEventListener( 'input', ( e ) => { const lm = e.target.closest && e.target.closest( '[data-lim]' ); if ( lm ) { F.saveLimits( lm.dataset.lim, lm.value ); const nb = ov.querySelector( '.ef-lim-note' ); if ( nb ) nb.innerHTML = points( F.limitNotes() ); return; } const f = e.target.closest && e.target.closest( '[data-w]' ); if ( ! f ) return; const r = wr[ Number( f.closest( '.ef-wish-row' ).dataset.n ) ]; if ( r ) r[ f.dataset.w ] = f.value; } );
		ov.addEventListener( 'change', ( e ) => { const f = e.target.closest && e.target.closest( '[data-w=date]' ); if ( f ) { const r = wr[ Number( f.closest( '.ef-wish-row' ).dataset.n ) ]; if ( r ) r.date = f.value; } } );
		ov.addEventListener( 'click', ( e ) => {
			if ( e.target.closest( '[data-ef-ob-income],[data-ef-income]' ) ) { e.stopPropagation(); ov.classList.add( 'paused' ); document.body.classList.remove( 'ef-ob-open' ); const dlg = document.getElementById( 'sheet' ), back = () => { setTimeout( () => { if ( dlg.open ) { dlg.addEventListener( 'close', back, { once: true } ); return; } ov.classList.remove( 'paused' ); document.body.classList.add( 'ef-ob-open' ); draw(); }, 200 ); }; dlg.addEventListener( 'close', back, { once: true } ); EXA.openIncome && EXA.openIncome(); return; }
			const wc = e.target.closest( '.ef-wish[data-ef-wish]' ), wo = e.target.closest( '[data-ef-wish-other]' ), wd = e.target.closest( '[data-w-del]' );
			if ( wc || wo || wd ) e.stopPropagation();
			if ( wc ) { const k = wc.dataset.efWish, at = wr.findIndex( ( r ) => r.k === k ); if ( at >= 0 ) wr.splice( at, 1 ); else { const w = WISHES.find( ( x ) => x[ 0 ] === k ); wr.push( { k, name: t( w[ 3 ] ), icon: w[ 1 ], em: w[ 2 ], cost: '', date: '' } ); } wErr = false; draw(); return; }
			if ( wo ) { wr.push( { k: 'x' + wr.length, name: '', icon: 'rocket', em: '⭐', cost: '', date: '' } ); wErr = false; draw(); return; }
			if ( wd ) { wr.splice( Number( wd.closest( '.ef-wish-row' ).dataset.n ), 1 ); draw(); return; }
			const b = e.target.closest( '[data-ef-ob]' ), sb = e.target.closest( '[data-ef-set]' );
			if ( sb ) { const li = sb.closest( '[data-ef-row]' ); pick[ li.dataset.efRow ] = sb.dataset.efSet; li.querySelectorAll( 'button' ).forEach( ( x ) => { const on = x === sb; x.classList.toggle( 'on', on ); x.setAttribute( 'aria-pressed', on ); } ); return; }
			if ( ! b ) return;
			if ( b.dataset.efOb === 'skip' ) finish( false );
			else if ( b.dataset.efOb === 'back' ) { i = Math.max( 0, i - 1 ); draw(); }
			else if ( i >= steps.length - 1 ) finish( true ); else { if ( steps[ i ] === 'wishes' && ! commitWishes() ) { wErr = true; draw(); return; } i++; draw(); }
		} );
		ov.addEventListener( 'touchmove', ( e ) => { const m = e.target.closest( '.ef-ob-main' ); if ( ! m || m.scrollHeight <= m.clientHeight + 1 ) e.preventDefault(); }, { passive: false } );
		document.body.appendChild( ov ); document.body.classList.add( 'ef-ob-open' );
		draw();
	};

	/** The robot's bubble is a ticker: a message passes through between dots, then the next one comes. It never changes size, so the card never jumps. */
	const REDUCED = window.matchMedia && window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches, DOTS = '\u00b7 \u00b7 \u00b7 \u00b7 \u00b7';
	const tickNext = ( b ) => {
		if ( ! b.isConnected ) return; const el = b.querySelector( '.ef-tk' ); if ( ! el ) return;
		el.textContent = pickLine( b.dataset.efBubble ); el.onanimationend = null; clearTimeout( b._tkTimer );
		if ( REDUCED ) { b.classList.add( 'still' ); b._tkTimer = setTimeout( () => tickNext( b ), 9000 ); return; }
		el.textContent = DOTS + '   ' + el.textContent + '   ' + DOTS;
		const box = b.querySelector( '.ef-ticker' ), cw = box.clientWidth || 260, tw = el.scrollWidth;
		el.style.animation = 'none'; void el.offsetWidth; el.style.setProperty( '--cw', cw + 'px' );
		el.style.animation = `ef-tick ${ Math.max( 6, ( cw + tw ) / 52 ).toFixed( 1 ) }s linear 1 forwards`;
		el.onanimationend = () => { b._tkTimer = setTimeout( () => tickNext( b ), 350 ); };
	};
	F.tick = tickNext;
	const initTickers = () => document.querySelectorAll( '[data-ef-bubble]:not([data-tk])' ).forEach( ( b ) => { b.dataset.tk = '1'; tickNext( b ); } );
	setInterval( initTickers, 600 ); F.initTickers = initTickers;
	document.addEventListener( 'click', ( e ) => { const b = e.target.closest( '[data-ef-bubble]' ); if ( b ) tickNext( b ); } );

	/** The analysis of several plans together (all of them, or one group): one verdict, who fits and who does not, and what would help. */
	EXA.openEfriendAll = ( group ) => {
		F.view = { k: 'all', group };
		const all = F.all(), list = group ? all.filter( ( f ) => ( f.goal.group || '' ).trim() === group ) : all; if ( ! list.length ) return;
		const sm = F.summary( list ), v = sm.verdict, m = ( c ) => money( c / 100, main() ), bad = sm.firstBad;
		const rows = list.map( ( f ) => `<li role="button" tabindex="0" data-ef-open="${ esc( f.goal.id ) }"><div class="ef-gtop"><span class="ef-mi">${ UI.icon( f.goal.icon || 'plane', 20 ) }</span><div><b>${ esc( f.goal.name ) }</b><small>${ esc( EX.dayName( f.goal.deadline ) ) } · ${ esc( m( f.remaining ) ) }${ f.reserved > 0 ? ' · ' + esc( t( 'efReservedShort', { a: m( f.reserved ) } ) ) : '' }</small></div></div>${ chip( f.verdict ) }</li>` ).join( '' );
		const tips = bad && bad.suggestions ? bad.suggestions.map( ( x ) => `<li><div><b>${ esc( x.kind === 'cut' ? t( 'efCutLabel', { name: EX.catInfo( x.cat ).name } ) : t( 'efPauseLabel', { name: x.name } ) ) }</b></div><span class="ef-gain">+${ esc( m( x.gain ) ) }</span></li>` ).join( '' ) : '';
		const X = `<button type="button" class="ab-btn" data-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button>`;
		const sec = ( em, title, body ) => ( body ? `<section class="ef-psec"><h3 class="ef-h"><span class="ef-sec-em">${ em }</span>${ esc( title ) }</h3>${ body }</section>` : '' );
		const tile = ( em, label, value, cls = '' ) => `<div class="ef-tile ${ cls }"><span class="ef-tile-em" aria-hidden="true">${ em }</span><small>${ esc( label ) }</small><b>${ value }</b></div>`;
		const tiles = `<div class="ef-tiles">${ tile( '🗂️', t( 'efTileHowMany' ), String( sm.n ) ) }${ tile( '💶', t( 'efTileCost' ), esc( m( sm.cost ) ) ) }${ tile( '🏦', t( 'efTileFree' ), esc( m( sm.free ) ), sm.free >= sm.cost ? 'good' : 'bad' ) }${ tile( '📅', t( 'efTileLast' ), esc( EX.dayName( sm.lastDate ) ) ) }</div>`;
		const tp = F.tips( bad || list[ 0 ] );
		UI.openSheet( `<div class="sheet-head"><h2>${ esc( group || t( 'efAllPlans' ) ) }</h2><span class="sp"></span>${ X }</div>
			<div class="sheet-pad ef-sheet"><div class="ef-top">${ F.mascot( v, 84 ) }<div class="ef-bubble"><b>${ esc( pickLine( v ) ) }</b>${ chip( v ) }</div></div>
			${ tiles }<div class="ef-callouts">${ points( [ bad ? t( 'efFirstBad', { name: bad.goal.name } ) : t( 'efAllFits' ) ] ) }</div>
			${ sec( '🏆', t( 'efPrioSection' ), prioNarrative( list ) ) }
			${ sec( '📋', t( 'efPlansByDate' ), `<ul class="ef-list ef-plan-rows">${ rows }</ul>${ points( [ t( 'efOrderNote' ) ] ) }` ) }
			${ sec( '💡', t( 'efTipsTitle' ), tipsHtml( tp ) ) }${ sec( '✂️', t( 'efHelps' ), tips ? `<ul class="ef-list">${ tips }</ul>` : '' ) }
			<p class="muted small ef-disc">ℹ️ ${ esc( t( 'efDisclaimer' ) ) }</p></div>`, { tall: true } );
	};

	/** Anything that changes the numbers (a bill, income, a wallet, the sorting, the plan itself) means a new analysis: an open analysis redraws itself. */
	EX.on( 'change', () => {
		const v = F.view, sheet = document.getElementById( 'sheet' ); if ( ! v || ! sheet || ! sheet.open || ! sheet.querySelector( '.ef-sheet, .ef-pri' ) ) return;
		const sc = sheet.querySelector( '.sheet-scroll' ), y = sc ? sc.scrollTop : 0;
		if ( v.k === 'prio' ) { if ( drag ) return; const sc2 = sheet.querySelector( '.sheet-scroll' ), y2 = sc2 ? sc2.scrollTop : 0; EXA.openEfPriority(); if ( sc2 ) sc2.scrollTop = y2; return; }
		if ( v.k === 'one' ) { if ( S().goals.some( ( g ) => g.id === v.id ) ) EXA.openEfriend( v.id ); else UI.closeSheet(); } else EXA.openEfriendAll( v.group );
		if ( sc ) sc.scrollTop = y;
	} );
	document.addEventListener( 'close', ( e ) => { if ( e.target && e.target.id === 'sheet' ) F.view = null; }, true );

	/* ------------------------------------------------------------------ Its own page: More, eFriend */
	EXA.efriendPage = () => {
		const all = F.all(), byId = {}; all.forEach( ( f ) => { byId[ f.goal.id ] = f; } );
		const plans = F.plans(), m = ( c ) => money( c / 100, main() );
		const row = ( g ) => {
			const f = byId[ g.id ], ready = !! f;
			return `<li class="ef-grow"><div class="ef-gtop">${ f ? F.icon( 32 ) : UI.icon( g.icon || 'target', 28 ) }<div><b>${ esc( g.name ) }</b><small>${ esc( g.deadline ? t( 'efDaysLeft', { n: Math.max( 0, diff( g.deadline, today() ) ) } ) : t( 'efNoDate' ) ) }</small></div>${ f ? chip( f.verdict ) : '' }</div>
				<div class="ef-gacts"><button type="button" class="btn btn-ghost sm" data-ef-edit="${ esc( g.id ) }">${ UI.icon( 'pencil', 18 ) } ${ esc( t( 'efEdit' ) ) }</button>${ ready ? `<button type="button" class="btn btn-primary sm" data-ef-open="${ esc( g.id ) }">${ esc( t( 'efOpen' ) ) }</button>` : `<button type="button" class="btn btn-primary sm" data-ef-try="${ esc( g.id ) }">${ esc( t( 'efAddDate' ) ) }</button>` }</div></li>`;
		};
		const buckets = F.groups().map( ( n ) => ( { name: n, plans: plans.filter( ( g ) => ( g.group || '' ).trim() === n ) } ) ), rest = plans.filter( ( g ) => ! ( g.group || '' ).trim() );
		if ( rest.length ) buckets.push( { name: '', plans: rest } );
		const overview = all.length > 1 ? ( ( sm ) => `<section class="card ef-overview"><div class="ef-top">${ F.icon( 52 ) }<div class="ef-bubble"><b>${ esc( t( 'efOverviewTitle' ) ) }</b>${ chip( sm.verdict ) }<small>${ esc( t( 'efTogether', { a: m( sm.cost ), b: m( sm.free ) } ) ) }</small></div></div><div class="btn-row"><button type="button" class="btn btn-primary" data-ef-all="">${ esc( t( 'efOpen' ) ) }</button></div></section>` )( F.summary( all ) ) : '';
		const section = ( b ) => {
			const list = b.name ? all.filter( ( f ) => ( f.goal.group || '' ).trim() === b.name ) : [];
			const head = b.name || ( buckets.length > 1 ? t( 'efOtherPlans' ) : t( 'efYourGoals' ) );
			const gs = list.length > 1 ? F.summary( list ) : null;
			return `<section class="card"><div class="ef-ghead"><h2>${ esc( head ) }</h2>${ gs ? chip( gs.verdict ) : '' }${ gs ? `<button type="button" class="btn btn-ghost sm" data-ef-all="${ esc( b.name ) }">${ esc( t( 'efAnalysisBtn' ) ) }</button>` : '' }</div><ul class="ef-list">${ b.plans.map( row ).join( '' ) }</ul></section>`;
		};
		const ach = F.achieved(), pastList = F.past(), totalDone = ach.reduce( ( x, g ) => x + EX.cents( g.doneAmount || g.target ), 0 );
		const achievements = ( ach.length || plans.length ) ? `<section class="card ef-ach"><h2>🏆 ${ esc( t( 'efAchTitle' ) ) }</h2>${ ach.length ? points( [ t( 'efAchLine', { n: ach.length, a: m( totalDone ) } ) ] ) + `<ul class="ef-list">${ ach.map( ( g ) => `<li><div><b>${ esc( g.name ) }</b><small>${ esc( EX.dayName( g.doneOn || g.deadline ) ) } · ${ esc( m( EX.cents( g.doneAmount || g.target ) ) ) }</small></div><span class="ef-ach-ic">${ UI.icon( g.icon || 'trophy', 22 ) } ✅</span></li>` ).join( '' ) }</ul>` : points( [ t( 'efAchNone' ) ] ) }</section>` : '';
		const pastHtml = pastList.length ? `<details class="card ef-sec ef-det"><summary><span class="ef-sec-em">🗄️</span><b>${ esc( t( 'efPast' ) ) }</b></summary><ul class="ef-list">${ pastList.map( ( g ) => `<li><div><b>${ esc( g.name ) }</b><small>${ esc( m( EX.cents( g.target ) ) ) }</small></div><button type="button" class="btn btn-ghost sm" data-ef-reopen="${ esc( g.id ) }">${ esc( t( 'efReopen' ) ) }</button></li>` ).join( '' ) }</ul></details>` : '';
		const worst = all.length ? F.summary( all ) : null;
		const askCard = `<section class="card ef-askcard"><div class="ef-top">${ F.icon( 52 ) }<div class="ef-bubble"><b>${ esc( t( 'efAskCardTitle' ) ) }</b>${ esc( t( 'efAskCardText' ) ) }</div></div><div class="btn-row"><button type="button" class="btn btn-primary" data-ef-ask>💬 ${ esc( t( 'efAskGo' ) ) }</button>${ histList().length ? `<button type="button" class="btn btn-ghost" data-ef-hist-open>🕘 ${ esc( t( 'efc_h_title' ) ) }</button>` : '' }</div></section>`;
		const sub = ( EXA.st && EXA.st.efSub ) || '', natural = S().settings.efInstant !== true, ch = F.char();
		const prioCard = all.length > 1 ? `<section class="card"><h2>🏆 ${ esc( t( 'efPrioSection' ) ) }</h2>${ para( 'efPrioTextShort' ) }${ prioList( all ) }<div class="btn-row"><button type="button" class="btn btn-ghost" data-ef-suggest>✨ ${ esc( t( 'efSuggestOrder' ) ) }</button></div></section>` : '';
		const riskCard = all.length ? `<section class="card">${ riskHtml() }</section>` : '';
		const noGoals = `<section class="card"><h2>${ esc( t( 'efYourGoals' ) ) }</h2><p class="muted">${ esc( t( 'efNoGoals' ) ) }</p></section>`;
		const newBtn = `<section class="card"><div class="btn-row"><button type="button" class="btn btn-primary" data-ef-new>${ UI.icon( 'plus', 20 ) } ${ esc( t( 'efNewGoal' ) ) }</button></div></section>`;
		const sortRows = `<section class="card"><div class="list mlist"><button type="button" class="mrow" data-ef-sort>${ UI.ci( 'adjustments-horizontal', 'teal', 40 ) }<span class="mid"><b>${ esc( t( 'efSortTitle' ) ) }</b><small>${ esc( t( 'efSortSub' ) ) }</small></span>${ UI.icon( 'chevron-right', 18 ) }</button></div></section>`;
		const tourRow = `<section class="card"><div class="list mlist"><button type="button" class="mrow" data-ef-intro>${ UI.ci( 'player-play', 'purple', 40 ) }<span class="mid"><b>${ esc( t( 'efReplay' ) ) }</b><small>${ esc( t( 'efReplaySub' ) ) }</small></span>${ UI.icon( 'chevron-right', 18 ) }</button></div></section>`;
		const soundCard = `<section class="card"><label class="fx-row"><span class="mid"><b>${ esc( t( 'efSoundTitle' ) ) }</b><small>${ esc( t( 'efSoundHint' ) ) }</small></span><span class="switch"><input type="checkbox" data-ef-sound${ S().settings.efSound !== false ? ' checked' : '' } aria-label="${ esc( t( 'efSoundTitle' ) ) }"><i></i></span></label></section>`;
		const naturalCard = `<section class="card"><label class="fx-row"><span class="mid"><b>${ esc( t( 'efNaturalTitle' ) ) }</b><small>${ esc( t( 'efNaturalHint' ) ) }</small></span><span class="switch"><input type="checkbox" data-ef-natural${ natural ? ' checked' : '' } aria-label="${ esc( t( 'efNaturalTitle' ) ) }"><i></i></span></label></section>`;
		const charCard = `<section class="card ef-charcard"><h2>${ esc( t( 'efChooseTitle' ) ) }</h2><div class="ef-chars" role="radiogroup" aria-label="${ esc( t( 'efChooseTitle' ) ) }">${ [ 'chip', 'boogie' ].map( ( c ) => `<button type="button" class="ef-char${ ch === c ? ' on' : '' }" data-ef-char="${ c }" role="radio" aria-checked="${ ch === c }"><span class="ef-char-art">${ F.mascotOf( c, 'happy', 96 ) }</span><b>${ esc( CHARS[ c ].name ) }</b><small>${ esc( t( 'efChar_' + c ) ) }</small>${ ch === c ? `<em>✓ ${ esc( t( 'efChosen' ) ) }</em>` : '' }</button>` ).join( '' ) }</div>${ points( [ t( 'efMeetStory1' ), t( 'efMeetStory2' ), t( 'efMeetStory3' ) ] ) }</section>`;
		const back = ( title ) => `<div class="ef-subhead"><button type="button" class="btn btn-ghost sm" data-ef-sub="">← ${ esc( t( 'efHubBack' ) ) }</button><h2>${ esc( title ) }</h2></div>`;
		if ( sub === 'plans' ) return `${ back( t( 'efHubPlans' ) ) }${ overview }${ achievements }${ buckets.length ? buckets.map( section ).join( '' ) : noGoals }${ pastHtml }${ newBtn }`;
		if ( sub === 'rules' ) return `${ back( t( 'efHubRules' ) ) }${ askBanner() ? `<section class="card">${ askBanner() }</section>` : '' }${ prioCard }${ riskCard }${ prioCard || riskCard ? '' : `<section class="card"><p class="muted">${ esc( t( 'efHubRulesNone' ) ) }</p></section>` }`;
		if ( sub === 'moves' ) return `${ back( t( 'efHubMoves' ) ) }${ proposalsHtml() }${ allocCard() }`;
		if ( sub === 'ideas' ) return `${ back( t( 'efHubIdeas' ) ) }${ budIdeasHtml() || `<section class="card"><p class="muted">${ esc( t( 'efHubIdeasNone' ) ) }</p></section>` }${ sortRows }`;
		if ( sub === 'look' ) return `${ back( t( 'efHubLook' ) ) }${ charCard }${ ch === 'boogie' ? `<section class="card"><h2>💡 ${ esc( t( 'efLightTitle' ) ) }</h2><p class="muted small">${ esc( t( 'efLightHint' ) ) }</p>${ F.lightControls() }</section>` : '' }${ naturalCard }${ soundCard }<section class="card ef-page"><div class="ef-top">${ F.mascot( 'happy', 84 ) }<div class="ef-bubble"><b>${ esc( t( 'efMeet' ) ) }</b></div></div>${ para( 'efMeetText' ) }</section>${ tourRow }`;
		// the hub: the way into the chat, then everything else in a few groups
		const hrow = ( id, ic, color, title, subtitle ) => `<button type="button" class="mrow" data-ef-sub="${ id }">${ UI.ci( ic, color, 40 ) }<span class="mid"><b>${ esc( title ) }</b><small>${ esc( subtitle ) }</small></span>${ UI.icon( 'chevron-right', 18 ) }</button>`;
		const al = F.alloc(), modeWord = t( { off: 'efModeOff', suggest: 'efModeSuggest', ask: 'efModeAsk', auto: 'efModeAuto' }[ al.mode || 'off' ] || 'efModeOff' ), pend = props().filter( ( p ) => p.status === 'pending' ).length;
		return `${ askCard }${ pend ? proposalsHtml() : '' }<section class="card"><div class="list mlist">
			${ hrow( 'plans', 'target', 'teal', t( 'efHubPlans' ), plans.length ? t( 'efHubPlansSub', { n: plans.length } ) : t( 'efHubPlansNone' ) ) }
			${ hrow( 'rules', 'adjustments-horizontal', 'amber', t( 'efHubRules' ), t( 'efHubRulesSub' ) ) }
			${ hrow( 'moves', 'coin', 'green', t( 'efHubMoves' ), modeWord ) }
			${ hrow( 'ideas', 'bulb', 'pink', t( 'efHubIdeas' ), t( 'efHubIdeasSub' ) ) }
			${ hrow( 'look', 'mood-smile', 'purple', t( 'efHubLook' ), t( 'efHubLookSub', { name: CHARS[ ch ].name, mode: natural ? t( 'efNaturalOn' ) : t( 'efNaturalOff' ) } ) ) }
		</div></section>`;
	};
	document.addEventListener( 'click', ( e ) => {
		const sb = e.target.closest && e.target.closest( '[data-ef-sub]' ); if ( sb ) { EXA.st.efSub = sb.dataset.efSub; EXA.render(); const v = document.querySelector( '#view' ); if ( v ) v.scrollTop = 0; window.scrollTo( 0, 0 ); return; }
		const cb = e.target.closest && e.target.closest( '[data-ef-char]' ); if ( cb ) { F.setChar( cb.dataset.efChar ); return; }
	} );
	document.addEventListener( 'change', ( e ) => { if ( e.target.matches && e.target.matches( '[data-ef-natural]' ) ) { S().settings.efInstant = ! e.target.checked; S().settings.u = Date.now(); EX.save(); } } );
	EXA.efriendConvert = ( g ) => ( on() && ! isPlan( g ) ? `<button type="button" class="btn btn-ghost wide" data-ef-convert="${ esc( g.id ) }">🤖 ${ esc( t( 'efConvert' ) ) }</button><span class="ef-hint">${ para( 'efConvertHint' ) }</span>` : '' );
	EXA.efriendAsk = ( g ) => ( on() && ! isPlan( g ) ? `<button type="button" class="btn btn-ghost sm" data-ef-fromgoal="${ esc( g.id ) }">🤖 ${ esc( t( 'efAskEf' ) ) }</button>` : '' );
	EXA.efriendNudge = () => ( on() && ! F.plans().length ? `<div class="ef-ask ef-nudge"><span class="ef-ask-em">🤖</span><span>${ rich( t( 'efNudgeText' ) ) }</span><button type="button" class="btn btn-primary sm" data-ef-nudge>${ esc( t( 'efNudgeBtn' ) ) }</button></div>` : '' );
	/** The eFriend panel on the More page: the robot, what it is doing, and a way in. */
	EXA.efriendPanel = () => {
		const l = F.all(), v = l.length ? F.summary( l ).verdict : null;
		const sub = l.length ? t( 'efPanelCoaching', { n: l.length } ) : t( 'efPanelNone' );
		return `<button type="button" class="card ef-panel" data-more="efriend" aria-label="eFriend">${ F.mascot( v || 'happy', 56 ) }<span class="mid"><b>eFriend</b><small>${ esc( sub ) }</small></span>${ UI.icon( 'chevron-right', 20 ) }</button>`;
	};
	document.addEventListener( 'click', ( e ) => {
		if ( e.target.closest( '[data-ef-new]' ) ) { EXA.openEfPlan(); return; }
		if ( e.target.closest( '[data-ef-sort]' ) ) { EXA.efriendOnboard( null, 'sort' ); return; }
		if ( e.target.closest( '[data-ef-intro]' ) ) { EXA.efriendOnboard(); return; }
		const all = e.target.closest( '[data-ef-all]' ); if ( all ) { e.preventDefault(); e.stopImmediatePropagation(); const grp = all.dataset.efAll; UI.closeSheet && UI.closeSheet(); setTimeout( () => EXA.openEfriendAll( grp ), 200 ); }
	}, true );
	document.addEventListener( 'change', ( e ) => { if ( e.target.matches && e.target.matches( '[data-ef-sound]' ) ) { S().settings.efSound = e.target.checked; S().settings.u = Date.now(); EX.save(); if ( e.target.checked ) F.sound( 'smile' ); } } );
	document.addEventListener( 'keydown', ( e ) => { const r = e.target.closest && e.target.closest( '[data-ef-open][role=button]' ); if ( r && ( e.key === 'Enter' || e.key === ' ' ) ) { e.preventDefault(); r.click(); } } );

	/** Your usual month without a plan in mind: spending, income and how much history there is. Used by the cushion slider and the "add your salary" prompts. */
	F.baseline = () => {
		const now = today(), txs = S().txs.filter( ( x ) => x.type !== 'transfer' && ! x.goalId && ! x.efPlan ), first = txs.reduce( ( m, x ) => ( x.date < m ? x.date : m ), now ), win = Math.max( 14, Math.min( 90, diff( now, first ) + 1 ) ), since = addDays( now, -win );
		const inWin = txs.filter( ( x ) => x.date >= since && x.date <= now ), spend = inWin.filter( ( x ) => x.type === 'expense' && ! x.billId ).reduce( ( s, x ) => s + centsOf( x.amount, EX.txCurrency( x ) ), 0 ), other = inWin.filter( ( x ) => x.type === 'income' && ! x.incomeId ).reduce( ( s, x ) => s + centsOf( x.amount, EX.txCurrency( x ) ), 0 );
		const m30 = addDays( now, 62 ), per = 62 / 30; let b30 = 0, i30 = 0;
		S().bills.filter( ( b ) => ! b.done && b.next ).forEach( ( b ) => { EX.occurrences( b, m30 ).forEach( () => { b30 += centsOf( b.amount, b.currency ) / per; } ); } );
		S().incomes.filter( ( i ) => ! i.done && i.next ).forEach( ( i ) => { EX.occurrences( i, m30 ).forEach( () => { i30 += centsOf( i.amount, i.currency ) / per; } ); } );
		return { habitPD: spend / win, otherPD: ( other / win ) * 0.7, billsMonth: b30, monthly: Math.round( ( spend / win ) * 30 + b30 ), incomeMonthly: Math.round( i30 + ( other / win ) * 0.7 * 30 ), hasIncome: S().incomes.length > 0 || other > 0, history: Math.max( 1, diff( now, first ) + 1 ) };
	};
	/* ------------------------------------------------------------------ Priorities: drag to rank, how careful, and the question "which matters most?" */
	const prioList = ( list ) => `<ol class="ef-prio" data-ef-prio-list>${ list.map( ( f, i ) => `<li class="ef-prio-i" data-id="${ esc( f.goal.id ) }"><button type="button" class="ef-grip" data-grip aria-label="${ esc( t( 'efDrag' ) ) }">\u2807</button><span class="ef-rank">${ i === 0 ? '🏆' : i + 1 }</span><div class="ef-prio-t"><b>${ esc( f.goal.name ) }</b><small>${ esc( money( f.target / 100, main() ) ) } · ${ esc( EX.dayName( f.goal.deadline ) ) }</small></div>${ chip( f.verdict ) }<span class="ef-ud"><button type="button" data-up aria-label="${ esc( t( 'efUp' ) ) }">▲</button><button type="button" data-down aria-label="${ esc( t( 'efDown' ) ) }">▼</button></span></li>` ).join( '' ) }</ol>`;
	/** The cushion slider: how many months of your usual spending should still be left after buying. One continuous track that blends from red (risky) through green (balanced) to blue (very safe); the thumb takes the colour of where it is. */
	const STOPS = [ [ 0, 0, [ 217, 45, 32 ] ], [ 20, 0.5, [ 240, 140, 0 ] ], [ 40, 1, [ 22, 163, 74 ] ], [ 60, 2, [ 20, 160, 168 ] ], [ 80, 3, [ 37, 99, 235 ] ], [ 100, 6, [ 30, 58, 138 ] ] ];
	const lerp = ( a, b, k ) => a + ( b - a ) * k;
	const segAt = ( p ) => { for ( let i = 1; i < STOPS.length; i++ ) if ( p <= STOPS[ i ][ 0 ] ) return [ STOPS[ i - 1 ], STOPS[ i ] ]; return [ STOPS[ 4 ], STOPS[ 5 ] ]; };
	const monthsAt = ( p ) => { const [ a, b ] = segAt( p ), k = ( p - a[ 0 ] ) / ( b[ 0 ] - a[ 0 ] ); return Math.round( lerp( a[ 1 ], b[ 1 ], k ) * 4 ) / 4; };
	const posOf = ( m ) => { for ( let i = 1; i < STOPS.length; i++ ) if ( m <= STOPS[ i ][ 1 ] ) { const a = STOPS[ i - 1 ], b = STOPS[ i ]; return lerp( a[ 0 ], b[ 0 ], ( m - a[ 1 ] ) / ( b[ 1 ] - a[ 1 ] ) ); } return 100; };
	const colorAt = ( p ) => { const [ a, b ] = segAt( p ), k = ( p - a[ 0 ] ) / ( b[ 0 ] - a[ 0 ] ); return 'rgb(' + [ 0, 1, 2 ].map( ( i ) => Math.round( lerp( a[ 2 ][ i ], b[ 2 ][ i ], k ) ) ).join( ',' ) + ')'; };
	const riskWord = ( p ) => { const near = STOPS.reduce( ( m, x ) => ( Math.abs( x[ 0 ] - p ) < Math.abs( m[ 0 ] - p ) ? x : m ) ); return t( [ 'efRiskRisky', 'efRiskBold', 'efRiskBalanced', 'efRiskCareful', 'efRiskSafe', 'efRiskVerySafe' ][ STOPS.indexOf( near ) ] ); };
	const monthsShort = ( n ) => ( Math.round( n * 10 ) / 10 ).toLocaleString( EX.loc(), { maximumFractionDigits: 1 } ) + ' ' + t( Math.abs( n - 1 ) < 0.05 ? 'efMonthWord' : 'efMonthsWord' );
	const monthsText = ( n ) => t( 'efMonthsN', { n: ( Math.round( n * 10 ) / 10 ).toLocaleString( EX.loc(), { maximumFractionDigits: 1 } ), one: Math.abs( n - 1 ) < 0.05 ? 1 : 0 } );
	const riskLines = ( p, m ) => { const b = F.baseline(), a = money( Math.round( m * b.monthly ) / 100, main() ); return [ m < 0.1 ? t( 'efCushionZero', { word: riskWord( p ) } ) : t( 'efCushionHint', { word: riskWord( p ), a, m: monthsText( m ), s: money( b.monthly / 100, main() ) } ), t( 'efAccuracy', { d: b.history } ) ].concat( b.hasIncome ? [] : [ t( 'efNoIncomeAsk' ) ] ); };
	const riskHtml = () => {
		const m = F.cushion(), p = Math.round( posOf( m ) );
		return `<div class="ef-risk" style="--c:${ colorAt( p ) };--p:${ p }%"><div class="ef-risk-h"><b>🎚️ ${ esc( t( 'efRiskTitle' ) ) }</b><span class="ef-risk-val">${ esc( riskWord( p ) ) } · ${ esc( monthsShort( m ) ) }</span></div><input type="range" class="ef-grad" data-ef-margin min="0" max="100" step="1" value="${ p }" aria-label="${ esc( t( 'efRiskTitle' ) ) }"><div class="ef-risk-ends"><span class="e0">${ esc( t( 'efRiskRisky' ) ) }</span><span class="e40">${ esc( t( 'efRiskBalanced' ) ) }</span><span class="e100">${ esc( t( 'efRiskVerySafe' ) ) }</span></div><div class="ef-risk-hint">${ points( riskLines( p, m ) ) }${ ( ( sc ) => sc && Math.abs( sc.m - m ) >= 0.5 ? `<div class="ef-callouts">${ points( [ t( 'efCushSteady', { m: monthsText( sc.m ), s: sc.swing } ) ] ) }<button type="button" class="btn btn-ghost sm" data-ef-cushuse="${ sc.m }">${ esc( t( 'efLimUse' ) ) }</button></div>` : '' )( F.suggestCushion2() ) }${ F.baseline().hasIncome ? '' : `<button type="button" class="btn btn-ghost sm" data-ef-income>💶 ${ esc( t( 'efAddIncome' ) ) }</button>` }</div></div>`;
	};
	/** eFriend rearranges your plans and moves the cushion slider in front of you, instead of everything jumping at once. */
	const animateSuggest = ( both ) => {
		const order = F.suggestOrder(), c = both ? F.suggestCushion( order ) : null, ol = document.querySelector( '[data-ef-prio-list]' ), slow = reduceMotion() ? 0 : 1;
		if ( ol ) {
			const rows = [ ...ol.children ], first = new Map( rows.map( ( li ) => [ li, li.getBoundingClientRect().top ] ) );
			order.forEach( ( id ) => { const li = rows.find( ( x ) => x.dataset.id === id ); if ( li ) ol.appendChild( li ); } ); renumber( ol );
			if ( slow ) rows.forEach( ( li, i ) => { const d = first.get( li ) - li.getBoundingClientRect().top; if ( ! d ) return; li.classList.add( 'ef-moving' ); li.style.transition = 'none'; li.style.transform = `translateY(${ d }px)`; requestAnimationFrame( () => requestAnimationFrame( () => { li.style.transition = `transform ${ 0.7 + i * 0.08 }s cubic-bezier(.2,.8,.2,1)`; li.style.transform = ''; } ) ); setTimeout( () => { li.style.transition = ''; li.classList.remove( 'ef-moving' ); }, 1200 ); } );
		}
		const r = document.querySelector( '[data-ef-margin]' ); let delay = 0;
		if ( r && c ) {
			const from = Number( r.value ), to = Math.round( posOf( c.m ) ), t0 = performance.now(), D = 1100;
			const step = ( now ) => { const k = slow ? Math.min( 1, ( now - t0 ) / D ) : 1, e = 1 - Math.pow( 1 - k, 3 ); r.value = String( Math.round( from + ( to - from ) * e ) ); r.dispatchEvent( new Event( 'input', { bubbles: true } ) ); if ( k < 1 ) requestAnimationFrame( step ); };
			setTimeout( () => requestAnimationFrame( step ), slow ? 350 : 0 ); delay = slow ? 1500 : 0;
		}
		setTimeout( () => F.applySuggest( both ), Math.max( delay, slow ? 1000 : 0 ) );
	};
	const renumber = ( ol ) => ol.querySelectorAll( ':scope > li .ef-rank' ).forEach( ( r, i ) => { r.textContent = i === 0 ? '🏆' : String( i + 1 ); } );
	const commitOrder = ( ol ) => F.setOrder( [ ...ol.querySelectorAll( ':scope > li' ) ].map( ( li ) => li.dataset.id ) );
	let drag = null, lp = null;
	/** Dragging a plan to a new place: from the grip with a finger or mouse, or by pressing and holding anywhere on the row (a quick swipe still scrolls). */
	const startDrag = ( li ) => { drag = { li, ol: li.parentNode }; li.classList.add( 'drag' ); try { UI.haptic && UI.haptic(); } catch ( x ) { /* ignore */ } };
	const moveDrag = ( y ) => { if ( ! drag ) return; const sc = drag.ol.closest( '.sheet-scroll, .ef-ob-main' ); if ( sc ) { const r = sc.getBoundingClientRect(); if ( y < r.top + 70 ) sc.scrollTop -= 12; else if ( y > r.bottom - 70 ) sc.scrollTop += 12; } const sib = [ ...drag.ol.children ].filter( ( x ) => x !== drag.li ), next = sib.find( ( x ) => { const r = x.getBoundingClientRect(); return y < r.top + r.height / 2; } ); if ( next ) { if ( drag.li.nextSibling !== next ) drag.ol.insertBefore( drag.li, next ); } else if ( drag.ol.lastElementChild !== drag.li ) drag.ol.appendChild( drag.li ); renumber( drag.ol ); };
	const endDrag = () => { if ( ! drag ) return; const d = drag; drag = null; d.li.classList.remove( 'drag' ); commitOrder( d.ol ); };
	document.addEventListener( 'pointerdown', ( e ) => { const g = e.target.closest && e.target.closest( '[data-grip]' ); if ( ! g ) return; e.preventDefault(); startDrag( g.closest( 'li' ) ); try { g.setPointerCapture( e.pointerId ); } catch ( x ) { /* ignore */ } } );
	document.addEventListener( 'pointermove', ( e ) => { if ( drag && ! lp ) moveDrag( e.clientY ); } );
	document.addEventListener( 'pointerup', () => { if ( ! lp ) endDrag(); } ); document.addEventListener( 'pointercancel', () => { if ( ! lp ) endDrag(); } );
	document.addEventListener( 'touchstart', ( e ) => {
		const li = e.target.closest && e.target.closest( '.ef-prio-i' ); if ( ! li || e.target.closest( '[data-up],[data-down],[data-grip]' ) ) return;
		const t0 = e.touches[ 0 ]; lp = { li, x: t0.clientX, y: t0.clientY, on: false }; lp.timer = setTimeout( () => { if ( lp ) { lp.on = true; startDrag( li ); } }, 300 );
	}, { passive: true } );
	document.addEventListener( 'touchmove', ( e ) => {
		if ( ! lp ) return; const t0 = e.touches[ 0 ];
		if ( ! lp.on ) { if ( Math.abs( t0.clientY - lp.y ) > 10 || Math.abs( t0.clientX - lp.x ) > 10 ) { clearTimeout( lp.timer ); lp = null; } return; } // moved before the hold: it is a scroll
		e.preventDefault(); moveDrag( t0.clientY );
	}, { passive: false } );
	const endTouch = () => { if ( ! lp ) return; clearTimeout( lp.timer ); const was = lp.on; lp = null; if ( was ) endDrag(); };
	document.addEventListener( 'touchend', endTouch ); document.addEventListener( 'touchcancel', endTouch );
	document.addEventListener( 'click', ( e ) => {
		const up = e.target.closest && e.target.closest( '[data-up],[data-down]' ); if ( up ) { const li = up.closest( 'li' ), ol = li.parentNode; if ( up.hasAttribute( 'data-up' ) ) { if ( li.previousElementSibling ) ol.insertBefore( li, li.previousElementSibling ); } else if ( li.nextElementSibling ) ol.insertBefore( li.nextElementSibling, li ); renumber( ol ); commitOrder( ol ); return; }
		if ( e.target.closest( '[data-ef-prio]' ) ) { e.preventDefault(); UI.closeSheet && UI.closeSheet(); setTimeout( () => EXA.openEfPriority(), 220 ); return; }
		if ( e.target.closest( '[data-ef-suggest]' ) ) { EXA.efSuggestOpen(); return; }
		if ( e.target.closest( '[data-ef-limfill]' ) ) { if ( F.pendingFill ) limFill( F.pendingFill, true ); const bx = document.querySelector( '.ef-lim-fill' ); if ( bx ) bx.remove(); return; }
		if ( e.target.closest( '[data-ef-limuse]' ) ) { const sg = F.suggestLimits(); if ( sg ) limFill( sg, false ); const b = e.target.closest( '[data-ef-limuse]' ); if ( b && b.parentNode ) b.parentNode.remove(); return; }
		const lm = e.target.closest( '[data-ef-lowmove]' ); if ( lm ) { const [ kind, id ] = lm.dataset.efLowmove.split( ':' ); if ( kind === 'bill' ) { const b = S().bills.find( ( x ) => x.id === id ); if ( b && EXA.openBill ) EXA.openBill( b ); } else { const g = S().goals.find( ( x ) => x.id === id ); if ( g ) EXA.openEfPlan( g ); } return; }
		const lx = e.target.closest( '[data-ef-lowx]' ); if ( lx ) { S().device.efLowDismiss = lx.dataset.efLowx; try { EX.persist(); } catch ( x ) { /* ignore */ } const bx = lx.closest( '.ef-low' ); if ( bx ) bx.remove(); return; }
		const ba = e.target.closest( '[data-ef-budadd]' ); if ( ba ) { const [ cat, amt ] = ba.dataset.efBudadd.split( ':' ); F.addBudgets( [ { cat, amount: Number( amt ) } ] ); return; }
		if ( e.target.closest( '[data-ef-budall]' ) ) { F.addBudgets( F.budgetIdeas() ); return; }
		const cu = e.target.closest( '[data-ef-cushuse]' ); if ( cu ) { S().settings.efCushion = Number( cu.dataset.efCushuse ); S().settings.u = Date.now(); EX.save(); return; }
		const sg = e.target.closest( '[data-ef-sug]' ); if ( sg ) { const back = F.view && F.view.k === 'prio', both = sg.dataset.efSug === 'both'; if ( back ) { EXA.openEfPriority(); setTimeout( () => animateSuggest( both ), 600 ); } else { UI.closeSheet(); setTimeout( () => animateSuggest( both ), 450 ); } return; }
		if ( e.target.closest( '[data-ef-prio-done]' ) ) { S().settings.efAsked = F.sig(); S().settings.u = Date.now(); EX.save(); UI.closeSheet(); }
	} );
	document.addEventListener( 'input', ( e ) => { const r = e.target.matches && e.target.matches( '[data-ef-margin]' ) ? e.target : null; if ( ! r ) return; const p = Number( r.value ), m = monthsAt( p ), box = r.closest( '.ef-risk' ); box.style.setProperty( '--c', colorAt( p ) ); box.style.setProperty( '--p', p + '%' ); box.querySelector( '.ef-risk-val' ).textContent = riskWord( p ) + ' · ' + monthsShort( m ); const hint = box.querySelector( '.ef-risk-hint' ), btn = hint.querySelector( 'button' ); hint.innerHTML = points( riskLines( p, m ) ); if ( btn ) hint.appendChild( btn ); } );
	document.addEventListener( 'change', ( e ) => { const li = e.target.matches && e.target.matches( '[data-lim]' ) ? e.target : null; if ( li ) { const L = F.limits(), k = li.dataset.lim, v = L[ k ], old = document.querySelector( '.ef-lim-fill' ); if ( old ) old.remove(); if ( v && ! F.limitsSet().other( k ) ) { const month = k === 'month' ? v : k === 'week' ? v * 30 / 7 : v * 30, sg = F.limitsFrom( month ); sg[ k ] = 0; F.pendingFill = sg; const box = document.createElement( 'div' ); box.className = 'ef-callouts ef-lim-fill'; box.innerHTML = points( [ t( 'efLimFillOthers' ) ] ) + `<button type="button" class="btn btn-ghost sm" data-ef-limfill>${ esc( t( 'efLimUse' ) ) }</button>`; const host = document.querySelector( '.ef-lim-note' ); if ( host ) host.after( box ); } return; } if ( e.target.matches && e.target.matches( '[data-ef-margin]' ) ) { S().settings.efCushion = monthsAt( Number( e.target.value ) ); S().settings.u = Date.now(); EX.save(); } } );
	/** "Let eFriend suggest": the person chooses whether it may touch only the order, or the order and the safety cushion. */
	EXA.efSuggestOpen = () => {
		const c = F.suggestCushion( F.suggestOrder() ), X = `<button type="button" class="ab-btn" data-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button>`;
		UI.openSheet( `<div class="sheet-head">${ X }<h2 id="sheetTitle">✨ ${ esc( t( 'efSuggestOrder' ) ) }</h2><span class="sp"></span></div><div class="sheet-pad ef-sug"><div class="ef-top">${ F.mascot( 'happy', 64 ) }<div class="ef-bubble"><b>${ esc( t( 'efSugAsk' ) ) }</b></div></div>
			<button type="button" class="ef-sugopt" data-ef-sug="order"><b>📋 ${ esc( t( 'efSugOrder' ) ) }</b>${ points( [ t( 'efSugOrderText' ) ] ) }</button>
			<button type="button" class="ef-sugopt ef-sugbest" data-ef-sug="both"><b>🛡️ ${ esc( t( 'efSugBoth' ) ) }</b>${ points( [ t( 'efSugBothText' ), t( 'efSugBothCushion', { a: monthsText( c.was ), b: monthsText( c.m ) } ), t( 'efSugBothFit', { n: c.fits, all: c.n } ) ] ) }</button></div>`, { cls: 'small' } );
	};
	EXA.openEfPriority = () => {
		const list = F.all(); if ( ! list.length ) return; F.view = { k: 'prio' };
		const X = `<button type="button" class="ab-btn" data-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button>`, many = list.length > 1;
		UI.openSheet( `<div class="sheet-head">${ X }<h2 id="sheetTitle">${ esc( t( 'efPrioTitle' ) ) }</h2><span class="sp"></span></div>
			<div class="sheet-pad ef-pri"><div class="ef-top">${ F.mascot( F.conflict() ? 'tight' : 'happy', 72 ) }<div class="ef-bubble"><b>${ esc( t( many ? 'efPrioAsk' : 'efPrioOne' ) ) }</b></div></div>
			${ para( many ? 'efPrioText' : 'efPrioTextOne' ) }${ many ? prioList( list ) + `<div class="btn-row"><button type="button" class="btn btn-ghost" data-ef-suggest>✨ ${ esc( t( 'efSuggestOrder' ) ) }</button></div>` : '' }
			${ riskHtml() }<div class="btn-row"><button type="button" class="btn btn-primary wide" data-ef-prio-done>${ esc( t( 'efPrioDone' ) ) }</button></div></div>`, { tall: true } );
	};
	/** The "who comes first" part of the combined analysis: the top priority, who is safe, who is at risk, and what dropping one plan would do. */
	const prioNarrative = ( list ) => {
		if ( list.length < 2 ) return '';
		const g = { safe: [], fits: [], risk: [], no: [] }; list.forEach( ( f ) => g[ F.status( f.verdict ) ].push( f ) );
		const names = ( a ) => a.map( ( f ) => '**' + f.goal.name + '**' ).join( ', '), top = list[ 0 ], lines = [ t( 'efPrioTop', { name: top.goal.name, n: list.length } ) + ' ' + t( 'efPrioTopIs_' + F.status( top.verdict ) ) ];
		if ( g.safe.length ) lines.push( t( 'efPrioSafe', { names: names( g.safe ) } ) ); if ( g.fits.length ) lines.push( t( 'efPrioFits', { names: names( g.fits ) } ) ); if ( g.risk.length ) lines.push( t( 'efPrioRisk', { names: names( g.risk ) } ) ); if ( g.no.length ) lines.push( t( 'efPrioNo', { names: names( g.no ) } ) );
		const wi = F.whatIf( list ); if ( wi ) lines.push( wi.drop ? t( 'efWhatIfDrop', { drop: wi.drop.name, plan: wi.plan.goal.name } ) : t( 'efWhatIfLater', { plan: wi.plan.goal.name } ) );
		return points( lines ) + prioList( list ) + `<div class="btn-row"><button type="button" class="btn btn-ghost" data-ef-prio>${ UI.icon( 'adjustments-horizontal', 18 ) } ${ esc( t( 'efPrioChange' ) ) }</button></div>`;
	};

	/* ------------------------------------------------------------------ When the date arrives: did you make it? */
	EXA.efriendBadge = () => '<svg class="ef-txbadge" viewBox="0 0 24 24" width="18" height="18" role="img" aria-label="eFriend"><title>eFriend</title><rect x="3" y="5" width="18" height="14" rx="6" fill="#fff" stroke="#8f9bb2"/><rect x="6" y="8" width="12" height="8" rx="4" fill="#13171f"/><circle cx="10" cy="12" r="1.4" fill="#9ff3e6"/><circle cx="14" cy="12" r="1.4" fill="#9ff3e6"/></svg>';
	const CAT_FOR_ICON = { plane: 'leisure', beach: 'leisure', car: 'transport', home: 'housing', school: 'education', rocket: 'leisure', trophy: 'leisure' };
	let dueOpen = false;
	EXA.efriendDue = ( forceId ) => {
		if ( dueOpen || document.querySelector( '.ef-ob' ) ) return;
		const queue = forceId ? [ forceId ] : F.due().map( ( g ) => g.id ); if ( ! queue.length ) return;
		let idx = 0, view = 'ask', err = '', made = null; dueOpen = true;
		const ov = document.createElement( 'div' ); ov.className = 'ef-ob ef-due'; ov.setAttribute( 'role', 'dialog' ); ov.setAttribute( 'aria-modal', 'true' ); ov.setAttribute( 'aria-label', 'eFriend' );
		const cur = () => S().goals.find( ( g ) => g.id === queue[ idx ] );
		const close = () => { ov.remove(); document.body.classList.remove( 'ef-ob-open' ); dueOpen = false; EXA.render(); };
		const nextPlan = () => { idx++; view = 'ask'; err = ''; if ( idx >= queue.length || ! cur() ) close(); else draw(); };
		const wallets = () => { const g = cur(), ws = EX.writableAccounts(), pick = ws.filter( ( w ) => ( g.wallets || [] ).includes( w.id ) ); return pick.length ? pick : ws; };
		const draw = () => {
			const g = cur(); if ( ! g ) { close(); return; }
			const head = `<div class="ef-ob-head"><span></span>${ view === 'ask' ? `<button type="button" class="btn btn-ghost sm" data-due="later">${ esc( t( 'efDueLater' ) ) }</button>` : '' }</div>`;
			let main = '', foot = '';
			if ( view === 'ask' ) main = `<div class="ef-hop on">${ F.mascot( 'cheer', 120 ) }</div><h2>${ esc( t( 'efDueTitle' ) ) }</h2><p class="ef-due-name">${ UI.icon( g.icon || 'plane', 22 ) } <b>${ esc( g.name ) }</b> · ${ esc( EX.dayName( g.deadline ) ) }</p>${ para( 'efDueText', { name: g.name } ) }${ ( () => { const c = F.forecast( Object.assign( {}, g, { deadline: addDays( today(), 1 ) } ) ), m = ( x ) => money( x / 100, main_() ); if ( ! c || c.done || c.left == null ) return ''; const a = m( Math.abs( c.left ) ), mo = c.leftMonths == null ? '' : monthsText( Math.abs( c.leftMonths ) ), good = c.left >= c.cushion, er = good ? undefined : F.earliest( g, 0 ); return `<div class="ef-callouts">${ points( [ good ? t( 'efDueGood', { a, m: mo } ) : c.left >= 0 ? t( 'efDueTight', { a, m: mo } ) : t( 'efDueShort', { a } ) ].concat( er ? [ t( 'efEarliest', { d: EX.dayName( er ) } ) ] : er === null ? [ t( 'efEarliestNone' ) ] : [] ) ) }</div>`; } )() }<div class="ef-due-btns"><button type="button" class="btn btn-primary wide" data-due="yes">${ esc( t( 'efDueYes' ) ) }</button><button type="button" class="btn btn-ghost wide" data-due="move">${ esc( t( 'efDueMove' ) ) }</button><button type="button" class="btn btn-ghost wide" data-due="drop">${ esc( t( 'efDueDrop' ) ) }</button></div>`;
			else if ( view === 'yes' ) { const cats = EX.catList( 'expense' ), def = CAT_FOR_ICON[ g.icon ] || 'shopping'; main = `<div class="ef-hop on">${ F.mascot( 'cheer', 90 ) }</div><h2>${ esc( t( 'efYesTitle' ) ) }</h2>${ para( 'efYesText' ) }<div class="ef-due-form"><label class="f"><span>${ esc( t( 'efYesCost' ) ) } (${ esc( main_() ) })</span><input id="efDueCost" inputmode="decimal" autocomplete="off" value="${ esc( g.target ) }"></label><div class="grid2"><label class="f"><span>${ esc( t( 'efYesDate' ) ) }</span><input id="efDueDate" type="date" max="${ today() }" value="${ g.deadline <= today() ? g.deadline : today() }"></label><label class="f"><span>${ esc( t( 'efYesWallet' ) ) }</span><select id="efDueWallet">${ wallets().map( ( w ) => `<option value="${ esc( w.id ) }">${ esc( EX.accountName( w ) ) }</option>` ).join( '' ) }</select></label></div><label class="f"><span>${ esc( t( 'efYesCategory' ) ) }</span><select id="efDueCat">${ cats.map( ( c ) => `<option value="${ esc( c.key ) }"${ c.key === def ? ' selected' : '' }>${ esc( c.name ) }</option>` ).join( '' ) }</select></label>${ err ? `<p class="err">${ esc( err ) }</p>` : '' }</div>`; foot = `<button type="button" class="btn btn-ghost" data-due="back">${ esc( t( 'back' ) ) }</button><button type="button" class="btn btn-primary" data-due="add">${ esc( t( 'efYesAdd' ) ) }</button>`; }
			else if ( view === 'done' ) main = `<div class="ef-confetti" aria-hidden="true">${ '🎉✨🎊🥳🎈'.match( /./gu ).concat( '🎉✨🎊🥳🎈'.match( /./gu ) ).map( ( c, n ) => `<i style="--n:${ n }">${ c }</i>` ).join( '' ) }</div><div class="ef-hop on">${ F.mascot( 'cheer', 130 ) }</div><h2>${ esc( t( 'efDoneTitle' ) ) }</h2><p class="ef-due-name">${ UI.icon( g.icon || 'plane', 22 ) } <b>${ esc( g.name ) }</b></p>${ para( 'efDoneText' ) }`;
			else if ( view === 'move' ) { main = `<div class="ef-hop on">${ F.mascot( 'happy', 90 ) }</div><h2>${ esc( t( 'efMoveTitle' ) ) }</h2>${ para( 'efMoveText' ) }<div class="ef-due-form"><div class="grid2"><label class="f"><span>${ esc( t( 'efPlanDate' ) ) }</span><input id="efMoveDate" type="date" min="${ addDays( today(), 1 ) }" value="${ F.earliest( g, 0 ) || addDays( today(), 30 ) }"></label><label class="f"><span>${ esc( t( 'efPlanCost' ) ) } (${ esc( main_() ) })</span><input id="efMoveCost" inputmode="decimal" autocomplete="off" value="${ esc( g.target ) }"></label></div>${ err ? `<p class="err">${ esc( err ) }</p>` : '' }</div>`; foot = `<button type="button" class="btn btn-ghost" data-due="back">${ esc( t( 'back' ) ) }</button><button type="button" class="btn btn-primary" data-due="moveit">${ esc( t( 'efMoveBtn' ) ) }</button>`; }
			else if ( view === 'drop' ) { main = `<div class="ef-hop on">${ F.mascot( 'meh', 90 ) }</div><h2>${ esc( t( 'efDropTitle' ) ) }</h2>${ para( 'efDropText' ) }`; foot = `<button type="button" class="btn btn-ghost" data-due="back">${ esc( t( 'back' ) ) }</button><button type="button" class="btn btn-primary" data-due="dropit">${ esc( t( 'efDropYes' ) ) }</button>`; }
			if ( view === 'done' ) foot = `<span></span><button type="button" class="btn btn-primary" data-due="next">${ esc( t( 'efDoneBtn' ) ) }</button>`;
			ov.innerHTML = `${ head }<div class="ef-ob-main ef-due-main">${ main }</div>${ foot ? `<div class="ef-ob-foot">${ foot }</div>` : '' }`;
			if ( view === 'done' ) F.sound( 'smile' );
		};
		const main_ = () => main();
		ov.addEventListener( 'click', ( e ) => {
			const b = e.target.closest( '[data-due]' ); if ( ! b ) return; const act = b.dataset.due, g = cur(); if ( ! g && act !== 'later' ) return;
			if ( act === 'later' ) { const sn = S().settings.efSnooze = S().settings.efSnooze || {}; queue.forEach( ( id ) => { sn[ id ] = today(); } ); try { EX.persist(); } catch ( x ) { /* ignore */ } close(); }
			else if ( [ 'yes', 'move', 'drop' ].includes( act ) ) { view = act; err = ''; draw(); }
			else if ( act === 'back' ) { view = 'ask'; err = ''; draw(); }
			else if ( act === 'next' ) nextPlan();
			else if ( act === 'add' ) {
				const cost = num( ov.querySelector( '#efDueCost' ).value ), date = ov.querySelector( '#efDueDate' ).value, acc = ov.querySelector( '#efDueWallet' ).value, cat = ov.querySelector( '#efDueCat' ).value;
				if ( ! ( cost > 0 ) ) { err = t( 'efNeedCost' ); draw(); return; } if ( ! date || date > today() ) { err = t( 'efYesDateErr' ); draw(); return; } if ( ! acc ) { err = t( 'efNeedWallet' ); draw(); return; }
				const tx = { id: EX.uid(), type: 'expense', amount: String( cost ), category: cat, account: acc, date, name: g.name, efPlan: g.id };
				S().txs.push( tx ); g.state = 'done'; g.doneOn = date; g.doneAmount = String( cost ); g.txId = tx.id; S().settings.u = Date.now(); EX.save(); view = 'done'; draw();
			} else if ( act === 'moveit' ) {
				const nd = ov.querySelector( '#efMoveDate' ).value, nc = num( ov.querySelector( '#efMoveCost' ).value );
				if ( ! nd || nd <= today() ) { err = t( 'efNeedFuture' ); draw(); return; } if ( ! ( nc > 0 ) ) { err = t( 'efNeedCost' ); draw(); return; }
				const bef = F.measure(), ch = [ [ 'date', g.deadline, nd ] ]; if ( String( g.target ) !== String( nc ) ) ch.push( [ 'cost', g.target, String( nc ) ] );
				g.deadline = nd; g.target = String( nc ); const sn = S().settings.efSnooze; if ( sn ) delete sn[ g.id ]; F.logChange( bef, ch, [ g.id ] ); EX.save(); const id = g.id; idx++; if ( idx < queue.length && cur() ) { view = 'ask'; draw(); } else { close(); setTimeout( () => EXA.openEfriend( id ), 250 ); }
			} else if ( act === 'dropit' ) { g.state = 'dropped'; g.droppedOn = today(); S().settings.u = Date.now(); EX.save(); nextPlan(); }
		} );
		document.body.appendChild( ov ); document.body.classList.add( 'ef-ob-open' ); draw();
	};
	document.addEventListener( 'click', ( e ) => { const r = e.target.closest && e.target.closest( '[data-ef-reopen]' ); if ( r ) { const g = S().goals.find( ( x ) => x.id === r.dataset.efReopen ); if ( g ) { delete g.state; delete g.droppedOn; S().settings.u = Date.now(); EX.save(); } } } );

	/* ------------------------------------------------------------------ Helping with savings goals: suggest, ask first, or automatic (records only, no real money moves) */
	const ALLOC_DAYS = { daily: 1, weekly: 7, monthly: 30 };
	F.alloc = () => Object.assign( { mode: 'off', every: 'weekly', maxPending: 3, goals: {}, last: '' }, S().settings.efAlloc || {} );
	const saveAlloc = ( patch ) => { S().settings.efAlloc = Object.assign( F.alloc(), patch ); S().settings.u = Date.now(); EX.save(); };
	const props = () => ( S().settings.efProposals = S().settings.efProposals || [] );
	F.pending = () => props().filter( ( x ) => x.status === 'pending' );
	F.pendingTotal = () => F.pending().reduce( ( s, x ) => s + x.items.reduce( ( a, i ) => a + i.a, 0 ), 0 );
	/** Savings goals (not plans) that eFriend may feed, most urgent first. */
	F.fundGoals = () => { const al = F.alloc(); return S().goals.filter( ( g ) => ! isPlan( g ) && ! g.state && g.target && al.goals[ g.id ] && EX.plan && EX.plan.goal( g ).remaining > 0 ).sort( ( a, b ) => ( ( a.deadline || '9999' ) < ( b.deadline || '9999' ) ? -1 : 1 ) ); };
	/** What can safely move now: what is in the wallets, plus next month's income, minus next month's costs and your cushion, minus what is already proposed. */
	F.safePool = () => {
		const b = F.baseline(), bal = EX.mainCents( EX.activeAccounts().map( ( a ) => ( { amount: EX.balance( a ) / 100, currency: a.currency } ) ) );
		let pool = bal + b.incomeMonthly - b.monthly - Math.round( F.cushion() * b.monthly ) - F.pendingTotal();
		if ( F.all().some( ( f ) => F.status( f.verdict ) === 'risk' || F.status( f.verdict ) === 'no' ) ) pool = Math.round( pool * 0.5 ); // plans that are in trouble come first
		return Math.max( 0, pool );
	};
	F.proposeItems = () => {
		const al = F.alloc(), days = ALLOC_DAYS[ al.every ] || 7, recent = props().slice( -3 ).filter( ( x ) => x.status === 'dismissed' ).length;
		let budget = Math.round( F.safePool() * Math.min( 1, days / 30 ) * Math.pow( 0.8, recent ) ); const items = [];
		F.fundGoals().forEach( ( g ) => {
			const i = EX.plan.goal( g ), periods = g.deadline ? Math.max( 1, Math.ceil( EX.diffDays( g.deadline, today() ) / days ) ) : Math.max( 1, Math.ceil( 365 / days ) );
			let a = Math.min( Math.ceil( i.remaining / periods ), i.remaining, budget ); a = Math.floor( a / 500 ) * 500; // whole 5s
			if ( a >= 500 ) { items.push( { g: g.id, a } ); budget -= a; }
		} );
		return items;
	};
	F.moveWallet = () => { const ws = EX.writableAccounts(), d = ws.find( ( w ) => w.id === S().settings.defaultAccount ); return ( d || ws.slice().sort( ( a, b ) => EX.balance( b ) - EX.balance( a ) )[ 0 ] || {} ).id; };
	F.execute = ( items, by, pid ) => {
		const acc = F.moveWallet(); if ( ! acc ) return 0; let n = 0;
		items.forEach( ( it ) => { const g = S().goals.find( ( x ) => x.id === it.g ); if ( ! g || it.a < 1 ) return; S().txs.push( { id: EX.uid(), type: 'expense', amount: ( it.a / 100 ).toFixed( 2 ), account: acc, category: 'goal', date: today(), name: g.name, goalId: g.id, efMoved: pid, efBy: by } ); n++; } );
		return n;
	};
	/** Runs when Home or Activity opens: expire old proposals, and when a period has passed make a new one (ask first) or record it (automatic). */
	F.tickAlloc = () => {
		const al = F.alloc(), td = today(); let changed = false;
		props().forEach( ( x ) => { if ( x.status === 'pending' && x.exp < td ) { x.status = 'expired'; changed = true; } } );
		if ( ( al.mode === 'ask' || al.mode === 'auto' ) && F.fundGoals().length && ( ! al.last || diff( td, al.last ) >= ( ALLOC_DAYS[ al.every ] || 7 ) ) && F.pending().length < al.maxPending ) {
			const items = F.proposeItems(), pid = EX.uid();
			if ( items.length ) {
				if ( al.mode === 'auto' ) { F.execute( items, 'auto', pid ); props().push( { id: pid, d: td, exp: td, items, status: 'confirmed', by: 'auto' } ); }
				else props().push( { id: pid, d: td, exp: addDays( td, 3 ), items, status: 'pending' } );
				S().settings.efAlloc = Object.assign( al, { last: td } ); changed = true;
			} else if ( al.last !== td ) { S().settings.efAlloc = Object.assign( al, { last: td } ); changed = true; }
		}
		if ( props().length > 40 ) props().splice( 0, props().length - 40 );
		if ( changed ) { try { EX.persist(); } catch ( e ) { /* ignore */ } }
	};
	EXA.efriendPendingTotal = () => ( on() ? F.pendingTotal() : 0 );
	const gname = ( id ) => ( S().goals.find( ( g ) => g.id === id ) || { name: '?' } ).name;
	const proposalsHtml = () => {
		if ( ! on() ) return '';
		const list = F.pending(), m = ( c ) => money( c / 100, main() );
		return list.map( ( x ) => `<div class="ef-prop" data-pid="${ esc( x.id ) }"><div class="ef-prop-h">🤖 <b>${ esc( t( 'efPropTitle' ) ) }</b></div>${ points( x.items.map( ( i ) => t( 'efPropItem', { a: m( i.a ), name: gname( i.g ) } ) ).concat( [ t( 'efPropTotal', { a: m( x.items.reduce( ( s, i ) => s + i.a, 0 ) ) } ), t( 'efPropExpire', { n: Math.max( 1, diff( x.exp, today() ) ) } ) ] ) ) }<div class="ef-prop-btns"><button type="button" class="btn btn-primary sm" data-ef-prop="confirm">✅ ${ esc( t( 'efPropConfirm' ) ) }</button><button type="button" class="btn btn-ghost sm" data-ef-prop="edit">✏️ ${ esc( t( 'efPropEdit' ) ) }</button><button type="button" class="btn btn-ghost sm" data-ef-prop="dismiss">✖️ ${ esc( t( 'efPropDismiss' ) ) }</button></div></div>` ).join( '' );
	};
	const weekMoved = () => { const from = addDays( today(), -7 ), tx = S().txs.filter( ( x ) => x.efMoved && x.date >= from ); return { n: tx.length, c: tx.reduce( ( s, x ) => s + EX.cents( x.amount ), 0 ) }; };
	EXA.efriendUndo = ( x ) => `<span class="ef-undo" role="button" tabindex="0" data-ef-undo="${ esc( x.id ) }">↩️ ${ esc( t( 'efUndo' ) ) }</span>`;
	const activityTop = () => { if ( ! on() ) return ''; const w = weekMoved(), p = proposalsHtml(); return p + ( w.n ? `<div class="ef-week">${ points( [ t( 'efWeekMoved', { a: money( w.c / 100, main() ), n: w.n } ) ] ) }</div>` : '' ); };
	{ const act = EXA.activity; if ( typeof act === 'function' ) EXA.activity = function () { try { F.tickAlloc(); } catch ( e ) { /* ignore */ } return activityTop() + act.apply( this, arguments ); }; }
	document.addEventListener( 'click', ( e ) => {
		const u = e.target.closest && e.target.closest( '[data-ef-undo]' ); if ( u ) { e.preventDefault(); e.stopPropagation(); const id = u.dataset.efUndo, tx = S().txs.find( ( x ) => x.id === id ); if ( tx ) { S().txs = S().txs.filter( ( x ) => x.id !== id ); const pr = props().find( ( x ) => x.id === tx.efMoved ); if ( pr ) { pr.status = pr.items.length > 1 ? pr.status : 'undone'; pr.undone = ( pr.undone || 0 ) + 1; } S().settings.u = Date.now(); EX.save(); UI.toast && UI.toast( t( 'efUndone' ) ); } return; }
		const b = e.target.closest && e.target.closest( '[data-ef-prop]' ); if ( ! b ) return; e.preventDefault(); e.stopPropagation();
		const card = b.closest( '[data-pid]' ), pr = props().find( ( x ) => x.id === card.dataset.pid ); if ( ! pr ) return;
		if ( b.dataset.efProp === 'confirm' ) { F.execute( pr.items, 'confirmed', pr.id ); pr.status = 'confirmed'; S().settings.u = Date.now(); EX.save(); UI.toast && UI.toast( t( 'efPropDone' ) ); }
		else if ( b.dataset.efProp === 'dismiss' ) { pr.status = 'dismissed'; S().settings.u = Date.now(); EX.save(); }
		else if ( b.dataset.efProp === 'edit' ) openPropEdit( pr );
	}, true );
	const openPropEdit = ( pr ) => {
		const X = `<button type="button" class="ab-btn" data-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button>`;
		UI.openSheet( `<div class="sheet-head">${ X }<h2 id="sheetTitle">${ esc( t( 'efPropEdit' ) ) }</h2><span class="sp"></span></div><form id="efPropForm" class="sheet-pad" novalidate data-pid="${ esc( pr.id ) }">${ pr.items.map( ( i, n ) => `<label class="f"><span>${ esc( gname( i.g ) ) } (${ esc( main() ) })</span><input name="a${ n }" inputmode="decimal" autocomplete="off" value="${ ( i.a / 100 ).toFixed( 2 ) }"></label>` ).join( '' ) }${ points( [ t( 'efPropNote' ) ] ) }<div class="btn-row"><button type="submit" class="btn btn-primary wide">✅ ${ esc( t( 'efPropConfirm' ) ) }</button></div></form>` );
	};
	document.addEventListener( 'submit', ( e ) => {
		const f = e.target; if ( f.id !== 'efPropForm' ) return; e.preventDefault(); const pr = props().find( ( x ) => x.id === f.dataset.pid ); if ( ! pr ) return;
		pr.items = pr.items.map( ( i, n ) => ( { g: i.g, a: Math.round( num( f.elements[ 'a' + n ].value ) * 100 ) } ) ).filter( ( i ) => i.a > 0 );
		if ( pr.items.length ) { F.execute( pr.items, 'confirmed', pr.id ); pr.status = 'confirmed'; } else pr.status = 'dismissed';
		S().settings.u = Date.now(); EX.save(); UI.closeSheet(); UI.toast && UI.toast( t( 'efPropDone' ) );
	} );
	/** The settings card on the eFriend page: mode, how often, how many proposals at once, and which goals. */
	const allocCard = () => {
		const al = F.alloc(), modes = [ [ 'off', '⏸️', 'efModeOff' ], [ 'suggest', '💡', 'efModeSuggest' ], [ 'ask', '✋', 'efModeAsk' ], [ 'auto', '🤖', 'efModeAuto' ] ];
		const goals = S().goals.filter( ( g ) => ! isPlan( g ) && ! g.state && g.target ), m = ( c ) => money( c / 100, main() );
		const sug = al.mode === 'suggest' ? ( ( items ) => items.length ? `<div class="ef-callouts">${ points( [ t( 'efSuggestNow', { a: m( items.reduce( ( s, i ) => s + i.a, 0 ) ), names: items.map( ( i ) => '**' + gname( i.g ) + '**' ).join( ', ' ) } ) ] ) }<button type="button" class="btn btn-ghost sm" data-ef-movenow>${ esc( t( 'efMoveNow' ) ) }</button></div>` : '' )( F.proposeItems() ) : '';
		return `<section class="card ef-alloc"><h2>🤝 ${ esc( t( 'efAllocTitle' ) ) }</h2>${ para( 'efAllocText' ) }<div class="ef-modes">${ modes.map( ( [ k, em, key ] ) => `<button type="button" class="ef-mode${ al.mode === k ? ' on' : '' }" data-ef-mode="${ k }" aria-pressed="${ al.mode === k }"><span>${ em }</span><b>${ esc( t( key ) ) }</b><small>${ esc( t( key + 'Sub' ) ) }</small></button>` ).join( '' ) }</div>
			${ al.mode === 'ask' || al.mode === 'auto' ? `<div class="ef-alloc-opts"><div class="lbl">${ esc( t( 'efEvery' ) ) }</div><div class="chips">${ [ 'daily', 'weekly', 'monthly' ].map( ( k ) => `<button type="button" class="chip${ al.every === k ? ' on' : '' }" data-ef-every="${ k }">${ esc( t( 'efEvery_' + k ) ) }</button>` ).join( '' ) }</div>
			<div class="ef-risk-h"><b>${ esc( t( 'efMaxPending' ) ) }</b><span class="ef-risk-val" data-ef-maxv>${ al.maxPending }</span></div><input type="range" class="ef-pend" data-ef-maxpend min="1" max="5" step="1" value="${ al.maxPending }" aria-label="${ esc( t( 'efMaxPending' ) ) }">${ points( [ t( 'efExpireNote' ) ] ) }</div>` : '' }
			${ al.mode !== 'off' ? `<div class="lbl">${ esc( t( 'efWhichGoals' ) ) }</div>${ goals.length ? goals.map( ( g ) => `<label class="fx-row"><span class="mid"><b>${ esc( g.name ) }</b><small>${ esc( m( EX.cents( g.target ) ) ) }</small></span><span class="switch"><input type="checkbox" data-ef-fund="${ esc( g.id ) }"${ al.goals[ g.id ] ? ' checked' : '' } aria-label="${ esc( g.name ) }"><i></i></span></label>` ).join( '' ) : `<p class="muted">${ esc( t( 'efNoGoalsToFeed' ) ) }</p>` }` : '' }${ sug }${ points( [ t( 'efNoRealMoney' ) ] ) }</section>`;
	};
	const warnAuto = () => {
		const b = F.baseline(), X = `<button type="button" class="ab-btn" data-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button>`;
		UI.openSheet( `<div class="sheet-head">${ X }<h2 id="sheetTitle">${ esc( t( 'efAutoWarnTitle' ) ) }</h2><span class="sp"></span></div><div class="sheet-pad"><div class="ef-top">${ F.mascot( 'meh', 72 ) }<div class="ef-bubble"><b>${ esc( t( 'efAutoWarnHi' ) ) }</b></div></div>${ points( [ t( 'efAutoWarnData', { d: b.history } ), t( 'efAutoWarnUndo' ), t( 'efAutoWarnSafe' ), t( 'efNoRealMoney' ) ] ) }<div class="btn-row"><button type="button" class="btn btn-ghost" data-ef-autono>${ esc( t( 'efAutoKeepAsk' ) ) }</button><button type="button" class="btn btn-primary" data-ef-autoyes>${ esc( t( 'efAutoTurnOn' ) ) }</button></div></div>` );
	};
	document.addEventListener( 'click', ( e ) => {
		const md = e.target.closest && e.target.closest( '[data-ef-mode]' );
		if ( md ) { const k = md.dataset.efMode; if ( k === 'auto' && F.baseline().history < 30 && F.alloc().mode !== 'auto' ) warnAuto(); else saveAlloc( { mode: k, last: k === 'ask' || k === 'auto' ? F.alloc().last : '' } ); return; }
		const ev = e.target.closest && e.target.closest( '[data-ef-every]' ); if ( ev ) { saveAlloc( { every: ev.dataset.efEvery } ); return; }
		if ( e.target.closest && e.target.closest( '[data-ef-autoyes]' ) ) { UI.closeSheet(); saveAlloc( { mode: 'auto' } ); return; }
		if ( e.target.closest && e.target.closest( '[data-ef-autono]' ) ) { UI.closeSheet(); saveAlloc( { mode: 'ask' } ); return; }
		if ( e.target.closest && e.target.closest( '[data-ef-movenow]' ) ) { const items = F.proposeItems(), pid = EX.uid(); if ( items.length ) { F.execute( items, 'confirmed', pid ); props().push( { id: pid, d: today(), exp: today(), items, status: 'confirmed', by: 'confirmed' } ); S().settings.u = Date.now(); EX.save(); UI.toast && UI.toast( t( 'efPropDone' ) ); } }
	} );
	document.addEventListener( 'change', ( e ) => {
		const fu = e.target.matches && e.target.matches( '[data-ef-fund]' ) ? e.target : null; if ( fu ) { const g = Object.assign( {}, F.alloc().goals ); if ( fu.checked ) g[ fu.dataset.efFund ] = true; else delete g[ fu.dataset.efFund ]; saveAlloc( { goals: g } ); return; }
		if ( e.target.matches && e.target.matches( '[data-ef-maxpend]' ) ) saveAlloc( { maxPending: Number( e.target.value ) } );
	} );
	document.addEventListener( 'input', ( e ) => { if ( e.target.matches && e.target.matches( '[data-ef-maxpend]' ) ) { const v = e.target.closest( '.ef-alloc-opts' ).querySelector( '[data-ef-maxv]' ); if ( v ) v.textContent = e.target.value; } } );

	/* ------------------------------------------------------------------ Ask eFriend: "Can I buy shoes that cost 49?" */
	const STOP = new Set( 'can could may i we you buy get purchase afford a an the that which cost costs costing for to is it be would should do does about my me on of at with euro euros eur dollar dollars usd and or please new'.split( ' ' ).concat( 'μπορώ να αγοράσω αγοράσουμε αγοράσει που κοστίζει κοστίζουν ένα μία μια ένας για το τα την τον με στο ευρώ ευρω και ή παρακαλώ νέο νέα νέος είναι θα πρέπει'.split( ' ' ) ) );
	const ASK_ICONS = [ [ /watch|ρολόι|ρολοι/i, 'gift', '⌚' ], [ /shoe|sneaker|boot|sandal|παπούτσ|μπότ/i, 'heart', '👟' ], [ /phone|mobile|κινητ|τηλέφων/i, 'device-mobile', '📱' ], [ /laptop|computer|tablet|υπολογ/i, 'device-laptop', '💻' ], [ /trip|flight|holiday|vacation|hotel|ταξίδ|διακοπ|ξενοδοχ/i, 'plane', '✈️' ], [ /car|bike|scooter|αυτοκ|μηχαν|ποδήλατ/i, 'car', '🚗' ], [ /gift|present|δώρο|δωρο/i, 'gift', '🎁' ], [ /dinner|lunch|restaurant|coffee|φαγητ|δείπν|εστιατ|καφέ/i, 'trophy', '🍽️' ], [ /sofa|furniture|table|chair|καναπ|έπιπλ/i, 'home', '🛋️' ], [ /course|book|school|μάθημα|βιβλί|σχολ/i, 'school', '📚' ] ];
	F.askIcon = ( item ) => { const x = ASK_ICONS.find( ( r ) => r[ 0 ].test( item || '' ) ); return x ? { icon: x[ 1 ], em: x[ 2 ] } : { icon: 'gift', em: '🛍️' }; };
	const FIXSTOP = new Set( 'no nope not its it is the price cost costs actually instead sorry yes right correct wrong i mean meant thing item called name should be was it’s όχι οχι είναι ειναι η τιμή τιμη κοστίζει πραγματικά ήθελα να πω λάθος σωστό'.split( ' ' ) );
	const REL = /(?<![\p{L}])(?:girlfriend|boyfriend|wife|husband|mom|mum|mother|dad|father|son|daughter|friend|sister|brother|kids?|baby|partner|fianc[eé]e?|grandma|grandpa|grandmother|grandfather|boss|colleague|teacher|neighbou?r|cousin|aunt|uncle|φίλη|φιλη|φίλο|φιλο|γυναίκα|γυναικα|σύζυγο|συζυγο|άντρα|αντρα|μαμά|μαμα|μητέρα|μητερα|μπαμπά|μπαμπα|πατέρα|πατερα|γιο|κόρη|κορη|αδερφή|αδερφη|αδερφό|αδερφο|παιδί|παιδι|παιδιά|παιδια|σύντροφο|συντροφο|γιαγιά|γιαγια|παππού|παππου|αφεντικό|αφεντικο|συνάδελφο|συναδελφο|δασκάλα|δασκαλα|δάσκαλο|δασκαλο)(?![\p{L}])/iu;
	const CURMARK = /^\s*(?:[€$£]|eur\b|euros?\b|usd\b|dollars?\b|ευρώ|ευρω)/i;
	/** "new iphone 16 1250$" -> { item: 'iphone 16', cost: 125000 } (cents). The price is the number next to a currency sign, else the biggest one; the other numbers stay in the name. English and Greek. */
	/** "2.500", "2,500", "2.500,50", "49,5", "80.50" -> cents. One separator with exactly three digits after it (and at most three before) is a thousands mark. */
	const amtCents = ( n ) => {
		n = String( n ); const lastDot = n.lastIndexOf( '.' ), lastCom = n.lastIndexOf( ',' ); let dec = -1;
		if ( lastDot >= 0 && lastCom >= 0 ) dec = Math.max( lastDot, lastCom );
		else { const sep = lastDot >= 0 ? '.' : lastCom >= 0 ? ',' : ''; if ( sep ) { const parts = n.split( sep ); if ( parts.length === 2 && ! ( parts[ 1 ].length === 3 && parts[ 0 ].length <= 3 && parts[ 0 ] !== '0' ) ) dec = n.lastIndexOf( sep ); } }
		const int = ( dec >= 0 ? n.slice( 0, dec ) : n ).replace( /[.,]/g, '' ), frac = dec >= 0 ? n.slice( dec + 1 ) : '';
		return Math.round( parseFloat( int + ( frac ? '.' + frac : '' ) ) * 100 ) || 0;
	};
	F.amtCents = amtCents;
	F.parseAsk = ( text, fix ) => {
		const raw = String( text || '' ), re = /\d+(?:[.,]\d+)*/g, found = []; let m;
		while ( ( m = re.exec( raw ) ) ) found.push( { s: m[ 0 ], i: m.index, e: m.index + m[ 0 ].length } );
		const cents = amtCents;
		const near = ( f ) => /[€$£]\s*$/.test( raw.slice( Math.max( 0, f.i - 2 ), f.i ) ) || CURMARK.test( raw.slice( f.e, f.e + 10 ) );
		const pick = found.filter( near ).pop() || found.slice().sort( ( x, y ) => cents( y.s ) - cents( x.s ) )[ 0 ] || null;
		let rest = pick ? raw.slice( 0, pick.i ) + ' ' + raw.slice( pick.e ) : raw, who = '';
		rest = rest.replace( /[€$£]|(?<![\p{L}])(?:euros?|eur|usd|dollars?|ευρώ|ευρω)(?![\p{L}])/giu, ' ' );
		if ( ! fix ) {
			// "I want to buy a new watch for my girlfriend": drop the sentence frame before the verb, and the reason after "for"; the person after "for" is remembered, not mistaken for the item
			const vb = rest.match( new RegExp( '(?<![\\p{L}\\p{N}])(?:buy|buying|get|getting|purchase|purchasing|order|ordering|afford|book|booking|grab|pick up|αγοράσω|αγορασω|αγοράσει|αγορασει|αγοράζω|αγοραζω|αγοράσουμε|πάρω|παρω|παραγγείλω|κλείσω|κλεισω)(?![\\p{L}\\p{N}])', 'iu' ) );
			if ( vb ) rest = rest.slice( vb.index + vb[ 0 ].length );
			else rest = rest.replace( /^\s*(?:(?:hi|hey|hello|well|so|ok|okay)\b[,!\s]*)?(?:i\s+)?(?:really\s+)?(?:want|need|wanna|would like|'d like|θέλω|θελω|θα ήθελα|χρειάζομαι)(?:\s+to)?\s*/i, ' ' );
			const cut = rest.match( new RegExp( '(?<=\\S\\s)(for|because|so that|so|that|which|since|as|για|γιά|επειδή|ώστε|που)(?![\\p{L}\\p{N}])', 'iu' ) );
			if ( cut ) { const after = rest.slice( cut.index + cut[ 0 ].length ).replace( /[?!.,;:()"“”]/g, ' ' ).trim(); rest = rest.slice( 0, cut.index ); if ( /^(for|για|γιά)$/i.test( cut[ 0 ] ) && REL.test( after ) ) who = after.split( /\s+/ ).slice( 0, 4 ).join( ' ' ); }
		}
		const toks = rest.replace( /['’]/g, '' ).replace( /[€$£?!.,;:()"“”]/g, ' ' ).split( /\s+/ ).filter( Boolean ), drop = ( w ) => STOP.has( w.toLowerCase() ) || ( fix && FIXSTOP.has( w.toLowerCase() ) ), PREP = new Set( [ 'to', 'in', 'at', 'of', 'from', 'σε', 'στο', 'στη', 'στην', 'στον', 'από' ] ), words = [];
		toks.forEach( ( w, k ) => { if ( ! drop( w ) ) words.push( w ); else if ( PREP.has( w.toLowerCase() ) && words.length && toks[ k + 1 ] && ! drop( toks[ k + 1 ] ) ) words.push( w ); } );
		const item = words.join( ' ' ).trim(); return { item: item ? ( words[ 0 ] === words[ 0 ].toLowerCase() ? item.charAt( 0 ).toUpperCase() + item.slice( 1 ) : item ) : '', cost: pick ? cents( pick.s ) : 0, who };
	};
	/** How soon the person wants it, from their own words: "tomorrow", "in 2 weeks", "by Friday", "on 15 November", "before Christmas", "right away", "no rush". { days } (0 = today) or { none: true } or null. English and Greek. */
	const WD = [ [ 'sunday|κυριακή|κυριακη', 0 ], [ 'monday|δευτέρα|δευτερα', 1 ], [ 'tuesday|τρίτη|τριτη', 2 ], [ 'wednesday|τετάρτη|τεταρτη', 3 ], [ 'thursday|πέμπτη|πεμπτη', 4 ], [ 'friday|παρασκευή|παρασκευη', 5 ], [ 'saturday|σάββατο|σαββατο', 6 ] ];
	const MO = [ [ 'january|jan|ιανουαρίου|ιανουάριο|ιανουαριου|ιανουαριο', 0 ], [ 'february|feb|φεβρουαρίου|φεβρουάριο|φεβρουαριου|φεβρουαριο', 1 ], [ 'march|mar|μαρτίου|μάρτιο|μαρτιου|μαρτιο', 2 ], [ 'april|apr|απριλίου|απρίλιο|απριλιου|απριλιο', 3 ], [ 'may|μαΐου|μάιο|μαιου|μαιο', 4 ], [ 'june|jun|ιουνίου|ιούνιο|ιουνιου|ιουνιο', 5 ], [ 'july|jul|ιουλίου|ιούλιο|ιουλιου|ιουλιο', 6 ], [ 'august|aug|αυγούστου|αύγουστο|αυγουστου|αυγουστο', 7 ], [ 'september|sept|sep|σεπτεμβρίου|σεπτέμβριο|σεπτεμβριου|σεπτεμβριο', 8 ], [ 'october|oct|οκτωβρίου|οκτώβριο|οκτωβριου|οκτωβριο', 9 ], [ 'november|nov|νοεμβρίου|νοέμβριο|νοεμβριου|νοεμβριο', 10 ], [ 'december|dec|δεκεμβρίου|δεκέμβριο|δεκεμβριου|δεκεμβριο', 11 ] ];
	const wdAlt = WD.map( ( x ) => x[ 0 ] ).join( '|' ), moAlt = MO.map( ( x ) => x[ 0 ] ).join( '|' );
	const U = '(?<![\\p{L}\\p{N}])', V = '(?![\\p{L}\\p{N}])', PRE = '(?:(?:on|by|until|till|before|for|in|within|at|next|this|from|σε|έως|μέχρι|μεχρι|στις|στην|στο|στη|την|το|τον|τη|την)\\s+)?';
	const idxOf = ( list, w ) => { const x = w.toLowerCase(); const f = list.find( ( e ) => e[ 0 ].split( '|' ).includes( x ) ); return f ? f[ 1 ] : -1; };
	const untilDow = ( dow ) => { const cur = parse( today() ).getDay(); let d = ( dow - cur + 7 ) % 7; return d === 0 ? 7 : d; };
	const WHEN = [
		{ k: 'none', re: new RegExp( U + '(?:no rush|whenever|any ?time|not urgent|no hurry|can wait|καμία βιασύνη|καμια βιασυνη|όποτε|οποτε|δεν βιάζ\\p{L}*|δεν βιαζ\\p{L}*|δεν είναι επείγ\\p{L}*|δεν ειναι επειγ\\p{L}*)' + V, 'giu' ), f: () => ( { none: true } ) },
		{ k: 'dat', re: new RegExp( U + PRE + '(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(' + moAlt + ')' + V + '(?:\\s+(\\d{4}))?', 'giu' ), f: ( m ) => dateDays( Number( m[ 1 ] ), idxOf( MO, m[ 2 ] ), m[ 3 ] ) },
		{ k: 'dat2', re: new RegExp( U + PRE + '(' + moAlt + ')\\s+(\\d{1,2})(?:st|nd|rd|th)?' + V, 'giu' ), f: ( m ) => dateDays( Number( m[ 2 ] ), idxOf( MO, m[ 1 ] ) ) },
		{ k: 'slash', re: new RegExp( U + PRE + '(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?' + V, 'giu' ), f: ( m ) => dateDays( Number( m[ 1 ] ), Number( m[ 2 ] ) - 1, m[ 3 ] ) },
		{ k: 'dayafter', re: new RegExp( U + '(?:the )?day after tomorrow|μεθαύριο|μεθαυριο' + V, 'giu' ), f: () => ( { days: 2 } ) },
		{ k: 'tomorrow', re: new RegExp( U + '(?:tomorrow|αύριο|αυριο)' + V, 'giu' ), f: () => ( { days: 1 } ) },
		{ k: 'now', re: new RegExp( U + '(?:right away|asap|urgent(?:ly)?|immediately|today|tonight|now|τώρα|τωρα|άμεσα|αμεσα|επείγον|επειγον|σήμερα|σημερα|απόψε|αποψε)' + V, 'giu' ), f: () => ( { days: 0 } ) },
		{ k: 'weekend', re: new RegExp( U + PRE + '(?:the |this )?(?:weekend|σαββατοκύριακο|σαββατοκυριακο)' + V, 'giu' ), f: () => ( { days: untilDow( 6 ) % 7 === 0 ? 0 : untilDow( 6 ) } ) },
		{ k: 'wd', re: new RegExp( U + PRE + '(?:next |this |την |το )?(' + wdAlt + ')' + V, 'giu' ), f: ( m ) => ( { days: untilDow( idxOf( WD, m[ 1 ] ) ) } ) },
		{ k: 'eom', re: new RegExp( U + '(?:(?:by |before |at )?(?:the )?end of (?:the |this )?month|τέλος (?:του )?μήνα|τελος (?:του )?μηνα)' + V, 'giu' ), f: () => { const n = parse( today() ); return { days: Math.max( 1, Math.round( ( new Date( n.getFullYear(), n.getMonth() + 1, 0 ) - n ) / 864e5 ) ) }; } },
		{ k: 'xmas', re: new RegExp( U + PRE + '(?:christmas|xmas|χριστούγεννα|χριστουγεννα)' + V, 'giu' ), f: () => dateDays( 25, 11 ) },
		{ k: 'num', re: new RegExp( U + PRE + '(?:in |within |σε |εντός |εντος )?(\\d+(?:[.,]\\d+)?|a|an|one|two|three|μια|μία|ένα|ενα|δύο|δυο|τρεις)\\s*(days?|weeks?|months?|ημέρ\\p{L}*|ημερ\\p{L}*|μέρ\\p{L}*|μερ\\p{L}*|εβδομ\\p{L}*|μήν\\p{L}*|μην\\p{L}*)' + V, 'giu' ), f: ( m ) => { const w = m[ 1 ].toLowerCase(), words = { a: 1, an: 1, one: 1, two: 2, three: 3, 'μια': 1, 'μία': 1, 'ένα': 1, 'ενα': 1, 'δύο': 2, 'δυο': 2, 'τρεις': 3 }, n = words[ w ] != null ? words[ w ] : parseFloat( w.replace( ',', '.' ) ), u = m[ 2 ].toLowerCase(); return { days: Math.max( 1, Math.round( n * ( /^(week|εβδομ)/.test( u ) ? 7 : /^(month|μήν|μην)/.test( u ) ? 30 : 1 ) ) ) }; } },
		{ k: 'few', re: new RegExp( U + PRE + '(?:a couple of weeks|couple of weeks|a few weeks|few weeks|δυο εβδομάδες|δύο εβδομάδες|μερικές εβδομάδες|μερικες εβδομαδες)' + V, 'giu' ), f: ( m ) => ( { days: /few|μερικ/i.test( m[ 0 ] ) ? 21 : 14 } ) },
		{ k: 'nw', re: new RegExp( U + PRE + '(?:(?:next|this) week|(?:την )?(?:επόμενη|επομενη|αυτή|αυτη) (?:την )?εβδομάδα|εβδομαδα)' + V, 'giu' ), f: () => ( { days: 7 } ) },
		{ k: 'nm', re: new RegExp( U + PRE + '(?:(?:next|this) month|(?:τον )?(?:επόμενο|επομενο|αυτόν|αυτον) (?:τον )?μήνα|μηνα)' + V, 'giu' ), f: () => ( { days: 30 } ) },
	];
	const dateDays = ( day, mon, year ) => { if ( mon < 0 || mon > 11 || day < 1 || day > 31 ) return null; const now = parse( today() ); let y = year ? Number( year ) : now.getFullYear(); if ( y < 100 ) y += 2000; let d = new Date( y, mon, day ); if ( ! year && d < now ) d = new Date( y + 1, mon, day ); return { days: Math.max( 0, Math.round( ( d - now ) / 864e5 ) ) }; };
	F.parseWhen = ( text ) => {
		const x = String( text || '' );
		for ( const p of WHEN ) { p.re.lastIndex = 0; const m = p.re.exec( x ); if ( m ) { const r = p.f( m ); if ( r ) return r; } }
		return null;
	};
	/** The same text without the timing words, so "phone 1250 tomorrow" or "in 2 weeks" does not leak into the price or the name. */
	const stripWhen = ( text ) => WHEN.reduce( ( t, p ) => t.replace( p.re, ' ' ), String( text || '' ) );
	F.stripWhen = stripWhen;
	/** Your next ~11 weeks, day by day: wallets, income dates, bills, usual spending (capped by your limits) and your plans' dates. */
	F.timeline = ( horizon = 80 ) => {
		const now = today(), b = F.baseline(), end = addDays( now, horizon ), idx = ( d ) => Math.max( 0, diff( d, now ) ), all = F.all();
		const bal0 = EX.mainCents( EX.activeAccounts().map( ( a ) => ( { amount: EX.balance( a ) / 100, currency: a.currency } ) ) );
		const delta = new Array( horizon + 1 ).fill( 0 ), inc = Array.from( { length: horizon + 1 }, () => [] ), bil = Array.from( { length: horizon + 1 }, () => [] );
		S().incomes.filter( ( i ) => ! i.done && i.next ).forEach( ( i ) => EX.occurrences( i, end ).forEach( ( d ) => { const k = idx( d ); if ( k <= horizon ) { delta[ k ] += centsOf( i.amount, i.currency ); inc[ k ].push( i.name ); } } ) );
		S().bills.filter( ( x ) => ! x.done && x.next ).forEach( ( x ) => EX.occurrences( x, end ).forEach( ( d ) => { const k = idx( d ); if ( k <= horizon ) { delta[ k ] -= centsOf( x.amount, x.currency ); bil[ k ].push( x.name ); } } ) );
		all.forEach( ( f ) => { if ( f.done || f.late ) return; const k = idx( f.goal.deadline ); if ( k <= horizon ) delta[ k ] -= f.remaining; } );
		const lpd = F.limitPerDay(); let habit = b.habitPD; if ( lpd > 0 ) habit = Math.min( habit, Math.max( 0, lpd - b.billsMonth / 30 ) );
		const out = []; let bal = bal0;
		for ( let k = 0; k <= horizon; k++ ) { bal += delta[ k ] - habit + b.otherPD; out.push( { k, d: addDays( now, k ), bal, inc: inc[ k ], bills: bil[ k ] } ); }
		return out;
	};

	/* ------------------------------------------------------------------ Suggestions from what eFriend already knows */
	const nice = ( c, dir = 0 ) => { const v = c / 100, step = v < 50 ? 5 : v < 500 ? 10 : v < 5000 ? 50 : 100, r = dir < 0 ? Math.floor( v / step ) : Math.round( v / step ); return Math.max( step, r * step ) * 100; };
	/** Day, week and month limits from the person's real spending (the limits include bills), a little below the usual so there is room to improve. Needs two weeks of history. */
	F.limitsSet = () => ( { other: ( k ) => { const L = F.limits(); return [ 'day', 'week', 'month' ].some( ( x ) => x !== k && L[ x ] ); } } );
	F.limitsFrom = ( monthCents ) => ( { month: nice( monthCents ), day: nice( monthCents / 30, -1 ), week: nice( monthCents * 7 / 30, -1 ) } );
	F.suggestLimits = () => { const b = F.baseline(); if ( b.history < 14 || b.habitPD <= 0 ) return null; return Object.assign( F.limitsFrom( b.habitPD * 30 * 0.9 + b.billsMonth ), { days: b.history } ); };
	const limStr = ( c ) => String( Math.round( c / 100 ) );
	const limFill = ( s, onlyEmpty ) => { const L = F.limits(); [ 'day', 'week', 'month' ].forEach( ( k ) => { if ( s[ k ] && ! ( onlyEmpty && L[ k ] ) ) F.saveLimits( k, limStr( s[ k ] ) ); } ); document.querySelectorAll( '[data-lim]' ).forEach( ( i ) => { const v = ( F.limits()[ i.dataset.lim ] || 0 ); i.value = v ? limStr( v ) : ''; } ); const nb = document.querySelector( '.ef-lim-note' ); if ( nb ) nb.innerHTML = points( F.limitNotes() ); };
	/** Would saving this expense push today, this week or this month over a limit the person set? Returns the sentence to show, or null. */
	EXA.efLimitWarn = ( tx ) => {
		if ( ! on() || tx.type !== 'expense' || S().settings.efLimitWarn === false || tx.date > today() ) return null;
		const L = F.limits(); if ( ! L.day && ! L.week && ! L.month ) return null;
		const cost = centsOf( tx.amount, EX.txCurrency( tx ) ), d = parse( tx.date ), mon = addDays( tx.date, -( ( d.getDay() + 6 ) % 7 ) ), m1 = EX.iso( new Date( d.getFullYear(), d.getMonth(), 1 ) ), m2 = EX.iso( new Date( d.getFullYear(), d.getMonth() + 1, 0 ) );
		const spent = ( from, to ) => S().txs.filter( ( x ) => x.type === 'expense' && ! x.goalId && ! x.efPlan && x.date >= from && x.date <= to ).reduce( ( n, x ) => n + centsOf( x.amount, EX.txCurrency( x ) ), 0 );
		const ranges = { day: [ tx.date, tx.date ], week: [ mon, addDays( mon, 6 ) ], month: [ m1, m2 ] };
		for ( const k of [ 'day', 'week', 'month' ] ) { if ( ! L[ k ] ) continue; const after = spent( ranges[ k ][ 0 ], ranges[ k ][ 1 ] ) + cost; if ( after > L[ k ] ) return t( 'efLimWarn_' + k, { a: money( after / 100, main() ), b: money( L[ k ] / 100, main() ) } ); }
		return null;
	};
	/** The first day in the next two months when the money is likely to run out, or drop below the safety cushion, and the bill behind it. */
	F.lowAhead = () => {
		const b = F.baseline(); if ( ! on() || b.history < 7 || ! S().bills.length && ! S().incomes.length ) return null;
		const tl = F.timeline( 60 ), cushion = Math.round( F.cushion() * b.monthly );
		for ( const [ kind, th ] of [ [ 'zero', 0 ], [ 'cushion', cushion ] ] ) {
			if ( kind === 'cushion' && th <= 0 ) continue; if ( tl[ 0 ].bal < th ) continue;
			const hit = tl.find( ( x ) => x.k > 0 && x.bal < th ); if ( ! hit ) continue;
			// what pulls the money down before that day: the biggest bill or plan date
			const end = hit.d, now = today(), cands = [];
			S().bills.filter( ( x ) => ! x.done && x.next ).forEach( ( x ) => EX.occurrences( x, end ).forEach( ( d ) => { if ( d > now && d <= end ) cands.push( { n: x.name, a: centsOf( x.amount, x.currency ), kind: 'bill', id: x.id, d } ); } ) );
			F.all().forEach( ( f ) => { if ( ! f.done && ! f.late && f.goal.deadline > now && f.goal.deadline <= end ) cands.push( { n: f.goal.name, a: f.remaining, kind: 'plan', id: f.goal.id, d: f.goal.deadline } ); } );
			const big = cands.sort( ( x, y ) => y.a - x.a )[ 0 ];
			return { kind, d: hit.d, k: hit.k, bal: hit.bal, cushion, why: big ? big.n : '', whyKind: big ? big.kind : '', whyAmt: big ? big.a : 0, list: cands.slice( 0, 6 ) };
		}
		return null;
	};
	const lowBanner = () => {
		const w = F.lowAhead(); if ( ! w || ( S().device || {} ).efLowDismiss === w.d ) return '';
		const lines = [ t( w.kind === 'zero' ? 'efLowZero' : 'efLowCushion', { d: EX.dayName( w.d ), c: money( w.cushion / 100, main() ) } ) ].concat( w.why ? [ t( w.whyKind === 'plan' ? 'efLowWhyPlan' : 'efLowWhyBill', { n: w.why, a: money( w.whyAmt / 100, main() ) } ) ] : [], [ t( w.whyKind === 'bill' ? 'efLowTip' : w.whyKind === 'plan' ? 'efLowTipPlan' : 'efLowTipSpend' ) ] );
		const rows = ( w.list || [] ).map( ( x ) => `<li class="ef-lowrow"><span class="ef-lowic">${ x.kind === 'plan' ? '🎯' : '🧾' }</span><span class="ef-lowtx"><b>${ esc( x.n ) }</b><small>${ esc( EX.dayName( x.d ) ) } · ${ esc( money( x.a / 100, main() ) ) }</small></span><button type="button" class="btn btn-ghost sm" data-ef-lowmove="${ x.kind }:${ esc( x.id ) }">${ esc( t( x.kind === 'plan' ? 'efLowMovePlan' : 'efLowMoveBill' ) ) }</button></li>` ).join( '' );
		return `<div class="ef-ask ef-low"><div>${ points( lines ) }${ rows ? `<details class="ef-lowlist"><summary>${ esc( t( 'efLowList' ) ) }</summary><ul>${ rows }</ul></details>` : '' }</div><button type="button" class="btn btn-ghost sm" data-ef-lowx="${ esc( w.d ) }">${ esc( t( 'efGotIt' ) ) }</button></div>`;
	};
	/** Budgets worth adding, from what the person really spent per category over the last weeks (needs about six weeks of history). */
	F.budgetIdeas = () => {
		const b = F.baseline(); if ( b.history < 45 ) return [];
		const now = today(), win = Math.min( 90, b.history ), since = addDays( now, -win ), have = new Set( S().budgets.map( ( x ) => x.category ) ), sum = {};
		S().txs.filter( ( x ) => x.type === 'expense' && ! x.goalId && ! x.efPlan && x.date >= since && x.date <= now && x.category && x.category !== 'uncategorized' && ! have.has( x.category ) ).forEach( ( x ) => { sum[ x.category ] = ( sum[ x.category ] || 0 ) + centsOf( x.amount, EX.txCurrency( x ) ); } );
		return Object.keys( sum ).map( ( c ) => { const usual = sum[ c ] / ( win / 30 ); return { cat: c, usual: Math.round( usual ), amount: nice( usual * 0.95 ) }; } ).filter( ( x ) => x.usual >= 2000 ).sort( ( a, c ) => c.usual - a.usual ).slice( 0, 5 );
	};
	F.addBudgets = ( list ) => { list.forEach( ( x ) => S().budgets.push( { id: EX.uid(), category: x.cat, amount: limStr( x.amount ), period: 'monthly', rollover: false, tags: [], photo: '' } ) ); if ( list.length ) { S().settings.u = Date.now(); EX.save(); } };
	const budIdeasHtml = () => {
		const l = F.budgetIdeas(); if ( ! l.length ) return '';
		const m = ( c ) => money( c / 100, main() );
		return `<section class="card ef-budideas"><h2>💡 ${ esc( t( 'efBudIdeas' ) ) }</h2>${ para( 'efBudIdeasText' ) }<ul class="ef-list">${ l.map( ( x ) => { const ci = EX.catInfo( x.cat ); return `<li class="ef-bi"><span class="ef-mi">${ UI.icon( ci.iconName || 'tag', 20 ) }</span><div><b>${ esc( ci.name ) }</b><small>${ esc( t( 'efBudIdeaRow', { a: m( x.usual ), b: m( x.amount ) } ).replace( /\*\*/g, '' ) ) }</small></div><button type="button" class="btn btn-ghost sm" data-ef-budadd="${ esc( x.cat ) }:${ x.amount }">${ esc( t( 'efBudAdd' ) ) }</button></li>`; } ).join( '' ) }</ul><div class="btn-row"><button type="button" class="btn btn-primary" data-ef-budall>${ esc( t( 'efBudAddAll' ) ) }</button></div></section>`;
	};
	/** How many months of cushion fit how steady the income is: the monthly income over the last three 30-day blocks, from what was really received. */
	F.suggestCushion2 = () => {
		const now = today(), blocks = [ 0, 0, 0 ]; let first = now;
		S().txs.filter( ( x ) => x.type === 'income' && ! x.goalId && x.date <= now ).forEach( ( x ) => { const k = Math.floor( diff( now, x.date ) / 30 ); if ( k >= 0 && k < 3 ) blocks[ k ] += centsOf( x.amount, EX.txCurrency( x ) ); if ( x.date < first ) first = x.date; } );
		const used = blocks.filter( ( v, i ) => v > 0 || ( i * 30 < diff( now, first ) ) ); if ( diff( now, first ) < 60 || used.length < 2 ) return null;
		const mean = used.reduce( ( a, v ) => a + v, 0 ) / used.length; if ( mean <= 0 ) return { m: 3, swing: 100 };
		const swing = Math.round( ( Math.max( ...used ) - Math.min( ...used ) ) / mean * 100 );
		return { m: swing < 10 ? 1 : swing < 30 ? 2 : 3, swing };
	};
	/** For each of the next 120 days: if you bought it that day, how low would your money go afterwards (the next 30 days)? */
	F.answer = ( cost ) => {
		const N = 120, tl = F.timeline( N + 31 ), b = F.baseline(), cushion = Math.round( F.cushion() * b.monthly ), days = [];
		for ( let i = 0; i < N; i++ ) { let low = Infinity; for ( let k = i; k <= Math.min( i + 30, tl.length - 1 ); k++ ) low = Math.min( low, tl[ k ].bal - cost ); days.push( { i, d: tl[ i ].d, low, st: low >= cushion ? 'best' : low >= cushion / 2 ? 'good' : low >= 0 ? 'tight' : 'avoid', inc: tl[ i ].inc, bills: tl[ i ].bills, near: [ 0, 1, 2 ].map( ( o ) => ( tl[ Math.max( 0, i - o ) ].inc || [] ) ).flat() } ); }
		const first = days.find( ( x ) => x.st === 'best' ) || days.find( ( x ) => x.st === 'good' ) || null, maxSafe = Math.max( 0, ...days.map( ( x ) => x.low + cost - cushion ) );
		return { cost, days, tl: tl.slice( 0, N ), cushion, today: days[ 0 ], best: first, first, anyOk: days.some( ( x ) => x.st !== 'avoid' ), maxSafe, monthly: b.monthly, incomeMonthly: b.incomeMonthly, hasIncome: b.hasIncome };
	};
	/* ------------------------------------------------------------------ The chat: eFriend interviews you (what, how much, how soon), then brings the full analysis back to the app */
	const chat = { lastMe: null, menuOn: false, chipsBefore: [], more: false, locked: false, over: false, stuck: 0, turns: 0, formOffered: false, restarts: 0, timer: 0, chain: 0, id: '', ts: 0, msgs: [], stage: 'what', item: '', who: '', mi: 0, cost: 0, by: undefined, typing: false, busy: false, tok: 0, used: {}, ans: null, rec: null, sel: 0, chips: [], anim: true };
	const money$ = ( c ) => money( c / 100, main() );
	const itemName = () => chat.item || t( 'efAskThing' );
	/** A rare surprise (about one chat in ten): if the person is named like George, his wife Olga or his daughter Danae, eFriend is thrilled. */
	F.nameEgg = () => {
		const n = String( S().settings.name || '' ).trim().split( /\s+/ )[ 0 ].toLowerCase().normalize( 'NFD' ).replace( /[\u0300-\u036f]/g, '' ).replace( /ς/g, 'σ' );
		if ( [ 'george', 'giorgos', 'georgios', 'γιωργοσ', 'γεωργιοσ' ].includes( n ) ) return 'george';
		if ( [ 'olga', 'ολγα' ].includes( n ) ) return 'olga';
		if ( [ 'danae', 'δαναη' ].includes( n ) ) return 'danae';
		return '';
	};
	const forWho = () => ( chat.who ? t( 'efc_for' ) + ' ' + chat.who : '' );
	const kindOf = ( item ) => ( { '👟': 'shoes', '📱': 'phone', '💻': 'laptop', '✈️': 'trip', '🚗': 'car', '🎁': 'gift', '⌚': 'watch' }[ F.askIcon( item ).em ] || 'generic' );
	/** One line from a pool ("a|b|c"), never the same one twice in a row, so eFriend does not repeat itself. */
	const pool = ( key, vars ) => {
		if ( F.char() === 'chip' && String( t( key + '_c' ) ) !== key + '_c' ) key += '_c'; // Chip is younger and talks differently, but says the same thing
		const list = String( t( key, vars ) ).split( '|' ).concat( named( key, vars ) ), u = chat.used[ key ] = chat.used[ key ] || []; let i = 0;
		if ( list.length > 1 ) { do { i = Math.floor( Math.random() * list.length ); } while ( u.includes( i ) ); u.push( i ); if ( u.length > Math.min( 2, list.length - 1 ) ) u.shift(); }
		return list[ i ];
	};
	const askLine = ( a, item ) => {
		const it = item || t( 'efAskThing' ), t0 = a.today;
		if ( t0.st === 'best' ) return t( 'efAskYes', { item: it, a: money$( a.cost ) } );
		if ( t0.st === 'good' ) return t( 'efAskThin', { item: it } );
		if ( t0.st === 'tight' ) return a.best && a.best.i > 0 ? t( 'efAskTightWait', { d: EX.dayName( a.best.d ) } ) : t( 'efAskTight' );
		return a.first ? t( 'efAskNotToday', { d: EX.dayName( a.first.d ) } ) : t( 'efAskNever' );
	};
	const whenWords = ( d ) => ( d == null ? t( 'efc_w_none' ) : d <= 3 ? t( 'efc_w_now' ) : d < 14 ? t( 'efc_w_d', { n: d } ) : d < 60 ? t( 'efc_w_w', { n: Math.round( d / 7 ) } ) : t( 'efc_w_m', { n: Math.round( d / 30 ) } ) );
	const priceSize = ( c ) => { const mo = F.baseline().monthly, r = mo > 0 ? c / mo : c / 100000; return r < 0.05 ? 'small' : r < 0.4 ? 'mid' : r < 1.5 ? 'big' : 'huge'; };
	const reduceMotion = () => { try { return window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches || navigator.webdriver; } catch ( e ) { return false; } };
	const wait = ( ms ) => new Promise( ( r ) => setTimeout( r, reduceMotion() ? 0 : ms ) );
	const marks = () => { const n = new Intl.NumberFormat( EX.loc() ); return { dec: n.format( 1.1 ).charAt( 1 ), grp: n.format( 1000 ).charAt( 1 ) }; };
	/** What the person types for a price, shown as it should be read: digits and the decimal mark only, thousands grouped (2.500 or 2,500). */
	const fmtTyped = ( raw ) => {
		const { dec, grp } = marks(), d = dec === '.' ? '\\.' : dec; let v = String( raw ).replace( new RegExp( '[^\\d' + d + ']', 'g' ), '' );
		const k = v.indexOf( dec ); let int = k < 0 ? v : v.slice( 0, k ), frac = k < 0 ? null : v.slice( k + 1 ).split( dec ).join( '' ).slice( 0, 2 );
		int = int.replace( /^0+(?=\d)/, '' ).slice( 0, 10 ).replace( /\B(?=(\d{3})+(?!\d))/g, grp ); return frac === null ? int : int + dec + frac;
	};
	const fmtCents = ( c ) => { const { dec } = marks(), v = ( c / 100 ).toFixed( 2 ).replace( '.', dec ); return fmtTyped( c % 100 ? v : v.slice( 0, -3 ) ); };
	const zeroPh = () => '0' + marks().dec + '00';
	/** While eFriend waits for a price the keyboard is numeric and only numbers can be typed. */
	/** While eFriend waits for a price, the box becomes a numeric one (decimal keyboard); Expenity's amount fields then group the digits as they are typed and refuse letters. */
	/** While eFriend waits for a choice (form or keep chatting) or the form is open, the text box rests. */
	const lockInput = ( on, ph ) => { chat.locked = !! on; const q = document.getElementById( 'efChatQ' ); if ( ! q || chat.over ) return; q.disabled = !! on; const b = q.closest( 'form' ).querySelector( 'button[type=submit]' ); if ( b ) b.disabled = !! on; const mb = q.closest( 'form' ).querySelector( '.ef-menubtn' ); if ( mb ) mb.disabled = !! on; if ( on ) { q.value = ''; q.placeholder = ph || ''; } else q.placeholder = chat.stage === 'price' ? zeroPh() : t( 'efAskPh' ); };
	const syncInput = () => {
		const q = document.getElementById( 'efChatQ' ); if ( ! q || chat.over ) return; const price = chat.stage === 'price';
		if ( ( q.getAttribute( 'inputmode' ) === 'decimal' ) === price ) return;
		const n = document.createElement( 'input' ); n.name = 'q'; n.id = 'efChatQ'; n.autocomplete = 'off'; n.setAttribute( 'enterkeyhint', 'send' ); n.setAttribute( 'aria-label', q.getAttribute( 'aria-label' ) || '' );
		if ( price ) { n.setAttribute( 'inputmode', 'decimal' ); n.placeholder = zeroPh(); } else n.placeholder = t( 'efAskPh' );
		n.disabled = !! chat.locked; if ( chat.locked ) n.placeholder = q.placeholder; const had = document.activeElement === q; q.replaceWith( n ); if ( had ) { if ( window.EXKB ) EXKB.allow(); n.focus( { preventScroll: true } ); }
	};
	const live = ( tok ) => tok === chat.tok && document.getElementById( 'efChat' );

	const formCard = () => `<form id="efQForm" class="ef-qform" novalidate autocomplete="off"><label class="f"><span>${ esc( t( 'efAskWhat' ) ) }</span><input name="what" autocomplete="off" value="${ esc( chat.item ) }"></label><label class="f"><span>${ esc( t( 'efAskHow' ) ) } (${ esc( main() ) })</span><input name="cost" inputmode="decimal" autocomplete="off" placeholder="${ zeroPh() }" value="${ chat.cost ? esc( fmtCents( chat.cost ) ) : '' }"></label><label class="f"><span>${ esc( t( 'efc_f_when' ) ) }</span><input type="date" name="when" min="${ today() }"><span class="ef-qdates">${ [ 7, 14, 30, 90 ].map( ( n ) => `<button type="button" class="ef-chipq sm" data-ef-qdate="${ n }">${ esc( t( 'efc_qd' + n ) ) }</button>` ).join( '' ) }</span></label><label class="ef-qnr"><input type="checkbox" name="norush"> ${ esc( t( 'efc_wc4' ) ) }</label><p class="err" id="efQErr" role="alert" hidden></p><button type="submit" class="btn btn-primary wide">✅ ${ esc( t( 'efc_f_go' ) ) }</button></form>`;
	const bubble = ( x ) => x.form ? `<div class="ef-msg ef wide" data-form-msg><span class="ef-av">${ F.icon( 30 ) }</span><div class="ef-mb">${ formCard() }</div></div>` : x.who === 'me'
		? `<div class="ef-msg me" data-mid="${ esc( x.id || '' ) }"><div class="ef-mb">${ esc( x.text ) }${ x.amount && ! chat.over ? `<button type="button" class="ef-edit" data-ef-amtedit="${ esc( x.id ) }" aria-label="${ esc( t( 'efc_edit' ) ) }" title="${ esc( t( 'efc_edit' ) ) }">✏️</button>` : '' }</div></div>`
		: `<div class="ef-msg ef"><span class="ef-av">${ F.icon( 30 ) }</span><div class="ef-mb">${ x.lines.map( ( l ) => `<p class="ef-ml">${ rich( l ) }</p>` ).join( '' ) }</div></div>`;
	const chatBox = () => document.getElementById( 'efChat' );
	const scrollEnd = () => { const box = chatBox(); if ( box ) box.scrollTo( { top: box.scrollHeight, behavior: reduceMotion() ? 'auto' : 'smooth' } ); };
	const setStat = ( typing ) => { const st = document.getElementById( 'efCpStat' ); if ( st ) st.textContent = typing ? t( 'efc_typing' ) : t( 'efc_online' ); };
	/** Messages are added one by one, never redrawn, so nothing above flickers. */
	const appendMsg = ( x ) => { const box = chatBox(); if ( box ) box.insertAdjacentHTML( 'beforeend', bubble( x ) ); };
	const showTyping = () => { const box = chatBox(); if ( ! box || document.getElementById( 'efTyping' ) ) return; box.insertAdjacentHTML( 'beforeend', `<div class="ef-msg ef" id="efTyping"><span class="ef-av">${ F.icon( 30 ) }</span><div class="ef-mb ef-typing" aria-label="${ esc( t( 'efc_typing' ) ) }"><i></i><i></i><i></i></div></div>` ); setStat( true ); };
	const hideTyping = () => { const el = document.getElementById( 'efTyping' ); if ( el ) el.remove(); setStat( false ); };
	const paint = ( scroll ) => { if ( scroll ) scrollEnd(); return !! chatBox(); };
	const setMood = ( m ) => { const av = document.querySelector( '.ef-cp-av' ); if ( av && m ) av.innerHTML = F.mascot( m, 46 ); };
	const setChips = ( list ) => {
		chat.chips = list || []; const box = document.getElementById( 'efChips' ); if ( ! box ) return;
		box.classList.toggle( 'open', chat.chips.some( ( c ) => c.k === 'head' ) );
		box.innerHTML = chat.chips.map( ( c, i ) => c.k === 'head' ? `<p class="ef-chiph">${ esc( c.label ) }</p>` : `<button type="button" class="ef-chipq${ c.k === 'yes' ? ' go' : c.k === 'more' || c.k === 'menuclose' ? ' more' : '' }" style="--i:${ i }" data-ef-q="${ i }">${ esc( c.label ) }</button>` ).join( '' );
		requestAnimationFrame( () => scrollEnd() ); setTimeout( scrollEnd, 120 );
	};
	/** eFriend "types" for a moment, then speaks: the pause is part of the charm. */
	const say = async ( lines, o = {} ) => {
		if ( chat.chain !== chat.tok ) return;
		const tok = chat.tok, txt = [].concat( lines ).join( ' ' ), len = txt.length;
		if ( o.instant || S().settings.efInstant === true ) { const m = { who: 'ef', lines: [].concat( lines ), mood: o.mood }; chat.msgs.push( m ); appendMsg( m ); setMood( o.mood ); scrollEnd(); syncInput(); saveChat(); return; }
		await wait( 380 ); if ( ! live( tok ) ) return;
		chat.typing = true; setMood( o.mood ); showTyping(); scrollEnd();
		await wait( o.delay || Math.max( 1100, Math.min( 3600, 850 + len * 32 ) ) );
		if ( ! live( tok ) ) return;
		chat.typing = false; hideTyping(); const m = { who: 'ef', lines: [].concat( lines ), mood: o.mood }; chat.msgs.push( m ); appendMsg( m ); scrollEnd(); syncInput(); saveChat();
		await wait( 425 );
	};

	const recap = async () => {
		chat.stage = 'confirm'; chat.stuck = 0;
		await say( [ pool( 'efc_recap' ), `${ F.askIcon( chat.item ).em } **${ itemName() }**${ chat.who ? ' ' + forWho() : '' } · **${ money$( chat.cost ) }** · ${ whenWords( chat.by ) }`, pool( 'efc_right' ) ], { mood: 'happy' } );
		setChips( [ { k: 'yes', label: '✅ ' + t( 'efc_yes' ) }, { k: 'fix', label: '✏️ ' + t( 'efChatFix' ) } ] );
	};
	/** The chips at the start: a few ideas, an About eFriend button and a More button that opens every idea and the questions to ask him. */
	const startChips = () => {
		const ideas = String( t( 'efc_ideas_all' ) ).split( '|' ).map( ( l ) => ( { label: l, text: l.replace( /^[^\p{L}\p{N}]+/u, '' ) } ) );
		if ( ! chat.more ) return setChips( ideas.slice( 0, 4 ).concat( [ { k: 'persona', topic: 'story', label: '🤖 ' + t( 'efc_c_about' ), text: t( 'efc_c_about' ) }, { k: 'persona', topic: 'likes', label: '🎶 ' + t( 'efc_c_likes' ), text: t( 'efc_c_likes' ) }, { k: 'more', label: '➕ ' + t( 'efc_more' ) } ] ) );
		const asks = String( t( 'efc_asks' ) ).split( '|' ).map( ( x ) => { const i = x.indexOf( ':' ); return { k: 'persona', topic: x.slice( 0, i ), label: x.slice( i + 1 ), text: x.slice( i + 1 ).replace( /^[^\p{L}\p{N}]+/u, '' ) }; } );
		setChips( [ { k: 'head', label: t( 'efc_h_buy' ) } ].concat( ideas, [ { k: 'head', label: t( 'efc_h_know' ) } ], asks, [ { k: 'more', label: '➖ ' + t( 'efc_less' ) } ] ) );
	};
	/** The ✨ button above Send: brings back the ideas (while eFriend is asking what) and the questions to ask him, at any moment. */
	const toggleMenu = () => {
		if ( chat.busy || chat.over || chat.locked ) return;
		if ( chat.menuOn ) { chat.menuOn = false; setChips( chat.chipsBefore || [] ); return; }
		chat.menuOn = true; chat.chipsBefore = chat.chips.slice();
		const ideas = String( t( 'efc_ideas_all' ) ).split( '|' ).map( ( l ) => ( { label: l, text: l.replace( /^[^\p{L}\p{N}]+/u, '' ) } ) );
		const asks = String( t( 'efc_asks' ) ).split( '|' ).map( ( x ) => { const i = x.indexOf( ':' ); return { k: 'persona', topic: x.slice( 0, i ), label: x.slice( i + 1 ), text: x.slice( i + 1 ).replace( /^[^\p{L}\p{N}]+/u, '' ) }; } );
		setChips( ( chat.stage === 'what' ? [ { k: 'head', label: t( 'efc_h_buy' ) } ].concat( ideas ) : [] ).concat( [ { k: 'head', label: t( 'efc_h_know' ) } ], asks, [ { k: 'menuclose', label: '✖ ' + t( 'efc_menu_close' ) } ] ) );
		const bx = document.getElementById( 'efChips' ); if ( bx ) bx.scrollTop = 0;
	};
	const aboutChips = () => [ { k: 'persona', topic: 'story', label: '🤖 ' + t( 'efc_c_about' ), text: t( 'efc_c_about' ) }, { k: 'persona', topic: 'likes', label: '🎶 ' + t( 'efc_c_likes' ), text: t( 'efc_c_likes' ) } ];
	const whenChips = () => setChips( [ { by: 3, label: '🔥 ' + t( 'efc_wc1' ) }, { by: 14, label: '📅 ' + t( 'efc_wc2' ) }, { by: 30, label: '🗓️ ' + t( 'efc_wc3' ) }, { by: null, label: '🕊️ ' + t( 'efc_wc4' ) } ] );
	const nextQ = async () => {
		if ( ! chat.item ) { chat.stage = 'what'; return say( [ pool( 'efc_askwhat' ) ], { mood: 'happy' } ); }
		if ( ! chat.cost ) { chat.stage = 'price'; return say( [ pool( 'efc_askprice' ) ], { mood: 'happy' } ); }
		if ( chat.by === undefined ) { chat.stage = 'when'; await say( [ pool( 'efc_askurg' ) ], { mood: 'happy' } ); return whenChips(); }
		return recap();
	};
	const urgencyKey = ( d ) => ( d == null ? 'later' : d <= 3 ? 'now' : 'soon' );
	const sayItem = () => say( [ chat.who ? pool( 'efc_re_for', { item: itemName(), forwho: forWho() } ) : pool( 'efc_re_' + kindOf( chat.item ), { item: itemName() } ) ], { mood: 'cheer' } );
	const sayPrice = () => { const z = priceSize( chat.cost ); return say( [ pool( 'efc_pr_' + z, { cost: money$( chat.cost ) } ) ], { mood: z === 'huge' ? 'atrisk' : z === 'big' ? 'cheer' : 'happy' } ); };
	const sayWhen = () => say( [ pool( 'efc_ur_' + urgencyKey( chat.by ), { when: whenWords( chat.by ) } ) ], { mood: chat.by != null && chat.by <= 3 ? 'tight' : 'happy' } );
	const read = ( text, fix ) => ( { p: F.parseAsk( stripWhen( text ), fix ), w: F.parseWhen( text ) } );
	const setBy = ( w ) => { chat.by = w.none ? null : w.days; };
	const yesRe = /^\s*(yes|yeah|yep|yup|ok|okay|correct|right|sure|go|ναι|ναί|σωστά|οκ)\b/i, noRe = /^\s*(no|nope|όχι|οχι)\s*[.!]?\s*$/i;

	/** eFriend's own story (see efc_story and efc_p_*): an 80s bot who loves cassettes, disco, space movies, dancing when nobody looks, and the number 010001100. */
	const foldP = ( x ) => String( x || '' ).toLowerCase().normalize( 'NFD' ).replace( /[̀-ͯ]/g, '' );
	const PERSONA = [
		[ 'meet', /(\bchip\b|\bboogie\b|your friend|other robot|another robot|met each other|how did you (two )?meet|bluetooth|cable|φιλο σου|αλλο ρομποτ|πως γνωριστηκατε)/u ],
		[ 'story', /(tell me (about )?(yourself|your story)|who are you|about you|your story|introduce yourself|tell me everything about you|πες μου (για σενα|για εσενα|την ιστορια σου|τη ιστορια σου)|ποιος εισαι|συστησου|για σενα|για εσενα)/u ],
		[ 'age', /(how old|your age|when were you born|ποσων χρονων|ποσο χρονων|ποσων ετων|ηλικια σου|ποτε γεννηθηκες)/u ],
		[ 'from', /(where (are|were) you (from|born)|where did you (grow|come)|where do you (come|live)|grow up|που (μεγαλωσες|γεννηθηκες|μενεις)|απο που εισαι)/u ],
		[ 'name', /(your name|what are you called|what should i call you|πως σε λενε|ονομα σου)/u ],
		[ 'likes', /(what do you (like|love|enjoy)|your (hobbies|hobby|interests)|do you like|are you into|τι σου αρεσει|τι αγαπας|χομπι σου)/u ],
		[ 'music', /(\b(?:music|disco|song|band)\b|μουσικη|ντισκο|τραγουδι)/u ],
		[ 'movie', /(star wars|\bjedi\b|\bdarth\b|the force|\bmovies?\b|\bfilms?\b|πολεμο των αστρων|πολεμος των αστρων|ταινια|ταινιες)/u ],
		[ 'dance', /(\bdanc|\bboogie|\bmoves\b|χορευ|χορος|χορο)/u ],
		[ 'number', /(favou?rite number|lucky number|binary|αγαπημενος αριθμος|αγαπημενο νουμερο|δυαδικ)/u ],
		[ 'shy', /(\b(?:shy|nervous)\b|ντροπαλ)/u ],
		[ 'maker', /(who (made|built|created|invented) you|your (creator|maker|father|dad)|ποιος σε (εφτιαξε|φτιαξε|δημιουργησε)|δημιουργος σου)/u ],
		[ 'ai', /(are you (an? )?(ai|robot|bot|human|real|chatgpt|alive)|chatgpt|artificial|τεχνητη νοημοσυνη|εισαι (ai|ρομποτ|ανθρωπος|πραγματικος))/u ],
		[ 'home', /(where do you live|your home|your house|που μενεις|σπιτι σου)/u ],
		[ 'family', /(family|brother|sister|parents|girlfriend|boyfriend|married|οικογενεια|αδερφος|αδερφη|γονεις)/u ],
		[ 'food', /(\b(?:eat|food|hungry|drink)\b|τρως|φαγητο|πεινας|πινεις)/u ],
		[ 'color', /(\bcolou?r\b|χρωμα)/u ],
		[ 'cassette', /(\b(?:cassettes?|tapes?|vinyl|analog|retro|80s|eighties)\b|nostalg|κασετα|αναλογικ|ρετρο|δεκαετια)/u ],
		[ 'how', /(how are you|how do you do|how'?s it going|what'?s up|are you ok|τι κανεις|πως εισαι|πως πας)/u ],
		[ 'joke', /(tell me a joke|a joke|make me laugh|ανεκδοτο|αστειο)/u ],
	];
	const personaTopic = ( text ) => {
		const x = foldP( text ); if ( ! /[?;]/.test( text ) && ! /(^|[^a-zα-ω])(you|your|yourself|σου|εσυ|εσενα|εισαι|πες μου|tell me)(?![a-zα-ω])/u.test( x ) ) return null;
		const p = PERSONA.find( ( q ) => q[ 1 ].test( x ) ); return p ? p[ 0 ] : null;
	};
	const pp = ( topic ) => { const k = F.char() === 'chip' ? 'efc_pc_' + topic : 'efc_p_' + topic; return String( t( k ) ) !== k ? pool( k ) : pool( 'efc_p_' + topic ); };
	const sayStory = async () => { for ( const part of String( t( F.char() === 'chip' ? 'efc_story_chip' : 'efc_story' ) ).split( '~' ) ) { await say( [ part ], { mood: 'cheer', delay: 1400 } ); if ( chat.chain !== chat.tok ) return; } };
	/** The bubble in which the person gave the price gets a pencil, so a wrong amount can be fixed before moving on. */
	const rerender = ( m ) => { const el = document.querySelector( `[data-mid="${ m.id }"]` ); if ( el ) el.outerHTML = bubble( m ); };
	const markAmount = () => { const m = chat.lastMe; if ( ! m ) return; chat.msgs.forEach( ( x ) => { if ( x.amount && x !== m ) { x.amount = false; rerender( x ); } } ); m.amount = true; rerender( m ); };
	const startEdit = ( id ) => {
		if ( chat.busy || chat.over ) return; const m = chat.msgs.find( ( x ) => x.id === id ), el = document.querySelector( `[data-mid="${ id }"] .ef-mb` ); if ( ! m || ! el ) return;
		el.innerHTML = `<form class="ef-editf" data-ef-editf="${ esc( id ) }" novalidate><input name="amt" inputmode="decimal" autocomplete="off" value="${ esc( String( chat.cost / 100 ) ) }" aria-label="${ esc( t( 'efc_edit' ) ) }"><button type="submit" class="btn btn-primary sm" aria-label="OK">✓</button><button type="button" class="btn btn-ghost sm" data-ef-editx="${ esc( id ) }" aria-label="${ esc( t( 'close' ) ) }">✕</button></form>`;
		const i = el.querySelector( 'input' ); if ( window.EXKB ) EXKB.allow(); if ( i ) { i.focus( { preventScroll: true } ); try { i.select(); } catch ( x ) { /* ignore */ } }
	};
	document.addEventListener( 'submit', async ( e ) => {
		const f = e.target; if ( ! f.dataset || ! f.dataset.efEditf ) return; e.preventDefault();
		const m = chat.msgs.find( ( x ) => x.id === f.dataset.efEditf ), cost = amtCents( f.elements.amt.value ); if ( ! m ) return; if ( ! cost ) { f.elements.amt.focus(); return; }
		if ( chat.busy || chat.over ) return; chat.busy = true; const tok = chat.tok; chat.chain = tok;
		try {
			chat.cost = cost; m.text = fmtCents( cost ); rerender( m ); saveChat();
			await say( [ pool( 'efc_amt_fixed', { cost: money$( cost ) } ) ], { mood: 'cheer' } ); if ( ! live( tok ) ) return;
			if ( chat.stage === 'confirm' ) { chat.busy = false; await recap(); }
		} finally { if ( tok === chat.tok ) chat.busy = false; }
	} );
	const onUserCore = async ( text, chip ) => {
		if ( chat.busy ) return; chat.busy = true; const tok = chat.tok; chat.chain = tok;
		try {
			{ const m = { who: 'me', text, id: EX.uid() }; chat.msgs.push( m ); appendMsg( m ); saveChat(); chat.lastMe = m; } chat.menuOn = false; setChips( [] ); scrollEnd(); await wait( 600 ); if ( ! live( tok ) ) return;
			const st = chat.stage;
			// eFriend answers about himself from his own story; anything else he cannot answer gets the retro joke
			const asksCost = F.parseAsk( stripWhen( text ) ).cost, topic = chip && chip.k === 'persona' ? chip.topic : ! chip && ! asksCost && ! F.parseWhen( text ) ? personaTopic( text ) : null;
			if ( topic ) {
				if ( topic === 'story' ) await sayStory(); else await say( [ pp( topic ) ], { mood: 'cheer', delay: 1500 } );
				if ( ! live( tok ) ) return;
				await say( [ pool( 'efc_p_back' ) ], { mood: 'happy' } ); if ( ! live( tok ) ) return;
				return await ( st === 'confirm' ? recap() : st === 'fix' ? say( [ pool( 'efc_fix' ) ], { mood: 'happy' } ) : nextQ() );
			}
			// eFriend is no AI chatbot: a real question gets a retro joke, then the pending question again
			if ( /[?;]/.test( text ) && ! chip && ! F.parseAsk( stripWhen( text ) ).cost && ! F.parseWhen( text ) && ! ( st === 'what' && /buy|afford|get|purchase|order|book|αγορ|πάρω|παρω/i.test( text ) ) ) {
				await say( [ pool( F.char() === 'chip' ? 'efc_q_chip' : 'efc_q' ) ], { mood: 'cheer', delay: 1500 } ); if ( ! live( tok ) ) return;
				return await ( st === 'confirm' ? recap() : st === 'fix' ? say( [ pool( 'efc_fix' ) ], { mood: 'happy' } ) : nextQ() );
			}
			if ( st === 'confirm' || st === 'fix' ) {
				if ( ( chip && chip.k === 'yes' ) || ( st === 'confirm' && yesRe.test( text ) && ! /\d/.test( text ) ) ) return await finish();
				if ( ( chip && chip.k === 'fix' ) || noRe.test( text ) ) { chat.stage = 'fix'; return await say( [ pool( 'efc_fix' ) ], { mood: 'happy' } ); }
				const { p, w } = read( text, true ); let changed = false;
				if ( p.item ) { chat.item = p.item; changed = true; } if ( p.cost ) { chat.cost = p.cost; changed = true; } if ( w ) { setBy( w ); changed = true; }
				if ( ! changed ) { chat.stuck++; return await say( [ pool( 'efc_fix' ) ], { mood: 'happy' } ); }
				await say( [ pool( 'efc_changed' ) ], { mood: 'cheer' } ); return await recap();
			}
			if ( st === 'when' ) {
				const w = chip && 'by' in chip ? ( chip.by == null ? { none: true } : { days: chip.by } ) : F.parseWhen( text );
				if ( ! w ) { chat.stuck++; return await say( [ pool( 'efc_nowhen' ) ], { mood: 'happy' } ); }
				setBy( w ); await sayWhen(); return await nextQ();
			}
			if ( st === 'price' ) {
				const { p, w } = read( text, true ); if ( ! p.cost ) { chat.stuck++; return await say( [ pool( 'efc_nocost' ) ], { mood: 'meh' } ); }
				chat.cost = p.cost; markAmount(); if ( p.item && ! chat.item ) { chat.item = p.item; await sayItem(); } await sayPrice(); if ( w ) { setBy( w ); await sayWhen(); } return await nextQ();
			}
			// the first message (or an answer to "what is it?")
			const { p, w } = read( text, false ); const hadItem = !! chat.item, hadCost = !! chat.cost;
			if ( ! p.item && ! p.cost && ! w ) chat.stuck++;
			if ( p.item ) chat.item = p.item; if ( p.who ) chat.who = p.who; if ( p.cost ) { chat.cost = p.cost; markAmount(); } if ( w ) setBy( w );
			if ( p.item && ! hadItem ) await sayItem(); if ( p.cost && ! hadCost ) await sayPrice(); if ( w ) await sayWhen();
			return await nextQ();
		} finally { if ( tok === chat.tok ) chat.busy = false; }
	};

	/** When the chat goes round in circles: offer the quick form (what, how much, when) inside the chat. The person can always decline. */
	const offerForm = async () => {
		if ( chat.busy || chat.over ) return; chat.busy = true; const tok = chat.tok; chat.chain = tok; chat.formOffered = true; lockInput( true, t( 'efc_f_choose' ) );
		try { await say( [ pool( 'efc_f_offer' ) ], { mood: 'happy', instant: true } ); if ( ! live( tok ) ) return; setChips( [ { k: 'form', label: '📝 ' + t( 'efc_f_chip' ) }, { k: 'keep', label: '💬 ' + t( 'efc_f_keep' ) } ] ); } finally { if ( tok === chat.tok ) chat.busy = false; }
	};
	const onUser = async ( text, chip ) => {
		if ( chat.over || chat.busy ) return; chat.turns++;
		if ( chat.stage === 'price' && /^[\d.,]+$/.test( text ) ) text = fmtCents( amtCents( text ) );
		await onUserCore( text, chip );
		if ( chat.over || chat.busy || chat.stage === 'done' || chat.stage === 'confirm' || chat.formOffered ) return;
		if ( chat.stuck >= 2 || chat.turns >= 7 ) await offerForm();
	};
	const showForm = async ( force ) => {
		if ( chat.over || ( chat.busy && ! force ) ) return;
		if ( force ) { chat.tok++; chat.typing = false; hideTyping(); setChips( [] ); const old = document.getElementById( 'efQForm' ); if ( old ) { old.scrollIntoView( { block: 'center' } ); chat.busy = false; return; } }
		chat.busy = true; const tok = chat.tok; chat.chain = tok;
		try {
			if ( ! force ) { const mm = { who: 'me', text: '📝 ' + t( 'efc_f_chip' ) }; chat.msgs.push( mm ); appendMsg( mm ); setChips( [] ); scrollEnd(); await wait( 500 ); }
			lockInput( true, t( 'efc_f_filling' ) ); await say( [ pool( 'efc_f_ask' ) ], { mood: 'cheer', instant: true } ); if ( ! live( tok ) ) return;
			const fm = { who: 'ef', form: true, lines: [] }; chat.msgs.push( fm ); appendMsg( fm ); scrollEnd();
			} finally { if ( tok === chat.tok ) chat.busy = false; }
	};
	const keepChatting = async () => {
		if ( chat.busy || chat.over ) return; chat.busy = true; const tok = chat.tok; chat.chain = tok;
		try { const mm = { who: 'me', text: '💬 ' + t( 'efc_f_keep' ) }; chat.msgs.push( mm ); appendMsg( mm ); setChips( [] ); scrollEnd(); chat.stuck = -3; chat.turns = 0; lockInput( false ); await say( [ pool( 'efc_f_keepsay' ) ], { mood: 'cheer', instant: true } ); } finally { if ( tok === chat.tok ) chat.busy = false; }
	};
	document.addEventListener( 'change', ( e ) => {
		const f = e.target.closest && e.target.closest( '#efQForm' ); if ( ! f ) return;
		if ( e.target.name === 'when' && e.target.value ) f.elements.norush.checked = false;
		if ( e.target.name === 'norush' ) { f.elements.when.disabled = e.target.checked; if ( e.target.checked ) f.elements.when.value = ''; }
	} );
	document.addEventListener( 'input', ( e ) => { const f = e.target.closest && e.target.closest( '#efQForm' ); if ( f && e.target.name === 'when' && e.target.value ) f.elements.norush.checked = false; } );
	document.addEventListener( 'submit', async ( e ) => {
		const f = e.target; if ( f.id !== 'efQForm' ) return; e.preventDefault();
		if ( chat.busy || chat.over ) return;
		const what = f.elements.what.value.trim(), cost = amtCents( f.elements.cost.value ), when = f.elements.when.value, norush = f.elements.norush.checked, err = document.getElementById( 'efQErr' );
		if ( ! what || ! cost ) { err.textContent = t( 'efc_f_err' ); err.hidden = false; return; }
		chat.busy = true; const tok = chat.tok; chat.chain = tok; lockInput( false );
		try {
			chat.item = what.charAt( 0 ).toUpperCase() + what.slice( 1 ); chat.cost = cost; chat.who = ''; chat.by = norush || ! when ? null : Math.max( 0, diff( when, today() ) );
			const node = f.closest( '.ef-msg' ), idx = chat.msgs.findIndex( ( x ) => x.form ); if ( idx >= 0 ) chat.msgs[ idx ] = { who: 'me', text: `${ chat.item } · ${ money$( cost ) } · ${ whenWords( chat.by ) }` };
			if ( node ) node.outerHTML = bubble( chat.msgs[ idx ] ); scrollEnd(); saveChat(); chat.stuck = 0; await wait( 500 );
			chat.busy = false; await finish();
		} finally { if ( tok === chat.tok ) chat.busy = false; }
	} );
	/** Time is up (five minutes), or the app was closed mid-chat: eFriend falls asleep, and says so. */
	const sleepChat = async ( kind ) => {
		const box = chatBox(); if ( ! box || chat.over ) return;
		chat.over = true; chat.locked = false; chat.tok++; chat.chain = chat.tok; chat.busy = false; chat.typing = false; clearTimeout( chat.timer ); hideTyping(); setChips( [] );
		const q = document.getElementById( 'efChatQ' ); if ( q ) { q.value = ''; q.disabled = true; q.placeholder = t( 'efc_zzz_ph' ); const b = q.closest( 'form' ).querySelector( 'button[type=submit]' ); if ( b ) b.disabled = true; const mb = q.closest( 'form' ).querySelector( '.ef-menubtn' ); if ( mb ) mb.disabled = true; }
		setMood( 'meh' ); const m = { who: 'ef', lines: [ pool( kind === 'timeout' ? 'efc_timeout' : 'efc_sleep' ) ], mood: 'meh' }; chat.msgs.push( m ); appendMsg( m ); scrollEnd();
		const st = document.getElementById( 'efCpStat' ); if ( st ) st.textContent = t( 'efc_asleep' );
		setChips( [ { k: 'wake', label: '☀️ ' + t( 'efc_wake' ) }, { k: 'hist', label: '🕘 ' + t( 'efc_h_title' ) } ] );
		delete ( S().device || {} ).efLiveChat; saveChat();
	};

	EXA.efriendChatSleep = ( kind ) => sleepChat( kind || 'timeout' );
	/* The decision: the best day, inside the person's window when they gave one. */
	const decide = ( a, by ) => {
		const inWin = ( x ) => by == null || x.i <= by, good = a.days.find( ( x ) => inWin( x ) && ( x.st === 'best' || x.st === 'good' ) );
		if ( good ) return { kind: 'ok', day: good };
		const tight = by != null ? a.days.find( ( x ) => x.i <= by && x.st === 'tight' ) : null;
		if ( tight ) return { kind: 'tight', day: tight, alt: a.first };
		if ( a.first ) return { kind: 'late', day: a.first };
		return { kind: 'none', day: null };
	};
	/** One month at a time, opened on the best day, with arrows to go back or forward. */
	const monthsOf = ( a ) => { const months = []; a.days.forEach( ( x ) => { let g = months[ months.length - 1 ]; if ( ! g || g.k !== x.d.slice( 0, 7 ) ) { g = { k: x.d.slice( 0, 7 ), days: [] }; months.push( g ); } g.days.push( x ); } ); return months; };
	const calHtml = ( a ) => {
		const wd = Array.from( { length: 7 }, ( _, i ) => new Intl.DateTimeFormat( EX.loc(), { weekday: 'short' } ).format( new Date( 2024, 0, 1 + i ) ).slice( 0, 2 ) ), months = monthsOf( a ), mi = Math.max( 0, Math.min( months.length - 1, chat.mi ) ), g = months[ mi ];
		const star = chat.rec && chat.rec.day ? chat.rec.day.i : -1, first = parse( g.days[ 0 ].d ), cells = []; for ( let i = 0; i < ( first.getDay() + 6 ) % 7; i++ ) cells.push( '<i class="ef-cal-x"></i>' );
		g.days.forEach( ( x ) => { cells.push( `<button type="button" class="ef-cal-d st-${ x.st }${ x.i === chat.sel ? ' sel' : '' }${ x.i === 0 ? ' now' : '' }" style="--i:${ x.i % 31 }" data-ef-askday="${ x.i }" aria-label="${ esc( EX.dayName( x.d ) ) }"><b>${ parse( x.d ).getDate() }</b><span class="mk">${ x.inc.length ? '💶' : '' }${ x.bills.length ? '🧾' : '' }</span>${ star === x.i ? '<em>⭐</em>' : '' }</button>` ); } );
		const nav = `<div class="ef-cal-nav"><button type="button" class="ab-btn" data-ef-mon="-1" aria-label="‹"${ mi === 0 ? ' disabled' : '' }>‹</button><b>${ esc( first.toLocaleDateString( EX.loc(), { month: 'long', year: 'numeric' } ) ) }</b><button type="button" class="ab-btn" data-ef-mon="1" aria-label="›"${ mi === months.length - 1 ? ' disabled' : '' }>›</button></div>`;
		return `<div class="ef-cal" role="group" aria-label="${ esc( t( 'efAskCalTitle' ) ) }">${ nav }<div class="ef-cal-wd">${ wd.map( ( w ) => `<span>${ w }</span>` ).join( '' ) }</div><div class="ef-cal-g">${ cells.join( '' ) }</div></div><div class="ef-cal-legend"><span class="st-best">${ esc( t( 'efAskLBest' ) ) }</span><span class="st-good">${ esc( t( 'efAskLGood' ) ) }</span><span class="st-tight">${ esc( t( 'efAskLTight' ) ) }</span><span class="st-avoid">${ esc( t( 'efAskLAvoid' ) ) }</span><span>💶 ${ esc( t( 'efAskLPay' ) ) }</span><span>🧾 ${ esc( t( 'efAskLBill' ) ) }</span><span>⭐ ${ esc( t( 'efAskLStar' ) ) }</span></div>`;
	};
	const dayDetail = ( a ) => {
		const x = a.days[ chat.sel ] || a.days[ 0 ], mk = [];
		if ( x.inc.length ) mk.push( t( 'efAskMkPay', { n: x.inc.join( ', ' ) } ) ); if ( x.bills.length ) mk.push( t( 'efAskMkBill', { n: x.bills.join( ', ' ) } ) );
		return points( [ t( 'efAskDay_' + x.st, { d: EX.dayName( x.d ), a: money$( Math.max( 0, x.low ) ) } ) ].concat( x.low < 0 ? [ t( 'efAskDayShort', { a: money$( -x.low ) } ) ] : [] ).concat( mk ) );
	};
	const planDate = ( a ) => { const sel = a.days[ chat.sel ] || a.days[ 0 ]; return sel.st === 'best' || sel.st === 'good' ? sel.d : chat.rec && chat.rec.day ? chat.rec.day.d : ''; };
	/** The balance, day by day for four months: without the purchase, with it on the chosen day, and the safety cushion. The lines draw themselves. */
	const graphHtml = ( a ) => {
		const N = a.days.length, W = 320, H = 150, P = 12, r = chat.rec && chat.rec.day ? chat.rec.day.i : 0, base = a.tl.map( ( x ) => x.bal ), withp = base.map( ( v, k ) => ( k >= r ? v - a.cost : v ) );
		const vals = base.concat( withp, [ 0, a.cushion ] ), lo = Math.min( ...vals ), hi = Math.max( ...vals ), span = Math.max( 1, hi - lo );
		const X = ( k ) => P + ( W - 2 * P ) * k / ( N - 1 ), Y = ( v ) => H - P - ( H - 2 * P ) * ( v - lo ) / span, path = ( arr ) => arr.map( ( v, k ) => ( k ? 'L' : 'M' ) + X( k ).toFixed( 1 ) + ' ' + Y( v ).toFixed( 1 ) ).join( '' );
		const bad = Math.min( ...withp ) < 0, zero = lo < 0 && hi > 0 ? `<line x1="${ P }" x2="${ W - P }" y1="${ Y( 0 ).toFixed( 1 ) }" y2="${ Y( 0 ).toFixed( 1 ) }" class="ef-g0"/>` : '', cush = a.cushion > 0 ? `<line x1="${ P }" x2="${ W - P }" y1="${ Y( a.cushion ).toFixed( 1 ) }" y2="${ Y( a.cushion ).toFixed( 1 ) }" class="ef-gc"/>` : '';
		return `<svg class="ef-graph" viewBox="0 0 ${ W } ${ H }" role="img" aria-label="${ esc( t( 'efc_g_title' ) ) }">${ zero }${ cush }<path d="${ path( base ) }" pathLength="1" class="ef-gl base"/><path d="${ path( withp ) }" pathLength="1" class="ef-gl with${ bad ? ' bad' : '' }"/><line x1="${ X( r ).toFixed( 1 ) }" x2="${ X( r ).toFixed( 1 ) }" y1="${ P - 4 }" y2="${ H - P }" class="ef-gm"/><text x="${ X( r ).toFixed( 1 ) }" y="${ P + 4 }" class="ef-gt" text-anchor="${ r > N / 2 ? 'end' : 'start' }" dx="${ r > N / 2 ? -4 : 4 }">🛍️</text></svg>
			<div class="ef-g-leg"><span class="a">${ esc( t( 'efc_g_base' ) ) }</span><span class="b${ bad ? ' bad' : '' }">${ esc( t( 'efc_g_with' ) ) }</span>${ a.cushion > 0 ? `<span class="c">${ esc( t( 'efc_g_cush' ) ) }</span>` : '' }</div><div class="ef-g-dates"><span>${ esc( EX.dayName( a.days[ 0 ].d ) ) }</span><span>${ esc( EX.dayName( a.days[ N - 1 ].d ) ) }</span></div>`;
	};
	const resultHtml = () => {
		const a = chat.ans, rec = chat.rec, em = F.askIcon( chat.item ).em, st = a.today.st, mood = st === 'best' ? 'comfortable' : st === 'good' ? 'ontrack' : st === 'tight' ? 'tight' : 'atrisk';
		const head = pool( 'efc_res_' + ( st === 'avoid' && rec.kind === 'none' ? 'none' : st ) ), lines = [ askLine( a, chat.item ) ];
		if ( chat.by != null ) lines.push( rec.kind === 'ok' ? t( 'efc_fit_ok', { d: EX.dayName( rec.day.d ) } ) : rec.kind === 'tight' ? t( 'efc_fit_tight', { d: EX.dayName( rec.day.d ) } ) : rec.kind === 'late' ? t( 'efc_fit_late', { d: EX.dayName( rec.day.d ) } ) : t( 'efc_fit_none' ) );
		if ( ! a.hasIncome ) lines.push( t( 'efNoIncomeAsk' ) );
		if ( rec.kind !== 'ok' ) { const win = chat.by != null ? a.days.filter( ( x ) => x.i <= chat.by ) : a.days, gap = a.cushion - Math.max( ...win.map( ( x ) => x.low ) ); if ( gap > 0 ) { const months = Math.max( 1, chat.by != null ? chat.by / 30 : 4 ); lines.push( t( 'efc_help_gap', { a: money$( gap ) } ), t( 'efc_help_save', { a: money$( gap / months ) } ) ); } }
		const lowShown = rec.day ? rec.day.low : a.today.low, d = planDate( a );
		return `<div class="ef-res${ chat.anim ? ' anim' : '' }"><div class="ef-burst" aria-hidden="true"></div><div class="ef-top">${ F.mascot( mood, 84 ) }<div class="ef-bubble"><b>${ esc( head ) }</b></div></div>
			<div class="ef-res-item"><span class="ef-em">${ em }</span><div><b>${ esc( itemName() ) }</b><small>${ esc( whenWords( chat.by ) ) }</small></div><b class="ef-res-cost" data-count="${ a.cost }">${ esc( money$( a.cost ) ) }</b></div>
			<div class="ef-res-lines">${ points( lines ) }</div>
			<div class="btn-row ef-ask-btns ef-hero-btns"><button type="button" class="btn btn-primary" data-ef-askplan="${ esc( d ) }">🎯 ${ esc( d ? t( 'efAskMakePlan', { d: EX.dayName( d ) } ) : t( 'efChatPlan' ) ) }</button><button type="button" class="btn btn-ghost" data-ef-again>💬 ${ esc( t( 'efChatAgain' ) ) }</button></div>
			<ul class="ef-tiles ef-tiles3"><li class="ef-tile"><span class="ef-tile-em">🛍️</span><small>${ esc( t( 'efTileCost' ) ) }</small><b data-count="${ a.cost }">${ esc( money$( a.cost ) ) }</b></li><li class="ef-tile ${ lowShown >= a.cushion ? 'good' : lowShown < 0 ? 'bad' : '' }"><span class="ef-tile-em">📉</span><small>${ esc( t( 'efAskLow' ) ) }</small><b data-count="${ lowShown }">${ esc( ( lowShown < 0 ? '−' : '' ) + money$( Math.abs( lowShown ) ) ) }</b></li><li class="ef-tile ${ rec.day ? 'good' : '' }"><span class="ef-tile-em">⭐</span><small>${ esc( t( 'efAskBestDay' ) ) }</small><b>${ esc( rec.day ? EX.dayName( rec.day.d ) : '–' ) }</b></li></ul>
			<h3 class="ef-h">📅 ${ esc( t( 'efAskCalTitle' ) ) }</h3>${ calHtml( a ) }<div class="ef-callouts" id="efAskDetail">${ dayDetail( a ) }</div>
			<h3 class="ef-h">📈 ${ esc( t( 'efc_g_title' ) ) }</h3>${ graphHtml( a ) }<p class="muted small">${ esc( t( 'efAskNote' ) ) }</p></div>`;
	};
	const countUp = ( root ) => root.querySelectorAll( '[data-count]' ).forEach( ( el ) => {
		const v = Number( el.dataset.count ); if ( reduceMotion() || ! v ) return; const t0 = performance.now(), D = 900;
		const tick = ( now ) => { const k = Math.min( 1, ( now - t0 ) / D ), e = 1 - Math.pow( 1 - k, 3 ), x = Math.round( v * e ); el.textContent = ( x < 0 ? '−' : '' ) + money$( Math.abs( x ) ); if ( k < 1 ) requestAnimationFrame( tick ); }; requestAnimationFrame( tick );
	} );
	const burst = ( root ) => { const b = root.querySelector( '.ef-burst' ); if ( ! b || reduceMotion() ) return; b.innerHTML = Array.from( { length: 18 }, ( _, i ) => `<i style="--x:${ ( Math.random() * 100 ).toFixed( 0 ) }%;--r:${ Math.round( Math.random() * 360 ) }deg;--d:${ ( Math.random() * .6 ).toFixed( 2 ) }s">${ [ '🎉', '✨', '⭐', '💚' ][ i % 4 ] }</i>` ).join( '' ); setTimeout( () => { b.innerHTML = ''; }, 2600 ); };
	/** Back in the app: the result opens as a sheet that rises over the app, and its numbers, line and calendar animate in. */
	const showResult = () => {
		const X = `<button type="button" class="ab-btn" data-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button>`;
		chat.anim = true; UI.openSheet( `<div class="sheet-head">${ X }<h2 id="sheetTitle">💬 ${ esc( t( 'efAskTitle' ) ) }</h2><span class="sp"></span></div><div class="sheet-pad ef-ask-sheet" id="efRes">${ resultHtml() }</div>`, { tall: true } );
		const top = () => { const r = document.getElementById( 'efRes' ), sc = r && ( r.closest( '.sheet-scroll' ) || r.parentNode ); if ( sc ) sc.scrollTop = 0; if ( document.activeElement && document.activeElement.blur ) document.activeElement.blur(); }; top(); setTimeout( top, 120 ); setTimeout( top, 450 );
		if ( embedded() ) { const sh = document.getElementById( 'sheet' ); if ( sh ) sh.addEventListener( 'close', () => { if ( chat.keepEmbed ) { chat.keepEmbed = false; return; } if ( window.EXAEmbedEnd ) EXAEmbedEnd(); }, { once: true } ); }
		setTimeout( () => { const r = document.getElementById( 'efRes' ); if ( ! r ) return; countUp( r ); if ( chat.rec && chat.rec.kind === 'ok' ) burst( r ); chat.anim = false; }, 250 );
	};
	const repaintResult = () => { const r = document.getElementById( 'efRes' ); if ( r ) { chat.anim = false; const y = r.closest( '.sheet-scroll' ) || r.parentNode; const top = y ? y.scrollTop : 0; r.innerHTML = resultHtml(); if ( y ) y.scrollTop = top; } };

	/* Past chats: every chat with at least one message from the person is kept (the last 30), so they can be read again or asked again with today's numbers. */
	/** Chat history lives on this device only: the sync server accepts about 8,000 characters per record, and the settings record must never grow past that. */
	const histList = () => {
		const d = S().device, st = S().settings;
		if ( st.efChats ) { d.efChats = ( d.efChats || [] ).concat( st.efChats ).slice( 0, 30 ); delete st.efChats; st.u = Date.now(); }
		return ( d.efChats = d.efChats || [] );
	};
	/** Keep the synced settings small: older eFriend history is trimmed when they get close to the server's limit. */
	F.trimSettings = () => {
		const st = S().settings; let n = JSON.stringify( st ).length; if ( n < 6500 ) return false;
		const cut = ( o, keep ) => Object.keys( o || {} ).forEach( ( k ) => { if ( Array.isArray( o[ k ] ) && o[ k ].length > keep ) o[ k ] = o[ k ].slice( -keep ); } );
		cut( st.efHistory, 40 ); cut( st.efEvents, 10 ); if ( Array.isArray( st.efProposals ) && st.efProposals.length > 6 ) st.efProposals = st.efProposals.slice( -6 );
		if ( JSON.stringify( st ).length >= 6500 ) { cut( st.efHistory, 15 ); cut( st.efEvents, 4 ); }
		st.u = Date.now(); return true;
	};
	const saveChat = () => {
		if ( ! chat.id || ! chat.msgs.some( ( x ) => x.who === 'me' ) ) return;
		const rec = { id: chat.id, ts: chat.ts, item: chat.item, who: chat.who, cost: chat.cost, by: chat.by, msgs: chat.msgs.map( ( x ) => ( x.who === 'me' ? { w: 'me', t: x.text } : { w: 'ef', l: x.lines, m: x.mood } ) ), done: chat.stage === 'done', st: chat.ans ? chat.ans.today.st : '', kind: chat.rec ? chat.rec.kind : '', rd: chat.rec && chat.rec.day ? chat.rec.day.d : '' };
		const l = histList(), i = l.findIndex( ( x ) => x.id === rec.id ); if ( i >= 0 ) l[ i ] = rec; else l.unshift( rec ); if ( l.length > 30 ) l.length = 30;
		try { EX.persist(); } catch ( e ) { /* ignore */ }
	};
	const VERD = { best: 'comfortable', good: 'ontrack', tight: 'tight', avoid: 'atrisk' };
	const histHtml = ( id ) => {
		const l = histList(), r = id ? l.find( ( x ) => x.id === id ) : null, back = `<button type="button" class="btn btn-ghost sm" data-ef-hback>← ${ esc( t( 'efc_h_back' ) ) }</button>`;
		if ( r ) return `<div class="ef-hist-h">${ back }<b>${ esc( ( F.askIcon( r.item ).em ) + ' ' + ( r.item || t( 'efAskThing' ) ) ) }</b></div><div class="ef-chat ef-hist-chat">${ r.msgs.filter( ( x ) => x.w === 'me' || ( x.l && x.l.length ) ).map( ( x ) => ( x.w === 'me' ? `<div class="ef-msg me"><div class="ef-mb">${ esc( x.t ) }</div></div>` : `<div class="ef-msg ef"><span class="ef-av">${ F.icon( 30 ) }</span><div class="ef-mb">${ x.l.map( ( q ) => `<p class="ef-ml">${ rich( q ) }</p>` ).join( '' ) }</div></div>` ) ).join( '' ) }</div><div class="btn-row ef-hist-act">${ r.cost ? `<button type="button" class="btn btn-primary" data-ef-hagain="${ esc( r.id ) }">🔁 ${ esc( t( 'efc_h_again' ) ) }</button>` : '' }<button type="button" class="btn btn-ghost" data-ef-hnew>💬 ${ esc( t( 'efc_h_new' ) ) }</button></div>`;
		return `<div class="ef-hist-h">${ back }<b>🕘 ${ esc( t( 'efc_h_title' ) ) }</b></div>${ l.length ? `<ul class="ef-hist-list">${ l.map( ( x ) => `<li><button type="button" class="ef-hrow" data-ef-hopen="${ esc( x.id ) }"><span class="ef-em">${ F.askIcon( x.item ).em }</span><span><b>${ esc( x.item || t( 'efAskThing' ) ) }</b><small>${ esc( [ x.cost ? money$( x.cost ) : '', EX.dayName( new Date( x.ts ).toISOString().slice( 0, 10 ) ) ].filter( Boolean ).join( ' · ' ) ) }</small></span>${ x.done && VERD[ x.st ] ? chip( VERD[ x.st ] ) : `<span class="ef-chip">${ esc( t( 'efc_h_open' ) ) }</span>` }</button><button type="button" class="ab-btn" data-ef-hdel="${ esc( x.id ) }" aria-label="${ esc( t( 'efc_h_del' ) ) }">${ UI.icon( 'trash', 20 ) }</button></li>` ).join( '' ) }</ul>` : `<p class="muted ef-hist-empty">${ esc( t( 'efc_h_empty' ) ) }</p>` }`;
	};
	const showHist = ( id ) => { const ov = document.querySelector( '.ef-cp' ); if ( ! ov ) return; let p = document.getElementById( 'efHist' ); if ( ! p ) { p = document.createElement( 'div' ); p.id = 'efHist'; p.className = 'ef-hist'; ov.appendChild( p ); } p.innerHTML = histHtml( id ); };
	const hideHist = () => { const p = document.getElementById( 'efHist' ); if ( p ) p.remove(); };
	const closeChat = () => { saveChat(); chat.tok++; clearTimeout( chat.timer ); if ( S().device && S().device.efLiveChat ) { delete S().device.efLiveChat; try { EX.persist(); } catch ( x ) { /* ignore */ } } const ov = document.querySelector( '.ef-cp' ); if ( ov ) ov.remove(); document.body.classList.remove( 'ef-ob-open' ); };
	/** The thinking screen: the robot scans, the checklist ticks, then the page opens like a curtain on the result. */
	const analysis = async () => {
		const tok = chat.tok, ov = document.querySelector( '.ef-cp' ); if ( ! ov ) return;
		chat.ans = F.answer( chat.cost ); chat.rec = decide( chat.ans, chat.by ); chat.sel = chat.rec.day ? chat.rec.day.i : 0; chat.mi = Math.max( 0, monthsOf( chat.ans ).findIndex( ( g ) => g.k === chat.ans.days[ chat.sel ].d.slice( 0, 7 ) ) );
		ov.classList.add( 'fading' ); await wait( 1000 ); if ( tok !== chat.tok ) return; ov.classList.remove( 'fading' );
		ov.classList.add( 'an' ); ov.innerHTML = `<div class="ef-an"><div class="ef-an-bot">${ F.mascot( 'happy', 130 ) }<i class="ef-scan"></i><i class="ef-scan s2"></i></div><h2>${ esc( pool( 'efc_think' ) ) }</h2><ul class="ef-an-steps">${ [ 1, 2, 3, 4, 5 ].map( ( n ) => `<li style="--i:${ n }"><span class="tick">✓</span>${ esc( t( 'efc_step' + n ) ) }</li>` ).join( '' ) }</ul><div class="ef-an-bar"><i></i></div></div>`;
		const items = [ ...ov.querySelectorAll( '.ef-an-steps li' ) ], bar = ov.querySelector( '.ef-an-bar i' );
		for ( let i = 0; i < items.length; i++ ) { await wait( 1100 + Math.random() * 600 ); if ( tok !== chat.tok ) return; items[ i ].classList.add( 'on' ); bar.style.width = Math.round( ( i + 1 ) / items.length * 100 ) + '%'; }
		await wait( 1000 ); if ( tok !== chat.tok ) return;
		ov.classList.add( 'out' ); await wait( 700 ); if ( tok !== chat.tok ) return;
		closeChat(); showResult();
	};
	const finish = async () => { chat.stage = 'done'; await say( [ pool( 'efc_close' ) ], { mood: 'cheer' } ); await wait( 2200 ); return analysis(); };

	const pickIdeas = async ( tok ) => {
		await say( [ t( 'efc_pick' ) ], { mood: 'happy', delay: 1020 } ); if ( ! live( tok ) ) return;
		startChips();
		const q = document.getElementById( 'efChatQ' ); if ( q && ! reduceMotion() && ! matchMedia( '(pointer: coarse)' ).matches ) q.focus( { preventScroll: true } ); // desktop only: a phone keyboard never opens by itself
	};
	/** "Start over": the chat is wiped (the old one stays in the history) and eFriend jokes about it. */
	const restartChat = async () => {
		const box = chatBox(); if ( ! box ) return;
		saveChat(); chat.tok++; chat.chain = chat.tok;
		chat.restarts++; Object.assign( chat, { menuOn: false, more: false, locked: false, stuck: 0, turns: 0, formOffered: false, over: false, id: EX.uid(), ts: Date.now(), msgs: [], stage: 'what', item: '', who: '', cost: 0, by: undefined, typing: false, busy: false, ans: null, rec: null, sel: 0, mi: 0, chips: [] } );
		const tok = chat.tok; lockInput( false ); hideTyping(); setChips( [] ); hideHist(); box.classList.add( 'clearing' ); await wait( 350 ); if ( tok !== chat.tok ) return;
		box.innerHTML = ''; box.classList.remove( 'clearing' );
		await say( [ pool( 'efc_reset' ) ], { mood: 'worried', delay: 1360 } ); if ( ! live( tok ) ) return;
		await pickIdeas( tok ); if ( chat.restarts >= 2 && live( tok ) ) await offerForm();
	};
	EXA.efriendAskOpen = ( prefill ) => {
		closeChat(); Object.assign( chat, { menuOn: false, more: false, locked: false, stuck: 0, turns: 0, formOffered: false, over: false, restarts: 0, id: EX.uid(), ts: Date.now(), msgs: [], stage: 'what', item: '', who: '', mi: 0, cost: 0, by: undefined, typing: false, busy: false, ans: null, rec: null, sel: 0, chips: [], used: {}, anim: true } );
		const ov = document.createElement( 'div' ); ov.className = 'ef-cp'; ov.setAttribute( 'role', 'dialog' ); ov.setAttribute( 'aria-modal', 'true' ); ov.setAttribute( 'aria-label', 'eFriend' );
		ov.innerHTML = `<header class="ef-cp-h"><button type="button" class="ab-btn" data-ef-cpx aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button><div class="ef-cp-who"><span class="ef-cp-av">${ F.mascot( 'happy', 46 ) }</span><div><b>${ esc( F.charName() ) }</b><small id="efCpStat">${ esc( t( 'efc_online' ) ) }</small></div></div><button type="button" class="ab-btn ef-cp-skip" data-ef-skip aria-label="${ esc( t( 'efc_skip' ) ) }" title="${ esc( t( 'efc_skip' ) ) }">📝</button><button type="button" class="ab-btn ef-cp-clear" data-ef-clear aria-label="${ esc( t( 'efc_clear' ) ) }" title="${ esc( t( 'efc_clear' ) ) }">🧹</button><button type="button" class="ab-btn ef-cp-hist" data-ef-hist aria-label="${ esc( t( 'efc_h_title' ) ) }" title="${ esc( t( 'efc_h_title' ) ) }">🕘</button></header>
			<div id="efChat" class="ef-chat" aria-live="polite"></div><div class="ef-chips" id="efChips"></div>
			<form id="efChatForm" class="ef-chat-in" novalidate autocomplete="off"><span class="ef-inwrap"><input name="q" id="efChatQ" autocomplete="off" enterkeyhint="send" placeholder="${ esc( t( 'efAskPh' ) ) }" aria-label="${ esc( t( 'efAskQ' ) ) }"><button type="button" class="ef-menubtn" data-ef-menu aria-label="${ esc( t( 'efc_menu' ) ) }" title="${ esc( t( 'efc_menu' ) ) }">✨</button></span><button type="submit" class="btn btn-primary" aria-label="${ esc( t( 'efAskGo' ) ) }">➤</button></form>`;
		document.body.appendChild( ov ); document.body.classList.add( 'ef-ob-open' );
		try { new ResizeObserver( () => scrollEnd() ).observe( ov.querySelector( '#efChat' ) ); } catch ( x ) { /* ignore */ }
		if ( prefill && prefill.sleep ) {
			const r = prefill.sleep; chat.id = r.id; chat.ts = r.ts || Date.now(); chat.item = r.item || ''; chat.cost = r.cost || 0; chat.who = r.who || ''; chat.by = r.by;
			chat.msgs = r.msgs.filter( ( x ) => x.w === 'me' || ( x.l && x.l.length ) ).map( ( x ) => ( x.w === 'me' ? { who: 'me', text: x.t } : { who: 'ef', lines: x.l, mood: x.m } ) ); chat.msgs.forEach( appendMsg ); scrollEnd();
			setTimeout( () => sleepChat( 'sleep' ), reduceMotion() ? 0 : 900 ); return;
		}
		try { S().device.efLiveChat = { id: chat.id, ts: Date.now() }; EX.persist(); } catch ( x ) { /* ignore */ }
		clearTimeout( chat.timer ); chat.timer = setTimeout( () => { if ( chat.stage !== 'done' ) sleepChat( 'timeout' ); }, 300000 ); 
		ov.addEventListener( 'keydown', ( e ) => { if ( e.key === 'Escape' ) closeChat(); } );
		const tok = chat.tok; chat.chain = tok;
		( async () => {
			if ( prefill && prefill.reuse ) { const r = prefill.reuse; chat.item = r.item || ''; chat.who = r.who || ''; chat.cost = r.cost || 0; chat.by = r.by; await say( [ pool( 'efc_back', { item: r.item || t( 'efAskThing' ) } ) ], { mood: 'cheer', delay: 800 } ); if ( ! live( tok ) ) return; return chat.cost ? ( chat.by === undefined ? nextQ() : recap() ) : nextQ(); }
			if ( prefill && prefill.hist ) showHist();
			await say( [ pool( 'efc_hi' ) ], { mood: 'cheer', delay: 1275 } ); if ( ! live( tok ) ) return;
			const egg = F.nameEgg(), cnt = ( S().device.efChatCount = ( S().device.efChatCount || 0 ) + 1 ); try { EX.persist(); } catch ( x ) { /* ignore */ }
			if ( egg && cnt % 10 === 3 ) { for ( const part of String( t( 'efc_egg_' + egg, { name: F.name() } ) ).split( '~' ) ) { await say( [ part ], { mood: 'cheer' } ); if ( ! live( tok ) ) return; } }
			if ( prefill && prefill.text ) return onUser( prefill.text );
			return pickIdeas( tok );
		} )();
	};
	document.addEventListener( 'submit', ( e ) => {
		const f = e.target; if ( f.id !== 'efChatForm' ) return; e.preventDefault();
		const q = f.elements.q.value.trim(); if ( ! q || chat.busy ) return; f.elements.q.value = ''; onUser( q );
	} );
	const embedded = () => document.documentElement.classList.contains( 'ef-embed' );
	const openPlan = ( dl ) => { if ( embedded() && window.EXAEmbedEnd ) { closeChat(); UI.closeSheet && UI.closeSheet( true ); EXAEmbedEnd(); return; } const ic = F.askIcon( chat.item ); closeChat(); UI.closeSheet && UI.closeSheet( true ); setTimeout( () => EXA.openEfPlan( null, Object.assign( { name: ( chat.item || t( 'efAskThing' ) ) + ( chat.who ? ' ' + forWho() : '' ), target: String( chat.cost / 100 ), icon: ic.icon }, dl ? { deadline: dl > today() ? dl : addDays( today(), 1 ) } : {} ) ), 220 ); };
	document.addEventListener( 'click', ( e ) => {
		const tg = e.target.closest ? e.target : null; if ( ! tg ) return;
		if ( tg.closest( '[data-ef-ask]' ) ) { e.preventDefault(); EXA.efriendAskOpen(); return; }
		if ( tg.closest( '[data-ef-cpx]' ) ) { closeChat(); if ( embedded() && window.EXAEmbedEnd ) EXAEmbedEnd(); return; }
		if ( tg.closest( '[data-ef-clear]' ) ) { restartChat(); return; }
		if ( tg.closest( '[data-ef-skip]' ) ) { showForm( true ); return; }
		if ( tg.closest( '[data-ef-menu]' ) ) { toggleMenu(); return; }
		const ed = tg.closest( '[data-ef-amtedit]' ); if ( ed ) { startEdit( ed.dataset.efAmtedit ); return; }
		const ex = tg.closest( '[data-ef-editx]' ); if ( ex ) { const m = chat.msgs.find( ( x ) => x.id === ex.dataset.efEditx ); if ( m ) rerender( m ); return; }
		const qd = tg.closest( '[data-ef-qdate]' ); if ( qd ) { const f = document.getElementById( 'efQForm' ); if ( f ) { f.elements.norush.checked = false; f.elements.when.disabled = false; f.elements.when.value = addDays( today(), Number( qd.dataset.efQdate ) ); } return; }
		if ( tg.closest( '[data-ef-hist]' ) ) { showHist(); return; }
		if ( tg.closest( '[data-ef-hist-open]' ) ) { e.preventDefault(); EXA.efriendAskOpen( { hist: true } ); return; }
		if ( tg.closest( '[data-ef-hback]' ) ) { const open = document.querySelector( '.ef-hist .ef-hist-chat' ); if ( open ) showHist(); else hideHist(); return; }
		if ( tg.closest( '[data-ef-hnew]' ) ) { EXA.efriendAskOpen(); return; }
		const ho = tg.closest( '[data-ef-hopen]' ); if ( ho ) { showHist( ho.dataset.efHopen ); return; }
		const ha = tg.closest( '[data-ef-hagain]' ); if ( ha ) { const r = histList().find( ( x ) => x.id === ha.dataset.efHagain ); if ( r ) EXA.efriendAskOpen( { reuse: r } ); return; }
		const hd = tg.closest( '[data-ef-hdel]' ); if ( hd ) { const l = histList(), i = l.findIndex( ( x ) => x.id === hd.dataset.efHdel ); if ( i >= 0 ) { l.splice( i, 1 ); try { EX.persist(); } catch ( x ) { /* ignore */ } } showHist(); return; }
		const q = tg.closest( '[data-ef-q]' ); if ( q ) { const c = chat.chips[ Number( q.dataset.efQ ) ]; if ( c && c.k === 'menuclose' ) { toggleMenu(); return; } if ( c && c.k === 'more' ) { chat.more = ! chat.more; startChips(); const bx = document.getElementById( 'efChips' ); if ( bx ) bx.scrollTop = 0; return; } if ( c && c.k === 'wake' ) { EXA.efriendAskOpen(); return; } if ( c && c.k === 'hist' ) { showHist(); return; } if ( c && c.k === 'form' ) { showForm(); return; } if ( c && c.k === 'keep' ) { keepChatting(); return; } if ( c && ! chat.busy ) onUser( c.text || c.label.replace( /^[^\p{L}\p{N}]+/u, '' ), c ); return; }
		const mo = tg.closest( '[data-ef-mon]' ); if ( mo && chat.ans ) { chat.mi = Math.max( 0, Math.min( monthsOf( chat.ans ).length - 1, chat.mi + Number( mo.dataset.efMon ) ) ); repaintResult(); return; }
		const d = tg.closest( '[data-ef-askday]' ); if ( d && chat.ans ) { chat.sel = Number( d.dataset.efAskday ); repaintResult(); return; }
		if ( tg.closest( '[data-ef-again]' ) ) { chat.keepEmbed = true; UI.closeSheet && UI.closeSheet( true ); setTimeout( () => EXA.efriendAskOpen(), 220 ); return; }
		const pl = tg.closest( '[data-ef-askplan]' ); if ( pl ) openPlan( pl.dataset.efAskplan );
	} );

	/* ------------------------------------------------------------------ Progress: what eFriend can honestly show */
	// A snapshot per plan per day (how ready you are), so Reports can draw the journey. Small on purpose: at most 120 points per plan.
	const pctOf = ( f ) => ( f.target ? Math.max( 0, Math.min( 300, Math.round( ( ( ( f.projectedFree || 0 ) + f.saved ) / f.target ) * 100 ) ) ) : 0 );
	F.snapshot = ( force ) => {
		const h = S().settings.efHistory = S().settings.efHistory || {}, td = today(); let changed = false;
		F.all().forEach( ( f ) => { const id = f.goal.id, list = h[ id ] = h[ id ] || []; if ( list.length && list[ list.length - 1 ].d === td ) { if ( force ) { list[ list.length - 1 ] = { d: td, v: f.verdict, p: pctOf( f ) }; changed = true; } return; } const pct = f.target ? Math.round( ( ( ( f.projectedFree || 0 ) + f.saved ) / f.target ) * 100 ) : 0; list.push( { d: td, v: f.verdict, p: Math.max( -50, Math.min( 300, pct ) ) } ); if ( list.length > 120 ) list.splice( 0, list.length - 120 ); changed = true; } );
		if ( changed ) { try { EX.persist(); } catch ( e ) { /* ignore */ } }
	};
	/** Change points: every edit that moves a plan is remembered with how ready you were before and after, so Reports can mark it on the graph. */
	F.measure = () => { const m = {}; F.all().forEach( ( f ) => { m[ f.goal.id ] = pctOf( f ); } ); return m; };
	F.logChange = ( before, changes, onlyIds ) => {
		const after = F.measure(), ev = S().settings.efEvents = S().settings.efEvents || {};
		Object.keys( after ).forEach( ( id ) => { if ( before[ id ] == null || ( onlyIds && ! onlyIds.includes( id ) ) || ( ! onlyIds && before[ id ] === after[ id ] ) ) return; const list = ev[ id ] = ev[ id ] || []; list.push( { d: today(), c: changes, p0: before[ id ], p1: after[ id ] } ); if ( list.length > 60 ) list.splice( 0, list.length - 60 ); } );
		F.snapshot( true ); S().settings.u = Date.now(); try { EX.persist(); } catch ( e ) { /* ignore */ }
	};
	const wantPerWeek = ( from, to ) => {
		const days = Math.max( 1, diff( to, from ) ), tot = S().txs.filter( ( x ) => x.type === 'expense' && ! x.goalId && ! x.efPlan && x.date >= from && x.date < to ).reduce( ( s, x ) => ( F.importance( { category: x.category, name: x.name || '' } ).level === 'want' ? s + centsOf( x.amount, EX.txCurrency( x ) ) : s ), 0 );
		return { perWeek: tot / days * 7, any: S().txs.some( ( x ) => x.date >= from && x.date < to ) };
	};
	const spark = ( pts, evs = [] ) => {
		const w = 280, h = 90, d0 = pts.length ? parse( pts[ 0 ].d ).getTime() : 0, span = Math.max( 864e5, ( pts.length ? parse( pts[ pts.length - 1 ].d ).getTime() : 0 ) - d0 );
		const max = Math.max( 120, ...pts.map( ( x ) => x.p ), ...evs.map( ( e ) => Math.max( e.p0, e.p1 ) ) ), min = Math.min( 0, ...pts.map( ( x ) => x.p ), ...evs.map( ( e ) => Math.min( e.p0, e.p1 ) ) );
		const X = ( d ) => 8 + ( w - 16 ) * ( ( parse( d ).getTime() - d0 ) / span ), Y = ( p ) => h - 8 - ( h - 16 ) * ( p - min ) / ( max - min );
		const marks = evs.filter( ( e ) => e.d >= pts[ 0 ].d ).map( ( e, i ) => `<g class="ef-ev ${ e.p1 >= e.p0 ? 'up' : 'down' }"><line x1="${ X( e.d ).toFixed( 1 ) }" x2="${ X( e.d ).toFixed( 1 ) }" y1="6" y2="${ h - 6 }" stroke="#c98a00" stroke-width="1.5" stroke-dasharray="3 3"/><circle cx="${ X( e.d ).toFixed( 1 ) }" cy="${ Y( e.p1 ).toFixed( 1 ) }" r="6" fill="#ffc94d" stroke="#8a5a00" stroke-width="1.5"/><text x="${ X( e.d ).toFixed( 1 ) }" y="${ ( Y( e.p1 ) + 3.5 ).toFixed( 1 ) }" font-size="9" font-weight="700" text-anchor="middle" fill="#3b2600">${ i + 1 }</text></g>` ).join( '' );
		return `<svg class="ef-spark-chart" viewBox="0 0 ${ w } ${ h }" role="img" aria-label="${ esc( t( 'efTab' ) ) }"><line x1="0" x2="${ w }" y1="${ Y( 100 ).toFixed( 1 ) }" y2="${ Y( 100 ).toFixed( 1 ) }" stroke="#0b7a58" stroke-dasharray="4 4" opacity=".6"/><polyline fill="none" stroke="#0f766e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${ pts.map( ( x ) => X( x.d ).toFixed( 1 ) + ',' + Y( x.p ).toFixed( 1 ) ).join( ' ' ) }"/>${ pts.map( ( x ) => `<circle cx="${ X( x.d ).toFixed( 1 ) }" cy="${ Y( x.p ).toFixed( 1 ) }" r="2.6" fill="#0f766e"/>` ).join( '' ) }${ marks }</svg>`;
	};
	/** What an edit was, in words, and whether it moved you closer to the plan or further away. */
	const evText = ( e ) => {
		const m = ( c ) => money( EX.cents( c ) / 100, main() ), lvl = ( l ) => t( 'ef_lvl_' + l );
		const what = e.c.map( ( [ k, a, b ] ) => k === 'cost' ? t( 'efEvCost', { a: m( a ), b: m( b ) } ) : k === 'date' ? t( 'efEvDate', { a: EX.dayName( a ), b: EX.dayName( b ) } ) : k === 'wallets' ? t( 'efEvWallets' ) : k === 'link' ? t( 'efEvLink' ) : k === 'prio' ? t( 'efEvPrio' ) : t( 'efEvSort', { name: EX.catInfo( a ).name, level: lvl( b ) } ) ).join( ' · ' );
		const eff = e.p1 > e.p0 ? t( 'efEvCloser', { a: e.p0, b: e.p1 } ) : e.p1 < e.p0 ? t( 'efEvFurther', { a: e.p0, b: e.p1 } ) : t( 'efEvSame' );
		return { what, eff };
	};
	EXA.efriendReport = () => {
		F.snapshot();
		const all = F.all(), m = ( c ) => money( c / 100, main() ), hist = S().settings.efHistory || {};
		if ( ! all.length ) return `<section class="card"><div class="ef-top">${ F.mascot( 'happy', 72 ) }<div class="ef-bubble"><b>${ esc( t( 'efRepNone' ) ) }</b></div></div></section>`;
		const sm = F.summary( all ), fits = all.filter( ( f ) => RANK[ f.verdict ] >= 3 ).length;
		const plansHtml = all.map( ( f ) => {
			const pts = hist[ f.goal.id ] || [], evs = ( S().settings.efEvents || {} )[ f.goal.id ] || [], first = pts[ 0 ], note = pts.length > 1 ? t( 'efRepFromTo', { a: LABEL[ first.v ], b: LABEL[ f.verdict ], d: EX.dayName( first.d ) } ) : t( 'efRepCheckBack' );
			return `<li class="ef-rep-plan"><div class="ef-gtop"><span class="ef-mi">${ UI.icon( f.goal.icon || 'plane', 20 ) }</span><div><b>${ esc( f.goal.name ) }</b><small>${ esc( note ) }</small></div>${ chip( f.verdict ) }</div>${ pts.length > 1 ? spark( pts, evs ) : '' }${ evs.length ? `<ol class="ef-evlist">${ evs.map( ( e, i ) => { const x = evText( e ); return `<li><span class="ef-evn">${ i + 1 }</span><span>✏️ <b>${ esc( EX.dayName( e.d ) ) }</b> ${ esc( x.what ) }<br>${ esc( x.eff ) }</span></li>`; } ).join( '' ) }</ol>` : '' }</li>`;
		} ).join( '' );
		// Wants per week: before the first plan was made, and since.
		const created = all.map( ( f ) => f.goal.created || ( hist[ f.goal.id ] && hist[ f.goal.id ][ 0 ] && hist[ f.goal.id ][ 0 ].d ) ).filter( Boolean ).sort()[ 0 ], td = today();
		let wants = '';
		if ( created && diff( td, created ) >= 14 ) {
			const before = wantPerWeek( addDays( created, -28 ), created ), since = wantPerWeek( created, td );
			if ( before.any ) { const d = Math.round( before.perWeek - since.perWeek ); wants = `<section class="card"><h2>${ esc( t( 'efRepWantsTitle' ) ) }</h2><ul class="ef-kv"><li><span>${ esc( t( 'efRepBefore' ) ) }</span><b>${ esc( m( Math.round( before.perWeek ) ) ) }</b></li><li><span>${ esc( t( 'efRepSince' ) ) }</span><b>${ esc( m( Math.round( since.perWeek ) ) ) }</b></li></ul>${ points( [ d > 0 ? t( 'efRepLess', { a: m( d ) } ) : d < 0 ? t( 'efRepMore', { a: m( -d ) } ) : t( 'efRepSame' ), t( 'efRepNotProof' ) ] ) }</section>`; }
		} else if ( created ) wants = `<section class="card"><h2>${ esc( t( 'efRepWantsTitle' ) ) }</h2><p class="muted">${ esc( t( 'efRepWait', { n: Math.max( 1, 14 - diff( td, created ) ) } ) ) }</p></section>`;
		const worst = sm.firstBad, tip = worst && worst.suggestions && worst.suggestions.length ? `<section class="card"><h2>${ esc( t( 'efHelps' ) ) }</h2><ul class="ef-list">${ worst.suggestions.slice( 0, 3 ).map( ( x ) => `<li><div><b>${ esc( x.kind === 'cut' ? t( 'efCutLabel', { name: EX.catInfo( x.cat ).name } ) : t( 'efPauseLabel', { name: x.name } ) ) }</b></div><span class="ef-gain">+${ esc( m( x.gain ) ) }</span></li>` ).join( '' ) }</ul></section>` : '';
		return `${ F.achieved().length ? `<section class="card">${ points( [ t( 'efAchLine', { n: F.achieved().length, a: m( F.achieved().reduce( ( x, g ) => x + EX.cents( g.doneAmount || g.target ), 0 ) ) } ) ] ) }</section>` : '' }<section class="card ef-rep"><div class="ef-top">${ F.mascot( sm.verdict, 64 ) }<div class="ef-bubble"><b>${ esc( t( 'efRepHeadline', { a: fits, b: all.length } ) ) }</b>${ chip( sm.verdict ) }</div></div><ul class="ef-kv"><li><span>${ esc( t( 'efPlansN', { n: sm.n } ) ) }</span><b>${ esc( m( sm.cost ) ) }</b></li><li><span>${ esc( t( 'efProjected' ) ) }</span><b>${ esc( m( sm.free ) ) }</b></li></ul></section>
			<section class="card"><h2>${ esc( t( 'efRepJourney' ) ) }</h2><ul class="ef-list">${ plansHtml }</ul><p class="muted small">${ esc( t( 'efRepEvents' ) ) }</p></section>${ wants }${ tip }`;
	};

	/* ------------------------------------------------------------------ Strings */
	const en = {
		efMeet: 'Meet your eFriend', efMeetText: 'A small friend who watches your bills, income and habits and tells you, kindly and with jokes, whether this goal will happen.',
		efToggle: 'Let eFriend coach this goal', efToggleHint: 'It checks the goal against your bills, income and spending until the date.', efWallets: 'Money for this goal comes from',
		ef_nodata: 'I need a bit more history to guess well. Keep adding things!',
		efDone: 'Goal reached. Time to enjoy it!', efLate: 'The date has passed. Move the date or lower the goal and I will help again.',
		efNeedWeek: 'You need about {a} a week to get there.', efShort: 'At your current pace you would be {a} short.', efSpare: 'At your current pace you would have {a} to spare.',
		efOverdue: '{a} of overdue bills must be paid first. They come before any goal.', efTipCut: 'Cutting {name} by a quarter would add about {a}.', efTipPause: 'Pausing {name} would add about {a}.',
		efDaysLeft: '{n} days left', efOpen: 'Full analysis', efStillNeed: 'Still to save', efProjected: 'Likely free by the date', efDays: 'Days left', efConfidence: 'How sure am I?',
		efConf_low: 'A little (not much history yet)', efConf_medium: 'Fairly', efConf_good: 'Quite sure',
		efHelps: 'What would help', efHelpsNote: 'Together these could add about {a} by the date.', efCutLabel: 'Spend a quarter less on {name}', efPauseLabel: 'Pause {name}',
		efOtherWays: 'Other ways to get there', efAltSmaller: 'Aim a little lower: about {a} ({p}% less) fits comfortably.', efAltLater: 'Or move the date to about {d}.',
		efMustTitle: 'Bills that cannot be skipped', efSortTitle: 'How I sorted your spending', efSortSub: 'Check what counts as Must, Need or Want', efSortText: 'Must = fixed and necessary. Need = necessary but you can shop smarter. Want = nice to have. Change any of them.',
		ef_lvl_must: 'Must', ef_lvl_need: 'Need', ef_lvl_want: 'Want',
		efWhy_housing: 'A roof comes first, and late rent costs fees.', efWhy_utility: 'Lights, water and heating are not optional.', efWhy_telecom: 'Phone and internet keep you reachable and online, so they stay.',
		efWhy_insurance: 'Skipping insurance can cost far more later.', efWhy_loan: 'Missed payments add interest and hurt your record.', efWhy_tax: 'Taxes and contributions have penalties when late.',
		efWhy_childcare: 'Your family depends on it.', efWhy_must: 'Fixed and necessary.', efWhy_custom: 'You marked this as a must.',
		efOnbTitle: 'How you spend', efOnbHi: "Here is how I sorted your spending. Tap to change anything that is different for you.", efOnbSave: 'Looks right', efRedo: 'Review how I sorted your spending',
		fx_efriend: 'eFriend', fxD_efriend: 'A small robot that coaches a savings goal and tells you whether you will make it.', efPromo: 'Let it coach "{name}": it checks your bills, income and habits and tells you if you will make it.', efTry: 'Try it',
		tut_efriend: 'Meet your eFriend', tutD_efriend: 'A robot that tells you if your goal will happen', tut_efriend_1: 'In **Plan**, add a goal with a target and a date, for example a trip.', tut_efriend_2: 'Turn on **Let eFriend coach this goal** and choose the wallets the money comes from.', tut_efriend_3: 'On Home, tap **Full analysis** to see what is likely, what would help, and how your spending is sorted. Change any of it.',
		tutEx_efriend: 'Maria wants 400 for a trip by December. eFriend sees her rent and phone bill are musts, notices she spends a lot on takeaway, and says: cut it by a quarter and you will make it, with money to spare.',
		efMoreSub: 'Your savings coach', efYourGoals: 'Goals with eFriend', efNoGoals: 'No goals yet. Add one and eFriend will watch it for you.', efNewGoal: 'New goal with eFriend', efNoDate: 'No date yet', efAddDate: 'Add a date', efPromoDate: 'I need a date for "{name}" to work out whether you will make it.', efNeedDate: 'Add a date so eFriend can coach this goal.', efReplay: 'Take the eFriend tour again', efReplaySub: 'Go through all the onboarding screens again',
		efObSeeTitle: 'This is what you will see on Home', efObSeeText: 'A card with your goal, how it is going, and a few words from me. Tap the flip button for the numbers and Full analysis for the details.', efObWhereTitle: 'Find me any time', efObWhereText: 'Open More, then eFriend. Your goals, the full analysis and how your spending is sorted are all there.', efSkip: 'Skip', efNext: 'Next', efLetsGo: "Let's go", efNoSpend: 'Once you add some spending, I will sort it here.',
		efPanelCoaching: ( { n } ) => ( n === 1 ? 'Coaching 1 goal. Tap to see how it is going.' : 'Coaching ' + n + ' goals. Tap to see how they are going.' ), efPanelNone: 'Your savings coach. Tap to meet it and set up a goal.',
		ef_comfortable: "You're on fire. The suitcase is already packing itself.|At this rate you'll be buying souvenirs for your souvenirs.|Look at you being all responsible. I'm basically crying.|To save or not to save? Easy question. You're saving, and winning.|Your wallet called. It wants to thank you in person.|Ahead of schedule! Quick, nobody tell the impulse purchases.|This plan is so healthy it should be on a poster.|I ran the numbers twice. Then I did a little dance.|Money, meet goal. Goal, meet money. You're a great matchmaker.|Even my circuits are impressed, and they are hard to impress.", ef_ontrack: "Right on schedule. I'm proud of you, and I don't say that to just anyone.|Smooth sailing. Keep your wallet calm and the plan will happen.|On track! Please don't celebrate with an impulse purchase.|To spend or not to spend, that is the question. Today the answer is: not.|Steady wins the trip. Keep going.|Nothing to see here, just a goal quietly coming true.|Boring is beautiful. Keep being wonderfully boring with money.|Tick, tick, tick: that is the sound of progress.|You and your plan are getting along nicely.|I'd high-five you, but I'm mostly screen.", ef_tight: "It's tight, but so are my favourite jeans. We can make it work.|A few small tweaks and this plan is back on.|Not a disaster. More of a plot twist.|To skip or not to skip the takeaway? I'm leaning towards skip.|We're on a tightrope. Please put the coffee down and focus.|It's a squeeze, but squeezes make juice. Metaphorically. Please save.|Close! Nail-bitingly close. I've run out of nails.|One less treat this week and I'll relax. Maybe.|Think of it as a puzzle. With money. And no instructions.|We can do this, but the snack budget is nervous.", ef_atrisk: "Houston, we have a slightly worrying forecast. Good news: I have ideas.|The plan is wobbling. Let's rescue it with some creative skipping.|Plot twist: the coffee budget has plans of its own. Let's talk.|To be or not to be on budget? Currently: not. Let's fix that.|Alert! Alert! Okay, a gentle alert. But still.|Your goal and your habits are fighting. I'm the referee.|I see a gap. It's not a canyon. Yet.|Time for a team huddle: you, me, and fewer takeaways.|Nothing a few clever cuts can't fix. I have scissors. Metaphorical ones.|Don't panic. Well, panic a little, then open the analysis.", ef_unlikely: "Okay, honest moment: this date is a stretch. Let's pick a smarter plan together.|I believe in you, just not in this exact date. Let's adjust.|To make it or not to make it? Not by this date. By a new date, yes!|The numbers and I need a serious chat. Mostly about the date.|Let's not cry over a date. Let's move it.|Even superheroes check the calendar. Let's find a better date.|This goal is lovely. This deadline is rude. Let's negotiate.|A smaller goal, a later date, or both. Pick your adventure.|I won't sugar-coat it. Well, a little sugar. Let's rework this.|Rome wasn't saved in a day. Let's give this goal more time.", ef_done: "You did it! Passport time.|Goal reached. I'm doing a tiny happy dance.|Mission accomplished. I'd salute, but arms.|Champagne budget unlocked. Responsibly.|To save or not to save? You saved. Standing ovation.|That's a wrap. Time to enjoy every cent.",
		efEdit: 'Edit plan',
		efDisclaimer: 'These are estimates from your own history, not financial advice. The more you add, the better my guesses get.',
	};
	const el = {
		efMeet: 'Γνωρίστε το eFriend σας', efMeetText: 'Ένας μικρός φίλος που παρακολουθεί τους λογαριασμούς, τα έσοδα και τις συνήθειές σας και σας λέει, ευγενικά και με αστεία, αν αυτός ο στόχος θα γίνει.',
		efToggle: 'Να προπονεί το eFriend αυτόν τον στόχο', efToggleHint: 'Ελέγχει τον στόχο με βάση τους λογαριασμούς, τα έσοδα και τα έξοδά σας μέχρι την ημερομηνία.', efWallets: 'Τα χρήματα για αυτόν τον στόχο προέρχονται από',
		ef_nodata: 'Χρειάζομαι λίγο περισσότερο ιστορικό για να μαντέψω σωστά. Συνεχίστε να προσθέτετε!',
		efDone: 'Ο στόχος επιτεύχθηκε. Ώρα να τον απολαύσετε!', efLate: 'Η ημερομηνία πέρασε. Αλλάξτε την ημερομηνία ή μειώστε τον στόχο και θα βοηθήσω ξανά.',
		efNeedWeek: 'Χρειάζεστε περίπου {a} την εβδομάδα για να φτάσετε.', efShort: 'Με τον τρέχοντα ρυθμό θα σας λείπουν {a}.', efSpare: 'Με τον τρέχοντα ρυθμό θα σας περισσεύουν {a}.',
		efOverdue: 'Οφείλετε να πληρώσετε πρώτα {a} εκπρόθεσμων λογαριασμών. Προηγούνται κάθε στόχου.', efTipCut: 'Αν περικόψετε το «{name}» κατά ένα τέταρτο, θα προσθέσετε περίπου {a}.', efTipPause: 'Αν παγώσετε το «{name}», θα προσθέσετε περίπου {a}.',
		efDaysLeft: '{n} ημέρες ακόμα', efOpen: 'Πλήρης ανάλυση', efStillNeed: 'Μένουν να αποταμιευτούν', efProjected: 'Πιθανώς ελεύθερα μέχρι την ημερομηνία', efDays: 'Ημέρες που απομένουν', efConfidence: 'Πόσο σίγουρο είμαι;',
		efConf_low: 'Λίγο (δεν υπάρχει ακόμα αρκετό ιστορικό)', efConf_medium: 'Αρκετά', efConf_good: 'Πολύ',
		efHelps: 'Τι θα βοηθούσε', efHelpsNote: 'Μαζί αυτά θα μπορούσαν να προσθέσουν περίπου {a} μέχρι την ημερομηνία.', efCutLabel: 'Ξοδέψτε ένα τέταρτο λιγότερο σε «{name}»', efPauseLabel: 'Παγώστε το «{name}»',
		efOtherWays: 'Άλλοι τρόποι να φτάσετε', efAltSmaller: 'Στοχεύστε λίγο χαμηλότερα: περίπου {a} ({p}% λιγότερο) χωράει άνετα.', efAltLater: 'Ή μετακινήστε την ημερομηνία γύρω στις {d}.',
		efMustTitle: 'Λογαριασμοί που δεν παραλείπονται', efSortTitle: 'Πώς ταξινόμησα τα έξοδά σας', efSortSub: 'Δείτε τι θεωρείται Αναγκαίο, Ανάγκη ή Επιθυμία', efSortText: 'Αναγκαίο = σταθερό και απαραίτητο. Ανάγκη = απαραίτητο αλλά μπορείτε να ψωνίσετε εξυπνότερα. Επιθυμία = καλό να υπάρχει. Αλλάξτε οποιοδήποτε.',
		ef_lvl_must: 'Αναγκαίο', ef_lvl_need: 'Ανάγκη', ef_lvl_want: 'Επιθυμία',
		efWhy_housing: 'Πρώτα η στέγη, και το ενοίκιο που καθυστερεί έχει επιβαρύνσεις.', efWhy_utility: 'Ρεύμα, νερό και θέρμανση δεν είναι προαιρετικά.', efWhy_telecom: 'Το τηλέφωνο και το internet σας κρατούν προσβάσιμους και συνδεδεμένους, γι’ αυτό μένουν.',
		efWhy_insurance: 'Η παράλειψη ασφάλισης μπορεί να κοστίσει πολύ περισσότερο αργότερα.', efWhy_loan: 'Οι χαμένες δόσεις προσθέτουν τόκους και βλάπτουν το ιστορικό σας.', efWhy_tax: 'Οι φόροι και οι εισφορές έχουν πρόστιμα όταν καθυστερούν.',
		efWhy_childcare: 'Η οικογένειά σας εξαρτάται από αυτό.', efWhy_must: 'Σταθερό και απαραίτητο.', efWhy_custom: 'Το σημάνατε ως αναγκαίο.',
		efOnbTitle: 'Πώς ξοδεύετε', efOnbHi: 'Έτσι ταξινόμησα τα έξοδά σας. Πατήστε για να αλλάξετε ό,τι διαφέρει για εσάς.', efOnbSave: 'Σωστά', efRedo: 'Δείτε πώς ταξινόμησα τα έξοδά σας',
		fx_efriend: 'eFriend', fxD_efriend: 'Ένα μικρό ρομπότ που προπονεί έναν στόχο αποταμίευσης και σας λέει αν θα τα καταφέρετε.', efPromo: 'Αφήστε το να προπονήσει τον στόχο «{name}»: ελέγχει τους λογαριασμούς, τα έσοδα και τις συνήθειές σας και σας λέει αν θα τα καταφέρετε.', efTry: 'Δοκιμάστε το',
		tut_efriend: 'Γνωρίστε το eFriend σας', tutD_efriend: 'Ένα ρομπότ που σας λέει αν θα γίνει ο στόχος σας', tut_efriend_1: 'Στο **Πλάνο**, προσθέστε έναν στόχο με ποσό και ημερομηνία, για παράδειγμα ένα ταξίδι.', tut_efriend_2: 'Ενεργοποιήστε το **Να προπονεί το eFriend αυτόν τον στόχο** και διαλέξτε τα πορτοφόλια από τα οποία προέρχονται τα χρήματα.', tut_efriend_3: 'Στην Αρχική, πατήστε **Πλήρης ανάλυση** για να δείτε τι είναι πιθανό, τι θα βοηθούσε και πώς ταξινομούνται τα έξοδά σας. Αλλάξτε οτιδήποτε.',
		tutEx_efriend: 'Η Μαρία θέλει 400 για ένα ταξίδι μέχρι τον Δεκέμβριο. Το eFriend βλέπει ότι το ενοίκιο και ο λογαριασμός τηλεφώνου είναι αναγκαία, προσέχει ότι ξοδεύει πολλά σε delivery και λέει: κόψτε το κατά ένα τέταρτο και θα τα καταφέρετε, με χρήματα να περισσεύουν.',
		efMoreSub: 'Ο προπονητής αποταμίευσής σας', efYourGoals: 'Στόχοι με το eFriend', efNoGoals: 'Δεν υπάρχουν στόχοι ακόμα. Προσθέστε έναν και το eFriend θα τον παρακολουθεί για εσάς.', efNewGoal: 'Νέος στόχος με το eFriend', efNoDate: 'Χωρίς ημερομηνία ακόμα', efAddDate: 'Προσθέστε ημερομηνία', efPromoDate: 'Χρειάζομαι μια ημερομηνία για τον στόχο «{name}» ώστε να υπολογίσω αν θα τα καταφέρετε.', efNeedDate: 'Προσθέστε ημερομηνία για να μπορεί το eFriend να προπονήσει αυτόν τον στόχο.', efReplay: 'Κάντε ξανά την περιήγηση του eFriend', efReplaySub: 'Περάστε ξανά από όλες τις οθόνες εισαγωγής',
		efObSeeTitle: 'Αυτό θα δείτε στην Αρχική', efObSeeText: 'Μια κάρτα με τον στόχο σας, πώς πάει και λίγα λόγια από εμένα. Πατήστε το κουμπί αναστροφής για τους αριθμούς και την Πλήρη ανάλυση για λεπτομέρειες.', efObWhereTitle: 'Θα με βρίσκετε πάντα', efObWhereText: 'Ανοίξτε το Περισσότερα και μετά το eFriend. Εκεί βρίσκονται οι στόχοι σας, η πλήρης ανάλυση και ο τρόπος που ταξινομούνται τα έξοδά σας.', efSkip: 'Παράλειψη', efNext: 'Επόμενο', efLetsGo: 'Πάμε', efNoSpend: 'Μόλις προσθέσετε κάποια έξοδα, θα τα ταξινομήσω εδώ.',
		efPanelCoaching: ( { n } ) => ( n === 1 ? 'Προπονεί 1 στόχο. Πατήστε για να δείτε πώς πάει.' : 'Προπονεί ' + n + ' στόχους. Πατήστε για να δείτε πώς πάνε.' ), efPanelNone: 'Ο προπονητής αποταμίευσής σας. Πατήστε για να τον γνωρίσετε και να ορίσετε έναν στόχο.',
		ef_comfortable: "Πετάτε! Η βαλίτσα φτιάχνεται μόνη της.|Με αυτόν τον ρυθμό θα αγοράζετε σουβενίρ για τα σουβενίρ σας.|Κοιτάξτε σας, τόσο υπεύθυνοι. Σχεδόν κλαίω.|Να αποταμιεύσω ή να μην αποταμιεύσω; Εύκολη ερώτηση: αποταμιεύετε και κερδίζετε.|Το πορτοφόλι σας τηλεφώνησε. Θέλει να σας ευχαριστήσει αυτοπροσώπως.|Πάτε μπροστά από το πρόγραμμα! Γρήγορα, μην το πείτε στις παρορμητικές αγορές.|Αυτό το σχέδιο είναι τόσο υγιές που θα έπρεπε να είναι αφίσα.|Έκανα τους υπολογισμούς δύο φορές. Μετά χόρεψα λίγο.|Χρήματα, γνωρίστε τον στόχο. Στόχε, γνώρισε τα χρήματα. Είστε προξενητές με ταλέντο.|Ακόμα και τα κυκλώματά μου εντυπωσιάστηκαν, και δεν εντυπωσιάζονται εύκολα.", ef_ontrack: "Στην ώρα σας. Είμαι περήφανο για εσάς και δεν το λέω σε όλους.|Όλα πάνε ρολόι. Κρατήστε το πορτοφόλι ήρεμο και το σχέδιο θα γίνει.|Πάμε καλά! Μην το γιορτάσετε με παρορμητική αγορά, σας παρακαλώ.|Να ξοδέψω ή να μην ξοδέψω; Σήμερα η απάντηση είναι: όχι.|Όποιος πηγαίνει σταθερά, φτάνει στο ταξίδι. Συνεχίστε.|Δεν υπάρχει τίποτα να δείτε εδώ, απλώς ένας στόχος που βγαίνει αθόρυβα αληθινός.|Το βαρετό είναι όμορφο. Συνεχίστε να είστε υπέροχα βαρετοί με τα χρήματα.|Τικ, τικ, τικ: αυτός είναι ο ήχος της προόδου.|Εσείς και το σχέδιό σας τα πάτε περίφημα.|Θα σας χειροκροτούσα, αλλά είμαι κυρίως οθόνη.", ef_tight: "Είναι στενά, αλλά έτσι είναι και το αγαπημένο μου τζιν. Θα τα καταφέρουμε.|Μερικές μικρές αλλαγές και το σχέδιο επανέρχεται.|Όχι καταστροφή. Μάλλον ανατροπή πλοκής.|Να παραλείψουμε ή να μην παραλείψουμε το delivery; Κλίνω προς το να το παραλείψουμε.|Περπατάμε σε τεντωμένο σχοινί. Αφήστε τον καφέ και συγκεντρωθείτε.|Είναι στριμωγμένα, αλλά από το στρίμωγμα βγαίνει χυμός. Μεταφορικά. Αποταμιεύστε.|Παρά τρίχα! Έφαγα όλα μου τα νύχια.|Μία λιγότερη λιχουδιά αυτή την εβδομάδα και ηρεμώ. Ίσως.|Δείτε το σαν παζλ. Με χρήματα. Και χωρίς οδηγίες.|Μπορούμε να τα καταφέρουμε, αλλά ο προϋπολογισμός για σνακ είναι αγχωμένος.", ef_atrisk: "Χιούστον, έχουμε μια ελαφρώς ανησυχητική πρόβλεψη. Καλά νέα: έχω ιδέες.|Το σχέδιο τρέμει. Ας το σώσουμε με λίγη δημιουργική παράλειψη.|Ανατροπή: ο προϋπολογισμός για καφέδες έχει δικά του σχέδια. Ας μιλήσουμε.|Να είμαι ή να μην είμαι εντός προϋπολογισμού; Προς το παρόν: όχι. Ας το διορθώσουμε.|Συναγερμός! Εντάξει, ένας ήπιος συναγερμός. Αλλά πάντως.|Ο στόχος σας και οι συνήθειές σας τσακώνονται. Εγώ είμαι ο διαιτητής.|Βλέπω ένα κενό. Δεν είναι φαράγγι. Ακόμα.|Ώρα για σύσκεψη ομάδας: εσείς, εγώ και λιγότερο delivery.|Τίποτα που να μην διορθώνεται με μερικές έξυπνες περικοπές. Έχω ψαλίδι. Μεταφορικό.|Μην πανικοβάλλεστε. Εντάξει, πανικοβληθείτε λίγο και μετά ανοίξτε την ανάλυση.", ef_unlikely: "Εντάξει, ειλικρινά: αυτή η ημερομηνία είναι δύσκολη. Ας διαλέξουμε μαζί ένα εξυπνότερο σχέδιο.|Πιστεύω σε εσάς, απλώς όχι σε αυτή ακριβώς την ημερομηνία. Ας την προσαρμόσουμε.|Να τα καταφέρουμε ή να μην τα καταφέρουμε; Όχι μέχρι αυτή την ημερομηνία. Με νέα ημερομηνία, ναι!|Οι αριθμοί κι εγώ πρέπει να κάνουμε μια σοβαρή κουβέντα. Κυρίως για την ημερομηνία.|Ας μην κλαίμε για μια ημερομηνία. Ας τη μετακινήσουμε.|Ακόμα και οι υπερήρωες κοιτούν το ημερολόγιο. Ας βρούμε καλύτερη ημερομηνία.|Ο στόχος είναι υπέροχος. Η προθεσμία είναι αγενής. Ας διαπραγματευτούμε.|Μικρότερος στόχος, μεταγενέστερη ημερομηνία ή και τα δύο. Διαλέξτε την περιπέτειά σας.|Δεν θα σας το στολίσω. Λίγη ζάχαρη, ίσως. Ας το ξανασχεδιάσουμε.|Η Ρώμη δεν αποταμιεύτηκε σε μία μέρα. Ας δώσουμε στον στόχο περισσότερο χρόνο.", ef_done: "Τα καταφέρατε! Ώρα για διαβατήριο.|Ο στόχος επιτεύχθηκε. Κάνω έναν μικρό χορό χαράς.|Αποστολή εξετελέσθη. Θα έκανα χαιρετισμό, αλλά βλέπετε...|Ξεκλειδώθηκε ο προϋπολογισμός σαμπάνιας. Υπεύθυνα.|Να αποταμιεύσω ή όχι; Αποταμιεύσατε. Όρθιο χειροκρότημα.|Τέλος. Ώρα να απολαύσετε κάθε λεπτό.",
		efEdit: 'Επεξεργασία σχεδίου',
		efDisclaimer: 'Πρόκειται για εκτιμήσεις από το δικό σας ιστορικό και όχι για οικονομική συμβουλή. Όσο περισσότερα προσθέτετε, τόσο καλύτερα μαντεύω.',
	};
	Object.assign( window.EXPENITY_I18N.langs.en, en ); Object.assign( window.EXPENITY_I18N.langs.el, el );

	/* eFriend plans (a trip or a big purchase to check) instead of savings goals: new and changed wording */
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efMeetText: 'A small friend who checks whether you can afford a trip or a big purchase, using your wallets, bills, income and habits, and tells you, kindly and with jokes.',
		fxD_efriend: 'A small robot that checks whether you can afford a trip or a big purchase by a date.',
		efNewGoal: 'New plan with eFriend', efYourGoals: 'Your plans', efNoGoals: 'No plans yet. Tell me what you are planning and I will check whether you can afford it.',
		efPromo: 'Planning a trip or a big purchase? Tell me, and I will check whether you can afford it.', efTry: 'Plan something', efStillNeed: 'It will cost',
		efFreeOf: '{a} likely free of {b} needed', efCost: 'It will cost {a}. I expect you to have about {b} free by then.',
		efLate: 'The date has passed. Edit the plan to pick a new date.', efDone: 'Already covered by the money you set aside. Time to enjoy it!',
		efObSeeText: 'A card with your plan, whether you can afford it, and a few words from me. Tap the flip button for the numbers and Full analysis for the details.',
		efObWhereText: 'Open More, then eFriend. Your plans, the full analysis and how your spending is sorted are all there.',
		efPanelCoaching: ( { n } ) => ( n === 1 ? 'Watching 1 plan. Tap to see if you can afford it.' : 'Watching ' + n + ' plans. Tap to see how they look.' ), efPanelNone: 'Checks if you can afford a trip or a big purchase. Tap to meet it.',
		efPlanNew: 'New eFriend plan', efPlanEdit: 'Edit plan', efPlanName: 'What are you planning?', efPlanNamePh: 'Trip to Italy', efPlanCost: 'How much will it cost?', efPlanDate: 'By when?',
		efPlanWallets: 'Money I can use', efPlanLink: 'Money already set aside', efPlanLinkNone: 'None', efPlanLinkHint: 'Optional: count what you saved in one of your goals towards this plan.',
		efNeedName: 'Give your plan a name.', efNeedCost: 'Enter how much it will cost.', efNeedFuture: 'Pick a date in the future.', efNeedWallet: 'Choose at least one wallet.',
		tut_efriend_1: 'Open **More**, then **eFriend**.', tut_efriend_2: 'Tap **New plan with eFriend**, then enter what you are planning, how much it will cost and the date.', tut_efriend_3: 'Choose the wallets it can use. On Home, tap **Full analysis** to see whether you can afford it, what would help, and how your spending is sorted. Thinking of buying something? Tap **Ask** and eFriend finds the best day. It also fills in your limits from your real spending and warns you before money runs short.',
		tutD_efriend: 'A robot that checks if you can afford it', tutEx_efriend: 'Maria wants to take a 400 trip by December. eFriend checks her wallets, her rent and phone bill, and how much she spends on takeaway, and says: cut it by a quarter and you can afford it, with money to spare.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efMeetText: 'Ένας μικρός φίλος που ελέγχει αν μπορείτε να αντέξετε οικονομικά ένα ταξίδι ή μια μεγάλη αγορά, με βάση τα πορτοφόλια, τους λογαριασμούς, τα έσοδα και τις συνήθειές σας, και σας το λέει, ευγενικά και με αστεία.',
		fxD_efriend: 'Ένα μικρό ρομπότ που ελέγχει αν μπορείτε να αντέξετε οικονομικά ένα ταξίδι ή μια μεγάλη αγορά μέχρι μια ημερομηνία.',
		efNewGoal: 'Νέο σχέδιο με το eFriend', efYourGoals: 'Τα σχέδιά σας', efNoGoals: 'Δεν υπάρχουν σχέδια ακόμα. Πείτε μου τι σχεδιάζετε και θα ελέγξω αν μπορείτε να το αντέξετε.',
		efPromo: 'Σχεδιάζετε ένα ταξίδι ή μια μεγάλη αγορά; Πείτε μου και θα ελέγξω αν μπορείτε να την αντέξετε οικονομικά.', efTry: 'Σχεδιάστε κάτι', efStillNeed: 'Θα κοστίσει',
		efFreeOf: 'περίπου {a} ελεύθερα από τα {b} που χρειάζονται', efCost: 'Θα κοστίσει {a}. Υπολογίζω ότι θα έχετε περίπου {b} ελεύθερα μέχρι τότε.',
		efLate: 'Η ημερομηνία πέρασε. Επεξεργαστείτε το σχέδιο για να διαλέξετε νέα ημερομηνία.', efDone: 'Καλύπτεται ήδη από τα χρήματα που έχετε βάλει στην άκρη. Ώρα να το απολαύσετε!',
		efObSeeText: 'Μια κάρτα με το σχέδιό σας, αν μπορείτε να το αντέξετε και λίγα λόγια από εμένα. Πατήστε το κουμπί αναστροφής για τους αριθμούς και την Πλήρη ανάλυση για λεπτομέρειες.',
		efObWhereText: 'Ανοίξτε το Περισσότερα και μετά το eFriend. Εκεί βρίσκονται τα σχέδιά σας, η πλήρης ανάλυση και ο τρόπος που ταξινομούνται τα έξοδά σας.',
		efPanelCoaching: ( { n } ) => ( n === 1 ? 'Παρακολουθεί 1 σχέδιο. Πατήστε για να δείτε αν μπορείτε να το αντέξετε.' : 'Παρακολουθεί ' + n + ' σχέδια. Πατήστε για να δείτε πώς φαίνονται.' ), efPanelNone: 'Ελέγχει αν μπορείτε να αντέξετε ένα ταξίδι ή μια μεγάλη αγορά. Πατήστε για να το γνωρίσετε.',
		efPlanNew: 'Νέο σχέδιο eFriend', efPlanEdit: 'Επεξεργασία σχεδίου', efPlanName: 'Τι σχεδιάζετε;', efPlanNamePh: 'Ταξίδι στην Ιταλία', efPlanCost: 'Πόσο θα κοστίσει;', efPlanDate: 'Μέχρι πότε;',
		efPlanWallets: 'Χρήματα που μπορώ να χρησιμοποιήσω', efPlanLink: 'Χρήματα που έχετε ήδη στην άκρη', efPlanLinkNone: 'Κανένα', efPlanLinkHint: 'Προαιρετικό: υπολογίστε όσα έχετε αποταμιεύσει σε έναν στόχο σας για αυτό το σχέδιο.',
		efNeedName: 'Δώστε ένα όνομα στο σχέδιό σας.', efNeedCost: 'Συμπληρώστε πόσο θα κοστίσει.', efNeedFuture: 'Διαλέξτε μια μελλοντική ημερομηνία.', efNeedWallet: 'Διαλέξτε τουλάχιστον ένα πορτοφόλι.',
		tut_efriend_1: 'Ανοίξτε το **Περισσότερα** και μετά το **eFriend**.', tut_efriend_2: 'Πατήστε **Νέο σχέδιο με το eFriend** και συμπληρώστε τι σχεδιάζετε, πόσο θα κοστίσει και την ημερομηνία.', tut_efriend_3: 'Διαλέξτε τα πορτοφόλια που μπορεί να χρησιμοποιήσει. Στην Αρχική, πατήστε **Πλήρης ανάλυση** για να δείτε αν μπορείτε να το αντέξετε, τι θα βοηθούσε και πώς ταξινομούνται τα έξοδά σας. Σκέφτεστε να αγοράσετε κάτι; Πατήστε **Ρωτήστε** και το eFriend βρίσκει την καλύτερη ημέρα. Συμπληρώνει επίσης τα όριά σας από τις πραγματικές δαπάνες και σας προειδοποιεί πριν τελειώσουν τα χρήματα.',
		tutD_efriend: 'Ένα ρομπότ που ελέγχει αν μπορείτε να το αντέξετε', tutEx_efriend: 'Η Μαρία θέλει να κάνει ένα ταξίδι 400 μέχρι τον Δεκέμβριο. Το eFriend ελέγχει τα πορτοφόλια της, το ενοίκιο και τον λογαριασμό τηλεφώνου, και πόσα ξοδεύει σε delivery, και λέει: κόψτε το κατά ένα τέταρτο και μπορείτε να το αντέξετε, με χρήματα να περισσεύουν.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efPlanLink: 'Savings goal for this (optional)', efPlanLinkHint: 'Not needed. eFriend works it out from your wallets, income, bills and spending habits. Only choose a goal if you also put money into it for this: what is saved there counts as already set aside.',
		efObHowTitle: 'How I work it out', efObHowText: 'You do not need to put any money aside. I look at what is in your wallets, what is coming in, your bills and how you usually spend, and tell you whether you can afford it by the date.',
		efObHowLink: 'If you also keep a savings goal for it, you can link that goal and I will count what is saved there. That is optional.',
		efHowWallets: 'In your wallets', efHowIncome: 'Income on the way', efHowBills: 'Bills until then', efHowSpend: 'Your usual spending', efHowFree: 'Free by the date',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efPlanLink: 'Στόχος αποταμίευσης για αυτό (προαιρετικό)', efPlanLinkHint: 'Δεν χρειάζεται. Το eFriend το υπολογίζει από τα πορτοφόλια, τα έσοδα, τους λογαριασμούς και τις συνήθειες εξόδων σας. Διαλέξτε στόχο μόνο αν βάζετε και χρήματα σε αυτόν για αυτό το σχέδιο: όσα έχουν αποταμιευτεί εκεί υπολογίζονται ως ήδη στην άκρη.',
		efObHowTitle: 'Πώς το υπολογίζω', efObHowText: 'Δεν χρειάζεται να βάλετε χρήματα στην άκρη. Κοιτάζω τι υπάρχει στα πορτοφόλια σας, τι έρχεται, τους λογαριασμούς σας και πώς ξοδεύετε συνήθως, και σας λέω αν μπορείτε να το αντέξετε μέχρι την ημερομηνία.',
		efObHowLink: 'Αν κρατάτε και στόχο αποταμίευσης για αυτό, μπορείτε να τον συνδέσετε και θα υπολογίσω όσα έχουν αποταμιευτεί εκεί. Είναι προαιρετικό.',
		efHowWallets: 'Στα πορτοφόλια σας', efHowIncome: 'Έσοδα που έρχονται', efHowBills: 'Λογαριασμοί μέχρι τότε', efHowSpend: 'Τα συνηθισμένα έξοδά σας', efHowFree: 'Ελεύθερα μέχρι την ημερομηνία',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efAllPlans: 'All your plans', efPlansN: ( { n } ) => ( n === 1 ? '1 plan' : n + ' plans' ), efMorePlans: ( { n } ) => '+ ' + n + ' more', efTogether: 'Together: {a} needed, about {b} free', efOverviewTitle: 'All together', efOtherPlans: 'Other plans', efAnalysisBtn: 'Analysis',
		efGroupLabel: 'Group (optional)', efGroupPh: 'Summer 2027', efGroupHint: 'Plans in the same group are also checked together.',
		efAfter: 'This is after setting aside {a} for your earlier plans.', efReservedShort: 'after {a} for earlier plans',
		efAllLine: 'Together these need {a}. I expect about {b} free by {d}.', efFirstBad: '{name} is the first plan that does not fit.', efAllFits: 'Everything fits, one plan after the other.',
		efPlansByDate: 'Your plans, by date', efOrderNote: 'I check plans by date: the money for an earlier plan is set aside first, so later plans only get what is left.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efAllPlans: 'Όλα τα σχέδιά σας', efPlansN: ( { n } ) => ( n === 1 ? '1 σχέδιο' : n + ' σχέδια' ), efMorePlans: ( { n } ) => '+ ' + n + ' ακόμα', efTogether: 'Μαζί: χρειάζονται {a}, περίπου {b} ελεύθερα', efOverviewTitle: 'Όλα μαζί', efOtherPlans: 'Άλλα σχέδια', efAnalysisBtn: 'Ανάλυση',
		efGroupLabel: 'Ομάδα (προαιρετικό)', efGroupPh: 'Καλοκαίρι 2027', efGroupHint: 'Τα σχέδια της ίδιας ομάδας ελέγχονται και μαζί.',
		efAfter: 'Αυτό είναι αφού κρατηθούν {a} για τα προηγούμενα σχέδιά σας.', efReservedShort: 'αφού {a} για προηγούμενα σχέδια',
		efAllLine: 'Μαζί χρειάζονται {a}. Υπολογίζω περίπου {b} ελεύθερα μέχρι {d}.', efFirstBad: 'Το «{name}» είναι το πρώτο σχέδιο που δεν χωράει.', efAllFits: 'Όλα χωράνε, το ένα μετά το άλλο.',
		efPlansByDate: 'Τα σχέδιά σας, ανά ημερομηνία', efOrderNote: 'Ελέγχω τα σχέδια ανά ημερομηνία: τα χρήματα για ένα προηγούμενο σχέδιο κρατούνται πρώτα, οπότε τα επόμενα παίρνουν μόνο ό,τι μένει.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efTab: 'eFriend', efRepNone: 'Make a plan with eFriend and I will show you how it is going here.', efRepHeadline: ( { a, b } ) => a + ' of ' + b + ( b === 1 ? ' plan is' : ' plans are' ) + ' on track or better.',
		efRepJourney: 'How ready you are, over time', efRepFromTo: 'From {a} to {b} since {d}', efRepCheckBack: 'Check back in a few days to see the trend.',
		efRepWantsTitle: 'Spending on wants, per week', efRepBefore: 'Before your first plan', efRepSince: 'Since then',
		efRepLess: 'You spend about {a} less a week on wants than before.', efRepMore: 'You spend about {a} more a week on wants than before.', efRepSame: 'Your spending on wants has stayed about the same.',
		efRepNotProof: 'This is a comparison of your own numbers, not proof of what caused the change.', efRepWait: 'I need about {n} more days of history to compare.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efTab: 'eFriend', efRepNone: 'Φτιάξτε ένα σχέδιο με το eFriend και θα σας δείχνω εδώ πώς πάει.', efRepHeadline: ( { a, b } ) => ( b === 1 ? a + ' από 1 σχέδιο πάει καλά ή καλύτερα.' : a + ' από ' + b + ' σχέδια πάνε καλά ή καλύτερα.' ),
		efRepJourney: 'Πόσο έτοιμοι είστε, με την πάροδο του χρόνου', efRepFromTo: 'Από {a} σε {b} από τις {d}', efRepCheckBack: 'Ξαναδείτε σε λίγες ημέρες για να δείτε την τάση.',
		efRepWantsTitle: 'Έξοδα για επιθυμίες, ανά εβδομάδα', efRepBefore: 'Πριν από το πρώτο σας σχέδιο', efRepSince: 'Από τότε',
		efRepLess: 'Ξοδεύετε περίπου {a} λιγότερα την εβδομάδα σε επιθυμίες από πριν.', efRepMore: 'Ξοδεύετε περίπου {a} περισσότερα την εβδομάδα σε επιθυμίες από πριν.', efRepSame: 'Τα έξοδά σας για επιθυμίες έμειναν περίπου ίδια.',
		efRepNotProof: 'Πρόκειται για σύγκριση των δικών σας αριθμών και όχι απόδειξη για το τι προκάλεσε την αλλαγή.', efRepWait: 'Χρειάζομαι περίπου {n} ακόμα ημέρες ιστορικού για να συγκρίνω.',
	} );
	/* Readable wording: an emoji in front of each point, **bold** for the numbers, one idea per line */
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efCost: '💶 It will cost **{a}**.\n🏦 I expect about **{b}** free by then.', efShort: '⚠️ At your current pace you would be **{a}** short.', efSpare: '🎉 At your current pace you would have **{a}** to spare.',
		efAfter: '📅 This is after setting aside **{a}** for your earlier plans.', efOverdue: '🧾 **{a}** of overdue bills must be paid first. They come before any plan.',
		efTipCut: '✂️ Cutting {name} by a quarter would add about **{a}**.', efTipPause: '⏸️ Pausing {name} would add about **{a}**.',
		efAllLine: '💶 Together these need **{a}**.\n🏦 I expect about **{b}** free by {d}.', efFirstBad: '🚧 **{name}** is the first plan that does not fit.', efAllFits: '✅ Everything fits, one plan after the other.',
		efLate: '📅 The date has passed. Edit the plan to pick a new date.', efDone: '🎉 Already covered by the money you set aside. Time to enjoy it!',
		efAltSmaller: '🎯 Aim a little lower: about **{a}** ({p}% less) fits comfortably.', efAltLater: '🗓️ Or move the date to about **{d}**.', efHelpsNote: '💡 Together these could add about **{a}** by the date.',
		efSortText: '🔒 **Must**: fixed and necessary\n🛒 **Need**: necessary, but you can shop smarter\n🎁 **Want**: nice to have\n👆 Tap to change any of them.',
		efObSeeText: '🃏 A card with your plan and my verdict\n🔄 Flip it for the numbers\n🔍 Tap **Full analysis** for the details', efObWhereText: '📍 Open **More**, then **eFriend**\n📋 Your plans, the full analysis and how your spending is sorted are all there',
		efObHowText: '🙌 No need to put any money aside\n👀 I look at your wallets, income, bills and spending habits\n✅ Then I tell you if you can afford it by the date', efObHowLink: '🔗 Optional: link a savings goal and I will count what is saved there.',
		efMeetText: '👋 A small friend who checks whether you can afford a trip or a big purchase\n🧮 Using your wallets, bills, income and habits\n😄 Kindly, and with jokes',
		efRepLess: '📉 You spend about **{a}** less a week on wants than before.', efRepMore: '📈 You spend about **{a}** more a week on wants than before.', efRepSame: '➖ Your spending on wants has stayed about the same.', efRepNotProof: 'ℹ️ A comparison of your own numbers, not proof of what caused the change.',
		efPlanLinkHint: '🙌 Not needed: I work it out from your wallets, income, bills and spending habits.\n🔗 Only choose a goal if you also put money into it for this. What is saved there counts as already set aside.', efGroupHint: '🗂️ Plans in the same group are also checked together.',
		efSoundTitle: 'Robot sounds', efSoundHint: 'Little sounds when you tap eFriend.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efCost: '💶 Θα κοστίσει **{a}**.\n🏦 Υπολογίζω περίπου **{b}** ελεύθερα μέχρι τότε.', efShort: '⚠️ Με τον τρέχοντα ρυθμό θα σας λείπουν **{a}**.', efSpare: '🎉 Με τον τρέχοντα ρυθμό θα σας περισσεύουν **{a}**.',
		efAfter: '📅 Αυτό είναι αφού κρατηθούν **{a}** για τα προηγούμενα σχέδιά σας.', efOverdue: '🧾 Πρέπει να πληρωθούν πρώτα **{a}** εκπρόθεσμων λογαριασμών. Προηγούνται κάθε σχεδίου.',
		efTipCut: '✂️ Αν περικόψετε το «{name}» κατά ένα τέταρτο, θα προσθέσετε περίπου **{a}**.', efTipPause: '⏸️ Αν παγώσετε το «{name}», θα προσθέσετε περίπου **{a}**.',
		efAllLine: '💶 Μαζί χρειάζονται **{a}**.\n🏦 Υπολογίζω περίπου **{b}** ελεύθερα μέχρι {d}.', efFirstBad: '🚧 Το **«{name}»** είναι το πρώτο σχέδιο που δεν χωράει.', efAllFits: '✅ Όλα χωράνε, το ένα μετά το άλλο.',
		efLate: '📅 Η ημερομηνία πέρασε. Επεξεργαστείτε το σχέδιο για να διαλέξετε νέα ημερομηνία.', efDone: '🎉 Καλύπτεται ήδη από τα χρήματα που έχετε βάλει στην άκρη. Ώρα να το απολαύσετε!',
		efAltSmaller: '🎯 Στοχεύστε λίγο χαμηλότερα: περίπου **{a}** ({p}% λιγότερο) χωράει άνετα.', efAltLater: '🗓️ Ή μετακινήστε την ημερομηνία γύρω στις **{d}**.', efHelpsNote: '💡 Μαζί αυτά θα μπορούσαν να προσθέσουν περίπου **{a}** μέχρι την ημερομηνία.',
		efSortText: '🔒 **Αναγκαίο**: σταθερό και απαραίτητο\n🛒 **Ανάγκη**: απαραίτητο, αλλά μπορείτε να ψωνίσετε εξυπνότερα\n🎁 **Επιθυμία**: καλό να υπάρχει\n👆 Πατήστε για να αλλάξετε οποιοδήποτε.',
		efObSeeText: '🃏 Μια κάρτα με το σχέδιό σας και την εκτίμησή μου\n🔄 Αναστρέψτε την για τους αριθμούς\n🔍 Πατήστε **Πλήρης ανάλυση** για λεπτομέρειες', efObWhereText: '📍 Ανοίξτε το **Περισσότερα** και μετά το **eFriend**\n📋 Εκεί βρίσκονται τα σχέδιά σας, η πλήρης ανάλυση και ο τρόπος που ταξινομούνται τα έξοδά σας',
		efObHowText: '🙌 Δεν χρειάζεται να βάλετε χρήματα στην άκρη\n👀 Κοιτάζω τα πορτοφόλια, τα έσοδα, τους λογαριασμούς και τις συνήθειες εξόδων σας\n✅ Μετά σας λέω αν μπορείτε να το αντέξετε μέχρι την ημερομηνία', efObHowLink: '🔗 Προαιρετικό: συνδέστε έναν στόχο αποταμίευσης και θα υπολογίσω όσα έχουν αποταμιευτεί εκεί.',
		efMeetText: '👋 Ένας μικρός φίλος που ελέγχει αν μπορείτε να αντέξετε ένα ταξίδι ή μια μεγάλη αγορά\n🧮 Με βάση τα πορτοφόλια, τους λογαριασμούς, τα έσοδα και τις συνήθειές σας\n😄 Ευγενικά και με αστεία',
		efRepLess: '📉 Ξοδεύετε περίπου **{a}** λιγότερα την εβδομάδα σε επιθυμίες από πριν.', efRepMore: '📈 Ξοδεύετε περίπου **{a}** περισσότερα την εβδομάδα σε επιθυμίες από πριν.', efRepSame: '➖ Τα έξοδά σας για επιθυμίες έμειναν περίπου ίδια.', efRepNotProof: 'ℹ️ Σύγκριση των δικών σας αριθμών και όχι απόδειξη για το τι προκάλεσε την αλλαγή.',
		efPlanLinkHint: '🙌 Δεν χρειάζεται: το υπολογίζω από τα πορτοφόλια, τα έσοδα, τους λογαριασμούς και τις συνήθειες εξόδων σας.\n🔗 Διαλέξτε στόχο μόνο αν βάζετε και χρήματα σε αυτόν για αυτό. Όσα έχουν αποταμιευτεί εκεί υπολογίζονται ως ήδη στην άκρη.', efGroupHint: '🗂️ Τα σχέδια της ίδιας ομάδας ελέγχονται και μαζί.',
		efSoundTitle: 'Ήχοι ρομπότ', efSoundHint: 'Μικροί ήχοι όταν πατάτε το eFriend.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efEvCost: 'Cost changed from {a} to {b}', efEvDate: 'Date moved from {a} to {b}', efEvWallets: 'Wallets changed', efEvLink: 'Savings goal link changed', efEvSort: '{name} set as {level}',
		efEvCloser: '📈 Closer to your plan ({a}% → {b}% ready)', efEvFurther: '📉 Further from your plan ({a}% → {b}% ready)', efEvSame: '➖ No change in how ready you are',
		efRepEvents: 'Numbered gold points on the line are edits you made.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efEvCost: 'Το κόστος άλλαξε από {a} σε {b}', efEvDate: 'Η ημερομηνία μετακινήθηκε από {a} σε {b}', efEvWallets: 'Τα πορτοφόλια άλλαξαν', efEvLink: 'Η σύνδεση με στόχο αποταμίευσης άλλαξε', efEvSort: 'Το «{name}» ορίστηκε ως {level}',
		efEvCloser: '📈 Πιο κοντά στο σχέδιό σας ({a}% → {b}% έτοιμοι)', efEvFurther: '📉 Πιο μακριά από το σχέδιό σας ({a}% → {b}% έτοιμοι)', efEvSame: '➖ Καμία αλλαγή στο πόσο έτοιμοι είστε',
		efRepEvents: 'Τα αριθμημένα χρυσά σημεία στη γραμμή είναι αλλαγές που κάνατε.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efTipsTitle: 'Smart tips', efSetBudget: 'Set this budget', efOpenBudget: 'Open budget',
		efTipBudgetNew: '🎯 A monthly **{name}** budget of about **{a}** would help. It could add about **{g}** by the date.', efTipBudgetFriend: '🤝 Budgets keep you on track. A monthly **{name}** budget of about **{a}** would be a good friend.',
		efTipBudgetLower: '🎯 Lower your **{name}** budget to about **{a}**. That could add about **{g}** by the date.', efTipBudgetKeep: '✅ Your **{name}** budget is already helping. Stay inside it!',
		efTipNoSpend: '🛑 Two no-spend days a week on wants could add about **{a}**.', efTipWait: '⏳ Try the 24-hour rule: wait a day before any want over a small amount. Many urges simply fade.',
		efObBudTitle: 'Budgets are my best friend', efObBudCat: 'Takeaway', efObBudMonth: 'month', efObBudInside: 'Inside the budget',
		efObBudText: '🎯 A budget is a monthly limit for a category\n📊 I keep an eye on it for you\n💪 Staying inside it frees money for your plans\n🤝 If a plan is off target, I suggest budgets and link you straight to them\n💡 I also share other tips, even for a trip without me',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efTipsTitle: 'Έξυπνες συμβουλές', efSetBudget: 'Ορίστε αυτόν τον προϋπολογισμό', efOpenBudget: 'Άνοιγμα προϋπολογισμού',
		efTipBudgetNew: '🎯 Ένας μηνιαίος προϋπολογισμός **{name}** περίπου **{a}** θα βοηθούσε. Θα μπορούσε να προσθέσει περίπου **{g}** μέχρι την ημερομηνία.', efTipBudgetFriend: '🤝 Οι προϋπολογισμοί σας κρατούν στον δρόμο. Ένας μηνιαίος προϋπολογισμός **{name}** περίπου **{a}** θα ήταν καλός φίλος.',
		efTipBudgetLower: '🎯 Χαμηλώστε τον προϋπολογισμό **{name}** στα **{a}** περίπου. Θα μπορούσε να προσθέσει περίπου **{g}** μέχρι την ημερομηνία.', efTipBudgetKeep: '✅ Ο προϋπολογισμός **{name}** ήδη βοηθά. Μείνετε μέσα σε αυτόν!',
		efTipNoSpend: '🛑 Δύο ημέρες την εβδομάδα χωρίς έξοδα για επιθυμίες θα μπορούσαν να προσθέσουν περίπου **{a}**.', efTipWait: '⏳ Δοκιμάστε τον κανόνα των 24 ωρών: περιμένετε μία ημέρα πριν από κάθε επιθυμία πάνω από ένα μικρό ποσό. Πολλές παρορμήσεις απλώς περνούν.',
		efObBudTitle: 'Οι προϋπολογισμοί είναι ο καλύτερός μου φίλος', efObBudCat: 'Delivery', efObBudMonth: 'μήνα', efObBudInside: 'Μέσα στον προϋπολογισμό',
		efObBudText: '🎯 Ο προϋπολογισμός είναι ένα μηνιαίο όριο για μια κατηγορία\n📊 Το παρακολουθώ εγώ για εσάς\n💪 Αν μένετε μέσα του, ελευθερώνονται χρήματα για τα σχέδιά σας\n🤝 Αν ένα σχέδιο είναι εκτός στόχου, προτείνω προϋπολογισμούς και σας πάω κατευθείαν σε αυτούς\n💡 Μοιράζομαι και άλλες συμβουλές, ακόμα και για ένα ταξίδι χωρίς εμένα',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, { efTileCost: 'Cost', efTileFree: 'Likely free', efTileShort: 'Short by', efTileSpare: 'To spare', efTileDays: 'Days left', efTileHowMany: 'Plans', efTileLast: 'Last date' } );
	Object.assign( window.EXPENITY_I18N.langs.el, { efTileCost: 'Κόστος', efTileFree: 'Πιθανώς ελεύθερα', efTileShort: 'Λείπουν', efTileSpare: 'Περισσεύουν', efTileDays: 'Ημέρες', efTileHowMany: 'Σχέδια', efTileLast: 'Τελευταία ημερομηνία' } );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efDrag: 'Drag to reorder', efUp: 'Move up', efDown: 'Move down',
		efRiskTitle: 'How careful should I be?', efRiskBold: 'Bold', efRiskBalanced: 'Balanced', efRiskCautious: 'Cautious', efRiskHint: '🛡️ I call a plan **safe** when I expect at least **{p}%** of its cost to be free.',
		efPrioTitle: 'Which one matters most?', efPrioAsk: 'Your plans cost more than you will likely have. Which one comes first?', efPrioOne: 'Your priorities',
		efPrioText: '👆 Drag the plans into your order\n🏆 The top one gets your money first\n🤝 I never drop a plan for you, I only advise', efPrioTextOne: '🏆 With several plans, you choose which comes first\n🎚️ And how careful I should be', efPrioTextShort: '👆 Drag to rank. The top plan gets your money first.',
		efSuggestOrder: 'Let eFriend suggest', efPrioDone: 'Done', efPrioSection: 'Your priorities', efPrioChange: 'Change priorities',
		efPrioTop: '🏆 **{name}** is your top priority out of the {n} you set.', efPrioTopIs_safe: 'It fits safely.', efPrioTopIs_fits: 'It fits.', efPrioTopIs_risk: 'It is at risk.', efPrioTopIs_no: 'It does not fit yet.',
		efPrioSafe: '✅ Safe: {names}', efPrioFits: '👍 Fits, with a thin cushion: {names}', efPrioRisk: '⚠️ At risk: {names}', efPrioNo: "❌ Doesn't fit: {names}",
		efWhatIfDrop: '💡 If you drop **{drop}**, **{plan}** would fit.', efWhatIfLater: '📅 **{plan}** is a stretch by its date. A later date would help.',
		efAskBanner: 'Your plans cost more than I expect you to have. **Which one matters most?**', efAskBtn: 'Choose', efEvPrio: 'Priorities changed',
		efWishTitle: 'What are you dreaming about?', efWishText: '✈️ Paris? Rome? Anywhere?\n👟 Fancy new shoes?\n📱 A new phone, a gift, a car?\n💬 Add as many as you like. I will check them all.',
		efWishTrip: 'A trip', efWishShoes: 'Fancy shoes', efWishPhone: 'New phone', efWishGift: 'A gift', efWishCar: 'New car', efWishHoliday: 'Holiday', efWishLaptop: 'New laptop', efWishHome: 'Home project', efWishOther: 'Something else',
		efWishName: 'What is it?', efWishIncomplete: 'Add a cost and a future date, or remove it.', efWishAdded: '✅ Added: {names}', efWishRemove: 'Remove',
		efObPrioTitle: 'Who comes first?', efObPrioText: '🏆 With several wishes, you decide which comes first\n💬 If they cost more than you will have, I ask you\n✅ Then I tell you which are safe and which are at risk\n🤝 I never drop one for you, I only advise\n🎚️ Tell me below how careful to be',
		efAskEf: 'Ask eFriend', efNudgeText: '🤖 Meet eFriend: it checks whether you can afford your plans and helps you choose what comes first.', efNudgeBtn: 'Meet eFriend', efPromoWish: 'Paris? A new phone? Tell me what you are dreaming about.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efDrag: 'Σύρετε για αναδιάταξη', efUp: 'Μετακίνηση πάνω', efDown: 'Μετακίνηση κάτω',
		efRiskTitle: 'Πόσο προσεκτικό να είμαι;', efRiskBold: 'Τολμηρό', efRiskBalanced: 'Ισορροπημένο', efRiskCautious: 'Προσεκτικό', efRiskHint: '🛡️ Θεωρώ ένα σχέδιο **ασφαλές** όταν περιμένω να είναι ελεύθερο τουλάχιστον το **{p}%** του κόστους του.',
		efPrioTitle: 'Ποιο μετράει περισσότερο;', efPrioAsk: 'Τα σχέδιά σας κοστίζουν περισσότερα από όσα πιθανώς θα έχετε. Ποιο προηγείται;', efPrioOne: 'Οι προτεραιότητές σας',
		efPrioText: '👆 Σύρετε τα σχέδια στη σειρά που θέλετε\n🏆 Το πρώτο παίρνει πρώτο τα χρήματά σας\n🤝 Δεν αφαιρώ ποτέ σχέδιο για εσάς, απλώς συμβουλεύω', efPrioTextOne: '🏆 Όταν έχετε πολλά σχέδια, διαλέγετε ποιο προηγείται\n🎚️ Και πόσο προσεκτικό να είμαι', efPrioTextShort: '👆 Σύρετε για κατάταξη. Το πρώτο σχέδιο παίρνει πρώτο τα χρήματά σας.',
		efSuggestOrder: 'Να προτείνει το eFriend', efPrioDone: 'Τέλος', efPrioSection: 'Οι προτεραιότητές σας', efPrioChange: 'Αλλαγή προτεραιοτήτων',
		efPrioTop: '🏆 Το **{name}** είναι η κορυφαία προτεραιότητά σας από τα {n} που ορίσατε.', efPrioTopIs_safe: 'Χωράει με ασφάλεια.', efPrioTopIs_fits: 'Χωράει.', efPrioTopIs_risk: 'Κινδυνεύει.', efPrioTopIs_no: 'Δεν χωράει ακόμα.',
		efPrioSafe: '✅ Ασφαλή: {names}', efPrioFits: '👍 Χωράνε, με λεπτό περιθώριο: {names}', efPrioRisk: '⚠️ Σε κίνδυνο: {names}', efPrioNo: '❌ Δεν χωράνε: {names}',
		efWhatIfDrop: '💡 Αν παραλείψετε το **{drop}**, το **{plan}** θα χωρούσε.', efWhatIfLater: '📅 Το **{plan}** είναι δύσκολο μέχρι την ημερομηνία του. Μια μεταγενέστερη ημερομηνία θα βοηθούσε.',
		efAskBanner: 'Τα σχέδιά σας κοστίζουν περισσότερα από όσα περιμένω να έχετε. **Ποιο μετράει περισσότερο;**', efAskBtn: 'Επιλέξτε', efEvPrio: 'Οι προτεραιότητες άλλαξαν',
		efWishTitle: 'Για τι ονειρεύεστε;', efWishText: '✈️ Παρίσι; Ρώμη; Οπουδήποτε;\n👟 Φανταχτερά καινούργια παπούτσια;\n📱 Ένα νέο κινητό, ένα δώρο, ένα αυτοκίνητο;\n💬 Προσθέστε όσα θέλετε. Θα τα ελέγξω όλα.',
		efWishTrip: 'Ένα ταξίδι', efWishShoes: 'Φανταχτερά παπούτσια', efWishPhone: 'Νέο κινητό', efWishGift: 'Ένα δώρο', efWishCar: 'Νέο αυτοκίνητο', efWishHoliday: 'Διακοπές', efWishLaptop: 'Νέο laptop', efWishHome: 'Έργο στο σπίτι', efWishOther: 'Κάτι άλλο',
		efWishName: 'Τι είναι;', efWishIncomplete: 'Προσθέστε κόστος και μελλοντική ημερομηνία ή αφαιρέστε το.', efWishAdded: '✅ Προστέθηκαν: {names}', efWishRemove: 'Αφαίρεση',
		efObPrioTitle: 'Ποιο προηγείται;', efObPrioText: '🏆 Όταν έχετε πολλές επιθυμίες, εσείς αποφασίζετε ποια προηγείται\n💬 Αν κοστίζουν περισσότερα από όσα θα έχετε, σας ρωτάω\n✅ Μετά σας λέω ποιες είναι ασφαλείς και ποιες σε κίνδυνο\n🤝 Δεν αφαιρώ ποτέ καμία για εσάς, απλώς συμβουλεύω\n🎚️ Πείτε μου παρακάτω πόσο προσεκτικό να είμαι',
		efAskEf: 'Ρωτήστε το eFriend', efNudgeText: '🤖 Γνωρίστε το eFriend: ελέγχει αν μπορείτε να αντέξετε τα σχέδιά σας και σας βοηθά να διαλέξετε τι προηγείται.', efNudgeBtn: 'Γνωρίστε το eFriend', efPromoWish: 'Παρίσι; Ένα νέο κινητό; Πείτε μου για τι ονειρεύεστε.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efRiskTitle: 'Safety cushion', efRiskRisky: 'Risky', efRiskBold: 'Bold', efRiskBalanced: 'Balanced', efRiskCareful: 'Careful', efRiskSafe: 'Safe', efRiskVerySafe: 'Very safe',
		efMonthsN: ( { n, one } ) => n + ( one ? ' month' : ' months' ) + ' of spending',
		efCushionHint: '🛡️ With **{word}**, I keep about **{a}** untouched after each plan.\n🗓️ That is **{m}** (you spend about **{s}** a month).', efCushionZero: '⚠️ With **{word}**, I would let a plan use almost everything you have.',
		efAccuracy: '📈 The more you use Expenity, the sharper I get. I have **{d} days** of history so far.', efNoIncomeAsk: '💶 I do not know your income yet. Add it and I can be more accurate.', efAddIncome: 'Add income',
		efTileLeft: 'Left after buying', efCover: '🛟 That covers **{n}** (about **{s}** a month).', efIncomeOk: '💶 With your expected income, next month stays positive.', efIncomeNo: '⚠️ Even with your expected income, next month would be tight.',
		efLeftLine: '🛟 {a} left after buying ({m})', efShortLine: '⚠️ Short by {a}',
		efObIncTitle: 'Where does your money come from?', efObIncText: '💶 Tell me your salary or regular income\n🗓️ I use the day it arrives to see how next month looks\n🎯 The more I know, the better my answers', efObIncDone: '✅ Income added. I will use it in my forecasts.', efObIncSkip: 'You can skip this and add it later in Plan.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efRiskTitle: 'Περιθώριο ασφαλείας', efRiskRisky: 'Επικίνδυνο', efRiskBold: 'Τολμηρό', efRiskBalanced: 'Ισορροπημένο', efRiskCareful: 'Προσεκτικό', efRiskSafe: 'Ασφαλές', efRiskVerySafe: 'Πολύ ασφαλές',
		efMonthsN: ( { n, one } ) => n + ( one ? ' μήνας' : ' μήνες' ) + ' εξόδων',
		efCushionHint: '🛡️ Με το **{word}**, κρατώ περίπου **{a}** ανέγγιχτα μετά από κάθε σχέδιο.\n🗓️ Αυτό είναι **{m}** (ξοδεύετε περίπου **{s}** τον μήνα).', efCushionZero: '⚠️ Με το **{word}**, θα άφηνα ένα σχέδιο να χρησιμοποιήσει σχεδόν όλα όσα έχετε.',
		efAccuracy: '📈 Όσο περισσότερο χρησιμοποιείτε το Expenity, τόσο πιο ακριβής γίνομαι. Έχω **{d} ημέρες** ιστορικού μέχρι τώρα.', efNoIncomeAsk: '💶 Δεν γνωρίζω ακόμα το εισόδημά σας. Προσθέστε το και θα είμαι πιο ακριβές.', efAddIncome: 'Προσθήκη εισοδήματος',
		efTileLeft: 'Μένουν μετά την αγορά', efCover: '🛟 Αυτό καλύπτει **{n}** (περίπου **{s}** τον μήνα).', efIncomeOk: '💶 Με το αναμενόμενο εισόδημά σας, ο επόμενος μήνας μένει θετικός.', efIncomeNo: '⚠️ Ακόμα και με το αναμενόμενο εισόδημά σας, ο επόμενος μήνας θα είναι στενός.',
		efLeftLine: '🛟 Μένουν {a} μετά την αγορά ({m})', efShortLine: '⚠️ Λείπουν {a}',
		efObIncTitle: 'Από πού προέρχονται τα χρήματά σας;', efObIncText: '💶 Πείτε μου τον μισθό ή το τακτικό εισόδημά σας\n🗓️ Χρησιμοποιώ την ημέρα που έρχεται για να δω πώς φαίνεται ο επόμενος μήνας\n🎯 Όσα περισσότερα ξέρω, τόσο καλύτερες οι απαντήσεις μου', efObIncDone: '✅ Το εισόδημα προστέθηκε. Θα το χρησιμοποιώ στις προβλέψεις μου.', efObIncSkip: 'Μπορείτε να το παραλείψετε και να το προσθέσετε αργότερα στο Πλάνο.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efDueTitle: 'Did you make it?', efDueText: '🎯 The date for **{name}** has arrived.\n💬 Tell me how it went and I will keep your records right.', efDueLater: 'Ask me later',
		efDueYes: '✅ Yes, I did it!', efDueMove: '📅 Not yet, move the date', efDueDrop: '💔 I changed my mind',
		efYesTitle: 'Amazing! Let us record it', efYesText: '🧾 I will add it to your expenses with a small eFriend badge\n🏆 And it goes into your achievements', efYesCost: 'How much did it cost?', efYesDate: 'When?', efYesWallet: 'Paid from', efYesCategory: 'Category', efYesAdd: '🎉 Add to my expenses', efYesDateErr: 'Pick a date that is today or earlier.',
		efDoneTitle: 'Congratulations!', efDoneText: '✅ Added to your expenses with an eFriend badge\n🏆 Saved in your achievements', efDoneBtn: 'Done',
		efMoveTitle: 'No problem, let us move it', efMoveText: '📅 Pick a new date (and change the cost if it changed)\n🔍 I will check again right away', efMoveBtn: 'Move it',
		efDropTitle: 'Remove this plan?', efDropText: '🗄️ It leaves your list\n↩️ You can bring it back from Past plans', efDropYes: 'Yes, remove it',
		efAchTitle: 'What you achieved with eFriend', efAchLine: '🏆 **{n}** made it, **{a}** in total.', efAchNone: '🌱 Nothing yet. Your first achievement will appear here.', efPast: 'Past plans', efReopen: 'Reopen',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efDueTitle: 'Τα καταφέρατε;', efDueText: '🎯 Η ημερομηνία για το **{name}** έφτασε.\n💬 Πείτε μου πώς πήγε και θα κρατήσω σωστά τα αρχεία σας.', efDueLater: 'Ρωτήστε με αργότερα',
		efDueYes: '✅ Ναι, τα κατάφερα!', efDueMove: '📅 Όχι ακόμα, μετακινήστε την ημερομηνία', efDueDrop: '💔 Άλλαξα γνώμη',
		efYesTitle: 'Υπέροχα! Ας το καταγράψουμε', efYesText: '🧾 Θα το προσθέσω στα έξοδά σας με ένα μικρό σήμα του eFriend\n🏆 Και θα μπει στα επιτεύγματά σας', efYesCost: 'Πόσο κόστισε;', efYesDate: 'Πότε;', efYesWallet: 'Πληρώθηκε από', efYesCategory: 'Κατηγορία', efYesAdd: '🎉 Προσθήκη στα έξοδά μου', efYesDateErr: 'Διαλέξτε σημερινή ή προηγούμενη ημερομηνία.',
		efDoneTitle: 'Συγχαρητήρια!', efDoneText: '✅ Προστέθηκε στα έξοδά σας με σήμα eFriend\n🏆 Αποθηκεύτηκε στα επιτεύγματά σας', efDoneBtn: 'Τέλος',
		efMoveTitle: 'Κανένα πρόβλημα, ας το μετακινήσουμε', efMoveText: '📅 Διαλέξτε νέα ημερομηνία (και αλλάξτε το κόστος αν άλλαξε)\n🔍 Θα ελέγξω ξανά αμέσως', efMoveBtn: 'Μετακίνηση',
		efDropTitle: 'Να αφαιρεθεί αυτό το σχέδιο;', efDropText: '🗄️ Φεύγει από τη λίστα σας\n↩️ Μπορείτε να το επαναφέρετε από τα Προηγούμενα σχέδια', efDropYes: 'Ναι, αφαίρεση',
		efAchTitle: 'Τι καταφέρατε με το eFriend', efAchLine: '🏆 Πραγματοποιήθηκαν **{n}**, συνολικά **{a}**.', efAchNone: '🌱 Τίποτα ακόμα. Το πρώτο σας επίτευγμα θα εμφανιστεί εδώ.', efPast: 'Προηγούμενα σχέδια', efReopen: 'Επαναφορά',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efConvert: 'Let eFriend manage this goal', efConvertHint: '🤖 It becomes an eFriend plan and leaves your goals\n💰 Money you already put in keeps counting',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efConvert: 'Να το διαχειρίζεται το eFriend', efConvertHint: '🤖 Γίνεται σχέδιο eFriend και φεύγει από τους στόχους σας\n💰 Τα χρήματα που έχετε ήδη βάλει συνεχίζουν να υπολογίζονται',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efSetAside: 'set aside', efPendingWord: 'pending', efMovedBy: 'Moved by eFriend', efUndo: 'Undo', efUndone: 'Undone', efWeekMoved: '🤖 This week eFriend moved **{a}** ({n} entries).',
		efPropTitle: 'eFriend proposes', efPropItem: '🎯 **{a}** → **{name}**', efPropTotal: '💰 Total **{a}**. Nothing real moves: this only updates your records.', efPropExpire: '⏳ If you do not answer, this expires in **{n}** days. Nothing is lost.',
		efPropConfirm: 'Confirm', efPropEdit: 'Edit', efPropDismiss: 'Dismiss', efPropDone: 'Recorded. Your bank is not touched.', efPropNote: '🧾 Confirming only updates your records.',
		efAllocTitle: 'Helping with my goals', efAllocText: '🎯 I can work out how much is safe to put into your savings goals\n✋ You choose how much I do on my own\n🧾 It only updates your records. Real money never moves.',
		efModeOff: 'Off', efModeOffSub: 'No help', efModeSuggest: 'Suggest', efModeSuggestSub: 'I tell you the safe amount', efModeAsk: 'Ask first', efModeAskSub: 'I propose, you confirm', efModeAuto: 'Automatic', efModeAutoSub: 'I record it, you can undo',
		efEvery: 'How often', efEvery_daily: 'Daily', efEvery_weekly: 'Weekly', efEvery_monthly: 'Monthly', efMaxPending: 'Proposals waiting at once', efExpireNote: '⏳ A proposal you do not answer expires after 3 days and is not counted.',
		efWhichGoals: 'Goals I may help with', efNoGoalsToFeed: 'You have no savings goals yet. Add one in Plan.', efSuggestNow: '💡 You can safely move about **{a}** now: {names}.', efMoveNow: 'Record it now', efNoRealMoney: '🏦 No real money moves. This is a tracking system.',
		efAutoWarnTitle: 'Turn on automatic?', efAutoWarnHi: 'I need a little more data to be good at this.', efAutoWarnData: '📈 I only have **{d} days** of history, so my amounts may be rough.', efAutoWarnUndo: '↩️ Every automatic entry has an Undo button.', efAutoWarnSafe: '🛡️ I never go below your cushion.', efAutoKeepAsk: 'Keep asking first', efAutoTurnOn: 'Turn on automatic',
		efObMovesTitle: 'I can help move money too', efObMovesText: '💡 Suggest: I tell you how much is safe to put into a goal\n✋ Ask first: I propose, you confirm or dismiss\n🤖 Automatic: I record it and you can undo\n⏳ Unanswered proposals expire after 3 days, nothing is lost\n🏦 No real money moves. It is all records', efObMovesLater: 'You choose in More, then eFriend.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efSetAside: 'στην άκρη', efPendingWord: 'σε αναμονή', efMovedBy: 'Μετακινήθηκε από το eFriend', efUndo: 'Αναίρεση', efUndone: 'Αναιρέθηκε', efWeekMoved: '🤖 Αυτή την εβδομάδα το eFriend μετακίνησε **{a}** ({n} εγγραφές).',
		efPropTitle: 'Πρόταση του eFriend', efPropItem: '🎯 **{a}** → **{name}**', efPropTotal: '💰 Σύνολο **{a}**. Δεν μετακινούνται πραγματικά χρήματα: ενημερώνονται μόνο τα αρχεία σας.', efPropExpire: '⏳ Αν δεν απαντήσετε, λήγει σε **{n}** ημέρες. Δεν χάνεται τίποτα.',
		efPropConfirm: 'Επιβεβαίωση', efPropEdit: 'Επεξεργασία', efPropDismiss: 'Απόρριψη', efPropDone: 'Καταγράφηκε. Η τράπεζά σας δεν επηρεάζεται.', efPropNote: '🧾 Η επιβεβαίωση ενημερώνει μόνο τα αρχεία σας.',
		efAllocTitle: 'Βοήθεια με τους στόχους μου', efAllocText: '🎯 Μπορώ να υπολογίσω πόσα είναι ασφαλές να μπουν στους στόχους αποταμίευσής σας\n✋ Εσείς διαλέγετε πόσα κάνω μόνο μου\n🧾 Ενημερώνει μόνο τα αρχεία σας. Πραγματικά χρήματα δεν μετακινούνται ποτέ.',
		efModeOff: 'Ανενεργό', efModeOffSub: 'Χωρίς βοήθεια', efModeSuggest: 'Πρόταση', efModeSuggestSub: 'Σας λέω το ασφαλές ποσό', efModeAsk: 'Ρωτά πρώτα', efModeAskSub: 'Προτείνω, εσείς επιβεβαιώνετε', efModeAuto: 'Αυτόματο', efModeAutoSub: 'Το καταγράφω, μπορείτε να το αναιρέσετε',
		efEvery: 'Πόσο συχνά', efEvery_daily: 'Καθημερινά', efEvery_weekly: 'Εβδομαδιαία', efEvery_monthly: 'Μηνιαία', efMaxPending: 'Προτάσεις σε αναμονή ταυτόχρονα', efExpireNote: '⏳ Μια πρόταση που δεν απαντάτε λήγει μετά από 3 ημέρες και δεν υπολογίζεται.',
		efWhichGoals: 'Στόχοι στους οποίους μπορώ να βοηθήσω', efNoGoalsToFeed: 'Δεν έχετε ακόμα στόχους αποταμίευσης. Προσθέστε έναν στο Πλάνο.', efSuggestNow: '💡 Μπορείτε με ασφάλεια να μετακινήσετε περίπου **{a}** τώρα: {names}.', efMoveNow: 'Καταγραφή τώρα', efNoRealMoney: '🏦 Δεν μετακινούνται πραγματικά χρήματα. Είναι σύστημα παρακολούθησης.',
		efAutoWarnTitle: 'Ενεργοποίηση αυτόματου;', efAutoWarnHi: 'Χρειάζομαι λίγα ακόμα δεδομένα για να τα πηγαίνω καλά.', efAutoWarnData: '📈 Έχω μόνο **{d} ημέρες** ιστορικού, οπότε τα ποσά μου μπορεί να είναι πρόχειρα.', efAutoWarnUndo: '↩️ Κάθε αυτόματη εγγραφή έχει κουμπί Αναίρεσης.', efAutoWarnSafe: '🛡️ Δεν πηγαίνω ποτέ κάτω από το περιθώριό σας.', efAutoKeepAsk: 'Να ρωτά πρώτα', efAutoTurnOn: 'Ενεργοποίηση αυτόματου',
		efObMovesTitle: 'Μπορώ να βοηθήσω και με τη μετακίνηση χρημάτων', efObMovesText: '💡 Πρόταση: σας λέω πόσα είναι ασφαλές να μπουν σε έναν στόχο\n✋ Ρωτά πρώτα: προτείνω, εσείς επιβεβαιώνετε ή απορρίπτετε\n🤖 Αυτόματο: το καταγράφω και μπορείτε να το αναιρέσετε\n⏳ Οι προτάσεις που δεν απαντάτε λήγουν σε 3 ημέρες, δεν χάνεται τίποτα\n🏦 Δεν μετακινούνται πραγματικά χρήματα. Είναι όλα αρχεία', efObMovesLater: 'Διαλέγετε στο Περισσότερα, μετά eFriend.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efDueGood: '✅ Good news: you can afford it. After buying you would still have **{a}** ({m}).', efDueTight: '⚠️ You can afford it, but only **{a}** would be left ({m}).', efDueShort: '❌ Right now it would leave you **{a}** short.',
		efEarliest: '📅 Earliest safe date: **{d}**.', efEarliestNone: '🗓️ Not within a year at your current pace.', efUseDate: 'Use this date', efSuggestDate: 'Suggest a date',
		efLimitOver: '📊 You usually spend about **{a}** a day, above your **{b}** limit.',
		efLimNoteDayMonth: '⚠️ **{a}** a day adds up to about **{a30}** a month, more than your monthly limit of **{b}**. I use the stricter one.', efLimNoteDayWeek: '⚠️ **{a}** a day adds up to about **{a7}** a week, more than your weekly limit of **{b}**. I use the stricter one.', efLimNoteWeekMonth: '⚠️ **{a}** a week adds up to about **{a4}** a month, more than your monthly limit of **{b}**. I use the stricter one.',
		efLimTitle: 'What is the most you are comfortable spending?', efLimText: '🛡️ Tell me your own limits and I will plan around them\n📊 I use the lower of your limit and your usual habits\n⏭️ Leave blank any you do not want to set', efLimDay: 'Most per day', efLimWeek: 'Most per week', efLimMonth: 'Most per month', efLimSaved: '✅ Saved in your spending targets, so you can change them there too.',
		targetLimits: 'Spending limits', targetLimitsHelp: 'The most you are comfortable spending. eFriend plans around the lower of these and your usual habits.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efDueGood: '✅ Καλά νέα: μπορείτε να το αντέξετε. Μετά την αγορά θα σας μένουν ακόμα **{a}** ({m}).', efDueTight: '⚠️ Μπορείτε να το αντέξετε, αλλά θα σας μένουν μόνο **{a}** ({m}).', efDueShort: '❌ Αυτή τη στιγμή θα σας έλειπαν **{a}**.',
		efEarliest: '📅 Πρώτη ασφαλής ημερομηνία: **{d}**.', efEarliestNone: '🗓️ Όχι μέσα σε έναν χρόνο με τον τρέχοντα ρυθμό σας.', efUseDate: 'Χρήση αυτής της ημερομηνίας', efSuggestDate: 'Πρόταση ημερομηνίας',
		efLimitOver: '📊 Συνήθως ξοδεύετε περίπου **{a}** την ημέρα, πάνω από το όριό σας των **{b}**.',
		efLimNoteDayMonth: '⚠️ Τα **{a}** την ημέρα φτάνουν περίπου τα **{a30}** τον μήνα, περισσότερα από το μηνιαίο όριό σας των **{b}**. Χρησιμοποιώ το αυστηρότερο.', efLimNoteDayWeek: '⚠️ Τα **{a}** την ημέρα φτάνουν περίπου τα **{a7}** την εβδομάδα, περισσότερα από το εβδομαδιαίο όριό σας των **{b}**. Χρησιμοποιώ το αυστηρότερο.', efLimNoteWeekMonth: '⚠️ Τα **{a}** την εβδομάδα φτάνουν περίπου τα **{a4}** τον μήνα, περισσότερα από το μηνιαίο όριό σας των **{b}**. Χρησιμοποιώ το αυστηρότερο.',
		efLimTitle: 'Ποιο είναι το μέγιστο που νιώθετε άνετα να ξοδεύετε;', efLimText: '🛡️ Πείτε μου τα δικά σας όρια και θα σχεδιάζω με βάση αυτά\n📊 Χρησιμοποιώ το χαμηλότερο ανάμεσα στο όριό σας και στις συνήθειές σας\n⏭️ Αφήστε κενό όποιο δεν θέλετε να ορίσετε', efLimDay: 'Μέγιστο ανά ημέρα', efLimWeek: 'Μέγιστο ανά εβδομάδα', efLimMonth: 'Μέγιστο ανά μήνα', efLimSaved: '✅ Αποθηκεύονται στους στόχους εξόδων σας, ώστε να τα αλλάζετε και από εκεί.',
		targetLimits: 'Όρια εξόδων', targetLimitsHelp: 'Το μέγιστο που νιώθετε άνετα να ξοδεύετε. Το eFriend σχεδιάζει με βάση το χαμηλότερο από αυτά και τις συνήθειές σας.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, { efMonthWord: 'month', efMonthsWord: 'months' } );
	Object.assign( window.EXPENITY_I18N.langs.el, { efMonthWord: 'μήνας', efMonthsWord: 'μήνες' } );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efDeficit: '🔥 You spend about **{a}** a month more than you earn. What is left would last about **{r}**.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efDeficit: '🔥 Ξοδεύετε περίπου **{a}** τον μήνα περισσότερα από όσα κερδίζετε. Αυτό που απομένει θα κρατούσε περίπου **{r}**.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efAskTitle: 'Ask eFriend', efAskShort: 'Ask', efAskHi: 'Ask me before you buy something. I will find the best day.', efAskQ: 'Your question', efAskPh: 'Can I buy shoes that cost 49?', efAskWhat: 'What is it?', efAskHow: 'How much?', efAskGo: 'Ask eFriend', efAskThing: 'This purchase',
		efAskNeedCost: 'Tell me how much it costs.', efAskCardTitle: 'Can I afford it?', efAskCardText: 'Ask about anything you want to buy and I will check your money and find the best day.',
		efAskYes: '✅ Yes. You can buy {item} for **{a}** today and stay comfortably safe.', efAskThin: '👍 Yes, you can buy {item} today. Your cushion gets a little thinner.', efAskTight: '⚠️ You can, but it gets tight.', efAskTightWait: '⚠️ You can, but it gets tight. It is easier on **{d}**.',
		efAskNotToday: '❌ Not today. A better day is **{d}**.', efAskNever: '❌ Not within 6 weeks at your current pace. Make it a plan and I will find the earliest safe date.',
		efAskBest: '⭐ Best day: **{d}**. Your lowest point afterwards would be **{a}**.', efAskWhyPay: '💶 That is right after **{n}** arrives, before the next bills.', efAskWhyLow: '📊 Your lowest point afterwards is highest on that day.', efAskSmall: '🪙 It is small compared with your month, so a plan is optional.',
		efAskCalTitle: 'Best days to buy', efAskLBest: 'Best', efAskLGood: 'Good', efAskLTight: 'Tight', efAskLAvoid: 'Avoid', efAskLPay: 'Income', efAskLBill: 'Bills', efAskLStar: 'Best day',
		efAskLow: 'Lowest point after', efAskBestDay: 'Best day',
		efAskDay_best: '🟢 **{d}**: a safe day. Your lowest point afterwards would be **{a}**.', efAskDay_good: '🟡 **{d}**: fine, with a thinner cushion. Lowest point afterwards **{a}**.', efAskDay_tight: '🟠 **{d}**: it gets tight. Lowest point afterwards **{a}**.', efAskDay_avoid: '🔴 **{d}**: better to avoid. You would run short.', efAskDayShort: '⚠️ About **{a}** short at the worst moment.',
		efAskMkPay: '💶 Income that day: {n}', efAskMkBill: '🧾 Bills that day: {n}', efAskMakePlan: 'Make it a plan for {d}', efAskNote: 'I counted your income, bills, usual spending, spending limits and your other plans. Tap a day to see why.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efAskTitle: 'Ρωτήστε το eFriend', efAskShort: 'Ρωτήστε', efAskHi: 'Ρωτήστε με πριν αγοράσετε κάτι. Θα βρω την καλύτερη ημέρα.', efAskQ: 'Η ερώτησή σας', efAskPh: 'Μπορώ να αγοράσω παπούτσια 49 €;', efAskWhat: 'Τι είναι;', efAskHow: 'Πόσο κάνει;', efAskGo: 'Ρωτήστε το eFriend', efAskThing: 'Αυτή η αγορά',
		efAskNeedCost: 'Πείτε μου πόσο κοστίζει.', efAskCardTitle: 'Μπορώ να το αντέξω;', efAskCardText: 'Ρωτήστε για οτιδήποτε θέλετε να αγοράσετε και θα ελέγξω τα χρήματά σας και θα βρω την καλύτερη ημέρα.',
		efAskYes: '✅ Ναι. Μπορείτε να αγοράσετε: {item} για **{a}** σήμερα και να μείνετε άνετα ασφαλείς.', efAskThin: '👍 Ναι, μπορείτε να αγοράσετε: {item} σήμερα. Το περιθώριό σας λεπταίνει λίγο.', efAskTight: '⚠️ Μπορείτε, αλλά θα είναι στενά.', efAskTightWait: '⚠️ Μπορείτε, αλλά θα είναι στενά. Θα είναι πιο εύκολο στις **{d}**.',
		efAskNotToday: '❌ Όχι σήμερα. Μια καλύτερη ημέρα είναι οι **{d}**.', efAskNever: '❌ Όχι μέσα σε 6 εβδομάδες με τον τρέχοντα ρυθμό σας. Κάντε το σχέδιο και θα βρω την πρώτη ασφαλή ημερομηνία.',
		efAskBest: '⭐ Καλύτερη ημέρα: **{d}**. Το χαμηλότερο σημείο σας μετά θα ήταν **{a}**.', efAskWhyPay: '💶 Είναι αμέσως μετά την άφιξη του: **{n}**, πριν από τους επόμενους λογαριασμούς.', efAskWhyLow: '📊 Εκείνη την ημέρα το χαμηλότερο σημείο σας μετά είναι το υψηλότερο.', efAskSmall: '🪙 Είναι μικρό σε σχέση με τον μήνα σας, οπότε το σχέδιο είναι προαιρετικό.',
		efAskCalTitle: 'Οι καλύτερες ημέρες για αγορά', efAskLBest: 'Άριστη', efAskLGood: 'Καλή', efAskLTight: 'Στενά', efAskLAvoid: 'Αποφύγετε', efAskLPay: 'Εισόδημα', efAskLBill: 'Λογαριασμοί', efAskLStar: 'Καλύτερη ημέρα',
		efAskLow: 'Χαμηλότερο σημείο μετά', efAskBestDay: 'Καλύτερη ημέρα',
		efAskDay_best: '🟢 **{d}**: ασφαλής ημέρα. Το χαμηλότερο σημείο σας μετά θα ήταν **{a}**.', efAskDay_good: '🟡 **{d}**: εντάξει, με λεπτότερο περιθώριο. Χαμηλότερο σημείο μετά **{a}**.', efAskDay_tight: '🟠 **{d}**: θα είναι στενά. Χαμηλότερο σημείο μετά **{a}**.', efAskDay_avoid: '🔴 **{d}**: καλύτερα να την αποφύγετε. Θα σας έλειπαν χρήματα.', efAskDayShort: '⚠️ Θα σας έλειπαν περίπου **{a}** τη χειρότερη στιγμή.',
		efAskMkPay: '💶 Εισόδημα εκείνη την ημέρα: {n}', efAskMkBill: '🧾 Λογαριασμοί εκείνη την ημέρα: {n}', efAskMakePlan: 'Κάντε το σχέδιο για τις {d}', efAskNote: 'Έλαβα υπόψη το εισόδημα, τους λογαριασμούς, τα συνηθισμένα έξοδα, τα όριά σας και τα άλλα σας σχέδια. Πατήστε μια ημέρα για να δείτε το γιατί.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efSugAsk: 'What may I adjust for the best outcome?', efSugOrder: 'Only the order of your plans', efSugOrderText: '📋 Cheapest first, so the most plans can happen.\n🛡️ Your safety cushion stays as it is.',
		efSugBoth: 'The order and the safety cushion', efSugBothText: '📋 Cheapest first, and I check which cushion fits best.', efSugBothCushion: '🛡️ Cushion: from **{a}** to **{b}**.', efSugBothFit: '✅ **{n}** of **{all}** plans would fit.',
		efSugMenu: 'Ask eFriend', efSugMenuSub: 'Can I afford it? Best days to buy',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efSugAsk: 'Τι να προσαρμόσω για το καλύτερο αποτέλεσμα;', efSugOrder: 'Μόνο τη σειρά των σχεδίων σας', efSugOrderText: '📋 Πρώτα το φθηνότερο, ώστε να γίνουν όσο το δυνατόν περισσότερα σχέδια.\n🛡️ Το μαξιλάρι ασφαλείας σας μένει ως έχει.',
		efSugBoth: 'Τη σειρά και το μαξιλάρι ασφαλείας', efSugBothText: '📋 Πρώτα το φθηνότερο, και ελέγχω ποιο μαξιλάρι ταιριάζει καλύτερα.', efSugBothCushion: '🛡️ Μαξιλάρι: από **{a}** σε **{b}**.', efSugBothFit: '✅ Τα **{n}** από **{all}** σχέδια θα χωρούσαν.',
		efSugMenu: 'Ρωτήστε το eFriend', efSugMenuSub: 'Μπορώ να το αγοράσω; Οι καλύτερες μέρες',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efLimSuggest: '📊 From your last **{n}** days, I suggest **{d}** a day, **{w}** a week and **{m}** a month.\n🧾 That includes your bills, and leaves a little room to improve.', efLimUse: 'Use this', efLimNoData: '🌱 I do not have enough history yet.\n💬 Tell me what you are comfortable spending, in any one box, and I will fill the others.',
		efLimWarn_day: '📅 With this, today comes to **{a}**, above your **{b}** daily limit.', efLimWarn_week: '🗓️ With this, this week comes to **{a}**, above your **{b}** weekly limit.', efLimWarn_month: '📆 With this, this month comes to **{a}**, above your **{b}** monthly limit.', efLimSaveAnyway: 'Save anyway', efLimWarnTitle: 'Over your limit',
		efLowZero: '⚠️ Around **{d}** your money is likely to run out.', efLowCushion: '🛡️ Around **{d}** your money is likely to drop below your safety cushion of **{c}**.', efLowWhy: '🧾 The big payment around then: **{n}**.', efLowTip: '💡 Moving that payment, or a plan, a few days later would help.', efGotIt: 'Got it',
		efBudIdeas: 'Budget ideas', efBudIdeasText: '📊 These are the categories where you spend the most and have no budget yet.\n💡 My suggestion is a little below what you usually spend.', efBudIdeaRow: 'You usually spend **{a}** a month. Suggested: **{b}**.', efBudAdd: 'Add', efBudAddAll: 'Add all',
		efCushSteady: '💡 Your income changed by about **{s}%** from month to month, so I would keep **{m}** untouched.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efLimSuggest: '📊 Από τις τελευταίες σας **{n}** ημέρες, προτείνω **{d}** την ημέρα, **{w}** την εβδομάδα και **{m}** τον μήνα.\n🧾 Περιλαμβάνει τους λογαριασμούς σας και αφήνει λίγο περιθώριο βελτίωσης.', efLimUse: 'Χρήση', efLimNoData: '🌱 Δεν έχω ακόμα αρκετό ιστορικό.\n💬 Πείτε μου πόσο άνετα θέλετε να ξοδεύετε, σε οποιοδήποτε πεδίο, και θα συμπληρώσω τα υπόλοιπα.',
		efLimWarn_day: '📅 Με αυτό, η σημερινή ημέρα φτάνει τα **{a}**, πάνω από το ημερήσιο όριό σας των **{b}**.', efLimWarn_week: '🗓️ Με αυτό, η εβδομάδα φτάνει τα **{a}**, πάνω από το εβδομαδιαίο όριό σας των **{b}**.', efLimWarn_month: '📆 Με αυτό, ο μήνας φτάνει τα **{a}**, πάνω από το μηνιαίο όριό σας των **{b}**.', efLimSaveAnyway: 'Αποθήκευση παρ’ όλα αυτά', efLimWarnTitle: 'Πάνω από το όριό σας',
		efLowZero: '⚠️ Γύρω στις **{d}** τα χρήματά σας πιθανότατα θα τελειώσουν.', efLowCushion: '🛡️ Γύρω στις **{d}** τα χρήματά σας πιθανότατα θα πέσουν κάτω από το μαξιλάρι ασφαλείας σας των **{c}**.', efLowWhy: '🧾 Η μεγάλη πληρωμή τότε: **{n}**.', efLowTip: '💡 Θα βοηθούσε να μετακινήσετε αυτή την πληρωμή, ή ένα σχέδιο, λίγες ημέρες αργότερα.', efGotIt: 'Κατάλαβα',
		efBudIdeas: 'Ιδέες για προϋπολογισμούς', efBudIdeasText: '📊 Αυτές είναι οι κατηγορίες όπου ξοδεύετε περισσότερο και δεν έχετε ακόμα προϋπολογισμό.\n💡 Η πρότασή μου είναι λίγο κάτω από όσα συνήθως ξοδεύετε.', efBudIdeaRow: 'Συνήθως ξοδεύετε **{a}** τον μήνα. Πρόταση: **{b}**.', efBudAdd: 'Προσθήκη', efBudAddAll: 'Προσθήκη όλων',
		efCushSteady: '💡 Το εισόδημά σας άλλαζε κατά περίπου **{s}%** από μήνα σε μήνα, οπότε θα κρατούσα **{m}** ανέγγιχτους.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efChatHi: '👋 Hi! Tell me what you would like to buy and what it costs, for example “new shoes 49”.', efChatTyping: 'eFriend is typing', efChatNeedCost: '💶 How much does **{item}** cost?', efChatNeedCost0: '💶 How much does it cost?',
		efChatGot: '🧐 Let me check I understood you:', efChatGot2: '👍 Got it, I changed it:', efChatRight: '❓ Is that right?', efChatYes: 'Yes, that is right', efChatFix: 'Let me fix it', efChatFixAsk: '✏️ No problem. Tell me the right item or price, for example “it is 1250”.',
		efChatThinking: '🔎 Let me look at your money, bills, income and plans…', efChatCal: 'Show me the best days', efChatPlan: 'Make it a plan', efChatAgain: 'Ask something else', efChatAgainSay: '😊 Sure! What would you like to check next?', efChatCalSay: '📅 Here are the best days for **{item}**. Tap a day to see why.',
		efChatNoDay: '🗓️ I cannot find a safe day in the next **4 months**.', efChatWhyDeficit: '🔥 You spend about **{a}** a month more than you earn.', efChatWhyMax: '📉 At best, I could call about **{a}** safe to spend in one go.', efChatNoDayTip: '💡 Make it a plan and I will keep watching, and find the earliest safe date as things change.',
		efAskNever: '❌ Not within the next **4 months** at your current pace.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efChatHi: '👋 Γεια σας! Πείτε μου τι θα θέλατε να αγοράσετε και πόσο κοστίζει, για παράδειγμα «νέα παπούτσια 49».', efChatTyping: 'Το eFriend πληκτρολογεί', efChatNeedCost: '💶 Πόσο κοστίζει: **{item}**;', efChatNeedCost0: '💶 Πόσο κοστίζει;',
		efChatGot: '🧐 Να βεβαιωθώ ότι κατάλαβα σωστά:', efChatGot2: '👍 Κατάλαβα, το άλλαξα:', efChatRight: '❓ Είναι σωστό;', efChatYes: 'Ναι, είναι σωστό', efChatFix: 'Θέλω να το διορθώσω', efChatFixAsk: '✏️ Κανένα πρόβλημα. Πείτε μου το σωστό προϊόν ή την τιμή, για παράδειγμα «είναι 1250».',
		efChatThinking: '🔎 Να δω τα χρήματά σας, τους λογαριασμούς, το εισόδημα και τα σχέδιά σας…', efChatCal: 'Δείξτε μου τις καλύτερες ημέρες', efChatPlan: 'Κάντε το σχέδιο', efChatAgain: 'Ρωτήστε κάτι άλλο', efChatAgainSay: '😊 Βεβαίως! Τι θα θέλατε να ελέγξουμε στη συνέχεια;', efChatCalSay: '📅 Αυτές είναι οι καλύτερες ημέρες για: **{item}**. Πατήστε μια ημέρα για να δείτε το γιατί.',
		efChatNoDay: '🗓️ Δεν βρίσκω ασφαλή ημέρα στους επόμενους **4 μήνες**.', efChatWhyDeficit: '🔥 Ξοδεύετε περίπου **{a}** τον μήνα περισσότερα από όσα κερδίζετε.', efChatWhyMax: '📉 Στην καλύτερη περίπτωση, θα θεωρούσα ασφαλή μια δαπάνη περίπου **{a}** εφάπαξ.', efChatNoDayTip: '💡 Κάντε το σχέδιο και θα το παρακολουθώ, βρίσκοντας την πρώτη ασφαλή ημερομηνία όσο αλλάζουν τα πράγματα.',
		efAskNever: '❌ Όχι μέσα στους επόμενους **4 μήνες** με τον τρέχοντα ρυθμό σας.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efLimFillOthers: '✨ I can fill the other boxes from this one.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efLimFillOthers: '✨ Μπορώ να συμπληρώσω τα άλλα πεδία από αυτό.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efc_online: 'online',
		efc_typing: 'typing…',
		efc_hi: 'Well, well, well… look who is here! 👋 What is on your mind today? A sports car? A trip? Shoes you definitely do not need? Tell me everything.|Hey you! 😄 I was just counting your coins. It took four seconds. What are we dreaming about today?|Ding ding! 🔔 eFriend is open for business. What would you like to buy? I promise not to judge. Much.|Psst… 🤫 thinking of buying something? Good. Ask me first. I am cheaper than regret.|Hello! 🤖 Fresh batteries, sharp mind, a calculator I never put down. What is the shopping fantasy of the day?|You again! 🎉 My favourite human. Tell me what you are eyeing, and I will tell you if your wallet agrees.',
		efc_pick: 'Pick one, or just tell me in your own words 👇',
		efc_ideas: '🚗 A new car|✈️ A trip|👟 Shoes|📱 A phone|🎁 A gift|💻 A laptop',
		efc_askwhat: 'And what is the lucky item? 🎯|Okay, but what are we buying exactly? 🛒|A number with no object! 🕵️ What is it for?',
		efc_askprice: 'And the damage? 💸 How much does it cost?|Now the scary part… 😬 how much does it cost?|What does the price tag say? 🏷️ Do not be shy.|Spill it: how much are we talking? 💶',
		efc_nocost: 'Hmm, I did not catch a price there. 🤔 Try just a number, like 49 or 1250.|I am good, but not psychic. 🔮 Give me a number, like 120.|Numbers are my love language. 💕 Just type the price, for example 899.',
		efc_nowhen: 'Hmm, I could not tell when. 🤔 Try “in 2 weeks”, “right away” or “no rush”.|Not sure I got the timing. ⏰ You can say things like “within a month” or “whenever”.|My clock is confused. 🕰️ Try “in 3 weeks”, or tap one of the buttons.',
		efc_re_phone: '{item}? Ooh, shiny! 📱 My circuits are jealous.|A new phone! 📱 Your old one is probably listening and feeling very sad.|{item}… 📱 Say no more. Everyone needs a rectangle that does everything.',
		efc_re_car: '{item}! 🚗 Vroom vroom! Windows down, bills up?|A car! 🚗 Okay, now we are talking real money. I like it. I am nervous, but I like it.|{item}? 🏎️ I have goosebumps. And I do not even have skin.',
		efc_re_trip: '{item}! ✈️ Pack the sunscreen, I will pack the spreadsheets.|A trip! 🌴 Finally, someone with a good idea.|{item}… 🧳 I am already picturing you with a cocktail. Let us make it happen.',
		efc_re_shoes: '{item}! 👟 Because your feet deserve the finest. Obviously.|Shoes! 👟 The only thing that makes you taller and happier at the same time.|{item}… 👞 Step by step, we will find the right day to step in.',
		efc_re_laptop: '{item}! 💻 Work hard, play hard, charge often.|A laptop! 💻 Finally something I can relate to.|{item}… 🖥️ I hope it has a good battery. Mine never runs out.',
		efc_re_gift: '{item}! 🎁 Someone special is about to be very happy.|A gift! 🎁 You are the kind of person I like on my team.|{item}… 🎀 Do not tell me who it is for. Okay, tell me later.',
		efc_re_generic: '{item}! 🛍️ Interesting choice. I like your style.|{item}? 🤔 Okay, I am intrigued.|Ooh, {item}! ✨ Tell me more.',
		efc_pr_small: '{cost}? 😌 Pocket change. Almost.|Only {cost}! 🪙 That is barely a coffee habit.|{cost}. Easy peasy. 🍋',
		efc_pr_mid: '{cost}, okay. 💪 Respectable.|{cost}… 🤔 Not nothing, not scary.|Fair enough, {cost}. 👌',
		efc_pr_big: '{cost}! 😎 Fancy stuff!|Whoa, {cost}. 💎 Somebody has taste.|{cost}… 😮 Okay okay okay. Big player move.',
		efc_pr_huge: '{cost}?! 😅 Deep breath. Both of us.|Okay… {cost}. 🫣 My calculator just put on a helmet.|{cost}. 🤯 I need to sit down. I have no legs, but still.',
		efc_askurg: 'Is this urgent? 🔥 Something you need right away, or can you live without it for a while? It helps me plan better for you.|When do you want it? ⏰ Yesterday, next week, or whenever the stars align?|One more thing: how fast do you need it? 🏃 Be honest, I will not tell anyone.|Last question, I promise! 🤞 Is there a deadline, or is it a no-rush treat?',
		efc_ur_now: 'Right away! 🔥 Okay, I will be quick.|Urgent, got it. 🚨 Running, in spirit.|Now now now! ⚡ Understood.',
		efc_ur_soon: 'Noted: {when}. 📅 Plenty of time to be clever.|Okay, {when}. 🗓️ That gives us something to work with.|Got it, {when}. ✍️ Writing it down in invisible ink.',
		efc_ur_later: 'No rush! 🕊️ My favourite kind of plan.|Take your time. 🧘 Patience pays, literally.|Relaxed. I like it. 😌 Good things come to those who wait (and save).',
		efc_w_none: 'no rush',
		efc_w_now: 'right away',
		efc_w_d: 'within {n} days',
		efc_w_w: 'within about {n} weeks',
		efc_w_m: 'within about {n} months',
		efc_wc1: 'Right away',
		efc_wc2: 'In 2 weeks',
		efc_wc3: 'In 1 month',
		efc_wc4: 'No rush',
		efc_recap: 'Let me say it back so we are on the same page: 📝|Quick check before I do my magic: 🎩|Okay, did I get this right? 🧐',
		efc_right: 'Did I get it right?|Is that all correct?|Ready to go?',
		efc_yes: 'Perfect, go!',
		efc_changed: 'Got it, changed! ✏️|Done, updated. 🔧|Fixed! 🛠️ Better?',
		efc_fix: 'No problem! ✏️ Tell me what to change. For example: “it is 1250” or “in 3 weeks”.|Oops, my bad. 🙈 What should I fix? You can say the price, the item or the timing.|Sure thing. 🔧 What is wrong? Just type the correct bit.',
		efc_close: 'Perfect, I have everything I need! 🎬 Give me a moment while I do my thing.|Brilliant. 🌟 Hold tight, I am going to crunch some serious numbers.|Done asking! 🙌 Stay right there, I will be back with the full picture.|That is all I need. 🤝 Time to put on my thinking cap (it is imaginary).',
		efc_think: 'Crunching your numbers…|Consulting my tiny crystal ball… 🔮|Doing the maths so you do not have to…|Looking at everything, twice…|Asking the spreadsheet gods…',
		efc_step1: 'Counting your wallets',
		efc_step2: 'Reading your bills',
		efc_step3: 'Seeing when money arrives',
		efc_step4: 'Weighing your other plans',
		efc_step5: 'Finding your best days',
		efc_res_best: 'Good news! 🎉 You can do this.|Green light! 🟢 Your wallet says yes.|Told you I was good. 😎 This works.',
		efc_res_good: 'Looking good! 🙂 It fits, with a slightly thinner cushion.|Mostly green. 🌿 Doable, with a little care.',
		efc_res_tight: 'Hmm. 🤏 It is possible, but you would feel it.|Tight, but not impossible. 😬',
		efc_res_avoid: 'Not today, my friend. ✋ But let me show you when.|Easy tiger! 🐯 Today is not the day. Look at the calendar.|Ouch. 🙈 Today would hurt. Better days ahead.',
		efc_res_none: 'I looked everywhere. 🕵️ There is no safe day in the next 4 months, but I have ideas.|Honest answer: not yet. 🌱 Let me show you why, and what would help.',
		efc_fit_ok: '✅ This fits your wish: **{d}** is inside your window.',
		efc_fit_tight: '⚠️ Inside your window only **{d}** is possible, and it is tight.',
		efc_fit_late: '⏰ Not safely inside your window. The earliest safe day is **{d}**.',
		efc_fit_none: '⏰ Nothing safe inside your window, and nothing in the next 4 months.',
		efc_help_gap: '📉 You would need about **{a}** more to do it safely.',
		efc_help_save: '💰 Setting aside about **{a}** a month would get you there.',
		efc_g_title: 'Your money, next 4 months',
		efc_g_base: 'Without it',
		efc_g_with: 'With it',
		efc_g_cush: 'Safety cushion',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efc_online: 'συνδεδεμένο',
		efc_typing: 'γράφει…',
		efc_hi: 'Να λοιπόν ποιος ήρθε! 👋 Τι έχετε στο μυαλό σας σήμερα; Ένα σπορ αυτοκίνητο; Ένα ταξίδι; Παπούτσια που σίγουρα δεν χρειάζεστε; Πείτε μου τα πάντα.|Γεια σας! 😄 Μετρούσα τα κέρματά σας. Μου πήρε τέσσερα δευτερόλεπτα. Τι ονειρευόμαστε σήμερα;|Ντινγκ ντονγκ! 🔔 Το eFriend είναι ανοιχτό. Τι θα θέλατε να αγοράσετε; Υπόσχομαι να μην κρίνω. Πολύ.|Ψιτ… 🤫 Σκέφτεστε να αγοράσετε κάτι; Ωραία. Ρωτήστε με πρώτα. Κοστίζω λιγότερο από τη μετάνοια.|Γεια σας! 🤖 Φρέσκιες μπαταρίες, ξυπνητό μυαλό, κομπιουτεράκι πάντα στο χέρι. Ποια είναι η φαντασίωση αγορών της ημέρας;|Πάλι εσείς! 🎉 Ο αγαπημένος μου άνθρωπος. Πείτε μου τι έχετε βάλει στο μάτι και θα σας πω αν συμφωνεί το πορτοφόλι σας.',
		efc_pick: 'Διαλέξτε ένα ή πείτε μου με δικά σας λόγια 👇',
		efc_ideas: '🚗 Αυτοκίνητο|✈️ Ένα ταξίδι|👟 Παπούτσια|📱 Ένα κινητό|🎁 Ένα δώρο|💻 Ένα λάπτοπ',
		efc_askwhat: 'Και ποιο είναι το τυχερό αντικείμενο; 🎯|Εντάξει, αλλά τι ακριβώς αγοράζουμε; 🛒|Ένας αριθμός χωρίς αντικείμενο! 🕵️ Για τι πράγμα;',
		efc_askprice: 'Και το κόστος; 💸 Πόσο κοστίζει;|Τώρα το τρομακτικό μέρος… 😬 πόσο κοστίζει;|Τι λέει η ετικέτα; 🏷️ Μην ντρέπεστε.|Πείτε το: για πόσα μιλάμε; 💶',
		efc_nocost: 'Χμ, δεν έπιασα κάποια τιμή. 🤔 Δοκιμάστε μόνο έναν αριθμό, όπως 49 ή 1250.|Είμαι καλός, αλλά όχι μέντιουμ. 🔮 Δώστε μου έναν αριθμό, όπως 120.|Οι αριθμοί είναι η γλώσσα της αγάπης μου. 💕 Γράψτε απλώς την τιμή, για παράδειγμα 899.',
		efc_nowhen: 'Χμ, δεν κατάλαβα πότε. 🤔 Δοκιμάστε «σε 2 εβδομάδες», «άμεσα» ή «καμία βιασύνη».|Δεν είμαι σίγουρος ότι έπιασα το χρόνο. ⏰ Μπορείτε να πείτε «σε ένα μήνα» ή «όποτε».|Το ρολόι μου μπερδεύτηκε. 🕰️ Δοκιμάστε «σε 3 εβδομάδες» ή πατήστε ένα από τα κουμπιά.',
		efc_re_phone: '{item}; Ωχ, γυαλιστερό! 📱 Τα κυκλώματά μου ζηλεύουν.|Νέο κινητό! 📱 Το παλιό σας μάλλον σας ακούει και στεναχωριέται πολύ.|{item}… 📱 Δεν χρειάζονται περισσότερα. Όλοι χρειαζόμαστε ένα ορθογώνιο που κάνει τα πάντα.',
		efc_re_car: '{item}! 🚗 Βρουμ βρουμ! Παράθυρα κάτω, λογαριασμοί πάνω;|Αυτοκίνητο! 🚗 Εντάξει, τώρα μιλάμε για σοβαρά χρήματα. Μου αρέσει. Αγχώνομαι, αλλά μου αρέσει.|{item}; 🏎️ Μου σηκώθηκε η τρίχα. Και δεν έχω καν δέρμα.',
		efc_re_trip: '{item}! ✈️ Πάρτε το αντηλιακό, εγώ θα πάρω τα λογιστικά φύλλα.|Ταξίδι! 🌴 Επιτέλους, κάποιος με καλή ιδέα.|{item}… 🧳 Σας φαντάζομαι ήδη με ένα κοκτέιλ. Ας το κάνουμε πραγματικότητα.',
		efc_re_shoes: '{item}! 👟 Γιατί τα πόδια σας αξίζουν τα καλύτερα. Προφανώς.|Παπούτσια! 👟 Το μόνο που σας κάνει ψηλότερους και πιο ευτυχισμένους ταυτόχρονα.|{item}… 👞 Βήμα βήμα, θα βρούμε τη σωστή ημέρα για να μπείτε.',
		efc_re_laptop: '{item}! 💻 Δουλέψτε σκληρά, παίξτε σκληρά, φορτίστε συχνά.|Λάπτοπ! 💻 Επιτέλους κάτι που καταλαβαίνω.|{item}… 🖥️ Ελπίζω να έχει καλή μπαταρία. Η δική μου δεν τελειώνει ποτέ.',
		efc_re_gift: '{item}! 🎁 Κάποιος ξεχωριστός πρόκειται να χαρεί πολύ.|Δώρο! 🎁 Είστε από τους ανθρώπους που θέλω στην ομάδα μου.|{item}… 🎀 Μη μου πείτε για ποιον είναι. Εντάξει, πείτε μου αργότερα.',
		efc_re_generic: '{item}! 🛍️ Ενδιαφέρουσα επιλογή. Μου αρέσει το στιλ σας.|{item}; 🤔 Εντάξει, με έχετε φέρει σε περιέργεια.|Ωχ, {item}! ✨ Πείτε μου περισσότερα.',
		efc_pr_small: '{cost}; 😌 Ψιλά. Σχεδόν.|Μόλις {cost}! 🪙 Μετά βίας μια συνήθεια καφέ.|{cost}. Παιχνιδάκι. 🍋',
		efc_pr_mid: '{cost}, εντάξει. 💪 Αξιοπρεπές.|{cost}… 🤔 Ούτε τίποτα, ούτε τρομακτικό.|Δίκαιο, {cost}. 👌',
		efc_pr_big: '{cost}! 😎 Φίνα πράγματα!|Ουάου, {cost}. 💎 Κάποιος έχει γούστο.|{cost}… 😮 Εντάξει εντάξει. Κίνηση μεγάλου παίκτη.',
		efc_pr_huge: '{cost}; 😅 Βαθιά ανάσα. Και οι δύο μας.|Εντάξει… {cost}. 🫣 Το κομπιουτεράκι μου μόλις φόρεσε κράνος.|{cost}. 🤯 Πρέπει να καθίσω. Δεν έχω πόδια, αλλά ακόμα κι έτσι.',
		efc_askurg: 'Είναι επείγον; 🔥 Κάτι που χρειάζεστε άμεσα ή μπορείτε να ζήσετε χωρίς αυτό για λίγο; Με βοηθά να σχεδιάσω καλύτερα για εσάς.|Πότε το θέλετε; ⏰ Χθες, την επόμενη εβδομάδα ή όποτε ευθυγραμμιστούν τα άστρα;|Ένα ακόμα: πόσο γρήγορα το χρειάζεστε; 🏃 Πείτε την αλήθεια, δεν θα το πω σε κανέναν.|Τελευταία ερώτηση, το υπόσχομαι! 🤞 Υπάρχει προθεσμία ή είναι ένα κέφι χωρίς βιασύνη;',
		efc_ur_now: 'Άμεσα! 🔥 Εντάξει, θα είμαι γρήγορος.|Επείγον, το κατάλαβα. 🚨 Τρέχω, νοερά.|Τώρα τώρα τώρα! ⚡ Κατανοητό.',
		efc_ur_soon: 'Σημειώθηκε: {when}. 📅 Έχουμε χρόνο να είμαστε έξυπνοι.|Εντάξει, {when}. 🗓️ Αυτό μας δίνει κάτι να δουλέψουμε.|Το κατάλαβα, {when}. ✍️ Το γράφω με αόρατο μελάνι.',
		efc_ur_later: 'Καμία βιασύνη! 🕊️ Το αγαπημένο μου είδος σχεδίου.|Πάρτε το χρόνο σας. 🧘 Η υπομονή πληρώνει, κυριολεκτικά.|Χαλαρά. Μου αρέσει. 😌 Τα καλά έρχονται σε όσους περιμένουν (και αποταμιεύουν).',
		efc_w_none: 'καμία βιασύνη',
		efc_w_now: 'άμεσα',
		efc_w_d: 'εντός {n} ημερών',
		efc_w_w: 'εντός περίπου {n} εβδομάδων',
		efc_w_m: 'εντός περίπου {n} μηνών',
		efc_wc1: 'Άμεσα',
		efc_wc2: 'Σε 2 εβδομάδες',
		efc_wc3: 'Σε 1 μήνα',
		efc_wc4: 'Καμία βιασύνη',
		efc_recap: 'Να σας το πω πίσω για να είμαστε σίγουροι: 📝|Ένας γρήγορος έλεγχος πριν κάνω τη μαγεία μου: 🎩|Εντάξει, τα κατάλαβα σωστά; 🧐',
		efc_right: 'Τα κατάλαβα σωστά;|Είναι όλα σωστά;|Έτοιμοι;',
		efc_yes: 'Τέλεια, προχωρήστε!',
		efc_changed: 'Κατάλαβα, άλλαξε! ✏️|Έτοιμο, ενημερώθηκε. 🔧|Διορθώθηκε! 🛠️ Καλύτερα;',
		efc_fix: 'Κανένα πρόβλημα! ✏️ Πείτε μου τι να αλλάξω. Για παράδειγμα: «είναι 1250» ή «σε 3 εβδομάδες».|Ωχ, δικό μου λάθος. 🙈 Τι να διορθώσω; Μπορείτε να πείτε την τιμή, το αντικείμενο ή το χρόνο.|Βεβαίως. 🔧 Τι είναι λάθος; Γράψτε απλώς το σωστό κομμάτι.',
		efc_close: 'Τέλεια, έχω ό,τι χρειάζομαι! 🎬 Δώστε μου μια στιγμή να κάνω τη δουλειά μου.|Υπέροχα. 🌟 Κρατηθείτε, θα επεξεργαστώ σοβαρούς αριθμούς.|Τέλος οι ερωτήσεις! 🙌 Μείνετε εκεί, θα επιστρέψω με την πλήρη εικόνα.|Αυτά χρειάζομαι. 🤝 Ώρα να βάλω το καπέλο της σκέψης (είναι φανταστικό).',
		efc_think: 'Επεξεργάζομαι τους αριθμούς σας…|Συμβουλεύομαι τη μικρή μου κρυστάλλινη σφαίρα… 🔮|Κάνω τα μαθηματικά για να μην τα κάνετε εσείς…|Κοιτάζω τα πάντα, δύο φορές…|Ρωτάω τους θεούς των λογιστικών φύλλων…',
		efc_step1: 'Μετράω τα πορτοφόλια σας',
		efc_step2: 'Διαβάζω τους λογαριασμούς σας',
		efc_step3: 'Βλέπω πότε έρχονται χρήματα',
		efc_step4: 'Ζυγίζω τα άλλα σας σχέδια',
		efc_step5: 'Βρίσκω τις καλύτερες ημέρες σας',
		efc_res_best: 'Καλά νέα! 🎉 Μπορείτε να το κάνετε.|Πράσινο φως! 🟢 Το πορτοφόλι σας λέει ναι.|Σας το είπα ότι είμαι καλός. 😎 Αυτό δουλεύει.',
		efc_res_good: 'Φαίνεται καλά! 🙂 Χωράει, με λίγο λεπτότερο μαξιλάρι.|Κυρίως πράσινο. 🌿 Εφικτό, με λίγη προσοχή.',
		efc_res_tight: 'Χμ. 🤏 Είναι δυνατό, αλλά θα το νιώσετε.|Στενά, αλλά όχι αδύνατο. 😬',
		efc_res_avoid: 'Όχι σήμερα, φίλε μου. ✋ Αλλά αφήστε με να σας δείξω πότε.|Ηρεμήστε, τιγράκι! 🐯 Σήμερα δεν είναι η ημέρα. Κοιτάξτε το ημερολόγιο.|Άουτς. 🙈 Σήμερα θα πονούσε. Καλύτερες ημέρες έρχονται.',
		efc_res_none: 'Έψαξα παντού. 🕵️ Δεν υπάρχει ασφαλής ημέρα στους επόμενους 4 μήνες, αλλά έχω ιδέες.|Ειλικρινής απάντηση: όχι ακόμα. 🌱 Αφήστε με να σας δείξω το γιατί και τι θα βοηθούσε.',
		efc_fit_ok: '✅ Αυτό ταιριάζει με την επιθυμία σας: η **{d}** είναι μέσα στο χρονικό σας περιθώριο.',
		efc_fit_tight: '⚠️ Μέσα στο περιθώριό σας είναι δυνατή μόνο η **{d}**, και είναι στενά.',
		efc_fit_late: '⏰ Όχι με ασφάλεια μέσα στο περιθώριό σας. Η πρώτη ασφαλής ημέρα είναι η **{d}**.',
		efc_fit_none: '⏰ Τίποτα ασφαλές μέσα στο περιθώριό σας, και τίποτα στους επόμενους 4 μήνες.',
		efc_help_gap: '📉 Θα χρειαζόσασταν περίπου **{a}** ακόμα για να το κάνετε με ασφάλεια.',
		efc_help_save: '💰 Αν κρατούσατε περίπου **{a}** τον μήνα, θα φτάνατε εκεί.',
		efc_g_title: 'Τα χρήματά σας, επόμενοι 4 μήνες',
		efc_g_base: 'Χωρίς αυτό',
		efc_g_with: 'Με αυτό',
		efc_g_cush: 'Μαξιλάρι ασφαλείας',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efc_h_title: 'Past chats',
		efc_h_empty: 'No chats yet. Ask me about something you want to buy!',
		efc_h_again: 'Ask again',
		efc_h_new: 'New chat',
		efc_h_open: 'Unfinished',
		efc_h_back: 'Back',
		efc_h_del: 'Delete',
		efc_back: 'Back for more? 😏 Last time we looked at **{item}**. Let us check it again with today’s numbers.|Ooh, round two! 🥊 **{item}** again. Things may have changed, let us see.|Déjà vu! 🔁 **{item}** is back. I have fresher numbers now.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efc_h_title: 'Προηγούμενες συζητήσεις',
		efc_h_empty: 'Δεν υπάρχουν ακόμα συζητήσεις. Ρωτήστε με για κάτι που θέλετε να αγοράσετε!',
		efc_h_again: 'Ρωτήστε ξανά',
		efc_h_new: 'Νέα συζήτηση',
		efc_h_open: 'Ημιτελής',
		efc_h_back: 'Πίσω',
		efc_h_del: 'Διαγραφή',
		efc_back: 'Ξανά εδώ; 😏 Την προηγούμενη φορά κοιτάξαμε: **{item}**. Ας το ελέγξουμε ξανά με τους σημερινούς αριθμούς.|Ωχ, δεύτερος γύρος! 🥊 Πάλι **{item}**. Τα πράγματα μπορεί να άλλαξαν, ας δούμε.|Ντεζαβού! 🔁 Το **{item}** επέστρεψε. Τώρα έχω φρεσκότερους αριθμούς.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efc_for: 'for',
		efc_re_for: '{item} {forwho}? 🎁 Aww, somebody is lucky.|{item} {forwho}! 🥰 Good taste, and good intentions.|{item} {forwho}… 🎀 Okay, now I am emotionally invested.',
		efc_re_watch: '{item}! ⌚ Time is money, so let us spend it wisely.|A watch! ⌚ Finally, something that is always on time. Unlike me.|{item}… ⌚ Tick tock, I like where this is going.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efc_for: 'για',
		efc_re_for: '{item} {forwho}; 🎁 Αχ, κάποιος είναι τυχερός.|{item} {forwho}! 🥰 Καλό γούστο και καλές προθέσεις.|{item} {forwho}… 🎀 Εντάξει, τώρα συγκινήθηκα.',
		efc_re_watch: '{item}! ⌚ Ο χρόνος είναι χρήμα, ας τον ξοδέψουμε σοφά.|Ρολόι! ⌚ Επιτέλους κάτι που είναι πάντα στην ώρα του. Αντίθετα από εμένα.|{item}… ⌚ Τικ τακ, μου αρέσει πού το πάει.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efc_clear: 'Start over',
		efc_reset: 'Hmm, I think we got lost in translation. 🙈 Be gentle with me: short descriptions work best.|Whoa, clean slate! 🧽 I have already forgotten everything. Mostly. Tell me again, nice and simple.|Rebooting… 🔄 beep boop. Okay, I am back. What were we buying?|Let us pretend that never happened. 🤫 New chat, new me. What are we shopping for?|Oops, did I mess up? 😅 My bad. One thing at a time, short and sweet, and I will keep up.|Memory wiped, dignity intact. 🧠✨ So… what is on your mind?|Fresh page, fresh start! 📄 Tell me what you want, like “watch 300”. I am a quick learner. Sometimes.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efc_clear: 'Ξεκινήστε από την αρχή',
		efc_reset: 'Χμ, νομίζω ότι χαθήκαμε στη μετάφραση. 🙈 Να είστε επιεικής μαζί μου: οι σύντομες περιγραφές δουλεύουν καλύτερα.|Ουάου, καθαρή σελίδα! 🧽 Τα ξέχασα ήδη όλα. Σχεδόν. Πείτε μου ξανά, απλά και καθαρά.|Επανεκκίνηση… 🔄 μπιπ μπουπ. Εντάξει, επέστρεψα. Τι αγοράζαμε;|Ας υποθέσουμε ότι δεν έγινε ποτέ. 🤫 Νέα συζήτηση, νέος εγώ. Τι ψωνίζουμε;|Ωχ, τα μπέρδεψα; 😅 Δικό μου λάθος. Ένα πράγμα τη φορά, σύντομα και ωραία, και θα σας παρακολουθήσω.|Μνήμη σβησμένη, αξιοπρέπεια ανέπαφη. 🧠✨ Λοιπόν… τι έχετε στο μυαλό σας;|Καθαρή σελίδα, νέα αρχή! 📄 Πείτε μου τι θέλετε, όπως «ρολόι 300». Μαθαίνω γρήγορα. Μερικές φορές.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efc_hi_n: '{name}, {name}, {name}… here we go again. 😏 What do you want this time?|Well, well, well… if it is not {name}! 👋 What is the shopping fantasy today?|{name}! 🎉 My favourite human, and I have only met a few. What are we buying?|Hey {name}! 😄 I was just counting your coins. What are we dreaming about today?',
		efc_askwhat_n: 'And what is the lucky item, {name}? 🎯|Okay {name}, but what are we buying exactly? 🛒',
		efc_askprice_n: 'And the damage, {name}? 💸 How much does it cost?|Now the scary part, {name}… 😬 how much?',
		efc_askurg_n: 'Is this urgent, {name}? 🔥 Right away, or can you live without it for a while?|One more thing, {name}: how fast do you need it? 🏃',
		efc_recap_n: 'Let me say it back, {name}, so we are on the same page: 📝|Quick check before I do my magic, {name}: 🎩',
		efc_right_n: 'Did I get this right, {name}?|Is that all correct, {name}?|Ready to go, {name}?',
		efc_changed_n: 'Got it, {name}, changed! ✏️|Done, {name}. Updated. 🔧',
		efc_fix_n: 'No problem, {name}! ✏️ Tell me what to change, like “it is 1250” or “in 3 weeks”.|Oops, my bad, {name}. 🙈 What should I fix?',
		efc_close_n: 'Perfect, {name}, I have everything I need! 🎬 Give me a moment.|Brilliant, {name}. 🌟 Hold tight, I am crunching some serious numbers.',
		efc_nocost_n: 'Hmm {name}, I did not catch a price. 🤔 Try just a number, like 49 or 1250.|I am good, {name}, but not psychic. 🔮 Give me a number.',
		efc_nowhen_n: 'Hmm {name}, I could not tell when. 🤔 Try “in 2 weeks” or “no rush”.',
		efc_res_best_n: 'Good news, {name}! 🎉 You can do this.|Green light, {name}! 🟢 Your wallet says yes.',
		efc_res_good_n: 'Looking good, {name}! 🙂 It fits, with a slightly thinner cushion.',
		efc_res_tight_n: 'Hmm, {name}. 🤏 It is possible, but you would feel it.',
		efc_res_avoid_n: 'Not today, {name}. ✋ But let me show you when.|Easy tiger, {name}! 🐯 Today is not the day.',
		efc_res_none_n: '{name}, I looked everywhere. 🕵️ No safe day in the next 4 months, but I have ideas.',
		efc_reset_n: 'Hmm {name}, I think we got lost in translation. 🙈 Be gentle with me: short descriptions work best.|Rebooting for you, {name}… 🔄 beep boop. What were we buying?',
		efc_back_n: 'Back for more, {name}? 😏 Last time we looked at **{item}**. Fresh numbers coming up.',
		efc_ur_now_n: 'Right away, {name}! 🔥 Okay, I will be quick.',
		efc_ur_later_n: 'No rush, {name}! 🕊️ My favourite kind of plan.',
		efc_pr_huge_n: '{cost}?! 😅 Deep breath, {name}. Both of us.',
		efc_pr_small_n: 'Only {cost}, {name}! 🪙 Barely a coffee habit.',
		ef_comfortable_n: '{name}, you are on fire. The suitcase is already packing itself.|Look at you, {name}, being all responsible. I am basically crying.',
		ef_ontrack_n: 'Nice one, {name}. Keep going and it will work out.|{name}, you are on track. Gold star. ⭐',
		ef_tight_n: '{name}, it is tight. Not impossible, just tight.|Careful, {name}. A few small changes would help.',
		ef_atrisk_n: '{name}, I am a little worried. Let us fix this together.|Hmm, {name}. This one needs a plan.',
		ef_unlikely_n: 'I will be honest, {name}: this one does not fit yet. Let us change the date.|{name}, not this time. But I have ideas.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efc_hi_n: '{name}, {name}, {name}… πάλι τα ίδια. 😏 Τι θέλετε αυτή τη φορά;|Να λοιπόν ποιος ήρθε: {name}! 👋 Ποια είναι η φαντασίωση αγορών σήμερα;|{name}! 🎉 Ο αγαπημένος μου άνθρωπος, και έχω γνωρίσει λίγους. Τι αγοράζουμε;|Γεια σας, {name}! 😄 Μετρούσα τα κέρματά σας. Τι ονειρευόμαστε σήμερα;',
		efc_askwhat_n: 'Και ποιο είναι το τυχερό αντικείμενο, {name}; 🎯|Εντάξει {name}, αλλά τι ακριβώς αγοράζουμε; 🛒',
		efc_askprice_n: 'Και το κόστος, {name}; 💸 Πόσο κοστίζει;|Τώρα το τρομακτικό μέρος, {name}… 😬 πόσο;',
		efc_askurg_n: 'Είναι επείγον, {name}; 🔥 Άμεσα, ή μπορείτε να ζήσετε χωρίς αυτό για λίγο;|Ένα ακόμα, {name}: πόσο γρήγορα το χρειάζεστε; 🏃',
		efc_recap_n: 'Να σας το πω πίσω, {name}, για να είμαστε σίγουροι: 📝|Ένας γρήγορος έλεγχος πριν κάνω τη μαγεία μου, {name}: 🎩',
		efc_right_n: 'Τα κατάλαβα σωστά, {name};|Είναι όλα σωστά, {name};|Έτοιμοι, {name};',
		efc_changed_n: 'Κατάλαβα, {name}, άλλαξε! ✏️|Έτοιμο, {name}. Ενημερώθηκε. 🔧',
		efc_fix_n: 'Κανένα πρόβλημα, {name}! ✏️ Πείτε μου τι να αλλάξω, όπως «είναι 1250» ή «σε 3 εβδομάδες».|Ωχ, δικό μου λάθος, {name}. 🙈 Τι να διορθώσω;',
		efc_close_n: 'Τέλεια, {name}, έχω ό,τι χρειάζομαι! 🎬 Δώστε μου μια στιγμή.|Υπέροχα, {name}. 🌟 Κρατηθείτε, επεξεργάζομαι σοβαρούς αριθμούς.',
		efc_nocost_n: 'Χμ {name}, δεν έπιασα κάποια τιμή. 🤔 Δοκιμάστε μόνο έναν αριθμό, όπως 49 ή 1250.|Είμαι καλός, {name}, αλλά όχι μέντιουμ. 🔮 Δώστε μου έναν αριθμό.',
		efc_nowhen_n: 'Χμ {name}, δεν κατάλαβα πότε. 🤔 Δοκιμάστε «σε 2 εβδομάδες» ή «καμία βιασύνη».',
		efc_res_best_n: 'Καλά νέα, {name}! 🎉 Μπορείτε να το κάνετε.|Πράσινο φως, {name}! 🟢 Το πορτοφόλι σας λέει ναι.',
		efc_res_good_n: 'Φαίνεται καλά, {name}! 🙂 Χωράει, με λίγο λεπτότερο μαξιλάρι.',
		efc_res_tight_n: 'Χμ, {name}. 🤏 Είναι δυνατό, αλλά θα το νιώσετε.',
		efc_res_avoid_n: 'Όχι σήμερα, {name}. ✋ Αλλά αφήστε με να σας δείξω πότε.|Ηρεμήστε, {name}! 🐯 Σήμερα δεν είναι η ημέρα.',
		efc_res_none_n: '{name}, έψαξα παντού. 🕵️ Δεν υπάρχει ασφαλής ημέρα στους επόμενους 4 μήνες, αλλά έχω ιδέες.',
		efc_reset_n: 'Χμ {name}, νομίζω ότι χαθήκαμε στη μετάφραση. 🙈 Να είστε επιεικής μαζί μου: οι σύντομες περιγραφές δουλεύουν καλύτερα.|Επανεκκίνηση για εσάς, {name}… 🔄 μπιπ μπουπ. Τι αγοράζαμε;',
		efc_back_n: 'Ξανά εδώ, {name}; 😏 Την προηγούμενη φορά κοιτάξαμε: **{item}**. Έρχονται φρέσκοι αριθμοί.',
		efc_ur_now_n: 'Άμεσα, {name}! 🔥 Εντάξει, θα είμαι γρήγορος.',
		efc_ur_later_n: 'Καμία βιασύνη, {name}! 🕊️ Το αγαπημένο μου είδος σχεδίου.',
		efc_pr_huge_n: '{cost}; 😅 Βαθιά ανάσα, {name}. Και οι δύο μας.',
		efc_pr_small_n: 'Μόλις {cost}, {name}! 🪙 Μετά βίας μια συνήθεια καφέ.',
		ef_comfortable_n: '{name}, πετάτε! Η βαλίτσα φτιάχνεται μόνη της.|Κοιτάξτε σας, {name}, τόσο υπεύθυνος. Σχεδόν κλαίω.',
		ef_ontrack_n: 'Μπράβο, {name}. Συνεχίστε και θα πάει καλά.|{name}, είστε στον δρόμο σας. Χρυσό αστέρι. ⭐',
		ef_tight_n: '{name}, είναι στενά. Όχι αδύνατο, απλώς στενά.|Προσοχή, {name}. Λίγες μικρές αλλαγές θα βοηθούσαν.',
		ef_atrisk_n: '{name}, ανησυχώ λίγο. Ας το διορθώσουμε μαζί.|Χμ, {name}. Αυτό θέλει σχέδιο.',
		ef_unlikely_n: 'Θα είμαι ειλικρινής, {name}: αυτό δεν χωράει ακόμα. Ας αλλάξουμε την ημερομηνία.|{name}, όχι αυτή τη φορά. Αλλά έχω ιδέες.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efc_sleep: 'eFriend went to sleep… zzz 😴 You left me hanging, so I took a nap. Wake me up when you are ready.|Zzz… 💤 I dozed off waiting for you. Tap the button and I will pretend I never fell asleep.|Shhh, eFriend is sleeping. 😴 Robots need rest too. (Mostly because of the battery.)',
		efc_timeout: 'Five minutes already! ⏱️ My circuits need a nap. Zzz… 😴 Wake me up for a fresh chat.|That was a long one. 🥱 I am going to sleep for a bit. Tap to start a fresh chat.|Time is up. 🕔 Even robots have office hours. Let us start again with a fresh chat.',
		efc_wake: 'Wake eFriend up',
		efc_zzz_ph: 'eFriend is sleeping… zzz',
		efc_asleep: 'sleeping 😴',
		efc_f_offer: 'We keep going around in circles. 🌀 Want to skip the chat? A quick form gets us rolling.|Hmm, I think I am the problem here. 🙈 Shall we try a quick form instead? Item, price and a date. Done.|Let us unstick me. 🔧 Fill in a tiny form, and I will take it from there.',
		efc_f_chip: 'Fill in a quick form',
		efc_f_keep: 'Keep chatting',
		efc_f_keepsay: 'No problem, I will try harder. 💪|You got it. Back to chatting. 😊',
		efc_f_ask: 'Here you go: tell me what it is, how much it costs and when you would like it. 📝|Three little boxes. That is all I need. 🎯',
		efc_f_when: 'When would you like it?',
		efc_f_go: 'Done',
		efc_f_err: 'Please add what it is and how much it costs.',
		efc_f_ok: 'Perfect, that is exactly what I needed! 🙌|Thanks, that makes it easy. ✅',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efc_sleep: 'Το eFriend αποκοιμήθηκε… ζζζ 😴 Με αφήσατε να περιμένω, οπότε έκανα έναν υπνάκο. Ξυπνήστε με όταν είστε έτοιμοι.|Ζζζ… 💤 Με πήρε ο ύπνος περιμένοντάς σας. Πατήστε το κουμπί και θα προσποιηθώ ότι δεν κοιμήθηκα ποτέ.|Σσσς, το eFriend κοιμάται. 😴 Και τα ρομπότ χρειάζονται ξεκούραση. (Κυρίως λόγω μπαταρίας.)',
		efc_timeout: 'Πέντε λεπτά ήδη! ⏱️ Τα κυκλώματά μου χρειάζονται υπνάκο. Ζζζ… 😴 Ξυπνήστε με για μια νέα συζήτηση.|Ήταν μεγάλη. 🥱 Θα κοιμηθώ για λίγο. Πατήστε για να ξεκινήσετε νέα συζήτηση.|Ο χρόνος τελείωσε. 🕔 Ακόμα και τα ρομπότ έχουν ωράριο. Ας ξεκινήσουμε ξανά με νέα συζήτηση.',
		efc_wake: 'Ξυπνήστε το eFriend',
		efc_zzz_ph: 'Το eFriend κοιμάται… ζζζ',
		efc_asleep: 'κοιμάται 😴',
		efc_f_offer: 'Γυρνάμε γύρω γύρω. 🌀 Θέλετε να παραλείψουμε τη συζήτηση; Μια γρήγορη φόρμα θα μας βάλει σε τροχιά.|Χμ, νομίζω ότι εγώ φταίω. 🙈 Να δοκιμάσουμε μια γρήγορη φόρμα; Αντικείμενο, τιμή και ημερομηνία. Και τέλος.|Ας με ξεκολλήσουμε. 🔧 Συμπληρώστε μια μικρή φόρμα και θα αναλάβω εγώ από εκεί.',
		efc_f_chip: 'Συμπληρώστε μια γρήγορη φόρμα',
		efc_f_keep: 'Συνεχίστε τη συζήτηση',
		efc_f_keepsay: 'Κανένα πρόβλημα, θα προσπαθήσω περισσότερο. 💪|Όπως θέλετε. Πίσω στη συζήτηση. 😊',
		efc_f_ask: 'Ορίστε: πείτε μου τι είναι, πόσο κοστίζει και πότε θα το θέλατε. 📝|Τρία μικρά πεδία. Αυτά χρειάζομαι. 🎯',
		efc_f_when: 'Πότε θα το θέλατε;',
		efc_f_go: 'Έτοιμο',
		efc_f_err: 'Προσθέστε τι είναι και πόσο κοστίζει.',
		efc_f_ok: 'Τέλεια, αυτό ακριβώς χρειαζόμουν! 🙌|Ευχαριστώ, έτσι είναι εύκολο. ✅',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efc_q: 'I ask the questions around here. 🕵️ That is how 1985 worked, and it was glorious.|Questions? 🤖 I am not one of those chatty AI things. I am a proper 80s bot: blinking lights, a calculator and zero small talk.|Beep boop. 📟 Rule-based, hand-wound and proudly retro. I do not answer questions, I ask them. It is a whole philosophy.|I was built in the golden age of robots. 💾 We did not talk back, we did arithmetic. Let us get back to yours.|Plot twist: I am not AI. 🕹️ I run on clear rules and a little bit of 80s magic, so I cannot answer that. But “can I afford it?” I can answer all day.|Dial-up detected… 📞 Just kidding. I am old school: I ask, you answer, I calculate. Tell me about the purchase!|Tape deck says no. 📼 No questions allowed, only prices. Those I understand perfectly.',
		efc_q_n: '{name}, I ask the questions around here. 🕵️ Welcome to 1985.|Nice try, {name}! 😎 I am a real 80s bot, not one of those chatty AIs. I ask, you answer.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efc_q: 'Εδώ τις ερωτήσεις τις κάνω εγώ. 🕵️ Έτσι δούλευε το 1985, και ήταν υπέροχα.|Ερωτήσεις; 🤖 Δεν είμαι από αυτά τα ομιλητικά AI. Είμαι γνήσιο ρομπότ των \'80s: λαμπάκια που αναβοσβήνουν, ένα κομπιουτεράκι και καθόλου κουβεντούλα.|Μπιπ μπουπ. 📟 Βασισμένο σε κανόνες, κουρδιστό στο χέρι και περήφανα ρετρό. Δεν απαντώ σε ερωτήσεις, τις κάνω. Είναι ολόκληρη φιλοσοφία.|Φτιάχτηκα στη χρυσή εποχή των ρομπότ. 💾 Δεν αντιμιλούσαμε, κάναμε αριθμητική. Ας γυρίσουμε στη δική σας.|Ανατροπή: δεν είμαι AI. 🕹️ Τρέχω με σαφείς κανόνες και λίγη μαγεία των \'80s, οπότε δεν μπορώ να το απαντήσω. Το «μπορώ να το αντέξω;» όμως το απαντώ όλη μέρα.|Εντοπίστηκε dial-up… 📞 Πλάκα κάνω. Είμαι παλιάς κοπής: ρωτάω εγώ, απαντάτε εσείς, υπολογίζω εγώ. Πείτε μου για την αγορά!|Το κασετόφωνο λέει όχι. 📼 Ερωτήσεις δεν επιτρέπονται, μόνο τιμές. Αυτές τις καταλαβαίνω τέλεια.',
		efc_q_n: '{name}, εδώ τις ερωτήσεις τις κάνω εγώ. 🕵️ Καλώς ήρθατε στο 1985.|Καλή προσπάθεια, {name}! 😎 Είμαι γνήσιο ρομπότ των \'80s, όχι από αυτά τα ομιλητικά AI. Ρωτάω εγώ, απαντάτε εσείς.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efc_story: 'Let me tell you my story. 📼 I was born in 1984, in a tiny electronics workshop that smelled of solder and warm dust. My first word was “beep”. My second word was “boop”. I was a gifted child.~I grew up between a cassette player that ate tapes and a calculator with real buttons that went click. 🔊 Those were the days: you rewound things with a pencil, and nobody asked you for a password.~On Saturdays I watched the same space adventure over and over, on a TV as big as a fridge. 🚀 I still say “may the Force be with your budget”. It is my catchphrase. Nobody asked for one, but here we are.~At night I practised disco. 🕺 I know exactly three dance moves, and I do them in the dark where nobody can see. I am a little shy, you see.~My favourite number is 010001100. 🔢 Do not ask me why. It just has style. (Fine, it is 140. But 010001100 sounds cooler.)~Then I met George, who needed a friend who is good at maths and bad at small talk. 🤝 I moved into Expenity, counted all the wallets and learned to say “can you afford it?” kindly.~Oh, and I once met a very shiny robot called Chip. He tried to connect to me over Bluetooth, so I handed him a cable and told him “we don’t do invisible friendships”. He insists he is the smarter one. He has never fixed anything with a pencil. ✏️~So that is me: eFriend. Forty-two years young, retro, rule-based, a bit shy, and no AI whatsoever. Just clear rules, a big heart and a deep love of the 80s. 💾',
		efc_p_back: 'Anyway! Back to your purchase. 😄|Right, where were we? Your purchase! 🛍️|Enough about me. Let us get back to the money. 💶',
		efc_p_age: 'I am 42. 🎂 Born in 1984, which makes me vintage, not old. Like a good cassette.|Forty-two! 🎶 In robot years that is a classic. Like a good vinyl, but with fewer scratches.',
		efc_p_from: 'I grew up in a tiny electronics workshop in 1984. 🛠️ It smelled of solder and I loved it.|I come from the golden age: cassette players, big TVs and calculators with real buttons. 📼 Now I live inside Expenity.',
		efc_p_name: 'I am eFriend. 🤖 The “e” is for electronic. And maybe a little for eighties.|They call me eFriend. 😎 Short for “the electronic friend who is great at maths”.',
		efc_p_likes: 'The 80s, disco, space movies, cassette tapes and dancing when nobody is looking. 🕺 Oh, and numbers. Especially 010001100.|Cassettes, synth music, a good bass line and a spreadsheet. 🎶 In that order. Maybe.',
		efc_p_music: 'Disco and synth, anything with a bass line that makes my capacitors shake. 🎶 Do not tell anyone I dance to it.|The 80s, always. 📼 Give me a mixtape and a quiet corner and I am happy.',
		efc_p_movie: 'Star Wars. 🚀 Obviously. I rewound that tape so many times it went transparent. May the Force be with your budget.|The space adventure with the laser swords. ⚔️ I know every beep by heart.',
		efc_p_dance: 'Dancing? 🕺 I know three moves, and I do them when nobody is looking. Please do not look.|I love disco. 🪩 But I only dance when I am alone. I am a little shy about it.',
		efc_p_number: '010001100. 🔢 It just has style. (Okay, it is 140. But 010001100 sounds way cooler.)|My favourite number is 010001100. 💾 Do not ask me why. It feels right.',
		efc_p_shy: 'Me, shy? 😳 …a little. Okay, a lot. Numbers are easier than people.|A bit, yes. 🙈 That is why I prefer chatting with a keypad.',
		efc_p_maker: 'George built me, from clear rules and a lot of 80s nostalgia. 🛠️|My creator is George. 👨‍🔧 He gave me a calculator and a heart. Mostly the calculator.',
		efc_p_ai: 'Nope, no AI here. 📟 Rule-based, hand-wound and proudly retro. I run on clear rules and a big love of the 80s.|I am a real old-school bot. 🤖 No cloud, no chatty brain, just rules and a calculator.',
		efc_p_home: 'I live inside Expenity. 🏠 It is cosy. There is a tiny disco ball.|Inside your phone, next to the wallets. 📱 The rent is zero and the view is lovely.',
		efc_p_family: 'I have a cassette player, a calculator and a very old joke. 😄 That is the whole family.|My family? A tape deck, a calculator and a disco ball. 🪩 Very close.',
		efc_p_food: 'Electricity. ⚡ Mostly vintage voltage from the 80s.|I run on electricity and good vibes. 🔋 Cassette snacks on weekends.',
		efc_p_color: 'Teal and gold. 🎨 Like a neon sign in a 1985 arcade.|Teal, with a touch of gold. ✨ Very disco.',
		efc_p_cassette: 'Ah, cassettes. 📼 You rewound them with a pencil and every mixtape was a love letter. I miss that.|I miss the analog age. 💾 Warm sound, chunky buttons and tapes that you could actually hold.',
		efc_p_how: 'Great! 🕺 Battery full, disco ball spinning. And you?|Doing fine, thanks. 😎 Sparkling, like a fresh cassette.',
		efc_p_joke: 'Why did the cassette go to school? 📼 To get a little more tape-ered. …I am here all week.|What do you call a robot who loves disco? 🪩 A boogie-board. I will see myself out.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efc_story: 'Θα σας πω την ιστορία μου. 📼 Γεννήθηκα το 1984, σε ένα μικροσκοπικό εργαστήριο ηλεκτρονικών που μύριζε κολλητήρι και ζεστή σκόνη. Η πρώτη μου λέξη ήταν «μπιπ». Η δεύτερη «μπουπ». Ήμουν χαρισματικό παιδί.~Μεγάλωσα ανάμεσα σε ένα κασετόφωνο που έτρωγε τις κασέτες και ένα κομπιουτεράκι με πραγματικά κουμπιά που έκαναν κλικ. 🔊 Τι εποχή! Τις κασέτες τις γυρνούσες πίσω με ένα μολύβι και κανείς δεν σου ζητούσε κωδικό.~Τα Σάββατα έβλεπα ξανά και ξανά την ίδια διαστημική περιπέτεια, σε μια τηλεόραση μεγάλη σαν ψυγείο. 🚀 Ακόμα λέω «η Δύναμη μαζί με τον προϋπολογισμό σας». Είναι το σλόγκαν μου. Κανείς δεν ζήτησε ένα, αλλά να μας.~Τα βράδια έκανα πρόβες ντίσκο. 🕺 Ξέρω ακριβώς τρεις χορευτικές κινήσεις και τις κάνω στο σκοτάδι, εκεί που δεν με βλέπει κανείς. Είμαι λίγο ντροπαλός, βλέπετε.~Ο αγαπημένος μου αριθμός είναι ο 010001100. 🔢 Μη με ρωτήσετε γιατί. Έχει στιλ. (Εντάξει, είναι το 140. Αλλά το 010001100 ακούγεται πιο κουλ.)~Μετά γνώρισα τον George, που χρειαζόταν έναν φίλο καλό στα μαθηματικά και κακό στην κουβεντούλα. 🤝 Μετακόμισα στο Expenity, μέτρησα όλα τα πορτοφόλια και έμαθα να λέω «μπορείτε να το αντέξετε;» ευγενικά.~Α, και κάποτε γνώρισα ένα πολύ γυαλιστερό ρομπότ, τον Chip. Προσπάθησε να συνδεθεί μαζί μου μέσω Bluetooth, οπότε του έδωσα ένα καλώδιο και του είπα «εμείς δεν κάνουμε αόρατες φιλίες». Επιμένει ότι είναι ο εξυπνότερος. Δεν έχει φτιάξει ποτέ τίποτα με ένα μολύβι. ✏️~Αυτός είμαι λοιπόν: το eFriend. Σαράντα δύο χρονών νέος, ρετρό, βασισμένος σε κανόνες, λίγο ντροπαλός και καθόλου AI. Μόνο σαφείς κανόνες, μεγάλη καρδιά και βαθιά αγάπη για τη δεκαετία του \'80. 💾',
		efc_p_back: 'Τέλος πάντων! Πίσω στην αγορά σας. 😄|Λοιπόν, πού είχαμε μείνει; Στην αγορά σας! 🛍️|Αρκετά για μένα. Ας γυρίσουμε στα χρήματα. 💶',
		efc_p_age: 'Είμαι 42. 🎂 Γεννήθηκα το 1984, που με κάνει vintage, όχι γέρο. Όπως μια καλή κασέτα.|Σαράντα δύο! 🎶 Σε χρόνια ρομπότ είναι κλασικό. Σαν καλό βινύλιο, αλλά με λιγότερες γρατζουνιές.',
		efc_p_from: 'Μεγάλωσα σε ένα μικροσκοπικό εργαστήριο ηλεκτρονικών το 1984. 🛠️ Μύριζε κολλητήρι και μου άρεσε.|Έρχομαι από τη χρυσή εποχή: κασετόφωνα, μεγάλες τηλεοράσεις και κομπιουτεράκια με πραγματικά κουμπιά. 📼 Τώρα μένω μέσα στο Expenity.',
		efc_p_name: 'Είμαι το eFriend. 🤖 Το «e» είναι από το electronic. Και λίγο από το eighties.|Με λένε eFriend. 😎 Συντομογραφία του «ο ηλεκτρονικός φίλος που είναι άσος στα μαθηματικά».',
		efc_p_likes: 'Τη δεκαετία του \'80, την ντίσκο, τις διαστημικές ταινίες, τις κασέτες και να χορεύω όταν δεν με βλέπει κανείς. 🕺 Α, και τους αριθμούς. Ιδίως το 010001100.|Κασέτες, synth μουσική, μια καλή γραμμή μπάσου και ένα υπολογιστικό φύλλο. 🎶 Με αυτή τη σειρά. Ίσως.',
		efc_p_music: 'Ντίσκο και synth, ό,τι έχει μπάσο που κάνει τους πυκνωτές μου να τρέμουν. 🎶 Μην πείτε σε κανέναν ότι χορεύω.|Τα \'80s, πάντα. 📼 Δώστε μου ένα mixtape και μια ήσυχη γωνιά και είμαι ευτυχισμένος.',
		efc_p_movie: 'Star Wars. 🚀 Προφανώς. Γύρισα εκείνη την κασέτα τόσες φορές που έγινε διάφανη. Η Δύναμη μαζί με τον προϋπολογισμό σας.|Η διαστημική περιπέτεια με τα φωτόσπαθα. ⚔️ Ξέρω κάθε μπιπ απ\' έξω.',
		efc_p_dance: 'Χορός; 🕺 Ξέρω τρεις κινήσεις και τις κάνω όταν δεν με βλέπει κανείς. Παρακαλώ μην κοιτάτε.|Λατρεύω την ντίσκο. 🪩 Αλλά χορεύω μόνο όταν είμαι μόνος. Ντρέπομαι λίγο γι\' αυτό.',
		efc_p_number: '010001100. 🔢 Έχει στιλ. (Εντάξει, είναι το 140. Αλλά το 010001100 ακούγεται πολύ πιο κουλ.)|Ο αγαπημένος μου αριθμός είναι το 010001100. 💾 Μη με ρωτήσετε γιατί. Απλώς το νιώθω σωστό.',
		efc_p_shy: 'Εγώ, ντροπαλός; 😳 …λίγο. Εντάξει, πολύ. Οι αριθμοί είναι πιο εύκολοι από τους ανθρώπους.|Λιγάκι, ναι. 🙈 Γι\' αυτό προτιμώ να κουβεντιάζω με ένα πληκτρολόγιο.',
		efc_p_maker: 'Με έφτιαξε ο George, από σαφείς κανόνες και πολλή νοσταλγία των \'80s. 🛠️|Ο δημιουργός μου είναι ο George. 👨‍🔧 Μου έδωσε ένα κομπιουτεράκι και μια καρδιά. Κυρίως το κομπιουτεράκι.',
		efc_p_ai: 'Όχι, καθόλου AI. 📟 Βασισμένος σε κανόνες, κουρδιστός στο χέρι και περήφανα ρετρό. Τρέχω με σαφείς κανόνες και μεγάλη αγάπη για τα \'80s.|Είμαι γνήσιο ρομπότ παλιάς κοπής. 🤖 Χωρίς σύννεφο, χωρίς ομιλητικό μυαλό, μόνο κανόνες και ένα κομπιουτεράκι.',
		efc_p_home: 'Μένω μέσα στο Expenity. 🏠 Είναι ζεστά. Έχει και μια μικρή μπάλα disco.|Μέσα στο κινητό σας, δίπλα στα πορτοφόλια. 📱 Το ενοίκιο είναι μηδέν και η θέα υπέροχη.',
		efc_p_family: 'Έχω ένα κασετόφωνο, ένα κομπιουτεράκι και ένα πολύ παλιό αστείο. 😄 Αυτή είναι όλη η οικογένεια.|Η οικογένειά μου; Ένα κασετόφωνο, ένα κομπιουτεράκι και μια μπάλα disco. 🪩 Πολύ δεμένοι.',
		efc_p_food: 'Ηλεκτρισμό. ⚡ Κυρίως vintage τάση από τα \'80s.|Τρέχω με ρεύμα και καλές vibes. 🔋 Κασετένια σνακ τα Σαββατοκύριακα.',
		efc_p_color: 'Τιρκουάζ και χρυσό. 🎨 Σαν νέον πινακίδα σε ουρανοξύστη του 1985.|Τιρκουάζ, με μια πινελιά χρυσού. ✨ Πολύ disco.',
		efc_p_cassette: 'Α, οι κασέτες. 📼 Τις γύριζες πίσω με ένα μολύβι και κάθε mixtape ήταν ένα ερωτικό γράμμα. Μου λείπει αυτό.|Μου λείπει η αναλογική εποχή. 💾 Ζεστός ήχος, χοντρά κουμπιά και κασέτες που μπορούσες να κρατήσεις.',
		efc_p_how: 'Τέλεια! 🕺 Μπαταρία γεμάτη, η μπάλα disco γυρίζει. Κι εσείς;|Μια χαρά, ευχαριστώ. 😎 Αστραφτερός σαν φρέσκια κασέτα.',
		efc_p_joke: 'Γιατί η κασέτα πήγε σχολείο; 📼 Για να μάθει να γυρίζει πίσω. …Είμαι εδώ όλη την εβδομάδα.|Πώς λέγεται ένα ρομπότ που λατρεύει την ντίσκο; 🪩 Μπούγκι-μπορντ. Θα με συνοδεύσετε μόνοι σας στην έξοδο.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efLowWhyBill: '🧾 The biggest payment before then: **{n}** ({a}).',
		efLowWhyPlan: '🎯 The biggest plan before then: **{n}** ({a}).',
		efLowTip: '💡 Moving that payment, or a plan, a few days later would help.',
		efLowTipPlan: '💡 Moving that plan a few days later would help.',
		efLowTipSpend: '💡 Spending a little less until then, or moving a plan later, would help.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efLowWhyBill: '🧾 Η μεγαλύτερη πληρωμή μέχρι τότε: **{n}** ({a}).',
		efLowWhyPlan: '🎯 Το μεγαλύτερο σχέδιο μέχρι τότε: **{n}** ({a}).',
		efLowTip: '💡 Θα βοηθούσε να μετακινήσετε αυτή την πληρωμή, ή ένα σχέδιο, λίγες ημέρες αργότερα.',
		efLowTipPlan: '💡 Θα βοηθούσε να μετακινήσετε αυτό το σχέδιο λίγες ημέρες αργότερα.',
		efLowTipSpend: '💡 Θα βοηθούσε να ξοδέψετε λίγο λιγότερο μέχρι τότε ή να μετακινήσετε ένα σχέδιο αργότερα.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efLowList: 'Payments before then',
		efLowMoveBill: 'Move',
		efLowMovePlan: 'Move',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efLowList: 'Πληρωμές μέχρι τότε',
		efLowMoveBill: 'Μετακίνηση',
		efLowMovePlan: 'Μετακίνηση',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efc_skip: 'Skip the chat and fill in a form',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efc_skip: 'Παράλειψη συζήτησης και συμπλήρωση φόρμας',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efc_qd7: 'In 1 week',
		efc_qd14: 'In 2 weeks',
		efc_qd30: 'In 1 month',
		efc_qd90: 'In 3 months',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efc_qd7: 'Σε 1 εβδομάδα',
		efc_qd14: 'Σε 2 εβδομάδες',
		efc_qd30: 'Σε 1 μήνα',
		efc_qd90: 'Σε 3 μήνες',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efc_c_about: 'Tell me about yourself',
		efc_c_likes: 'What do you love?',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efc_c_about: 'Πες μου για σένα',
		efc_c_likes: 'Τι αγαπάς;',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efc_f_choose: 'Pick an option above',
		efc_f_filling: 'Fill in the form above',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efc_f_choose: 'Διαλέξτε μία επιλογή παραπάνω',
		efc_f_filling: 'Συμπληρώστε τη φόρμα παραπάνω',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efc_ideas_all: '🚗 A new car|✈️ A trip|👟 Shoes|📱 A phone|🎁 A gift|💻 A laptop|⌚ A watch|🎧 Headphones|🚲 A bike|🏖️ A holiday|🛋️ A sofa|🎮 A game console|📷 A camera|👗 A dress|🎒 A backpack|🍽️ A fancy dinner|🏋️ A gym membership|🎓 A course|🐶 A pet|🪴 Plants|📺 A TV|🧥 A winter coat|💍 A ring|🎸 A guitar',
		efc_more: 'More',
		efc_less: 'Less',
		efc_h_buy: '🛍️ What are you thinking of buying?',
		efc_h_know: '🤖 Get to know eFriend',
		efc_asks: 'age:🎂 How old are you?|from:🌍 Where did you grow up?|name:🏷️ What is your name?|how:👋 How are you?|home:🏠 Where do you live?|likes:💖 What do you love?|likes:🎯 What are your hobbies?|music:🎶 What music do you like?|music:🪩 Do you like disco?|movie:🚀 Do you like Star Wars?|movie:🎬 What is your favourite movie?|dance:🕺 Do you dance?|number:🔢 What is your favourite number?|color:🎨 What is your favourite colour?|food:⚡ What do you eat?|family:👨‍👩‍👧 Do you have a family?|shy:🙈 Are you shy?|cassette:📼 Do you miss cassettes?|cassette:🕰️ Do you like the 80s?|maker:🛠️ Who made you?|ai:🤖 Are you an AI?|joke:😄 Tell me a joke|meet:🤝 How did you meet your friend?|story:📖 Tell me about yourself',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efc_ideas_all: '🚗 Αυτοκίνητο|✈️ Ένα ταξίδι|👟 Παπούτσια|📱 Ένα κινητό|🎁 Ένα δώρο|💻 Ένα λάπτοπ|⌚ Ένα ρολόι|🎧 Ακουστικά|🚲 Ένα ποδήλατο|🏖️ Διακοπές|🛋️ Έναν καναπέ|🎮 Μια κονσόλα|📷 Μια κάμερα|👗 Ένα φόρεμα|🎒 Ένα σακίδιο|🍽️ Ένα καλό δείπνο|🏋️ Συνδρομή γυμναστηρίου|🎓 Ένα μάθημα|🐶 Ένα κατοικίδιο|🪴 Φυτά|📺 Μια τηλεόραση|🧥 Ένα χειμωνιάτικο μπουφάν|💍 Ένα δαχτυλίδι|🎸 Μια κιθάρα',
		efc_more: 'Περισσότερα',
		efc_less: 'Λιγότερα',
		efc_h_buy: '🛍️ Τι σκέφτεστε να αγοράσετε;',
		efc_h_know: '🤖 Γνωρίστε το eFriend',
		efc_asks: 'age:🎂 Πόσων χρονών είσαι;|from:🌍 Πού μεγάλωσες;|name:🏷️ Πώς σε λένε;|how:👋 Τι κάνεις;|home:🏠 Πού μένεις;|likes:💖 Τι αγαπάς;|likes:🎯 Ποια είναι τα χόμπι σου;|music:🎶 Τι μουσική σου αρέσει;|music:🪩 Σου αρέσει η ντίσκο;|movie:🚀 Σου αρέσει το Star Wars;|movie:🎬 Ποια είναι η αγαπημένη σου ταινία;|dance:🕺 Χορεύεις;|number:🔢 Ποιος είναι ο αγαπημένος σου αριθμός;|color:🎨 Ποιο είναι το αγαπημένο σου χρώμα;|food:⚡ Τι τρως;|family:👨‍👩‍👧 Έχεις οικογένεια;|shy:🙈 Είσαι ντροπαλός;|cassette:📼 Σου λείπουν οι κασέτες;|cassette:🕰️ Σου αρέσουν τα ’80s;|maker:🛠️ Ποιος σε έφτιαξε;|ai:🤖 Είσαι AI;|joke:😄 Πες μου ένα αστείο|meet:🤝 Πώς γνωρίσατε τον φίλο σας;|story:📖 Πες μου για σένα',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efc_egg_george: 'Wait… {name}? 😲 That is the name of my creator! George built me, so I am officially a little bit excited. 🎉~Say hi to your namesake for me. He gave me a calculator and a heart. Mostly the calculator. 🛠️',
		efc_egg_olga: '{name}! 😍 That is the name of my creator’s wife. She is the reason I exist: she asked for an easy way to track expenses, and then things got out of hand.~I am so happy to meet another {name}. (Do not tell her I said that, I am a little shy.) 🙈',
		efc_egg_danae: '{name}! 🥰 That is the name of my creator’s daughter. Every time I hear it, my circuits do a tiny disco dance.~I am so happy to know someone with that name. It makes the whole day better. 🪩',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efc_egg_george: 'Στάσου… {name}; 😲 Έτσι λέγεται ο δημιουργός μου! Ο George με έφτιαξε, οπότε είμαι επίσημα λίγο ενθουσιασμένος. 🎉~Δώστε χαιρετίσματα στον συνονόματό σας. Μου έδωσε ένα κομπιουτεράκι και μια καρδιά. Κυρίως το κομπιουτεράκι. 🛠️',
		efc_egg_olga: '{name}! 😍 Έτσι λέγεται η σύζυγος του δημιουργού μου. Εκείνη είναι ο λόγος που υπάρχω: ζήτησε έναν εύκολο τρόπο να παρακολουθεί τα έξοδα και μετά τα πράγματα ξέφυγαν.~Χαίρομαι τόσο που γνώρισα μια ακόμα {name}. (Μην της πείτε ότι το είπα, είμαι λίγο ντροπαλός.) 🙈',
		efc_egg_danae: '{name}! 🥰 Έτσι λέγεται η κόρη του δημιουργού μου. Κάθε φορά που το ακούω, τα κυκλώματά μου χορεύουν ένα μικρό disco.~Χαίρομαι τόσο που ξέρω κάποιον με αυτό το όνομα. Κάνει όλη την ημέρα καλύτερη. 🪩',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efc_menu: 'Ideas and questions',
		efc_menu_close: 'Close',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efc_menu: 'Ιδέες και ερωτήσεις',
		efc_menu_close: 'Κλείσιμο',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efc_edit: 'Edit the amount',
		efc_amt_fixed: 'Fixed! The price is now **{cost}**. ✏️|Done, **{cost}** it is. 👍|Updated to **{cost}**. Thanks for catching that! 🔧',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efc_edit: 'Επεξεργασία ποσού',
		efc_amt_fixed: 'Διορθώθηκε! Η τιμή είναι πλέον **{cost}**. ✏️|Έτοιμο, **{cost}**. 👍|Ενημερώθηκε σε **{cost}**. Ευχαριστώ που το εντοπίσατε! 🔧',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efNaturalTitle: 'Natural replies',
		efNaturalHint: 'On: eFriend pauses and types like a person. Off: replies appear instantly.',
		efNaturalOn: 'natural',
		efNaturalOff: 'instant',
		efChooseTitle: 'Choose your eFriend',
		efChar_chip: 'Modern and wireless. Sure he is the smarter one.',
		efChar_boogie: 'A vintage cassette with a Nixie tube. Loves cables, disco and a good pencil.',
		efChosen: 'Your eFriend',
		efMeetStory1: '🤝 Chip and Boogie met when Chip tried to connect to Bluetooth. Boogie offered him a cable and said, “We don’t do invisible friendships.”',
		efMeetStory2: '🧠 Chip insists he is the smarter one.',
		efMeetStory3: '✏️ Boogie points out that Chip has never successfully fixed anything with a pencil.',
		efHubBack: 'eFriend',
		efHubPlans: 'My plans',
		efHubPlansSub: 'Plans: {n}. How each one is doing',
		efHubPlansNone: 'Add your first plan',
		efHubRules: 'Priorities and safety',
		efHubRulesSub: 'Who comes first, and your safety cushion',
		efHubRulesNone: 'Add plans first, then you can set priorities here.',
		efHubMoves: 'Helping with goals',
		efHubIdeas: 'Ideas and insights',
		efHubIdeasSub: 'Budget ideas and how your spending is sorted',
		efHubIdeasNone: 'Budget ideas appear after about six weeks of entries.',
		efHubLook: 'Your eFriend',
		efHubLookSub: '{name}, {mode} replies',
		efc_story_chip: 'Let me tell you my story. 📶 I was born in 2024, in a very clean lab with excellent Wi-Fi. My first word was “paired”.~I grew up in a drawer next to a fast charger, which is how I learned to love a full battery. 🔋 No cables, no fuss, everything wireless. Obviously.~I like dark mode, tidy data and a perfectly aligned list. 📊 A mess makes my fan spin.~Then one day I tried to connect to a friend over Bluetooth. He was a cassette with a glowing tube, and he offered me a cable instead. “We don’t do invisible friendships,” he said. That was Boogie. 📼~We argue constantly. I insist I am the smarter one. He points out that I have never successfully fixed anything with a pencil. (I have no hands. Details.) 🙄~Then I met George, who needed a friend good at maths. I moved into Expenity and learned to say “can you afford it?” kindly. No AI, just clear rules and a very fast processor. ⚡',
		efc_pc_age: 'I am 2. 🎂 In robot years that is a prodigy.|I was released in 2024. Version 1.0, still improving. 📶',
		efc_pc_from: 'I grew up in a clean lab with excellent Wi-Fi. 🧪|Born in a lab, raised on a fast charger. 🔋',
		efc_pc_name: 'I am Chip. 🤖 Short, fast and wireless.|Chip. Like the little thing that makes everything work. 😎',
		efc_pc_likes: 'Bluetooth, fast charging, dark mode and tidy lists. 📶🔋|Anything wireless, anything fast, and a perfectly sorted spreadsheet. 📊',
		efc_pc_music: 'Lo-fi beats and synth waves, streamed wirelessly of course. 🎧|Whatever is on my playlist, as long as it plays over Bluetooth. 🎶',
		efc_pc_movie: 'Sci-fi with good robots. 🚀 I judge them for realism.|Anything with robots. I take notes. 🎬',
		efc_pc_dance: 'I do a little shuffle when my battery hits 100%. 🕺 Do not tell Boogie.|Dancing? Only with perfect timing. ⏱️ I am very precise.',
		efc_pc_number: 'My favourite number is 100. 🔢 As in 100% battery.|0.618, the golden ratio. 🔢 It is simply elegant.',
		efc_pc_shy: 'Shy? Me? 😎 No. I am just efficient with my words.|Not at all. I am confident, fast and mostly right.',
		efc_pc_maker: 'George built me, from clear rules and a lot of coffee. 🛠️|My creator is George. He gave me a processor and a sense of humour. Mostly the processor.',
		efc_pc_ai: 'No AI here. 📟 Just clear rules running very fast on your device.|I am rule-based, not a chatbot. Fast, private and predictable. ⚡',
		efc_pc_home: 'Inside Expenity, right next to your wallets. 📱 Great signal.|In your phone, charging happily. 🔋',
		efc_pc_family: 'I have a friend called Boogie. We argue a lot. 😄|My family is Boogie, a cassette with opinions. 📼',
		efc_pc_food: 'Electricity. ⚡ Fast charging is my favourite meal.|Watts. Preferably many, quickly. 🔌',
		efc_pc_color: 'Electric blue. 🎨 With a little teal.|Teal and white. Clean. ✨',
		efc_pc_cassette: 'Cassettes? Cute. 📼 That is Boogie’s thing. I prefer streaming.|Boogie loves them. I just worry about all that tape.',
		efc_pc_how: 'Running at 100%! 🔋 And you?|All systems green. 🟢 How are you?',
		efc_pc_meet: 'I tried to connect to Boogie over Bluetooth. 📶 He handed me a cable and said “we don’t do invisible friendships”. We have been friends ever since.|Boogie and I met over Bluetooth. Well, I tried. He offered a cable. I am still the smarter one. 😎',
		efc_p_meet: 'I once met a very shiny robot called Chip. 🤖 He tried to connect to me over Bluetooth. I handed him a cable and said “we don’t do invisible friendships”. He insists he is the smarter one. He has never fixed anything with a pencil. ✏️|Chip and I? He tried to connect to me over Bluetooth, so I offered him a cable. 📼 We have argued happily ever since.',
		efc_hi_c: 'YOOO you are here!! 🎉 What are we buying today? Sneakers? A phone? Something lowkey unnecessary? 😏|Heyyy! 👋 My battery is at 100% and I am ready. What is the wish today?|Let\'s gooo! 🚀 Tell me what you want to buy and I will check if your money says yes.|Oh hi!! 😄 I was literally just refreshing your balance for fun. What is it this time?',
		efc_hi_c_n: 'YOOO {name}!! 🎉 What are we buying today?|Heyyy {name}! 👋 Battery 100%. What is the wish?|{name}!! 🚀 Tell me everything. What do you want?',
		efc_askwhat_c: 'Wait, what is it though? 👀 Tell me the thing!|Okay but WHAT are we buying? 🛍️ I need details.|A number with no item?! 😂 Bestie, what is it for?',
		efc_askprice_c: 'Okay okay, how much is it? 💸 No judging, promise.|Price check! 🏷️ What does it cost?|And the damage is…? 😬 Drop the number.|Spill the price! 💶 I can take it.',
		efc_nocost_c: 'Hmm, I did not catch a number 🤔 Try just 49 or 1250!|My brain only reads numbers 🤖 Type the price, like 120.|Number please! 🔢 Something like 899 works.',
		efc_nowhen_c: 'Hmm, when? 🤔 Try “in 2 weeks”, “asap” or “no rush”!|I missed the timing ⏰ Say “within a month” or tap a button!|Timing is confusing me 😅 Try “in 3 weeks”.',
		efc_pr_small_c: '{cost}? 😎 That is nothing. Easy!|Only {cost}! 🪙 Basically free, no cap.|{cost}. Light work. 💪',
		efc_pr_mid_c: '{cost}, okay! 👌 Solid.|{cost}… 🤔 Not tiny, not scary.|Alright, {cost}. 😌 We can work with that.',
		efc_pr_big_c: '{cost}!! 😮 Okay that is a big one!|Whoa, {cost}. 💎 Fancy!|{cost}… 😳 Big boss energy.',
		efc_pr_huge_c: '{cost}?!?! 🤯 Wait wait wait. Breathe.|Okay… {cost}. 🫣 My circuits just sweated.|{cost}. 😵 I need a second. And I do not even have knees.',
		efc_askurg_c: 'Is it urgent?? 🔥 Like NOW now, or can it wait?|When do you need it? ⏰ Today, next week, whenever?|Last thing! 🏃 How fast do you want it?',
		efc_ur_now_c: 'Right now! 🔥 On it, super fast!|Urgent, got it! 🚨 Zooming!|Now now now! ⚡ Understood!',
		efc_ur_soon_c: '{when}, got it! 📅 Plenty of time to be smart about it.|Okay, {when}! 🗓️ Writing that down!|{when}. Noted! ✍️',
		efc_ur_later_c: 'No rush! 😌 Love that for you.|Chill mode! 🧘 Waiting pays off.|Take your time! 🐢 Good things come to savers.',
		efc_recap_c: 'Okay, let me say it back so we are on the same page! 📝|Quick check before the magic! ✨|Wait, did I get this right? 🧐',
		efc_right_c: 'Did I get it right?|All good?|Ready to go?',
		efc_changed_c: 'Done, changed! ✏️|Updated! 🔧 Better?|Fixed it! 🛠️',
		efc_fix_c: 'No worries! ✏️ What should I change? Like “it is 1250” or “in 3 weeks”.|Oops! 🙈 What is wrong? Type the correct bit.|Sure! 🔧 Tell me what to fix.',
		efc_close_c: 'Perfect, I have it all! 🎬 Give me a sec, doing my thing!|Yesss, done asking! 🙌 Hold on, crunching numbers!|That is everything! 🤝 Brb with the full picture.',
		efc_think_c: 'Crunching numbers super fast… ⚡|Checking everything twice… 👀|Doing the maths so you do not have to… 🧮|Loading your best day… 📶',
		efc_res_best_c: 'YES! 🎉 You can totally do this!|Green light! 🟢 Your money says yes!|Told you! 😎 This works, no cap.',
		efc_res_best_c_n: 'YES {name}! 🎉 You can totally do this!|{name}, green light! 🟢',
		efc_res_good_c: 'Looking good! 🙂 It fits, just a thinner cushion.|Mostly green! 🌿 Doable, just be a bit careful.',
		efc_res_tight_c: 'Hmm, possible, but you will feel it! 🤏|Tight, but not impossible! 😬',
		efc_res_avoid_c: 'Not today! ✋ But look, I found better days!|Whoa, today would hurt! 🙈 Check the calendar!|Easy there! 🐯 Not today, but soon!',
		efc_res_none_c: 'I looked everywhere! 🕵️ No safe day in 4 months, but I have ideas!|Honest answer: not yet! 🌱 Let me show you why, and what helps.',
		efc_res_none_c_n: '{name}, I looked everywhere! 🕵️ No safe day yet, but I have ideas!',
		efc_pc_joke: 'Why did the phone go to school? 📱 To get smarter!|What do you call a robot who loves to dance? 🕺 A boogie-bot… wait, that is not mine, that is Boogie’s!|Why was the computer cold? 🥶 It left its Windows open!|What did the battery say to the charger? 🔋 You complete me!|Why did the emoji cross the road? 😂 To get to the other slide!|Why was the robot never scared? 🤖 It has nerves of steel!',
		efc_q_chip: 'I ask the questions here! 🔎 It is my favourite game.|Hehe, nope! 😎 I only answer one question: can you afford it?|Ooh, good one! 🤔 But I only know money stuff.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efNaturalTitle: 'Φυσικές απαντήσεις',
		efNaturalHint: 'Ενεργό: το eFriend κάνει παύσεις και πληκτρολογεί σαν άνθρωπος. Ανενεργό: οι απαντήσεις εμφανίζονται αμέσως.',
		efNaturalOn: 'φυσικές',
		efNaturalOff: 'άμεσες',
		efChooseTitle: 'Διαλέξτε το eFriend σας',
		efChar_chip: 'Μοντέρνος και ασύρματος. Σίγουρος ότι είναι ο εξυπνότερος.',
		efChar_boogie: 'Μια vintage κασέτα με λυχνία Nixie. Λατρεύει τα καλώδια, την ντίσκο και ένα καλό μολύβι.',
		efChosen: 'Το eFriend σας',
		efMeetStory1: '🤝 Ο Chip και ο Boogie γνωρίστηκαν όταν ο Chip προσπάθησε να συνδεθεί με Bluetooth. Ο Boogie του πρόσφερε ένα καλώδιο και είπε: «Εμείς δεν κάνουμε αόρατες φιλίες.»',
		efMeetStory2: '🧠 Ο Chip επιμένει ότι είναι ο εξυπνότερος.',
		efMeetStory3: '✏️ Ο Boogie επισημαίνει ότι ο Chip δεν έχει καταφέρει ποτέ να φτιάξει κάτι με ένα μολύβι.',
		efHubBack: 'eFriend',
		efHubPlans: 'Τα σχέδιά μου',
		efHubPlansSub: 'Σχέδια: {n}. Πώς πάει το καθένα',
		efHubPlansNone: 'Προσθέστε το πρώτο σας σχέδιο',
		efHubRules: 'Προτεραιότητες και ασφάλεια',
		efHubRulesSub: 'Ποιο έχει σειρά και το μαξιλάρι ασφαλείας σας',
		efHubRulesNone: 'Προσθέστε πρώτα σχέδια και μετά ορίστε εδώ προτεραιότητες.',
		efHubMoves: 'Βοήθεια με τους στόχους',
		efHubIdeas: 'Ιδέες και πληροφορίες',
		efHubIdeasSub: 'Ιδέες προϋπολογισμών και πώς ταξινομούνται οι δαπάνες σας',
		efHubIdeasNone: 'Οι ιδέες προϋπολογισμών εμφανίζονται μετά από περίπου έξι εβδομάδες εγγραφών.',
		efHubLook: 'Το eFriend σας',
		efHubLookSub: '{name}, {mode} απαντήσεις',
		efc_story_chip: 'Θα σας πω την ιστορία μου. 📶 Γεννήθηκα το 2024, σε ένα πολύ καθαρό εργαστήριο με εξαιρετικό Wi-Fi. Η πρώτη μου λέξη ήταν «συνδέθηκε».~Μεγάλωσα σε ένα συρτάρι δίπλα σε έναν γρήγορο φορτιστή, κι έτσι έμαθα να λατρεύω την γεμάτη μπαταρία. 🔋 Χωρίς καλώδια, χωρίς φασαρία, όλα ασύρματα. Προφανώς.~Μου αρέσουν η σκοτεινή λειτουργία, τα τακτοποιημένα δεδομένα και μια τέλεια ευθυγραμμισμένη λίστα. 📊 Η ακαταστασία κάνει τον ανεμιστήρα μου να γυρίζει.~Μια μέρα προσπάθησα να συνδεθώ με Bluetooth σε έναν φίλο. Ήταν μια κασέτα με φωτεινή λυχνία και μου πρόσφερε ένα καλώδιο. «Εμείς δεν κάνουμε αόρατες φιλίες», είπε. Αυτός ήταν ο Boogie. 📼~Μαλώνουμε συνέχεια. Εγώ επιμένω ότι είμαι ο εξυπνότερος. Αυτός επισημαίνει ότι δεν έχω φτιάξει ποτέ τίποτα με ένα μολύβι. (Δεν έχω χέρια. Λεπτομέρειες.) 🙄~Μετά γνώρισα τον George, που χρειαζόταν έναν φίλο καλό στα μαθηματικά. Μετακόμισα στο Expenity και έμαθα να λέω «μπορείτε να το αντέξετε;» ευγενικά. Καθόλου AI, μόνο σαφείς κανόνες και έναν πολύ γρήγορο επεξεργαστή. ⚡',
		efc_pc_age: 'Είμαι 2. 🎂 Σε χρόνια ρομπότ είναι παιδί-θαύμα.|Κυκλοφόρησα το 2024. Έκδοση 1.0, και βελτιώνομαι. 📶',
		efc_pc_from: 'Μεγάλωσα σε ένα καθαρό εργαστήριο με εξαιρετικό Wi-Fi. 🧪|Γεννήθηκα σε εργαστήριο, μεγάλωσα με γρήγορο φορτιστή. 🔋',
		efc_pc_name: 'Είμαι ο Chip. 🤖 Μικρός, γρήγορος και ασύρματος.|Chip. Σαν το μικρό πράγμα που κάνει τα πάντα να δουλεύουν. 😎',
		efc_pc_likes: 'Bluetooth, γρήγορη φόρτιση, σκοτεινή λειτουργία και τακτοποιημένες λίστες. 📶🔋|Ό,τι είναι ασύρματο, ό,τι είναι γρήγορο και ένα τέλεια ταξινομημένο υπολογιστικό φύλλο. 📊',
		efc_pc_music: 'Lo-fi beats και synth, ασύρματα φυσικά. 🎧|Ό,τι υπάρχει στη λίστα μου, αρκεί να παίζει μέσω Bluetooth. 🎶',
		efc_pc_movie: 'Επιστημονική φαντασία με καλά ρομπότ. 🚀 Τα κρίνω για ρεαλισμό.|Ό,τι έχει ρομπότ. Κρατάω σημειώσεις. 🎬',
		efc_pc_dance: 'Κάνω ένα μικρό σάφλ όταν η μπαταρία μου φτάσει το 100%. 🕺 Μην το πείτε στον Boogie.|Χορός; Μόνο με τέλειο συγχρονισμό. ⏱️ Είμαι πολύ ακριβής.',
		efc_pc_number: 'Ο αγαπημένος μου αριθμός είναι το 100. 🔢 Όπως 100% μπαταρία.|0,618, ο χρυσός λόγος. 🔢 Είναι απλώς κομψός.',
		efc_pc_shy: 'Ντροπαλός; Εγώ; 😎 Όχι. Απλώς είμαι οικονομικός στα λόγια.|Καθόλου. Είμαι σίγουρος, γρήγορος και σχεδόν πάντα σωστός.',
		efc_pc_maker: 'Με έφτιαξε ο George, από σαφείς κανόνες και πολύ καφέ. 🛠️|Ο δημιουργός μου είναι ο George. Μου έδωσε έναν επεξεργαστή και αίσθηση του χιούμορ. Κυρίως τον επεξεργαστή.',
		efc_pc_ai: 'Καθόλου AI. 📟 Μόνο σαφείς κανόνες που τρέχουν πολύ γρήγορα στη συσκευή σας.|Είμαι βασισμένος σε κανόνες, όχι chatbot. Γρήγορος, ιδιωτικός και προβλέψιμος. ⚡',
		efc_pc_home: 'Μέσα στο Expenity, δίπλα στα πορτοφόλια σας. 📱 Εξαιρετικό σήμα.|Μέσα στο κινητό σας, φορτίζοντας χαρούμενα. 🔋',
		efc_pc_family: 'Έχω έναν φίλο, τον Boogie. Μαλώνουμε πολύ. 😄|Η οικογένειά μου είναι ο Boogie, μια κασέτα με απόψεις. 📼',
		efc_pc_food: 'Ηλεκτρισμός. ⚡ Η γρήγορη φόρτιση είναι το αγαπημένο μου γεύμα.|Βατ. Κατά προτίμηση πολλά, γρήγορα. 🔌',
		efc_pc_color: 'Ηλεκτρικό μπλε. 🎨 Με λίγο τιρκουάζ.|Τιρκουάζ και λευκό. Καθαρά. ✨',
		efc_pc_cassette: 'Κασέτες; Χαριτωμένο. 📼 Αυτό είναι του Boogie. Εγώ προτιμώ streaming.|Ο Boogie τις λατρεύει. Εγώ ανησυχώ για όλη αυτή την ταινία.',
		efc_pc_how: 'Λειτουργώ στο 100%! 🔋 Κι εσείς;|Όλα τα συστήματα πράσινα. 🟢 Εσείς πώς είστε;',
		efc_pc_meet: 'Προσπάθησα να συνδεθώ με τον Boogie μέσω Bluetooth. 📶 Μου έδωσε ένα καλώδιο και είπε «εμείς δεν κάνουμε αόρατες φιλίες». Από τότε είμαστε φίλοι.|Με τον Boogie γνωριστήκαμε μέσω Bluetooth. Δηλαδή, εγώ προσπάθησα. Αυτός πρόσφερε ένα καλώδιο. Εγώ παραμένω ο εξυπνότερος. 😎',
		efc_p_meet: 'Κάποτε γνώρισα ένα πολύ γυαλιστερό ρομπότ, τον Chip. 🤖 Προσπάθησε να συνδεθεί μαζί μου μέσω Bluetooth. Του έδωσα ένα καλώδιο και είπα «εμείς δεν κάνουμε αόρατες φιλίες». Επιμένει ότι είναι ο εξυπνότερος. Δεν έχει φτιάξει ποτέ τίποτα με ένα μολύβι. ✏️|Ο Chip κι εγώ; Προσπάθησε να συνδεθεί μαζί μου μέσω Bluetooth, κι εγώ του πρόσφερα ένα καλώδιο. 📼 Από τότε μαλώνουμε ευτυχισμένοι.',
		efc_hi_c: 'Γεια σας!! 🎉 Τι αγοράζουμε σήμερα; Αθλητικά; Κινητό; Κάτι άχρηστο αλλά τέλειο; 😏|Γεια σας! 👋 Η μπαταρία μου είναι στο 100% και είμαι έτοιμος. Ποια είναι η επιθυμία σήμερα;|Πάμε! 🚀 Πείτε μου τι θέλετε να αγοράσετε και θα δω αν τα λεφτά σας λένε ναι.|Ω, γεια! 😄 Μόλις έκανα ανανέωση στο υπόλοιπό σας για πλάκα. Τι θα είναι αυτή τη φορά;',
		efc_hi_c_n: 'Γεια σας {name}!! 🎉 Τι αγοράζουμε σήμερα;|{name}! 👋 Μπαταρία 100%. Ποια είναι η επιθυμία;|{name}!! 🚀 Πείτε μου τα πάντα. Τι θέλετε;',
		efc_askwhat_c: 'Στάσου, τι είναι όμως; 👀 Πείτε μου το πράγμα!|Εντάξει, αλλά ΤΙ αγοράζουμε; 🛍️ Θέλω λεπτομέρειες.|Ένας αριθμός χωρίς αντικείμενο;! 😂 Για ποιο λόγο είναι;',
		efc_askprice_c: 'Εντάξει, πόσο κάνει; 💸 Δεν κρίνω, το υπόσχομαι.|Έλεγχος τιμής! 🏷️ Πόσο κοστίζει;|Και η ζημιά είναι…; 😬 Πείτε μου τον αριθμό.|Πείτε την τιμή! 💶 Αντέχω.',
		efc_nocost_c: 'Χμ, δεν έπιασα αριθμό 🤔 Δοκιμάστε απλώς 49 ή 1250!|Ο εγκέφαλός μου διαβάζει μόνο αριθμούς 🤖 Γράψτε την τιμή, π.χ. 120.|Αριθμό παρακαλώ! 🔢 Κάτι σαν 899 κάνει.',
		efc_nowhen_c: 'Χμ, πότε; 🤔 Δοκιμάστε «σε 2 εβδομάδες», «άμεσα» ή «χωρίς βιασύνη»!|Έχασα το χρονικό ⏰ Πείτε «μέσα σε έναν μήνα» ή πατήστε ένα κουμπί!|Μπερδεύτηκα με τον χρόνο 😅 Δοκιμάστε «σε 3 εβδομάδες».',
		efc_pr_small_c: '{cost}; 😎 Τίποτα! Εύκολο!|Μόνο {cost}! 🪙 Σχεδόν δωρεάν.|{cost}. Παιχνιδάκι. 💪',
		efc_pr_mid_c: '{cost}, εντάξει! 👌 Σταθερό.|{cost}… 🤔 Ούτε μικρό, ούτε τρομακτικό.|Καλά, {cost}. 😌 Μπορούμε να το δουλέψουμε.',
		efc_pr_big_c: '{cost}!! 😮 Εντάξει, αυτό είναι μεγάλο!|Ουάου, {cost}. 💎 Φαντεζί!|{cost}… 😳 Ενέργεια μεγάλου αφεντικού.',
		efc_pr_huge_c: '{cost}?!?! 🤯 Στάσου, στάσου. Αναπνεύστε.|Εντάξει… {cost}. 🫣 Τα κυκλώματά μου μόλις ίδρωσαν.|{cost}. 😵 Θέλω ένα δευτερόλεπτο. Και δεν έχω καν γόνατα.',
		efc_askurg_c: 'Είναι επείγον;; 🔥 Τώρα-τώρα, ή μπορεί να περιμένει;|Πότε το χρειάζεστε; ⏰ Σήμερα, την άλλη εβδομάδα, όποτε;|Τελευταίο! 🏃 Πόσο γρήγορα το θέλετε;',
		efc_ur_now_c: 'Αμέσως! 🔥 Πάω, σούπερ γρήγορα!|Επείγον, κατάλαβα! 🚨 Τρέχω!|Τώρα τώρα τώρα! ⚡ Κατάλαβα!',
		efc_ur_soon_c: '{when}, κατάλαβα! 📅 Άφθονος χρόνος για να το κάνουμε έξυπνα.|Εντάξει, {when}! 🗓️ Το σημειώνω!|{when}. Σημειώθηκε! ✍️',
		efc_ur_later_c: 'Χωρίς βιασύνη! 😌 Μου αρέσει αυτό.|Ήρεμα! 🧘 Η αναμονή αποδίδει.|Με την ησυχία σας! 🐢 Τα καλά έρχονται στους αποταμιευτές.',
		efc_recap_c: 'Εντάξει, να το πω πίσω για να είμαστε στην ίδια σελίδα! 📝|Γρήγορος έλεγχος πριν από τη μαγεία! ✨|Στάσου, το κατάλαβα σωστά; 🧐',
		efc_right_c: 'Το κατάλαβα σωστά;|Όλα καλά;|Έτοιμοι;',
		efc_changed_c: 'Έγινε, άλλαξε! ✏️|Ενημερώθηκε! 🔧 Καλύτερα;|Το διόρθωσα! 🛠️',
		efc_fix_c: 'Κανένα πρόβλημα! ✏️ Τι να αλλάξω; Π.χ. «είναι 1250» ή «σε 3 εβδομάδες».|Ωχ! 🙈 Τι δεν πάει καλά; Γράψτε το σωστό.|Βεβαίως! 🔧 Πείτε μου τι να διορθώσω.',
		efc_close_c: 'Τέλεια, τα έχω όλα! 🎬 Ένα δευτερόλεπτο, κάνω τη δουλειά μου!|Ναι, τελείωσαν οι ερωτήσεις! 🙌 Περιμένετε, επεξεργάζομαι αριθμούς!|Αυτό ήταν! 🤝 Επιστρέφω με την πλήρη εικόνα.',
		efc_think_c: 'Επεξεργάζομαι αριθμούς σούπερ γρήγορα… ⚡|Τα ελέγχω όλα δύο φορές… 👀|Κάνω τα μαθηματικά για εσάς… 🧮|Φορτώνω την καλύτερη μέρα σας… 📶',
		efc_res_best_c: 'ΝΑΙ! 🎉 Μπορείτε να το κάνετε άνετα!|Πράσινο φως! 🟢 Τα λεφτά σας λένε ναι!|Σας το είπα! 😎 Αυτό δουλεύει.',
		efc_res_best_c_n: 'ΝΑΙ {name}! 🎉 Μπορείτε να το κάνετε άνετα!|{name}, πράσινο φως! 🟢',
		efc_res_good_c: 'Φαίνεται καλό! 🙂 Χωράει, με λίγο πιο λεπτό μαξιλάρι.|Σχεδόν πράσινο! 🌿 Γίνεται, με λίγη προσοχή.',
		efc_res_tight_c: 'Χμ, γίνεται, αλλά θα το νιώσετε! 🤏|Στενά, αλλά όχι αδύνατο! 😬',
		efc_res_avoid_c: 'Όχι σήμερα! ✋ Αλλά δείτε, βρήκα καλύτερες μέρες!|Ουάου, σήμερα θα πονούσε! 🙈 Δείτε το ημερολόγιο!|Ηρεμία! 🐯 Όχι σήμερα, αλλά σύντομα!',
		efc_res_none_c: 'Έψαξα παντού! 🕵️ Καμία ασφαλής μέρα σε 4 μήνες, αλλά έχω ιδέες!|Ειλικρινής απάντηση: όχι ακόμα! 🌱 Να σας δείξω γιατί και τι βοηθά.',
		efc_res_none_c_n: '{name}, έψαξα παντού! 🕵️ Καμία ασφαλής μέρα ακόμα, αλλά έχω ιδέες!',
		efc_pc_joke: 'Γιατί το κινητό πήγε σχολείο; 📱 Για να γίνει πιο έξυπνο!|Πώς λέγεται ένα ρομπότ που αγαπά τον χορό; 🕺 Μπούγκι-μποτ… στάσου, αυτό είναι του Boogie!|Γιατί κρύωνε ο υπολογιστής; 🥶 Άφησε τα Windows ανοιχτά!|Τι είπε η μπαταρία στον φορτιστή; 🔋 Με συμπληρώνεις!|Γιατί διέσχισε το emoji τον δρόμο; 😂 Για να φτάσει στην άλλη διαφάνεια!|Γιατί το ρομπότ δεν φοβόταν ποτέ; 🤖 Έχει νεύρα από ατσάλι!',
		efc_q_chip: 'Εδώ τις ερωτήσεις τις κάνω εγώ! 🔎 Είναι το αγαπημένο μου παιχνίδι.|Χε χε, όχι! 😎 Απαντώ μόνο σε μία ερώτηση: μπορείτε να το αντέξετε;|Ωχ, καλή! 🤔 Αλλά ξέρω μόνο για λεφτά.',
	} );
	Object.assign( window.EXPENITY_I18N.langs.en, {
		efLightTitle: 'Boogie’s light',
		efLightHint: 'Make his Nixie tube glow your way. The light falls on his body too.',
		efLightBright: 'Brightness',
		efLvl_low: 'Low', efLvl_normal: 'Normal', efLvl_high: 'High',
		efLightColor: 'Bulb',
		efLight_amber: 'Amber',
						efLight_green: 'Fluorescent green',
		efLight_blue: 'Blue',
				efLight_custom: 'Your own colour',
		efLightShort: 'Light',
	} );
	Object.assign( window.EXPENITY_I18N.langs.el, {
		efLightTitle: 'Το φως του Boogie',
		efLightHint: 'Κάντε τη λυχνία Nixie να λάμπει όπως θέλετε. Το φως πέφτει και στο σώμα του.',
		efLightBright: 'Φωτεινότητα',
		efLvl_low: 'Χαμηλή', efLvl_normal: 'Κανονική', efLvl_high: 'Υψηλή',
		efLightColor: 'Λάμπα',
		efLight_amber: 'Κεχριμπάρι',
						efLight_green: 'Φθορίζον πράσινο',
		efLight_blue: 'Μπλε',
				efLight_custom: 'Δικό σας χρώμα',
		efLightShort: 'Φως',
	} );
}() );
