/**
 * Expenity ideas: small, specific suggestions worked out from the person's own data and what they said they want
 * (their "aims", chosen in setup and editable in Plan). Examples: which subscription could be cancelled and what that
 * is worth towards a goal, how much delivery food cost over the last 30 days, a category that grew, a budget that is
 * almost used. Everything is computed on the device; nothing is sent anywhere. Each idea can be dismissed.
 */
( function () {
	'use strict';
	const EX = window.EX, UI = window.UI, EXA = window.EXA;
	const { t, esc, money, today, addDays } = EX;
	const S = EX.state;
	const st = EXA.st;
	const I = ( EX.ideas = {} );
	const main = () => S().settings.currency;
	const num = ( v ) => Number( String( v == null ? '' : v ).replace( ',', '.' ) ) || 0;
	const m$ = ( cents ) => money( cents / 100, main() );
	const cents = ( x ) => { const v = EX.convert( num( x.amount ), EX.txCurrency( x ), main() ); return v == null ? 0 : Math.round( v * 100 ); };

	/** What people can tell us they want. `icon` and `color` are from the bundled set. */
	I.AIMS = [
		{ id: 'track', icon: 'chart-pie', color: 'teal' },
		{ id: 'save', icon: 'target', color: 'pink' },
		{ id: 'future', icon: 'pig-money', color: 'green' },
		{ id: 'subs', icon: 'repeat', color: 'purple' },
		{ id: 'spend', icon: 'shopping-cart', color: 'amber' },
		{ id: 'bills', icon: 'calendar-event', color: 'blue' },
		{ id: 'debt', icon: 'credit-card', color: 'red' },
	];
	I.aims = () => S().settings.aims || [];
	const wants = ( ...ids ) => ids.some( ( x ) => I.aims().includes( x ) );

	const DELIVERY = /(efood|e-food|wolt|box\b|uber ?eats|deliveroo|delivery|takeaway|take-away|take away|doordash|grubhub|ντελίβερι|παραγγελ|ντελιβερι)/i;
	const EATOUT = /(restaurant|resto|cafe|café|coffee|starbucks|mcdonald|burger|pizza|fast ?food|bar\b|pub\b|εστιατ|ταβέρνα|ψητοπωλ|καφ|γεύμα)/i;

	const goalLine = ( yearly ) => {
		const g = S().goals.map( ( x ) => ( { x, i: EX.plan.goal( x ) } ) ).find( ( o ) => o.i.remaining > 0 );
		if ( ! g || ! yearly ) return '';
		const pct = Math.min( 100, Math.round( ( yearly / g.i.remaining ) * 100 ) );
		return ' ' + t( 'ideaGoalLine', { pct, name: g.x.name } );
	};
	const sumRange = ( from, to, test ) => S().txs.reduce( ( s, x ) => ( x.type === 'expense' && ! x.goalId && x.date >= from && x.date <= to && test( x ) ? s + cents( x ) : s ), 0 );

	/** All current ideas, best first. */
	I.list = () => {
		const out = [], td = today(), off = S().settings.tipsOff || [];
		const add = ( o ) => { if ( ! off.includes( o.id ) ) out.push( o ); };
		const hasData = S().txs.length > 3 || S().bills.length;

		// 1. Subscriptions that could be cancelled, with what they are worth over a year
		S().bills.filter( ( b ) => ! b.done && b.category === 'subscriptions' && EX.PER_YEAR[ b.repeat ] ).forEach( ( b ) => {
			const v = EX.convert( num( b.amount ), b.currency || main(), main() );
			if ( v == null ) return;
			const yearly = Math.round( v * 100 * EX.PER_YEAR[ b.repeat ] );
			add( { id: 'sub:' + b.id, icon: 'repeat', color: 'purple', score: 50 + ( wants( 'subs', 'save', 'future' ) ? 30 : 0 ) + Math.min( 20, yearly / 2000 ), title: t( 'ideaSubTitle', { name: b.name } ), text: t( 'ideaSubText', { a: m$( yearly ), m: m$( Math.round( yearly / 12 ) ) } ) + goalLine( yearly ), go: 'bills' } );
		} );

		// 2. Delivery and eating out over the last 30 days
		const from30 = addDays( td, -29 );
		const deliv = sumRange( from30, td, ( x ) => DELIVERY.test( x.name || '' ) );
		const eat = sumRange( from30, td, ( x ) => ! DELIVERY.test( x.name || '' ) && EATOUT.test( x.name || '' ) );
		if ( deliv >= 2000 ) { const half = Math.round( deliv / 2 ); add( { id: 'delivery', icon: 'shopping-bag', color: 'amber', score: 70 + ( wants( 'spend', 'save', 'future' ) ? 20 : 0 ), title: t( 'ideaDeliveryTitle', { a: m$( deliv ) } ), text: t( 'ideaDeliveryText', { a: m$( half ), y: m$( half * 12 ) } ) + goalLine( half * 12 ), go: 'activity' } ); }
		if ( eat >= 3000 ) { const third = Math.round( eat / 3 ); add( { id: 'eatout', icon: 'confetti', color: 'pink', score: 55 + ( wants( 'spend', 'save' ) ? 15 : 0 ), title: t( 'ideaEatTitle', { a: m$( eat ) } ), text: t( 'ideaEatText', { a: m$( third ), y: m$( third * 12 ) } ) + goalLine( third * 12 ), go: 'activity' } ); }

		// 3. A category that grew compared with the 30 days before
		const prevFrom = addDays( td, -59 ), prevTo = addDays( td, -30 ), seen = {};
		S().txs.filter( ( x ) => x.type === 'expense' && ! x.goalId && x.date >= from30 ).forEach( ( x ) => { seen[ x.category ] = 1; } );
		Object.keys( seen ).forEach( ( cat ) => {
			if ( cat === 'housing' || cat === 'taxes' || cat === 'loans' ) return;
			const now = sumRange( from30, td, ( x ) => x.category === cat ), before = sumRange( prevFrom, prevTo, ( x ) => x.category === cat );
			if ( before > 0 && now - before >= 3000 && now >= before * 1.25 ) add( { id: 'grow:' + cat, icon: 'trending-up', color: 'red', score: 45 + ( wants( 'spend', 'track' ) ? 15 : 0 ), title: t( 'ideaGrowTitle', { name: EX.catInfo( cat ).name, p: Math.round( ( ( now - before ) / before ) * 100 ) } ), text: t( 'ideaGrowText', { a: m$( now - before ) } ), go: 'reports' } );
		} );

		// 4. A budget that is nearly used up
		S().budgets.forEach( ( b ) => { const s = EX.plan.budget( b ); if ( s.pct >= 80 ) add( { id: 'budget:' + b.id + ':' + s.per.start, icon: 'chart-donut', color: s.pct >= 100 ? 'red' : 'amber', score: 80 + Math.min( 15, s.pct - 80 ), title: t( s.pct >= 100 ? 'ideaBudgetOver' : 'ideaBudgetNear', { name: b.category === 'all' ? t( 'budgetAll' ) : EX.catInfo( b.category ).name, p: s.pct } ), text: t( 'ideaBudgetText', { a: m$( Math.max( 0, s.left ) ), n: s.daysLeft } ), go: 'plan' } ); } );

		// 5. Savings rate over the last 30 days
		const inc = S().txs.reduce( ( s, x ) => ( x.type === 'income' && ! x.goalId && x.date >= from30 && x.date <= td ? s + cents( x ) : s ), 0 ), spent = sumRange( from30, td, () => true );
		if ( inc > 0 && spent > 0 && ( inc - spent ) / inc < 0.1 && hasData ) { const tenth = Math.round( inc * 0.1 ); add( { id: 'rate', icon: 'pig-money', color: 'green', score: 40 + ( wants( 'future', 'save' ) ? 30 : 0 ), title: t( 'ideaRateTitle', { p: Math.max( 0, Math.round( ( ( inc - spent ) / inc ) * 100 ) ) } ), text: t( 'ideaRateText', { a: m$( tenth ), y: m$( tenth * 12 ) } ), go: 'plan' } ); }

		// 6. Setting things up
		if ( wants( 'save', 'future' ) && ! S().goals.length ) add( { id: 'first-goal', icon: 'target', color: 'pink', score: 90, title: t( 'ideaGoalTitle' ), text: t( 'ideaGoalText' ), go: 'goal' } );
		if ( ! S().incomes.length && hasData ) add( { id: 'first-income', icon: 'briefcase', color: 'green', score: 35, title: t( 'ideaIncTitle' ), text: t( 'ideaIncText' ), go: 'income' } );
		if ( wants( 'spend' ) && ! S().budgets.length && hasData ) add( { id: 'first-budget', icon: 'chart-donut', color: 'amber', score: 60, title: t( 'ideaBudTitle' ), text: t( 'ideaBudText' ), go: 'budget' } );
		return out.sort( ( a, b ) => b.score - a.score );
	};

	const card = ( o ) => `<div class="idea" data-id="${ esc( o.id ) }">${ UI.ci( o.icon, o.color, 44 ) }<div class="mid"><b>${ esc( o.title ) }</b><p>${ esc( o.text ) }</p>
		<div class="acts"><button type="button" class="btn btn-ghost sm" data-idea="open" data-id="${ esc( o.id ) }" data-go="${ esc( o.go || '' ) }">${ esc( t( 'ideaOpen' ) ) }</button><button type="button" class="link" data-idea="off" data-id="${ esc( o.id ) }">${ esc( t( 'ideaOff' ) ) }</button></div></div></div>`;
	EXA.ideasHome = () => {
		const l = I.list().slice( 0, 2 );
		if ( st.ideasExpanded ) return `<div class="sec-head"><h2>${ esc(t('ideasTitle')) }</h2><button type="button" class="link" data-idea="all">${ esc(t('ideasCollapse')) }</button></div>${ EXA.ideasTab() }`;
		return `<div class="sec-head"><h2>${ esc( t( 'ideasTitle' ) ) }</h2><button type="button" class="link" data-idea="all">${ esc( t( 'seeAll' ) ) }</button></div>${ l.length ? `<div class="ideas">${ l.map( card ).join( '' ) }</div>` : `<p class="muted pad">${ esc(t('ideasNone')) }</p>` }`;
	};
	EXA.ideasTab = () => {
		const l = I.list();
		const aims = `<section class="card"><h2>${ esc( t( 'aimsTitle' ) ) }</h2><p class="muted small">${ esc( t( 'aimsText' ) ) }</p><div class="aims">${ I.AIMS.map( ( a ) => `<button type="button" class="aim${ I.aims().includes( a.id ) ? ' on' : '' }" data-aim="${ a.id }" aria-pressed="${ I.aims().includes( a.id ) }">${ UI.ci( a.icon, a.color, 36 ) }<span>${ esc( t( 'aim_' + a.id ) ) }</span></button>` ).join( '' ) }</div></section>`;
		return `${ aims }${ l.length ? `<div class="ideas">${ l.map( card ).join( '' ) }</div>` : `<div class="empty small">${ UI.ci( 'target', 'teal', 64 ) }<p>${ esc( t( 'ideasNone' ) ) }</p></div>` }`;
	};
	EXA.ideasClick = ( e ) => {
		const a = e.target.closest( '[data-aim]' );
		if ( a && ! a.closest( '#flow' ) ) { const id = a.dataset.aim, cur = I.aims().slice(); const i = cur.indexOf( id ); if ( i >= 0 ) cur.splice( i, 1 ); else cur.push( id ); S().settings.aims = cur; EX.save(); return true; }
		const el = e.target.closest( '[data-idea]' );
		if ( ! el ) return false;
		const id = el.dataset.id;
		if ( el.dataset.idea === 'off' ) { S().settings.tipsOff = ( S().settings.tipsOff || [] ).concat( id ); EX.save(); UI.toast( t( 'ideaHidden' ) ); return true; }
		if ( el.dataset.idea === 'all' ) { st.ideasExpanded = !st.ideasExpanded; EXA.render(); return true; }
		const go = el.dataset.go;
		if ( go === 'goal' ) { EXA.go( 'plan' ); st.planTab = 'goals'; EXA.render(); EXA.openGoal(); }
		else if ( go === 'income' ) { st.txFilter.type = 'income'; st.incomeMode = 'recurring'; EXA.go( 'activity' ); EXA.openIncome(); }
		else if ( go === 'budget' ) { st.planTab = 'budgets'; EXA.go( 'plan' ); EXA.openBudget(); }
		else if ( go ) EXA.go( go );
		return true;
	};
}() );
