/**
 * eFriend: a small animated companion that coaches a savings goal (the trip, the gift) against its date.
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
	F.goals = () => ( on() ? S().goals.filter( ( g ) => g.coach && g.deadline ) : [] );
	F.forecast = ( goal ) => {
		const now = today(), end = goal.deadline, days = diff( end, now );
		const saved = EX.plan ? EX.plan.saved( goal ) : 0, target = EX.cents( goal.target ), remaining = Math.max( 0, target - saved );
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
			<g class="ef-armL"><rect x="2" y="42" width="13" height="30" rx="6.5" transform="rotate(32 8 57)" fill="url(#${ id }a)" stroke="#c3cbd9" stroke-width="1.2"/></g>
			<g class="ef-armR"><rect x="105" y="42" width="13" height="30" rx="6.5" transform="rotate(-28 112 57)" fill="url(#${ id }a)" stroke="#c3cbd9" stroke-width="1.2"/></g>
			<path d="M24 26q-2-14 12-16 8 3 10 12zM96 26q2-14-12-16-8 3-10 12z" fill="url(#${ id }a)" stroke="#c3cbd9" stroke-width="1.2" stroke-linejoin="round"/>
			<path d="M30 22q0-7 8-8M90 22q0-7-8-8" fill="none" stroke="#0f766e" stroke-width="3" stroke-linecap="round"/>
			<rect x="14" y="18" width="92" height="70" rx="34" fill="url(#${ id }s)" stroke="#c3cbd9" stroke-width="1.2"/>
			<rect x="24" y="27" width="72" height="52" rx="24" fill="#13171f"/>
			<path d="M32 36q6-6 20-6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".22"/>
			<g class="ef-eyes">${ eyeL }${ eyeR }</g>${ brows }${ mouth }
			<path d="m52 84 4 4 8-9" fill="none" stroke="#ffc94d" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>${ extra }</g></svg>`;
	};

	/* ------------------------------------------------------------------ Words (funny on purpose) */
	const pickLine = ( verdict ) => { const lines = t( 'ef_' + verdict ).split( '|' ), d = parse( today() ); return lines[ ( d.getDate() + d.getMonth() ) % lines.length ]; };
	F.sentences = ( f ) => {
		if ( f.verdict === 'done' ) return [ t( 'efDone' ) ];
		if ( f.late ) return [ t( 'efLate' ) ];
		const m = ( c ) => money( c / 100, main() ), out = [ t( 'efNeedWeek', { a: m( f.perWeek ) } ) ];
		out.push( f.gap > 0 ? t( 'efShort', { a: m( f.gap ) } ) : t( 'efSpare', { a: m( f.extra ) } ) );
		if ( f.overdue > 0 ) out.push( t( 'efOverdue', { a: m( f.overdue ) } ) );
		const s = f.suggestions && f.suggestions[ 0 ]; if ( f.gap > 0 && s ) out.push( s.kind === 'cut' ? t( 'efTipCut', { name: EX.catInfo( s.cat ).name, a: m( s.gain ) } ) : t( 'efTipPause', { name: s.name, a: m( s.gain ) } ) );
		return out;
	};

	/* ------------------------------------------------------------------ Home widget */
	const pickGoal = () => { const l = F.goals().map( ( g ) => F.forecast( g ) ); if ( ! l.length ) return null; const rank = { unlikely: 0, atrisk: 1, tight: 2, ontrack: 3, comfortable: 4, done: 5 }; return l.sort( ( a, b ) => ( rank[ a.verdict ] - rank[ b.verdict ] ) || ( a.days - b.days ) )[ 0 ]; };
	EXA.efriendHome = () => {
		if ( ! on() ) return '';
		const f = pickGoal();
		if ( ! f ) { const g = S().goals.find( ( x ) => ! x.coach ); return g ? `<section data-home="efriend"><div class="ef-card ef-promo"><div class="ef-top">${ F.mascot( 'happy' ) }<div class="ef-bubble"><b>${ esc( t( 'efMeet' ) ) }</b>${ esc( t( 'efPromo', { name: g.name } ) ) }<button type="button" class="btn btn-primary sm" data-ef-try="${ esc( g.id ) }">${ esc( t( 'efTry' ) ) }</button></div></div></div></section>` : ''; }
		if ( ! EXA.flipCard ) return '';
		if ( ! ( S().device || {} ).efIntro && ! navigator.webdriver ) setTimeout( () => EXA.efriendIntro(), 600 );
		const g = f.goal, pct = f.target ? Math.min( 100, Math.round( f.saved / f.target * 100 ) ) : 0, label = { comfortable: 'Comfortable', ontrack: 'On track', tight: 'Tight', atrisk: 'At risk', unlikely: 'Unlikely', done: 'Done' }[ f.verdict ];
		const front = `<div class="ef-card ef-${ f.verdict }"><div class="ef-top">${ F.mascot( f.verdict ) }<div class="ef-bubble"><b>${ esc( pickLine( f.verdict ) ) }</b></div></div>
			<div class="ef-meta"><span class="ef-chip">${ label }</span><span>${ esc( t( 'efDaysLeft', { n: Math.max( 0, f.days ) } ) ) }</span></div>
			<div class="ef-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${ pct }"><i style="width:${ pct }%"></i><span class="ef-suit" style="left:${ pct }%">${ UI.icon( g.icon || 'plane', 18 ) }</span></div>
			<small>${ esc( money( f.saved / 100, main() ) ) } / ${ esc( money( f.target / 100, main() ) ) }</small></div>`;
		const back = `<div class="wk-back ef-back"><span class="wk-ic bob">${ UI.icon( 'sparkles', 30 ) }</span><h3>${ esc( g.name ) }</h3>${ F.sentences( f ).map( ( s ) => `<p class="wk-line">${ esc( s ) }</p>` ).join( '' ) }<button type="button" class="btn btn-primary" data-ef-open="${ esc( g.id ) }">${ esc( t( 'efOpen' ) ) }</button></div>`;
		return `<section data-home="efriend"><div class="sec-head"><h2>${ esc( g.name ) }</h2><span class="sec-acts">${ EXA.flipBtn( 'efriend' ) }</span></div>${ EXA.flipCard( 'efriend', front, back, 'fc-ef' ) }</section>`;
	};

	/* ------------------------------------------------------------------ Full analysis */
	EXA.openEfriend = ( id ) => {
		const g = S().goals.find( ( x ) => x.id === id ); if ( ! g ) return;
		const f = F.forecast( g ), m = ( c ) => money( c / 100, main() ), label = { comfortable: 'Comfortable', ontrack: 'On track', tight: 'Tight', atrisk: 'At risk', unlikely: 'Unlikely', done: 'Done' }[ f.verdict ];
		const why = ( k ) => t( 'efWhy_' + k ) || t( 'efWhy_must' );
		const mustRows = ( f.mustList || [] ).map( ( x ) => `<li><div><b>${ esc( x.b.name ) }</b><small>${ esc( why( x.why ) ) }</small></div><span>${ x.late ? '<i class="ef-late">Overdue</i> ' : '' }${ esc( m( x.c ) ) }</span></li>` ).join( '' );
		const suggRows = ( f.suggestions || [] ).map( ( s ) => `<li><div><b>${ esc( s.kind === 'cut' ? t( 'efCutLabel', { name: EX.catInfo( s.cat ).name } ) : t( 'efPauseLabel', { name: s.name } ) ) }</b></div><span class="ef-gain">+${ esc( m( s.gain ) ) }</span></li>` ).join( '' );
		const catRows = ( f.cats || [] ).slice( 0, 8 ).map( ( c ) => `<li><div><b>${ esc( EX.catInfo( c.cat ).name ) }</b></div><select data-ef-level="${ esc( c.cat ) }" aria-label="${ esc( EX.catInfo( c.cat ).name ) }">${ [ 'must', 'need', 'want' ].map( ( l ) => `<option value="${ l }"${ c.level === l ? ' selected' : '' }>${ esc( t( 'ef_lvl_' + l ) ) }</option>` ).join( '' ) }</select></li>` ).join( '' );
		const alt = [];
		if ( f.gap > 0 ) { alt.push( t( 'efAltSmaller', { a: m( Math.round( f.affordable ) ), p: Math.min( 99, Math.round( ( 1 - f.affordable / f.target ) * 100 ) ) } ) ); if ( f.laterDays ) alt.push( t( 'efAltLater', { d: EX.dayName( addDays( g.deadline, f.laterDays ) ) } ) ); }
		UI.openSheet( `<div class="sheet-head"><h2>${ esc( g.name ) }</h2><span class="sp"></span><button type="button" class="ab-btn" data-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button></div>
			<div class="sheet-pad ef-sheet"><div class="ef-top">${ F.mascot( f.verdict, 84 ) }<div class="ef-bubble"><b>${ esc( pickLine( f.verdict ) ) }</b><span class="ef-chip">${ label }</span></div></div>
			${ f.verdict === 'done' ? '' : `<ul class="ef-kv"><li><span>${ esc( t( 'efStillNeed' ) ) }</span><b>${ esc( m( f.remaining ) ) }</b></li><li><span>${ esc( t( 'efProjected' ) ) }</span><b>${ esc( m( Math.max( 0, f.projectedFree || 0 ) ) ) }</b></li><li><span>${ esc( t( 'efDays' ) ) }</span><b>${ Math.max( 0, f.days ) }</b></li><li><span>${ esc( t( 'efConfidence' ) ) }</span><b>${ esc( t( 'efConf_' + f.confidence ) ) }</b></li></ul>` }
			${ F.sentences( f ).map( ( s ) => `<p class="wk-line">${ esc( s ) }</p>` ).join( '' ) }
			${ suggRows ? `<h3>${ esc( t( 'efHelps' ) ) }</h3><ul class="ef-list">${ suggRows }</ul><p class="muted small">${ esc( t( 'efHelpsNote', { a: m( f.gain ) } ) ) }</p>` : '' }
			${ alt.length ? `<h3>${ esc( t( 'efOtherWays' ) ) }</h3>${ alt.map( ( a ) => `<p class="wk-line">${ esc( a ) }</p>` ).join( '' ) }` : '' }
			${ mustRows ? `<h3>${ esc( t( 'efMustTitle' ) ) }</h3><ul class="ef-list">${ mustRows }</ul>` : '' }
			${ catRows ? `<h3>${ esc( t( 'efSortTitle' ) ) }</h3><p class="muted small">${ esc( t( 'efSortText' ) ) }</p><ul class="ef-list">${ catRows }</ul>` : '' }
			<button type="button" class="btn btn-ghost wide" data-ef-redo="${ esc( id ) }">${ esc( t( 'efRedo' ) ) }</button><p class="muted small">${ esc( t( 'efDisclaimer' ) ) }</p></div>`, { tall: true } );
		document.querySelector( '.ef-sheet' ).addEventListener( 'change', ( e ) => { const s = e.target.closest( '[data-ef-level]' ); if ( ! s ) return; const o = S().settings.importance = S().settings.importance || {}; o[ 'cat:' + s.dataset.efLevel ] = s.value; S().settings.u = Date.now(); EX.save(); EXA.openEfriend( id ); EXA.render(); } );
	};
	document.addEventListener( 'click', ( e ) => { const tr = e.target.closest( '[data-ef-try]' ); if ( tr ) { e.preventDefault(); EXA.openGoal( S().goals.find( ( x ) => x.id === tr.dataset.efTry ) ); return; } const r = e.target.closest( '[data-ef-redo]' ); if ( r ) { UI.closeSheet(); setTimeout( () => EXA.efriendOnboard( r.dataset.efRedo ), 200 ); return; } const b = e.target.closest( '[data-ef-open]' ); if ( b ) { e.preventDefault(); e.stopImmediatePropagation(); EXA.openEfriend( b.dataset.efOpen ); } }, true );

	/* ------------------------------------------------------------------ Goal form: the switch and the wallets */
	EXA.efriendChip = ( g ) => ( g.coach && on() && g.deadline ? `<button type="button" class="btn btn-ghost sm" data-ef-open="${ esc( g.id ) }">${ F.mascot( F.forecast( g ).verdict, 22 ) } eFriend</button>` : '' );
	EXA.efriendGoalFields = ( g ) => {
		if ( ! on() ) return '';
		const ws = EX.writableAccounts(), chosen = g && g.wallets && g.wallets.length ? g.wallets : ws.map( ( w ) => w.id );
		return `<div class="ef-intro"><span class="ef-mini">${ F.mascot( 'happy', 44 ) }</span><div><b>${ esc( t( 'efMeet' ) ) }</b><small>${ esc( t( 'efMeetText' ) ) }</small></div></div>
			<label class="entry-paid ef-switch"><span><b>${ esc( t( 'efToggle' ) ) }</b><small>${ esc( t( 'efToggleHint' ) ) }</small></span><span class="switch"><input type="checkbox" name="coach"${ g && g.coach ? ' checked' : '' }><i></i></span></label>
			<div class="lbl">${ esc( t( 'efWallets' ) ) }</div><div class="chips wrap">${ ws.map( ( w ) => `<label class="chip ef-wallet"><input type="checkbox" name="gw" value="${ esc( w.id ) }"${ chosen.includes( w.id ) ? ' checked' : '' }> ${ esc( EX.accountName( w ) ) }</label>` ).join( '' ) }</div>`;
	};
	EXA.efriendAfterSave = () => { const g = F.goals().slice( -1 )[ 0 ]; if ( g && ! ( S().device || {} ).efOnboard ) setTimeout( () => EXA.efriendOnboard( g.id ), 450 ); };
	EXA.efriendReadFields = ( f ) => ( { coach: !! f.elements.coach?.checked, wallets: [ ...f.querySelectorAll( '[name=gw]:checked' ) ].map( ( x ) => x.value ) } );

	/* ------------------------------------------------------------------ Intro: the Expenity logo turns into "eFriend" */
	// The E and its tick become "e" and "F", then "riend" types itself in and the character hops out. Reduced motion shows the final word.
	// The word is set in Pacifico (SIL Open Font License), turned into outlines so no font file is needed. "e" is the logo teal and "F" the logo gold.
	const TEAL = '#0f766e', GOLD = '#f2b01e';
	const WORD = [["e", "M52.2 -17.8Q52.2 -13.8 50.3 -11.6Q46.6 -7.1 39.9 -3.3Q33.1 0.5 25.4 0.5Q14.9 0.5 9.1 -5.2Q3.3 -10.9 3.3 -20.8Q3.3 -27.7 6.2 -33.7Q9.1 -39.6 14.2 -43.1Q19.4 -46.6 25.9 -46.6Q31.7 -46.6 35.2 -43.2Q38.7 -39.7 38.7 -33.8Q38.7 -26.9 33.8 -22Q28.8 -17 17 -14.1Q19.5 -9.5 26.5 -9.5Q31 -9.5 36.8 -12.7Q42.5 -15.8 46.7 -20.9Q47.9 -22.3 49.4 -22.3Q50.7 -22.3 51.5 -21.1Q52.2 -19.9 52.2 -17.8ZM15.4 -22.1V-21.9Q21.3 -23.3 24.7 -26.1Q28.1 -28.9 28.1 -32.6Q28.1 -34.5 27.1 -35.7Q26 -36.8 24.2 -36.8Q20.5 -36.8 17.9 -32.5Q15.4 -28.2 15.4 -22.1Z"], ["F", "M132.9 -77.8Q132.9 -70.9 125.5 -71.4L122 -71.7Q116.1 -72.2 110.3 -72.5Q104.4 -72.8 98 -72.8H93.5Q92.3 -58 91 -45.8L108.2 -46.1Q111.9 -46.1 113.2 -44.8Q114.4 -43.5 114.4 -41.3Q114.4 -37.9 112.4 -36Q110.4 -34 106.7 -34H89.6L89 -29.7Q86.9 -13.2 80.1 -6.2Q73.2 0.8 61.2 0.8Q54.4 0.8 48.7 -2.2Q43 -5.1 40.3 -9.3Q39.2 -11 39.2 -13.4Q39.2 -15.8 40.4 -17.6Q41.5 -19.4 43.2 -19.4Q44.4 -19.4 45.6 -18.6Q46.7 -17.8 48.5 -15.5Q53.3 -9.2 60.4 -9.2Q66.1 -9.2 70 -13.9Q73.8 -18.5 74.9 -28.5L75.5 -34H70.7Q68.4 -34 66.8 -35.3Q65.1 -36.6 65.1 -39Q65.1 -42.1 66.7 -43.8Q68.3 -45.4 71.4 -45.4Q74.2 -45.4 76.9 -45.5Q78.1 -56.5 79.5 -72.2Q68.7 -71.2 64.3 -68.7Q59.9 -66.2 59.9 -61.3Q59.9 -57.9 61.9 -54.8Q62.5 -53.9 62.5 -53Q62.5 -51.2 60.5 -49.9Q58.5 -48.5 56 -48.5Q53.3 -48.5 51.4 -50.1Q50.2 -51.1 49.1 -54.2Q48 -57.3 48 -61.1Q48 -73.5 60.8 -79.1Q73.5 -84.7 98 -84.7Q115 -84.7 128 -82.9Q130.8 -82.5 131.9 -81.2Q132.9 -79.9 132.9 -77.8Z"], ["r", "M115.5 -16.3Q115.5 -29.3 119.2 -41Q120.1 -43.9 122.2 -45.2Q124.2 -46.6 127.9 -46.6Q129.9 -46.6 130.7 -46.1Q131.5 -45.6 131.5 -44.2Q131.5 -42.6 130 -37Q129 -33 128.4 -30Q127.8 -27 127.4 -22.6Q130.7 -31.2 134.8 -36.6Q138.9 -42 142.9 -44.3Q146.8 -46.6 150.1 -46.6Q156.6 -46.6 156.6 -40.1Q156.6 -38.8 155.7 -33.8Q154.9 -29.8 154.9 -28.8Q154.9 -25.3 157.4 -25.3Q160.2 -25.3 164.6 -29.7Q165.9 -31 167.3 -31Q168.6 -31 169.3 -29.9Q170.1 -28.7 170.1 -26.8Q170.1 -23.1 168.1 -21Q165.3 -18.1 161.6 -16.1Q157.8 -14 153.6 -14Q148.3 -14 145.6 -16.7Q142.8 -19.4 142.8 -24Q142.8 -25.5 143.1 -27Q143.3 -29 143.3 -29.7Q143.3 -31.3 142.2 -31.3Q140.7 -31.3 138.2 -28Q135.8 -24.6 133.4 -19.1Q131 -13.6 129.5 -7.5Q128.4 -2.8 127 -1.2Q125.5 0.5 122.4 0.5Q118.6 0.5 117 -3.5Q115.5 -7.5 115.5 -16.3Z"], ["i", "M165.5 -60.6Q165.5 -64.1 168.2 -66.5Q171 -68.8 175.1 -68.8Q178.8 -68.8 181.1 -67Q183.4 -65.2 183.4 -61.9Q183.4 -57.9 180.8 -55.6Q178.2 -53.2 173.9 -53.2Q169.7 -53.2 167.6 -55.2Q165.5 -57.1 165.5 -60.6ZM160.7 -16.3Q160.7 -20.8 161.8 -27.9Q163 -34.9 164.8 -41Q165.7 -44.2 167.2 -45.4Q168.7 -46.6 172 -46.6Q177.1 -46.6 177.1 -43.2Q177.1 -40.7 175.2 -31.6Q172.8 -20.6 172.8 -16.7Q172.8 -13.7 173.6 -12.1Q174.4 -10.5 176.3 -10.5Q178.1 -10.5 180.8 -13Q183.5 -15.5 188 -20.9Q189.2 -22.3 190.7 -22.3Q192 -22.3 192.8 -21.1Q193.5 -19.9 193.5 -17.8Q193.5 -13.8 191.6 -11.6Q181.7 0.5 173.1 0.5Q166.6 0.5 163.6 -4.1Q160.7 -8.7 160.7 -16.3Z"], ["e", "M232.8 -17.8Q232.8 -13.8 230.9 -11.6Q227.2 -7.1 220.5 -3.3Q213.7 0.5 206 0.5Q195.5 0.5 189.7 -5.2Q183.9 -10.9 183.9 -20.8Q183.9 -27.7 186.8 -33.7Q189.7 -39.6 194.9 -43.1Q200 -46.6 206.5 -46.6Q212.3 -46.6 215.8 -43.2Q219.3 -39.7 219.3 -33.8Q219.3 -26.9 214.4 -22Q209.4 -17 197.6 -14.1Q200.1 -9.5 207.1 -9.5Q211.6 -9.5 217.4 -12.7Q223.1 -15.8 227.3 -20.9Q228.5 -22.3 230 -22.3Q231.3 -22.3 232.1 -21.1Q232.8 -19.9 232.8 -17.8ZM196 -22.1V-21.9Q201.9 -23.3 205.3 -26.1Q208.7 -28.9 208.7 -32.6Q208.7 -34.5 207.7 -35.7Q206.6 -36.8 204.8 -36.8Q201.1 -36.8 198.6 -32.5Q196 -28.2 196 -22.1Z"], ["n", "M224.9 -16.3Q224.9 -29.3 228.6 -41Q229.5 -43.9 231.6 -45.2Q233.6 -46.6 237.3 -46.6Q239.3 -46.6 240.1 -46.1Q240.9 -45.6 240.9 -44.2Q240.9 -42.6 239.4 -37Q238.4 -33 237.8 -30Q237.2 -27 236.8 -22.6Q240.1 -31.2 244.2 -36.6Q248.3 -42 252.2 -44.3Q256.2 -46.6 259.5 -46.6Q266 -46.6 266 -40.1Q266 -36.2 263.8 -26Q261.9 -17.3 261.9 -14.5Q261.9 -10.5 264.8 -10.5Q266.8 -10.5 269.6 -12.9Q272.3 -15.4 276.9 -20.9Q278.1 -22.3 279.6 -22.3Q280.9 -22.3 281.6 -21.1Q282.4 -19.9 282.4 -17.8Q282.4 -13.8 280.5 -11.6Q276.2 -6.3 271.2 -2.9Q266.3 0.5 260 0.5Q254.9 0.5 252.3 -2.5Q249.7 -5.4 249.7 -11Q249.7 -13.8 251.1 -21Q252.4 -27.3 252.4 -29.7Q252.4 -31.3 251.3 -31.3Q250 -31.3 247.7 -28Q245.3 -24.6 242.9 -19.1Q240.4 -13.6 238.9 -7.5Q237.8 -2.8 236.4 -1.2Q234.9 0.5 231.8 0.5Q228 0.5 226.4 -3.5Q224.9 -7.5 224.9 -16.3Z"], ["d", "M333.9 -17.8Q333.9 -13.8 332 -11.6Q327.9 -6.6 323 -3.1Q318.1 0.5 313.3 0.5Q305.7 0.5 301.7 -8.4Q297.5 -3.1 294.4 -1.3Q291.2 0.5 287 0.5Q280.9 0.5 276.9 -4Q273 -8.6 273 -15.9Q273 -23.9 276.4 -30.8Q279.8 -37.6 285.8 -42Q291.7 -46.3 299.1 -47.1Q301 -66.5 306.4 -80.2Q311.7 -94 320.4 -94Q324.7 -94 327.5 -90.1Q330.4 -86.2 330.4 -78.3Q330.4 -67.1 324.9 -52.1Q319.4 -37.1 310.2 -21.3Q310.6 -15.5 312 -13Q313.3 -10.5 315.4 -10.5Q318.1 -10.5 320.9 -12.9Q323.7 -15.3 328.4 -20.9Q329.6 -22.3 331.1 -22.3Q332.4 -22.3 333.1 -21.1Q333.9 -19.9 333.9 -17.8ZM310.3 -37Q321.5 -61.4 321.5 -76.2Q321.5 -80 320.9 -82.1Q320.2 -84.2 319.3 -84.2Q317.4 -84.2 315.5 -77.5Q313.6 -70.7 312.2 -59.8Q310.9 -48.9 310.3 -37ZM299.1 -16.9Q298.1 -22.3 298.1 -29Q298.1 -31.4 298.3 -36.8Q292.8 -35.1 289.1 -29.5Q285.5 -23.8 285.5 -16.9Q285.5 -9.6 290.5 -9.6Q292.4 -9.6 294.3 -11.2Q296.2 -12.7 299.1 -16.9Z"]];
	F.logoWord = ( cls = '' ) => `<svg class="ef-logo ${ cls }" viewBox="-4 -92 330 130" role="img" aria-label="eFriend">
		<g class="ef-lg-E" transform="translate(-4 -62) scale(1.25)"><rect x="10" y="22" width="34" height="9" rx="4.5" fill="${ TEAL }"/><rect x="10" y="62" width="34" height="9" rx="4.5" fill="${ TEAL }"/><rect x="10" y="22" width="9" height="49" rx="4.5" fill="${ TEAL }"/></g>
		<path class="ef-lg-tick" transform="translate(-4 -62) scale(1.25)" d="m23 46 7 7 14-16" fill="none" stroke="#ffc94d" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
		${ WORD.map( ( [ , d ], i ) => `<path class="ef-lg-w" style="--i:${ i }" d="${ d }" fill="${ i === 0 ? TEAL : i === 1 ? GOLD : 'var(--ink)' }"/>` ).join( '' ) }</svg>`;
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
	EXA.efriendOnboard = ( goalId ) => {
		const rows = F.sortRows();
		try { S().device.efOnboard = 1; } catch ( e ) { /* ignore */ }
		if ( ! rows.length ) { if ( goalId ) EXA.openEfriend( goalId ); return; }
		const row = ( r ) => `<li data-ef-row="${ esc( r.cat ) }"><div><b>${ esc( EX.catInfo( r.cat ).name ) }</b>${ r.spent ? `<small>${ esc( money( r.spent / 100, main() ) ) }</small>` : '' }</div>
			<div class="ef-tri" role="group" aria-label="${ esc( EX.catInfo( r.cat ).name ) }">${ LVL.map( ( l ) => `<button type="button" data-ef-set="${ l }" aria-pressed="${ r.level === l }" class="${ r.level === l ? 'on ' : '' }ef-l-${ l }">${ esc( t( 'ef_lvl_' + l ) ) }</button>` ).join( '' ) }</div></li>`;
		UI.openSheet( `<div class="sheet-head"><h2>${ esc( t( 'efOnbTitle' ) ) }</h2><span class="sp"></span></div>
			<div class="sheet-pad ef-sheet ef-onb"><div class="ef-top">${ F.mascot( 'happy', 72 ) }<div class="ef-bubble"><b>${ esc( t( 'efOnbHi' ) ) }</b></div></div>
			<p class="muted small">${ esc( t( 'efSortText' ) ) }</p>
			<ul class="ef-list">${ rows.map( row ).join( '' ) }</ul>
			<div class="btn-row"><button type="button" class="btn btn-primary wide" data-ef-save>${ esc( t( 'efOnbSave' ) ) }</button></div></div>`, { tall: true } );
		const root = document.querySelector( '.ef-onb' );
		root.addEventListener( 'click', ( e ) => {
			const b = e.target.closest( '[data-ef-set]' );
			if ( b ) { b.parentNode.querySelectorAll( 'button' ).forEach( ( x ) => { const on = x === b; x.classList.toggle( 'on', on ); x.setAttribute( 'aria-pressed', on ); } ); return; }
			if ( ! e.target.closest( '[data-ef-save]' ) ) return;
			const o = S().settings.importance = S().settings.importance || {};
			root.querySelectorAll( '[data-ef-row]' ).forEach( ( li ) => { const cat = li.dataset.efRow, v = li.querySelector( '.on' )?.dataset.efSet, r = rows.find( ( x ) => x.cat === cat ); if ( ! v ) return; if ( v === r.auto ) delete o[ 'cat:' + cat ]; else o[ 'cat:' + cat ] = v; } );
			S().settings.u = Date.now(); EX.save(); UI.closeSheet(); EXA.render();
			if ( goalId ) setTimeout( () => EXA.openEfriend( goalId ), 250 );
		} );
	};

	/* ------------------------------------------------------------------ Strings */
	const en = {
		efMeet: 'Meet your eFriend', efMeetText: 'A small friend who watches your bills, income and habits and tells you, kindly and with jokes, whether this goal will happen.',
		efToggle: 'Let eFriend coach this goal', efToggleHint: 'It checks the goal against your bills, income and spending until the date.', efWallets: 'Money for this goal comes from',
		ef_comfortable: "You're on fire. The suitcase is already packing itself.|At this rate you'll be buying souvenirs for your souvenirs.|Look at you, being all responsible. I'm basically crying.",
		ef_ontrack: "Right on schedule. I'm proud of you, and I don't say that to just anyone.|Smooth sailing. Keep your wallet calm and the plan will happen.|On track! Please don't celebrate with an impulse purchase.",
		ef_tight: "It's tight, but so are my favourite jeans. We can make it work.|A few small tweaks and this plan is back on.|Not a disaster. More of a plot twist.",
		ef_atrisk: "Houston, we have a slightly worrying forecast. Good news: I have ideas.|The plan is wobbling. Let's rescue it with some creative skipping.|Plot twist: the coffee budget has plans of its own. Let's talk.",
		ef_unlikely: "Okay, honest moment: this date is a stretch. Let's pick a smarter plan together.|I believe in you, just not in this exact date. Let's adjust.",
		ef_done: "You did it! Passport time.|Goal reached. I'm doing a tiny happy dance.", ef_nodata: 'I need a bit more history to guess well. Keep adding things!',
		efDone: 'Goal reached. Time to enjoy it!', efLate: 'The date has passed. Move the date or lower the goal and I will help again.',
		efNeedWeek: 'You need about {a} a week to get there.', efShort: 'At your current pace you would be {a} short.', efSpare: 'At your current pace you would have {a} to spare.',
		efOverdue: '{a} of overdue bills must be paid first. They come before any goal.', efTipCut: 'Cutting {name} by a quarter would add about {a}.', efTipPause: 'Pausing {name} would add about {a}.',
		efDaysLeft: '{n} days left', efOpen: 'Full analysis', efStillNeed: 'Still to save', efProjected: 'Likely free by the date', efDays: 'Days left', efConfidence: 'How sure am I?',
		efConf_low: 'A little (not much history yet)', efConf_medium: 'Fairly', efConf_good: 'Quite sure',
		efHelps: 'What would help', efHelpsNote: 'Together these could add about {a} by the date.', efCutLabel: 'Spend a quarter less on {name}', efPauseLabel: 'Pause {name}',
		efOtherWays: 'Other ways to get there', efAltSmaller: 'Aim a little lower: about {a} ({p}% less) fits comfortably.', efAltLater: 'Or move the date to about {d}.',
		efMustTitle: 'Bills that cannot be skipped', efSortTitle: 'How I sorted your spending', efSortText: 'Must = fixed and necessary. Need = necessary but you can shop smarter. Want = nice to have. Change any of them.',
		ef_lvl_must: 'Must', ef_lvl_need: 'Need', ef_lvl_want: 'Want',
		efWhy_housing: 'A roof comes first, and late rent costs fees.', efWhy_utility: 'Lights, water and heating are not optional.', efWhy_telecom: 'Phone and internet keep you reachable and online, so they stay.',
		efWhy_insurance: 'Skipping insurance can cost far more later.', efWhy_loan: 'Missed payments add interest and hurt your record.', efWhy_tax: 'Taxes and contributions have penalties when late.',
		efWhy_childcare: 'Your family depends on it.', efWhy_must: 'Fixed and necessary.', efWhy_custom: 'You marked this as a must.',
		efOnbTitle: 'How you spend', efOnbHi: "Here is how I sorted your spending. Tap to change anything that is different for you.", efOnbSave: 'Looks right', efRedo: 'Review how I sorted your spending',
		fx_efriend: 'eFriend', fxD_efriend: 'A small robot that coaches a savings goal and tells you whether you will make it.', efPromo: 'Let it coach "{name}": it checks your bills, income and habits and tells you if you will make it.', efTry: 'Try it',
		tut_efriend: 'Meet your eFriend', tutD_efriend: 'A robot that tells you if your goal will happen', tut_efriend_1: 'In **Plan**, add a goal with a target and a date, for example a trip.', tut_efriend_2: 'Turn on **Let eFriend coach this goal** and choose the wallets the money comes from.', tut_efriend_3: 'On Home, tap **Full analysis** to see what is likely, what would help, and how your spending is sorted. Change any of it.',
		tutEx_efriend: 'Maria wants 400 for a trip by December. eFriend sees her rent and phone bill are musts, notices she spends a lot on takeaway, and says: cut it by a quarter and you will make it, with money to spare.',
		efDisclaimer: 'These are estimates from your own history, not financial advice. The more you add, the better my guesses get.',
	};
	const el = {
		efMeet: 'Γνωρίστε το eFriend σας', efMeetText: 'Ένας μικρός φίλος που παρακολουθεί τους λογαριασμούς, τα έσοδα και τις συνήθειές σας και σας λέει, ευγενικά και με αστεία, αν αυτός ο στόχος θα γίνει.',
		efToggle: 'Να προπονεί το eFriend αυτόν τον στόχο', efToggleHint: 'Ελέγχει τον στόχο με βάση τους λογαριασμούς, τα έσοδα και τα έξοδά σας μέχρι την ημερομηνία.', efWallets: 'Τα χρήματα για αυτόν τον στόχο προέρχονται από',
		ef_comfortable: 'Πετάτε! Η βαλίτσα φτιάχνεται μόνη της.|Με αυτόν τον ρυθμό θα αγοράζετε σουβενίρ για τα σουβενίρ σας.|Κοιτάξτε σας, τόσο υπεύθυνοι. Σχεδόν κλαίω.',
		ef_ontrack: 'Στην ώρα σας. Είμαι περήφανο για εσάς και δεν το λέω σε όλους.|Όλα πάνε ρολόι. Κρατήστε το πορτοφόλι ήρεμο και το σχέδιο θα γίνει.|Πάμε καλά! Μην το γιορτάσετε με παρορμητική αγορά, σας παρακαλώ.',
		ef_tight: 'Είναι στενά, αλλά έτσι είναι και το αγαπημένο μου τζιν. Θα τα καταφέρουμε.|Μερικές μικρές αλλαγές και το σχέδιο επανέρχεται.|Όχι καταστροφή. Μάλλον ανατροπή πλοκής.',
		ef_atrisk: 'Χιούστον, έχουμε μια ελαφρώς ανησυχητική πρόβλεψη. Καλά νέα: έχω ιδέες.|Το σχέδιο τρέμει. Ας το σώσουμε με λίγη δημιουργική παράλειψη.|Ανατροπή: ο προϋπολογισμός για καφέδες έχει δικά του σχέδια. Ας μιλήσουμε.',
		ef_unlikely: 'Εντάξει, ειλικρινά: αυτή η ημερομηνία είναι δύσκολη. Ας διαλέξουμε μαζί ένα εξυπνότερο σχέδιο.|Πιστεύω σε εσάς, απλώς όχι σε αυτή ακριβώς την ημερομηνία. Ας την προσαρμόσουμε.',
		ef_done: 'Τα καταφέρατε! Ώρα για διαβατήριο.|Ο στόχος επιτεύχθηκε. Κάνω έναν μικρό χορό χαράς.', ef_nodata: 'Χρειάζομαι λίγο περισσότερο ιστορικό για να μαντέψω σωστά. Συνεχίστε να προσθέτετε!',
		efDone: 'Ο στόχος επιτεύχθηκε. Ώρα να τον απολαύσετε!', efLate: 'Η ημερομηνία πέρασε. Αλλάξτε την ημερομηνία ή μειώστε τον στόχο και θα βοηθήσω ξανά.',
		efNeedWeek: 'Χρειάζεστε περίπου {a} την εβδομάδα για να φτάσετε.', efShort: 'Με τον τρέχοντα ρυθμό θα σας λείπουν {a}.', efSpare: 'Με τον τρέχοντα ρυθμό θα σας περισσεύουν {a}.',
		efOverdue: 'Οφείλετε να πληρώσετε πρώτα {a} εκπρόθεσμων λογαριασμών. Προηγούνται κάθε στόχου.', efTipCut: 'Αν περικόψετε το «{name}» κατά ένα τέταρτο, θα προσθέσετε περίπου {a}.', efTipPause: 'Αν παγώσετε το «{name}», θα προσθέσετε περίπου {a}.',
		efDaysLeft: '{n} ημέρες ακόμα', efOpen: 'Πλήρης ανάλυση', efStillNeed: 'Μένουν να αποταμιευτούν', efProjected: 'Πιθανώς ελεύθερα μέχρι την ημερομηνία', efDays: 'Ημέρες που απομένουν', efConfidence: 'Πόσο σίγουρο είμαι;',
		efConf_low: 'Λίγο (δεν υπάρχει ακόμα αρκετό ιστορικό)', efConf_medium: 'Αρκετά', efConf_good: 'Πολύ',
		efHelps: 'Τι θα βοηθούσε', efHelpsNote: 'Μαζί αυτά θα μπορούσαν να προσθέσουν περίπου {a} μέχρι την ημερομηνία.', efCutLabel: 'Ξοδέψτε ένα τέταρτο λιγότερο σε «{name}»', efPauseLabel: 'Παγώστε το «{name}»',
		efOtherWays: 'Άλλοι τρόποι να φτάσετε', efAltSmaller: 'Στοχεύστε λίγο χαμηλότερα: περίπου {a} ({p}% λιγότερο) χωράει άνετα.', efAltLater: 'Ή μετακινήστε την ημερομηνία γύρω στις {d}.',
		efMustTitle: 'Λογαριασμοί που δεν παραλείπονται', efSortTitle: 'Πώς ταξινόμησα τα έξοδά σας', efSortText: 'Αναγκαίο = σταθερό και απαραίτητο. Ανάγκη = απαραίτητο αλλά μπορείτε να ψωνίσετε εξυπνότερα. Επιθυμία = καλό να υπάρχει. Αλλάξτε οποιοδήποτε.',
		ef_lvl_must: 'Αναγκαίο', ef_lvl_need: 'Ανάγκη', ef_lvl_want: 'Επιθυμία',
		efWhy_housing: 'Πρώτα η στέγη, και το ενοίκιο που καθυστερεί έχει επιβαρύνσεις.', efWhy_utility: 'Ρεύμα, νερό και θέρμανση δεν είναι προαιρετικά.', efWhy_telecom: 'Το τηλέφωνο και το internet σας κρατούν προσβάσιμους και συνδεδεμένους, γι’ αυτό μένουν.',
		efWhy_insurance: 'Η παράλειψη ασφάλισης μπορεί να κοστίσει πολύ περισσότερο αργότερα.', efWhy_loan: 'Οι χαμένες δόσεις προσθέτουν τόκους και βλάπτουν το ιστορικό σας.', efWhy_tax: 'Οι φόροι και οι εισφορές έχουν πρόστιμα όταν καθυστερούν.',
		efWhy_childcare: 'Η οικογένειά σας εξαρτάται από αυτό.', efWhy_must: 'Σταθερό και απαραίτητο.', efWhy_custom: 'Το σημάνατε ως αναγκαίο.',
		efOnbTitle: 'Πώς ξοδεύετε', efOnbHi: 'Έτσι ταξινόμησα τα έξοδά σας. Πατήστε για να αλλάξετε ό,τι διαφέρει για εσάς.', efOnbSave: 'Σωστά', efRedo: 'Δείτε πώς ταξινόμησα τα έξοδά σας',
		fx_efriend: 'eFriend', fxD_efriend: 'Ένα μικρό ρομπότ που προπονεί έναν στόχο αποταμίευσης και σας λέει αν θα τα καταφέρετε.', efPromo: 'Αφήστε το να προπονήσει τον στόχο «{name}»: ελέγχει τους λογαριασμούς, τα έσοδα και τις συνήθειές σας και σας λέει αν θα τα καταφέρετε.', efTry: 'Δοκιμάστε το',
		tut_efriend: 'Γνωρίστε το eFriend σας', tutD_efriend: 'Ένα ρομπότ που σας λέει αν θα γίνει ο στόχος σας', tut_efriend_1: 'Στο **Πλάνο**, προσθέστε έναν στόχο με ποσό και ημερομηνία, για παράδειγμα ένα ταξίδι.', tut_efriend_2: 'Ενεργοποιήστε το **Να προπονεί το eFriend αυτόν τον στόχο** και διαλέξτε τα πορτοφόλια από τα οποία προέρχονται τα χρήματα.', tut_efriend_3: 'Στην Αρχική, πατήστε **Πλήρης ανάλυση** για να δείτε τι είναι πιθανό, τι θα βοηθούσε και πώς ταξινομούνται τα έξοδά σας. Αλλάξτε οτιδήποτε.',
		tutEx_efriend: 'Η Μαρία θέλει 400 για ένα ταξίδι μέχρι τον Δεκέμβριο. Το eFriend βλέπει ότι το ενοίκιο και ο λογαριασμός τηλεφώνου είναι αναγκαία, προσέχει ότι ξοδεύει πολλά σε delivery και λέει: κόψτε το κατά ένα τέταρτο και θα τα καταφέρετε, με χρήματα να περισσεύουν.',
		efDisclaimer: 'Πρόκειται για εκτιμήσεις από το δικό σας ιστορικό και όχι για οικονομική συμβουλή. Όσο περισσότερα προσθέτετε, τόσο καλύτερα μαντεύω.',
	};
	Object.assign( window.EXPENITY_I18N.langs.en, en ); Object.assign( window.EXPENITY_I18N.langs.el, el );
}() );
