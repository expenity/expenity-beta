/**
 * First-run setup as a chat with eFriend. It replaces the classic setup wizard (flow.js) while USE_CHAT is true; set it to
 * false and the old wizard comes back untouched.
 *   1. A welcome page: the logo, a few words about Expenity, both eFriends as little bots, and a big language switch (its answer is the language of everything after it).
 *   2. Pick your eFriend on a split screen (Boogie on the left, Chip on the right, a slider in between).
 *   3. Seven questions: name, currency, income, bills, a goal, cushion, how to add expenses.
 *   4. A summary of what was set up, with a pencil to change an answer and a cross to remove the estimated budgets.
 * Nothing is saved without being said back, every question can be skipped, and the keyboard never opens by itself on a phone.
 */
( function () {
	'use strict';
	const EX = window.EX, UI = window.UI, EXA = window.EXA;
	const { t, esc } = EX;
	const S = EX.state, D = () => S().device;
	const F = () => EX.efriend;
	const USE_CHAT = true; // false: the classic setup wizard in flow.js is used again
	const ob = ( EXA.onboard = { enabled: () => USE_CHAT && ! window.EXA_CLASSIC_SETUP } );

	/* ------------------------------------------------------------------ Words: [EN Boogie, EL Boogie, EN Chip, EL Chip]; a missing Chip text means "same as Boogie". "|" separates variants. */
	const TX = {
		pickTitle: [ 'Choose your eFriend', 'Διαλέξτε το eFriend σας' ],
		pickHint: [ 'Slide to meet them', 'Σύρετε για να τους γνωρίσετε' ],
		pickChoose: [ 'Choose', 'Επιλογή' ],
		pickBoogie: [ 'A vintage cassette with a glowing Nixie tube. Warm, a little dry, fond of a good plan and a better pencil.', 'Μια vintage κασέτα με λαμπερή λυχνία Nixie. Ζεστός, λίγο ξερός, αγαπά ένα καλό σχέδιο και ένα ακόμα καλύτερο μολύβι.' ],
		pickChip: [ 'Young, fast and wireless. Hyped, playful, full of emoji and bad battery jokes.', 'Νέος, γρήγορος και ασύρματος. Ενθουσιώδης, παιχνιδιάρης, γεμάτος emoji και κακά ανέκδοτα με μπαταρίες.' ],
		introTitle: [ 'Welcome to Expenity', 'Καλώς ήρθατε στο Expenity' ], introSub: [ 'Your money, calm and clear.', 'Τα χρήματά σας, ήρεμα και καθαρά.' ],
		introL1: [ '🧾 Bills, income and spending in one place', '🧾 Λογαριασμοί, εισοδήματα και έξοδα σε ένα μέρος' ], introL2: [ '🔔 Never miss a payment', '🔔 Ποτέ πια χαμένη πληρωμή' ], introL3: [ '🤖 eFriend checks if you can afford it, and finds the best day', '🤖 Το eFriend ελέγχει αν το αντέχετε και βρίσκει την καλύτερη μέρα' ],
		introQ: [ 'Can I afford a €49 gift?', 'Μπορώ να αγοράσω ένα δώρο €49;' ], introA: [ 'Yes! Best day: Friday ✅', 'Ναι! Καλύτερη μέρα: Παρασκευή ✅' ], introLang: [ 'Choose your language', 'Επιλέξτε γλώσσα' ], introGo: [ 'Let’s go', 'Πάμε' ], introPoke: [ 'Tap them!', 'Πατήστε τους!' ],
		instPitch: [ 'Final boss level, my friend. 📼\nIf you add me to your home screen I live in your pocket, one tap away, full screen, and I can nudge you before a bill bites. Skip it and I am just one of 47 open tabs, right next to a banana bread recipe. 🍌\nThe next page takes 20 seconds. Your future self sends thanks.', 'Το τελικό επίπεδο, φίλε μου. 📼\nΑν με προσθέσετε στην αρχική οθόνη, ζω στην τσέπη σας, με ένα πάτημα, σε πλήρη οθόνη, και μπορώ να σας ειδοποιώ πριν δαγκώσει ένας λογαριασμός. Αν το παραλείψετε, είμαι απλώς μία από τις 47 ανοιχτές καρτέλες, δίπλα σε μια συνταγή για μπανανόψωμο. 🍌\nΗ επόμενη σελίδα θέλει 20 δευτερόλεπτα. Το μελλοντικό σας εαυτό θα σας ευχαριστήσει.',
			'OKAY this is the SUPER DUPER important part!! 🚨\nAdd me to your home screen and I become a real app: one tap, full screen, instant, and I can remind you before bills hit. Skip it and I am stuck in a browser tab between 37 other tabs and a cat video. 🐱\nThe next page takes 20 seconds. Do it for me?? 🥺', 'ΟΚ αυτό είναι το ΣΟΥΠΕΡ ΔΟΥΠΕΡ σημαντικό μέρος!! 🚨\nΠροσθέστε με στην αρχική οθόνη και γίνομαι κανονική εφαρμογή: ένα πάτημα, πλήρης οθόνη, άμεσα, και μπορώ να σας θυμίζω πριν έρθουν οι λογαριασμοί. Αν το παραλείψετε, θα είμαι κολλημένος σε μια καρτέλα ανάμεσα σε 37 άλλες και ένα βίντεο με γάτες. 🐱\nΗ επόμενη σελίδα θέλει 20 δευτερόλεπτα. Θα το κάνετε για μένα?? 🥺' ],
		accAsk: [ 'One more thing: want to keep your data safe and use it on all your devices? A free account takes a few seconds. 🔐', 'Ένα τελευταίο: θέλετε να κρατήσετε τα δεδομένα σας ασφαλή και να τα χρησιμοποιείτε σε όλες τις συσκευές σας; Ένας δωρεάν λογαριασμός θέλει λίγα δευτερόλεπτα. 🔐',
			'One more thing!! 🔐 Want your data safe and on all your devices? A free account takes seconds!', 'Ένα τελευταίο!! 🔐 Θέλετε τα δεδομένα σας ασφαλή και σε όλες τις συσκευές σας; Ένας δωρεάν λογαριασμός θέλει δευτερόλεπτα!' ],
		accCreate: [ '🔐 Create a free account', '🔐 Δημιουργία δωρεάν λογαριασμού' ], accLater: [ 'Maybe later', 'Ίσως αργότερα' ], accEmail: [ 'What is your email address? It is only used to recover your account.', 'Ποια είναι η διεύθυνση email σας; Χρησιμοποιείται μόνο για την ανάκτηση του λογαριασμού σας.' ], accBad: [ 'That does not look like an email. Try again?', 'Αυτό δεν μοιάζει με email. Δοκιμάστε ξανά;' ],
		skip: [ 'Skip setup', 'Παράλειψη' ], skipQ: [ 'Skip', 'Παράλειψη' ], send: [ 'Send', 'Αποστολή' ], ph: [ 'Type here', 'Γράψτε εδώ' ],
		hello: [ 'Well hello! 📼 I am Boogie, and I will help you set things up. Seven quick questions, and you can skip any of them.', 'Λοιπόν, γεια σας! 📼 Είμαι ο Boogie και θα σας βοηθήσω με τη ρύθμιση. Επτά γρήγορες ερωτήσεις, και μπορείτε να παραλείψετε όποια θέλετε.',
			'Heyyy! 🎉 I am Chip! Seven super quick questions and we are set. Skip any you want!', 'Γεια σας! 🎉 Είμαι ο Chip! Επτά σούπερ γρήγορες ερωτήσεις και είμαστε έτοιμοι. Παραλείψτε όποια θέλετε!' ],
		name: [ 'Lovely. What should I call you? 😊', 'Υπέροχα. Πώς να σας φωνάζω; 😊', 'Cool! What should I call you? 😄', 'Τέλεια! Πώς να σας φωνάζω; 😄' ],
		nameHi: [ '{name}… a good name. 📼', '{name}… ωραίο όνομα. 📼', '{name}!! Love it! 🙌', '{name}!! Το λατρεύω! 🙌' ],
		nameNone: [ 'No name, no problem. A mystery. 🕵️', 'Χωρίς όνομα, κανένα πρόβλημα. Μυστήριο. 🕵️', 'Mystery person! 🕵️ Love it.', 'Άγνωστο πρόσωπο! 🕵️ Μου αρέσει.' ],
		currency: [ 'Which currency do you use for your money? 💶', 'Ποιο νόμισμα χρησιμοποιείτε για τα χρήματά σας; 💶', 'What currency are we using? 💸', 'Ποιο νόμισμα χρησιμοποιούμε; 💸' ],
		curOther: [ 'Other…', 'Άλλο…' ], curType: [ 'Type the 3-letter code, like SEK or PLN.', 'Γράψτε τον κωδικό με 3 γράμματα, π.χ. SEK ή PLN.' ],
		curBad: [ 'I do not know that one. Try a 3-letter code like USD.', 'Δεν το γνωρίζω. Δοκιμάστε κωδικό με 3 γράμματα, π.χ. USD.' ],
		income: [ 'How much money comes in regularly? A salary, a pension, anything steady. Type the amount. 💼', 'Πόσα χρήματα έρχονται τακτικά; Μισθός, σύνταξη, οτιδήποτε σταθερό. Γράψτε το ποσό. 💼',
			'How much money lands in your account regularly? 💰 Type the amount!', 'Πόσα χρήματα έρχονται τακτικά στον λογαριασμό σας; 💰 Γράψτε το ποσό!' ],
		incNone: [ 'No regular income', 'Χωρίς τακτικό εισόδημα' ], numBad: [ 'Hmm, I need a number, like 1500.', 'Χμ, χρειάζομαι έναν αριθμό, π.χ. 1500.' ],
		freq: [ 'How often does it arrive?', 'Κάθε πότε έρχεται;' ], fMonthly: [ 'Monthly', 'Μηνιαίως' ], fBiweekly: [ 'Every 2 weeks', 'Κάθε 2 εβδομάδες' ], fWeekly: [ 'Weekly', 'Εβδομαδιαίως' ],
		incDay: [ 'Which day of the month does it usually arrive?', 'Ποια μέρα του μήνα έρχεται συνήθως;' ], notSure: [ 'Not sure', 'Δεν είμαι σίγουρος' ],
		bills: [ 'Which regular bills do you have? Tap all that apply. 🧾', 'Ποιους τακτικούς λογαριασμούς έχετε; Πατήστε όσους ισχύουν. 🧾', 'What bills do you pay regularly? 🧾 Tap all that apply!', 'Ποιους λογαριασμούς πληρώνετε τακτικά; 🧾 Πατήστε όσους ισχύουν!' ],
		done: [ 'Done', 'Έτοιμο' ], noBills: [ 'None', 'Κανέναν' ],
		billsCard: [ 'Now the amounts and the usual day of the month. Leave an amount empty to skip that bill.', 'Τώρα τα ποσά και η συνήθης μέρα του μήνα. Αφήστε ένα ποσό κενό για να παραλείψετε τον λογαριασμό.' ],
		goal: [ 'Is there something you are saving for? 🎯', 'Αποταμιεύετε για κάτι; 🎯', 'Saving up for something cool? 🎯', 'Αποταμιεύετε για κάτι ωραίο; 🎯' ],
		goalNone: [ 'Not yet', 'Όχι ακόμα' ], goalAmt: [ 'How much would you need for {goal}? Type the amount.', 'Πόσα θα χρειαστείτε για: {goal}; Γράψτε το ποσό.', 'How much for {goal}? 💰 Type the amount!', 'Πόσα για: {goal}; 💰 Γράψτε το ποσό!' ],
		cushion: [ 'How careful should I be when I check a purchase? I keep a safety cushion in your plans. 🛡️', 'Πόσο προσεκτικός να είμαι όταν ελέγχω μια αγορά; Κρατώ ένα μαξιλάρι ασφαλείας στα σχέδιά σας. 🛡️',
			'How careful should I be with your money? 🛡️ I keep a safety cushion!', 'Πόσο προσεκτικός να είμαι με τα χρήματά σας; 🛡️ Κρατώ ένα μαξιλάρι ασφαλείας!' ],
		cCareful: [ '🛡️ Careful', '🛡️ Προσεκτικά' ], cBalanced: [ '⚖️ Balanced', '⚖️ Ισορροπημένα' ], cRelaxed: [ '🎈 Relaxed', '🎈 Χαλαρά' ],
		entry: [ 'Last one! How do you like to add expenses?', 'Η τελευταία! Πώς σας αρέσει να προσθέτετε έξοδα;', 'Last one!! 🏁 How do you want to add expenses?', 'Η τελευταία!! 🏁 Πώς θέλετε να προσθέτετε έξοδα;' ],
		eSmart: [ '✨ Smart: type a sentence', '✨ Έξυπνα: γράφω μια πρόταση' ], eCasual: [ '📝 Casual: fill in a form', '📝 Απλά: συμπληρώνω φόρμα' ],
		working: [ 'Setting everything up… 🔧', 'Τα ρυθμίζω όλα… 🔧', 'Setting it all up… ⚡', 'Τα ρυθμίζω όλα… ⚡' ],
		sumIntro: [ 'All done! Here is what I set up. The pencil changes an answer, the cross removes the estimated budgets.', 'Έτοιμο! Να τι ρύθμισα. Το μολύβι αλλάζει μια απάντηση, το σταυρουδάκι αφαιρεί τους εκτιμώμενους προϋπολογισμούς.',
			'Done!! 🎉 Here is everything I set up. Pencil = change it, cross = remove the estimated budgets.', 'Έτοιμο!! 🎉 Να όλα όσα ρύθμισα. Μολύβι = αλλαγή, σταυρός = αφαίρεση των εκτιμώμενων προϋπολογισμών.' ],
		sLang: [ 'Language', 'Γλώσσα' ], sName: [ 'Name', 'Όνομα' ], sCur: [ 'Currency', 'Νόμισμα' ], sInc: [ 'Income', 'Εισόδημα' ], sBills: [ 'Bills', 'Λογαριασμοί' ], sGoal: [ 'Goal', 'Στόχος' ],
		sCush: [ 'Cushion', 'Μαξιλάρι' ], sEntry: [ 'Adding expenses', 'Προσθήκη εξόδων' ], sBud: [ 'Budgets (estimates)', 'Προϋπολογισμοί (εκτιμήσεις)' ], sNone: [ 'Not set', 'Δεν ορίστηκε' ],
		perMonth: [ '/ month', '/ μήνα' ], open: [ 'Open Expenity', 'Άνοιγμα Expenity' ], edit: [ 'Change', 'Αλλαγή' ], remove: [ 'Remove', 'Αφαίρεση' ],
		sumNote: [ 'Budgets are estimates from your income and bills. You can change them any time.', 'Οι προϋπολογισμοί είναι εκτιμήσεις από το εισόδημα και τους λογαριασμούς σας. Μπορείτε να τους αλλάξετε οποτεδήποτε.' ],
		dayN: [ 'on day {n}', 'στις {n}' ],
	};
	// what falls behind each friend on the picker: short jokes and icons that pile up at the bottom
	const FALL = {
		boogie: { icons: [ '📼', '🎵', '🕺', '✏️', '💡', '📻', '🎧', '💿' ], en: [ 'Rewind is my favourite button', 'Great tracks, no skips', 'Side A or side B?', 'I never lose the plot, just the tape', 'Pencil: the original fix' ], el: [ 'Το rewind είναι το αγαπημένο μου', 'Τέλεια κομμάτια, χωρίς παράλειψη', 'Πλευρά Α ή πλευρά Β;', 'Δεν χάνω την πλοκή, μόνο την ταινία', 'Μολύβι: η αρχική επισκευή' ] },
		chip: { icons: [ '🤖', '📱', '🔋', '📶', '😂', '💬', '⚡', '🎮' ], en: [ 'Battery 100% 🔋', '404: joke not found', 'No cap, I am fast', 'Wi-Fi: 5 bars', 'Emoji fluent 😎' ], el: [ 'Μπαταρία 100% 🔋', '404: το ανέκδοτο χάθηκε', 'Χωρίς ψέματα, είμαι γρήγορος', 'Wi-Fi: 5 γραμμές', 'Μιλάω Emoji 😎' ] },
	};
	const pickFrom = ( s ) => { const l = String( s ).split( '|' ); return l[ Math.floor( Math.random() * l.length ) ]; };
	const L = ( k, vars, lang ) => { const r = TX[ k ] || [ k ], el = ( lang || EX.lang() ) === 'el', chip = F().char() === 'chip'; let s = r[ el ? 1 : 0 ]; if ( chip && r[ el ? 3 : 2 ] ) s = r[ el ? 3 : 2 ]; if ( s == null ) s = r[ 0 ]; s = pickFrom( s ); if ( vars ) s = s.replace( /\{(\w+)\}/g, ( m, x ) => ( vars[ x ] !== undefined ? vars[ x ] : m ) ); return s; };
	ob.words = TX;

	/* ------------------------------------------------------------------ State */
	const A = { lang: '', name: '', cur: '', income: null, bills: [], goal: null, cushion: 'balanced', entry: 'smart' };
	let host = null, tok = 0, created = null, pending = null, summaryOn = false, chosen = false;
	const reduce = () => { try { return matchMedia( '(prefers-reduced-motion: reduce)' ).matches || navigator.webdriver || document.documentElement.dataset.motion === 'off'; } catch ( e ) { return false; } };
	const wait = ( ms ) => new Promise( ( r ) => setTimeout( r, reduce() ? 0 : ms ) );
	const fine = () => { try { return matchMedia( '(pointer: fine)' ).matches; } catch ( e ) { return false; } };
	const natural = () => S().settings.efInstant !== true;

	/* ------------------------------------------------------------------ 1. The welcome page: logo, a few words, both eFriends, and the language switch */
	function intro() {
		summaryOn = false; const el = EX.lang() === 'el';
		host.innerHTML = `<div class="ob-intro"><div class="ob-intro-in">
			<div id="flowLogo" class="ob-logo" aria-hidden="true"></div><h1>${ esc( L( 'introTitle' ) ) }</h1><p class="ob-sub">${ esc( L( 'introSub' ) ) }</p>
			<div class="ob-lang" role="radiogroup" aria-label="${ esc( L( 'introLang' ) ) }" data-lang-now="${ el ? 'el' : 'en' }"><span class="ob-lang-thumb"></span><button type="button" role="radio" aria-checked="${ el }" data-ob-lang="el" lang="el">Ελληνικά</button><button type="button" role="radio" aria-checked="${ ! el }" data-ob-lang="en" lang="en">English</button></div>
			<ul class="ob-points"><li>${ esc( L( 'introL1' ) ) }</li><li>${ esc( L( 'introL2' ) ) }</li><li>${ esc( L( 'introL3' ) ) }</li></ul>
			<div class="ob-demo" aria-hidden="true"><div class="ob-q">${ esc( L( 'introQ' ) ) }</div><div class="ob-ty"><i></i><i></i><i></i></div><div class="ob-a">${ esc( L( 'introA' ) ) }</div></div>
			<div class="ob-bots"><span class="ob-bot">${ F().mascotOf( 'boogie', 'happy', 104 ) }</span><span class="ob-bot">${ F().mascotOf( 'chip', 'happy', 104 ) }</span></div><p class="ob-poke">${ esc( L( 'introPoke' ) ) }</p>
			<button type="button" class="btn btn-primary big ob-go" data-ob-go>${ esc( L( 'introGo' ) ) }</button>
			<div class="ob-have"><span>${ esc( t( 'flowHaveAccount' ) ) }</span><button type="button" class="link" data-flow="signin">${ esc( t( 'authSignIn' ) ) }</button><button type="button" class="link" data-flow="restore">${ esc( t( 'restore' ) ) }</button><button type="button" class="link" data-flow="recover">${ esc( t( 'flowLost' ) ) }</button><input type="file" id="impJson" accept="application/json,.json" hidden></div></div></div>`;
		const fillLogo = () => { const lg = host && host.querySelector( '#flowLogo' ); if ( lg && EXA.logoSvg ) lg.innerHTML = EXA.logoSvg.replace( 'width="34" height="34"', 'width="64" height="64"' ); }; // the logo file may still be loading
		fillLogo(); if ( ! EXA.logoSvg ) { let n = 0; const iv = setInterval( () => { if ( EXA.logoSvg || ++n > 50 ) { clearInterval( iv ); fillLogo(); } }, 100 ); }
	}

	/* ------------------------------------------------------------------ 2. The split-screen picker */
	function picker() {
		summaryOn = false;
		const B = F().mascotOf( 'boogie', 'happy', 300 ), C = F().mascotOf( 'chip', 'happy', 250 );
		host.innerHTML = `<div class="ob-pick" id="obPick">			<section class="ob-half ob-boogie" id="obB" aria-label="Boogie"><div class="ob-fall" aria-hidden="true"></div><h1 class="ob-pick-title">${ esc( L( 'pickTitle' ) ) }</h1><p class="ob-hint">${ esc( L( 'pickHint' ) ) }</p><div class="ob-half-in" id="obBin"><div class="ob-art">${ B }</div><div class="ob-txt"><h2>Boogie</h2><p>${ esc( L( 'pickBoogie' ) ) }</p></div></div></section>
			<section class="ob-half ob-chip" id="obC" aria-label="Chip"><div class="ob-fall" aria-hidden="true"></div><h1 class="ob-pick-title">${ esc( L( 'pickTitle' ) ) }</h1><p class="ob-hint">${ esc( L( 'pickHint' ) ) }</p><div class="ob-half-in" id="obCin"><div class="ob-art">${ C }</div><div class="ob-txt"><h2>Chip</h2><p>${ esc( L( 'pickChip' ) ) }</p></div></div></section>
			<div class="ob-handle" id="obH" role="slider" tabindex="0" aria-label="${ esc( L( 'pickTitle' ) ) }" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"><span class="ob-grip"><i>◀</i><i>▶</i></span></div>
			<button type="button" class="btn btn-primary big ob-choose" id="obChoose" tabindex="-1" aria-hidden="true">${ esc( L( 'pickChoose' ) ) }</button></div>`;
		const root = host.querySelector( '#obPick' ), bP = root.querySelector( '#obB' ), cP = root.querySelector( '#obC' ), bA = root.querySelector( '#obB .ob-art' ), cA = root.querySelector( '#obC .ob-art' ), bTx = root.querySelector( '#obB .ob-txt' ), cTx = root.querySelector( '#obC .ob-txt' ), h = root.querySelector( '#obH' ), btn = root.querySelector( '#obChoose' ), hints = root.querySelectorAll( '.ob-hint' );
		let X = 50, raf = 0;
		const apply = () => {
			// both friends are drawn centred on the whole screen and the slider cuts them in half; the words fade in as their side is uncovered
			root.style.setProperty( '--x', X + '%' );
			bP.style.clipPath = `inset(0 ${ 100 - X }% 0 0)`; cP.style.clipPath = `inset(0 0 0 ${ X }%)`;
			const pb = Math.max( 0, Math.min( 1, ( X - 52 ) / 40 ) ), pc = Math.max( 0, Math.min( 1, ( 48 - X ) / 40 ) );
			bTx.style.opacity = pb; bTx.style.transform = `translateY(${ ( 1 - pb ) * 14 + pb * 46 }px)`; cTx.style.opacity = pc; cTx.style.transform = `translateY(${ ( 1 - pc ) * 14 + pc * 46 }px)`;
			bA.style.transform = `scale(${ ( 1 + .3 * pb - .1 * pc ).toFixed( 3 ) })`; cA.style.transform = `scale(${ ( 1 + .3 * pc - .1 * pb ).toFixed( 3 ) })`; // the one you are choosing grows and comes to the centre
			h.setAttribute( 'aria-valuenow', Math.round( X ) );
			// the Choose button shows well before the screen edge, where a browser swipe could take over
			const edge = X >= 84 ? 'boogie' : X <= 16 ? 'chip' : ''; btn.classList.toggle( 'show', !! edge ); if ( edge ) btn.dataset.pick = edge; btn.setAttribute( 'aria-hidden', edge ? 'false' : 'true' ); btn.tabIndex = edge ? 0 : -1;
			if ( edge ) { btn.textContent = L( 'pickChoose' ); bP.classList.toggle( 'on', edge === 'boogie' ); cP.classList.toggle( 'on', edge === 'chip' ); } else { bP.classList.remove( 'on' ); cP.classList.remove( 'on' ); }
			hints.forEach( ( x ) => { x.style.opacity = Math.abs( X - 50 ) < 6 ? 1 : 0; } );
		};
		const tween = ( to, ms = 260 ) => { cancelAnimationFrame( raf ); if ( reduce() ) { X = to; apply(); return; } const from = X, t0 = performance.now(); const step = ( now ) => { const k = Math.min( 1, ( now - t0 ) / ms ), e = 1 - Math.pow( 1 - k, 3 ); X = from + ( to - from ) * e; apply(); if ( k < 1 ) raf = requestAnimationFrame( step ); }; raf = requestAnimationFrame( step ); };
		const fromEvent = ( e ) => { const r = root.getBoundingClientRect(); X = Math.max( 0, Math.min( 100, ( e.clientX - r.left ) / r.width * 100 ) ); apply(); };
		let drag = false;
		root.addEventListener( 'pointerdown', ( e ) => { if ( e.target.closest( 'button' ) ) return; drag = true; cancelAnimationFrame( raf ); try { root.setPointerCapture( e.pointerId ); } catch ( x ) { /* ignore */ } fromEvent( e ); } );
		root.addEventListener( 'pointermove', ( e ) => { if ( drag ) fromEvent( e ); } );
		const up = () => { if ( ! drag ) return; drag = false; if ( X > 84 ) tween( 100 ); else if ( X < 16 ) tween( 0 ); };
		root.addEventListener( 'pointerup', up ); root.addEventListener( 'pointercancel', up );
		h.addEventListener( 'keydown', ( e ) => { const k = e.key; if ( k === 'ArrowLeft' ) X = Math.max( 0, X - 8 ); else if ( k === 'ArrowRight' ) X = Math.min( 100, X + 8 ); else if ( k === 'Home' ) X = 0; else if ( k === 'End' ) X = 100; else return; e.preventDefault(); apply(); } );
		btn.addEventListener( 'click', () => { const c = btn.dataset.pick; if ( c ) choose( c ); } );
		apply(); window.addEventListener( 'resize', apply );
		falling( bP.querySelector( '.ob-fall' ), 'boogie', root ); falling( cP.querySelector( '.ob-fall' ), 'chip', root );
		if ( ! reduce() ) setTimeout( () => { if ( X === 50 && ! drag ) { tween( 40, 360 ); setTimeout( () => { if ( ! drag && Math.abs( X - 40 ) < 1 ) tween( 60, 560 ); setTimeout( () => { if ( ! drag && Math.abs( X - 60 ) < 1 ) tween( 50, 360 ); }, 640 ); }, 420 ); } }, 900 );
	}
	/** Jokes and icons drift slowly down behind one half, faded, so they set the mood without getting in the way. */
	function falling( layer, who, root ) {
		const cfg = FALL[ who ], el = EX.lang() === 'el', texts = el ? cfg.el : cfg.en,
		 W = () => layer.clientWidth || 360, H = () => layer.clientHeight || 700;
		let n = 0, timer = 0;
		const drift = ( still ) => {
			if ( ! root.isConnected ) { clearTimeout( timer ); return; }
			const text = n % 2 === 0, label = text ? texts[ Math.floor( Math.random() * texts.length ) ] : cfg.icons[ Math.floor( Math.random() * cfg.icons.length ) ]; n++;
			const d = document.createElement( 'span' ); d.className = 'ob-drop' + ( text ? ' ob-drop-t' : '' ); d.textContent = label; layer.appendChild( d );
			const x = Math.random() * Math.max( 0, W() - d.offsetWidth - 8 ) + 4, op = text ? .2 : .26, rot = ( Math.random() - .5 ) * 16;
			d.style.left = x + 'px'; d.style.top = '0px'; d.style.opacity = op;
			if ( still ) { d.style.top = Math.round( 40 + Math.random() * ( H() - 160 ) ) + 'px'; d.style.transform = `rotate(${ rot }deg)`; return; }
			const dur = 16000 + Math.random() * 8000, sway = ( Math.random() - .5 ) * 50, a = d.animate( [ { transform: `translate(0, -50px) rotate(${ rot }deg)`, opacity: 0 }, { opacity: op, offset: .1 }, { opacity: op, offset: .9 }, { transform: `translate(${ sway }px, ${ H() + 30 }px) rotate(${ -rot }deg)`, opacity: 0 } ], { duration: dur, easing: 'linear' } );
			a.onfinish = () => d.remove();
			timer = setTimeout( () => drift( false ), 1500 + Math.random() * 900 );
		};
		if ( reduce() ) { for ( let i = 0; i < 6; i++ ) drift( true ); return; }
		drift( false );
	}
	function choose( c ) { chosen = true; S().settings.efChar = c; S().settings.u = Date.now(); EX.persist(); chat(); }

	/* ------------------------------------------------------------------ 2. The chat */
	const bubble = ( who, html ) => who === 'me' ? `<div class="ef-msg me"><div class="ef-mb">${ html }</div></div>` : `<div class="ef-msg ef"><span class="ef-av">${ F().icon( 30 ) }</span><div class="ef-mb">${ html }</div></div>`;
	const box = () => host && host.querySelector( '#obChat' );
	const end = () => { const b = box(); if ( b ) b.scrollTo( { top: b.scrollHeight, behavior: reduce() ? 'auto' : 'smooth' } ); };
	const push = ( who, html ) => { const b = box(); if ( b ) { b.insertAdjacentHTML( 'beforeend', bubble( who, html ) ); end(); } };
	const say = async ( text, raw ) => {
		const my = tok; const b = box(); if ( ! b ) return;
		const ty = '<div class="ef-msg ef" id="obTyping"><span class="ef-av">' + F().icon( 30 ) + '</span><div class="ef-mb ef-typing"><i></i><i></i><i></i></div></div>';
		if ( natural() && ! reduce() ) { b.insertAdjacentHTML( 'beforeend', ty ); end(); await wait( Math.min( 1300, 500 + String( text ).length * 12 ) ); const tp = host && host.querySelector( '#obTyping' ); if ( tp ) tp.remove(); }
		if ( my !== tok ) return;
		push( 'ef', raw ? text : String( text ).split( '\n' ).map( ( l ) => `<p class="ef-ml">${ esc( l ) }</p>` ).join( '' ) );
	};
	const me = ( text ) => push( 'me', esc( text ) );
	const setBar = ( o ) => {
		const chips = host.querySelector( '#obChips' ), form = host.querySelector( '#obForm' ), inp = form.querySelector( 'input' );
		chips.innerHTML = ( o.chips || [] ).map( ( c, i ) => `<button type="button" class="ef-chipq${ c.go ? ' go' : '' }${ c.on ? ' on' : '' }" style="--i:${ i }" data-ob-chip="${ i }" aria-pressed="${ c.on ? 'true' : 'false' }">${ esc( c.label ) }</button>` ).join( '' );
		form.hidden = ! o.input; inp.value = ''; inp.setAttribute( 'inputmode', o.input === 'decimal' ? 'decimal' : 'text' ); inp.placeholder = o.ph || L( 'ph' ); inp.maxLength = o.input === 'decimal' ? 14 : 40;
		pending = o; if ( o.input && fine() ) inp.focus( { preventScroll: true } ); // desktop only: a phone keyboard never opens by itself
		end(); setTimeout( end, 120 );
	};
	/** Shows the buttons or the input and waits for an answer: { chip: index } or { text }. */
	const prompt = ( o ) => new Promise( ( res ) => { o.res = res; setBar( o ); } );
	const clearBar = () => { pending = null; if ( host ) { const c = host.querySelector( '#obChips' ), f = host.querySelector( '#obForm' ); if ( c ) c.innerHTML = ''; if ( f ) f.hidden = true; } };
	const num = ( s ) => {
		let v = String( s ).replace( /[^\d.,]/g, '' ); if ( ! v ) return null;
		const seps = v.match( /[.,]/g ) || [], kinds = new Set( seps );
		if ( seps.length ) {
			const last = Math.max( v.lastIndexOf( '.' ), v.lastIndexOf( ',' ) ), after = v.length - last - 1;
			if ( kinds.size === 1 && seps.length > 1 ) v = v.replace( /[.,]/g, '' ); // 1.500.000
			else if ( kinds.size === 1 && after === 3 && last > 0 && last <= 3 ) v = v.replace( /[.,]/g, '' ); // 1.500 or 1,500: thousands
			else v = v.slice( 0, last ).replace( /[.,]/g, '' ) + '.' + v.slice( last + 1 ); // 1.500,50 or 12.50: the last mark is the decimal point
		}
		const n = parseFloat( v ); return Number.isFinite( n ) && n > 0 && n < 1e9 ? Math.round( n * 100 ) / 100 : null;
	};
	const fmt = ( n ) => EX.money( Math.round( n * 100 ) / 100, A.cur || S().settings.currency );
	const curOk = ( c ) => { try { new Intl.NumberFormat( 'en', { style: 'currency', currency: c } ); return /^[A-Z]{3}$/.test( c ); } catch ( e ) { return false; } };
	const BILL_TPL = [ [ 'tplRent', 'housing', 'monthly', '🏠' ], [ 'tplElectricity', 'utilities', 'monthly', '💡' ], [ 'tplInternet', 'utilities', 'monthly', '🌐' ], [ 'tplPhone', 'utilities', 'monthly', '📱' ], [ 'tplWater', 'utilities', 'quarterly', '💧' ], [ 'tplNetflix', 'subscriptions', 'monthly', '📺' ], [ 'tplCarIns', 'insurance', 'yearly', '🛡️' ], [ 'tplCard', 'loans', 'monthly', '💳' ] ];
	const GOALS = [ [ 'trip', 'plane', '✈️' ], [ 'car', 'car', '🚗' ], [ 'gift', 'gift', '🎁' ], [ 'home', 'home', '🏠' ], [ 'emergency', 'heart', '❤️' ] ];

	async function qName() {
		await say( L( 'name' ) ); const r = await prompt( { input: 'text', ph: L( 'ph' ), chips: [ { label: L( 'skipQ' ) } ] } ); if ( ! r ) return;
		if ( r.chip !== undefined ) { me( L( 'skipQ' ) ); A.name = ''; await say( L( 'nameNone' ) ); } else { A.name = r.text.trim().slice( 0, 40 ); me( A.name ); await say( L( 'nameHi', { name: A.name } ) ); }
		S().settings.name = A.name;
	}
	async function qCur() {
		const main = [ 'EUR', 'USD', 'GBP', 'CHF' ]; await say( L( 'currency' ) );
		for ( ;; ) {
			const r = await prompt( { chips: main.map( ( c ) => ( { label: c } ) ).concat( [ { label: L( 'curOther' ) } ] ) } ); if ( ! r ) return;
			if ( r.chip < 4 ) { A.cur = main[ r.chip ]; me( A.cur ); break; }
			me( L( 'curOther' ) ); await say( L( 'curType' ) );
			const o = await prompt( { input: 'text', ph: 'SEK', chips: [] } ); if ( ! o ) return; const c = ( o.text || '' ).trim().toUpperCase(); me( c );
			if ( curOk( c ) ) { A.cur = c; break; } await say( L( 'curBad' ) );
		}
		S().settings.currency = A.cur;
	}
	async function qIncome() {
		await say( L( 'income' ) ); let amount = null;
		for ( ;; ) {
			const r = await prompt( { input: 'decimal', ph: '1500', chips: [ { label: L( 'incNone' ) } ] } ); if ( ! r ) return;
			if ( r.chip !== undefined ) { me( L( 'incNone' ) ); A.income = null; return; }
			amount = num( r.text ); me( r.text ); if ( amount ) break; await say( L( 'numBad' ) );
		}
		await say( L( 'freq' ) ); const f = await prompt( { chips: [ { label: L( 'fMonthly' ) }, { label: L( 'fBiweekly' ) }, { label: L( 'fWeekly' ) } ] } ); if ( ! f ) return;
		const repeat = [ 'monthly', 'biweekly', 'weekly' ][ f.chip ]; me( [ L( 'fMonthly' ), L( 'fBiweekly' ), L( 'fWeekly' ) ][ f.chip ] );
		let day = 1;
		if ( repeat === 'monthly' ) { await say( L( 'incDay' ) ); const d = await prompt( { chips: [ 1, 5, 10, 15, 20, 25, 28 ].map( ( n ) => ( { label: String( n ) } ) ).concat( [ { label: L( 'notSure' ) } ] ) } ); if ( ! d ) return; day = d.chip < 7 ? [ 1, 5, 10, 15, 20, 25, 28 ][ d.chip ] : 1; me( d.chip < 7 ? String( day ) : L( 'notSure' ) ); }
		A.income = { amount, repeat, day };
	}
	async function qBills() {
		await say( L( 'bills' ) ); const sel = new Set(); let cards;
		for ( ;; ) {
			const mk = () => BILL_TPL.map( ( b, i ) => ( { label: b[ 3 ] + ' ' + t( b[ 0 ] ), on: sel.has( i ), toggle: i } ) ).concat( [ { label: sel.size ? '✅ ' + L( 'done' ) : L( 'noBills' ), go: true, doneBtn: true } ] );
			const r = await prompt( { chips: mk(), multi: true, sel } ); if ( ! r ) return;
			if ( r.done ) break;
		}
		if ( ! sel.size ) { me( L( 'noBills' ) ); A.bills = []; return; }
		me( [ ...sel ].map( ( i ) => t( BILL_TPL[ i ][ 0 ] ) ).join( ', ' ) );
		await say( L( 'billsCard' ) );
		const rows = [ ...sel ].map( ( i ) => ( { i, tpl: BILL_TPL[ i ] } ) );
		const form = `<form id="obBillForm" class="ob-bills" novalidate autocomplete="off">${ rows.map( ( r ) => `<div class="ob-brow"><b>${ r.tpl[ 3 ] } ${ esc( t( r.tpl[ 0 ] ) ) }</b><input name="a${ r.i }" inputmode="decimal" placeholder="0" aria-label="${ esc( t( r.tpl[ 0 ] ) ) }"><select name="d${ r.i }" aria-label="${ esc( L( 'dayN', { n: '' } ) ) }">${ [ 1, 5, 10, 15, 20, 25, 28 ].map( ( n ) => `<option value="${ n }">${ esc( L( 'dayN', { n } ) ) }</option>` ).join( '' ) }</select></div>` ).join( '' ) }<button type="submit" class="btn btn-primary">${ esc( L( 'done' ) ) }</button></form>`;
		push( 'ef', form );
		const got = await new Promise( ( res ) => { const f = host.querySelector( '#obBillForm' ); pending = { form: true, res }; f.addEventListener( 'submit', ( e ) => { e.preventDefault(); res( [ ...new FormData( f ) ] ); } ); } );
		if ( ! got ) return; const fd = new Map( got ); A.bills = [];
		rows.forEach( ( r ) => { const a = num( fd.get( 'a' + r.i ) ); if ( a ) A.bills.push( { tpl: r.i, amount: a, day: Number( fd.get( 'd' + r.i ) ) || 1 } ); } );
		const f = host.querySelector( '#obBillForm' ); if ( f ) { f.querySelectorAll( 'input,select,button' ).forEach( ( x ) => { x.disabled = true; } ); }
		if ( A.bills.length ) me( A.bills.map( ( b ) => t( BILL_TPL[ b.tpl ][ 0 ] ) + ' ' + fmt( b.amount ) ).join( ', ' ) );
	}
	async function qGoal() {
		await say( L( 'goal' ) ); const r = await prompt( { chips: GOALS.map( ( g ) => ( { label: g[ 2 ] + ' ' + t( 'goalPreset_' + g[ 0 ] ) } ) ).concat( [ { label: L( 'goalNone' ) } ] ) } ); if ( ! r ) return;
		if ( r.chip >= GOALS.length ) { me( L( 'goalNone' ) ); A.goal = null; return; }
		const g = GOALS[ r.chip ], name = t( 'goalPreset_' + g[ 0 ] ); me( name ); await say( L( 'goalAmt', { goal: name } ) );
		for ( ;; ) {
			const a = await prompt( { input: 'decimal', ph: '1000', chips: [ { label: L( 'skipQ' ) } ] } ); if ( ! a ) return;
			if ( a.chip !== undefined ) { me( L( 'skipQ' ) ); A.goal = null; return; }
			const n = num( a.text ); me( a.text ); if ( n ) { A.goal = { key: g[ 0 ], icon: g[ 1 ], name, target: n }; return; } await say( L( 'numBad' ) );
		}
	}
	async function qCushion() {
		await say( L( 'cushion' ) ); const r = await prompt( { chips: [ { label: L( 'cCareful' ) }, { label: L( 'cBalanced' ) }, { label: L( 'cRelaxed' ) } ] } ); if ( ! r ) return;
		A.cushion = [ 'careful', 'balanced', 'relaxed' ][ r.chip ]; me( [ L( 'cCareful' ), L( 'cBalanced' ), L( 'cRelaxed' ) ][ r.chip ] );
	}
	async function qEntry() {
		await say( L( 'entry' ) ); const r = await prompt( { chips: [ { label: L( 'eSmart' ) }, { label: L( 'eCasual' ) } ] } ); if ( ! r ) return;
		A.entry = r.chip === 0 ? 'smart' : 'casual'; me( r.chip === 0 ? L( 'eSmart' ) : L( 'eCasual' ) );
	}
	const QS = { name: qName, cur: qCur, income: qIncome, bills: qBills, goal: qGoal, cushion: qCushion, entry: qEntry };
	const ORDER = [ 'name', 'cur', 'income', 'bills', 'goal', 'cushion', 'entry' ];

	function chat() {
		const my = ++tok; summaryOn = false; created = null;
		host.innerHTML = `<div class="ob-chat ef-cp ob-cp" role="dialog" aria-label="eFriend"><header class="ef-cp-h"><div class="ef-cp-who"><span class="ef-cp-av">${ F().mascot( 'happy', 46 ) }</span><div><b>${ esc( F().charName() ) }</b><small>${ esc( t( 'efc_online' ) ) }</small></div></div><button type="button" class="btn btn-ghost sm ob-skip" data-ob-skip>${ esc( L( 'skip' ) ) }</button></header>
			<div id="obChat" class="ef-chat" aria-live="polite"></div><div class="ef-chips" id="obChips"></div>
			<form id="obForm" class="ef-chat-in" novalidate autocomplete="off" hidden><span class="ef-inwrap"><input name="q" autocomplete="off" enterkeyhint="send" aria-label="${ esc( L( 'ph' ) ) }"></span><button type="submit" class="btn btn-primary" aria-label="${ esc( L( 'send' ) ) }">➤</button></form></div>`;
		( async () => {
			await say( L( 'hello' ) ); if ( my !== tok ) return;
			for ( const q of ORDER ) { await QS[ q ](); if ( my !== tok ) return; clearBar(); }
			await working( my );
		} )();
	}
	async function working( my ) {
		await say( L( 'working' ) ); if ( my !== tok ) return; await wait( 700 ); build(); if ( my !== tok ) return; summary();
	}

	/* ------------------------------------------------------------------ 3. Creating things, and the summary */
	const nextOnDay = ( day ) => { const td = EX.parse( EX.today() ); let y = td.getFullYear(), m = td.getMonth(), dm = new Date( y, m + 1, 0 ).getDate(); let c = new Date( y, m, Math.min( day, dm ) ); if ( c < td ) { m += 1; dm = new Date( y, m + 1, 0 ).getDate(); c = new Date( y, m, Math.min( day, dm ) ); } return EX.iso( c ); };
	const perMonth = ( amount, repeat ) => amount * ( EX.PER_YEAR[ repeat ] || 12 ) / 12;
	const money5 = ( n ) => Math.max( 5, Math.round( n / 5 ) * 5 );
	function undoCreated() {
		if ( ! created ) return; const s = S(), ids = new Set( [ created.income, created.goal ].concat( created.bills, created.budgets ).filter( Boolean ) );
		s.incomes = s.incomes.filter( ( x ) => ! ids.has( x.id ) ); s.bills = s.bills.filter( ( x ) => ! ids.has( x.id ) ); s.goals = s.goals.filter( ( x ) => ! ids.has( x.id ) ); s.budgets = s.budgets.filter( ( x ) => ! ids.has( x.id ) ); created = null;
	}
	function build() {
		undoCreated(); const s = S(), st = s.settings, d = D();
		created = { income: null, goal: null, bills: [], budgets: [] };
		if ( A.cur ) st.currency = A.cur;
		st.name = A.name; d.entryMode = A.entry; st.efCushion = { careful: 2, balanced: 1, relaxed: 0 }[ A.cushion ];
		if ( ! s.accounts.length ) s.accounts.push( { id: EX.uid(), name: t( 'wCash' ), type: 'cash', currency: st.currency, opening: '0', auto: true } ); // ensureWallet waits until setup is done
		s.accounts.filter( ( a ) => a.auto ).forEach( ( a ) => { a.currency = st.currency; } );
		const acc = s.accounts[ 0 ]; if ( acc && ! st.defaultAccount ) st.defaultAccount = acc.id;
		if ( A.income && acc ) {
			const r = A.income, id = EX.uid(), next = r.repeat === 'monthly' ? nextOnDay( r.day ) : EX.addDays( EX.today(), r.repeat === 'weekly' ? 7 : 14 );
			s.incomes.push( { id, name: t( 'cat_salary' ), amount: String( r.amount ), account: acc.id, currency: acc.currency || st.currency, repeat: r.repeat, next, day: EX.parse( next ).getDate(), category: 'salary', tags: [], photo: '', note: '' } ); created.income = id;
		}
		A.bills.forEach( ( b ) => {
			const tp = BILL_TPL[ b.tpl ], id = EX.uid(), next = nextOnDay( b.day );
			s.bills.push( { id, name: t( tp[ 0 ] ), amount: String( b.amount ), category: tp[ 1 ], next, repeat: tp[ 2 ], currency: acc ? acc.currency || st.currency : st.currency, account: acc ? acc.id : '', day: b.day, created: EX.today() } ); created.bills.push( id );
		} );
		if ( A.goal ) { const id = EX.uid(); s.goals.push( { id, name: A.goal.name, target: String( A.goal.target ), deadline: '', icon: A.goal.icon } ); created.goal = id; }
		if ( A.income ) {
			const free = perMonth( A.income.amount, A.income.repeat ) - A.bills.reduce( ( x, b ) => x + perMonth( b.amount, BILL_TPL[ b.tpl ][ 2 ] ), 0 );
			if ( free > 0 ) [ [ 'food', .3 ], [ 'transport', .12 ], [ 'leisure', .12 ], [ 'shopping', .08 ] ].forEach( ( [ cat, k ] ) => { const id = EX.uid(); s.budgets.push( { id, category: cat, amount: String( money5( free * k ) ), period: 'monthly', rollover: false, tags: [], photo: '', est: true } ); created.budgets.push( id ); } );
		}
		st.u = Date.now(); EX.save();
	}
	function rowsHtml() {
		const R = ( k, ic, label, val, edit, rm ) => `<li class="ob-sum-r"><span class="ob-sum-ic">${ ic }</span><span class="ob-sum-t"><small>${ esc( L( label ) ) }</small><b>${ val }</b></span>${ edit ? `<button type="button" class="ab-btn" data-ob-edit="${ edit }" aria-label="${ esc( L( 'edit' ) ) }" title="${ esc( L( 'edit' ) ) }">✏️</button>` : '' }${ rm ? `<button type="button" class="ab-btn" data-ob-rm="${ rm }" aria-label="${ esc( L( 'remove' ) ) }" title="${ esc( L( 'remove' ) ) }">✕</button>` : '' }</li>`;
		const none = esc( L( 'sNone' ) ), cush = { careful: 'cCareful', balanced: 'cBalanced', relaxed: 'cRelaxed' }[ A.cushion ];
		const inc = A.income ? esc( fmt( A.income.amount ) + ' · ' + L( { monthly: 'fMonthly', biweekly: 'fBiweekly', weekly: 'fWeekly' }[ A.income.repeat ] ) ) : none;
		const bills = A.bills.length ? esc( A.bills.map( ( b ) => t( BILL_TPL[ b.tpl ][ 0 ] ) ).join( ', ' ) + ' · ' + fmt( A.bills.reduce( ( x, b ) => x + perMonth( b.amount, BILL_TPL[ b.tpl ][ 2 ] ), 0 ) ) + ' ' + L( 'perMonth' ) ) : none;
		const bud = created && created.budgets.length ? esc( S().budgets.filter( ( b ) => created.budgets.includes( b.id ) ).map( ( b ) => t( 'cat_' + b.category ) + ' ' + fmt( Number( b.amount ) ) ).join(', ') ) : none;
		return R( 'lang', '🌍', 'sLang', EX.lang() === 'el' ? 'Ελληνικά' : 'English', '' ) + R( 'name', '👤', 'sName', esc( A.name ) || none, 'name' ) + R( 'cur', '💶', 'sCur', esc( A.cur || S().settings.currency ), 'cur' ) + R( 'income', '💼', 'sInc', inc, 'income' )
			+ R( 'bills', '🧾', 'sBills', bills, 'bills' ) + R( 'goal', '🎯', 'sGoal', A.goal ? esc( A.goal.name + ' · ' + fmt( A.goal.target ) ) : none, 'goal' ) + R( 'cushion', '🛡️', 'sCush', esc( L( cush ) ), 'cushion' )
			+ R( 'entry', '✨', 'sEntry', esc( L( A.entry === 'smart' ? 'eSmart' : 'eCasual' ) ), 'entry' ) + R( 'bud', '📊', 'sBud', bud, '', created && created.budgets.length ? 'bud' : '' );
	}
	function summary() {
		summaryOn = true; const b = box(); if ( ! b ) return;
		( async () => { await say( L( 'sumIntro' ) ); const bx = box(); if ( ! bx || ! summaryOn ) return; push( 'ef', `<ul class="ob-sum" id="obSum">${ rowsHtml() }</ul><p class="ob-note">${ esc( L( 'sumNote' ) ) }</p>` ); await offerAccount(); } )();
	}
	/** The last step: if the app is not installed yet, eFriend explains (with some drama) why the next page matters, then the install guide shows before the app opens. */
	async function finalStep() {
		const my = tok, needs = ! UI.isStandalone() && ! D().installDismissed;
		if ( ! needs ) { exit(); return; }
		await say( L( 'instPitch' ) ); if ( my !== tok ) return;
		const r = await prompt( { chips: [ { label: L( 'open' ), go: true } ] } ); if ( ! r || my !== tok ) return;
		me( L( 'open' ) ); clearBar(); tok++; S().settings.setupDone = true; D().onboarded = true; D().stage = 'install'; EX.save(); EXA.flow.show();
	}
	/** After the summary: keep it all safe with a free account, or open the app. */
	async function offerAccount() {
		if ( EX.auth.isSignedIn() ) { await finalStep(); return; }
		const my = tok; await say( L( 'accAsk' ) ); if ( my !== tok ) return;
		const r = await prompt( { chips: [ { label: L( 'accCreate' ), go: true }, { label: L( 'open' ) } ] } ); if ( ! r || my !== tok ) return;
		if ( r.chip === 1 ) { me( L( 'open' ) ); await finalStep(); return; }
		me( L( 'accCreate' ) ); await say( L( 'accEmail' ) );
		for ( ;; ) {
			const e = await prompt( { input: 'text', ph: 'name@example.com', chips: [ { label: L( 'accLater' ) } ] } ); if ( ! e || my !== tok ) return;
			if ( e.chip !== undefined ) { me( L( 'accLater' ) ); await finalStep(); return; }
			const mail = e.text.trim(); me( mail ); if ( ! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test( mail ) ) { await say( L( 'accBad' ) ); continue; }
			const res = await EX.auth.register( mail );
			if ( res.error ) { await say( EXA.errText( res.error ) ); continue; }
			EXA.showCodes( res.recoveryCodes, () => { finalStep(); } ); return;
		}
	}
	function refreshSummary() { const u = host.querySelector( '#obSum' ); if ( u ) u.innerHTML = rowsHtml(); }
	async function edit( id ) {
		const my = ++tok; summaryOn = false; clearBar(); await QS[ id ](); if ( my !== tok ) return; clearBar(); build(); const u = host.querySelector( '#obSum' ); if ( u ) { await say( L( 'sumIntro' ) ); if ( my === tok ) { push( 'ef', `<ul class="ob-sum" id="obSum">${ rowsHtml() }</ul>` ); summaryOn = true; await offerAccount(); } } else summary();
	}
	function exit() {
		clearBar(); tok++; const fl = EXA.flow; EX.persist();
		if ( fl && fl.finish ) fl.finish(); else { D().stage = 'done'; D().onboarded = true; S().settings.setupDone = true; EX.ensureWallet(); EX.save(); }
	}
	function skipAll() { undoCreated(); if ( A.cur ) S().settings.currency = A.cur; exit(); }

	/* ------------------------------------------------------------------ Events */
	document.addEventListener( 'click', ( e ) => {
		if ( ! host || ! host.contains( e.target ) ) return;
		const chip = e.target.closest( '[data-ob-chip]' );
		if ( chip && pending ) {
			const i = Number( chip.dataset.obChip ), p = pending;
			if ( p.sumBtn ) { exit(); return; }
			if ( p.multi ) { const c = p.chips[ i ]; if ( c.doneBtn ) { const r = p.res; clearBar(); r( { done: true } ); return; } if ( p.sel.has( c.toggle ) ) p.sel.delete( c.toggle ); else p.sel.add( c.toggle ); p.chips = p.chips.map( ( x, k ) => ( x.doneBtn ? Object.assign( x, { label: p.sel.size ? '✅ ' + L( 'done' ) : L( 'noBills' ) } ) : Object.assign( x, { on: p.sel.has( x.toggle ) } ) ) ); setBar( p ); return; }
			const r = p.res; clearBar(); r( { chip: i } ); return;
		}
		const lg = e.target.closest( '[data-ob-lang]' ); if ( lg ) { const k = lg.dataset.obLang; if ( EX.lang() !== k ) EX.setLang( k ); A.lang = k; const y = host.querySelector( '.ob-intro' ).scrollTop; intro(); host.querySelector( '.ob-intro' ).scrollTop = y; return; }
		if ( e.target.closest( '[data-ob-go]' ) ) { picker(); return; }
		if ( e.target.closest( '[data-ob-skip]' ) ) { skipAll(); return; }
		const ed = e.target.closest( '[data-ob-edit]' ); if ( ed ) { edit( ed.dataset.obEdit ); return; }
		if ( e.target.closest( '[data-ob-rm]' ) ) { if ( created ) { S().budgets = S().budgets.filter( ( b ) => ! created.budgets.includes( b.id ) ); created.budgets = []; EX.save(); refreshSummary(); } }
	} );
	document.addEventListener( 'submit', ( e ) => {
		if ( e.target.id !== 'obForm' ) return; e.preventDefault(); const f = e.target, v = f.querySelector( 'input' ).value.trim(); if ( ! v || ! pending || ! pending.input ) return; const r = pending.res; clearBar(); r( { text: v } );
	} );

	/* ------------------------------------------------------------------ Entry point (called by flow.js instead of the classic wizard) */
	ob.show = () => {
		host = document.getElementById( 'flow' ); if ( ! host ) return;
		if ( host.querySelector( '.ob-intro, .ob-pick, .ob-chat' ) ) return; // already running: a language change must not restart it
		A.lang = EX.lang(); A.cur = ''; tok++; chosen = false; intro();
	};
}() );
