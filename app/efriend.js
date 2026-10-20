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
	F.plans = () => S().goals.filter( isPlan );
	F.goals = () => ( on() ? F.plans().filter( ( g ) => g.deadline ) : [] );
	F.forecast = ( goal ) => {
		const now = today(), end = goal.deadline, days = diff( end, now );
		const linked = goal.linkedGoal && S().goals.find( ( x ) => x.id === goal.linkedGoal && ! isPlan( x ) ), saved = linked && EX.plan ? EX.plan.saved( linked ) : 0, target = EX.cents( goal.target ), remaining = Math.max( 0, target - saved );
		const wallets = ( goal.wallets && goal.wallets.length ? goal.wallets.map( ( id ) => EX.account( id ) ).filter( Boolean ) : EX.activeAccounts() );
		const out = { goal, days, saved, target, remaining, wallets, done: remaining === 0 };
		if ( out.done ) { out.verdict = 'done'; return out; }
		if ( days <= 0 ) { out.verdict = 'unlikely'; out.late = true; out.projectedFree = 0; out.gap = remaining; out.confidence = 'low'; return out; }
		const balance = EX.mainCents( wallets.map( ( a ) => ( { amount: EX.balance( a ) / 100, currency: a.currency } ) ) );
		// Habits: the last 90 days (at least 14), without goal money, transfers and bill payments (bills are counted from their own schedule).
		const txs = S().txs.filter( ( x ) => x.type !== 'transfer' && ! x.goalId ), first = txs.reduce( ( m, x ) => ( x.date < m ? x.date : m ), now );
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
		const buffer = Math.round( ( ( level.must + level.need ) / days ) * 7 );
		const spend = level.must + level.need + level.want;
		const projectedFree = balance + incomeSched + incomeOther - billsDue - spend - buffer;
		const ratio = remaining ? projectedFree / remaining : 9;
		out.verdict = ratio >= 1.25 ? 'comfortable' : ratio >= 1 ? 'ontrack' : ratio >= 0.75 ? 'tight' : ratio >= 0.4 ? 'atrisk' : 'unlikely';
		Object.assign( out, { balance, incomeSched, incomeOther, billsDue, overdue, spend, level, buffer, projectedFree, gap: Math.max( 0, remaining - projectedFree ), extra: Math.max( 0, projectedFree - remaining ), ratio, bills, cats, perWeek: Math.ceil( remaining / Math.max( 1, days / 7 ) ), win } );
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
		out.mustList = bills.filter( ( x ) => x.level === 'must' ).sort( ( a, b ) => ( a.d < b.d ? -1 : 1 ) ).slice( 0, 6 );
		return out;
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

	/* Poke it: a click smiles and waves, a few giggle, many make it angry and shake. */
	const pokes = new WeakMap();
	document.addEventListener( 'click', ( e ) => {
		const m = e.target.closest && e.target.closest( '.ef-mascot' ); if ( ! m ) return;
		e.preventDefault(); e.stopPropagation();
		const now = performance.now(), st = pokes.get( m ) || { t: [], timer: 0 }; pokes.set( m, st );
		st.t = st.t.filter( ( x ) => now - x < 2500 ); st.t.push( now );
		const n = st.t.length, cls = n >= 5 ? 'angry' : n >= 3 ? 'giggle' : 'smile';
		m.classList.remove( 'ef-poke-smile', 'ef-poke-giggle', 'ef-poke-angry' ); void m.getBoundingClientRect(); m.classList.add( 'ef-poke-' + cls );
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
		if ( f.overdue > 0 ) out.push( t( 'efOverdue', { a: m( f.overdue ) } ) );
		const s = f.suggestions && f.suggestions[ 0 ]; if ( f.gap > 0 && s ) out.push( s.kind === 'cut' ? t( 'efTipCut', { name: EX.catInfo( s.cat ).name, a: m( s.gain ) } ) : t( 'efTipPause', { name: s.name, a: m( s.gain ) } ) );
		return out;
	};

	/* ------------------------------------------------------------------ Home widget */
	const pickGoal = () => { const l = F.goals().map( ( g ) => F.forecast( g ) ); if ( ! l.length ) return null; const rank = { unlikely: 0, atrisk: 1, tight: 2, ontrack: 3, comfortable: 4, done: 5 }; return l.sort( ( a, b ) => ( rank[ a.verdict ] - rank[ b.verdict ] ) || ( a.days - b.days ) )[ 0 ]; };
	EXA.efriendHome = () => {
		if ( ! on() ) return '';
		if ( ! ( S().device || {} ).efOnboard && ! navigator.webdriver && ! document.querySelector( '.ef-ob' ) ) { try { S().device.efOnboard = 1; EX.persist(); } catch ( e ) { /* ignore */ } setTimeout( () => EXA.efriendOnboard(), 600 ); }
		const f = pickGoal();
		if ( ! f ) {
			const g = F.plans()[ 0 ];
			return `<section data-home="efriend"><div class="ef-card ef-promo"><div class="ef-top">${ F.mascot( 'happy' ) }<div class="ef-bubble"><b>${ esc( t( 'efMeet' ) ) }</b>${ esc( g ? t( 'efPromoDate', { name: g.name } ) : t( 'efPromo' ) ) }<button type="button" class="btn btn-primary sm" data-ef-try="${ g ? esc( g.id ) : '' }">${ esc( g ? t( 'efAddDate' ) : t( 'efTry' ) ) }</button></div></div></div></section>`;
		}
		if ( ! EXA.flipCard ) return '';
		const g = f.goal, have = Math.max( 0, ( f.projectedFree || 0 ) + f.saved ), pct = f.done ? 100 : f.target ? Math.min( 100, Math.round( have / f.target * 100 ) ) : 0, label = { comfortable: 'Comfortable', ontrack: 'On track', tight: 'Tight', atrisk: 'At risk', unlikely: 'Unlikely', done: 'Done' }[ f.verdict ];
		const front = `<div class="ef-card ef-${ f.verdict }"><div class="ef-top">${ F.mascot( f.verdict ) }<div class="ef-bubble" data-ef-bubble="${ f.verdict }"><b>${ esc( pickLine( f.verdict ) ) }</b></div></div>
			<div class="ef-meta"><span class="ef-chip">${ label }</span><span>${ esc( t( 'efDaysLeft', { n: Math.max( 0, f.days ) } ) ) }</span></div>
			<div class="ef-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${ pct }"><i style="width:${ pct }%"></i><span class="ef-suit" style="left:${ pct }%">${ UI.icon( g.icon || 'plane', 18 ) }</span></div>
			<small>${ esc( t( 'efFreeOf', { a: money( have / 100, main() ), b: money( f.target / 100, main() ) } ) ) }</small></div>`;
		const back = `<div class="wk-back ef-back"><span class="wk-ic bob">${ UI.icon( 'sparkles', 30 ) }</span><h3>${ esc( g.name ) }</h3>${ F.sentences( f ).map( ( x ) => `<p class="wk-line">${ esc( x ) }</p>` ).join( '' ) }<button type="button" class="btn btn-primary" data-ef-open="${ esc( g.id ) }">${ esc( t( 'efOpen' ) ) }</button><button type="button" class="btn btn-ghost sm" data-ef-edit="${ esc( g.id ) }">${ UI.icon( 'pencil', 18 ) } ${ esc( t( 'efEdit' ) ) }</button></div>`;
		return `<section data-home="efriend"><div class="sec-head"><h2>${ esc( g.name ) }</h2><span class="sec-acts">${ EXA.flipBtn( 'efriend' ) }</span></div>${ EXA.flipCard( 'efriend', front, back, 'fc-ef' ) }</section>`;
	};

	/* ------------------------------------------------------------------ Full analysis */
	EXA.openEfriend = ( id ) => {
		const g = S().goals.find( ( x ) => x.id === id ); if ( ! g ) return;
		const f = F.forecast( g ), m = ( c ) => money( c / 100, main() ), label = { comfortable: 'Comfortable', ontrack: 'On track', tight: 'Tight', atrisk: 'At risk', unlikely: 'Unlikely', done: 'Done' }[ f.verdict ];
		const why = ( k ) => t( 'efWhy_' + k ) || t( 'efWhy_must' );
		const mustRows = ( f.mustList || [] ).map( ( x ) => `<li><div><b>${ esc( x.b.name ) }</b><small>${ esc( why( x.why ) ) }</small></div><span>${ x.late ? '<i class="ef-late">Overdue</i> ' : '' }${ esc( m( x.c ) ) }</span></li>` ).join( '' );
		const suggRows = ( f.suggestions || [] ).map( ( s ) => `<li><div><b>${ esc( s.kind === 'cut' ? t( 'efCutLabel', { name: EX.catInfo( s.cat ).name } ) : t( 'efPauseLabel', { name: s.name } ) ) }</b></div><span class="ef-gain">+${ esc( m( s.gain ) ) }</span></li>` ).join( '' );
		const catRows = ( f.cats || [] ).slice( 0, 8 ).map( ( c ) => `<li><div><b>${ esc( EX.catInfo( c.cat ).name ) }</b></div><div class="ef-tri" role="group" aria-label="${ esc( EX.catInfo( c.cat ).name ) }">${ [ 'must', 'need', 'want' ].map( ( l ) => `<button type="button" data-ef-level="${ esc( c.cat ) }" data-ef-to="${ l }" aria-pressed="${ c.level === l }" class="${ c.level === l ? 'on ' : '' }ef-l-${ l }">${ esc( t( 'ef_lvl_' + l ) ) }</button>` ).join( '' ) }</div></li>` ).join( '' );
		const alt = [];
		if ( f.gap > 0 ) { if ( f.affordable >= f.target * 0.1 ) alt.push( t( 'efAltSmaller', { a: m( Math.round( f.affordable ) ), p: Math.min( 99, Math.round( ( 1 - f.affordable / f.target ) * 100 ) ) } ) ); if ( f.laterDays ) alt.push( t( 'efAltLater', { d: EX.dayName( addDays( g.deadline, f.laterDays ) ) } ) ); }
		UI.openSheet( `<div class="sheet-head"><h2>${ esc( g.name ) }</h2><span class="sp"></span><button type="button" class="ab-btn" data-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button></div>
			<div class="sheet-pad ef-sheet"><div class="ef-editrow"><button type="button" class="btn btn-ghost sm" data-ef-edit="${ esc( id ) }">${ UI.icon( 'pencil', 18 ) } ${ esc( t( 'efEdit' ) ) }</button></div><div class="ef-top">${ F.mascot( f.verdict, 84 ) }<div class="ef-bubble"><b>${ esc( pickLine( f.verdict ) ) }</b><span class="ef-chip">${ label }</span></div></div>
			${ f.verdict === 'done' ? '' : `<ul class="ef-kv"><li><span>${ esc( t( 'efStillNeed' ) ) }</span><b>${ esc( m( f.remaining ) ) }</b></li><li><span>${ esc( t( 'efProjected' ) ) }</span><b>${ esc( m( Math.max( 0, f.projectedFree || 0 ) ) ) }</b></li><li><span>${ esc( t( 'efDays' ) ) }</span><b>${ Math.max( 0, f.days ) }</b></li><li><span>${ esc( t( 'efConfidence' ) ) }</span><b>${ esc( t( 'efConf_' + f.confidence ) ) }</b></li></ul>` }
			${ F.sentences( f ).map( ( s ) => `<p class="wk-line">${ esc( s ) }</p>` ).join( '' ) }
			${ suggRows ? `<h3>${ esc( t( 'efHelps' ) ) }</h3><ul class="ef-list">${ suggRows }</ul><p class="muted small">${ esc( t( 'efHelpsNote', { a: m( f.gain ) } ) ) }</p>` : '' }
			${ alt.length ? `<h3>${ esc( t( 'efOtherWays' ) ) }</h3>${ alt.map( ( a ) => `<p class="wk-line">${ esc( a ) }</p>` ).join( '' ) }` : '' }
			${ mustRows ? `<h3>${ esc( t( 'efMustTitle' ) ) }</h3><ul class="ef-list">${ mustRows }</ul>` : '' }
			${ catRows ? `<h3>${ esc( t( 'efSortTitle' ) ) }</h3><p class="muted small">${ esc( t( 'efSortText' ) ) }</p><ul class="ef-list">${ catRows }</ul>` : '' }
			<button type="button" class="btn btn-ghost wide" data-ef-redo="${ esc( id ) }">${ esc( t( 'efRedo' ) ) }</button><p class="muted small">${ esc( t( 'efDisclaimer' ) ) }</p></div>`, { tall: true } );
		document.querySelector( '.ef-sheet' ).addEventListener( 'click', ( e ) => { const s = e.target.closest( '[data-ef-to]' ); if ( ! s ) return; const o = S().settings.importance = S().settings.importance || {}; o[ 'cat:' + s.dataset.efLevel ] = s.dataset.efTo; S().settings.u = Date.now(); EX.save(); EXA.openEfriend( id ); EXA.render(); } );
	};
	document.addEventListener( 'click', ( e ) => { const ed = e.target.closest( '[data-ef-edit]' ); if ( ed ) { e.preventDefault(); e.stopImmediatePropagation(); const g = S().goals.find( ( x ) => x.id === ed.dataset.efEdit ); if ( g ) { UI.closeSheet(); setTimeout( () => EXA.openEfPlan( g ), 220 ); } return; } const tr = e.target.closest( '[data-ef-try]' ); if ( tr ) { e.preventDefault(); EXA.openEfPlan( S().goals.find( ( x ) => x.id === tr.dataset.efTry ) ); return; } const r = e.target.closest( '[data-ef-redo]' ); if ( r ) { UI.closeSheet(); setTimeout( () => EXA.efriendOnboard( r.dataset.efRedo, 'sort' ), 200 ); return; } const b = e.target.closest( '[data-ef-open]' ); if ( b ) { e.preventDefault(); e.stopImmediatePropagation(); EXA.openEfriend( b.dataset.efOpen ); } }, true );

	/* ------------------------------------------------------------------ The plan form */
	const PLAN_ICONS = [ 'plane', 'beach', 'gift', 'car', 'home', 'heart', 'school', 'device-laptop', 'rocket', 'trophy' ];
	EXA.openEfPlan = ( p ) => {
		const ws = EX.writableAccounts(), chosen = p && p.wallets && p.wallets.length ? p.wallets : ws.map( ( w ) => w.id );
		const goals = S().goals.filter( ( x ) => ! isPlan( x ) ), v = p || { name: '', target: '', deadline: '', icon: 'plane' };
		const X = `<button type="button" class="ab-btn" data-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button>`;
		UI.openSheet( `<div class="sheet-head">${ X }<h2 id="sheetTitle">${ esc( t( p ? 'efPlanEdit' : 'efPlanNew' ) ) }</h2><span class="sp"></span></div>
			<form id="efPlanForm" novalidate class="sheet-pad"><div class="ef-intro"><span class="ef-mini">${ F.mascot( 'happy', 44 ) }</span><div><small>${ esc( t( 'efMeetText' ) ) }</small></div></div>
			<label class="f"><span>${ esc( t( 'efPlanName' ) ) }</span><input name="pname" maxlength="60" autocomplete="off" placeholder="${ esc( t( 'efPlanNamePh' ) ) }" value="${ esc( v.name ) }"></label>
			<div class="grid2"><label class="f"><span>${ esc( t( 'efPlanCost' ) ) } (${ esc( main() ) })</span><input name="pcost" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${ esc( v.target ) }"></label>
			<label class="f"><span>${ esc( t( 'efPlanDate' ) ) }</span><input name="pdate" type="date" value="${ esc( v.deadline || '' ) }"></label></div>
			<div class="lbl">${ esc( t( 'goalIcon' ) ) }</div><div class="icon-pick" id="efIcons">${ PLAN_ICONS.map( ( n ) => `<button type="button" class="ipick${ v.icon === n ? ' on' : '' }" data-ef-icon="${ n }" aria-label="${ n }">${ UI.icon( n, 22 ) }</button>` ).join( '' ) }</div><input type="hidden" name="picon" value="${ esc( v.icon || 'plane' ) }">
			<div class="lbl">${ esc( t( 'efPlanWallets' ) ) }</div><div class="chips wrap">${ ws.map( ( w ) => `<label class="chip ef-wallet"><input type="checkbox" name="gw" value="${ esc( w.id ) }"${ chosen.includes( w.id ) ? ' checked' : '' }> ${ esc( EX.accountName( w ) ) }</label>` ).join( '' ) }</div>
			${ goals.length ? `<label class="f"><span>${ esc( t( 'efPlanLink' ) ) }</span><select name="plink"><option value="">${ esc( t( 'efPlanLinkNone' ) ) }</option>${ goals.map( ( g ) => `<option value="${ esc( g.id ) }"${ p && p.linkedGoal === g.id ? ' selected' : '' }>${ esc( g.name ) }</option>` ).join( '' ) }</select><small class="muted">${ esc( t( 'efPlanLinkHint' ) ) }</small></label>` : '' }
			<p class="err" id="efErr" role="alert" hidden></p>
			<div class="btn-row sticky-actions">${ p ? `<button type="button" class="btn btn-danger" data-ef-del="${ esc( p.id ) }">${ esc( t( 'del' ) ) }</button>` : '' }<span class="sp"></span><button type="submit" class="btn btn-primary">${ esc( t( 'saveTx' ) ) }</button></div></form>` );
		document.getElementById( 'efPlanForm' ).dataset.id = p ? p.id : '';
	};
	document.addEventListener( 'click', ( e ) => {
		const ic = e.target.closest( '[data-ef-icon]' ); if ( ic ) { const f = ic.closest( 'form' ); f.elements.picon.value = ic.dataset.efIcon; f.querySelectorAll( '[data-ef-icon]' ).forEach( ( b ) => b.classList.toggle( 'on', b === ic ) ); return; }
		const del = e.target.closest( '[data-ef-del]' ); if ( del ) { S().goals = S().goals.filter( ( g ) => g.id !== del.dataset.efDel ); S().settings.u = Date.now(); EX.save(); UI.closeSheet(); EXA.render(); }
	} );
	document.addEventListener( 'submit', ( e ) => {
		const f = e.target; if ( f.id !== 'efPlanForm' ) return; e.preventDefault();
		const el = f.elements, err = ( k ) => { const p = document.getElementById( 'efErr' ); p.textContent = t( k ); p.hidden = false; return false; };
		const name = el.pname.value.trim(), cost = num( el.pcost.value ), date = el.pdate.value, wallets = [ ...f.querySelectorAll( '[name=gw]:checked' ) ].map( ( x ) => x.value );
		if ( ! name ) return err( 'efNeedName' ); if ( ! ( cost > 0 ) ) return err( 'efNeedCost' ); if ( ! date || date <= today() ) return err( 'efNeedFuture' ); if ( ! wallets.length ) return err( 'efNeedWallet' );
		const v = { name, target: String( cost ), deadline: date, icon: el.picon.value || 'plane', wallets, linkedGoal: el.plink ? el.plink.value : '', kind: 'efriend' }, id = f.dataset.id;
		let rec = id && S().goals.find( ( g ) => g.id === id ); if ( rec ) { delete rec.coach; Object.assign( rec, v ); } else { rec = Object.assign( { id: EX.uid() }, v ); S().goals.push( rec ); }
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
		d.innerHTML = `<div class="ef-intro-card">${ F.logoWord( 'play' ) }<div class="ef-hop">${ F.mascot( 'cheer', 96 ) }</div><p>${ esc( t( 'efMeetText' ) ) }</p><button type="button" class="btn btn-primary">${ esc( t( 'tutDone' ) ) }</button></div>`;
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
		const steps = only === 'sort' ? [ 'sort' ] : [ 'meet', 'how', 'see', 'sort', 'where' ];
		let i = 0;
		const ov = document.createElement( 'div' ); ov.className = 'ef-ob'; ov.setAttribute( 'role', 'dialog' ); ov.setAttribute( 'aria-modal', 'true' ); ov.setAttribute( 'aria-label', 'eFriend' );
		const mock = ( kind ) => kind === 'see'
			? `<div class="ef-phone"><div class="ef-ph-bar"></div><div class="ef-ph-block short"></div><div class="ef-ph-block"></div>
				<div class="ef-ph-widget"><div class="ef-top">${ F.mascot( 'ontrack', 56 ) }<div class="ef-bubble ef-type"><b>${ esc( t( 'ef_ontrack' ).split( '|' )[ 0 ] ) }</b></div></div>
				<div class="ef-meta"><span class="ef-chip">On track</span><span>${ esc( t( 'efDaysLeft', { n: 112 } ) ) }</span></div><div class="ef-bar"><i class="ef-demo-fill"></i><span class="ef-suit ef-demo-suit">${ UI.icon( 'plane', 16 ) }</span></div></div>
				<div class="ef-ph-block"></div><div class="ef-ph-block short"></div></div>`
			: `<div class="ef-phone"><div class="ef-ph-title">${ esc( t( 'barMore' ) ) }</div><div class="ef-ph-row"></div><div class="ef-ph-row"></div><div class="ef-ph-row hot"><span class="ef-ph-ic">${ UI.icon( 'sparkles', 18 ) }</span><b>eFriend</b><i class="ef-tap"></i></div><div class="ef-ph-row"></div><div class="ef-ph-row"></div></div>`;
		const body = ( id ) => {
			if ( id === 'meet' ) return `${ F.logoWord( 'play' ) }<div class="ef-hop">${ F.mascot( 'cheer', 110 ) }</div><p>${ esc( t( 'efMeetText' ) ) }</p>`;
			if ( id === 'how' ) { const m = ( n ) => money( n, main() ), row = ( cls, k, v, i ) => `<li class="ef-how-${ cls }" style="--i:${ i }"><span>${ esc( t( k ) ) }</span><b>${ v }</b></li>`; return `<h2>${ esc( t( 'efObHowTitle' ) ) }</h2><ul class="ef-how">${ row( 'plus', 'efHowWallets', '+ ' + m( 900 ), 0 ) }${ row( 'plus', 'efHowIncome', '+ ' + m( 300 ), 1 ) }${ row( 'minus', 'efHowBills', '− ' + m( 300 ), 2 ) }${ row( 'minus', 'efHowSpend', '− ' + m( 350 ), 3 ) }${ row( 'total', 'efHowFree', '= ' + m( 550 ), 4 ) }<li class="ef-how-cmp" style="--i:5"><span>${ F.mascot( 'comfortable', 40 ) }</span><b>${ m( 550 ) } &gt; ${ m( 400 ) } ✓</b></li></ul><p>${ esc( t( 'efObHowText' ) ) }</p><p class="muted small">${ esc( t( 'efObHowLink' ) ) }</p>`; }
			if ( id === 'see' ) return `<h2>${ esc( t( 'efObSeeTitle' ) ) }</h2>${ mock( 'see' ) }<p>${ esc( t( 'efObSeeText' ) ) }</p>`;
			if ( id === 'where' ) return `<h2>${ esc( t( 'efObWhereTitle' ) ) }</h2>${ mock( 'where' ) }<p>${ esc( t( 'efObWhereText' ) ) }</p>`;
			const row = ( r ) => `<li data-ef-row="${ esc( r.cat ) }"><div><b>${ esc( EX.catInfo( r.cat ).name ) }</b>${ r.spent ? `<small>${ esc( money( r.spent / 100, main() ) ) }</small>` : '' }</div><div class="ef-tri" role="group" aria-label="${ esc( EX.catInfo( r.cat ).name ) }">${ LVL.map( ( l ) => `<button type="button" data-ef-set="${ l }" aria-pressed="${ pick[ r.cat ] === l }" class="${ pick[ r.cat ] === l ? 'on ' : '' }ef-l-${ l }">${ esc( t( 'ef_lvl_' + l ) ) }</button>` ).join( '' ) }</div></li>`;
			return `<div class="ef-top">${ F.mascot( 'happy', 72 ) }<div class="ef-bubble"><b>${ esc( t( 'efOnbHi' ) ) }</b></div></div><p class="muted small">${ esc( t( 'efSortText' ) ) }</p>${ rows.length ? `<ul class="ef-list">${ rows.map( row ).join( '' ) }</ul>` : `<p class="muted">${ esc( t( 'efNoSpend' ) ) }</p>` }`;
		};
		const finish = ( save ) => {
			if ( save && rows.length ) { const o = S().settings.importance = S().settings.importance || {}; rows.forEach( ( r ) => { if ( pick[ r.cat ] === r.auto ) delete o[ 'cat:' + r.cat ]; else o[ 'cat:' + r.cat ] = pick[ r.cat ]; } ); S().settings.u = Date.now(); EX.save(); }
			ov.remove(); document.body.classList.remove( 'ef-ob-open' ); EXA.render();
			if ( goalId ) setTimeout( () => EXA.openEfriend( goalId ), 250 );
			else if ( only !== 'sort' && ! F.plans().length ) setTimeout( () => EXA.openEfPlan(), 300 );
		};
		const draw = () => {
			const id = steps[ i ], last = i === steps.length - 1;
			ov.innerHTML = `<div class="ef-ob-head"><span class="ef-dots">${ steps.map( ( x, n ) => `<i class="${ n === i ? 'on' : n < i ? 'done' : '' }"></i>` ).join( '' ) }</span><button type="button" class="btn btn-ghost sm" data-ef-ob="skip">${ esc( t( 'efSkip' ) ) }</button></div>
				<div class="ef-ob-main ef-ob-${ id }" key="${ id }">${ body( id ) }</div>
				<div class="ef-ob-foot">${ i ? `<button type="button" class="btn btn-ghost" data-ef-ob="back">${ esc( t( 'back' ) ) }</button>` : '<span></span>' }<button type="button" class="btn btn-primary" data-ef-ob="next">${ esc( last ? t( only ? 'efOnbSave' : 'efLetsGo' ) : t( 'efNext' ) ) }</button></div>`;
			ov.querySelector( '.ef-ob-main' ).scrollTop = 0;
		};
		ov.addEventListener( 'click', ( e ) => {
			const b = e.target.closest( '[data-ef-ob]' ), sb = e.target.closest( '[data-ef-set]' );
			if ( sb ) { const li = sb.closest( '[data-ef-row]' ); pick[ li.dataset.efRow ] = sb.dataset.efSet; li.querySelectorAll( 'button' ).forEach( ( x ) => { const on = x === sb; x.classList.toggle( 'on', on ); x.setAttribute( 'aria-pressed', on ); } ); return; }
			if ( ! b ) return;
			if ( b.dataset.efOb === 'skip' ) finish( false );
			else if ( b.dataset.efOb === 'back' ) { i = Math.max( 0, i - 1 ); draw(); }
			else if ( i >= steps.length - 1 ) finish( true ); else { i++; draw(); }
		} );
		ov.addEventListener( 'touchmove', ( e ) => { const m = e.target.closest( '.ef-ob-main' ); if ( ! m || m.scrollHeight <= m.clientHeight + 1 ) e.preventDefault(); }, { passive: false } );
		document.body.appendChild( ov ); document.body.classList.add( 'ef-ob-open' ); draw();
	};

	/** New line in a bubble: fades out, swaps the text, fades back. */
	const refresh = ( b ) => { const el = b.querySelector( 'b' ); if ( ! el ) return; b.classList.add( 'swap' ); setTimeout( () => { el.textContent = pickLine( b.dataset.efBubble ); b.classList.remove( 'swap' ); }, 220 ); };
	setInterval( () => { if ( document.hidden ) return; document.querySelectorAll( '[data-ef-bubble]' ).forEach( ( b ) => { if ( b.getBoundingClientRect().height > 0 ) refresh( b ); } ); }, 9000 );
	document.addEventListener( 'click', ( e ) => { const b = e.target.closest( '[data-ef-bubble]' ); if ( b ) refresh( b ); } );

	/* ------------------------------------------------------------------ Its own page: More, eFriend */
	EXA.efriendPage = () => {
		const goals = F.plans(), lab = { comfortable: 'Comfortable', ontrack: 'On track', tight: 'Tight', atrisk: 'At risk', unlikely: 'Unlikely', done: 'Done' };
		const row = ( g ) => {
			const ready = g.coach && g.deadline, f = ready ? F.forecast( g ) : null;
			return `<li class="ef-grow"><div class="ef-gtop">${ f ? F.mascot( f.verdict, 40 ) : UI.icon( g.icon || 'target', 28 ) }<div><b>${ esc( g.name ) }</b><small>${ esc( g.deadline ? t( 'efDaysLeft', { n: Math.max( 0, diff( g.deadline, today() ) ) } ) : t( 'efNoDate' ) ) }</small></div>${ f ? `<span class="ef-chip">${ lab[ f.verdict ] }</span>` : '' }</div>
				<div class="ef-gacts"><button type="button" class="btn btn-ghost sm" data-ef-edit="${ esc( g.id ) }">${ UI.icon( 'pencil', 18 ) } ${ esc( t( 'efEdit' ) ) }</button>${ ready ? `<button type="button" class="btn btn-primary sm" data-ef-open="${ esc( g.id ) }">${ esc( t( 'efOpen' ) ) }</button>` : `<button type="button" class="btn btn-primary sm" data-ef-try="${ esc( g.id ) }">${ esc( g.coach ? t( 'efAddDate' ) : t( 'efTry' ) ) }</button>` }</div></li>`;
		};
		return `<section class="card ef-page"><div class="ef-top">${ F.mascot( 'happy', 84 ) }<div class="ef-bubble"><b>${ esc( t( 'efMeet' ) ) }</b>${ esc( t( 'efMeetText' ) ) }</div></div></section>
			<section class="card"><h2>${ esc( t( 'efYourGoals' ) ) }</h2>${ goals.length ? `<ul class="ef-list">${ goals.map( row ).join( '' ) }</ul>` : `<p class="muted">${ esc( t( 'efNoGoals' ) ) }</p>` }
			<div class="btn-row"><button type="button" class="btn btn-primary" data-ef-new>${ UI.icon( 'plus', 20 ) } ${ esc( t( 'efNewGoal' ) ) }</button></div></section>
			<section class="card"><div class="list mlist"><button type="button" class="mrow" data-ef-sort>${ UI.ci( 'adjustments-horizontal', 'teal', 40 ) }<span class="mid"><b>${ esc( t( 'efSortTitle' ) ) }</b><small>${ esc( t( 'efSortSub' ) ) }</small></span>${ UI.icon( 'chevron-right', 18 ) }</button><button type="button" class="mrow" data-ef-intro>${ UI.ci( 'player-play', 'purple', 40 ) }<span class="mid"><b>${ esc( t( 'efReplay' ) ) }</b><small>${ esc( t( 'efReplaySub' ) ) }</small></span>${ UI.icon( 'chevron-right', 18 ) }</button></div></section>`;
	};
	/** The eFriend panel on the More page: the robot, what it is doing, and a way in. */
	EXA.efriendPanel = () => {
		const l = F.goals().map( ( g ) => F.forecast( g ) ), worst = l.length ? l.sort( ( a, b ) => ( { unlikely: 0, atrisk: 1, tight: 2, ontrack: 3, comfortable: 4, done: 5 }[ a.verdict ] - { unlikely: 0, atrisk: 1, tight: 2, ontrack: 3, comfortable: 4, done: 5 }[ b.verdict ] ) )[ 0 ] : null;
		const sub = worst ? t( 'efPanelCoaching', { n: l.length } ) : t( 'efPanelNone' );
		return `<button type="button" class="card ef-panel" data-more="efriend" aria-label="eFriend">${ F.mascot( worst ? worst.verdict : 'happy', 56 ) }<span class="mid"><b>eFriend</b><small>${ esc( sub ) }</small></span>${ UI.icon( 'chevron-right', 20 ) }</button>`;
	};
	document.addEventListener( 'click', ( e ) => {
		if ( e.target.closest( '[data-ef-new]' ) ) { EXA.openEfPlan(); return; }
		if ( e.target.closest( '[data-ef-sort]' ) ) { EXA.efriendOnboard( null, 'sort' ); return; }
		if ( e.target.closest( '[data-ef-intro]' ) ) EXA.efriendOnboard();
	} );

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
		efEdit: 'Edit goal',
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
		efEdit: 'Επεξεργασία στόχου',
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
}() );
