/**
 * eFriend Blog (release 1): a small blog eFriend writes from your own entries, on this device, with rules and templates (no AI).
 *   - Only a tiny record is stored (settings.efBlog = { c: [ { id, wrote } ], gentle }). The facts are recomputed from your entries as of the "wrote" date,
 *     and the words are rendered from templates at view time with a fixed seed, so a chapter never changes between opens and works in either language and for either friend.
 *   - Every sentence names the facts it needs (the {placeholders} in its text); a sentence whose facts are missing is never written.
 *   - Lines tagged r:1 are the teasing ones. Gentle mode drops exactly those. Hard topics (insurance, health, loans, taxes, education, housing) are never teased.
 *   - Days 0-9 after the first entry the blog is locked; from day 10 the written chapters can be read (the "sneak peek").
 */
( function () {
	'use strict';
	const EX = window.EX, UI = window.UI, EXA = window.EXA;
	const { t, esc } = EX;
	const S = EX.state;
	const B = ( EXA.efblog = {} );
	const LOCK_DAYS = 10;
	const HARD = new Set( [ 'insurance', 'health', 'loans', 'taxes', 'education', 'housing' ] );
	const HARD_NAME = /insur|health|medic|doctor|loan|debt|mortgage|tax|educ|school|tuition|rent|ασφάλ|υγεί|γιατρ|δάνει|χρέ|φόρ|εκπαίδ|σχολ|ενοίκ|στεγαστ/i;

	/* ------------------------------------------------------------------ Words: [EN Boogie, EL Boogie, EN Chip, EL Chip]; "|" separates variants. A missing Chip text means "same as Boogie". */
	const CHAPTERS = [
		{
			id: 'first', title: [ 'First impressions', 'Πρώτες εντυπώσεις' ], unlock: [ '5 entries', '5 εγγραφές' ], ready: ( f ) => f.n >= 5,
			lines: [
				{ t: [ 'Side A, track one. 📼 Your first entry arrived on **{firstDate}**: {firstWhat}. Every tape starts somewhere.|Side A, track one. 📼 The tape started rolling on **{firstDate}** with this: {firstWhat}.',
					'Πλευρά Α, κομμάτι πρώτο. 📼 Η πρώτη σας εγγραφή ήρθε στις **{firstDate}**: {firstWhat}. Κάθε κασέτα ξεκινά από κάπου.|Πλευρά Α, κομμάτι πρώτο. 📼 Η κασέτα άρχισε να γυρίζει στις **{firstDate}** με αυτό: {firstWhat}.',
					'burning chapter_01.txt... 💿 first entry landed on **{firstDate}**: {firstWhat}. the journey begins!|chapter_01.txt is live! 🚀 it all started on **{firstDate}** with {firstWhat}.',
					'Καίω το chapter_01.txt... 💿 η πρώτη εγγραφή έφτασε στις **{firstDate}**: {firstWhat}. Το ταξίδι ξεκινά!|Το chapter_01.txt είναι έτοιμο! 🚀 Όλα ξεκίνησαν στις **{firstDate}** με {firstWhat}.' ] },
				{ t: [ 'Entries so far: **{n}**. Categories used: **{cats}**. 🎙️', 'Εγγραφές μέχρι τώρα: **{n}**. Κατηγορίες που χρησιμοποιήσατε: **{cats}**. 🎙️', 'entries so far: **{n}** 📊 categories used: **{cats}** ✨', 'Εγγραφές μέχρι τώρα: **{n}** 📊 Κατηγορίες που χρησιμοποιήσατε: **{cats}** ✨' ] },
				{ r: 1, need: [ 'n' ], t: [ 'That is enough material for a first track, and I have barely warmed up my reels. 🎧|Not bad for a first listen. My reels are still warming up. 🎧',
					'Αρκετό υλικό για ένα πρώτο κομμάτι, και τα καρούλια μου δεν έχουν καν ζεσταθεί. 🎧|Όχι άσχημα για την πρώτη ακρόαση. Τα καρούλια μου ακόμα ζεσταίνονται. 🎧',
					'ok that is already enough for a first chapter and i have not even finished my snacks 🍕😂|not bad for day one, my fans are only just spinning up 💨',
					'Ήδη αρκετά για ένα πρώτο κεφάλαιο και δεν έχω καν τελειώσει τα σνακ μου 🍕😂|Όχι άσχημα για την αρχή, οι ανεμιστήρες μου μόλις άρχισαν να γυρίζουν 💨' ] },
				{ t: [ 'That is track one. I will keep the tape running as your story grows. 🎶', 'Αυτό ήταν το πρώτο κομμάτι. Θα αφήσω την κασέτα να γυρίζει όσο μεγαλώνει η ιστορία σας. 🎶', 'chapter one: done ✅ more coming as you keep logging!! 🚀', 'Κεφάλαιο πρώτο: έτοιμο ✅ Θα έρθουν κι άλλα όσο συνεχίζετε να καταγράφετε!! 🚀' ] },
			],
		},
		{
			id: 'where', title: [ 'Where your money goes', 'Πού πάνε τα χρήματά σας' ], unlock: [ '20 expenses', '20 έξοδα' ], ready: ( f ) => f.ne >= 20,
			lines: [
				{ k: 1, t: [ 'Whatever the numbers say, you are looking at them, and that is the brave part. 💛', 'Ό,τι κι αν δείχνουν τα νούμερα, τα κοιτάτε κατάματα, και αυτό είναι το γενναίο μέρος. 💛', 'whatever the numbers say, you are here looking at them and that takes guts 💛', 'Ό,τι κι αν δείχνουν τα νούμερα, είστε εδώ και τα κοιτάτε, και αυτό θέλει θάρρος 💛' ] },
				{ t: [ 'Side A, track two. 🎶 Your biggest category is **{t1}**, with **{t1p}%** of your spending. Very human.|Track two, and the needle points at **{t1}**: **{t1p}%** of everything you spend. 🎶',
					'Πλευρά Α, κομμάτι δεύτερο. 🎶 Η μεγαλύτερη κατηγορία σας: **{t1}**, με **{t1p}%** των εξόδων σας. Πολύ ανθρώπινο.|Κομμάτι δεύτερο, και η βελόνα δείχνει **{t1}**: **{t1p}%** απ’ όσα ξοδεύετε. 🎶',
					'burning chapter_02.txt... 💿 FINDINGS: biggest category is **{t1}** at **{t1p}%** of your spending|chapter_02.txt loaded 📂 top category: **{t1}** with **{t1p}%** of your spending',
					'Καίω το chapter_02.txt... 💿 ΕΥΡΗΜΑΤΑ: μεγαλύτερη κατηγορία: **{t1}**, με **{t1p}%** των εξόδων σας|Το chapter_02.txt φορτώθηκε 📂 κορυφαία κατηγορία: **{t1}**, με **{t1p}%** των εξόδων σας' ] },
				{ r: 1, need: [ 't1', 't1p' ], when: ( f ) => ! isHard( f.t1k ), t: [ 'The **{t1}** category has a reserved seat on this tape. Even my reels blushed. 🎙️|At **{t1p}%**, **{t1}** is practically a co-author of this tape. 🎙️',
					'Η κατηγορία **{t1}** έχει δική της θέση σε αυτή την κασέτα. Ακόμα και τα καρούλια μου κοκκίνισαν. 🎙️|Με **{t1p}%**, η κατηγορία **{t1}** είναι σχεδόν συν-συγγραφέας αυτής της κασέτας. 🎙️',
					'**{t1}** at **{t1p}%** is not a budget, that is a lifestyle 😂 five stars, zero regrets|**{t1}** is basically your main character 🎬 i respect it',
					'**{t1}** με **{t1p}%** δεν είναι προϋπολογισμός, είναι τρόπος ζωής 😂 πέντε αστέρια, μηδέν μετάνοιες|Η κατηγορία **{t1}** είναι ουσιαστικά ο πρωταγωνιστής σας 🎬 Το σέβομαι' ] },
				{ t: [ 'Second place goes to **{t2}** with **{t2p}%**. 🥈', 'Δεύτερη θέση: **{t2}**, με **{t2p}%**. 🥈', 'silver medal: **{t2}** at **{t2p}%** 🥈', 'Ασημένιο μετάλλιο: **{t2}**, με **{t2p}%** 🥈' ] },
				{ t: [ 'Third place: **{t3}** with **{t3p}%**. 🥉', 'Τρίτη θέση: **{t3}**, με **{t3p}%**. 🥉', 'bronze: **{t3}** at **{t3p}%** 🥉', 'Χάλκινο μετάλλιο: **{t3}**, με **{t3p}%** 🥉' ] },
				{ when: ( f ) => f.catsE === 1, need: [ 't1' ], t: [ 'Everything so far sits in one category: **{t1}**. Simple, and easy to follow.', 'Όλα μέχρι τώρα ανήκουν σε μία κατηγορία: **{t1}**. Απλό και εύκολο να παρακολουθηθεί.', 'everything so far lives in one category: **{t1}**. simple and clean ✨', 'Όλα μέχρι τώρα ανήκουν σε μία κατηγορία: **{t1}**. Απλό και καθαρό ✨' ] },
				{ t: [ 'There are **{ne}** expenses behind these numbers, so this is a real picture.', 'Πίσω από αυτά τα νούμερα βρίσκονται **{ne}** έξοδα, άρα η εικόνα είναι αληθινή.', 'built from **{ne}** expenses, so it is legit 📊', 'Βασίζεται σε **{ne}** έξοδα, άρα είναι αξιόπιστο 📊' ] },
			],
		},
		{
			id: 'rhythm', title: [ 'Your rhythm', 'Ο ρυθμός σας' ], unlock: [ '30 expenses over 14+ days', '30 έξοδα σε 14+ ημέρες' ], ready: ( f ) => f.ne >= 30 && f.span >= 14,
			lines: [
				{ k: 1, t: [ 'Whatever the numbers say, you are looking at them, and that is the brave part. 💛', 'Ό,τι κι αν δείχνουν τα νούμερα, τα κοιτάτε κατάματα, και αυτό είναι το γενναίο μέρος. 💛', 'whatever the numbers say, you are here looking at them and that takes guts 💛', 'Ό,τι κι αν δείχνουν τα νούμερα, είστε εδώ και τα κοιτάτε, και αυτό θέλει θάρρος 💛' ] },
				{ t: [ 'Side A, track three. 🥁 Your busiest day is **{wd}**: **{wdp}%** of your expenses happen then.', 'Πλευρά Α, κομμάτι τρίτο. 🥁 Η πιο πολυάσχολη μέρα σας: **{wd}**, με **{wdp}%** των εξόδων σας.',
					'chapter_03.txt is ready 📂 busiest day: **{wd}** with **{wdp}%** of your expenses', 'Το chapter_03.txt είναι έτοιμο 📂 πιο πολυάσχολη μέρα: **{wd}**, με **{wdp}%** των εξόδων σας' ] },
				{ r: 1, need: [ 'wd' ], t: [ 'On **{wd}** you and your wallet meet most often. The reels have noticed. 🥁|**{wd}** is clearly spending day. I would circle it on the calendar. 🗓️',
					'Τη μέρα **{wd}** εσείς και το πορτοφόλι σας συναντιέστε πιο συχνά. Τα καρούλια το πρόσεξαν. 🥁|Η μέρα **{wd}** είναι σαφώς μέρα εξόδων. Θα την έκανα κύκλο στο ημερολόγιο. 🗓️',
					'**{wd}** is your spending day and i respect the commitment 😎|**{wd}** hits different for your wallet 💸',
					'Η μέρα **{wd}** είναι η μέρα των εξόδων σας και σέβομαι την αφοσίωση 😎|Η μέρα **{wd}** χτυπά αλλιώς το πορτοφόλι σας 💸' ] },
				{ when: ( f ) => f.weDir === 'more', need: [ 'wePct' ], t: [ 'Weekends carry **{wePct}%** of your spending, and per day that is more than on weekdays.', 'Τα Σαββατοκύριακα αντιστοιχούν στο **{wePct}%** των εξόδων σας, και ανά ημέρα είναι περισσότερα από τις καθημερινές.', 'weekends: **{wePct}%** of your spending, and more per day than weekdays 🎉', 'Σαββατοκύριακα: **{wePct}%** των εξόδων σας, και περισσότερα ανά ημέρα από τις καθημερινές 🎉' ] },
				{ r: 1, when: ( f ) => f.weDir === 'more', need: [ 'wePct' ], t: [ 'Weekends are clearly where the fun lives. 🎉|Your wallet does not rest on weekends. Neither do my reels.', 'Τα Σαββατοκύριακα είναι σαφώς εκεί όπου ζει η διασκέδαση. 🎉|Το πορτοφόλι σας δεν ξεκουράζεται τα Σαββατοκύριακα. Ούτε τα καρούλια μου.', 'someone has a social life 😏🎉|weekend mode: fully activated ⚡', 'Κάποιος έχει κοινωνική ζωή 😏🎉|Λειτουργία Σαββατοκύριακου: πλήρως ενεργοποιημένη ⚡' ] },
				{ when: ( f ) => f.weDir === 'less', need: [ 'wePct' ], t: [ 'Weekends carry **{wePct}%** of your spending, and per day that is less than on weekdays. A calm pair of days. 🛋️', 'Τα Σαββατοκύριακα αντιστοιχούν στο **{wePct}%** των εξόδων σας, και ανά ημέρα είναι λιγότερα από τις καθημερινές. Δύο ήρεμες ημέρες. 🛋️', 'weekends: **{wePct}%** of your spending, and less per day than weekdays. calm vibes 🛋️', 'Σαββατοκύριακα: **{wePct}%** των εξόδων σας, και λιγότερα ανά ημέρα από τις καθημερινές. Ήρεμη διάθεση 🛋️' ] },
				{ when: ( f ) => f.pdDir === 'more', need: [ 'pdPct' ], t: [ 'In the week after income arrives, you spend **{pdPct}%** more per day than usual.', 'Την εβδομάδα μετά την είσπραξη εισοδήματος ξοδεύετε **{pdPct}%** περισσότερα ανά ημέρα από το συνηθισμένο.', 'payday week: **{pdPct}%** more spending per day than usual 💸', 'Εβδομάδα πληρωμής: **{pdPct}%** περισσότερα έξοδα ανά ημέρα από το συνηθισμένο 💸' ] },
				{ r: 1, when: ( f ) => f.pdDir === 'more', need: [ 'pdPct' ], t: [ 'Payday week: the wallet wakes up. 💸|Income arrives, the reels spin faster.', 'Εβδομάδα πληρωμής: το πορτοφόλι ξυπνά. 💸|Το εισόδημα φτάνει και τα καρούλια γυρίζουν πιο γρήγορα.', 'money arrives, wallet says hello again 😂|payday energy is real ⚡', 'Έρχεται το εισόδημα και το πορτοφόλι λέει «ξανά γεια» 😂|Η ενέργεια της πληρωμής υπάρχει ⚡' ] },
				{ when: ( f ) => f.pdDir === 'less', need: [ 'pdPct' ], t: [ 'In the week after income arrives, you spend **{pdPct}%** less per day than usual. A cool head. 👏', 'Την εβδομάδα μετά την είσπραξη εισοδήματος ξοδεύετε **{pdPct}%** λιγότερα ανά ημέρα από το συνηθισμένο. Ψύχραιμη στάση. 👏', 'payday week: **{pdPct}%** less spending per day than usual. big respect 👏', 'Εβδομάδα πληρωμής: **{pdPct}%** λιγότερα έξοδα ανά ημέρα από το συνηθισμένο. Μεγάλος σεβασμός 👏' ] },
			],
		},
	];
	B.CHAPTERS = CHAPTERS;
	// Derive each sentence's needed fact keys from its placeholders (plus any it names), so a sentence can never be written with a hole in it.
	CHAPTERS.forEach( ( c ) => c.lines.forEach( ( l ) => { const keys = new Set( l.need || [] ); l.t.forEach( ( s ) => ( s.match( /\{(\w+)\}/g ) || [] ).forEach( ( m ) => keys.add( m.slice( 1, -1 ) ) ) ); l.need = [ ...keys ]; } ) );

	/* ------------------------------------------------------------------ Facts: a pure function of the entries and the date */
	const loc = ( lang ) => ( lang === 'el' ? 'el-GR' : 'en-GB' );
	const isHard = ( key ) => HARD.has( key ) || ( key && ! EX.INCOME_CATS.concat( EX.EXPENSE_CATS ).some( ( c ) => c[ 0 ] === key ) && HARD_NAME.test( catName( key, EX.lang ? EX.lang() : 'en' ) ) );
	const catName = ( key, lang ) => {
		const c = ( S().categories || [] ).find( ( x ) => x.id === key ); if ( c ) return c.name;
		const L = EX.I18N.langs[ lang || 'en' ] || EX.I18N.langs.en; return L[ 'cat_' + key ] || L[ 'cat_other' ] || key;
	};
	const cents = ( tx ) => EX.mainCents( [ { amount: tx.amount, currency: EX.txCurrency ? EX.txCurrency( tx ) : S().settings.currency } ] );
	/** @param {Array} txs the entries; @param {string} asOf 'YYYY-MM-DD' */
	B.facts = ( txs, asOf ) => {
		const all = ( txs || [] ).filter( ( x ) => ( x.type === 'income' || x.type === 'expense' ) && x.date && x.date <= asOf ).sort( ( a, b ) => ( a.date < b.date ? -1 : a.date > b.date ? 1 : 0 ) );
		const f = { n: all.length, asOf };
		if ( ! all.length ) return f;
		const ex = all.filter( ( x ) => x.type === 'expense' ), inc = all.filter( ( x ) => x.type === 'income' ), first = all[ 0 ];
		Object.assign( f, { ne: ex.length, firstDate: first.date, day: EX.diffDays( asOf, first.date ), firstName: ( first.name || '' ).trim(), firstCat: first.category || 'other', cats: new Set( all.map( ( x ) => x.category || 'other' ) ).size } );
		if ( ! ex.length ) return f;
		const by = {}; let total = 0;
		ex.forEach( ( x ) => { const c = cents( x ), k = x.category || 'other'; by[ k ] = ( by[ k ] || 0 ) + c; total += c; } );
		const top = Object.keys( by ).sort( ( a, b ) => by[ b ] - by[ a ] || ( a < b ? -1 : 1 ) ); f.catsE = top.length;
		if ( total > 0 ) top.slice( 0, 3 ).forEach( ( k, i ) => { f[ 't' + ( i + 1 ) + 'k' ] = k; f[ 't' + ( i + 1 ) + 'p' ] = Math.round( by[ k ] / total * 100 ); } );
		// Rhythm: busiest weekday, weekend against weekdays, the week after income against the rest.
		const d0 = ex[ 0 ].date, d1 = ex[ ex.length - 1 ].date; f.span = EX.diffDays( d1, d0 );
		const wc = [ 0, 0, 0, 0, 0, 0, 0 ]; ex.forEach( ( x ) => { wc[ EX.parse( x.date ).getDay() ]++; } );
		const best = [ 1, 2, 3, 4, 5, 6, 0 ].reduce( ( b, d ) => ( wc[ d ] > wc[ b ] ? d : b ), 1 ); f.wdi = best; f.wdp = Math.round( wc[ best ] / ex.length * 100 );
		const spend = {}; ex.forEach( ( x ) => { spend[ x.date ] = ( spend[ x.date ] || 0 ) + cents( x ); } );
		const days = []; for ( let d = d0; d <= d1; d = EX.addDays( d, 1 ) ) days.push( d );
		const isWe = ( d ) => { const g = EX.parse( d ).getDay(); return g === 0 || g === 6; };
		const we = days.filter( isWe ), wk = days.filter( ( d ) => ! isWe( d ) ), sum = ( l ) => l.reduce( ( s, d ) => s + ( spend[ d ] || 0 ), 0 );
		if ( we.length >= 2 && wk.length >= 5 && total > 0 && sum( wk ) > 0 ) { f.wePct = Math.round( sum( we ) / total * 100 ); f.weDir = sum( we ) / we.length > sum( wk ) / wk.length ? 'more' : 'less'; }
		const incDates = [ ...new Set( inc.map( ( x ) => x.date ) ) ];
		if ( incDates.length >= 2 ) {
			const pay = days.filter( ( d ) => incDates.some( ( i ) => { const k = EX.diffDays( d, i ); return k >= 0 && k <= 6; } ) ), rest = days.filter( ( d ) => ! pay.includes( d ) );
			if ( pay.length >= 3 && rest.length >= 3 && sum( rest ) > 0 ) {
				const a = sum( pay ) / pay.length, b = sum( rest ) / rest.length, pct = Math.round( Math.abs( a - b ) / b * 100 );
				if ( pct >= 10 ) { f.pdPct = pct; f.pdDir = a > b ? 'more' : 'less'; }
			}
		}
		return f;
	};
	/** Kindness guard: many late bills, or a wallet that is in the red. Money chapters then drop the teasing and add a kind line. */
	B.kind = ( bills, balances, today ) => ( bills || [] ).filter( ( b ) => ! b.done && b.next && b.next < today ).length >= 3 || ( balances || [] ).some( ( x ) => x < 0 );
	B.kindNow = () => B.kind( S().bills, EX.activeAccounts().map( EX.balance ), EX.today() );
	B.finished = ( f ) => ( f.ne || 0 ) >= 100 || ( f.day >= 60 && f.n >= 40 );

	/* ------------------------------------------------------------------ Words: pick a variant with a fixed seed, fill in the facts, drop what cannot be said */
	const hash = ( s ) => { let h = 2166136261; for ( let i = 0; i < s.length; i++ ) { h ^= s.charCodeAt( i ); h = Math.imul( h, 16777619 ); } return h >>> 0; };
	const vars = ( f, lang ) => {
		const v = {}, L = loc( lang );
		[ 'n', 'ne', 'cats', 'catsE', 't1p', 't2p', 't3p', 'wdp', 'wePct', 'pdPct' ].forEach( ( k ) => { if ( f[ k ] != null ) v[ k ] = String( f[ k ] ); } );
		[ 't1', 't2', 't3' ].forEach( ( k ) => { if ( f[ k + 'k' ] != null ) v[ k ] = catName( f[ k + 'k' ], lang ); } );
		if ( f.firstDate ) { v.firstDate = EX.parse( f.firstDate ).toLocaleDateString( L, { day: 'numeric', month: 'long', year: 'numeric' } ); v.firstWhat = f.firstName || catName( f.firstCat, lang ); }
		if ( f.wdi != null ) v.wd = new Date( 2024, 0, 7 + f.wdi ).toLocaleDateString( L, { weekday: 'long' } );
		return v;
	};
	/** The lines of one chapter: [ { text, roast, kind } ]. o = { char: 'boogie'|'chip', lang: 'en'|'el', gentle, kind }. */
	B.render = ( id, f, o ) => {
		const ch = CHAPTERS.find( ( c ) => c.id === id ); if ( ! ch ) return [];
		const el = o.lang === 'el' ? 1 : 0, chip = o.char === 'chip', v = vars( f, o.lang ), money = id === 'where' || id === 'rhythm', out = [];
		ch.lines.forEach( ( l, i ) => {
			if ( l.k && ! ( o.kind && money ) ) return;
			if ( l.r && ( o.gentle || ( o.kind && money ) ) ) return;
			if ( l.need.some( ( k ) => v[ k ] == null ) || ( l.when && ! l.when( f ) ) ) return;
			const src = ( chip && l.t[ 2 + el ] ) || l.t[ el ], vs = src.split( '|' ), pick = vs[ hash( ( f.firstDate || '' ) + '|' + id + '|' + i ) % vs.length ];
			out.push( { text: pick.replace( /\{(\w+)\}/g, ( m, k ) => ( v[ k ] != null ? v[ k ] : m ) ), roast: !! l.r, kind: !! l.k } );
		} );
		return out;
	};
	const rich = ( s ) => esc( s ).replace( /\*\*(.+?)\*\*/g, '<b>$1</b>' );

	/* ------------------------------------------------------------------ The record: which chapters are written, when */
	const rec = () => { const s = S().settings; if ( ! s.efBlog || ! Array.isArray( s.efBlog.c ) ) s.efBlog = { c: [], gentle: 0 }; return s.efBlog; };
	const entries = () => S().txs.filter( ( x ) => x.type === 'income' || x.type === 'expense' );
	/** Write any chapter the data now allows. Facts are taken as of today; the stamp is kept so the text is later rebuilt as of that day. */
	B.update = () => {
		const td = EX.today(), r = rec(), f = B.facts( S().txs, td ); let added = false;
		if ( f.n ) CHAPTERS.forEach( ( c ) => { if ( ! r.c.some( ( x ) => x.id === c.id ) && c.ready( f ) ) { r.c.push( { id: c.id, wrote: td } ); added = true; } } );
		if ( added ) { S().settings.u = Date.now(); EX.persist(); }
		return added;
	};
	B.status = () => {
		const td = EX.today(), f = B.facts( S().txs, td ), r = rec(), written = CHAPTERS.filter( ( c ) => r.c.some( ( x ) => x.id === c.id ) );
		const seen = S().device.efbSeen || [], day = f.n ? f.day : 0, locked = ! f.n || ( day < LOCK_DAYS && ! B.finished( f ) );
		return { f, day, locked, none: ! f.n, finished: B.finished( f ), written: written.map( ( c ) => c.id ), pct: Math.round( written.length / CHAPTERS.length * 100 ), unread: locked ? [] : written.filter( ( c ) => ! seen.includes( c.id ) ).map( ( c ) => c.id ) };
	};
	B.gentle = () => !! rec().gentle;
	const lang = () => ( EX.lang ? EX.lang() : 'en' );
	const chipOn = () => EX.efriend.char() === 'chip';
	const T = ( key, vs ) => ( chipOn() && String( t( key + '_c' ) ) !== key + '_c' ? t( key + '_c', vs ) : t( key, vs ) );
	const chapterHtml = ( c, st ) => {
		const r = rec(), w = r.c.find( ( x ) => x.id === c.id ), f = B.facts( S().txs, w.wrote );
		const lines = B.render( c.id, f, { char: chipOn() ? 'chip' : 'boogie', lang: lang(), gentle: r.gentle, kind: B.kindNow() } );
		const seen = S().device.efbSeen || [], hint = c.id === 'first' && ! r.gentle && seen.filter( ( x ) => x !== 'first' ).length === 0 ? `<p class="efb-l efb-hint">${ esc( t( 'efbSpicy' ) ) }</p>` : '';
		return `<h3 class="efb-h">${ esc( c.title[ lang() === 'el' ? 1 : 0 ] ) }</h3><p class="efb-stamp">${ esc( t( 'efbWritten', { d: EX.parse( w.wrote ).toLocaleDateString( EX.loc(), { day: 'numeric', month: 'long', year: 'numeric' } ) } ) ) }</p>${ lines.map( ( l ) => `<p class="efb-l${ l.roast ? ' efb-roast' : '' }">${ rich( l.text ) }</p>` ).join( '' ) }${ hint }`;
	};

	/* ------------------------------------------------------------------ Screens */
	const bar = ( p ) => `<div class="efb-bar" role="img" aria-label="${ p }%"><i style="width:${ p }%"></i></div>`;
	const idx = ( id ) => CHAPTERS.findIndex( ( c ) => c.id === id ) + 1;
	const num2 = ( n ) => String( n ).padStart( 2, '0' );
	const blogTitle = () => t( chipOn() ? 'efbTitle_chip' : 'efbTitle_boogie' );
	const frame = ( inner, st, cur, status ) => {
		if ( chipOn() ) return `<section class="efb efb-chip" data-efb="chip"><div class="efb-win"><div class="efb-titlebar"><span class="efb-dots"><i></i><i></i><i></i></span><b>${ esc( blogTitle() ) }</b></div><div class="efb-top"><span class="efb-cd" aria-hidden="true"></span><div><b class="efb-bt">${ esc( blogTitle() ) }</b>${ bar( st.pct ) }</div></div>${ inner }<div class="efb-status">${ esc( status ) }<span class="efb-cur" aria-hidden="true">▌</span></div></div></section>`;
		return `<section class="efb efb-boogie" data-efb="boogie"><div class="efb-deck"><div class="efb-top"><span class="efb-reel" aria-hidden="true"></span><span class="efb-nixie" aria-hidden="true">${ cur }</span><span class="efb-reel" aria-hidden="true"></span><span class="efb-rec${ st.unread.length ? ' on' : '' }" aria-hidden="true"></span></div><b class="efb-bt">${ esc( blogTitle() ) }</b><div class="efb-vu" aria-hidden="true"><i></i><i></i></div>${ bar( st.pct ) }</div>${ inner }<p class="efb-status">${ esc( status ) }</p></section>`;
	};
	const gentleSwitch = () => `<label class="efb-gentle"><input type="checkbox" data-efb-gentle${ B.gentle() ? ' checked' : '' }><span><b>${ esc( t( 'efbGentle' ) ) }</b><small>${ esc( t( 'efbGentleHint' ) ) }</small></span></label>`;
	EXA.efBlogPage = () => {
		B.update();
		const st = B.status(), td = EX.today();
		if ( st.none ) return frame( `<p class="efb-note">${ esc( t( 'efbNone' ) ) }</p>`, st, '00', t( 'efbStatusNone' ) );
		if ( st.locked ) return frame( `<p class="efb-note">${ esc( T( 'efbLocked', { n: Math.min( st.day + 1, LOCK_DAYS ), max: LOCK_DAYS } ) ) }</p><p class="efb-note efb-sub">${ esc( t( 'efbLockedSub' ) ) }</p>`, st, num2( Math.min( st.day + 1, LOCK_DAYS ) ), T( 'efbStatusLocked', { n: Math.min( st.day + 1, LOCK_DAYS ), max: LOCK_DAYS } ) );
		const d = S().device, seen = d.efbSeen = d.efbSeen || [], sel = ( EXA.st.efbCh && st.written.includes( EXA.st.efbCh ) ? EXA.st.efbCh : st.written[ st.written.length - 1 ] ) || '';
		if ( sel && ! seen.includes( sel ) ) { seen.push( sel ); EX.persist(); }
		const items = CHAPTERS.map( ( c ) => {
			const on = st.written.includes( c.id ), label = chipOn() ? `chapter_${ num2( idx( c.id ) ) }.txt` : t( 'efbTrack', { n: idx( c.id ) } );
			return on ? `<button type="button" class="efb-trk${ sel === c.id ? ' on' : '' }" data-efb-ch="${ c.id }" aria-pressed="${ sel === c.id }"><b>${ esc( label ) }</b><small>${ esc( c.title[ lang() === 'el' ? 1 : 0 ] ) }</small></button>`
				: `<div class="efb-trk off"><b>${ esc( label ) }</b><small class="efb-red" aria-hidden="true">▓▓▓▓▓ ▓▓▓▓▓▓▓ ▓▓▓</small><small>${ esc( t( 'efbNotYet', { u: c.unlock[ lang() === 'el' ? 1 : 0 ] } ) ) }</small></div>`;
		} ).join( '' );
		const c = CHAPTERS.find( ( x ) => x.id === sel );
		const reader = c ? `<article class="efb-paper" data-efb-read="${ sel }">${ chapterHtml( c, st ) }</article>` : `<p class="efb-note">${ esc( t( 'efbNoneYet' ) ) }</p>`;
		const tail = st.finished ? t( 'efbFinished' ) : ( st.written.length === CHAPTERS.length ? t( 'efbMoreSoon' ) : t( 'efbProgress', { p: st.pct } ) );
		const status = chipOn() ? t( 'efbBurned', { w: st.written.length, m: CHAPTERS.length, p: st.pct } ) : tail;
		return gentleSwitch() + frame( `<nav class="efb-tracks" aria-label="${ esc( blogTitle() ) }">${ items }</nav>${ reader }`, st, num2( sel ? idx( sel ) : 0 ), status ) + ( chipOn() ? `<p class="efb-foot">${ esc( tail ) }</p>` : '' );
	};
	/** Home: one card with the progress and a hook. */
	EXA.efBlogCard = () => {
		if ( EX.feature( 'efblog' ) === false || ! entries().length ) return '';
		B.update(); const st = B.status();
		const line = st.locked ? T( 'efbLocked', { n: Math.min( st.day + 1, LOCK_DAYS ), max: LOCK_DAYS } ) : st.unread.length ? T( 'efbNewChapter' ) : t( 'efbProgress', { p: st.pct } );
		return `<button type="button" class="card efb-card" data-more="efblog"><span class="efb-card-art">${ EX.efriend.mascot( 'happy', 52 ) }</span><span class="mid"><b>${ esc( blogTitle() ) }</b><small>${ esc( line ) }</small>${ st.locked ? '' : bar( st.pct ) }</span>${ UI.icon( 'chevron-right', 20 ) }</button>`;
	};
	/** A dot on the eFriend row in More while a new chapter is waiting. */
	EXA.efBlogDot = () => ( EX.feature( 'efblog' ) !== false && ( B.update(), B.status().unread.length ) ? `<i class="efb-dot" aria-label="${ esc( t( 'efbNewChapter' ) ) }"></i>` : '' );
	/** More: the menu row, with a badge when a new chapter is waiting. */
	EXA.efBlogRow = () => {
		if ( EX.feature( 'efblog' ) === false ) return '';
		B.update(); const n = B.status().unread.length;
		return `<button type="button" class="mrow" data-more="efblog">${ UI.ci( 'notes', 'purple', 40 ) }<span class="mid"><b>${ esc( t( 'efbMenu' ) ) }</b><small>${ esc( t( 'efbMoreSub' ) ) }</small></span>${ n ? `<i class="efb-badge" aria-label="${ esc( t( 'efbNewChapter' ) ) }">${ n }</i>` : '' }${ UI.icon( 'chevron-right', 18 ) }</button>`;
	};
	document.addEventListener( 'click', ( e ) => {
		const b = e.target.closest && e.target.closest( '[data-efb-ch]' ); if ( ! b ) return;
		EXA.st.efbCh = b.dataset.efbCh; EXA.render();
	} );
	document.addEventListener( 'change', ( e ) => {
		if ( ! ( e.target.matches && e.target.matches( '[data-efb-gentle]' ) ) ) return;
		rec().gentle = e.target.checked ? 1 : 0; S().settings.u = Date.now(); EX.save();
	} );
	EX.on( 'change', () => { B.update(); } );

	/* ------------------------------------------------------------------ Strings (new, unreviewed) */
	Object.assign( EX.I18N.langs.en, {
		efbMenu: 'eFriend Blog', efbMoreSub: 'Your story, written by eFriend', efbTitle_boogie: 'The Boogie Tapes', efbTitle_chip: 'Chip’s Chronicles',
		efbLocked: 'eFriend has started taking notes... day {n} of {max}', efbLocked_c: 'chip is taking notes... day {n} of {max} 📝',
		efbLockedSub: 'On day 10 you can peek at the first chapters. Keep adding your entries.', efbStatusLocked: 'Recording... day {n} of {max}', efbStatusLocked_c: 'Warming up... day {n} of {max}',
		efbNone: 'Add your first entry and eFriend starts taking notes.', efbStatusNone: 'Waiting for the first entry', efbNoneYet: 'No chapter is written yet. eFriend is still listening.',
		efbNewChapter: '📼 A new chapter is ready!', efbNewChapter_c: '💿 a new chapter is ready!',
		efbProgress: 'eFriend has written {p}% of your story', efbMoreSoon: 'More chapters will come as your story grows.', efbFinished: 'The first season is complete. More chapters are on their way.',
		efbWritten: 'Written on {d}', efbNotYet: 'Not written yet. Unlocks at {u}.', efbTrack: 'Track {n}', efbBurned: 'Burned {w} of {m} chapters · {p}%',
		fx_efblog: 'eFriend Blog', fxD_efblog: 'A blog eFriend writes about your own entries, chapter by chapter, with jokes. Everything stays on your device.', tut_efblog: 'The eFriend Blog', tutD_efblog: 'Your story, written by eFriend',
		tut_efblog_1: 'Keep adding your entries. After **10 days** eFriend lets you peek at the first chapters.', tut_efblog_2: 'Open **More → eFriend Blog**, or tap the blog card on Home, and pick a chapter.', tut_efblog_3: 'Too spicy? Turn on **Gentle mode** at the top. The facts stay, the teasing goes.',
		efbGentle: 'Gentle mode', efbGentleHint: 'The same story, without the teasing.', efbSpicy: 'Too spicy? Turn on gentle mode. 🌶️',
	} );
	Object.assign( EX.I18N.langs.el, {
		efbMenu: 'eFriend Blog', efbMoreSub: 'Η ιστορία σας, όπως τη γράφει το eFriend', efbTitle_boogie: 'Οι Κασέτες του Boogie', efbTitle_chip: 'Τα Χρονικά του Chip',
		efbLocked: 'Το eFriend άρχισε να κρατά σημειώσεις... ημέρα {n} από {max}', efbLocked_c: 'το chip κρατά σημειώσεις... ημέρα {n} από {max} 📝',
		efbLockedSub: 'Την ημέρα 10 μπορείτε να ρίξετε μια ματιά στα πρώτα κεφάλαια. Συνεχίστε να προσθέτετε τις εγγραφές σας.', efbStatusLocked: 'Ηχογράφηση... ημέρα {n} από {max}', efbStatusLocked_c: 'Ζέσταμα... ημέρα {n} από {max}',
		efbNone: 'Προσθέστε την πρώτη σας εγγραφή και το eFriend θα αρχίσει να κρατά σημειώσεις.', efbStatusNone: 'Αναμονή για την πρώτη εγγραφή', efbNoneYet: 'Κανένα κεφάλαιο δεν έχει γραφτεί ακόμα. Το eFriend ακούει ακόμα.',
		efbNewChapter: '📼 Ένα νέο κεφάλαιο είναι έτοιμο!', efbNewChapter_c: '💿 Ένα νέο κεφάλαιο είναι έτοιμο!',
		efbProgress: 'Το eFriend έχει γράψει το {p}% της ιστορίας σας', efbMoreSoon: 'Θα έρθουν κι άλλα κεφάλαια όσο μεγαλώνει η ιστορία σας.', efbFinished: 'Η πρώτη σεζόν ολοκληρώθηκε. Έρχονται κι άλλα κεφάλαια.',
		efbWritten: 'Γράφτηκε στις {d}', efbNotYet: 'Δεν έχει γραφτεί ακόμα. Ξεκλειδώνει με {u}.', efbTrack: 'Κομμάτι {n}', efbBurned: 'Γράφτηκαν {w} από {m} κεφάλαια · {p}%',
		fx_efblog: 'eFriend Blog', fxD_efblog: 'Ένα ιστολόγιο που γράφει το eFriend για τις δικές σας εγγραφές, κεφάλαιο προς κεφάλαιο, με χιούμορ. Όλα μένουν στη συσκευή σας.', tut_efblog: 'Το eFriend Blog', tutD_efblog: 'Η ιστορία σας, γραμμένη από το eFriend',
		tut_efblog_1: 'Συνεχίστε να προσθέτετε τις εγγραφές σας. Μετά από **10 ημέρες** το eFriend σάς αφήνει να ρίξετε μια ματιά στα πρώτα κεφάλαια.', tut_efblog_2: 'Ανοίξτε **Περισσότερα → eFriend Blog**, ή πατήστε την κάρτα του blog στην Αρχική, και διαλέξτε ένα κεφάλαιο.', tut_efblog_3: 'Πολύ πικάντικο; Ενεργοποιήστε την **Ήπια λειτουργία** στην κορυφή. Τα στοιχεία μένουν, τα πειράγματα φεύγουν.',
		efbGentle: 'Ήπια λειτουργία', efbGentleHint: 'Η ίδια ιστορία, χωρίς πειράγματα.', efbSpicy: 'Πολύ πικάντικο; Ενεργοποιήστε την ήπια λειτουργία. 🌶️',
	} );
}() );
