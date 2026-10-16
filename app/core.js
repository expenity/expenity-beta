/**
 * Expenity core: language, dates, the data model (wallets, transactions, bills, categories), balances,
 * local storage, and the sentence parser. No DOM here; app.js draws, sync.js talks to the server.
 * Everything is on window.EX.
 */
( function () {
	'use strict';

	const I18N = window.EXPENITY_I18N;
	const EX = ( window.EX = {} );

	/* ------------------------------------------------------------------ Events */

	const handlers = {};
	EX.on = ( name, fn ) => { ( handlers[ name ] = handlers[ name ] || [] ).push( fn ); };
	EX.emit = ( name, ...args ) => { ( handlers[ name ] || [] ).forEach( ( fn ) => { try { fn( ...args ); } catch ( e ) { console.error( e ); } } ); };

	/* ------------------------------------------------------------------ Language */

	let lang = I18N.default;
	try {
		const q = new URLSearchParams( location.search ).get( 'lang' ); // The website links to ?lang=el
		const s = q && I18N.langs[ q ] ? q : localStorage.getItem( 'expenity.lang' );
		if ( s && I18N.langs[ s ] ) { lang = s; if ( q ) localStorage.setItem( 'expenity.lang', s ); }
	} catch ( e ) { /* ignore */ }
	EX.I18N = I18N;
	EX.lang = () => lang;
	EX.t = ( key, vars ) => {
		const v = I18N.langs[ lang ][ key ] !== undefined ? I18N.langs[ lang ][ key ] : I18N.langs.en[ key ];
		if ( typeof v === 'function' ) return v( vars || {} );
		if ( typeof v === 'string' && vars ) return v.replace( /\{(\w+)\}/g, ( m, k ) => ( vars[ k ] !== undefined ? vars[ k ] : m ) );
		return v === undefined ? key : v;
	};
	const t = EX.t;
	EX.loc = () => I18N.langs[ lang ].locale;
	EX.setLang = ( k ) => {
		if ( ! I18N.langs[ k ] ) return;
		lang = k;
		try { localStorage.setItem( 'expenity.lang', k ); } catch ( e ) { /* ignore */ }
		EX.emit( 'lang' );
	};

	/* ------------------------------------------------------------------ Dates */

	const pad = ( n ) => String( n ).padStart( 2, '0' );
	EX.iso = ( d ) => `${ d.getFullYear() }-${ pad( d.getMonth() + 1 ) }-${ pad( d.getDate() ) }`;
	EX.parse = ( s ) => { const [ y, m, d ] = s.split( '-' ).map( Number ); return new Date( y, m - 1, d ); };
	EX.today = () => EX.iso( new Date() );
	EX.addDays = ( s, n ) => { const d = EX.parse( s ); d.setDate( d.getDate() + n ); return EX.iso( d ); };
	EX.diffDays = ( a, b ) => Math.round( ( EX.parse( a ) - EX.parse( b ) ) / 864e5 );
	EX.dim = ( y, m ) => new Date( y, m + 1, 0 ).getDate();
	EX.addMonths = ( s, n, day ) => {
		const d = EX.parse( s );
		let m = d.getMonth() + n;
		const y = d.getFullYear() + Math.floor( m / 12 );
		m = ( ( m % 12 ) + 12 ) % 12;
		return EX.iso( new Date( y, m, Math.min( day || d.getDate(), EX.dim( y, m ) ) ) );
	};
	EX.dayName = ( s ) => EX.parse( s ).toLocaleDateString( EX.loc(), { weekday: 'short', day: 'numeric', month: 'short' } );
	EX.monthName = ( y, m ) => new Date( y, m, 1 ).toLocaleDateString( EX.loc(), { month: 'long', year: 'numeric' } );
	EX.monthKey = ( s ) => s.slice( 0, 7 );
	const dim = EX.dim, iso = EX.iso, parse = EX.parse, today = EX.today, addDays = EX.addDays;

	/** The due date after `s` for a repeating bill, or null for a one-off. */
	EX.nextAfter = ( bill, s ) => {
		switch ( bill.repeat ) {
			case 'weekly': return addDays( s, 7 );
			case 'biweekly': return addDays( s, 14 );
			case 'monthly': return EX.addMonths( s, 1, bill.day );
			case 'quarterly': return EX.addMonths( s, 3, bill.day );
			case 'yearly': return EX.addMonths( s, 12, bill.day );
			default: return null;
		}
	};
	/** Open due dates of a bill from its current one up to `to` (inclusive). */
	EX.occurrences = ( bill, to ) => {
		const out = [];
		let d = bill.next;
		while ( d && d <= to && out.length < 400 ) {
			if ( bill.end && d > bill.end ) break;
			out.push( d );
			d = EX.nextAfter( bill, d );
		}
		return out;
	};

	/* ------------------------------------------------------------------ Categories, templates, constants */

	EX.EXPENSE_CATS = [
		[ 'housing', '🏠' ], [ 'utilities', '💡' ], [ 'subscriptions', '📺' ], [ 'insurance', '🛡️' ], [ 'loans', '💳' ], [ 'transport', '🚗' ], [ 'health', '🩺' ],
		[ 'education', '🎓' ], [ 'taxes', '🏛️' ], [ 'food', '🛒' ], [ 'shopping', '🛍️' ], [ 'leisure', '🎉' ], [ 'other', '📌' ],
	];
	EX.INCOME_CATS = [ [ 'salary', '💼' ], [ 'freelance', '🧾' ], [ 'gifts', '🎁' ], [ 'interest', '📈' ], [ 'otherIncome', '💰' ] ];
	EX.TEMPLATES = [
		[ 'tplRent', 'housing', 'monthly' ], [ 'tplElectricity', 'utilities', 'monthly' ], [ 'tplWater', 'utilities', 'quarterly' ], [ 'tplInternet', 'utilities', 'monthly' ],
		[ 'tplPhone', 'utilities', 'monthly' ], [ 'tplNetflix', 'subscriptions', 'monthly' ], [ 'tplSpotify', 'subscriptions', 'monthly' ], [ 'tplCarIns', 'insurance', 'yearly' ],
		[ 'tplCard', 'loans', 'monthly' ], [ 'tplGym', 'health', 'monthly' ], [ 'tplPropTax', 'taxes', 'yearly' ], [ 'tplSchool', 'education', 'quarterly' ],
	];
	EX.LEADS = [ 0, 1, 2, 3, 5, 7, 14 ];
	EX.REPEATS = [ 'once', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly' ];
	EX.PER_YEAR = { weekly: 52, biweekly: 26, monthly: 12, quarterly: 4, yearly: 1 };
	EX.WALLET_TYPES = [ [ 'cash', '💵' ], [ 'bank', '🏦' ], [ 'card', '💳' ], [ 'savings', '🐖' ], [ 'other', '👛' ] ];
	EX.WALLET_ICON = { cash: 'cash', bank: 'building-bank', card: 'credit-card', savings: 'pig-money', other: 'wallet' };
	// Built-in categories: an icon from the bundled set and a tint (see .tint-* in style.css).
	EX.CAT_STYLE = {
		housing: [ 'home', 'blue' ], utilities: [ 'bolt', 'amber' ], subscriptions: [ 'device-tv', 'purple' ], insurance: [ 'shield', 'teal' ], loans: [ 'credit-card', 'red' ], transport: [ 'car', 'green' ],
		health: [ 'heartbeat', 'pink' ], education: [ 'school', 'blue' ], taxes: [ 'building-bank', 'gray' ], food: [ 'shopping-cart', 'amber' ], shopping: [ 'shopping-bag', 'pink' ], leisure: [ 'confetti', 'purple' ], other: [ 'dots', 'gray' ],
		salary: [ 'briefcase', 'green' ], freelance: [ 'receipt', 'teal' ], gifts: [ 'gift', 'pink' ], interest: [ 'trending-up', 'green' ], otherIncome: [ 'coin', 'amber' ],
	};
	EX.repeatLabel = ( r ) => t( 'l' + r.charAt( 0 ).toUpperCase() + r.slice( 1 ) );

	/* ------------------------------------------------------------------ State and storage */

	const KEY = 'expenity.v2', OLD_KEY = 'expenity.v1';

	const blank = () => ( {
		bills: [], txs: [], accounts: [], categories: [], budgets: [], goals: [], incomes: [],
		settings: { currency: 'EUR', lead: 3, name: '', setupDone: false, aims: [], tipsOff: [] }, // synced
		device: { notify: false, lastNotified: {}, onboarded: false, installDismissed: false, bannerDismissed: false, stage: '', setupStep: 0, guest: false, motion: 'auto' }, // this device only
		sync: { rev: 0, base: {}, spaces: {} },                            // sync bookkeeping, this device only
	} );
	let S = blank();
	EX.state = () => S;
	EX.uid = () => ( window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'id' + Date.now().toString( 36 ) + Math.random().toString( 36 ).slice( 2, 10 ) );

	function migrateV1( raw ) {
		// Version 0.1 kept bills and a list of payments. Payments become expense transactions.
		const n = blank();
		n.bills = ( raw.bills || [] ).map( ( b ) => b );
		n.settings.currency = ( raw.settings && raw.settings.currency ) || n.settings.currency;
		n.settings.lead = raw.settings && raw.settings.lead != null ? raw.settings.lead : 3;
		n.device.notify = !! ( raw.settings && raw.settings.notify );
		n.device.lastNotified = ( raw.settings && raw.settings.lastNotified ) || {};
		const wallet = { id: EX.uid(), name: t( 'wCash' ), type: 'cash', currency: n.settings.currency, opening: '0', auto: true };
		n.accounts.push( wallet );
		( raw.payments || [] ).forEach( ( p ) => {
			if ( p.amount === '' || p.amount == null ) return;
			n.txs.push( { id: p.id || EX.uid(), type: 'expense', amount: String( p.amount ), account: wallet.id, category: p.category || 'other', date: p.paidOn, name: p.name || '', billId: p.billId, due: p.due } );
		} );
		return n;
	}

	EX.load = () => {
		try {
			const raw = JSON.parse( localStorage.getItem( KEY ) || 'null' );
			if ( raw && Array.isArray( raw.bills ) ) {
				const n = blank();
				S = Object.assign( n, raw, { settings: Object.assign( n.settings, raw.settings || {} ), device: Object.assign( n.device, raw.device || {} ), sync: Object.assign( n.sync, raw.sync || {} ) } );
				EX.repairCurrencies();
				return;
			}
			const old = JSON.parse( localStorage.getItem( OLD_KEY ) || 'null' );
			if ( old && Array.isArray( old.bills ) ) { S = migrateV1( old ); EX.persist(); }
		} catch ( e ) { /* private mode or corrupt data: start empty */ }
	};
	let saveFailed = false;
	EX.persist = () => {
		try { localStorage.setItem( KEY, JSON.stringify( S ) ); saveFailed = false; return true; } catch ( e ) { if ( ! saveFailed ) EX.emit( 'savefail' ); saveFailed = true; return false; }
	};
	/** After any change the user made: store it, tell the app (re-draw) and sync (push). */
	EX.save = () => { if ( !EX.persist() ) return false; EX.emit( 'change' ); return true; };
	EX.replaceState = ( next ) => {
		const n = blank();
		S = Object.assign( n, next, { settings: Object.assign( n.settings, next.settings || {} ), device: Object.assign( n.device, next.device || {} ), sync: Object.assign( n.sync, next.sync || {} ) } );
	};
	EX.resetState = () => { S = blank(); EX.persist(); };

	/** A wallet to put things in. Created on demand; it is a plain "Cash" wallet the user can rename. */
	EX.ensureWallet = () => {
		if ( S.accounts.length || S.device.stage !== 'done' ) return; // no wallets until the first-run flow is finished
		S.accounts.push( { id: EX.uid(), name: t( 'wCash' ), type: 'cash', currency: S.settings.currency, opening: '0', auto: true } );
	};

	/* ------------------------------------------------------------------ Money */

	EX.cents = ( v ) => Math.round( ( parseFloat( String( v == null || v === '' ? 0 : v ).replace( ',', '.' ) ) || 0 ) * 100 );
	EX.fromCents = ( c ) => ( c / 100 ).toFixed( 2 );
	EX.money = ( n, cur ) => {
		try { return new Intl.NumberFormat( EX.loc(), { style: 'currency', currency: cur || S.settings.currency, maximumFractionDigits: Math.abs( n % 1 ) > 0.0001 ? 2 : 0 } ).format( n ); } catch ( e ) { return ( cur || '' ) + ' ' + n; }
	};
	EX.num = ( n ) => n.toLocaleString( EX.loc(), { maximumFractionDigits: 0 } );
	EX.esc = ( s ) => String( s == null ? '' : s ).replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' ).replace( /"/g, '&quot;' );
	/* ---- Exchange rates (daily, from the API; approximate). Units of a currency per 1 EUR. */
	EX.rates = { date: '', rates: {} };
	try { const r = JSON.parse( localStorage.getItem( 'expenity.rates' ) || 'null' ); if ( r && r.rates ) EX.rates = r; } catch ( e ) { /* none yet */ }
	EX.setRates = ( r ) => { EX.rates = r; try { localStorage.setItem( 'expenity.rates', JSON.stringify( r ) ); } catch ( e ) { /* ignore */ } EX.emit( 'rates' ); };
	const rateOf = ( c ) => ( c === 'EUR' ? 1 : EX.rates.rates && EX.rates.rates[ c ] );
	/** Converts an amount between currencies with the cached rates, or returns null when a rate is missing. */
	EX.convert = ( amount, from, to ) => {
		if ( from === to ) return amount;
		const a = rateOf( from ), b = rateOf( to );
		return a && b ? ( amount / a ) * b : null;
	};
	/** Fixes data made before currencies followed wallets: a bill is in the currency of the wallet that pays it. */
	EX.repairCurrencies = () => {
		let changed = false;
		S.bills.forEach( ( b ) => { const a = b.account && S.accounts.find( ( x ) => x.id === b.account ); if ( a && a.currency !== b.currency ) { b.currency = a.currency; changed = true; } } );
		return changed;
	};
	/**
	 * A total of mixed items as text. Same currency: plain. Several currencies: converted into the main currency with
	 * today's approximate rates and shown with "≈"; if a rate is missing, the currencies are listed side by side with " · ".
	 */
	EX.sumByCur = ( items, pick = ( x ) => x.amount ) => {
		const tot = {};
		items.forEach( ( x ) => { const v = Number( String( pick( x ) ).replace( ',', '.' ) ) || 0; tot[ x.currency ] = ( tot[ x.currency ] || 0 ) + v; } );
		const entries = Object.entries( tot ).filter( ( [ , v ] ) => v );
		if ( ! entries.length ) return EX.money( 0, S.settings.currency );
		if ( entries.length === 1 ) return EX.money( entries[ 0 ][ 1 ], entries[ 0 ][ 0 ] );
		const main = S.settings.currency;
		const conv = entries.map( ( [ c, v ] ) => EX.convert( v, c, main ) );
		if ( conv.every( ( v ) => v != null ) ) return '≈ ' + EX.money( conv.reduce( ( a, b ) => a + b, 0 ), main );
		return entries.map( ( [ c, v ] ) => EX.money( v, c ) ).join( ' · ' );
	};
	/** Cents in the main currency of a list of { currency, amount } (other currencies converted; unconvertible ones left out). */
	EX.mainCents = ( list ) => list.reduce( ( s, x ) => { const v = EX.convert( Number( String( x.amount ).replace( ',', '.' ) ) || 0, x.currency, S.settings.currency ); return v == null ? s : s + Math.round( v * 100 ); }, 0 );

	/* ------------------------------------------------------------------ Wallets, categories, transactions */

	EX.account = ( id ) => S.accounts.find( ( a ) => a.id === id );
	// Built-in wallet labels are translated at display time; custom names stay exactly as entered.
	EX.accountName = a => {
		if(!a)return '';
		const key = a.type === 'cash' ? 'wCash' : 'wt' + (a.type||'other').charAt(0).toUpperCase() + (a.type||'other').slice(1);
		const defaults = Object.values(I18N.langs).map(l=>l[key]).filter(x=>typeof x==='string');
		return defaults.includes(a.name) ? t(key) : a.name || t(key);
	};
	EX.compactAccountName = a => a?.type==='bank' && EX.accountName(a)===t('wtBank') ? t('wtBankCompact') : EX.accountName(a);
	EX.savedNames = type => (S.settings.savedNames || []).filter(x=>x && x.type===type && typeof x.name==='string');
	EX.rememberName = (type,name,category,extra={}) => {
		name=String(name||'').trim().slice(0,80);if(!name||!['expense','income'].includes(type))return;
		const previous=(S.settings.savedNames||[]).find(x=>x.type===type&&EX.fold(x.name)===EX.fold(name));
		const old=(S.settings.savedNames||[]).filter(x=>!(x.type===type&&EX.fold(x.name)===EX.fold(name)));
		S.settings.savedNames=[{type,name,pinned:!!previous?.pinned,category:category||'',...(extra.account?{account:extra.account}:{}),...(extra.amount?{amount:extra.amount}:{})},...old].slice(0,30);
	};

	EX.activeAccounts = () => S.accounts.filter( ( a ) => ! a.archived );
	/** Shared wallets: the person's role in a wallet (null for their own), and what they may change. */
	EX.role = ( a ) => ( a && a.space ? ( ( ( S.sync.spaces || {} )[ a.space ] || {} ).role || 'viewer' ) : null );
	EX.canWrite = ( id ) => { const a = EX.account( id ); return ! a || EX.role( a ) !== 'viewer'; };
	EX.writableAccounts = () => EX.activeAccounts().filter( ( a ) => EX.role( a ) !== 'viewer' );
	EX.sameScope = ( a, b ) => ( ( a && a.space ) || '' ) === ( ( b && b.space ) || '' );
	/** Another wallet a transfer can go to: same owner store, writable. */
	EX.peerAccount = ( id ) => { const me = EX.account( id ); return EX.writableAccounts().find( ( a ) => a.id !== id && EX.sameScope( a, me ) ) || null; };
	EX.txCurrency = ( tx ) => ( EX.account( tx.account ) || {} ).currency || S.settings.currency;
	/** A wallet's balance in cents: opening balance plus income, minus expenses, minus transfers out, plus transfers in. */
	EX.balance = ( acc ) => {
		let c = EX.cents( acc.opening );
		S.txs.forEach( ( x ) => {
			if ( x.account === acc.id ) {
				if ( x.type === 'income' ) c += EX.cents( x.amount );
				else c -= EX.cents( x.amount ); // expense or transfer out
			}
			if ( x.type === 'transfer' && x.toAccount === acc.id ) c += EX.cents( x.toAmount || x.amount );
		} );
		return c;
	};
	EX.walletLabel = ( a ) => `${ ( EX.WALLET_TYPES.find( ( w ) => w[ 0 ] === a.type ) || EX.WALLET_TYPES[ 4 ] )[ 1 ] } ${ EX.accountName(a) }`;

	const builtIn = ( key ) => EX.EXPENSE_CATS.concat( EX.INCOME_CATS ).find( ( c ) => c[ 0 ] === key );
	EX.catInfo = ( key ) => {
		if ( key === 'uncategorized' ) return { key, iconName:'dots', color:'gray', name:t('entryUncat') };
		if ( key === 'goal' ) return { key, icon: '🎯', iconName: 'target', color: 'pink', name: t( 'cat_goal' ) }; // money set aside for a goal
		const b = builtIn( key );
		if ( b ) return { key, icon: b[ 1 ], iconName: EX.CAT_STYLE[ key ][ 0 ], color: EX.CAT_STYLE[ key ][ 1 ], name: t( 'cat_' + key ) };
		const c = S.categories.find( ( x ) => x.id === key );
		return c ? { key, icon: c.icon || '📌', iconName: c.iconName || null, color: c.color || 'gray', name: c.name, custom: true } : { key: 'other', icon: '📌', iconName: 'dots', color: 'gray', name: t( 'cat_other' ) };
	};
	EX.catList = ( type ) => ( type === 'income' ? EX.INCOME_CATS : EX.EXPENSE_CATS ).map( ( c ) => EX.catInfo( c[ 0 ] ) )
		.concat( S.categories.filter( ( c ) => c.type === type ).map( ( c ) => EX.catInfo( c.id ) ) ).concat(EX.catInfo('uncategorized'));

	/** Transactions of a month, newest first. */
	EX.monthTxs = ( y, m ) => { const k = `${ y }-${ pad( m + 1 ) }`; return S.txs.filter( ( x ) => x.date.startsWith( k ) ).sort( ( a, b ) => ( a.date < b.date ? 1 : a.date > b.date ? -1 : 0 ) ); };
	/** Income, expense and net totals of a list of transactions, per currency. Transfers are neither. */
	EX.flow = ( txs ) => {
		const f = { income: [], expense: [] };
		txs.forEach( ( x ) => { if ( ! x.goalId && ( x.type === 'income' || x.type === 'expense' ) ) f[ x.type ].push( { currency: EX.txCurrency( x ), amount: x.amount } ); } );
		return f;
	};

	/** Records a payment of a bill as an expense transaction. */
	EX.payBill = ( bill, { amount, date, account } ) => {
		const tx = { id: EX.uid(), type: 'expense', amount: String( amount ), account: account || bill.account || ( EX.activeAccounts()[ 0 ] || {} ).id, category: bill.category, date, name: bill.name, billId: bill.id, due: bill.next, photo: bill.photo || '', tags: bill.tags || [] };
		S.txs.push( tx );
		return tx;
	};

	/* ------------------------------------------------------------------ Sentence parser (English and Greek) */

	// Matching runs on a lower-case, accent-free copy of the text (same length as the original), so
	// "Κάθε Μήνα" and "καθε μηνα" are the same. English and Greek words work in either language.
	const ACC = { 'ά': 'α', 'έ': 'ε', 'ή': 'η', 'ί': 'ι', 'ό': 'ο', 'ύ': 'υ', 'ώ': 'ω', 'ϊ': 'ι', 'ϋ': 'υ', 'ΐ': 'ι', 'ΰ': 'υ', 'ς': 'σ' };
	const fold = ( s ) => s.toLowerCase().replace( /[άέήίόύώϊϋΐΰς]/g, ( c ) => ACC[ c ] );
	EX.fold = fold;
	const B = '(?<![\\p{L}\\p{N}])', E = '(?![\\p{L}\\p{N}])';
	const MONTH_RE = '(ιαν|φεβ|μαρ|απρ|μαι|ιουν|ιουλ|αυγ|σεπ|οκτ|νοε|δεκ|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\\p{L}*';
	const MONTH_IDX = [ 'ιαν|jan', 'φεβ|feb', 'μαρ|mar', 'απρ|apr', 'μαι|may', 'ιουν|jun', 'ιουλ|jul', 'αυγ|aug', 'σεπ|sep', 'οκτ|oct', 'νοε|nov', 'δεκ|dec' ].map( ( s ) => s.split( '|' ) );
	const WD_RE = '(κυριακη|δευτερα|τριτη|τεταρτη|πεμπτη|παρασκευη|σαββατο|sun|mon|tue|wed|thu|fri|sat)\\p{L}*';
	const WD_IDX = [ [ 'κυριακη', 'sun' ], [ 'δευτερα', 'mon' ], [ 'τριτη', 'tue' ], [ 'τεταρτη', 'wed' ], [ 'πεμπτη', 'thu' ], [ 'παρασκευη', 'fri' ], [ 'σαββατο', 'sat' ] ];

	EX.nextWithDay = ( day, from = today() ) => {
		const d = parse( from );
		const mk = ( y, m ) => iso( new Date( y, m, Math.min( day, dim( y, m ) ) ) );
		let c = mk( d.getFullYear(), d.getMonth() );
		if ( c < from ) c = mk( d.getFullYear() + ( d.getMonth() === 11 ? 1 : 0 ), ( d.getMonth() + 1 ) % 12 );
		return c;
	};

	/** The most recent date (today or earlier) that falls on this day of the month. */
	EX.prevWithDay = ( day, from = today() ) => {
		const d = parse( from );
		const mk = ( y, m ) => iso( new Date( y, m, Math.min( day, dim( y, m ) ) ) );
		let c = mk( d.getFullYear(), d.getMonth() );
		if ( c > from ) c = mk( d.getFullYear() - ( d.getMonth() === 0 ? 1 : 0 ), ( d.getMonth() + 11 ) % 12 );
		return c;
	};

	/** "Netflix 15.99 monthly on the 3rd", "Coffee 3.50 yesterday", "Ενοίκιο 850€ κάθε μήνα στις 1". */
	EX.parseQuick = ( text, opts = {} ) => {
		let orig = ' ' + text.trim() + ' ';
		let norm = fold( orig );
		const out = {};
		const cut = ( re ) => {
			const m = new RegExp( re, 'iu' ).exec( norm );
			if ( ! m ) return null;
			const blankS = ' '.repeat( m[ 0 ].length );
			norm = norm.slice( 0, m.index ) + blankS + norm.slice( m.index + m[ 0 ].length );
			orig = orig.slice( 0, m.index ) + blankS + orig.slice( m.index + m[ 0 ].length );
			return m;
		};
		const cur = /[€$£]/.exec( norm );
		if ( cur ) out.currency = { '€': 'EUR', '$': 'USD', '£': 'GBP' }[ cur[ 0 ] ];
		const code = cut( `${ B }(eur|usd|gbp|chf|cad|aud|sek|nok|dkk|pln|try)${ E }` );
		if ( code ) out.currency = code[ 1 ].toUpperCase();
		if ( cut( `${ B }ευρω${ E }` ) ) out.currency = 'EUR';
		if ( /~/.test( norm ) || cut( `${ B }(about|around|approx\\p{L}*|περιπου)${ E }` ) ) out.variable = true;
		// Income or expense.
		// Words like "salary" decide the type but stay in the description; "income" and "expense" are only markers.
		if ( new RegExp( `${ B }(salary|wage|wages|bonus|refund|revenue|μισθος|επιστροφη|μπονους)${ E }`, 'iu' ).test( norm ) ) out.type = 'income';
		while ( cut( `${ B }(income|received|εσοδο|εσοδα|εισπραχθηκε|εισπραξη)${ E }` ) ) out.type = 'income';
		while ( cut( `${ B }(expense|spent|εξοδο|εξοδα|ξοδεψα)${ E }` ) ) out.type = out.type || 'expense';
		// Repeat.
		const reps = [
			[ `${ B }(bi-?weekly|fortnightly|every (2|two) weeks|καθε (2|δυο) εβδομαδες|ανα (2|δυο) εβδομαδες|δεκαπενθημερ\\p{L}*)${ E }`, 'biweekly' ],
			[ `${ B }(weekly|every week|each week|εβδομαδιαι\\p{L}*|καθε εβδομαδα)${ E }`, 'weekly' ],
			[ `${ B }(quarterly|every (3|three) months|τριμηνια\\p{L}*|καθε (3|τρεις) μηνες|καθε τριμηνο)${ E }`, 'quarterly' ],
			[ `${ B }(yearly|annually|annual|every year|each year|per year|ετησι\\p{L}*|καθε (χρονο|ετος))${ E }`, 'yearly' ],
			[ `${ B }(monthly|every month|each month|per month|a month|μηνιαι\\p{L}*|καθε μηνα|τον μηνα)${ E }`, 'monthly' ],
			[ `${ B }(once|one-?off|one time|εφαπαξ|μια φορα)${ E }`, 'once' ],
		];
		for ( const [ re, v ] of reps ) { if ( cut( re ) ) { out.repeat = v; break; } }
		// Dates.
		let day = null, date = null;
		let m = cut( `${ B }(\\d{4})-(\\d{2})-(\\d{2})${ E }` );
		if ( m ) date = m[ 0 ].trim();
		if ( ! date ) {
			m = cut( `${ B }(today|tomorrow|yesterday|σημερα|αυριο|χθες|χτες)${ E }` );
			if ( m ) { const w = m[ 1 ].toLowerCase(); date = [ 'today', 'σημερα' ].includes( w ) ? today() : [ 'tomorrow', 'αυριο' ].includes( w ) ? addDays( today(), 1 ) : addDays( today(), -1 ); }
		}
		if ( ! date ) {
			m = cut( `${ B }(?:(?:on|στις|την)\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th|η|ης)?\\s+(?:of\\s+|του\\s+)?${ MONTH_RE }${ E }` )
				|| cut( `${ B }${ MONTH_RE }\\s+(\\d{1,2})(?:st|nd|rd|th)?${ E }` );
			if ( m ) {
				const dd = Number( m[ 1 ].match( /^\d/ ) ? m[ 1 ] : m[ 3 ] || m[ 2 ] );
				const word = ( m[ 1 ].match( /^\d/ ) ? m[ 2 ] : m[ 1 ] ).toLowerCase();
				const mi = MONTH_IDX.findIndex( ( p ) => p.includes( word ) );
				if ( dd >= 1 && dd <= 31 && mi >= 0 ) {
					const y = new Date().getFullYear();
					let c = iso( new Date( y, mi, Math.min( dd, dim( y, mi ) ) ) );
					if ( opts.past ) { if ( c > today() ) c = iso( new Date( y - 1, mi, Math.min( dd, dim( y - 1, mi ) ) ) ); }
					else if ( c < today() ) c = iso( new Date( y + 1, mi, Math.min( dd, dim( y + 1, mi ) ) ) );
					date = c; day = dd;
					if ( ! out.repeat ) out.repeat = 'once';
				}
			}
		}
		if ( ! date ) {
			m = cut( `${ B }(?:(?:every|on|καθε|την)\\s+)?${ WD_RE }${ E }` );
			if ( m ) {
				const w = m[ 1 ].toLowerCase();
				const target = WD_IDX.findIndex( ( p ) => p.includes( w ) );
				if ( target >= 0 ) {
					date = addDays( today(), opts.past ? -( ( new Date().getDay() - target + 7 ) % 7 ) : ( target - new Date().getDay() + 7 ) % 7 );
					if ( ! out.repeat ) out.repeat = 'weekly';
				}
			}
		}
		if ( ! date ) {
			m = cut( `${ B }(?:(?:on|the|στις|την|στη|καθε)\\s+)*(\\d{1,2})(?:st|nd|rd|th|η|ης)${ E }` ) || cut( `${ B }(?:on|στις|την|στη|καθε)\\s+(?:the\\s+)?(\\d{1,2})(?:\\s+του\\s+μηνα)?${ E }` ) || cut( `${ B }(\\d{1,2})\\s+του\\s+μηνα${ E }` );
			if ( m && Number( m[ 1 ] ) >= 1 && Number( m[ 1 ] ) <= 31 ) {
				day = Number( m[ 1 ] ); date = opts.past ? EX.prevWithDay( day ) : EX.nextWithDay( day );
				if ( ! out.repeat ) out.repeat = 'monthly';
			}
		}
		// Amount: the first remaining number, with . or , as decimal mark.
		m = /(\d+(?:[.,]\d{1,2})?)/.exec( norm.replace( /(\d)[.,](\d{3})(?!\d)/g, '$1$2' ) );
		if ( m ) {
			out.amount = m[ 1 ].replace( ',', '.' );
			const at = norm.indexOf( m[ 1 ] );
			if ( at >= 0 ) { const blankS = ' '.repeat( m[ 1 ].length ); orig = orig.slice( 0, at ) + blankS + orig.slice( at + m[ 1 ].length ); norm = norm.slice( 0, at ) + blankS + norm.slice( at + m[ 1 ].length ); }
		}
		const name = orig.replace( /[€$£~]/g, ' ' ).replace( new RegExp( `${ B }(on|the|every|each|per|a|an|for|of|about|around|due|pay|bill|στις|στη|στην|στο|τον|την|κάθε|Κάθε|ανά|για|του)${ E }`, 'giu' ), ' ' ).replace( /[^\p{L}\p{N}&'’.+()-]+/gu, ' ' ).replace( /\s+/g, ' ' ).trim();
		if ( name ) out.name = name.charAt( 0 ).toUpperCase() + name.slice( 1 );
		if ( date ) { out.next = date; out.date = date; if ( day ) out.day = day; }
		if ( ! out.repeat && out.next ) out.repeat = 'once';
		return out;
	};
}() );
