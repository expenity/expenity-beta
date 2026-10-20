/**
 * Expenity plan: budgets (with progress and a safe daily amount), savings goals (with contributions, a forecast and
 * milestones) and recurring income (with a one-tap "received"). The maths lives in EX.plan; the screen is EXA.plan.
 * Money set aside for a goal is an ordinary transaction with a goalId, so it syncs and balances like everything else,
 * but it is not counted as spending.
 */
( function () {
	'use strict';
	const EX = window.EX, UI = window.UI, EXA = window.EXA;
	const { t, esc, money, iso, parse, today, addDays, uid } = EX;
	const S = EX.state;
	const st = EXA.st;
	const $ = ( s, r = document ) => r.querySelector( s );
	const toast = UI.toast;
	const P = ( EX.plan = {} );
	const X = `<button type="button" class="ab-btn" data-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button>`;
	const head = ( title ) => `<div class="sheet-head">${ X }<h2 id="sheetTitle">${ esc( title ) }</h2><span class="sp"></span></div>`;
	const main = () => S().settings.currency;
	const num = ( v ) => Number( String( v == null ? '' : v ).replace( ',', '.' ) ) || 0;
	const cname = ( key ) => ( key === 'all' ? t( 'budgetAll' ) : EX.catInfo( key ).name );

	/* ------------------------------------------------------------------ The maths */

	/** The budget period that contains `ref` (a date string), and the one before it. */
	P.period = ( b, ref = today() ) => {
		const d = parse( ref );
		let start, end, ps, pe;
		if ( b.period === 'weekly' ) { start = addDays( ref, -( ( d.getDay() + 6 ) % 7 ) ); end = addDays( start, 6 ); ps = addDays( start, -7 ); pe = addDays( start, -1 ); }
		else if ( b.period === 'yearly' ) { start = `${ d.getFullYear() }-01-01`; end = `${ d.getFullYear() }-12-31`; ps = `${ d.getFullYear() - 1 }-01-01`; pe = `${ d.getFullYear() - 1 }-12-31`; }
		else { start = iso( new Date( d.getFullYear(), d.getMonth(), 1 ) ); end = iso( new Date( d.getFullYear(), d.getMonth() + 1, 0 ) ); ps = iso( new Date( d.getFullYear(), d.getMonth() - 1, 1 ) ); pe = iso( new Date( d.getFullYear(), d.getMonth(), 0 ) ); }
		return { start, end, ps, pe };
	};
	/** Spending in cents (main currency) in a date range, for one category or everything. Goal money is not spending. */
	P.spent = ( category, from, to ) => EX.reportTxs().reduce( ( sum, x ) => {
		if ( x.type !== 'expense' || x.goalId || x.date < from || x.date > to || ( category !== 'all' && x.category !== category ) ) return sum;
		const v = EX.convert( num( x.amount ), EX.txCurrency( x ), main() );
		return v == null ? sum : sum + Math.round( v * 100 );
	}, 0 );
	P.budget = ( b ) => {
		const per = P.period( b ), limit = EX.cents( b.amount );
		let carry = 0;
		if ( b.rollover ) carry = Math.max( 0, limit - P.spent( b.category, per.ps, per.pe ) );
		const eff = limit + carry, spent = P.spent( b.category, per.start, per.end );
		const daysLeft = Math.max( 1, Math.round( ( parse( per.end ) - parse( today() ) ) / 864e5 ) + 1 );
		return { limit, carry, eff, spent, left: eff - spent, pct: eff ? Math.min( 999, Math.round( ( spent / eff ) * 100 ) ) : 0, daysLeft, perDay: Math.max( 0, Math.floor( ( eff - spent ) / daysLeft ) ), per };
	};
	/** Cents set aside for a goal so far (contributions minus withdrawals), in the main currency. */
	/** Savings goals only: eFriend plans (a trip to check, not money to collect) live in the same list but are shown by eFriend. */
	P.list = () => S().goals.filter( ( g ) => ! ( EX.isEfPlan && EX.isEfPlan( g ) ) );
	P.saved = ( g ) => EX.reportTxs().reduce( ( sum, x ) => {
		if ( x.goalId !== g.id ) return sum;
		const v = EX.convert( num( x.amount ), EX.txCurrency( x ), main() );
		if ( v == null ) return sum;
		return sum + ( x.type === 'expense' ? 1 : -1 ) * Math.round( v * 100 );
	}, 0 );
	P.goal = ( g ) => {
		const saved = P.saved( g ), target = EX.cents( g.target ), remaining = Math.max( 0, target - saved );
		const since = addDays( today(), -90 );
		const recent = S().txs.reduce( ( s, x ) => { if ( x.goalId !== g.id || x.date < since ) return s; const v = EX.convert( num( x.amount ), EX.txCurrency( x ), main() ); return v == null ? s : s + ( x.type === 'expense' ? 1 : -1 ) * Math.round( v * 100 ); }, 0 );
		const perDay = recent / 90;
		let eta = null;
		if ( remaining === 0 ) eta = today(); else if ( perDay > 0 ) eta = addDays( today(), Math.ceil( remaining / perDay ) );
		let needMonthly = null;
		if ( g.deadline && remaining > 0 ) { const months = Math.max( 1, ( parse( g.deadline ) - parse( today() ) ) / ( 864e5 * 30.4 ) ); needMonthly = Math.ceil( remaining / months ); }
		return { saved, target, remaining, pct: target ? Math.min( 100, Math.floor( ( saved / target ) * 100 ) ) : 0, eta, needMonthly };
	};
	P.contribute = ( g, amount, account, direction = 'add', photo = '', tags = g.tags || [] ) => {
		const before = P.goal( g ).pct;
		S().txs.push( { id: uid(), type: direction === 'add' ? 'expense' : 'income', amount: String( amount ), account, category: 'goal', date: today(), name: g.name, goalId: g.id, photo, tags } );
		EX.save();
		const after = P.goal( g ).pct;
		if ( direction === 'add' ) { const hit = [ 100, 75, 50, 25 ].find( ( m ) => before < m && after >= m ); if ( hit ) { UI.haptic(); toast( hit === 100 ? t( 'goalDone', { name: g.name } ) : t( 'goalMilestone', { n: hit, name: g.name } ) ); if ( hit === 100 ) UI.confetti(); return; } }
		toast( t( direction === 'add' ? 'tGoalAdded' : 'tGoalTaken', { name: g.name } ) );
	};
	P.receive = ( inc, amount, account ) => {
		const before = JSON.parse( JSON.stringify( inc ) );
		const tx = { id: uid(), type: 'income', amount: String( amount ), account: account || inc.account || ( EX.activeAccounts()[ 0 ] || {} ).id, category: inc.category || 'salary', date: today(), name: inc.name, note:inc.note||'', incomeId: inc.id, due: inc.next, photo: inc.photo || '', tags: inc.tags || [], scheduleBefore: {next: before.next, done: !!before.done} };
		S().txs.push( tx );
		const nx = EX.nextAfter( inc, inc.next );
		if ( nx ) inc.next = nx; else inc.done = true;
		EX.save(); UI.haptic(); EXA.playSound?.('success');
		toast( t( 'tIncReceived', { name: inc.name } ), () => { S().txs = S().txs.filter( ( x ) => x.id !== tx.id ); Object.keys( inc ).forEach( ( k ) => { delete inc[ k ]; } ); Object.assign( inc, before ); EX.save(); } );
	};
	/** A new income that is already due (today or earlier) has happened: record each past payment instead of waiting for a confirmation. */
	EXA.settleIncome = ( inc ) => {
		let n = 0;
		while ( inc.next && inc.next <= today() && n < 60 ) {
			S().txs.push( { id: uid(), type: 'income', amount: String( inc.amount ), account: inc.account, category: inc.category || 'salary', date: inc.next, name: inc.name, note: inc.note || '', incomeId: inc.id, due: inc.next, photo: '', tags: inc.tags || [] } );
			const nx = EX.nextAfter( inc, inc.next ); n++;
			if ( nx && nx > inc.next ) inc.next = nx; else { inc.done = true; break; }
		}
		return n;
	};
	/** Income expected in the next `days` days, in cents of the main currency. */
	P.expectedIncome = ( days ) => {
		const to = addDays( today(), days );
		let sum = 0;
		S().incomes.filter( ( i ) => ! i.done ).forEach( ( i ) => { let d = i.next, n = 0; while ( d && d <= to && n < 4000 ) { const v = EX.convert( num( i.amount ), i.currency || main(), main() ); if ( v != null ) sum += Math.round( v * 100 ); d = EX.nextAfter( i, d ); n++; } } );
		return sum;
	};

	/* ------------------------------------------------------------------ Drawing pieces */

	const m$ = ( cents ) => money( cents / 100, main() );
	const ring = ( pct, size, icon ) => {
		const r = ( size - 10 ) / 2, c = 2 * Math.PI * r;
		return `<span class="ringw" style="--s:${ size }px"><svg viewBox="0 0 ${ size } ${ size }" width="${ size }" height="${ size }" aria-hidden="true"><circle cx="${ size / 2 }" cy="${ size / 2 }" r="${ r }" class="rg-bg"/><circle cx="${ size / 2 }" cy="${ size / 2 }" r="${ r }" class="rg-fg" stroke-dasharray="${ ( c * pct ) / 100 } ${ c }" transform="rotate(-90 ${ size / 2 } ${ size / 2 })"/></svg><b>${ icon || pct + '%' }</b></span>`;
	};
	const tone = ( pct ) => ( pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : 'ok' );
	const dateShort = ( d ) => parse( d ).toLocaleDateString( EX.loc(), { day: 'numeric', month: 'short', year: 'numeric' } );

	function budgetCard( b ) {
		const s = P.budget( b ), ci = b.category === 'all' ? { iconName: 'wallet', color: 'teal' } : EX.catInfo( b.category );
		const status = s.left >= 0 ? `${ m$( s.left ) } ${ t( 'budgetLeft' ) }` : `${ m$( -s.left ) } ${ t( 'budgetOver' ) }`;
		return `<button type="button" class="bcard" data-plan="edit-budget" data-id="${ esc( b.id ) }">${ UI.ci( ci.iconName || 'tag', ci.color || 'gray', 44 ) }
			<span class="mid"><b>${ esc( b.name || cname( b.category ) ) }</b><small>${ esc( t( 'budgetSpent', { a: m$( s.spent ), b: m$( s.eff ) } ) ) }</small>
			<span class="pbar ${ tone( s.pct ) }" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${ Math.min( 100, s.pct ) }"><i style="width:${ Math.min( 100, s.pct ) }%"></i></span>
			<small class="st ${ tone( s.pct ) }">${ esc( status ) }${ s.left > 0 && b.period !== 'yearly' ? ' · ' + esc( t( 'budgetPerDay', { a: m$( s.perDay ), n: s.daysLeft } ) ) : '' }</small></span></button>`;
	}
	function goalCard( g ) {
		const i = P.goal( g );
		const eta = i.remaining === 0 ? t( 'goalReached' ) : i.eta ? t( 'goalEta', { date: dateShort( i.eta ) } ) : t( 'goalNoEta' );
		return `<div class="gcard">${ ring( i.pct, 72, UI.icon( g.icon || 'target', 26 ) ) }
			<button type="button" class="mid" data-plan="edit-goal" data-id="${ esc( g.id ) }"><b>${ esc( g.name ) }</b>${EXA.tagsInline(g.tags)}<small>${ esc( t( 'goalSaved', { a: m$( i.saved ), b: m$( i.target ) } ) ) }</small><small class="st">${ i.pct }% · ${ esc( eta ) }${ i.needMonthly ? ' · ' + esc( t( 'goalNeed', { a: m$( i.needMonthly ) } ) ) : '' }</small></button>
			<button type="button" class="btn btn-ghost sm" data-plan="goal-money" data-id="${ esc( g.id ) }">${ UI.icon( 'plus', 18 ) } ${ esc( t( 'goalAddMoney' ) ) }</button>${ EXA.efriendAsk ? EXA.efriendAsk( g ) : '' }</div>`;
	}
	function incomeRow( i ) {
		const days = Math.round( ( parse( i.next ) - parse( today() ) ) / 864e5 );
		const due = days < 0 ? t( 'relLate', { n: -days } ) : days === 0 ? t( 'relToday' ) : days === 1 ? t( 'relTomorrow' ) : t( 'relIn', { n: days } );
		return `<li class="irow"><button type="button" class="mrow" data-plan="edit-income" data-id="${ esc( i.id ) }">${ UI.ci( 'briefcase', 'green', 44 ) }<span class="mid"><b>${ esc( i.name ) }</b><small>${ esc( due ) } · ${ esc( EX.scheduleLabel(i) ) }</small>${EXA.tagsInline(i.tags)}</span><span class="amt">${ esc( money( num( i.amount ), i.currency || main() ) ) }</span></button>
			<button type="button" class="btn btn-ghost sm" data-plan="receive" data-id="${ esc( i.id ) }">${ UI.icon( 'check', 18 ) } ${ esc( t( 'incMark' ) ) }</button></li>`;
	}

	/* ------------------------------------------------------------------ The Plan screen */

	EXA.incomeSchedules = () => {
			const list = S().incomes.filter( ( i ) => ! i.done && ( ! st.txFilter.account || i.account === st.txFilter.account ) ).sort( ( a, b ) => ( a.next < b.next ? -1 : 1 ) );
			return `<section class="card"><h2>${ esc( t( 'incExpected' ) ) }</h2><div class="tiles"><div class="tile"><small>${ esc( t( 'next30' ) ) }</small><b>${ esc( m$( P.expectedIncome( 30 ) ) ) }</b><span></span></div><div class="tile"><small>${ esc( t( 'next90' ) ) }</small><b>${ esc( m$( P.expectedIncome( 90 ) ) ) }</b><span></span></div></div></section>
				${ list.length ? `<ul class="list">${ list.map( incomeRow ).join( '' ) }</ul>` : `<div class="empty small">${ UI.ci( 'briefcase', 'green', 64 ) }<p>${ esc( t( 'incNone' ) ) }</p></div>` }
				<div class="btn-row"><button type="button" class="btn btn-primary" data-plan="add-income">${ UI.icon( 'plus', 22 ) } ${ esc( t( 'incAdd' ) ) }</button></div>`;
	};

	EXA.plan = () => {
		const tab = st.planTab === 'goals' ? 'goals' : 'budgets';
		const seg = ( id, label ) => `<button type="button" class="${ tab === id ? 'on' : '' }" data-plan="tab" data-tab="${ id }" role="tab" aria-selected="${ tab === id }">${ esc( label ) }</button>`;
		let body;
		if ( tab === 'budgets' ) {
			const list = S().budgets.slice().sort( ( a, b ) => P.budget( b ).pct - P.budget( a ).pct );
			const all = list.filter( ( b ) => b.category === 'all' );
			const tot = P.budget( all[ 0 ] || { category: 'all', amount: '0', period: 'monthly' } );
			body = `${ list.length ? `<div class="bgrid">${ list.map( budgetCard ).join( '' ) }</div>` : `<div class="empty small">${ UI.ci( 'chart-donut', 'amber', 64 ) }<p>${ esc( t( 'budgetNone' ) ) }</p></div>` }
				<div class="btn-row"><button type="button" class="btn btn-primary" data-plan="add-budget">${ UI.icon( 'plus', 22 ) } ${ esc( t( 'budgetAdd' ) ) }</button></div>${ all.length ? '' : `<p class="muted small center">${ esc( t( 'budgetThisMonth', { a: m$( tot.spent ) } ) ) }</p>` }`;
		} else if ( tab === 'goals' ) {
			const goals = P.list();
			const saved = goals.reduce( ( s, g ) => s + P.saved( g ), 0 ), target = goals.reduce( ( s, g ) => s + EX.cents( g.target ), 0 );
			const sav = EX.activeAccounts().filter( ( a ) => a.type === 'savings' );
			const savBal = EX.mainCents( sav.map( ( a ) => ( { amount: EX.balance( a ) / 100, currency: a.currency } ) ) );
			body = `<section class="card"><h2>${ esc( t( 'savingsTitle' ) ) }</h2><div class="tiles"><div class="tile"><small>${ esc( t( 'savedInGoals' ) ) }</small><b>${ esc( m$( saved ) ) }</b><span>${ esc( target ? t( 'ofTarget', { b: m$( target ) } ) : '' ) }</span></div><div class="tile"><small>${ esc( t( 'savingsWallets' ) ) }</small><b>${ esc( m$( savBal ) ) }</b><span>${ esc( t( 'walletsN', { n: sav.length } ) ) }</span></div></div></section>
				${ goals.length && EXA.efriendNudge ? EXA.efriendNudge() : '' }${ goals.length ? `<div class="ggrid">${ goals.map( goalCard ).join( '' ) }</div>` : `<div class="empty small">${ UI.ci( 'target', 'pink', 64 ) }<p>${ esc( t( 'goalNone' ) ) }</p></div>` }
				<div class="btn-row"><button type="button" class="btn btn-primary" data-plan="add-goal">${ UI.icon( 'plus', 22 ) } ${ esc( t( 'goalAdd' ) ) }</button></div>`;

		}
		return `<div class="segm" role="tablist">${ seg( 'budgets', t( 'planBudgets' ) ) }${ seg( 'goals', t( 'planGoals' ) ) }</div>${ body }`;
	};
	/** A short summary for Home: the three tightest budgets and the goals. Empty until something is set up. */
	EXA.planHome = () => {
		const bs = S().budgets.slice().sort( ( a, b ) => P.budget( b ).pct - P.budget( a ).pct ).slice( 0, 3 );
		const gs = P.list().slice( 0, 4 );
		const exp = P.expectedIncome( 30 );
		if ( ! bs.length && ! gs.length && ! S().incomes.length ) return `<div class="sec-head"><h2>${ esc( t( 'planTitle' ) ) }${ EXA.goalsDiscovery() }</h2><button type="button" class="link" data-go="plan">${ esc( t( 'seeAll' ) ) }</button></div><button type="button" class="promo-plan" data-go="plan">${ UI.ci( 'target', 'pink', 44 ) }<span class="mid"><b>${ esc( t( 'planPromoTitle' ) ) }</b><small>${ esc( t( 'planPromoText' ) ) }</small></span>${ UI.icon( 'chevron-right', 22 ) }</button>`;
		return `<div class="sec-head"><h2>${ esc( t( 'planTitle' ) ) }${ EXA.goalsDiscovery() }</h2><button type="button" class="link" data-go="plan">${ esc( t( 'seeAll' ) ) }</button></div>
			${ bs.length ? `<div class="bgrid">${ bs.map( budgetCard ).join( '' ) }</div>` : '' }
			${ gs.length ? `<div class="ghome">${ gs.map( ( g ) => { const i = P.goal( g ); return `<button type="button" class="gmini" data-plan="goal-money" data-id="${ esc( g.id ) }">${ ring( i.pct, 56, UI.icon( g.icon || 'target', 22 ) ) }<small>${ esc( g.name ) }</small></button>`; } ).join( '' ) }</div>` : '' }
			${ exp ? `<p class="muted small pad">${ esc( t( 'incExpectedLine', { a: m$( exp ) } ) ) }</p>` : '' }`;
	};

	/* ------------------------------------------------------------------ Sheets */

	const wallets = () => EX.writableAccounts();
	const walletOpts = ( sel ) => wallets().map( ( a ) => `<option value="${ esc( a.id ) }"${ sel === a.id ? ' selected' : '' }>${ esc( EX.accountName( a ) ) } (${ esc( a.currency ) })</option>` ).join( '' );
	let editing = null;
	function openBudget( b, pre ) {
		editing = b || null;
		const v = b || Object.assign( { category: 'food', amount: '', period: 'monthly', rollover: false }, pre || {} );
		const cats = EX.catList( 'expense' );
		UI.openSheet( `${ head( t( b ? 'budgetEdit' : 'budgetAdd' ) ) }<form id="budgetForm" novalidate class="sheet-pad">
			<label class="f"><span>${ esc( t( 'budgetCat' ) ) }</span><select name="category"><option value="all"${ v.category === 'all' ? ' selected' : '' }>${ esc( t( 'budgetAll' ) ) }</option>${ cats.map( ( c ) => `<option value="${ esc( c.key ) }"${ v.category === c.key ? ' selected' : '' }>${ esc( c.name ) }</option>` ).join( '' ) }</select></label>
			<div class="grid2"><label class="f"><span>${ esc( t( 'budgetAmount' ) ) } (${ esc( main() ) })</span><input name="amount" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${ esc( v.amount ) }"></label>
			<label class="f"><span>${ esc( t( 'budgetPeriod' ) ) }</span><select name="period">${ [ 'monthly', 'weekly', 'yearly' ].map( ( p ) => `<option value="${ p }"${ v.period === p ? ' selected' : '' }>${ esc( t( 'p_' + p ) ) }</option>` ).join( '' ) }</select></label></div>
			<label class="f chk"><input type="checkbox" name="rollover"${ v.rollover ? ' checked' : '' }> <span>${ esc( t( 'budgetRoll' ) ) }</span></label>
			${ EXA.tagsField(typeof v !== 'undefined' ? v.tags : g.tags) }${ EXA.photos.slot( typeof v !== 'undefined' ? v.photo : '' ) }<p class="err" id="planErr" role="alert" hidden></p>
			<div class="btn-row sticky-actions">${ b ? `<button type="button" class="btn btn-danger" data-plan="del-budget">${ esc( t( 'del' ) ) }</button>` : '' }<span class="sp"></span><button type="submit" class="btn btn-primary">${ esc( t( 'saveTx' ) ) }</button></div></form>`, { cls: 'small' } );
	}
	const GOAL_ICONS = [ 'target', 'trophy', 'plane', 'home', 'car', 'gift', 'heart', 'school', 'device-laptop', 'beach', 'rocket', 'pig-money' ];
	function openGoal( g ) {
		editing = g || null;
		const v = g || { name: '', target: '', deadline: '', icon: 'target' };
		UI.openSheet( `${ head( t( g ? 'goalEdit' : 'goalAdd' ) ) }<form id="goalForm" novalidate class="sheet-pad">
			<label class="f"><span>${ esc( t( 'goalName' ) ) }</span><input name="gname" maxlength="60" autocomplete="off" value="${ esc( v.name ) }"></label>
			<div class="grid2"><label class="f"><span>${ esc( t( 'goalTarget' ) ) } (${ esc( main() ) })</span><input name="target" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${ esc( v.target ) }"></label>
			<label class="f"><span>${ esc( t( 'goalDeadline' ) ) }</span><input name="deadline" type="date" value="${ esc( v.deadline || '' ) }"></label></div>
			<div class="lbl">${ esc( t( 'goalIcon' ) ) }</div><div class="icon-pick" id="goalIcons">${ GOAL_ICONS.map( ( n ) => `<button type="button" class="ipick${ v.icon === n ? ' on' : '' }" data-plan="pick-icon" data-icon="${ n }" aria-label="${ n }">${ UI.icon( n, 24 ) }</button>` ).join( '' ) }</div><input type="hidden" name="icon" value="${ esc( v.icon ) }">
			${ EXA.tagsField(typeof v !== 'undefined' ? v.tags : g.tags) }${ EXA.photos.slot( typeof v !== 'undefined' ? v.photo : '' ) }<p class="err" id="planErr" role="alert" hidden></p>
			${ g && EXA.efriendConvert ? EXA.efriendConvert( g ) : '' }
			<div class="btn-row sticky-actions">${ g ? `<button type="button" class="btn btn-danger" data-plan="del-goal">${ esc( t( 'del' ) ) }</button>` : '' }<span class="sp"></span><button type="submit" class="btn btn-primary">${ esc( t( 'saveTx' ) ) }</button></div></form>`, { cls: 'small' } );
	}
	function openContribute( g ) {
		editing = g;
		const i = P.goal( g );
		UI.openSheet( `${ head( g.name ) }<form id="contribForm" novalidate class="sheet-pad">
			<p class="muted">${ esc( t( 'goalSaved', { a: m$( i.saved ), b: m$( i.target ) } ) ) }</p>
			<div class="segm" role="tablist"><button type="button" class="on" data-plan="dir" data-dir="add" role="tab">${ esc( t( 'goalAddMoney' ) ) }</button><button type="button" data-plan="dir" data-dir="take" role="tab">${ esc( t( 'goalTake' ) ) }</button></div><input type="hidden" name="dir" value="add">
			<label class="f"><span>${ esc( t( 'fAmount' ) ) }</span><input name="amount" inputmode="decimal" autocomplete="off" placeholder="0.00" value=""></label>
			<label class="f"><span>${ esc( t( 'goalFrom' ) ) }</span><select name="account">${ walletOpts( ( wallets()[ 0 ] || {} ).id ) }</select></label>
			${ EXA.tagsField(typeof v !== 'undefined' ? v.tags : g.tags) }${ EXA.photos.slot( typeof v !== 'undefined' ? v.photo : '' ) }<p class="err" id="planErr" role="alert" hidden></p><div class="btn-row"><button type="submit" class="btn btn-primary wide">${ esc( t( 'saveTx' ) ) }</button></div></form>`, { cls: 'small' } );
	}
	function openIncome( inc, prefill = {} ) {
		editing = inc || null;
		const defaultWallet=wallets().find(a=>a.id===S().settings.defaultAccount)?.id||(wallets().length===1?wallets()[0].id:'');
		const v = inc || { name: '', amount: '', account: defaultWallet, repeat: 'monthly', next: addDays( today(), 7 ), category: 'salary', ...prefill };
		return EXA.openTx(null,{...v,type:'income',date:v.next,scheduleKind:'income',editScheduleId:inc?.id||null,sourceStamp:inc?EXA.scheduleStamp(inc):null,sourceRecord:inc?JSON.parse(JSON.stringify(inc)):null,recoveryId:'income-'+(inc?.id||'new')});
		UI.openSheet( `${ head( t( inc ? 'incEdit' : 'incAdd' ) ) }<form id="incomeForm" novalidate class="sheet-pad">
			<label class="f"><span>${ esc( t( 'incName' ) ) }</span><input name="iname" maxlength="60" autocomplete="off" value="${ esc( v.name ) }"></label>
			<label class="f"><span>${ esc( t( 'incTo' ) ) }</span><select name="account"><option value="">${esc(t('entryChooseWallet'))}</option>${ walletOpts( v.account ) }</select></label>
			<label class="f"><span>${ esc( t( 'fAmount' ) ) }</span><input name="amount" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${ esc( v.amount ) }"></label>
			<div class="grid2"><label class="f"><span>${ esc( t( 'incNext' ) ) }</span><input name="next" type="date" value="${ esc( v.next ) }"></label>
			<label class="f"><span>${ esc( t( 'fRepeats' ) ) }</span><select name="repeat">${ EX.REPEATS.map( ( r ) => `<option value="${ r }"${ v.repeat === r ? ' selected' : '' }>${ esc( t( 'r' + r.charAt( 0 ).toUpperCase() + r.slice( 1 ) ) ) }</option>` ).join( '' ) }</select></label></div>${EXA.scheduleFields(v)}
			<label class="f"><span>${esc(t('fCategory'))}</span><select name="incomeCategory">${EX.catList('income').map(c=>`<option value="${esc(c.key)}"${c.key===(v.category||'salary')?' selected':''}>${esc(c.name)}</option>`).join('')}</select></label><button type="button" class="btn btn-ghost" data-inline-category="income">${esc(t('entryCreateCategory'))}</button><label class="f"><span>${esc(t('fNote'))}</span><textarea name="incomeNote" maxlength="400" rows="2">${esc(v.note||v.notes||'')}</textarea></label>
			${ EXA.tagsField(typeof v !== 'undefined' ? v.tags : g.tags) }${ EXA.photos.slot( typeof v !== 'undefined' ? v.photo : '' ) }<p class="err" id="planErr" role="alert" hidden></p>
			<div class="btn-row sticky-actions">${ inc ? `<button type="button" class="btn btn-ghost" data-duplicate="income" data-id="${esc(inc.id)}">${UI.icon('copy',20)} ${esc(t('duplicateRecord'))}</button><button type="button" class="btn btn-danger" data-plan="del-income">${ esc( t( 'del' ) ) }</button>` : '' }<span class="sp"></span><button type="submit" class="btn btn-primary">${ esc( t(inc?'entrySaveChanges':'entryScheduleIncome') ) }</button></div></form>`, { cls: 'small' } );
	}
	EXA.openBudget = openBudget; EXA.openGoal = openGoal; EXA.openIncome = openIncome; EXA.openContribute = openContribute;

	/* ------------------------------------------------------------------ Events */

	const find = ( list, id ) => list.find( ( x ) => x.id === id );
	EXA.planClick = ( e ) => {
		const el = e.target.closest( '[data-plan]' );
		if ( ! el ) return false;
		const a = el.dataset.plan, id = el.dataset.id;
		if ( a === 'tab' ) { st.planTab = el.dataset.tab; EXA.render(); }
		else if ( a === 'add-budget' ) openBudget();
		else if ( a === 'edit-budget' ) openBudget( find( S().budgets, id ) );
		else if ( a === 'add-goal' ) { if ( ! wallets().length ) toast( t( 'walletNone' ) ); else openGoal(); }
		else if ( a === 'edit-goal' ) openGoal( find( S().goals, id ) );
		else if ( a === 'goal-money' ) { const g = find( S().goals, id ); if ( g ) { if ( ! wallets().length ) toast( t( 'walletNone' ) ); else openContribute( g ); } }
		else if ( a === 'add-income' ) { if ( ! wallets().length ) toast( t( 'walletNone' ) ); else openIncome(); }
		else if ( a === 'edit-income' ) openIncome( find( S().incomes, id ) );
		else if ( a === 'receive' ) { const i = find( S().incomes, id ); if ( i ) P.receive( i, i.amount, i.account ); }
		else if ( a === 'pick-icon' ) { $( '#goalForm' ).elements.icon.value = el.dataset.icon; document.querySelectorAll( '#goalIcons .ipick' ).forEach( ( b ) => b.classList.toggle( 'on', b === el ) ); }
		else if ( a === 'dir' ) { $( '#contribForm' ).elements.dir.value = el.dataset.dir; document.querySelectorAll( '#contribForm [data-plan=dir]' ).forEach( ( b ) => b.classList.toggle( 'on', b === el ) ); }
		else if ( a === 'del-budget' && editing ) { S().budgets = S().budgets.filter( ( x ) => x !== editing ); UI.closeSheet(); EX.save(); toast( t( 'tDeleted', { name: cname( editing.category ) } ) ); }
		else if ( a === 'del-goal' && editing ) { const g = editing; S().txs.forEach( ( x ) => { if ( x.goalId === g.id ) delete x.goalId; } ); S().goals = S().goals.filter( ( x ) => x !== g ); UI.closeSheet(); EX.save(); toast( t( 'tDeleted', { name: g.name } ) ); }
		else if ( a === 'del-income' && editing ) { S().incomes = S().incomes.filter( ( x ) => x !== editing ); UI.closeSheet(); EX.save(); toast( t( 'tDeleted', { name: editing.name } ) ); }
		else return false;
		return true;
	};
	EXA.planSubmit = ( f ) => {
		const err = ( k ) => { const e = $( '#planErr' ); e.textContent = t( k ); e.hidden = false; return true; };
		const amt = ( v ) => v.trim().replace( ',', '.' );
		const el = f.elements, ok = ( v ) => /^\d+(\.\d{1,2})?$/.test( v ) && Number( v ) > 0;
		if ( f.id === 'budgetForm' ) {
			const amount = amt( el.amount.value );
			if ( ! ok( amount ) ) return err( 'errAmount' );
			const v = { tags: EXA.readTags(f), photo: el.photo.value, category: el.category.value, amount, period: el.period.value, rollover: el.rollover.checked };
			if ( editing ) Object.assign( editing, v ); else S().budgets.push( Object.assign( { id: uid() }, v ) );
		} else if ( f.id === 'goalForm' ) {
			const name = el.gname.value.trim(), target = amt( el.target.value );
			if ( ! name ) return err( 'errNameReq' );
			if ( ! ok( target ) ) return err( 'errAmount' );
			const v = { tags: EXA.readTags(f), photo: el.photo.value, name, target, deadline: el.deadline.value || '', icon: el.icon.value };
			if ( editing ) Object.assign( editing, v ); else S().goals.push( Object.assign( { id: uid() }, v ) );
		} else if ( f.id === 'contribForm' ) {
			const amount = amt( el.amount.value );
			if ( ! ok( amount ) ) return err( 'errAmount' );
			const g = editing; UI.closeSheet();
			P.contribute( g, amount, el.account.value, el.dir.value, el.photo.value, EXA.readTags(f) );
			return true;
		} else if ( f.id === 'incomeForm' ) {
			const name = el.iname.value.trim(), amount = amt( el.amount.value );
			if ( ! name ) return err( 'errNameReq' );
			if ( ! ok( amount ) ) return err( 'errAmount' );
			if ( ! el.next.value ) return err( 'errNext' );
			const acc = EX.account( el.account.value );
			if(!acc||!wallets().some(a=>a.id===acc.id))return err('entryWalletGone');
			const schedule=EXA.readSchedule(f),scheduleError=EXA.scheduleError({repeat:el.repeat.value,...schedule,next:el.next.value});if(scheduleError)return err(scheduleError);const prepared=EX.prepareSchedule({repeat:el.repeat.value,...schedule,day:editing&&editing.next===el.next.value?editing.day:parse(el.next.value).getDate()},el.next.value),next=prepared.next;if(!next)return err(prepared.endMode==='date'?'scheduleEndError':'schedulePickDates');
            const v = { ...prepared,tags: EXA.readTags(f), photo: el.photo.value, name, amount, account: el.account.value, currency: acc.currency || main(), repeat: el.repeat.value, next, day: editing&&editing.next===next&&editing.day?editing.day:parse(next).getDate(), category: el.incomeCategory.value||'salary', note:el.incomeNote.value.trim() };
			if ( editing ) { Object.assign( editing, v ); delete editing.done; } else { const fresh = Object.assign( { id: uid() }, v ); S().incomes.push( fresh ); if ( EXA.settleIncome( fresh ) ) toast( t( 'tIncReceived', { name: fresh.name } ) ); }
		} else return false;
		UI.closeSheet(); EX.save();
		return true;
	};
}() );
