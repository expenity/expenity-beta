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
		out.verdict = left >= cushion ? 'comfortable' : left >= 0 ? ( ( incomeMonthly > 0 && left + incomeMonthly >= monthly ) || left >= cushion / 2 ? 'ontrack' : 'tight' ) : ratio >= 0.6 ? 'atrisk' : 'unlikely';
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
	const MOODS = { comfortable: 'cheer', done: 'cheer', ontrack: 'happy', tight: 'meh', atrisk: 'worried', unlikely: 'worried', nodata: 'meh' };
	let gid = 0;
	/** A glossy floating robot with a glass screen face: hovers, waves, blinks, and changes its expression with the news. */
	F.mascot = ( verdict, size = 72 ) => {
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
	const pickLine = ( verdict ) => { const lines = t( 'ef_' + verdict ).split( '|' ); let i = Math.floor( Math.random() * lines.length ); if ( lines.length > 1 && lines[ i ] === lastLine[ verdict ] ) i = ( i + 1 ) % lines.length; lastLine[ verdict ] = lines[ i ]; return lines[ i ]; };
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
	EXA.efriendHome = () => {
		if ( ! on() ) return '';
		try { F.tickAlloc(); } catch ( e ) { /* ignore */ }
		const html = home0(), pr = proposalsHtml();
		if ( ! pr ) return html;
		return html ? html.replace( '<section data-home="efriend">', '<section data-home="efriend">' + pr ) : `<section data-home="efriend">${ pr }</section>`;
	};
	const home0 = () => {
		if ( ! ( S().device || {} ).efOnboard && ! navigator.webdriver && ! document.querySelector( '.ef-ob' ) ) { try { S().device.efOnboard = 1; EX.persist(); } catch ( e ) { /* ignore */ } setTimeout( () => EXA.efriendOnboard(), 600 ); }
		if ( F.due().length && ! navigator.webdriver && ! dueOpen && ! document.querySelector( '.ef-ob' ) && ! ( EXA.flow && EXA.flow.active && EXA.flow.active() ) ) setTimeout( () => EXA.efriendDue(), 900 );
		const f = pickGoal(); if ( f ) F.snapshot();
		if ( ! f ) {
			const g = F.plans()[ 0 ];
			return `<section data-home="efriend"><div class="ef-card ef-promo"><div class="ef-top">${ F.mascot( 'happy' ) }<div class="ef-bubble"><b>${ esc( t( 'efMeet' ) ) }</b>${ esc( g ? t( 'efPromoDate', { name: g.name } ) : t( 'efPromoWish' ) ) }</div></div>${ g ? '' : wishChips() }<div class="btn-row"><button type="button" class="btn btn-primary sm" data-ef-try="${ g ? esc( g.id ) : '' }">${ esc( g ? t( 'efAddDate' ) : t( 'efTry' ) ) }</button></div></div></section>`;
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
			return `<section data-home="efriend"><div class="sec-head"><h2>${ esc( t( 'efAllPlans' ) ) }</h2><span class="sec-acts">${ EXA.flipBtn( 'efriend' ) }</span></div>${ askBanner() }${ EXA.flipCard( 'efriend', front, back, 'fc-ef' ) }</section>`;
		}
		const g = f.goal, have = Math.max( 0, ( f.projectedFree || 0 ) + f.saved ), pct = f.done ? 100 : f.target ? Math.min( 100, Math.round( have / f.target * 100 ) ) : 0, label = { comfortable: 'Comfortable', ontrack: 'On track', tight: 'Tight', atrisk: 'At risk', unlikely: 'Unlikely', done: 'Done' }[ f.verdict ];
		const front = `<div class="ef-card ef-${ f.verdict }"><div class="ef-top">${ F.mascot( f.verdict ) }<div class="ef-bubble ef-tkb" data-ef-bubble="${ f.verdict }"><div class="ef-ticker"><span class="ef-tk">${ esc( pickLine( f.verdict ) ) }</span></div></div></div>
			<div class="ef-meta">${ chip( f.verdict ) }<span>${ esc( t( 'efDaysLeft', { n: Math.max( 0, f.days ) } ) ) }</span></div>
			<div class="ef-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${ pct }"><i style="width:${ pct }%"></i><span class="ef-suit" style="left:${ pct }%">${ UI.icon( g.icon || 'plane', 18 ) }</span></div>
			<small>${ esc( f.left < 0 ? t( 'efShortLine', { a: money( -f.left / 100, main() ) } ) : t( 'efLeftLine', { a: money( f.left / 100, main() ), m: monthsText( f.leftMonths == null ? 0 : f.leftMonths ) } ) ) }</small></div>`;
		const back = `<div class="wk-back ef-back"><span class="wk-ic bob">${ UI.icon( 'sparkles', 30 ) }</span><h3>${ esc( g.name ) }</h3>${ points( F.sentences( f ).concat( F.tips( f ).slice( 0, 1 ).map( ( x ) => x.text ) ) ) }<button type="button" class="btn btn-primary" data-ef-open="${ esc( g.id ) }">${ esc( t( 'efOpen' ) ) }</button><button type="button" class="btn btn-ghost sm" data-ef-edit="${ esc( g.id ) }">${ UI.icon( 'pencil', 18 ) } ${ esc( t( 'efEdit' ) ) }</button></div>`;
		return `<section data-home="efriend"><div class="sec-head"><h2>${ esc( g.name ) }</h2><span class="sec-acts">${ EXA.flipBtn( 'efriend' ) }</span></div>${ EXA.flipCard( 'efriend', front, back, 'fc-ef' ) }</section>`;
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
		const sec = ( em, title, body, det ) => ( body ? ( det ? `<details class="ef-sec ef-det"><summary><span class="ef-sec-em">${ em }</span><b>${ esc( title ) }</b></summary>${ body }</details>` : `<section class="ef-sec"><h3 class="ef-h"><span class="ef-sec-em">${ em }</span>${ esc( title ) }</h3>${ body }</section>` ) : '' );
		const tile = ( em, label, value, cls = '', sub = '' ) => `<div class="ef-tile ${ cls }"><span class="ef-tile-em" aria-hidden="true">${ em }</span><small>${ esc( label ) }</small><b>${ value }</b>${ sub ? `<small class="ef-tile-sub">${ esc( sub ) }</small>` : '' }</div>`;
		const free = ( f.projectedFree || 0 ) + f.saved;
		const tiles = f.verdict === 'done' ? '' : `<div class="ef-tiles">${ tile( '💶', t( 'efTileCost' ), esc( m( f.target ) ) ) }${ tile( '🏦', t( 'efTileFree' ), esc( m( free ) ), free < 0 ? 'bad' : '' ) }${ f.left < 0 ? tile( '⚠️', t( 'efTileShort' ), esc( m( -f.left ) ), 'bad' ) : tile( '🛟', t( 'efTileLeft' ), esc( m( f.left ) ), f.left >= f.cushion ? 'good' : '', f.leftMonths == null ? '' : monthsText( f.leftMonths ) ) }${ tile( '📅', t( 'efTileDays' ), String( Math.max( 0, f.days ) ) ) }</div><p class="ef-conf">🎚️ ${ esc( t( 'efConfidence' ) ) } <b>${ esc( t( 'efConf_' + f.confidence ) ) }</b></p>`;
		const er = ! f.done && ! f.late && RANK[ f.verdict ] < 4 ? F.earliest( g, f.reserved || 0 ) : undefined;
		const callouts = [ f.verdict === 'done' ? t( 'efDone' ) : f.late ? t( 'efLate' ) : '', f.reserved > 0 ? t( 'efAfter', { a: m( f.reserved ) } ) : '', f.overdue > 0 ? t( 'efOverdue', { a: m( f.overdue ) } ) : '',
			! f.done && ! f.late && f.left >= 0 && f.monthly > 0 ? t( 'efCover', { n: monthsText( f.leftMonths ), s: m( f.monthly ) } ) : '', ! f.done && ! f.late && f.left >= 0 && f.hasIncome ? ( f.incomeMonthly > 0 && f.left + f.incomeMonthly >= f.monthly ? t( 'efIncomeOk' ) : t( 'efIncomeNo' ) ) : '', ! f.done && ! f.late && ! f.hasIncome ? t( 'efNoIncomeAsk' ) : '',
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
		if ( rec && ! conv ) { delete rec.coach; Object.assign( rec, v ); } else if ( ! rec ) { rec = Object.assign( { id: EX.uid(), prio: F.plans().length + 1 }, v ); S().goals.push( rec ); }
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
		return `<svg class="ef-logo ${ cls }" viewBox="-4 -92 330 130" role="img" aria-label="eFriend">${ strokes }
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
			if ( id === 'limits' ) { const L = ( S().settings.targets || {} ).limits || {}; return `<h2>${ esc( t( 'efLimTitle' ) ) }</h2>${ para( 'efLimText' ) }<div class="ef-lim">${ [ [ 'day', 'efLimDay' ], [ 'week', 'efLimWeek' ], [ 'month', 'efLimMonth' ] ].map( ( [ k, lab ] ) => `<label class="f"><span>${ esc( t( lab ) ) } (${ esc( main() ) })</span><input data-lim="${ k }" inputmode="decimal" autocomplete="off" placeholder="0" value="${ esc( L[ k ] || '' ) }"></label>` ).join( '' ) }</div><div class="ef-lim-note">${ points( F.limitNotes() ) }</div><p class="muted small">${ esc( t( 'efLimSaved' ) ) }</p>`; }
			if ( id === 'wishes' ) return `<h2>${ esc( t( 'efWishTitle' ) ) }</h2>${ para( 'efWishText' ) }${ added.length ? points( [ t( 'efWishAdded', { names: added.join( ', ' ) } ) ] ) : '' }${ wishChips( wr.map( ( r ) => r.k ) ) }<button type="button" class="ef-wish ef-wish-other" data-ef-wish-other>＋ ${ esc( t( 'efWishOther' ) ) }</button><div class="ef-wish-rows">${ wr.map( ( r, n ) => `<div class="ef-wish-row" data-n="${ n }"><div class="ef-wish-head"><span>${ r.em }</span><input data-w="name" maxlength="60" autocomplete="off" placeholder="${ esc( t( 'efWishName' ) ) }" value="${ esc( r.name ) }"><button type="button" class="ef-wish-del" data-w-del aria-label="${ esc( t( 'efWishRemove' ) ) }">✕</button></div><div class="grid2"><label class="f"><span>${ esc( t( 'efPlanCost' ) ) } (${ esc( main() ) })</span><input data-w="cost" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${ esc( r.cost ) }"></label><label class="f"><span>${ esc( t( 'efPlanDate' ) ) }</span><input data-w="date" type="date" value="${ esc( r.date ) }"></label></div></div>` ).join( '' ) }</div>${ wErr ? `<p class="err">${ esc( t( 'efWishIncomplete' ) ) }</p>` : '' }`;
			if ( id === 'priority' ) { const list = F.all(); return `<h2>${ esc( t( 'efObPrioTitle' ) ) }</h2><div class="ef-shuf" aria-hidden="true"><span class="s1">✈️ ${ esc( t( 'efWishTrip' ) ) }</span><span class="s2">👟 ${ esc( t( 'efWishShoes' ) ) }</span><span class="s3"><i>🏆</i> 🚗 ${ esc( t( 'efWishCar' ) ) }</span></div>${ para( 'efObPrioText' ) }${ list.length > 1 ? prioList( list ) : '' }${ riskHtml() }`; }
			if ( id === 'moves' ) return `<h2>${ esc( t( 'efObMovesTitle' ) ) }</h2><div class="ef-moves-demo"><span class="ef-md-a">💰</span><span class="ef-md-ar">➜</span><span class="ef-md-b">🎯</span><span class="ef-md-ok">✋ ✅</span></div>${ para( 'efObMovesText' ) }<p class="muted small">${ esc( t( 'efObMovesLater' ) ) }</p>`;
			if ( id === 'budgets' ) return `<h2>${ esc( t( 'efObBudTitle' ) ) }</h2><div class="ef-bud-demo"><div class="ef-bud-card"><div class="ef-bud-top"><b>🍕 ${ esc( t( 'efObBudCat' ) ) }</b><span>${ money( 120, main() ) } / ${ esc( t( 'efObBudMonth' ) ) }</span></div><div class="ef-bar"><i class="ef-bud-fill"></i></div><div class="ef-bud-ok">✅ ${ esc( t( 'efObBudInside' ) ) }</div></div><div class="ef-bud-bot">${ F.mascot( 'cheer', 70 ) }<span class="ef-bud-gain">+${ money( 45, main() ) } ✈️</span></div></div>${ para( 'efObBudText' ) }`;
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
		document.body.appendChild( ov ); document.body.classList.add( 'ef-ob-open' ); draw();
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
		const sec = ( em, title, body ) => ( body ? `<section class="ef-sec"><h3 class="ef-h"><span class="ef-sec-em">${ em }</span>${ esc( title ) }</h3>${ body }</section>` : '' );
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
			return `<li class="ef-grow"><div class="ef-gtop">${ f ? F.mascot( f.verdict, 40 ) : UI.icon( g.icon || 'target', 28 ) }<div><b>${ esc( g.name ) }</b><small>${ esc( g.deadline ? t( 'efDaysLeft', { n: Math.max( 0, diff( g.deadline, today() ) ) } ) : t( 'efNoDate' ) ) }</small></div>${ f ? chip( f.verdict ) : '' }</div>
				<div class="ef-gacts"><button type="button" class="btn btn-ghost sm" data-ef-edit="${ esc( g.id ) }">${ UI.icon( 'pencil', 18 ) } ${ esc( t( 'efEdit' ) ) }</button>${ ready ? `<button type="button" class="btn btn-primary sm" data-ef-open="${ esc( g.id ) }">${ esc( t( 'efOpen' ) ) }</button>` : `<button type="button" class="btn btn-primary sm" data-ef-try="${ esc( g.id ) }">${ esc( t( 'efAddDate' ) ) }</button>` }</div></li>`;
		};
		const buckets = F.groups().map( ( n ) => ( { name: n, plans: plans.filter( ( g ) => ( g.group || '' ).trim() === n ) } ) ), rest = plans.filter( ( g ) => ! ( g.group || '' ).trim() );
		if ( rest.length ) buckets.push( { name: '', plans: rest } );
		const overview = all.length > 1 ? ( ( sm ) => `<section class="card ef-overview"><div class="ef-top">${ F.mascot( sm.verdict, 64 ) }<div class="ef-bubble"><b>${ esc( t( 'efOverviewTitle' ) ) }</b>${ chip( sm.verdict ) }<small>${ esc( t( 'efTogether', { a: m( sm.cost ), b: m( sm.free ) } ) ) }</small></div></div><div class="btn-row"><button type="button" class="btn btn-primary" data-ef-all="">${ esc( t( 'efOpen' ) ) }</button></div></section>` )( F.summary( all ) ) : '';
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
		return `<section class="card ef-page"><div class="ef-top">${ F.mascot( 'happy', 84 ) }<div class="ef-bubble"><b>${ esc( t( 'efMeet' ) ) }</b></div></div>${ para( 'efMeetText' ) }</section>
			${ proposalsHtml() }${ overview }${ achievements }${ askBanner() ? `<section class="card">${ askBanner() }</section>` : '' }${ all.length > 1 ? `<section class="card"><h2>🏆 ${ esc( t( 'efPrioSection' ) ) }</h2>${ para( 'efPrioTextShort' ) }${ prioList( all ) }<div class="btn-row"><button type="button" class="btn btn-ghost" data-ef-suggest>✨ ${ esc( t( 'efSuggestOrder' ) ) }</button></div></section>` : '' }${ all.length ? `<section class="card">${ riskHtml() }</section>` : '' }${ buckets.length ? buckets.map( section ).join( '' ) : `<section class="card"><h2>${ esc( t( 'efYourGoals' ) ) }</h2><p class="muted">${ esc( t( 'efNoGoals' ) ) }</p></section>` }
			${ allocCard() }${ pastHtml }<section class="card"><div class="btn-row"><button type="button" class="btn btn-primary" data-ef-new>${ UI.icon( 'plus', 20 ) } ${ esc( t( 'efNewGoal' ) ) }</button></div></section>
			<section class="card"><label class="fx-row"><span class="mid"><b>${ esc( t( 'efSoundTitle' ) ) }</b><small>${ esc( t( 'efSoundHint' ) ) }</small></span><span class="switch"><input type="checkbox" data-ef-sound${ S().settings.efSound !== false ? ' checked' : '' } aria-label="${ esc( t( 'efSoundTitle' ) ) }"><i></i></span></label></section>
			<section class="card"><div class="list mlist"><button type="button" class="mrow" data-ef-sort>${ UI.ci( 'adjustments-horizontal', 'teal', 40 ) }<span class="mid"><b>${ esc( t( 'efSortTitle' ) ) }</b><small>${ esc( t( 'efSortSub' ) ) }</small></span>${ UI.icon( 'chevron-right', 18 ) }</button><button type="button" class="mrow" data-ef-intro>${ UI.ci( 'player-play', 'purple', 40 ) }<span class="mid"><b>${ esc( t( 'efReplay' ) ) }</b><small>${ esc( t( 'efReplaySub' ) ) }</small></span>${ UI.icon( 'chevron-right', 18 ) }</button></div></section>`;
	};
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
		return { monthly: Math.round( ( spend / win ) * 30 + b30 ), incomeMonthly: Math.round( i30 + ( other / win ) * 0.7 * 30 ), hasIncome: S().incomes.length > 0 || other > 0, history: Math.max( 1, diff( now, first ) + 1 ) };
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
		return `<div class="ef-risk" style="--c:${ colorAt( p ) };--p:${ p }%"><div class="ef-risk-h"><b>🎚️ ${ esc( t( 'efRiskTitle' ) ) }</b><span class="ef-risk-val">${ esc( riskWord( p ) ) } · ${ esc( monthsShort( m ) ) }</span></div><input type="range" class="ef-grad" data-ef-margin min="0" max="100" step="1" value="${ p }" aria-label="${ esc( t( 'efRiskTitle' ) ) }"><div class="ef-risk-ends"><span class="e0">${ esc( t( 'efRiskRisky' ) ) }</span><span class="e40">${ esc( t( 'efRiskBalanced' ) ) }</span><span class="e100">${ esc( t( 'efRiskVerySafe' ) ) }</span></div><div class="ef-risk-hint">${ points( riskLines( p, m ) ) }${ F.baseline().hasIncome ? '' : `<button type="button" class="btn btn-ghost sm" data-ef-income>💶 ${ esc( t( 'efAddIncome' ) ) }</button>` }</div></div>`;
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
		if ( e.target.closest( '[data-ef-suggest]' ) ) { F.setOrder( F.suggestOrder() ); return; }
		if ( e.target.closest( '[data-ef-prio-done]' ) ) { S().settings.efAsked = F.sig(); S().settings.u = Date.now(); EX.save(); UI.closeSheet(); }
	} );
	document.addEventListener( 'input', ( e ) => { const r = e.target.matches && e.target.matches( '[data-ef-margin]' ) ? e.target : null; if ( ! r ) return; const p = Number( r.value ), m = monthsAt( p ), box = r.closest( '.ef-risk' ); box.style.setProperty( '--c', colorAt( p ) ); box.style.setProperty( '--p', p + '%' ); box.querySelector( '.ef-risk-val' ).textContent = riskWord( p ) + ' · ' + monthsShort( m ); const hint = box.querySelector( '.ef-risk-hint' ), btn = hint.querySelector( 'button' ); hint.innerHTML = points( riskLines( p, m ) ); if ( btn ) hint.appendChild( btn ); } );
	document.addEventListener( 'change', ( e ) => { if ( e.target.matches && e.target.matches( '[data-ef-margin]' ) ) { S().settings.efCushion = monthsAt( Number( e.target.value ) ); S().settings.u = Date.now(); EX.save(); } } );
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
		tut_efriend_1: 'Open **More**, then **eFriend**.', tut_efriend_2: 'Tap **New plan with eFriend**, then enter what you are planning, how much it will cost and the date.', tut_efriend_3: 'Choose the wallets it can use. On Home, tap **Full analysis** to see whether you can afford it, what would help, and how your spending is sorted.',
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
		tut_efriend_1: 'Ανοίξτε το **Περισσότερα** και μετά το **eFriend**.', tut_efriend_2: 'Πατήστε **Νέο σχέδιο με το eFriend** και συμπληρώστε τι σχεδιάζετε, πόσο θα κοστίσει και την ημερομηνία.', tut_efriend_3: 'Διαλέξτε τα πορτοφόλια που μπορεί να χρησιμοποιήσει. Στην Αρχική, πατήστε **Πλήρης ανάλυση** για να δείτε αν μπορείτε να το αντέξετε, τι θα βοηθούσε και πώς ταξινομούνται τα έξοδά σας.',
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
}() );
