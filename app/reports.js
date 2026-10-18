/**
 * Expenity reports: a period and filter bar, and seven tabs (overview, spending, cash flow, trends, forecast,
 * subscriptions, table). Charts are drawn here as SVG, follow the theme through CSS variables, and each one has a
 * table equivalent for screen readers. Amounts are converted to the main currency (EX.convert) and money set aside for
 * goals is left out of spending.
 */
( function () {
	'use strict';
	const EX = window.EX, UI = window.UI, EXA = window.EXA;
	const { t, esc, money, iso, parse, today, addDays } = EX;
	const S = EX.state;
	const st = EXA.st;
	const $ = ( s, r = document ) => r.querySelector( s );
	const R = ( EXA.rep = {} );
	st.rep = { tab: 'all', period: 'month', from: '', to: '', wallet: '', cat: '', type: 'all', q: '', sort: 'date', dir: -1, group: 'none' };
	const f = () => st.rep;
	const main = () => S().settings.currency;
	const num = ( v ) => Number( String( v == null ? '' : v ).replace( ',', '.' ) ) || 0;
	const m$ = ( cents ) => money( cents / 100, main() );
	const HUE = { blue: '#3b82f6', amber: '#f59e0b', purple: '#8b5cf6', teal: '#14b8a6', red: '#ef4444', green: '#22c55e', pink: '#ec4899', gray: '#94a3b8' };
	const PALETTE = [ '#14b8a6', '#f59e0b', '#8b5cf6', '#3b82f6', '#ec4899', '#22c55e', '#ef4444', '#94a3b8' ];
	const colorOf = ( key, i ) => { const c = EX.catInfo( key ); return c.custom ? PALETTE[ i % PALETTE.length ] : HUE[ c.color ] || PALETTE[ i % PALETTE.length ]; };
	const cents = ( x ) => { const v = EX.convert( num( x.amount ), EX.txCurrency( x ), main() ); return v == null ? 0 : Math.round( v * 100 ); };
	const walletName = ( id ) => { const a = EX.account( id ); return a ? EX.accountName(a) : ''; };
	const dayDiff = ( a, b ) => Math.round( ( parse( a ) - parse( b ) ) / 864e5 );
	const short = ( d ) => parse( d ).toLocaleDateString( EX.loc(), { day: 'numeric', month: 'short' } );
	const monthLabel = ( k ) => new Date( Number( k.slice( 0, 4 ) ), Number( k.slice( 5, 7 ) ) - 1, 1 ).toLocaleDateString( EX.loc(), { month: 'short' } );

	/* ------------------------------------------------------------------ Period and data */

	R.range = () => {
		const td = today(), d = parse( td ), p = f().period;
		const first = ( y, m ) => iso( new Date( y, m, 1 ) );
		if ( p === 'last' ) return { from: first( d.getFullYear(), d.getMonth() - 1 ), to: iso( new Date( d.getFullYear(), d.getMonth(), 0 ) ) };
		if ( p === '3m' ) return { from: first( d.getFullYear(), d.getMonth() - 2 ), to: td };
		if ( p === 'ytd' ) return { from: `${ d.getFullYear() }-01-01`, to: td };
		if ( p === '12m' ) return { from: first( d.getFullYear(), d.getMonth() - 11 ), to: td };
		if ( p === 'custom' && f().from && f().to && f().from <= f().to ) return { from: f().from, to: f().to };
		return { from: first( d.getFullYear(), d.getMonth() ), to: td };
	};
	/** Transactions in a range with the filters applied. Goal money only appears in the table. */
	const pick = ( from, to, withGoals ) => {
		const q = EX.fold( f().q || '' );
		return EX.reportTxs().filter( ( x ) => x.date >= from && x.date <= to
			&& ( withGoals || ! x.goalId )
			&& ( ! f().wallet || x.account === f().wallet || x.toAccount === f().wallet )
			&& ( ! f().cat || x.category === f().cat )
			&& ( f().type === 'all' || x.type === f().type )
			&& ( ! q || EX.fold( ( x.name || '' ) + ' ' + ( x.note || '' ) + ' ' + EX.catInfo( x.category ).name ).includes( q ) ) );
	};
	const sum = ( list, type ) => list.reduce( ( s, x ) => ( x.type === type ? s + cents( x ) : s ), 0 );
	const expensePayments=list=>{const map=new Map();for(const x of list){if(x.type!=='expense'||x.reimbursementOf)continue;const prev=map.get(x.id);if(prev)prev.amount=((EX.cents(prev.amount)+EX.cents(x.amount))/100).toFixed(2);else map.set(x.id,{...x});}return [...map.values()];};
	const byCat = ( list ) => { const m = {}; list.filter( ( x ) => x.type === 'expense' ).forEach( ( x ) => { m[ x.category ] = ( m[ x.category ] || 0 ) + cents( x ); } ); return Object.entries( m ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] ); };
	const monthsIn = ( from, to ) => { const out = []; let y = Number( from.slice( 0, 4 ) ), m = Number( from.slice( 5, 7 ) ) - 1; const ey = Number( to.slice( 0, 4 ) ), em = Number( to.slice( 5, 7 ) ) - 1; while ( y < ey || ( y === ey && m <= em ) ) { out.push( `${ y }-${ String( m + 1 ).padStart( 2, '0' ) }` ); m++; if ( m > 11 ) { m = 0; y++; } } return out; };
	const netWorth = () => EX.mainCents( EX.activeAccounts().map( ( a ) => ( { amount: EX.balance( a ) / 100, currency: a.currency } ) ) );

	/* ------------------------------------------------------------------ Chart pieces */

	const delta = ( now, before, goodWhenUp ) => {
		if ( ! before ) return '';
		const p = Math.round( ( ( now - before ) / Math.abs( before ) ) * 100 ), up = p >= 0, good = up === goodWhenUp;
		return `<span class="dl ${ p === 0 ? '' : good ? 'good' : 'bad' }">${ UI.icon( up ? 'arrow-up-right' : 'arrow-down-left', 14 ) } ${ Math.abs( p ) }%</span>`;
	};
	const tile = ( label, value, extra = '' ) => `<div class="tile"><small>${ esc( label ) }</small><b>${ esc( value ) }</b><span>${ extra }</span></div>`;
	const noData = () => `<p class="muted small center">${ esc( t( 'repNoData' ) ) }</p>`;
	function donut( list, total, selected ) {
        const netTotal=total;list=list.filter(([,v])=>v>0);total=list.reduce((n,[,v])=>n+v,0)||1;
		const S0 = 180, r = 66, c = 2 * Math.PI * r, cx = S0 / 2;
		let off = 0;
		const arcs = list.slice( 0, 8 ).map( ( [ k, v ], i ) => { const len = ( v / total ) * c, el = `<circle cx="${ cx }" cy="${ cx }" r="${ r }" fill="none" stroke="${ colorOf( k, i ) }" stroke-width="${ selected === k ? 30 : 24 }" stroke-dasharray="${ Math.max( 0, len - 1.5 ) } ${ c }" stroke-dashoffset="${ -off }" transform="rotate(-90 ${ cx } ${ cx })" class="slice" data-rep="pick-cat" data-cat="${ esc( k ) }" tabindex="0" role="button" aria-label="${ esc( EX.catInfo( k ).name + ' ' + m$( v ) ) }"/>`; off += len; return el; } ).join( '' );
		return `<svg class="donut-svg" viewBox="0 0 ${ S0 } ${ S0 }" role="img" aria-label="${ esc( t( 'ovTopCats' ) ) }"><circle cx="${ cx }" cy="${ cx }" r="${ r }" fill="none" stroke="var(--line)" stroke-width="24"/>${ arcs }<text x="${ cx }" y="${ cx - 2 }" text-anchor="middle" class="dn-v">${ esc( m$( netTotal ) ) }</text><text x="${ cx }" y="${ cx + 16 }" text-anchor="middle" class="dn-l">${ esc( t( 'ovExpenses' ) ) }</text></svg>`;
	}
	const legend = ( list, total ) => `<ul class="legend2">${ list.slice( 0, 8 ).map( ( [ k, v ], i ) => `<li><button type="button" data-rep="pick-cat" data-cat="${ esc( k ) }" class="${ f().cat === k ? 'on' : '' }"><i style="background:${ colorOf( k, i ) }"></i><span>${ esc( EX.catInfo( k ).name ) }</span><b>${ esc( m$( v ) ) }</b><em>${total>0&&v>=0?Math.round(v/Math.max(total,list.reduce((n,[,a])=>n+Math.max(0,a),0))*100)+'%':'—'}</em></button></li>` ).join( '' ) }</ul>`;
	/** Grouped bars: series is [{label, a, b}] (income, expenses). */
	function bars2(series){
 const W=320,H=150,pad=18,lo=Math.min(0,...series.flatMap(s=>[s.a,s.b])),hi=Math.max(1,...series.flatMap(s=>[s.a,s.b])),span=hi-lo,bw=(W-pad)/Math.max(1,series.length),Y=v=>12+(hi-v)/span*(H-38),zero=Y(0);
 const g=series.map((s,i)=>{const x=pad+i*bw,w=Math.min(16,bw/2-2);return [['a',s.a,x+bw/2-w-1,'var(--bar-in)'],['b',s.b,x+bw/2+1,'var(--bar-out)']].map(([key,v,left,color])=>`<rect x="${left}" y="${Math.min(zero,Y(v))}" width="${w}" height="${Math.abs(Y(v)-zero)}" rx="3" fill="${color}" class="bar-${key}"/>`).join('')+`<text x="${x+bw/2}" y="${H-4}" text-anchor="middle" class="ax">${esc(s.label)}</text>`;}).join('');
 return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('cashFlow'))}"><path d="M${pad} ${zero}H${W}" stroke="var(--line)"/>${g}</svg>`;
 }

	/** A line with a soft area under it; points is [{x: label, y: cents}]. */
	function line( points, opts = {} ) {
		if ( points.length < 2 ) return noData();
		const W = 320, H = 150, px = 8, top = 12, bot = 22;
		const ys = points.map( ( p ) => p.y ), lo = Math.min( 0, ...ys ), hi = Math.max( 1, ...ys ), span = hi - lo || 1;
		const X = ( i ) => px + ( i / ( points.length - 1 ) ) * ( W - 2 * px ), Y = ( v ) => top + ( 1 - ( v - lo ) / span ) * ( H - top - bot );
		const path = points.map( ( p, i ) => `${ i ? 'L' : 'M' }${ X( i ).toFixed( 1 ) },${ Y( p.y ).toFixed( 1 ) }` ).join( '' );
		const area = `${ path }L${ X( points.length - 1 ).toFixed( 1 ) },${ Y( lo ) }L${ X( 0 ).toFixed( 1 ) },${ Y( lo ) }Z`;
		const zero = lo < 0 ? `<line x1="${ px }" x2="${ W - px }" y1="${ Y( 0 ) }" y2="${ Y( 0 ) }" class="zero"/>` : '';
		const labels = [ 0, Math.floor( ( points.length - 1 ) / 2 ), points.length - 1 ].map( ( i ) => `<text x="${ X( i ) }" y="${ H - 5 }" text-anchor="${ i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle' }" class="ax">${ esc( points[ i ].x ) }</text>` ).join( '' );
		return `<svg class="chart" viewBox="0 0 ${ W } ${ H }" role="img" aria-label="${ esc( opts.label || '' ) }"><path d="${ area }" class="area"/>${ zero }<path d="${ path }" class="ln"/>${ labels }</svg>`;
	}
	/** Stacked bars by month for the top categories. */
	function stacked(months,cats){
 const W=320,H=160,pad=10,bw=(W-pad)/Math.max(1,months.length),hi=Math.max(1,...months.map(m=>cats.reduce((n,c)=>n+Math.max(0,m.v[c]||0),0))),lo=Math.min(0,...months.map(m=>cats.reduce((n,c)=>n+Math.min(0,m.v[c]||0),0))),scale=(H-38)/(hi-lo),zero=12+hi*scale;
 const g=months.map((m,i)=>{let pos=zero,neg=zero;const x=pad+i*bw+3,w=Math.max(1,bw-6);return cats.map((c,ci)=>{const value=m.v[c]||0,h=Math.abs(value)*scale,y=value>=0?(pos-=h):neg;if(value<0)neg+=h;return h>.1?`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${colorOf(c,ci)}"/>`:'';}).join('')+`<text x="${x+w/2}" y="${H-4}" text-anchor="middle" class="ax">${esc(m.label)}</text>`;}).join('');
 return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('repTrends'))}"><path d="M${pad} ${zero}H${W}" stroke="var(--line)"/>${g}</svg>`+tableOf([t('fDate'),...cats.map(c=>c==='_other'?t('cat_other'):EX.catInfo(c).name)],months.map(m=>[m.label,...cats.map(c=>m$(m.v[c]||0))]));
 }

	const tableOf = ( head, rows ) => `<details class="tv"><summary>${ esc( t( 'repAsTable' ) ) }</summary><div class="tbl-wrap"><table class="tbl"><thead><tr>${ head.map( ( h ) => `<th>${ esc( h ) }</th>` ).join( '' ) }</tr></thead><tbody>${ rows.map( ( r ) => `<tr>${ r.map( ( c ) => `<td>${ esc( c ) }</td>` ).join( '' ) }</tr>` ).join( '' ) }</tbody></table></div></details>`;

	/* ------------------------------------------------------------------ Filter bar */

	const PERIODS = [ [ 'month', 'periodMonth' ], [ 'last', 'repLast' ], [ '3m', 'period3' ], [ 'ytd', 'periodYear' ], [ '12m', 'rep12' ], [ 'custom', 'repCustom' ] ];
	const TAB_ICON = { all: 'list-details', overview: 'layout-dashboard', spending: 'chart-donut', flow: 'chart-bar', trends: 'chart-line', forecast: 'trending-up', subs: 'repeat', table: 'table' };
	const TABS = [ [ 'all', 'repAll' ], [ 'overview', 'repOverview' ], [ 'spending', 'repSpending' ], [ 'flow', 'repFlowTab' ], [ 'trends', 'repTrends' ], [ 'forecast', 'repForecastTab' ], [ 'subs', 'repSubsTab' ], [ 'table', 'repTable' ] ];
	function filterBar() {
		const r = R.range(), n = [ f().wallet, f().cat, f().type !== 'all' ? 1 : '', f().q ].filter( Boolean ).length;
		return `<div class="repbar"><label class="f"><span class="sr">${ esc( t( 'repPeriod' ) ) }</span><select id="repPeriod" aria-label="${ esc( t( 'repPeriod' ) ) }">${ PERIODS.map( ( [ id, k ] ) => `<option value="${ id }"${ f().period === id ? ' selected' : '' }>${ esc( t( k ) ) }</option>` ).join( '' ) }</select></label>
			${ f().period === 'custom' ? `<div class="grid2"><label class="f"><span>${ esc( t( 'repFrom' ) ) }</span><input type="date" id="repFrom" value="${ esc( f().from || r.from ) }"></label><label class="f"><span>${ esc( t( 'repTo' ) ) }</span><input type="date" id="repTo" value="${ esc( f().to || r.to ) }"></label></div>` : '' }
			<div class="repline"><span class="muted small">${ esc( short( r.from ) ) } – ${ esc( short( r.to ) ) }</span><button type="button" class="btn btn-ghost sm" data-rep="filters">${ UI.icon( 'filter', 18 ) } ${ esc( t( 'repFilters' ) ) }${ n ? ` (${ n })` : '' }</button></div>
			<div class="chips tabs2" role="tablist">${ TABS.map( ( [ id, k ] ) => `<button type="button" class="chip${ f().tab === id ? ' on' : '' }" role="tab" aria-selected="${ f().tab === id }" data-rep="tab" data-tab="${ id }">${ UI.icon( TAB_ICON[ id ], 18 ) } ${ esc( t( k ) ) }</button>` ).join( '' ) }</div></div>`;
	}
	function openFilters() {
		const wallets = EX.activeAccounts(), cats = [...new Map(EX.catList('expense').concat(EX.catList('income')).map(c=>[c.key,c])).values()];
		UI.openSheet( `<div class="sheet-head"><button type="button" class="ab-btn" data-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button><h2 id="sheetTitle">${ esc( t( 'repFilters' ) ) }</h2><span class="sp"></span></div>
			<form id="repFilterForm" class="sheet-pad" novalidate>
			<label class="f"><span>${ esc( t( 'fWallet' ) ) }</span><select name="wallet"><option value="">${ esc( t( 'txAllWallets' ) ) }</option>${ wallets.map( ( a ) => `<option value="${ esc( a.id ) }"${ f().wallet === a.id ? ' selected' : '' }>${ esc( EX.accountName( a ) ) }</option>` ).join( '' ) }</select></label>
			<label class="f"><span>${ esc( t( 'fCategory' ) ) }</span><select name="cat"><option value="">${ esc( t( 'repAllCats' ) ) }</option>${ cats.map( ( c ) => `<option value="${ esc( c.key ) }"${ f().cat === c.key ? ' selected' : '' }>${ esc( c.name ) }</option>` ).join( '' ) }</select></label>
			<label class="f"><span>${ esc( t( 'repKind' ) ) }</span><select name="type">${ [ 'all', 'expense', 'income' ].map( ( k ) => `<option value="${ k }"${ f().type === k ? ' selected' : '' }>${ esc( t( k === 'all' ? 'filterAll' : k === 'expense' ? 'typeExpense' : 'typeIncome' ) ) }</option>` ).join( '' ) }</select></label>
			<label class="f"><span>${ esc( t( 'repText' ) ) }</span><input name="q" autocomplete="off" value="${ esc( f().q ) }"></label>
			<div class="btn-row sticky-actions"><button type="button" class="btn btn-ghost" data-rep="clear">${ esc( t( 'repClear' ) ) }</button><span class="sp"></span><button type="submit" class="btn btn-primary">${ esc( t( 'repApply' ) ) }</button></div></form>`, { cls: 'small' } );
	}

	/* ------------------------------------------------------------------ Tabs */

	function overview( r, list ) {
		const len = dayDiff( r.to, r.from ) + 1, pto = addDays( r.from, -1 ), pfrom = addDays( pto, -( len - 1 ) ), prev = pick( pfrom, pto );
		const inc = sum( list, 'income' ), exp = sum( list, 'expense' ), pinc = sum( prev, 'income' ), pexp = sum( prev, 'expense' );
		const rate = inc ? Math.round( ( ( inc - exp ) / inc ) * 100 ) : null, prate = pinc ? Math.round( ( ( pinc - pexp ) / pinc ) * 100 ) : null;
		const cats = byCat( list ), total = cats.reduce( ( s, x ) => s + x[ 1 ], 0 ), biggest = expensePayments(list).sort( ( a, b ) => cents( b ) - cents( a ) )[ 0 ];
		return `<div class="tiles">${ tile( t( 'repNetWorth' ), m$( netWorth() ) ) }${ tile( t( 'ovNet' ), m$( inc - exp ), delta( inc - exp, pinc - pexp, true ) ) }</div>
			<div class="tiles">${ tile( t( 'ovIncome' ), m$( inc ), delta( inc, pinc, true ) ) }${ tile( t( 'ovExpenses' ), m$( exp ), delta( exp, pexp, false ) ) }</div>
			<div class="tiles">${ tile( t( 'repSavingsRate' ), rate == null ? '—' : rate + '%', prate == null || rate == null ? '' : delta( rate, prate, true ) ) }${ tile( t( 'repPerDay' ), m$( Math.round( exp / len ) ) ) }</div>
			<section class="card"><h2>${ esc( t( 'ovTopCats' ) ) }</h2>${ total ? `<div class="donut-wrap2">${ donut( cats, total, f().cat ) }${ legend( cats.slice( 0, 5 ), total ) }</div>` : noData() }</section>
			${ biggest ? `<section class="card"><h2>${ esc( t( 'repBiggest' ) ) }</h2><p><b>${ esc( biggest.name || EX.catInfo( biggest.category ).name ) }</b> · ${ esc( m$( cents( biggest ) ) ) } · ${ esc( short( biggest.date ) ) }</p></section>` : '' }`;
	}
	function spending( r, list ) {
		const cats = byCat( list ), total = cats.reduce( ( s, x ) => s + x[ 1 ], 0 );
		const wd = [ 0, 0, 0, 0, 0, 0, 0 ], wn = [ 0, 0, 0, 0, 0, 0, 0 ];
		list.filter( ( x ) => x.type === 'expense' ).forEach( ( x ) => { const d = ( parse( x.date ).getDay() + 6 ) % 7; wd[ d ] += cents( x ); } );
		for ( let d = r.from; d <= r.to; d = addDays( d, 1 ) ) wn[ ( parse( d ).getDay() + 6 ) % 7 ]++;
		const avg = wd.map( ( v, i ) => ( wn[ i ] ? Math.round( v / wn[ i ] ) : 0 ) ), mx = Math.max( 1, ...avg );
		const names = [ 1, 2, 3, 4, 5, 6, 7 ].map( ( d ) => new Date( 2024, 0, d ).toLocaleDateString( EX.loc(), { weekday: 'short' } ) );
		const merch = {}; list.filter( ( x ) => x.type === 'expense' && ( x.name || '' ).trim() ).forEach( ( x ) => { const k = x.name.trim(); merch[ k ] = ( merch[ k ] || 0 ) + cents( x ); } );
		const top = Object.entries( merch ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, 6 );
		const big = expensePayments(list).sort( ( a, b ) => cents( b ) - cents( a ) ).slice( 0, 5 );
		const drill = f().cat ? list.filter( ( x ) => x.category === f().cat ).sort( ( a, b ) => ( a.date < b.date ? 1 : -1 ) ).slice( 0, 8 ) : [];
		return `<section class="card"><h2>${ esc( t( 'ovTopCats' ) ) }</h2>${ total ? `<div class="donut-wrap2">${ donut( cats, total, f().cat ) }${ legend( cats, total ) }</div>${ tableOf( [ t( 'fCategory' ), t( 'fAmount' ) ], cats.map( ( [ k, v ] ) => [ EX.catInfo( k ).name, m$( v ) ] ) ) }` : noData() }</section>
			${ drill.length ? `<section class="card"><h2>${ esc( EX.catInfo( f().cat ).name ) }</h2><ul class="plain">${ drill.map( ( x ) => `<li>${ esc( short( x.date ) ) } · ${ esc( x.name || EX.catInfo( x.category ).name ) } · <b>${ esc( m$( cents( x ) ) ) }</b></li>` ).join( '' ) }</ul></section>` : '' }
			<section class="card"><h2>${ esc( t( 'repWeekday' ) ) }</h2><div class="wk" role="img" aria-label="${ esc( t( 'repWeekday' ) ) }">${ avg.map( ( v, i ) => `<div class="wk-col"><i style="height:${ Math.max( 3, Math.round( ( v / mx ) * 100 ) ) }%" title="${ esc( m$( v ) ) }"></i><small>${ esc( names[ i ] ) }</small></div>` ).join( '' ) }</div></section>
			<section class="card"><h2>${ esc( t( 'repTopNames' ) ) }</h2>${ top.length ? `<ul class="plain">${ top.map( ( [ k, v ] ) => `<li>${ esc( k ) } · <b>${ esc( m$( v ) ) }</b></li>` ).join( '' ) }</ul>` : noData() }</section>
			<section class="card"><h2>${ esc( t( 'repBiggest' ) ) }</h2>${ big.length ? `<ul class="plain">${ big.map( ( x ) => `<li>${ esc( short( x.date ) ) } · ${ esc( x.name || EX.catInfo( x.category ).name ) } · <b>${ esc( m$( cents( x ) ) ) }</b></li>` ).join( '' ) }</ul>` : noData() }</section>`;
	}
	function flow( r, list ) {
		const ms = monthsIn( r.from, r.to ).slice( -12 ), series = ms.map( ( k ) => { const l = list.filter( ( x ) => x.date.startsWith( k ) ); return { k, label: monthLabel( k ), a: sum( l, 'income' ), b: sum( l, 'expense' ) }; } );
		let run = 0; const cum = series.map( ( s ) => { run += s.a - s.b; return { x: s.label, y: run }; } );
		const rate = series.map( ( s ) => ( { x: s.label, y: s.a ? Math.round( ( ( s.a - s.b ) / s.a ) * 100 ) : 0 } ) );
		return `<section class="card"><h2>${ esc( t( 'repIncVsExp' ) ) }</h2><div class="keys"><span class="key in"></span>${ esc( t( 'ovIncome' ) ) } <span class="key out"></span>${ esc( t( 'ovExpenses' ) ) }</div>${ series.length ? bars2( series ) : noData() }${ tableOf( [ t( 'repMonth' ), t( 'ovIncome' ), t( 'ovExpenses' ), t( 'ovNet' ) ], series.map( ( s ) => [ s.label, m$( s.a ), m$( s.b ), m$( s.a - s.b ) ] ) ) }</section>
			<section class="card"><h2>${ esc( t( 'repCumulative' ) ) }</h2>${ line( cum, { label: t( 'repCumulative' ) } ) }</section>
			<section class="card"><h2>${ esc( t( 'repRateTrend' ) ) }</h2>${ line( rate, { label: t( 'repRateTrend' ) } ) }</section>`;
	}
	function trends( r, list ) {
		const ms = monthsIn( r.from, r.to ).slice( -12 ), tot = byCat( list ), top = tot.slice( 0, 5 ).map( ( x ) => x[ 0 ] );
		const months = ms.map( ( k ) => { const v = {}; list.filter( ( x ) => x.type === 'expense' && x.date.startsWith( k ) ).forEach( ( x ) => { const c = top.includes( x.category ) ? x.category : '_other'; v[ c ] = ( v[ c ] || 0 ) + cents( x ); } ); return { label: monthLabel( k ), v, k }; } );
		const keys = top.concat( [ '_other' ] );
		const mom = months.length > 1 ? months.slice( -2 ).map( ( m ) => Object.values( m.v ).reduce( ( s, x ) => s + x, 0 ) ) : null;
		return `<section class="card"><h2>${ esc( t( 'repTrends' ) ) }</h2>${ months.length ? stacked( months, keys ) : noData() }<ul class="legend2 inline">${ keys.map( ( k, i ) => `<li><i style="background:${ colorOf( k, i ) }"></i>${ esc( k === '_other' ? t( 'cat_other' ) : EX.catInfo( k ).name ) }</li>` ).join( '' ) }</ul></section>
			${ mom ? `<section class="card"><h2>${ esc( t( 'repMoM' ) ) }</h2><p><b>${ esc( m$( mom[ 1 ] ) ) }</b> ${ delta( mom[ 1 ], mom[ 0 ], false ) } <span class="muted">${ esc( t( 'repVsPrev' ) ) }</span></p></section>` : '' }`;
	}
	/** Balance day by day for `days` days: bills out, income in, and a typical daily spend from the last 60 days. */
	R.projection = ( days ) => {
		const td = today(), to = addDays( td, days ), ev = {};
		const push = ( d, v ) => { ev[ d ] = ( ev[ d ] || 0 ) + v; };
		S().bills.filter( ( b ) => ! b.done && b.next ).forEach( ( b ) => { EX.occurrences( b, to ).forEach( ( d ) => { if ( d >= td ) { const v = EX.convert( num( b.amount ), b.currency || main(), main() ); if ( v != null ) push( d, -Math.round( v * 100 ) ); } } ); } );
		S().incomes.filter( ( i ) => ! i.done ).forEach( ( i ) => { let d = i.next, n = 0; while ( d && d <= to && n < 80 ) { if ( d >= td ) { const v = EX.convert( num( i.amount ), i.currency || main(), main() ); if ( v != null ) push( d, Math.round( v * 100 ) ); } d = EX.nextAfter( i, d ); n++; } } );
		const since = addDays( td, -60 );
		const typical = Math.max(0,Math.round( EX.reportTxs().filter( ( x ) => x.type === 'expense' && ! x.billId && ! x.goalId && x.date >= since ).reduce( ( s, x ) => s + cents( x ), 0 ) / 60 ));
		let bal = netWorth(); const pts = [ { d: td, y: bal, y0: bal } ]; let bal0 = bal;
		for ( let i = 1; i <= days; i++ ) { const d = addDays( td, i ); bal += ( ev[ d ] || 0 ) - typical; bal0 += ev[ d ] || 0; pts.push( { d, y: bal, y0: bal0 } ); }
		return { pts, typical, events: ev };
	};
	function forecast() {
		const p = R.projection( 90 ), at = ( n ) => p.pts[ n ].y, lo = p.pts.reduce( ( m, x ) => ( x.y < m.y ? x : m ), p.pts[ 0 ] );
		const td = today(), d = parse( td ), eom = iso( new Date( d.getFullYear(), d.getMonth() + 1, 0 ) ), left = Math.max( 1, dayDiff( eom, td ) + 1 );
		const spendRoom=EX.safeSpend.calculate();
		const big = Object.entries( p.events ).filter( ( [ , v ] ) => v < 0 ).sort( ( a, b ) => a[ 1 ] - b[ 1 ] ).slice( 0, 5 );
		return `<button type="button" class="btn btn-ghost" data-safe="details">${UI.icon('wallet',20)} ${esc(t('safeTitle'))}</button><div class="tiles three"><div class="tile"><small>${ esc( t( 'next30' ) ) }</small><b>${ esc( m$( at( 30 ) ) ) }</b><span></span></div><div class="tile"><small>${ esc( t( 'next60' ) ) }</small><b>${ esc( m$( at( 60 ) ) ) }</b><span></span></div><div class="tile"><small>${ esc( t( 'next90' ) ) }</small><b>${ esc( m$( at( 90 ) ) ) }</b><span></span></div></div>
			<section class="card"><h2>${ esc( t( 'repExpectedBalance' ) ) }</h2>${ line( p.pts.filter( ( _, i ) => i % 2 === 0 ).map( ( x ) => ( { x: short( x.d ), y: x.y } ) ), { label: t( 'repExpectedBalance' ) } ) }<p class="muted small">${ esc( t( 'repIfNothing', { a: m$( p.typical ) } ) ) }</p></section>
			<div class="tiles"><div class="tile"><small>${ esc( t( 'safeTitle' ) ) }</small><b>${spendRoom.valid?esc(m$(spendRoom.daily)):'—'}</b><span>${esc(t('safePerDay'))} · ${esc(t('safeUntil'))} ${esc(EX.dayName(spendRoom.end))}</span></div><div class="tile"><small>${ esc( t( 'repLowest' ) ) }</small><b>${ esc( m$( lo.y ) ) }</b><span>${ esc( short( lo.d ) ) }</span></div></div>
			<section class="card"><h2>${ esc( t( 'repUpcomingBig' ) ) }</h2>${ big.length ? `<ul class="plain">${ big.map( ( [ d, v ] ) => `<li>${ esc( short( d ) ) } · <b>${ esc( m$( -v ) ) }</b></li>` ).join( '' ) }</ul>` : noData() }</section>`;
	}
	function subs() {
		const rows = S().bills.filter( ( b ) => ! b.done && b.category === 'subscriptions' && EX.scheduleFactor(b) ).map( ( b ) => { const v = EX.convert( num( b.amount ), b.currency || main(), main() ) || 0, yearly = Math.round( v * 100 * EX.scheduleFactor(b) ); return { b, yearly, monthly: Math.round( yearly / 12 ) }; } ).sort( ( a, b ) => b.yearly - a.yearly );
		const changes = [];
		S().bills.forEach( ( b ) => { const ps = S().txs.filter( ( p ) => p.billId === b.id && num( p.amount ) ).sort( ( a, z ) => ( ( a.due || a.date ) < ( z.due || z.date ) ? -1 : 1 ) ); if ( ps.length >= 2 ) { const a = num( ps[ ps.length - 2 ].amount ), z = num( ps[ ps.length - 1 ].amount ); if ( a && Math.abs( z - a ) / a >= 0.05 ) changes.push( { b, a, z } ); } } );
		const tot = rows.reduce( ( s, x ) => s + x.yearly, 0 );
		return `<div class="tiles">${ tile( t( 'repPerYear' ), m$( tot ) ) }${ tile( t( 'repPerMonth' ), m$( Math.round( tot / 12 ) ) ) }</div>
			<section class="card"><h2>${ esc( t( 'subs' ) ) }</h2>${ rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${ esc( t( 'fName' ) ) }</th><th>${ esc( t( 'repPerMonth' ) ) }</th><th>${ esc( t( 'repPerYear' ) ) }</th><th>${ esc( t( 'fNext' ) ) }</th></tr></thead><tbody>${ rows.map( ( x ) => `<tr><td>${ esc( x.b.name ) }</td><td>${ esc( m$( x.monthly ) ) }</td><td>${ esc( m$( x.yearly ) ) }</td><td>${ esc( short( x.b.next ) ) }</td></tr>` ).join( '' ) }</tbody></table></div>` : `<p class="muted">${ esc( t( 'noSubs' ) ) }</p>` }</section>
			${ changes.length ? `<section class="card"><h2>${ esc( t( 'priceChanges' ) ) }</h2><ul class="plain">${ changes.map( ( x ) => `<li>${ esc( x.b.name ) }: ${ esc( money( x.a, x.b.currency || main() ) ) } → <b>${ esc( money( x.z, x.b.currency || main() ) ) }</b></li>` ).join( '' ) }</ul></section>` : '' }`;
	}
	function table( r ) {
		const list = pick( r.from, r.to, true );
		const key = { date: ( x ) => x.date, name: ( x ) => ( x.name || '' ).toLowerCase(), cat: ( x ) => EX.catInfo( x.category ).name.toLowerCase(), wallet: ( x ) => walletName( x.account ).toLowerCase(), amount: ( x ) => ( x.type === 'income' ? 1 : -1 ) * cents( x ) }[ f().sort ];
		list.sort( ( a, b ) => ( key( a ) < key( b ) ? -1 : key( a ) > key( b ) ? 1 : 0 ) * f().dir );
		const gk = { none: null, cat: ( x ) => EX.catInfo( x.category ).name, wallet: ( x ) => walletName( x.account ), month: ( x ) => x.date.slice( 0, 7 ) }[ f().group ];
		const th = ( id, label ) => `<th><button type="button" data-rep="sort" data-k="${ id }" aria-sort="${ f().sort === id ? ( f().dir > 0 ? 'ascending' : 'descending' ) : 'none' }">${ esc( label ) }${ f().sort === id ? ( f().dir > 0 ? ' ▲' : ' ▼' ) : '' }</button></th>`;
		const signed = ( x ) => ( x.type === 'income' ? 1 : x.type === 'expense' ? -1 : 0 ) * cents( x );
		const row = ( x ) => `<tr><td>${ esc( short( x.date ) ) }</td><td>${ esc( x.name || '' ) }</td><td>${ esc( x.type === 'transfer' ? t( 'catTransfer' ) : EX.catInfo( x.category ).name ) }</td><td>${ esc( walletName( x.account ) ) }</td><td class="r ${ x.type }">${ esc( m$( signed( x ) ) ) }</td></tr>`;
		let body;
		if ( gk ) { const g = {}; list.forEach( ( x ) => { ( g[ gk( x ) ] = g[ gk( x ) ] || [] ).push( x ); } ); body = Object.entries( g ).sort( ( a, b ) => ( a[ 0 ] < b[ 0 ] ? -1 : 1 ) ).map( ( [ k, v ] ) => `<tr class="grp"><td colspan="4">${ esc( f().group === 'month' ? monthLabel( k ) + ' ' + k.slice( 0, 4 ) : k ) } (${ v.length })</td><td class="r">${ esc( m$( v.reduce( ( s, x ) => s + signed( x ), 0 ) ) ) }</td></tr>${ v.slice( 0, 100 ).map( row ).join( '' ) }` ).join( '' ); }
		else body = list.slice( 0, 300 ).map( row ).join( '' );
		const gb = ( id, label ) => `<button type="button" class="chip${ f().group === id ? ' on' : '' }" data-rep="group" data-g="${ id }">${ esc( label ) }</button>`;
		return `<div class="chips"><span class="muted small lbl-inline">${ esc( t( 'repGroup' ) ) }</span>${ gb( 'none', t( 'repNone' ) ) }${ gb( 'cat', t( 'fCategory' ) ) }${ gb( 'wallet', t( 'fWallet' ) ) }${ gb( 'month', t( 'repMonth' ) ) }<button type="button" class="chip" data-rep="csv">${ UI.icon( 'download', 18 ) } CSV</button></div>
			<section class="card flush">${ list.length ? `<div class="tbl-wrap"><table class="tbl big"><thead><tr>${ th( 'date', t( 'fDate' ) ) }${ th( 'name', t( 'fName' ) ) }${ th( 'cat', t( 'fCategory' ) ) }${ th( 'wallet', t( 'fWallet' ) ) }${ th( 'amount', t( 'fAmount' ) ) }</tr></thead><tbody>${ body }</tbody><tfoot><tr><td colspan="4">${ esc( t( 'repTotal' ) ) } (${ list.length })</td><td class="r">${ esc( m$( list.reduce( ( s, x ) => s + signed( x ), 0 ) ) ) }</td></tr></tfoot></table></div>` : noData() }</section>`;
	}

	/* ------------------------------------------------------------------ Screen and events */

	/** Every report one after the other, each with a heading and a link to open it on its own (the table is only linked: it is long). */
	function all( r, list ) {
		const sec = ( id, label, html ) => `<div class="rep-sec"><h3>${ UI.icon( TAB_ICON[ id ], 20 ) } ${ esc( label ) }</h3><button type="button" class="link" data-rep="tab" data-tab="${ id }">${ esc( t( 'repOpen' ) ) }</button></div>${ html }`;
		const noDonut = ( h ) => h.replace( /^<section class="card">[\s\S]*?<\/section>\s*/, '' ); // the overview already shows the donut
		return sec( 'overview', t( 'repOverview' ), overview( r, list ) ) + sec( 'spending', t( 'repSpending' ), noDonut( spending( r, list ) ) ) + sec( 'flow', t( 'repFlowTab' ), flow( r, list ) ) + sec( 'trends', t( 'repTrends' ), trends( r, list ) )
			+ sec( 'forecast', t( 'repForecastTab' ), forecast() ) + sec( 'subs', t( 'repSubsTab' ), subs() ) + `<div class="btn-row"><button type="button" class="btn btn-ghost" data-rep="tab" data-tab="table">${ UI.icon( 'table', 20 ) } ${ esc( t( 'repTable' ) ) }</button></div>`;
	}
	EXA.reports = () => {
		if ( ! S().bills.length && ! S().txs.length && ! S().incomes.length ) return `<div class="empty">${ UI.ci( 'chart-pie', 'purple', 80 ) }<h2>${ esc( t( 'tabReports' ) ) }</h2><p class="muted">${ esc( t( 'emptyIns' ) ) }</p></div>`;
		const r = R.range(), list = pick( r.from, r.to );
		const body = { all: () => all( r, list ), overview: () => overview( r, list ), spending: () => spending( r, list ), flow: () => flow( r, list ), trends: () => trends( r, list ), forecast: forecast, subs, table: () => table( r ) }[ f().tab ]();
		return `${ filterBar() }<p class="muted small">${esc(t('amAccounting'))}</p><div class="rep-body" id="repBody">${ body }</div>`;
	};
	const csvCell = ( v ) => `"${ String( v ).replace( /"/g, '""' ) }"`;
	EXA.repClick = ( e ) => {
		const el = e.target.closest( '[data-rep]' );
		if ( ! el ) return false;
		const a = el.dataset.rep;
		if ( a === 'tab' ) f().tab = el.dataset.tab;
		else if ( a === 'period' ) { f().period = el.dataset.p; if ( el.dataset.p === 'custom' && ! f().from ) { const r = R.range(); f().from = r.from; f().to = r.to; } }
		else if ( a === 'pick-cat' ) { f().cat = f().cat === el.dataset.cat ? '' : el.dataset.cat; if ( f().tab === 'overview' ) f().tab = 'spending'; }
		else if ( a === 'filters' ) { openFilters(); return true; }
		else if ( a === 'clear' ) { Object.assign( f(), { wallet: '', cat: '', type: 'all', q: '' } ); UI.closeSheet(); }
		else if ( a === 'sort' ) { const k = el.dataset.k; if ( f().sort === k ) f().dir = -f().dir; else { f().sort = k; f().dir = k === 'date' || k === 'amount' ? -1 : 1; } }
		else if ( a === 'group' ) f().group = el.dataset.g;
		else if ( a === 'csv' ) {
			const r = R.range(), rows = [ [ t( 'fDate' ), t( 'fName' ), t( 'fCategory' ), t( 'fWallet' ), t( 'fAmount' ), 'Currency' ] ].concat( pick( r.from, r.to, true ).sort( ( x, y ) => ( x.date < y.date ? 1 : -1 ) ).map( ( x ) => [ x.date, x.name || '', x.type === 'transfer' ? t( 'catTransfer' ) : EX.catInfo( x.category ).name, walletName( x.account ), String((x.type === 'income' ? 1 : -1)*Number(x.amount)), EX.txCurrency( x ) ] ) );
			EXA.download( 'expenity-report.csv', '﻿' + rows.map( ( x ) => x.map( csvCell ).join( ',' ) ).join( '\n' ), 'text/csv;charset=utf-8' ); return true;
		} else return false;
		EXA.render();
		return true;
	};
	EXA.repSubmit = ( form ) => {
		if ( form.id !== 'repFilterForm' ) return false;
		const el = form.elements;
		Object.assign( f(), { wallet: el.wallet.value, cat: el.cat.value, type: el.type.value, q: el.q.value.trim() } );
		UI.closeSheet(); EXA.render();
		return true;
	};
	EXA.repChange = ( e ) => {
		if ( e.target.id === 'repPeriod' ) { f().period = e.target.value; if ( f().period === 'custom' && ! f().from ) { const x = R.range(); f().from = x.from; f().to = x.to; } EXA.render(); return true; }
		if ( e.target.id === 'repFrom' || e.target.id === 'repTo' ) { f()[ e.target.id === 'repFrom' ? 'from' : 'to' ] = e.target.value; EXA.render(); return true; }
		return false;
	};
}() );
