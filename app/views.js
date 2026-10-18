/**
 * Expenity screens: the HTML for the top bar, tab bar, side rail and the five main screens
 * (Home, Activity, Bills, Reports, More). Pure rendering: events and forms are in app.js and forms.js.
 * State that decides what is shown lives on EXA.st.
 */
( function () {
	'use strict';
	const EX = window.EX, UI = window.UI;
	const { t, esc, money, iso, parse, today, addDays, diffDays, dayName, monthName } = EX;
	const S = EX.state;
	const EXA = ( window.EXA = {} );

	const nowMonth = () => new Date().getFullYear() * 12 + new Date().getMonth();
	EXA.st = {
		view: 'home', more: 'root', billsMode: 'list', txMonth: nowMonth(), txFilter: { type: 'all', account: '', q: '' }, searchOpen: false,
		calMonth: nowMonth(), calDay: null, planTab: 'budgets', repPeriod: 'month', devCache: null, sel: null, nowMonth,
	};
	const st = EXA.st;

	/* ------------------------------------------------------------------ Shared bits */

	const lead = ( b ) => ( b.lead == null ? S().settings.lead : b.lead );
	const active = () => S().bills.filter( ( b ) => ! b.done && b.next );
	const byDue = ( a, b ) => ( a.next < b.next ? -1 : a.next > b.next ? 1 : a.name.localeCompare( b.name ) );
	const walletName = ( id ) => { const a = EX.account( id ); return a ? EX.accountName(a) : ''; };
	const amountText = ( b ) => ( b.amount !== '' && b.amount != null ? ( b.variable ? '~' : '' ) + money( Number( b.amount ), b.currency ) : '–' );
	const mainCur = () => S().settings.currency;
	const sumMain = ( list ) => EX.mainCents( list );
	function rel( due ) {
		const n = diffDays( due, today() );
		if ( n === 0 ) return t( 'relToday' );
		if ( n === 1 ) return t( 'relTomorrow' );
		if ( n === -1 ) return t( 'relYesterday' );
		return n < 0 ? t( 'relLate', { n: -n } ) : t( 'relIn', { n } );
	}
	Object.assign( EXA, { lead, active, byDue, walletName, amountText, rel } );
	const fmtTime = ( ms ) => new Date( ms ).toLocaleTimeString( EX.loc(), { hour: '2-digit', minute: '2-digit' } );
	const fmtDate = ( ms ) => new Date( ms ).toLocaleDateString( EX.loc(), { day: 'numeric', month: 'short', year: 'numeric' } );
	EXA.fmtDate = fmtDate;
	const chev = UI.icon( 'chevron-right', 20 );
	const greeting = () => { const h = new Date().getHours(); const g = t( h < 12 ? 'greetMorning' : h < 18 ? 'greetAfternoon' : 'greetEvening' ); const n = ( S().settings.name || '' ).trim(); return n ? `${ g }, ${ n }` : g; };

	/** One transaction as a row. Swipe right edits, swipe left deletes; tap opens the detail. */
	// Rows reveal their actions when swiped: nothing happens until a button is tapped (see UI.initSwipe).
	const swBtn = ( action, icon, labelKey, cls ) => `<button type="button" class="sw-act ${ cls }" data-sw="${ action }" tabindex="-1" aria-hidden="true">${ UI.icon( icon, 22 ) }<span>${ esc( t( labelKey ) ) }</span></button>`;
	function txItem( x ) {
		const cur = EX.txCurrency( x );
		const info = x.type === 'transfer' ? { iconName: 'arrows-exchange', color: 'blue', name: t( 'catTransfer' ) } : EX.catInfo( x.category );
		const title = x.name || info.name;
		const meta = [ x.type === 'transfer' ? `${ walletName( x.account ) } → ${ walletName( x.toAccount ) }` : walletName( x.account ), x.note ].filter( Boolean ).join( ' · ' );
		const sign = x.type === 'income' ? '+' : x.type === 'expense' ? '−' : '';
		return `<li class="sw" data-kind="tx" data-id="${ esc( x.id ) }">
			<div class="sw-back"><div class="sw-l"></div><div class="sw-r">${ swBtn( 'edit', 'pencil', 'actEdit', 'edit' ) }${ swBtn( 'duplicate', 'copy', 'duplicateRecord', 'duplicate' ) }${ swBtn( 'del', 'trash', 'actDelete', 'del' ) }</div></div>
			<button type="button" class="sw-front item" data-act="open-tx" data-id="${ esc( x.id ) }" aria-label="${ esc( title ) }, ${ esc( sign + money( Number( x.amount ), cur ) ) }">
				${ UI.catCi( info.iconName ? info : EX.catInfo( x.category ) ) }
				<span class="mid"><b>${ esc( title ) }${ x.scannedReceipt ? `<span class="scanned-receipt-badge" title="${esc(t('scanReceipt'))}" aria-label="${esc(t('scanReceipt'))}">${UI.icon('receipt',18)}</span>` : x.photo ? UI.icon( 'paperclip', 14 ) : '' }</b><small>${ esc( meta || dayName( x.date ) ) }</small>${EXA.tagsInline(x.tags)}</span>
				<span class="a ${ x.type }">${ sign }${ esc( money( Number( x.amount ), cur ) ) }</span>
			</button></li>`;
	}
	/** One bill as a row. Swipe right to reveal Paid, left to reveal Edit and Delete; tap opens the detail. */
	function billItem( b, { showDate = true } = {} ) {
		const n = diffDays( b.next, today() );
		const cls = n < 0 ? 'late' : n === 0 ? 'now' : '';
		const snoozed = b.snooze && b.snooze > today();
		const meta = [ showDate ? rel( b.next ) : null, EX.scheduleLabel(b), b.autopay ? t( 'autopay' ) : null, snoozed ? t( 'snoozed' ) : null ].filter( Boolean ).join( ' · ' );
		return `<li class="sw ${ cls }" data-kind="bill" data-id="${ esc( b.id ) }">
			<div class="sw-back"><div class="sw-l">${ swBtn( 'paid', 'check', 'actPaid', 'paid' ) }</div><div class="sw-r">${ swBtn( 'edit', 'pencil', 'actEdit', 'edit' ) }${ swBtn( 'duplicate', 'copy', 'duplicateRecord', 'duplicate' ) }${ swBtn( 'del', 'trash', 'actDelete', 'del' ) }</div></div>
			<button type="button" class="sw-front item" data-act="open-bill" data-id="${ esc( b.id ) }" aria-label="${ esc( b.name ) }, ${ esc( amountText( b ) ) }">
				${ UI.catCi( EX.catInfo( b.category ) ) }
				<span class="mid"><b>${ esc( b.name ) }</b><small class="due">${ esc( meta ) }</small>${EXA.tagsInline(b.tags)}</span>
				<span class="a">${ esc( amountText( b ) ) }</span>
			</button></li>`;
	}
	const empty = ( icon, color, title, text, action ) => `<div class="empty">${ UI.ci( icon, color, 72 ) }<h2>${ esc( title ) }</h2><p>${ esc( text ) }</p>${ action || '' }</div>`;
	EXA.txItem = txItem; EXA.billItem = billItem;

	/* ------------------------------------------------------------------ Top bar, tab bar, side rail */

	const NAV = [ [ 'home', 'layout-dashboard', 'tabHome' ], [ 'activity', 'arrows-sort', 'tabActivity' ], [ 'bills', 'calendar-event', 'tabBills' ], [ 'reports', 'chart-pie', 'tabReports' ] ];
	const RAIL_PLAN = [ 'plan', 'target', 'tabPlan' ]; // the Plan screen has no tab on a phone (the bar is full): Home and More lead to it
	EXA.goalsDiscovery = () => S().device.goalsDiscovered ? '' : '<span class="goals-discovery" aria-hidden="true"><i></i></span>';

	function avatar() {
		if ( EX.auth.isSignedIn() ) {
			const u = EX.auth.user() || {};
			return `<button type="button" class="avatar on" data-go="more" aria-label="${ esc( t( 'accountMenu' ) ) }"><span class="who">${ esc( ( u.email || '?' ).charAt( 0 ).toUpperCase() ) }</span><span class="dot ${ EX.sync.status }"></span></button>`;
		}
		return `<button type="button" class="avatar" data-go="more" aria-label="${ esc( t( 'accountMenu' ) ) }">${ UI.icon( 'user-circle', 26 ) }</button>`;
	}
	EXA.appbar = () => {
		const v = st.view;
		if ( v === 'more' && st.more !== 'root' ) {
			const titles = { account: 'rowAccount', wallets: 'walletsTitle', categories: 'catsTitle', tags: 'tags', reminders: 'rowReminders', data: 'rowData', appearance: 'rowAppearance', install: 'rowInstall', about: 'rowAbout' };
			return `<button type="button" class="ab-btn" data-act="more-back" aria-label="${ esc( t( 'back' ) ) }">${ UI.icon( 'arrow-left', 24 ) }</button><h1 class="ab-title">${ esc( t( titles[ st.more ] ) ) }</h1>`;
		}
		const title = { home: null, activity: t( 'tabActivity' ), bills: t( 'tabBills' ), plan: t( 'planTitle' ), reports: t( 'tabReports' ), more: t( 'moreTitle' ) }[ v ];
		const left = v === 'home' ? `<div class="ab-title home"><small>${ esc( greeting() ) }</small><b>Expen<i>ity</i></b></div>` : `<h1 class="ab-title">${ esc( title ) }</h1>`;
		const right = v === 'activity' ? `<button type="button" class="ab-btn" data-act="toggle-search" aria-label="${ esc( t( st.searchOpen ? 'searchClose' : 'searchOpen' ) ) }">${ UI.icon( st.searchOpen ? 'x' : 'search', 24 ) }</button>` : '';
		return `${ left }<span class="sp"></span>${ right }${ v === 'more' ? '' : `<span class="ab-avatar">${ avatar() }</span>` }`;
	};
	EXA.tabbar = () => {
		const item = ( [ id, icon, label ] ) => `<button type="button" class="tab${ st.view === id ? ' on' : '' }" data-go="${ id }"${ st.view === id ? ' aria-current="page"' : '' }>${ UI.icon( icon, 26 ) }<span>${ esc( t( label ) ) }${ id === 'plan' ? EXA.goalsDiscovery() : '' }</span></button>`;
		return `${ item( NAV[ 0 ] ) }${ item( NAV[ 1 ] ) }<button type="button" title="${esc(S().settings.receiptScanner!==false?t('scanHoldHint'):t('addNew'))}" class="fab${ S().txs.length || S().bills.length ? '' : ' nudge' }" data-act="add" aria-label="${ esc( t( 'addNew' ) ) }">${ UI.icon( 'plus', 30 ) }</button>${ item( NAV[ 2 ] ) }${ item( NAV[ 3 ] ) }`;
	};
	EXA.rail = () => {
		const item = ( [ id, icon, label ] ) => `<button type="button" class="rail-item${ st.view === id ? ' on' : '' }" data-go="${ id }"${ st.view === id ? ' aria-current="page"' : '' }>${ UI.icon( icon, 24 ) }<span>${ esc( t( label ) ) }${ id === 'plan' ? EXA.goalsDiscovery() : '' }</span></button>`;
		return `<a class="rail-brand" href="./" aria-label="Expenity"><span id="logo"></span><b>Expen<i>ity</i></b></a>
			<button type="button" class="rail-add" data-act="add">${ UI.icon( 'plus', 24 ) }<span>${ esc( t( 'addNew' ) ) }</span></button>
			${ NAV.slice( 0, 3 ).map( item ).join( '' ) }${ item( RAIL_PLAN ) }${ item( NAV[ 3 ] ) }
			<span class="sp"></span>
			<button type="button" class="rail-item${ st.view === 'more' ? ' on' : '' }" data-go="more">${ UI.icon( 'settings', 24 ) }<span>${ esc( t( 'tabMore' ) ) }</span></button>
			<span class="rail-avatar">${ avatar() }</span>`;
	};

	/* ------------------------------------------------------------------ Promos: guest banner and install card */

	function installPlatform() {
		const ua = navigator.userAgent;
		if ( /iPhone|iPad|iPod/.test( ua ) || ( /Mac/.test( ua ) && navigator.maxTouchPoints > 1 ) ) return 'ios';
		if ( /Android/.test( ua ) ) return 'android';
		return 'desktop';
	}
	EXA.installPlatform = installPlatform;
	function installSteps() {
		if ( EXA.installEvent ) return '';
		const p = installPlatform();
		return `<p class="muted">${ esc( t( p === 'ios' ? 'installIos' : p === 'android' ? 'installAndroid' : 'installDesktop' ) ) }</p>`;
	}
	EXA.installSteps = installSteps;
	function promos() {
		let h = '';
		if ( ! EX.auth.isSignedIn() && ! S().device.bannerDismissed ) {
			h += `<section class="promo"><div class="promo-head">${ UI.ci( 'cloud-check', 'teal', 44 ) }<div><b>${ esc( t( 'guestTitle' ) ) }</b><p>${ esc( t( 'guestText' ) ) }</p></div></div><div class="btn-row"><button type="button" class="btn btn-primary" data-act="auth-create">${ esc( t( 'guestCreate' ) ) }</button><button type="button" class="btn btn-ghost" data-act="auth-signin">${ esc( t( 'guestSignIn' ) ) }</button><button type="button" class="btn btn-text" data-act="dismiss-banner">${ esc( t( 'dismiss' ) ) }</button></div></section>`;
		}
		if ( ! h && ! UI.isStandalone() && ! S().device.installDismissed && UI.isPhone() ) {
			h += `<section class="promo alt"><div class="promo-head">${ UI.ci( 'device-mobile', 'purple', 44 ) }<div><b>${ esc( t( 'installTitle' ) ) }</b><p>${ esc( t( 'installText' ) ) }</p>${ installSteps() }</div></div><div class="btn-row">${ EXA.installEvent ? `<button type="button" class="btn btn-primary" data-act="install">${ esc( t( 'installBtn' ) ) }</button>` : '' }<button type="button" class="btn btn-text" data-act="dismiss-install">${ esc( t( 'dismiss' ) ) }</button></div></section>`;
		}
		return h;
	}

	/* ------------------------------------------------------------------ Home */

	EXA.home = () => {
		const now = new Date(), y = now.getFullYear(), m = now.getMonth();
		const wallets = EX.activeAccounts();
		const total = EX.sumByCur( wallets.map( ( a ) => ( { amount: EX.balance( a ) / 100, currency: a.currency } ) ) ) || money( 0 );
		const f = EX.flow( EX.monthTxs( y, m ) );
		const inc = EX.sumByCur( f.income ), exp = EX.sumByCur( f.expense );
		const upcoming = active().sort( byDue ).slice( 0, 3 );
		// Due soon leads the page only when something is overdue or due within two days; otherwise it follows the wallets.
		const urgent = active().some( ( b ) => diffDays( b.next, today() ) <= 2 );
		const DUE = `<div class="sec-head"><h2>${ esc( t( 'dueSoon' ) ) }</h2><button type="button" class="link" data-go="bills">${ esc( t( 'seeAll' ) ) }</button></div>
			${ upcoming.length ? `<ul class="list">${ upcoming.map( ( b ) => billItem( b ) ).join( '' ) }</ul>` : `<p class="muted pad">${ esc( t( 'noDue' ) ) }</p>` }`;
		const WAL = `<div class="sec-head"><h2>${ esc( t( 'wallets' ) ) }</h2><button type="button" class="link" data-more="wallets">${ esc( t( 'ovManage' ) ) }</button></div>
			<div class="wallets">${ wallets.map( ( a ) => `<button type="button" class="wc" data-act="edit-wallet" data-id="${ esc( a.id ) }">${ UI.walletCi( a, 36 ) }<span>${ a.space ? UI.icon( 'users', 14 ) + ' ' : '' }${ esc( EX.accountName( a ) ) }</span><b>${ esc( money( EX.balance( a ) / 100, a.currency ) ) }</b></button>` ).join( '' ) }<button type="button" class="wc add" data-act="add-wallet">${ UI.icon( 'plus', 26 ) }<span>${ esc( t( 'newWallet' ) ) }</span></button></div>`;
		const recent = S().txs.slice().sort( ( a, b ) => ( a.date < b.date ? 1 : a.date > b.date ? -1 : 0 ) ).slice( 0, 5 );
		const mC = { inc: EX.mainCents( f.income ), exp: EX.mainCents( f.expense ) }, mainCur = S().settings.currency, M = ( c ) => money( c / 100, mainCur );
		const spark = [ 5, 4, 3, 2, 1, 0 ].map( ( k ) => { const d = new Date( y, m - k, 1 ), ff = EX.flow( EX.monthTxs( d.getFullYear(), d.getMonth() ) ); return { l: d.toLocaleDateString( EX.loc(), { month: 'short' } ), inc: EX.mainCents( ff.income ), exp: EX.mainCents( ff.expense ) }; } );
		const sMax = Math.max( 1, ...spark.map( ( s ) => Math.max( s.inc, s.exp ) ) );
		const rate = mC.inc > 0 ? Math.round( ( ( mC.inc - mC.exp ) / mC.inc ) * 100 ) : null;
		const count = ( str, c ) => ( str === M( c ) ? ` data-count="${ c / 100 }" data-cur="${ esc( mainCur ) }"` : '' ); // numbers roll up on entering the screen
		const totalC = EX.mainCents( wallets.map( ( a ) => ( { amount: EX.balance( a ) / 100, currency: a.currency } ) ) );
		return `<section data-home="balance"><div class="hero-flip${ st.heroFlip ? ' flipped' : '' }${st.characterRetreated?' character-retreated':''}${st.characterCollapsed?' character-collapsed':''}" data-act="flip-hero" role="button" tabindex="0" aria-pressed="${ !! st.heroFlip }" aria-label="${ esc( t( 'balanceAria' ) + '. ' + t( 'heroFlipHint' ) ) }">
			<section class="hero hero-front"><small>${ esc( t( 'ovBalance' ) ) }</small><b${ count( total, totalC ) }>${ esc( total ) }</b>
				<div class="hero-tiles"><div><span class="k">${ UI.icon( 'arrow-down-left', 18 ) } ${ esc( t( 'ovIncome' ) ) }</span><b${ count( inc, mC.inc ) }>${ esc( inc ) }</b></div><div><span class="k">${ UI.icon( 'arrow-up-right', 18 ) } ${ esc( t( 'ovExpenses' ) ) }</span><b${ count( exp, mC.exp ) }>${ esc( exp ) }</b></div></div><i class="flip-ic" aria-hidden="true">${ UI.icon( 'refresh', 18 ) }</i></section>
			<section class="hero hero-back" aria-hidden="true"><small>${ esc( t( 'heroBackTitle' ) ) }</small><b>${ esc( M( mC.inc - mC.exp ) ) }</b>
				<div class="mini-bars">${ spark.map( ( s ) => `<div><span class="mb-in" style="height:${ Math.max( 4, Math.round( ( s.inc / sMax ) * 100 ) ) }%"></span><span class="mb-out" style="height:${ Math.max( 4, Math.round( ( s.exp / sMax ) * 100 ) ) }%"></span><em>${ esc( s.l ) }</em></div>` ).join( '' ) }</div>
				<div class="hero-tiles"><div><span class="k">${ esc( t( 'heroRate' ) ) }</span><b>${ rate == null ? '—' : rate + '%' }</b></div><div><span class="k">${ esc( t( 'heroPerDay' ) ) }</span><b>${ esc( M( Math.round( mC.exp / Math.max( 1, now.getDate() ) ) ) ) }</b></div></div><i class="flip-ic" aria-hidden="true">${ UI.icon( 'refresh', 18 ) }</i></section></div>
			</section><section data-home="welcome">${ promos() }</section>
			${ urgent ? `<section data-home="due">${DUE}</section>` : `<section data-home="wallets">${WAL}</section>` }
			${ urgent ? `<section data-home="ideas">${EXA.ideasHome()}</section>` : `<section data-home="due">${DUE}</section>` }
			${ urgent ? `<section data-home="wallets">${WAL}</section>` : `<section data-home="ideas">${EXA.ideasHome()}</section>` }
			<section data-home="goals">${ EXA.planHome() }</section><section data-home="recent">
			<div class="sec-head"><h2>${ esc( t( 'ovRecent' ) ) }</h2><button type="button" class="link" data-go="activity">${ esc( t( 'seeAll' ) ) }</button></div>
			${ recent.length ? `<ul class="list">${ recent.map( txItem ).join( '' ) }</ul>` : `<p class="muted pad">${ esc( t( 'txNoneHint' ) ) }</p>` }</section>`;
	};

	/* ------------------------------------------------------------------ Activity */

	EXA.activity = () => {
		const schedules = st.txFilter.type === 'income' && st.incomeMode === 'recurring';
		const incomeNav = st.txFilter.type === 'income' ? `<div class="segm income-modes" role="tablist">${ [ ['recorded','incomeRecorded','arrows-sort'], ['recurring','incomeRecurring','repeat'] ].map(([id,label,ic]) => `<button type="button" role="tab" aria-selected="${ ( st.incomeMode || 'recorded' ) === id }" class="${ ( st.incomeMode || 'recorded' ) === id ? 'on' : '' }" data-income-mode="${ id }">${ UI.icon(ic,18) } ${ esc(t(label)) }</button>`).join('') }</div>` : '';
		const y = Math.floor( st.txMonth / 12 ), m = st.txMonth % 12, fl = st.txFilter;
		let list = EX.monthTxs( y, m );
		if(EXA.tagFilter) list=list.filter(x=>(x.tags||[]).includes(EXA.tagFilter));
		if ( fl.type !== 'all' ) list = list.filter( ( x ) => x.type === fl.type );
		if ( fl.account ) list = list.filter( ( x ) => x.account === fl.account || x.toAccount === fl.account );
		const q = EX.fold( fl.q.trim() );
		if ( q ) list = list.filter( ( x ) => EX.fold( `${ x.name || '' } ${ x.note || '' } ${(x.tags || []).join(' ')} ${ x.type === 'transfer' ? '' : EX.catInfo( x.category ).name }` ).includes( q ) );
		const f = EX.flow( list );
		const groups = [];
		list.forEach( ( x ) => { const g = groups[ groups.length - 1 ]; if ( g && g.date === x.date ) g.items.push( x ); else groups.push( { date: x.date, items: [ x ] } ); } );
		const chip = ( v, label ) => `<button type="button" class="chip${ fl.type === v ? ' on' : '' }" data-txtype="${ v }">${ esc( label ) }</button>`;
		const net = money( ( sumMain( f.income ) - sumMain( f.expense ) ) / 100, mainCur() );
		const monthHeader = `<div class="monthbar"><button type="button" class="ab-btn" data-txmonth="-1" aria-label="${ esc( t( 'prevMonth' ) ) }">${ UI.icon( 'chevron-left', 24 ) }</button><b>${ esc( monthName( y, m ) ) }</b><button type="button" class="ab-btn" data-txmonth="1" aria-label="${ esc( t( 'nextMonth' ) ) }">${ UI.icon( 'chevron-right', 24 ) }</button></div>
			<div class="sumrow"><div class="in"><small>${ esc( t( 'ovIncome' ) ) }</small><b>${ esc( EX.sumByCur( f.income ) ) }</b></div><div><small>${ esc( t( 'ovExpenses' ) ) }</small><b>${ esc( EX.sumByCur( f.expense ) ) }</b></div><div><small>${ esc( t( 'ovNet' ) ) }</small><b>${ esc( net ) }</b></div></div>`;
		return `${EXA.entryReceipt?EXA.entryReceipt():''}${ schedules ? '' : monthHeader }
			${ st.searchOpen ? `<div class="searchbar">${ UI.icon( 'search', 22 ) }<input id="txSearch" type="search" value="${ esc( fl.q ) }" placeholder="${ esc( t( 'txSearchPh' ) ) }" aria-label="${ esc( t( 'txSearchPh' ) ) }" autocomplete="off"></div>` : '' }
			<div class="chips" role="group">${ chip( 'all', t( 'typeAll' ) ) }${ chip( 'expense', t( 'typeExpenses' ) ) }${ chip( 'income', t( 'typeIncomes' ) ) }${ chip( 'transfer', t( 'typeTransfer' ) ) }${EXA.tagFilterHtml()}<label class="chip select${ fl.account ? ' on' : '' }">${ UI.icon( 'wallet', 18 ) }<select id="txWalletFilter" aria-label="${ esc( t( 'filterWallet' ) ) }"><option value="">${ esc( t( 'txAllWallets' ) ) }</option>${ S().accounts.map( ( a ) => `<option value="${ esc( a.id ) }"${ fl.account === a.id ? ' selected' : '' }>${ esc( EX.accountName( a ) ) }</option>` ).join( '' ) }</select></label></div>
			${ incomeNav }
			${ schedules ? EXA.incomeSchedules() : groups.length ? groups.map( ( g ) => `<section class="grp"><h2 class="sticky">${ esc( dayName( g.date ) ) }</h2><ul class="list">${ g.items.map( txItem ).join( '' ) }</ul></section>` ).join( '' ) + ( UI.isPhone() ? `<p class="hint">${ esc( t( 'swipeHint' ) ) }</p>` : '' ) : empty( 'arrows-sort', 'teal', t( 'txNone' ), t( 'txNoneHint' ), `<button type="button" class="btn btn-primary" data-act="add">${ esc( t( 'addTx' ) ) }</button>` ) }`;
	};

	/* ------------------------------------------------------------------ Bills */

	function billsToday() {
		const list = active().sort( byDue );
		const td = today();
		if ( ! S().bills.length ) {
			return `${ empty( 'calendar-event', 'amber', t( 'emptyH' ), t( 'emptyP' ), `<button type="button" class="btn btn-primary" data-act="add-bill">${ esc( t( 'addTitle' ) ) }</button>` ) }
				<div class="chips wrap center">${ EX.TEMPLATES.map( ( x, i ) => `<button type="button" class="chip" data-tpl="${ i }">${ UI.icon( EX.CAT_STYLE[ x[ 1 ] ][ 0 ], 18 ) } ${ esc( t( x[ 0 ] ) ) }</button>` ).join( '' ) }</div>
				<p class="muted center small">${ esc( t( 'emptySample' ) ) } <button type="button" class="link" data-act="sample">${ esc( t( 'loadSample' ) ) }</button> ${ esc( t( 'emptySample2' ) ) }</p>`;
		}
		const late = list.filter( ( b ) => b.next < td );
		const week = list.filter( ( b ) => b.next >= td && b.next <= addDays( td, 7 ) );
		const monthEnd = iso( new Date( new Date().getFullYear(), new Date().getMonth() + 1, 0 ) );
		const restMonth = list.filter( ( b ) => b.next > addDays( td, 7 ) && b.next <= monthEnd );
		const later = list.filter( ( b ) => b.next > addDays( td, 7 ) && b.next > monthEnd );
		const monthAll = list.flatMap( ( b ) => EX.occurrences( b, monthEnd ).map( () => ( { currency: b.currency, amount: b.amount } ) ) );
		const tile = ( label, val, sub, cls = '' ) => `<div class="tile ${ cls }"><small>${ esc( label ) }</small><b>${ esc( val ) }</b><span>${ esc( sub ) }</span></div>`;
		const sec = ( title, items, cls = '' ) => items.length ? `<section class="grp ${ cls }"><h2 class="sticky">${ esc( title ) } <span class="count">${ items.length }</span></h2><ul class="list">${ items.map( ( b ) => billItem( b ) ).join( '' ) }</ul></section>` : '';
		const paid = S().txs.filter( ( x ) => x.billId ).sort( ( a, b ) => ( a.date < b.date ? 1 : -1 ) ).slice( 0, 5 );
		return `<div class="tiles">${ tile( t( 'statOverdue' ), EX.sumByCur( late ), late.length ? t( 'billsN', { n: late.length } ) : t( 'allClear' ), late.length ? 'bad' : 'good' ) }${ tile( t( 'statWeek' ), EX.sumByCur( week ), t( 'billsN', { n: week.length } ) ) }</div>
			${ sec( t( 'secOverdue' ), late, 'late' ) }${ sec( t( 'secWeek' ), week ) }${ sec( t( 'secLaterMonth' ), restMonth ) }${ sec( t( 'secComing' ), later ) }
			${ list.length ? ( UI.isPhone() ? `<p class="hint">${ esc( t( 'swipeHintBills' ) ) }</p>` : '' ) : `<p class="muted pad">${ esc( t( 'nothingOpen' ) ) }</p>` }
			${ paid.length ? `<section class="grp"><h2 class="sticky">${ esc( t( 'recentlyPaid' ) ) }</h2><ul class="list">${ paid.map( txItem ).join( '' ) }</ul></section>` : '' }
			<p class="muted small pad">${ esc( t( 'statMonth' ) ) }: <b>${ esc( EX.sumByCur( monthAll ) ) }</b></p>`;
	}
	function billsCalendar() {
		const y = Math.floor( st.calMonth / 12 ), m = st.calMonth % 12;
		const first = new Date( y, m, 1 );
		const startPad = ( first.getDay() + 6 ) % 7;
		const last = iso( new Date( y, m, EX.dim( y, m ) ) );
		const map = {};
		active().forEach( ( b ) => EX.occurrences( b, last ).forEach( ( d ) => { if ( d >= iso( first ) ) ( map[ d ] = map[ d ] || [] ).push( b ); } ) );
		const paidMap = {};
		S().txs.filter( ( x ) => x.billId ).forEach( ( p ) => { ( paidMap[ p.date ] = paidMap[ p.date ] || [] ).push( p ); } );
		const cells = [];
		for ( let i = 0; i < startPad; i++ ) cells.push( '<div class="cell blank"></div>' );
		for ( let d = 1; d <= EX.dim( y, m ); d++ ) {
			const s = iso( new Date( y, m, d ) );
			const items = map[ s ] || [], pays = paidMap[ s ] || [];
			const cls = [ 'cell', s === today() ? 'today' : '', s === st.calDay ? 'sel' : '', s < today() && items.length ? 'late' : '' ].join( ' ' );
			cells.push( `<button type="button" class="${ cls }" data-day="${ s }" aria-label="${ esc( t( 'dayAria', { date: dayName( s ), due: items.length, paid: pays.length } ) ) }"><span class="num">${ d }</span><span class="dots">${ items.slice( 0, 3 ).map( () => '<i></i>' ).join( '' ) }${ pays.length ? '<i class="ok"></i>' : '' }</span></button>` );
		}
		const wd = [ 0, 1, 2, 3, 4, 5, 6 ].map( ( i ) => new Date( 2024, 0, 1 + i ).toLocaleDateString( EX.loc(), { weekday: 'narrow' } ) );
		const sel = st.calDay || ( nowMonth() === st.calMonth ? today() : null );
		const selItems = sel ? ( map[ sel ] || [] ) : [], selPaid = sel ? ( paidMap[ sel ] || [] ) : [];
		const monthItems = Object.values( map ).flat();
		return `<div class="monthbar"><button type="button" class="ab-btn" data-cal="-1" aria-label="${ esc( t( 'prevMonth' ) ) }">${ UI.icon( 'chevron-left', 24 ) }</button><b>${ esc( monthName( y, m ) ) }</b><button type="button" class="ab-btn" data-cal="1" aria-label="${ esc( t( 'nextMonth' ) ) }">${ UI.icon( 'chevron-right', 24 ) }</button></div>
			<p class="muted small center">${ esc( t( 'dueMonth' ) ) } <b>${ esc( EX.sumByCur( monthItems ) ) }</b></p>
			<div class="cal" role="grid">${ wd.map( ( w ) => `<div class="dow" role="columnheader">${ esc( w ) }</div>` ).join( '' ) }${ cells.join( '' ) }</div>
			<section class="grp"><h2 class="sticky">${ sel ? esc( dayName( sel ) ) : esc( t( 'pickDay' ) ) }</h2>
			${ selItems.length ? `<ul class="list">${ selItems.map( ( b ) => billItem( Object.assign( {}, b, { next: sel } ), { showDate: false } ) ).join( '' ) }</ul>` : `<p class="muted pad">${ esc( t( 'nothingDue' ) ) }</p>` }
			${ selPaid.length ? `<ul class="list">${ selPaid.map( txItem ).join( '' ) }</ul>` : '' }</section>`;
	}
	EXA.bills = () => {
		const seg = ( id, label ) => `<button type="button" class="${ st.billsMode === id ? 'on' : '' }" data-billsmode="${ id }" role="tab" aria-selected="${ st.billsMode === id }">${ esc( label ) }</button>`;
		return `<div class="segm" role="tablist">${ seg( 'list', t( 'modeList' ) ) }${ seg( 'calendar', t( 'tabCalendar' ) ) }</div>${ st.billsMode === 'calendar' ? billsCalendar() : billsToday() }`;
	};

	/* ------------------------------------------------------------------ Reports */

	const TINT_HEX = { blue: '#3b82f6', amber: '#f59e0b', purple: '#8b5cf6', teal: '#14b8a6', red: '#ef4444', green: '#22c55e', pink: '#ec4899', gray: '#94a3b8' };
	function donut( list, total ) {
		const R = 54, C = 2 * Math.PI * R;
		let off = 0;
		const arcs = list.slice( 0, 7 ).map( ( [ k, v ] ) => { const len = ( v / total ) * C; const a = `<circle cx="70" cy="70" r="${ R }" fill="none" stroke="${ TINT_HEX[ EX.catInfo( k ).color ] || '#94a3b8' }" stroke-width="18" stroke-dasharray="${ Math.max( 0, len - 2 ).toFixed( 2 ) } ${ ( C - Math.max( 0, len - 2 ) ).toFixed( 2 ) }" stroke-dashoffset="${ ( -off ).toFixed( 2 ) }" transform="rotate(-90 70 70)"></circle>`; off += len; return a; } ).join( '' );
		return `<svg class="donut" viewBox="0 0 140 140" role="img" aria-label="${ esc( t( 'repSpent' ) ) }"><circle cx="70" cy="70" r="${ R }" fill="none" stroke="var(--line)" stroke-width="18"></circle>${ arcs }<text x="70" y="66" text-anchor="middle" class="d-k">${ esc( t( 'repSpent' ) ) }</text><text x="70" y="86" text-anchor="middle" class="d-v">${ esc( money( total / 100, mainCur() ) ) }</text></svg>`;
	}
	EXA.reports = () => {
		const td = today(), main = mainCur();
		if ( ! S().bills.length && ! S().txs.length ) return empty( 'chart-pie', 'purple', t( 'tabReports' ), t( 'emptyIns' ) );
		const bills = active();
		const months = [];
		const ref = new Date();
		for ( let i = 5; i >= 0; i-- ) {
			const d = new Date( ref.getFullYear(), ref.getMonth() - i, 1 );
			const f = EX.flow( EX.monthTxs( d.getFullYear(), d.getMonth() ) );
			months.push( { label: d.toLocaleDateString( EX.loc(), { month: 'short' } ), inc: sumMain( f.income ), exp: sumMain( f.expense ) } );
		}
		const cfMax = Math.max( 1, ...months.map( ( x ) => Math.max( x.inc, x.exp ) ) );
		const from = st.repPeriod === 'month' ? td.slice( 0, 7 ) + '-01' : st.repPeriod === '3m' ? iso( new Date( ref.getFullYear(), ref.getMonth() - 2, 1 ) ) : td.slice( 0, 4 ) + '-01-01';
		const c = {};
		S().txs.filter( ( x ) => x.type === 'expense' && EX.txCurrency( x ) === main && x.date >= from ).forEach( ( x ) => { c[ x.category ] = ( c[ x.category ] || 0 ) + EX.cents( x.amount ); } );
		const cats = Object.entries( c ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] );
		const total = cats.reduce( ( s, x ) => s + x[ 1 ], 0 ) || 1;
		const weeks = [];
		for ( let w = 0; w < 13; w++ ) {
			const wf = addDays( td, w * 7 ), wt = addDays( td, w * 7 + 6 );
			const items = bills.flatMap( ( b ) => EX.occurrences( b, wt ).filter( ( d ) => d >= wf ).map( () => b ) );
			weeks.push( { from: wf, items, total: items.reduce( ( s, b ) => s + ( Number( b.amount ) || 0 ), 0 ) } );
		}
		const wMax = Math.max( 1, ...weeks.map( ( w ) => w.total ) );
		const upTo = ( n ) => weeks.slice( 0, Math.ceil( n / 7 ) );
		const sum = ( n ) => EX.sumByCur( upTo( n ).flatMap( ( w ) => w.items ) );
		const cnt = ( n ) => upTo( n ).reduce( ( k, w ) => k + w.items.length, 0 );
		const subs = bills.filter( ( b ) => b.category === 'subscriptions' && EX.scheduleFactor(b) ).map( ( b ) => ( { b, yearly: ( Number( b.amount ) || 0 ) * EX.scheduleFactor(b) } ) ).sort( ( a, b ) => b.yearly - a.yearly );
		const changes = [];
		S().bills.forEach( ( b ) => {
			const ps = S().txs.filter( ( p ) => p.billId === b.id && Number( p.amount ) ).sort( ( a, z ) => ( ( a.due || a.date ) < ( z.due || z.date ) ? -1 : 1 ) );
			if ( ps.length >= 2 ) { const a = Number( ps[ ps.length - 2 ].amount ), z = Number( ps[ ps.length - 1 ].amount ); if ( a && Math.abs( z - a ) / a >= 0.05 ) changes.push( { b, a, c: z } ); }
		} );
		const per = ( id, label ) => `<button type="button" class="${ st.repPeriod === id ? 'on' : '' }" data-period="${ id }" role="tab" aria-selected="${ st.repPeriod === id }">${ esc( label ) }</button>`;
		return `<div class="segm" role="tablist">${ per( 'month', t( 'periodMonth' ) ) }${ per( '3m', t( 'period3' ) ) }${ per( 'year', t( 'periodYear' ) ) }</div>
			<section class="card"><h2>${ esc( t( 'ovTopCats' ) ) }</h2>${ cats.length ? `<div class="donut-wrap">${ donut( cats, total ) }<ul class="legend">${ cats.slice( 0, 6 ).map( ( [ k, v ] ) => `<li>${ UI.catCi( EX.catInfo( k ), 28 ) }<span>${ esc( EX.catInfo( k ).name ) }</span><b>${ Math.round( ( v / total ) * 100 ) }%</b></li>` ).join( '' ) }</ul></div>` : `<p class="muted">${ esc( t( 'noPaid' ) ) }</p>` }</section>
			<section class="card"><h2>${ esc( t( 'cashFlow' ) ) }</h2><div class="cf" role="img" aria-label="${ esc( t( 'cashFlow' ) ) }">${ months.map( ( x ) => `<div class="cf-col"><div class="cf-bars"><i class="in" style="height:${ Math.round( ( x.inc / cfMax ) * 100 ) }%" title="${ esc( t( 'ovIncome' ) + ': ' + money( x.inc / 100, main ) ) }"></i><i class="out" style="height:${ Math.round( ( x.exp / cfMax ) * 100 ) }%" title="${ esc( t( 'ovExpenses' ) + ': ' + money( x.exp / 100, main ) ) }"></i></div><small>${ esc( x.label ) }</small></div>` ).join( '' ) }</div><p class="muted small"><span class="key in"></span>${ esc( t( 'ovIncome' ) ) } <span class="key out"></span>${ esc( t( 'ovExpenses' ) ) }</p></section>
			${ bills.length ? `<section class="card"><h2>${ esc( t( 'repForecast' ) ) }</h2><div class="tiles three"><div class="tile"><small>${ esc( t( 'next30' ) ) }</small><b>${ esc( sum( 28 ) ) }</b><span>${ esc( t( 'paymentsN', { n: cnt( 28 ) } ) ) }</span></div><div class="tile"><small>${ esc( t( 'next60' ) ) }</small><b>${ esc( sum( 63 ) ) }</b><span>${ esc( t( 'paymentsN', { n: cnt( 63 ) } ) ) }</span></div><div class="tile"><small>${ esc( t( 'next90' ) ) }</small><b>${ esc( sum( 91 ) ) }</b><span>${ esc( t( 'paymentsN', { n: cnt( 91 ) } ) ) }</span></div></div>
				<div class="bars" role="img" aria-label="${ esc( t( 'barsAria' ) ) }">${ weeks.map( ( w ) => `<div class="bar"><i style="height:${ Math.round( ( w.total / wMax ) * 100 ) }%" title="${ esc( dayName( w.from ) + ': ' + EX.sumByCur( w.items ) ) }"></i><small>${ parse( w.from ).getDate() }/${ parse( w.from ).getMonth() + 1 }</small></div>` ).join( '' ) }</div></section>` : '' }
			${ changes.length ? `<section class="card"><h2>${ esc( t( 'priceChanges' ) ) }</h2><ul class="plain">${ changes.map( ( x ) => `<li>${ t( 'priceItem', { name: esc( x.b.name ), a: esc( money( x.a, x.b.currency ) ), c: esc( money( x.c, x.b.currency ) ), pct: ( x.c > x.a ? '+' : '' ) + Math.round( ( ( x.c - x.a ) / x.a ) * 100 ) + '%' } ) }</li>` ).join( '' ) }</ul></section>` : '' }
			<section class="card"><h2>${ esc( t( 'subs' ) ) }</h2>${ subs.length ? `<ul class="plain">${ subs.map( ( s ) => `<li>${ t( 'subLine', { name: esc( s.b.name ), year: esc( money( s.yearly, s.b.currency ) ), each: esc( money( Number( s.b.amount ) || 0, s.b.currency ) ), rep: esc( EX.repeatLabel( s.b.repeat ).toLowerCase() ) } ) }</li>` ).join( '' ) }</ul><p class="small">${ t( 'subTotal', { total: esc( EX.sumByCur( subs.map( ( s ) => ( { currency: s.b.currency, amount: s.yearly } ) ) ) ) } ) }</p>` : `<p class="muted">${ esc( t( 'noSubs' ) ) }</p>` }</section>`;
	};

	/* ------------------------------------------------------------------ More (settings) */

	function syncLine() {
		const s = EX.sync.status;
		const txt = s === 'ok' ? t( 'syncOk' ) + ( EX.sync.last ? ' · ' + t( 'syncLast', { time: fmtTime( EX.sync.last ) } ) : '' ) : s === 'syncing' || s === 'idle' ? t( 'syncing' ) : s === 'offline' ? t( 'syncOffline' ) : s === 'error' ? t( 'syncError' ) : t( 'syncOff' );
		return `<span class="dot ${ s }"></span>${ esc( txt ) }`;
	}
	EXA.syncLine = syncLine;
	const row = ( more, icon, color, title, sub ) => `<button type="button" class="mrow" data-more="${ more }">${ UI.ci( icon, color, 40 ) }<span class="mid"><b>${ esc( title ) }</b>${ sub ? `<small>${ esc( sub ) }</small>` : '' }</span>${ chev }</button>`;

	const updateCard = () => `<section class="card"><h2>${ esc( t( 'updTitle' ) ) }</h2><p class="muted small" id="updLine">${ esc( t( 'aboutVersion', { v: window.EXPENITY_VERSION || '0.4' } ) ) }</p><div class="btn-row"><button type="button" class="btn btn-ghost" id="updBtn" data-act="check-update">${ UI.icon( 'refresh', 20 ) } ${ esc( t( 'updCheck' ) ) }</button><button type="button" class="ab-btn" data-release-notes aria-label="${esc(EXA.label('changelog'))}" title="${esc(EXA.label('changelog'))}">${UI.icon('notes',22)}</button></div></section>`;
	function accountView() {
		if ( ! EX.auth.isSignedIn() ) {
			return `<section class="card"><p class="muted">${ esc( t( 'acctGuest' ) ) }</p><div class="btn-row stack"><button type="button" class="btn btn-primary" data-act="auth-create">${ esc( t( 'createAccount' ) ) }</button><button type="button" class="btn btn-ghost" data-act="auth-signin">${ esc( t( 'signIn' ) ) }</button></div></section>${ updateCard() }${EXA.installGuideEntry()}`;
		}
		const u = EX.auth.user() || {}, d = st.devCache, pk = d ? d.passkeys : [], ss = d ? d.sessions : [], left = EX.auth.codesLeft();
		return `<section class="card"><p><b>${ esc( t( 'acctSignedIn', { email: u.email || '' } ) ) }</b></p><p class="muted small" id="syncLine">${ syncLine() }</p><div class="btn-row"><button type="button" class="btn btn-ghost" data-act="sync-now">${ UI.icon( 'refresh', 20 ) } ${ esc( t( 'syncNow' ) ) }</button></div></section>
			<section class="card"><h2>${ esc( t( 'devPasskeys' ) ) }</h2><ul class="plain flat">${ pk.map( ( p ) => `<li><span>${ UI.icon( 'key', 20 ) } <b>${ esc( p.label ) }</b><small class="muted"> ${ esc( t( 'devAdded', { date: fmtDate( p.createdAt ) } ) ) } · ${ esc( p.lastUsed ? t( 'devUsed', { date: fmtDate( p.lastUsed ) } ) : t( 'devNever' ) ) }</small></span>${ pk.length > 1 ? `<button type="button" class="btn btn-ghost btn-sm" data-act="rm-passkey" data-id="${ esc( p.id ) }">${ esc( t( 'devRemove' ) ) }</button>` : '' }</li>` ).join( '' ) }</ul><div class="btn-row"><button type="button" class="btn btn-ghost" data-act="add-passkey">${ esc( t( 'devAdd' ) ) }</button></div></section>
			<section class="card"><h2>${ esc( t( 'devSessions' ) ) }</h2><ul class="plain flat">${ ss.map( ( s ) => `<li><span>${ UI.icon( 'devices', 20 ) } <small class="muted">${ esc( fmtDate( s.createdAt ) ) }</small> ${ s.current ? `<b>${ esc( t( 'devThis' ) ) }</b>` : '' }</span>${ s.current ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-act="rm-session" data-id="${ esc( s.id ) }">${ esc( t( 'devSignOut' ) ) }</button>` }</li>` ).join( '' ) }</ul></section>
			<section class="card"><h2>${ esc( t( 'devCodes' ) ) }</h2><p class="muted small">${ left == null ? '' : esc( t( 'codesLeft', { n: left } ) ) }</p><div class="btn-row"><button type="button" class="btn btn-ghost" data-act="new-codes">${ esc( t( 'devCodesBtn' ) ) }</button></div></section>
			<section class="card"><div class="btn-row"><button type="button" class="btn btn-ghost" data-act="sign-out">${ UI.icon( 'logout', 20 ) } ${ esc( t( 'signOut' ) ) }</button></div></section>
			<section class="card"><h2>${ esc( t( 'photoStorage' ) ) }</h2><p class="muted small">${ esc( t( 'photoDeleteHelp' ) ) }</p><button type="button" class="btn btn-danger-ghost" data-act="delete-photos">${ UI.icon( 'trash', 20 ) } ${ esc( t( 'photoDeleteAll' ) ) }</button></section>
			<section class="card danger"><h2>${ esc( t( 'devDelete' ) ) }</h2><p class="muted small">${ esc( t( 'devDeleteText' ) ) }</p><div class="btn-row"><button type="button" class="btn btn-danger" data-act="delete-account">${ esc( t( 'devDelete' ) ) }</button></div></section>
			${ updateCard() }${EXA.installGuideEntry()}`;
	}
	function remindersView() {
		const n = typeof Notification === 'undefined' ? null : Notification.permission, on = S().device.notify && n === 'granted';
		return `<section class="card"><label class="f"><span>${ esc( t( 'sDefLead' ) ) }</span><select id="setLead">${ EX.LEADS.map( ( l ) => `<option value="${ l }"${ l === S().settings.lead ? ' selected' : '' }>${ esc( t( 'lead' + l ) ) }</option>` ).join( '' ) }</select></label>
			<label class="f"><span>${ esc( t( 'sMainCur' ) ) }</span><input id="setCur" list="curList" maxlength="3" value="${ esc( S().settings.currency ) }"></label></section>
			${ EXA.pushCard() }
			${ EXA.push.state() === 'on' ? '' : `<section class="card"><h2>${ esc( t( 'sNotif' ) ) }</h2><p class="muted small">${ esc( n === null ? t( 'notifNone' ) : n === 'denied' ? t( 'notifDenied' ) : t( 'notifDesc' ) ) }</p><div class="btn-row"><button type="button" class="btn ${ on ? 'btn-ghost' : 'btn-primary' }" id="notifyBtn" ${ n === null || n === 'denied' ? 'disabled' : '' }>${ esc( on ? t( 'turnOff' ) : t( 'turnOn' ) ) }</button></div></section>` }
			<section class="card"><h2>${ esc( t( 'sClosed' ) ) }</h2><p class="muted small">${ esc( t( 'sClosedDesc' ) ) }</p><div class="btn-row"><button type="button" class="btn btn-primary" id="icsBtn">${ UI.icon( 'calendar-plus', 20 ) } ${ esc( t( 'dlIcs' ) ) }</button></div></section>`;
	}
	function walletsView() {
		return `<ul class="list">${ S().accounts.map( ( a ) => `<li><button type="button" class="item" data-act="edit-wallet" data-id="${ esc( a.id ) }">${ UI.walletCi( a ) }<span class="mid"><b>${ esc( EX.accountName( a ) ) }</b><small>${ esc( a.currency ) }${ a.archived ? ' · ' + esc( t( 'archivedTag' ) ) : '' }${ a.space ? ' · ' + esc( t( 'sharedTag' ) ) + ' · ' + esc( t( 'role' + EX.role( a ).charAt( 0 ).toUpperCase() + EX.role( a ).slice( 1 ) ) ) : '' }</small></span><span class="a">${ esc( money( EX.balance( a ) / 100, a.currency ) ) }</span></button></li>` ).join( '' ) }</ul>
			<div class="btn-row"><button type="button" class="btn btn-primary" data-act="add-wallet">${ UI.icon( 'plus', 20 ) } ${ esc( t( 'walletAdd' ) ) }</button><button type="button" class="btn btn-ghost" data-act="join-wallet">${ UI.icon( 'users', 20 ) } ${ esc( t( 'joinTitle' ) ) }</button></div>`;
	}
	function categoriesView() {
		const custom = S().categories;
		return `<p class="muted pad">${ esc( t( 'catCustomNote' ) ) }</p><details class="catalog-builtins"><summary>${esc(t('catalogBuiltIn'))} (${EX.EXPENSE_CATS.length+EX.INCOME_CATS.length})</summary>${EXA.groupedCategories(EX.catList('expense').concat(EX.catList('income')).filter((c,i,a)=>a.findIndex(x=>x.key===c.key)===i&&!custom.some(x=>x.id===c.key)),c=>`<div class="catalog-category-label">${UI.catCi(c,30)}<span>${esc(c.name)}</span></div>`)}</details>${ custom.length ? `<ul class="list">${ custom.map( ( c ) => `<li><div class="item">${ UI.catCi( EX.catInfo( c.id ) ) }<span class="mid"><b>${ esc( c.name ) }</b><small>${ esc( t( c.type === 'income' ? 'typeIncome' : 'typeExpense' ) ) }</small></span><button type="button" class="ab-btn" data-edit-category="${esc(c.id)}" aria-label="${esc(t('actEdit'))}">${UI.icon('pencil',20)}</button><button type="button" class="btn btn-ghost btn-sm" data-act="del-cat" data-id="${ esc( c.id ) }">${ esc( t( 'del' ) ) }</button></div></li>` ).join( '' ) }</ul>` : `<p class="muted pad">${ esc( t( 'catNone' ) ) }</p>` }
			<div class="btn-row"><button type="button" class="btn btn-primary" data-act="add-cat">${ UI.icon( 'plus', 20 ) } ${ esc( t( 'catAdd' ) ) }</button></div>`;
	}
	function dataView() {
		return `<section class="card"><p class="muted small">${ esc( t( 'sDataDesc', { b: S().bills.length, p: S().txs.length } ) ) }</p><div class="btn-row stack"><button type="button" class="btn btn-ghost" id="expJson">${ UI.icon( 'database-export', 20 ) } ${ esc( t( 'dlBackup' ) ) }</button><button type="button" class="btn btn-ghost" id="expCsv">${ UI.icon( 'file-export', 20 ) } ${ esc( t( 'dlCsv2' ) ) }</button><label class="btn btn-ghost file">${ UI.icon( 'upload', 20 ) } ${ esc( t( 'restore' ) ) }<input type="file" id="impJson" accept="application/json,.json" hidden></label></div></section>
			${ EX.auth.isSignedIn() ? '' : `<section class="card danger"><h2>${ esc( t( 'sDanger' ) ) }</h2><p class="muted small">${ esc( t( 'sDangerDesc' ) ) }</p><div class="btn-row"><button type="button" class="btn btn-danger" id="wipeBtn">${ esc( t( 'wipe' ) ) }</button></div></section>` }`;
	}
	function appearanceView() {
		return `<section class="card"><h2>${ esc( t( 'themesTitle' ) ) }</h2>${ EXA.themePicker() }</section>
			<section class="card"><h2>${ esc( t( 'setupMotion' ) ) }</h2><div class="chips wrap">${ [ 'auto', 'full', 'reduced', 'off' ].map( ( m ) => `<button type="button" class="chip big${ ( S().device.motion || 'auto' ) === m ? ' on' : '' }" data-motion-set="${ m }">${ esc( t( 'motion' + m.charAt( 0 ).toUpperCase() + m.slice( 1 ) ) ) }</button>` ).join( '' ) }</div><p class="muted small">${ esc( t( 'motionHint' ) ) }</p></section>
			<section class="card"><h2>${ esc( t( 'sLanguage' ) ) }</h2><div class="chips wrap">${ Object.keys( EX.I18N.langs ).map( ( k ) => `<button type="button" class="chip big${ k === EX.lang() ? ' on' : '' }" data-lang="${ k }" lang="${ k }">${ UI.icon( 'language', 20 ) } ${ esc( EX.I18N.langs[ k ].langName ) }</button>` ).join( '' ) }</div></section>`;
	}
	function installView() {
		const installed=UI.isStandalone()?`<p>${esc(t('installDone'))}</p>`:'';
		return `<section class="card"><h2>${ esc( t( 'installTitle' ) ) }</h2><p class="muted">${ esc( t( 'installText' ) ) }</p>${installed}${EXA.installGuides()}${ EXA.installEvent ? `<div class="btn-row"><button type="button" class="btn btn-primary" data-act="install">${ esc( t( 'installBtn' ) ) }</button></div>` : '' }</section>`;
	}
	function aboutView() {
		const L = ( href, label, icon ) => `<a class="mrow" href="${ href }" target="_blank" rel="noopener noreferrer">${ UI.ci( icon, 'gray', 40 ) }<span class="mid"><b>${ esc( label ) }</b></span>${ UI.icon( 'link', 18 ) }</a>`;
		return `<section class="card"><h2>${ esc( t( 'aboutTitle' ) ) }</h2><p class="muted">${ esc( t( 'aboutText' ) ).replace('George Stathopoulos','<a class="creator-link" href="https://george-stathopoulos.github.io/" target="_blank" rel="noopener noreferrer">George Stathopoulos</a>') }</p><p class="muted small">${ esc( t( 'aboutVersion', { v: window.EXPENITY_VERSION || '0.3' } ) ) }</p></section>
			<div class="list">${ L( 'https://expenity.github.io/expenity/docs/', t( 'aboutHelp' ), 'help-circle' ) }${ L( 'https://george-stathopoulos.github.io/blog/', t( 'aboutBlog' ), 'notes' ) }${ L( 'https://george-stathopoulos.github.io/', t( 'aboutProjects' ), 'category-2' ) }${ L( 'https://github.com/expenity/expenity', t( 'aboutSource' ), 'brand-github' ) }</div>
			<p class="muted small pad">${ esc( t( 'footerNote' ) ) }</p>
			${ updateCard() }`;
	}
	EXA.more = () => {
		const sub = st.more;
		if ( sub === 'account' ) return accountView();
		if ( sub === 'wallets' ) return walletsView();
		if ( sub === 'categories' ) return categoriesView();
		if ( sub === 'tags' ) return EXA.tagsView();
		if ( sub === 'reminders' ) return remindersView();
		if ( sub === 'data' ) return dataView();
		if ( sub === 'appearance' ) return appearanceView();
		if ( sub === 'install' ) return installView();
		if ( sub === 'about' ) return aboutView();
		const u = EX.auth.user() || {};
		const signed = EX.auth.isSignedIn();
		return `<button type="button" class="profile" data-more="account"><span class="avatar big${ signed ? ' on' : '' }">${ signed ? `<span class="who">${ esc( ( u.email || '?' ).charAt( 0 ).toUpperCase() ) }</span>` : UI.icon( 'user-circle', 40 ) }</span><span class="mid"><b>${ esc( signed ? u.email : t( 'signIn' ) ) }</b><small>${ signed ? syncLine() : esc( t( 'rowAccountGuest' ) ) }</small></span>${ chev }</button>
			<section class="card receipt-setting"><label class="entry-check"><input type="checkbox" role="switch" data-receipt-enabled${S().settings.receiptScanner!==false?' checked':''}>${esc(t('receiptScannerSetting'))}</label><p class="muted small">${esc(t('receiptScannerSettingHelp'))}</p></section>
            <div class="list mlist">${ row( 'wallets', 'wallet', 'teal', t( 'walletsTitle' ), t( 'ovManage' ) ) }<button type="button" class="mrow" data-go="plan">${ UI.ci( 'target', 'pink', 40 ) }<span class="mid"><b>${ esc( t( 'planTitle' ) ) }${ EXA.goalsDiscovery() }</b><small>${ esc( t( 'planMoreSub' ) ) }</small></span>${ UI.icon( 'chevron-right', 18 ) }</button>${ row( 'tags', 'tag', 'teal', EXA.label('tags') ) }${ row( 'categories', 'tag', 'purple', t( 'catsTitle' ) ) }${ row( 'reminders', 'bell', 'amber', t( 'rowReminders' ) ) }${ row( 'data', 'database-export', 'blue', t( 'rowData' ) ) }<button type="button" class="mrow" data-home-settings>${UI.ci('layout-dashboard','blue',40)}<span class="mid"><b>${esc(EXA.label('editHome'))}</b><small>${esc(EXA.label('editSizeHint'))}</small></span>${chev}</button>${ row( 'appearance', 'palette', 'pink', t( 'rowAppearance' ) ) }${ UI.isStandalone() ? '' : row( 'install', 'device-mobile', 'green', t( 'rowInstall' ) ) }${ row( 'about', 'info-circle', 'gray', t( 'rowAbout' ) ) }</div>`;
	};

	/** The whole content of the main column for the current screen. */
	EXA.screen = () => ( { home: EXA.home, activity: EXA.activity, bills: EXA.bills, plan: EXA.plan, reports: EXA.reports, more: EXA.more }[ st.view ] )();
}() );
