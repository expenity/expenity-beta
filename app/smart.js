/**
 * Smart detection (Advanced, can be switched off on the Features page).
 * From the description of an entry it suggests the type, the category, a couple of tags and the wallet.
 * Everything runs on the device. It looks at the person's own earlier entries first, then at built-in words in English and Greek.
 * Tags are never invented from free text: they come from a small generic list (or the person's own tags), and an existing tag
 * that means the same thing is reused so "Grocery" and "Groceries" do not both appear.
 */
( function () {
	'use strict';
	const EX = window.EX, EXA = window.EXA, S = EX.state, fold = EX.fold;

	// Category key -> words (written without accents; matching is done on folded text). Greek stems are on purpose short.
	const WORDS = {
		food: [ 'grocer', 'supermarket', 'super market', 'minimarket', 'bakery', 'butcher', 'greengrocer', 'σουπερ', 'μαρκετ', 'μανα', 'αρτοπωλ', 'φουρν', 'κρεοπωλ', 'ψαραδ', 'οπωροπωλ', 'λαχανικ' ],
		coffee: [ 'coffee', 'cafe', 'espresso', 'latte', 'cappuccino', 'snack', 'καφε', 'φραπε', 'σνακ' ],
		dining: [ 'restaurant', 'dinner', 'lunch', 'brunch', 'tavern', 'pizza', 'burger', 'souvlaki', 'sushi', 'εστιατορ', 'ταβερν', 'γευμα', 'δειπν', 'πιτσα', 'μπεργκερ', 'σουβλακ', 'ψητοπωλ' ],
		delivery: [ 'delivery', 'takeaway', 'take away', 'διανομ', 'ντελιβερι' ],
		fuel: [ 'fuel', 'petrol', 'gasoline', 'diesel', 'βενζιν', 'καυσιμ', 'πετρελαι', 'γεμισμα' ],
		parking: [ 'parking', 'παρκινγκ', 'σταθμευσ' ],
		tolls: [ 'toll', 'διοδι' ],
		publicTransport: [ 'metro', 'tram', 'train', 'ticket', 'bus fare', 'λεωφορει', 'μετρο', 'τρενο', 'εισιτηρι', 'τραμ' ],
		transport: [ 'taxi', 'cab ', 'ride', 'ταξι' ],
		vehicleMaintenance: [ 'mechanic', 'garage', 'tyre', 'tire', 'car service', 'συνεργει', 'λαστιχ', 'σερβις' ],
		pharmacy: [ 'pharmacy', 'chemist', 'φαρμακ' ],
		dental: [ 'dentist', 'dental', 'οδοντ' ],
		vision: [ 'optician', 'glasses', 'οπτικ', 'γυαλι' ],
		health: [ 'doctor', 'hospital', 'clinic', 'physio', 'medical', 'γιατρ', 'νοσοκομ', 'κλινικ', 'εξετασ', 'ιατρ', 'φυσικοθεραπ' ],
		childcare: [ 'nursery', 'kindergarten', 'babysit', 'daycare', 'βρεφονηπιακ', 'παιδικος σταθμ', 'νταντα' ],
		pets: [ 'vet', 'pet food', 'κτηνιατρ', 'κατοικιδι' ],
		personalCare: [ 'haircut', 'barber', 'salon', 'beauty', 'κομμωτ', 'κουρεμα', 'περιποιηση' ],
		clothing: [ 'clothes', 'clothing', 'shoes', 'jacket', 'jeans', 'dress', 'ρουχα', 'παπουτσι', 'μπλουζα', 'φορεμα' ],
		electronics: [ 'laptop', 'tablet', 'charger', 'headphone', 'electronic', 'κινητο', 'υπολογιστ', 'φορτιστ', 'ακουστικ' ],
		homeMaintenance: [ 'plumber', 'repair', 'electrician', 'υδραυλικ', 'επισκευ', 'ηλεκτρολογ' ],
		furniture: [ 'furniture', 'sofa', 'mattress', 'appliance', 'επιπλο', 'στρωμα', 'συσκευη' ],
		cleaning: [ 'cleaning', 'cleaner', 'detergent', 'καθαριστ', 'καθαρισμ', 'απορρυπαντ' ],
		accommodation: [ 'hotel', 'hostel', 'apartment stay', 'ξενοδοχ', 'διαμονη' ],
		travel: [ 'flight', 'airline', 'airport', 'trip', 'holiday', 'vacation', 'αεροπορικ', 'ταξιδι', 'διακοπ', 'αεροδρομ' ],
		presents: [ 'gift', 'present', 'δωρο' ],
		charity: [ 'donation', 'charity', 'δωρεα' ],
		sports: [ 'gym', 'fitness', 'yoga', 'pilates', 'swim', 'γυμναστ', 'κολυμβ' ],
		hobbies: [ 'hobby', 'hobbies', 'χομπι' ],
		bankingFees: [ 'bank fee', 'commission', 'atm fee', 'προμηθει' ],
		subscriptions: [ 'subscription', 'subscribe', 'streaming', 'membership', 'συνδρομ' ],
		software: [ 'software', 'app store', 'license', 'licence' ],
		utilities: [ 'electricity', 'power bill', 'water bill', 'internet', 'wifi', 'wi-fi', 'broadband', 'mobile plan', 'phone bill', 'heating', 'ρευμα', 'δεη', 'νερο', 'ευδαπ', 'ιντερνετ', 'τηλεφων', 'θερμανσ', 'φυσικο αεριο' ],
		housing: [ 'rent', 'mortgage', 'landlord', 'ενοικι', 'στεγαστικ' ],
		commonCharges: [ 'building charges', 'κοινοχρηστ' ],
		insurance: [ 'insurance', 'ασφαλ' ],
		loans: [ 'loan', 'instalment', 'installment', 'δανει', 'δοση' ],
		education: [ 'tuition', 'school', 'university', 'course', 'textbook', 'σχολ', 'φροντιστηρ', 'πανεπιστημ', 'μαθημα', 'σεμιναρ' ],
		tutoring: [ 'private lesson', 'tutor', 'ιδιαιτερ' ],
		taxes: [ 'tax', 'enfia', 'ενφια', 'φορος', 'τελη' ],
		shopping: [ 'shopping', 'mall', 'store', 'αγορες', 'εμπορικ' ],
		leisure: [ 'cinema', 'movie', 'concert', 'theatre', 'theater', 'drinks', 'nightclub', 'bar ', 'κινηματογρ', 'συναυλι', 'θεατρ', 'ποτο', 'μπαρ', 'παιχνιδι' ],
		// income
		salary: [ 'salary', 'wage', 'payroll', 'paycheck', 'μισθ' ],
		freelance: [ 'freelance', 'invoice', 'client payment', 'τιμολογι', 'πελατ' ],
		interest: [ 'interest', 'dividend', 'τοκοι', 'μερισμα' ],
		rentalIncome: [ 'rent received', 'rental income', 'tenant', 'ενοικιαστ' ],
		pension: [ 'pension', 'συνταξ' ],
		benefits: [ 'benefit', 'allowance', 'επιδομα' ],
		refunds: [ 'refund', 'cashback', 'επιστροφη' ],
		sales: [ 'sold', 'sale of', 'πωληση', 'πουλησα' ],
	};
	const INCOME_WORDS = [ 'salary', 'wage', 'payroll', 'paycheck', 'bonus', 'refund', 'cashback', 'dividend', 'interest received', 'pension', 'allowance', 'benefit', 'rent received', 'rental income', 'sold', 'μισθ', 'επιστροφη', 'επιδομα', 'συνταξ', 'μερισμα', 'τοκοι', 'πωληση', 'πουλησα', 'μπονους' ];

	// Generic tags: a small shared vocabulary, so the same kind of thing always gets the same tag. [english, greek, aliases that count as the same tag]
	const TAGS = {
		coffee: [ 'Coffee', 'Καφές', [ 'coffee', 'cafe', 'καφε', 'καφες' ] ],
		groceries: [ 'Groceries', 'Σούπερ μάρκετ', [ 'grocery', 'groceries', 'supermarket', 'σουπερ μαρκετ', 'μαρκετ', 'ψωνια' ] ],
		eatingOut: [ 'Eating out', 'Έξοδος για φαγητό', [ 'eating out', 'restaurant', 'restaurants', 'dining', 'εστιατοριο', 'εστιατορια', 'εξοδος' ] ],
		delivery: [ 'Delivery', 'Διανομή', [ 'delivery', 'takeaway', 'διανομη' ] ],
		car: [ 'Car', 'Αυτοκίνητο', [ 'car', 'vehicle', 'auto', 'αυτοκινητο', 'οχημα' ] ],
		transport: [ 'Transport', 'Μετακινήσεις', [ 'transport', 'commute', 'travel costs', 'μετακινησεις', 'μεταφορα' ] ],
		health: [ 'Health', 'Υγεία', [ 'health', 'medical', 'υγεια', 'ιατρικα' ] ],
		home: [ 'Home', 'Σπίτι', [ 'home', 'house', 'σπιτι' ] ],
		bills: [ 'Bills', 'Λογαριασμοί', [ 'bills', 'bill', 'utilities', 'λογαριασμοι' ] ],
		subscription: [ 'Subscription', 'Συνδρομή', [ 'subscription', 'subscriptions', 'συνδρομη', 'συνδρομες' ] ],
		shopping: [ 'Shopping', 'Αγορές', [ 'shopping', 'αγορες' ] ],
		leisure: [ 'Leisure', 'Ψυχαγωγία', [ 'leisure', 'fun', 'entertainment', 'ψυχαγωγια' ] ],
		travel: [ 'Travel', 'Ταξίδια', [ 'travel', 'trip', 'holiday', 'ταξιδι', 'ταξιδια', 'διακοπες' ] ],
		family: [ 'Family', 'Οικογένεια', [ 'family', 'kids', 'children', 'οικογενεια', 'παιδια' ] ],
		pets: [ 'Pets', 'Κατοικίδια', [ 'pets', 'pet', 'κατοικιδια' ] ],
		gifts: [ 'Gifts', 'Δώρα', [ 'gifts', 'gift', 'presents', 'δωρα', 'δωρο' ] ],
		work: [ 'Work', 'Εργασία', [ 'work', 'business', 'εργασια', 'δουλεια' ] ],
		fitness: [ 'Fitness', 'Γυμναστική', [ 'fitness', 'sport', 'gym', 'γυμναστικη', 'αθλητισμος' ] ],
		education: [ 'Education', 'Εκπαίδευση', [ 'education', 'school', 'learning', 'εκπαιδευση', 'σχολειο' ] ],
	};
	// Which generic tags go with which category.
	const CAT_TAGS = {
		coffee: [ 'coffee' ], food: [ 'groceries' ], dining: [ 'eatingOut' ], delivery: [ 'delivery', 'eatingOut' ],
		fuel: [ 'car' ], parking: [ 'car' ], tolls: [ 'car' ], vehicleMaintenance: [ 'car' ], transport: [ 'transport' ], publicTransport: [ 'transport' ],
		health: [ 'health' ], pharmacy: [ 'health' ], dental: [ 'health' ], vision: [ 'health' ],
		utilities: [ 'bills', 'home' ], housing: [ 'home' ], commonCharges: [ 'home', 'bills' ], homeMaintenance: [ 'home' ], furniture: [ 'home' ], cleaning: [ 'home' ],
		subscriptions: [ 'subscription' ], software: [ 'subscription' ], cloudStorage: [ 'subscription' ],
		shopping: [ 'shopping' ], clothing: [ 'shopping' ], electronics: [ 'shopping' ],
		leisure: [ 'leisure' ], hobbies: [ 'leisure' ], travel: [ 'travel' ], accommodation: [ 'travel' ],
		childcare: [ 'family' ], pets: [ 'pets' ], presents: [ 'gifts' ], gifts: [ 'gifts' ], sports: [ 'fitness' ], personalCare: [ 'health' ],
		education: [ 'education' ], tutoring: [ 'education' ],
	};

	const lang = () => ( EX.lang && EX.lang() === 'el' ? 1 : 0 );
	const stem = ( s ) => fold( String( s || '' ) ).replace( /[^a-z0-9α-ω ]/g, '' ).replace( /\s+/g, ' ' ).trim().replace( /(ies)$/, 'y' ).replace( /(es|s|σ)$/, '' );
	const tokens = ( s ) => fold( String( s || '' ) ).replace( /[0-9.,€$£]+/g, ' ' ).split( /[^a-zα-ω]+/ ).filter( ( w ) => w.length >= 3 );

	const knownTags = () => {
		const all = new Set( ( S().settings.tags || [] ) );
		[ 'txs', 'bills', 'incomes', 'budgets', 'goals' ].forEach( ( k ) => ( S()[ k ] || [] ).forEach( ( x ) => ( x.tags || [] ).forEach( ( g ) => all.add( g ) ) ) );
		return [ ...all ];
	};
	// The tag to use for a generic key: one the person already has that means the same thing, otherwise the generic name in their language.
	const tagFor = ( key, existing ) => {
		const [ en, el, aliases ] = TAGS[ key ], names = [ stem( en ), stem( el ), ...aliases.map( stem ) ];
		const hit = existing.find( ( g ) => names.includes( stem( g ) ) );
		return hit || ( lang() ? el : en );
	};

	const allowedCategories = ( type ) => new Set( EX.catList( type === 'income' ? 'income' : 'expense' ).map( ( c ) => c.key ) );

	// The person's own earlier entries that look like this description.
	const history = ( text, type ) => {
		const a = new Set( tokens( text ) ); if ( ! a.size ) return [];
		const pool = type === 'income' ? ( S().incomes || [] ).concat( S().txs.filter( ( x ) => x.type === 'income' ) ) : ( S().txs.filter( ( x ) => x.type === 'expense' ) ).concat( S().bills || [] );
		const now = Date.now(), out = [];
		for ( const x of pool ) {
			if ( ! x.name ) continue; const b = new Set( tokens( x.name ) ); if ( ! b.size ) continue;
			const common = [ ...a ].filter( ( w ) => b.has( w ) || [ ...b ].some( ( v ) => v.length >= 4 && w.length >= 4 && ( v.startsWith( w ) || w.startsWith( v ) ) ) ).length;
			const score = common / new Set( [ ...a, ...b ] ).size;
			const same = fold( x.name ).trim() === fold( text ).trim() || ( common === a.size && a.size >= 1 );
			if ( same || score >= 0.5 ) { const age = Math.max( 0, ( now - ( Date.parse( x.date || x.next || '' ) || now ) ) / 864e5 ); out.push( { x, w: ( same ? 2 : 1 ) / ( 1 + age / 120 ) } ); }
		}
		return out.sort( ( p, q ) => q.w - p.w ).slice( 0, 8 );
	};
	const top = ( items, pick ) => { const m = new Map(); items.forEach( ( { x, w } ) => { const k = pick( x ); if ( k ) m.set( k, ( m.get( k ) || 0 ) + w ); } ); return [ ...m ].sort( ( p, q ) => q[ 1 ] - p[ 1 ] ).map( ( p ) => p[ 0 ] ); };

	EXA.smart = {
		enabled: () => EX.feature ? EX.feature( 'smartFill' ) !== false : true,
		/** Suggestions for a description: { type, category, tags, account } (any of them can be missing). */
		detect( text, opts = {} ) {
			const low = ' ' + fold( text || '' ).trim() + ' ', out = { tags: [] };
			if ( low.trim().length < 3 ) return out;
			const incomeLike = INCOME_WORDS.some( ( w ) => low.includes( w ) );
			const type = opts.type === 'income' || ( opts.type === 'expense' && incomeLike && ! opts.keepType ) ? ( incomeLike ? 'income' : opts.type ) : opts.type || 'expense';
			if ( opts.type === 'expense' && incomeLike && ! opts.keepType ) out.type = 'income';
			const effective = out.type || type, allowed = allowedCategories( effective ), existing = knownTags();
			const hist = history( text, effective );
			let category = top( hist, ( x ) => x.category ).find( ( c ) => allowed.has( c ) );
			let tags = hist.length ? top( hist.flatMap( ( h ) => ( h.x.tags || [] ).map( ( g ) => ( { x: { g }, w: h.w } ) ) ), ( x ) => x.g ).slice( 0, 2 ) : [];
			if ( ! category ) {
				// built-in words, then the person's own category names
				const hit = Object.entries( WORDS ).find( ( [ k, ws ] ) => allowed.has( k ) && ws.some( ( w ) => low.includes( w.length < 4 ? ' ' + w : w ) ) );
				category = hit ? hit[ 0 ] : null;
				if ( ! category ) {
					const own = EX.catList( effective === 'income' ? 'income' : 'expense' ).find( ( c ) => c.custom && tokens( c.name ).some( ( w ) => w.length >= 4 && low.includes( w ) ) );
					category = own ? own.key : ( EXA.guessCategory ? EXA.guessCategory( text, effective ) : null );
				}
			}
			if ( category ) out.category = category;
			if ( ! tags.length && category && CAT_TAGS[ category ] ) tags = CAT_TAGS[ category ].slice( 0, 2 ).map( ( k ) => tagFor( k, existing ) );
			out.tags = [ ...new Set( tags ) ].slice( 0, 2 );
			// the wallet: the only one, else the one used for similar entries, else one named in the text
			const wallets = EX.writableAccounts();
			if ( wallets.length === 1 ) out.account = wallets[ 0 ].id;
			else {
				const used = top( hist, ( x ) => x.account ).find( ( id ) => wallets.some( ( w ) => w.id === id ) );
				const named = wallets.find( ( w ) => { const n = fold( EX.accountName ? EX.accountName( w ) : w.name || '' ).trim(); return n.length >= 3 && low.includes( n ); } );
				out.account = used || ( named && named.id ) || undefined;
			}
			return out;
		},
	};

	// Name and short description for the Features page.
	Object.assign( EX.I18N.langs.en, { fx_smartFill: 'Smart detection', fxD_smartFill: 'Fills in the category, tags and wallet from what you type.', smartFilled: ( { list } ) => 'Filled in for you: ' + list, smartUndo: 'Undo' } );
	Object.assign( EX.I18N.langs.el, { fx_smartFill: 'Έξυπνη ανίχνευση', fxD_smartFill: 'Συμπληρώνει κατηγορία, ετικέτες και πορτοφόλι από όσα γράφετε.', smartFilled: ( { list } ) => 'Συμπληρώθηκαν για εσάς: ' + list, smartUndo: 'Αναίρεση' } );
}() );
