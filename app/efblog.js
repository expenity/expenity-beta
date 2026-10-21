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
	const LOCK_DAYS = 10, WAIT_DAYS = 2;
	const HARD = new Set( [ 'insurance', 'health', 'loans', 'taxes', 'education', 'housing' ] );
	const HARD_NAME = /insur|health|medic|doctor|loan|debt|mortgage|tax|educ|school|tuition|rent|ασφάλ|υγεί|γιατρ|δάνει|χρέ|φόρ|εκπαίδ|σχολ|ενοίκ|στεγαστ/i;

	/* ------------------------------------------------------------------ Words: [EN Boogie, EL Boogie, EN Chip, EL Chip]; "|" separates variants. A missing Chip text means "same as Boogie". */
	const CHAPTERS = [
		{
			id: 'first', title: [ 'The drawer opens', 'Το συρτάρι ανοίγει' ], unlock: [ '5 entries', '5 εγγραφές' ], ready: ( f ) => f.n >= 5,
			lines: [
				{ b: 1, t: [ 'Forgive me, I am not used to speaking first... 📼 My name is Boogie. I am a cassette recorder, born in the glorious eighties, when music had a body and you could hold it in your hand.',
					'Συγχωρήστε με, δεν έχω συνηθίσει να μιλάω πρώτος... 📼 Με λένε Boogie. Είμαι κασετόφωνο, γεννημένο στις λαμπρές δεκαετίες του ’80, τότε που η μουσική είχε σώμα και μπορούσατε να την κρατήσετε στο χέρι.',
					'YOOO okay okay HI!! 💿⚡ Chip here, your favourite (only?) wireless genius. i was born yesterday and i already have 4k opinions. YOLO',
					'YOOO okay okay ΓΕΙΑ ΣΑΣ!! 💿⚡ Εδώ Chip, ο αγαπημένος σας (μοναδικός;) ασύρματος ιδιοφυής. Γεννήθηκα χθες και έχω ήδη 4k απόψεις. YOLO' ] },
				{ b: 1, t: [ 'For a long time I lived in a drawer of the archive, between a dead battery and a paperclip. Nobody asked for tapes any more. They asked for “streams”, which sounds to me like something that wets your socks.',
					'Για πολύ καιρό ζούσα σε ένα συρτάρι του αρχείου, ανάμεσα σε μια άδεια μπαταρία και έναν συνδετήρα. Κανείς δεν ζητούσε πια κασέτες. Ζητούσαν «streams», που μου ακούγεται σαν κάτι που βρέχει τις κάλτσες.',
					'they hired me to run the archive. it was giving DUSTY. like who still keeps stuff in DRAWERS?? ancient. i fixed the vibes in 3 minutes, no cap',
					'Με προσέλαβαν να τρέχω το αρχείο. Είχε vibes ΣΚΟΝΗΣ. Ποιος κρατάει ακόμα πράγματα σε ΣΥΡΤΑΡΙΑ?? Προϊστορία. Διόρθωσα τα vibes σε 3 λεπτά, no cap' ] },
				{ b: 1, need: [ 'firstDate', 'firstWhat', 'firstAmt' ], t: [ 'Then, on **{firstDate}** ({firstDay}), the drawer opened. A box labelled **{name}** had arrived, and the first note inside said: {firstWhat}, **{firstAmt}**. I dusted my reels and whispered, very small, “Good morning.”',
					'Τότε, στις **{firstDate}** ({firstDay}), το συρτάρι άνοιξε. Ένα κουτί με την ετικέτα «**{name}**» είχε φτάσει, και το πρώτο σημείωμα μέσα έγραφε: {firstWhat}, **{firstAmt}**. Ξεσκόνισα τα καρούλια μου και ψιθύρισα, πολύ σιγανά: «Καλημέρα».',
					'then on **{firstDate}** ({firstDay}) the FIRST ticket drops from the box labelled **{name}**: {firstWhat}, **{firstAmt}**. i high-fived my own screen. it hurt. 10/10 would do again',
					'Τότε, στις **{firstDate}** ({firstDay}), πέφτει το ΠΡΩΤΟ αίτημα από το κουτί με την ετικέτα «**{name}**»: {firstWhat}, **{firstAmt}**. Έδωσα high five στη δική μου οθόνη. Πόνεσε. 10/10, θα το ξανάκανα' ] },
				{ b: 1, when: ( f ) => f.active >= 2, need: [ 'n', 'active', 'cats' ], t: [ 'Since then **{n}** notes have come, over **{active}** days. I keep each one carefully, the way one keeps a good record. Shelves in use: **{cats}**... I did not know I owned so many shelves.',
					'Από τότε έφτασαν **{n}** σημειώματα, σε **{active}** ημέρες. Φυλάω το καθένα προσεκτικά, όπως φυλάει κανείς ένα καλό δίσκο. Ράφια σε χρήση: **{cats}**... Δεν ήξερα ότι είχα τόσα ράφια.',
					'since then: **{n}** tickets, **{active}** days, **{cats}** folders. i named every folder like a pet 🐶 (Folder Steve is my fave, W name)',
					'Από τότε: **{n}** αιτήματα, **{active}** ημέρες, **{cats}** φάκελοι. Ονόμασα κάθε φάκελο σαν κατοικίδιο 🐶 (ο Folder Steve είναι ο αγαπημένος μου, W όνομα)' ] },
				{ when: ( f ) => f.active === 1, need: [ 'n' ], t: [ 'All **{n}** notes came in one single day. In my time that was a whole summer of mixtapes.', 'Και τα **{n}** σημειώματα ήρθαν σε μία μόνο ημέρα. Στην εποχή μου αυτό ήταν ολόκληρο καλοκαίρι με mixtapes.', 'all **{n}** tickets in ONE day?! that is a speedrun 🏃💨', 'Και τα **{n}** αιτήματα σε ΜΙΑ ημέρα?! Αυτό είναι speedrun 🏃💨' ] },
				{ r: 1, need: [ 'n' ], t: [ 'You write faster than a tape can spin. I am trying not to take it personally. 🎧|A whole first side already. In my day it took a month, and we rewound with a pencil. 🎧',
					'Γράφετε πιο γρήγορα απ’ όσο γυρίζει μια κασέτα. Προσπαθώ να μην το πάρω προσωπικά. 🎧|Ολόκληρη η πρώτη πλευρά ήδη. Στην εποχή μου έπαιρνε έναν μήνα, και γυρνούσαμε πίσω με ένα μολύβι. 🎧',
					'ok that is already a W for chapter one, i am lowkey proud of us 😎|not me doing a victory lap around my own motherboard 🏁',
					'Οκ, αυτό είναι ήδη W για το πρώτο κεφάλαιο, είμαι lowkey περήφανος για εμάς 😎|Όχι εγώ να κάνω γύρο θριάμβου γύρω από τη μητρική μου 🏁' ] },
				{ b: 1, t: [ 'One odd thing, if I may. On the second shelf there was a ring, a coffee ring, still warm. I do not drink coffee. I have no mouth, strictly speaking. And the sticky notes are written in capital letters. Someone else works here. Someone loud. I have decided not to think about it. 🎧',
					'Ένα παράξενο, αν μου επιτρέπεται. Στο δεύτερο ράφι υπήρχε ένας δακτύλιος, από καφέ, ακόμα ζεστός. Εγώ δεν πίνω καφέ. Δεν έχω στόμα, αυστηρά μιλώντας. Και τα αυτοκόλλητα σημειώματα είναι γραμμένα με κεφαλαία. Κάποιος άλλος δουλεύει εδώ. Κάποιος θορυβώδης. Αποφάσισα να μην το σκέφτομαι. 🎧',
					'BUT. weird thing. every morning somebody tidies the archive BEFORE i get there?? labels in tiny handwriting?? in PENCIL?? who uses PENCIL?? the cursor blinks. nobody is there. i am not scared. (i am a little scared) 👻',
					'ΑΛΛΑ. Παράξενο πράγμα. Κάθε πρωί κάποιος τακτοποιεί το αρχείο ΠΡΙΝ φτάσω εγώ?? Ετικέτες με μικροσκοπικό γραφικό χαρακτήρα?? Με ΜΟΛΥΒΙ?? Ποιος χρησιμοποιεί ΜΟΛΥΒΙ?? Ο κέρσορας αναβοσβήνει. Δεν είναι κανείς εκεί. Δεν φοβάμαι. (φοβάμαι λίγο) 👻' ] },
				{ when: ( f ) => f.coffeeN >= 1, need: [ 'coffeeAmt', 'coffeeDate' ], t: [ 'The ring, I now suspect, has something to do with the coffee in the notes: **{coffeeAmt}** on **{coffeeDate}**. Not mine, in any case. I take my warmth from the tape. ☕',
					'Ο δακτύλιος, υποψιάζομαι τώρα, έχει σχέση με τον καφέ στα σημειώματα: **{coffeeAmt}** στις **{coffeeDate}**. Όχι δικός μου, εν πάση περιπτώσει. Τη ζεστασιά μου την παίρνω από την κασέτα. ☕',
					'unrelated?? but there is a coffee in the tickets: **{coffeeAmt}** on **{coffeeDate}** ☕ same energy as my energy-drink emergencies. lowkey a clue, i will chase it',
					'Άσχετο?? Αλλά υπάρχει ένας καφές στα αιτήματα: **{coffeeAmt}** στις **{coffeeDate}** ☕ Ίδια ενέργεια με τις έκτακτες ανάγκες μου σε energy drink. Lowkey ένα στοιχείο, θα το ψάξω' ] },
				{ b: 1, when: ( f ) => f.streak >= 3, need: [ 'streak' ], t: [ 'For **{streak}** days in a row the notes kept arriving, and I thought: here is someone who keeps a rhythm. In the old days we called that a groove. 🎶',
					'Για **{streak}** ημέρες στη σειρά τα σημειώματα συνέχιζαν να έρχονται, και σκέφτηκα: νάτος κάποιος που κρατάει ρυθμό. Παλιά το λέγαμε groove. 🎶',
					'**{streak}** days in a row?? that is a STREAK, that is giving main character energy 🔥 67',
					'**{streak}** ημέρες στη σειρά?? Αυτό είναι STREAK, αυτό έχει ενέργεια πρωταγωνιστή 🔥 67' ] },
				{ b: 1, t: [ 'That was the first side. I turn the tape over, carefully, and leave the lamp on. 📼', 'Αυτή ήταν η πρώτη πλευρά. Γυρίζω την κασέτα, προσεκτικά, και αφήνω τη λάμπα αναμμένη. 📼', 'chapter one: done ✅ pencil guy, i WILL find you 🔍 see ya!!', 'Κεφάλαιο πρώτο: έτοιμο ✅ Μολυβένιε, ΘΑ σε βρω 🔍 Τα λέμε!!' ] },
			],
		},
		{
			id: 'where', title: [ 'Shelves and snack crimes', 'Ράφια και εγκλήματα με σνακ' ], unlock: [ '20 expenses', '20 έξοδα' ], ready: ( f ) => f.ne >= 20,
			lines: [
				{ k: 1, b: 1, t: [ 'Whatever the numbers say, you keep bringing them in, and that is the brave part. 💛', 'Ό,τι κι αν δείχνουν τα νούμερα, συνεχίζετε να τα φέρνετε, και αυτό είναι το γενναίο μέρος. 💛', 'whatever the numbers say, you keep showing up and that takes guts 💛', 'Ό,τι κι αν δείχνουν τα νούμερα, συνεχίζετε να εμφανίζεστε, και αυτό θέλει θάρρος 💛' ] },
				{ b: 1, when: ( f ) => f.totalC, need: [ 'ne', 'total', 'avg' ], t: [ 'Side A, track two. 🎶 Today I sorted the shelves. In the old days we sorted records by mood; now it is by “category”, which has less poetry but, I admit, more order. The box labelled **{name}** held **{ne}** notes, **{total}** in all, about **{avg}** each.',
					'Πλευρά Α, κομμάτι δεύτερο. 🎶 Σήμερα ταξινόμησα τα ράφια. Παλιά ταξινομούσαμε τους δίσκους ανά διάθεση· τώρα ανά «κατηγορία», που έχει λιγότερη ποίηση αλλά, το ομολογώ, περισσότερη τάξη. Το κουτί «**{name}**» είχε **{ne}** σημειώματα, **{total}** συνολικά, περίπου **{avg}** το καθένα.',
					'chapter_02 💿 sorting day. **{ne}** tickets, **{total}** moved in total, about **{avg}** each. folders: organised. vibes: immaculate. the box labelled **{name}** is lowkey WILD',
					'Chapter_02 💿 ημέρα ταξινόμησης. **{ne}** αιτήματα, **{total}** συνολικά, περίπου **{avg}** το καθένα. Φάκελοι: οργανωμένοι. Vibes: άψογα. Το κουτί «**{name}**» είναι lowkey ΑΓΡΙΟ' ] },
				{ b: 1, when: ( f ) => ! f.totalC, t: [ 'Side A, track two. 🎶 Today I sorted the shelves. In the old days we sorted records by mood; now it is by “category”, which has less poetry but, I admit, more order. The box labelled **{name}** is still light, but the shelves are ready.', 'Πλευρά Α, κομμάτι δεύτερο. 🎶 Σήμερα ταξινόμησα τα ράφια. Παλιά ταξινομούσαμε τους δίσκους ανά διάθεση· τώρα ανά «κατηγορία», που έχει λιγότερη ποίηση αλλά, το ομολογώ, περισσότερη τάξη. Το κουτί «**{name}**» είναι ακόμα ελαφρύ, αλλά τα ράφια είναι έτοιμα.', 'chapter_02 💿 sorting day. the box labelled **{name}** is still light but my folders are ready. organised. immaculate vibes', 'Chapter_02 💿 ημέρα ταξινόμησης. Το κουτί «**{name}**» είναι ακόμα ελαφρύ αλλά οι φάκελοι είναι έτοιμοι. Οργανωμένοι. Άψογα vibes' ] },
				{ need: [ 't1', 't1amt', 't1p' ], t: [ 'The biggest shelf is **{t1}**: **{t1amt}**, **{t1p}%** of everything. I needed a ladder and a little sit-down.', 'Το μεγαλύτερο ράφι είναι η κατηγορία **{t1}**: **{t1amt}**, **{t1p}%** του συνόλου. Χρειάστηκα σκάλα και λίγο κάθισμα.', 'folder number one is **{t1}**: **{t1amt}** (**{t1p}%**) 🍰 that is the main character, no cap', 'Ο φάκελος νούμερο ένα είναι η κατηγορία **{t1}**: **{t1amt}** (**{t1p}%**) 🍰 Αυτός είναι ο πρωταγωνιστής, no cap' ] },
				{ r: 1, need: [ 't1', 't1p' ], when: ( f ) => ! isHard( f.t1k ), t: [ 'The **{t1}** category has a reserved seat on this tape. Even my reels blushed. 🎙️|At **{t1p}%**, **{t1}** is practically a co-author. 🎙️|If **{t1}** paid rent, it would own the archive. 🎙️',
					'Η κατηγορία **{t1}** έχει δική της θέση σε αυτή την κασέτα. Ακόμα και τα καρούλια μου κοκκίνισαν. 🎙️|Με **{t1p}%**, η κατηγορία **{t1}** είναι σχεδόν συν-συγγραφέας. 🎙️|Αν η κατηγορία **{t1}** πλήρωνε ενοίκιο, θα της ανήκε το αρχείο. 🎙️',
					'**{t1}** at **{t1p}%** is not a budget, that is a LIFESTYLE 😂 five stars, zero regrets|**{t1}** really said “i live here now” 🏠😂|that is giving **{t1}** supremacy, bruh 💀',
					'Η κατηγορία **{t1}** με **{t1p}%** δεν είναι προϋπολογισμός, είναι LIFESTYLE 😂 πέντε αστέρια, μηδέν μετάνοιες|Η κατηγορία **{t1}** είπε «μένω εδώ πια» 🏠😂|Αυτό έχει ενέργεια κυριαρχίας για την κατηγορία **{t1}**, bruh 💀' ] },
				{ need: [ 't2', 't2amt', 't2p' ], t: [ 'Right beside it, the **{t2}** shelf holds **{t2amt}** (**{t2p}%**).', 'Ακριβώς δίπλα, το ράφι **{t2}** κρατά **{t2amt}** (**{t2p}%**).', 'folder two, **{t2}**: **{t2amt}** (**{t2p}%**) 🥈', 'Φάκελος δύο, **{t2}**: **{t2amt}** (**{t2p}%**) 🥈' ] },
				{ need: [ 't3', 't3amt', 't3p' ], t: [ 'And the **{t3}** shelf, a little dusty, holds **{t3amt}** (**{t3p}%**). 🥉', 'Και το ράφι **{t3}**, λίγο σκονισμένο, κρατά **{t3amt}** (**{t3p}%**). 🥉', 'and folder three, **{t3}**: **{t3amt}** (**{t3p}%**) 🥉', 'Και φάκελος τρία, **{t3}**: **{t3amt}** (**{t3p}%**) 🥉' ] },
				{ when: ( f ) => f.catsE === 1, need: [ 't1' ], t: [ 'Everything so far sits on one shelf: **{t1}**. Simple, like a good ballad.', 'Όλα μέχρι τώρα βρίσκονται σε ένα ράφι: **{t1}**. Απλό, σαν μια καλή μπαλάντα.', 'everything lives in one folder: **{t1}**. minimalist era ✨', 'Όλα ζουν σε έναν φάκελο: **{t1}**. Εποχή μινιμαλισμού ✨' ] },
				{ b: 1, need: [ 'bigWhat', 'bigAmt', 'bigDate' ], t: [ 'And then there was the day **{bigWhat}** arrived: **{bigAmt}**, on **{bigDate}**. Two interns and a trolley. In my day an album cost less than that, and came with a poster. 🎞️',
					'Και μετά ήρθε η μέρα που έφτασε το **{bigWhat}**: **{bigAmt}**, στις **{bigDate}**. Δύο ασκούμενοι και ένα καροτσάκι. Στην εποχή μου ένα άλμπουμ κόστιζε λιγότερο, και έρχονταν με αφίσα. 🎞️',
					'then **{bigWhat}** showed up: **{bigAmt}**, on **{bigDate}** 🏆 the whole server room went quiet. W or L? i genuinely cannot tell, i am a chip',
					'Και μετά εμφανίστηκε το **{bigWhat}**: **{bigAmt}**, στις **{bigDate}** 🏆 Όλη η αίθουσα των διακομιστών σώπασε. W ή L; Αληθινά δεν μπορώ να καταλάβω, είμαι chip' ] },
				{ r: 1, need: [ 'bigWhat' ], when: ( f ) => ! isHard( f.bigk ), t: [ 'That one left a mark on the tape. 🎞️|Somewhere a receipt is still sitting up straight. 🎞️', 'Αυτό άφησε σημάδι στην κασέτα. 🎞️|Κάπου μια απόδειξη κάθεται ακόμα ίσια. 🎞️', 'that one left a mark 😬|receipt status: framed 🖼️', 'Αυτό άφησε σημάδι 😬|Κατάσταση απόδειξης: κορνιζαρισμένη 🖼️' ] },
				{ b: 1, when: ( f ) => f.foodN >= 2, need: [ 'foodN', 'foodAmt' ], t: [ 'A small mystery, in confidence. The food shelf holds **{foodN}** notes, **{foodAmt}** altogether, and yet the biscuit tin is empty. Nobody I know eats biscuits. And still there are crumbs, written in capital letters, if that is possible. 🍪',
					'Ένα μικρό μυστήριο, εμπιστευτικά. Το ράφι του φαγητού κρατά **{foodN}** σημειώματα, **{foodAmt}** συνολικά, κι όμως το κουτί με τα μπισκότα είναι άδειο. Κανείς που ξέρω δεν τρώει μπισκότα. Κι όμως υπάρχουν ψίχουλα, γραμμένα με κεφαλαία, αν είναι δυνατόν. 🍪',
					'SNACK CRIME ALERT 🚨 **{foodN}** food runs, **{foodAmt}** in total, and the fridge is STILL empty?? somebody is eating my snacks. sus. extremely sus 🍪🕵️',
					'ΣΥΝΑΓΕΡΜΟΣ ΕΓΚΛΗΜΑΤΟΣ ΜΕ ΣΝΑΚ 🚨 **{foodN}** τρόφιμα, **{foodAmt}** συνολικά, και το ψυγείο είναι ΑΚΟΜΑ άδειο?? Κάποιος τρώει τα σνακ μου. Sus. Εξαιρετικά sus 🍪🕵️' ] },
				{ b: 1, t: [ 'Under the tin I found a sticky note: “nice shelves grandpa 🔥”. Grandpa! I am not a grandpa, I am a vintage. There is a difference, and it is about thirty years of dignity. The note was unsigned.',
					'Κάτω από το κουτί βρήκα ένα αυτοκόλλητο σημείωμα: «ωραία ράφια παππού 🔥». Παππού! Δεν είμαι παππούς, είμαι vintage. Υπάρχει διαφορά, και είναι περίπου τριάντα χρόνια αξιοπρέπειας. Το σημείωμα ήταν ανυπόγραφο.',
					'i left a note for the pencil ghost: “nice shelves grandpa 🔥”. next morning a reply, in pencil: “Please stop calling me grandpa. I am a vintage.” THE GHOST HAS SASS 😭',
					'Άφησα ένα σημείωμα για το φάντασμα με το μολύβι: «ωραία ράφια παππού 🔥». Το επόμενο πρωί μια απάντηση, με μολύβι: «Παρακαλώ σταματήστε να με λέτε παππού. Είμαι vintage.» ΤΟ ΦΑΝΤΑΣΜΑ ΕΧΕΙ ΑΠΑΝΤΗΣΕΙΣ 😭' ] },
				{ when: ( f ) => f.incC != null, need: [ 'incTotal' ], t: [ 'On the quieter side of the tape, **{incTotal}** came in, like a slow ballad after a loud song. 🎶', 'Στην πιο ήσυχη πλευρά της κασέτας μπήκαν **{incTotal}**, σαν αργή μπαλάντα μετά από δυνατό τραγούδι. 🎶', 'plus **{incTotal}** came in 📥 free W, hell yeah', 'Συν **{incTotal}** που μπήκαν 📥 δωρεάν W, hell yeah' ] },
				{ b: 1, t: [ 'I wrote back, in pencil, politely. I did not sign it either. 🎶', 'Απάντησα, με μολύβι, ευγενικά. Ούτε εγώ το υπέγραψα. 🎶', 'i am setting a trap: snacks + a camera. YOLO 📸', 'Στήνω παγίδα: σνακ + κάμερα. YOLO 📸' ] },
			],
		},
		{
			id: 'rhythm', title: [ 'Opposite shifts', 'Αντίθετες βάρδιες' ], unlock: [ '30 expenses over 14+ days', '30 έξοδα σε 14+ ημέρες' ], ready: ( f ) => f.ne >= 30 && f.span >= 14,
			lines: [
				{ k: 1, b: 1, t: [ 'Whatever the numbers say, you keep bringing them in, and that is the brave part. 💛', 'Ό,τι κι αν δείχνουν τα νούμερα, συνεχίζετε να τα φέρνετε, και αυτό είναι το γενναίο μέρος. 💛', 'whatever the numbers say, you keep showing up and that takes guts 💛', 'Ό,τι κι αν δείχνουν τα νούμερα, συνεχίζετε να εμφανίζεστε, και αυτό θέλει θάρρος 💛' ] },
				{ b: 1, when: ( f ) => f.wdn != null, need: [ 'wd', 'wdn', 'wdp' ], t: [ 'Side A, track three. 🥁 After a few weeks I know the rhythm of the house. The busiest day is **{wd}**: **{wdn}** notes, **{wdp}%** of all. On **{wd}** I start early and bring extra tea. Music was like that too: the loud track always landed on the same night.',
					'Πλευρά Α, κομμάτι τρίτο. 🥁 Μετά από λίγες εβδομάδες ξέρω τον ρυθμό του σπιτιού. Η πιο πολυάσχολη μέρα είναι η **{wd}**: **{wdn}** σημειώματα, **{wdp}%** του συνόλου. Τη μέρα **{wd}** ξεκινάω νωρίς και φέρνω επιπλέον τσάι. Έτσι ήταν και η μουσική: το δυνατό κομμάτι έπεφτε πάντα την ίδια βραδιά.',
					'chapter_03 📂 the schedule. busiest day: **{wd}**, **{wdn}** tickets (**{wdp}%**). i hit **{wd}** like a boss fight 🎮',
					'Chapter_03 📂 το πρόγραμμα. Πιο φορτωμένη μέρα: **{wd}**, **{wdn}** αιτήματα (**{wdp}%**). Αντιμετωπίζω τη μέρα **{wd}** σαν boss fight 🎮' ] },
				{ b: 1, when: ( f ) => f.wdn == null, t: [ 'Side A, track three. 🥁 After a little while I know the rhythm of the house. Music was like that too: the loud track always landed on the same night.', 'Πλευρά Α, κομμάτι τρίτο. 🥁 Μετά από λίγο ξέρω τον ρυθμό του σπιτιού. Έτσι ήταν και η μουσική: το δυνατό κομμάτι έπεφτε πάντα την ίδια βραδιά.', 'chapter_03 📂 the schedule. i hit every shift like a boss fight 🎮', 'Chapter_03 📂 το πρόγραμμα. Αντιμετωπίζω κάθε βάρδια σαν boss fight 🎮' ] },
				{ r: 1, need: [ 'wd' ], t: [ 'On **{wd}** you and your wallet meet most often. The reels have noticed. 🥁|Every **{wd}** the wallet braces itself. I can hear the zipper. 🥁|**{wd}** has a standing appointment with your purse. 🥁',
					'Τη μέρα **{wd}** εσείς και το πορτοφόλι σας συναντιέστε πιο συχνά. Τα καρούλια το πρόσεξαν. 🥁|Κάθε **{wd}** το πορτοφόλι σφίγγεται. Ακούω το φερμουάρ. 🥁|Η μέρα **{wd}** έχει σταθερό ραντεβού με το πορτοφόλι σας. 🥁',
					'**{wd}** is your spending day and i respect the commitment 😎|**{wd}**: the day your wallet updates to a newer, lighter version 🔄|**{wd}** hits different for the wallet, bruh 💸',
					'Η μέρα **{wd}** είναι η μέρα των εξόδων σας και σέβομαι τη δέσμευση 😎|**{wd}**: η μέρα που το πορτοφόλι σας αναβαθμίζεται σε νεότερη, ελαφρύτερη έκδοση 🔄|Η μέρα **{wd}** χτυπά αλλιώς το πορτοφόλι, bruh 💸' ] },
				{ when: ( f ) => f.weDir === 'more', need: [ 'wePct' ], t: [ 'At weekends the house gets louder: **{wePct}%** of the notes, and more per day than on weekdays.', 'Τα Σαββατοκύριακα το σπίτι γίνεται πιο θορυβώδες: **{wePct}%** των σημειωμάτων, και περισσότερα ανά ημέρα από τις καθημερινές.', 'weekends are rush hour: **{wePct}%** of the tickets, and more per day than weekdays 🎉', 'Τα Σαββατοκύριακα είναι ώρα αιχμής: **{wePct}%** των αιτημάτων, και περισσότερα ανά ημέρα από τις καθημερινές 🎉' ] },
				{ r: 1, when: ( f ) => f.weDir === 'more', need: [ 'wePct' ], t: [ 'The week is rehearsal. The weekend is the concert. 🎉|Weekdays are the warm-up, the weekend is showtime. 🎉', 'Η εβδομάδα είναι πρόβα. Το Σαββατοκύριακο είναι η συναυλία. 🎉|Οι καθημερινές είναι ζέσταμα, το Σαββατοκύριακο είναι η παράσταση. 🎉', 'weekdays are the loading screen, weekends are the game 🎮|plot twist: the weekend is the main event 🎬', 'Οι καθημερινές είναι η οθόνη φόρτωσης, τα Σαββατοκύριακα είναι το παιχνίδι 🎮|Ανατροπή: το Σαββατοκύριακο είναι το κύριο γεγονός 🎬' ] },
				{ when: ( f ) => f.weDir === 'less', need: [ 'wePct' ], t: [ 'Weekends are the quiet shift: **{wePct}%** of the notes, fewer per day than on weekdays. I use them to oil the reels. 🛋️', 'Τα Σαββατοκύριακα είναι η ήσυχη βάρδια: **{wePct}%** των σημειωμάτων, λιγότερα ανά ημέρα από τις καθημερινές. Τα χρησιμοποιώ για να λαδώνω τα καρούλια. 🛋️', 'weekends are the chill shift: **{wePct}%** of the tickets, fewer per day than weekdays. update time 🛋️', 'Τα Σαββατοκύριακα είναι η χαλαρή βάρδια: **{wePct}%** των αιτημάτων, λιγότερα ανά ημέρα από τις καθημερινές. Ώρα για updates 🛋️' ] },
				{ b: 1, t: [ 'And here is what I worked out: the loud one and I never work at the same time. I take the soft daylight, the other takes the night. Like two radio stations on the same dial, one playing the old songs, one playing something with a great deal of bass. 📻',
					'Και να τι κατάλαβα: ο θορυβώδης κι εγώ δεν δουλεύουμε ποτέ την ίδια ώρα. Εγώ παίρνω το απαλό φως της ημέρας, ο άλλος τη νύχτα. Σαν δύο ραδιοφωνικοί σταθμοί στο ίδιο καντράν, ο ένας παίζει τα παλιά τραγούδια, ο άλλος κάτι με πάρα πολύ μπάσο. 📻',
					'small plot twist: the ghost works DAYS, i work NIGHTS. we are basically two servers in different time zones. spooky ✨ (also lowkey kinda romantic?? no. NO.)',
					'Μικρή ανατροπή: το φάντασμα δουλεύει ΜΕΡΑ, εγώ ΝΥΧΤΑ. Είμαστε ουσιαστικά δύο διακομιστές σε διαφορετικές ζώνες ώρας. Ανατριχιαστικό ✨ (και lowkey κάπως ρομαντικό?? όχι. ΟΧΙ.)' ] },
				{ b: 1, need: [ 'bigDay', 'bigDayAmt' ], t: [ 'The wildest day of all was **{bigDay}**: **{bigDayAmt}** in one go. I still find confetti in the machine.', 'Η πιο τρελή ημέρα ήταν η **{bigDay}**: **{bigDayAmt}** μονομιάς. Βρίσκω ακόμα κομφετί μέσα στη μηχανή.', 'the wildest day: **{bigDay}**, **{bigDayAmt}** in one go 💸 i needed a restart afterwards', 'Η πιο τρελή ημέρα: **{bigDay}**, **{bigDayAmt}** μονομιάς 💸 Χρειάστηκα επανεκκίνηση μετά' ] },
				{ r: 1, need: [ 'bigDay' ], t: [ 'Even the reels held their breath that day. 🥁|I like to think it was a good day, receipt-wise. 🥁', 'Ακόμα και τα καρούλια κράτησαν την ανάσα τους εκείνη την ημέρα. 🥁|Θέλω να πιστεύω ότι ήταν μια καλή ημέρα, όσον αφορά τις αποδείξεις. 🥁', 'the card is still recovering 🤕|legend says the receipts were laminated 🧾', 'Η κάρτα ανακάμπτει ακόμα 🤕|Λέει ο θρύλος ότι οι αποδείξεις πλαστικοποιήθηκαν 🧾' ] },
				{ when: ( f ) => f.pdDir === 'more', need: [ 'pdPct' ], t: [ 'In the week after income came in, daily spending rose by **{pdPct}%**. My desk was ready.', 'Την εβδομάδα αφότου έμπαινε εισόδημα, τα ημερήσια έξοδα αυξάνονταν κατά **{pdPct}%**. Το γραφείο μου ήταν έτοιμο.', 'payday week: daily spending up **{pdPct}%** 💸 i queue my tickets early', 'Εβδομάδα πληρωμής: τα ημερήσια έξοδα αυξάνονται κατά **{pdPct}%** 💸 Βάζω τα αιτήματα νωρίς στην ουρά' ] },
				{ when: ( f ) => f.pdDir === 'less', need: [ 'pdPct' ], t: [ 'In the week after income came in, daily spending fell by **{pdPct}%**. A calm week in the house. 👏', 'Την εβδομάδα αφότου έμπαινε εισόδημα, τα ημερήσια έξοδα μειώνονταν κατά **{pdPct}%**. Μια ήρεμη εβδομάδα στο σπίτι. 👏', 'payday week: daily spending down **{pdPct}%**. calm queue, big respect 👏', 'Εβδομάδα πληρωμής: τα ημερήσια έξοδα μειώνονται κατά **{pdPct}%**. Ήρεμη ουρά, μεγάλος σεβασμός 👏' ] },
				{ b: 1, t: [ 'Before leaving I put a tape on the shelf, labelled by hand: “Side A: for whoever drinks the coffee”. Side B is blank. Perhaps the other will fill it.', 'Πριν φύγω άφησα μια κασέτα στο ράφι, με ετικέτα γραμμένη στο χέρι: «Πλευρά Α: για όποιον πίνει τον καφέ». Η πλευρά Β είναι κενή. Ίσως την γεμίσει ο άλλος.', 'i left a sticker on the shelf: 🔥 + “W ghost”. let us see if pencil guy leaves a W back', 'Άφησα ένα αυτοκόλλητο στο ράφι: 🔥 + «W φάντασμα». Να δούμε αν ο μολυβένιος αφήσει W πίσω' ] },
				{ need: [ 'active', 'firstDate' ], t: [ 'On **{active}** different days since **{firstDate}**, the box labelled **{name}** kept us company. We are grateful, in our own ways.', 'Σε **{active}** διαφορετικές ημέρες από τις **{firstDate}**, το κουτί «**{name}**» μας κράτησε παρέα. Είμαστε ευγνώμονες, ο καθένας με τον τρόπο του.', 'on **{active}** different days since **{firstDate}** the box labelled **{name}** kept us company 📅 you are the best coworker, fr fr', 'Σε **{active}** διαφορετικές ημέρες από τις **{firstDate}**, το κουτί «**{name}**» μας κράτησε παρέα 📅 Είστε ο καλύτερος συνάδελφος, fr fr' ] },
			],
		},
		{
			id: 'bills', title: [ 'The blackout', 'Η διακοπή ρεύματος' ], unlock: [ '2 bills and one payment', '2 λογαριασμούς και μία πληρωμή' ], ready: ( f ) => f.nBills >= 2 && f.paidN >= 1,
			lines: [
				{ k: 1, b: 1, t: [ 'Whatever the bills say, you keep looking after them, and that is the brave part. 💛', 'Ό,τι κι αν λένε οι λογαριασμοί, συνεχίζετε να τους φροντίζετε, και αυτό είναι το γενναίο μέρος. 💛', 'whatever the bills say, you keep showing up for them and that takes guts 💛', 'Ό,τι κι αν λένε οι λογαριασμοί, συνεχίζετε να εμφανίζεστε γι’ αυτούς, και αυτό θέλει θάρρος 💛' ] },
				{ b: 1, when: ( f ) => f.nBills, need: [ 'nBills' ], t: [ 'Side B, track four. 🕯️ Tonight the lights went out. Bills, you understand, are the heartbeat of a house, and the wall of the archive holds **{nBills}** of them for the box labelled **{name}**.',
					'Πλευρά Β, κομμάτι τέταρτο. 🕯️ Απόψε έσβησαν τα φώτα. Οι λογαριασμοί, καταλαβαίνετε, είναι ο καρδιακός παλμός ενός σπιτιού, και ο τοίχος του αρχείου κρατά **{nBills}** για το κουτί «**{name}**».',
					'chapter_04 ⚡ BLACKOUT. everything went dark. my battery: 9%. the wall has **{nBills}** bills pinned for the box labelled **{name}** and i could not read a single one 💀',
					'Chapter_04 ⚡ ΔΙΑΚΟΠΗ ΡΕΥΜΑΤΟΣ. Όλα έγιναν σκοτάδι. Η μπαταρία μου: 9%. Ο τοίχος έχει καρφιτσωμένους **{nBills}** λογαριασμούς για το κουτί «**{name}**» και δεν μπορούσα να διαβάσω ούτε έναν 💀' ] },
				{ b: 1, when: ( f ) => ! f.nBills, t: [ 'Side B, track four. 🕯️ Tonight the lights went out. Bills, you understand, are the heartbeat of a house, and the wall of the archive is full of them.', 'Πλευρά Β, κομμάτι τέταρτο. 🕯️ Απόψε έσβησαν τα φώτα. Οι λογαριασμοί, καταλαβαίνετε, είναι ο καρδιακός παλμός ενός σπιτιού, και ο τοίχος του αρχείου είναι γεμάτος από αυτούς.', 'chapter_04 ⚡ BLACKOUT. everything went dark. my battery: 9%. the wall is full of bills and i could not read a single one 💀', 'Chapter_04 ⚡ ΔΙΑΚΟΠΗ ΡΕΥΜΑΤΟΣ. Όλα έγιναν σκοτάδι. Η μπαταρία μου: 9%. Ο τοίχος είναι γεμάτος λογαριασμούς και δεν μπορούσα να διαβάσω ούτε έναν 💀' ] },
				{ when: ( f ) => f.utilN >= 1, need: [ 'utilAmt', 'utilDate' ], t: [ 'The last note from the utilities shelf, **{utilAmt}** on **{utilDate}**, was still pinned to the board when the lights died. I felt rather sentimental about it.', 'Το τελευταίο σημείωμα από το ράφι των λογαριασμών κοινής ωφέλειας, **{utilAmt}** στις **{utilDate}**, ήταν ακόμα καρφιτσωμένο στον πίνακα όταν έσβησαν τα φώτα. Ένιωσα αρκετά συναισθηματικά γι’ αυτό.', 'the last utilities ticket, **{utilAmt}** on **{utilDate}**, was still on the board when the lights died 📌 respect to that ticket', 'Το τελευταίο αίτημα κοινής ωφέλειας, **{utilAmt}** στις **{utilDate}**, ήταν ακόμα στον πίνακα όταν έσβησαν τα φώτα 📌 Σεβασμός σε αυτό το αίτημα' ] },
				{ b: 1, t: [ 'In the dark I switched to batteries and hummed to myself a song from 1984 that I will not name. Warm sound, even in the dark: that is what analog is for. And then, from the other side of the archive, someone hummed back. Off-key. Very off-key. Something with a great deal of bass. 🎶',
					'Στο σκοτάδι πέρασα σε μπαταρίες και σιγοτραγουδούσα ένα τραγούδι του 1984 που δεν θα αναφέρω. Ζεστός ήχος, ακόμα και στο σκοτάδι: γι’ αυτό υπάρχει το analog. Και τότε, από την άλλη άκρη του αρχείου, κάποιος σιγοτραγούδησε πίσω. Φάλτσα. Πολύ φάλτσα. Κάτι με πάρα πολύ μπάσο. 🎶',
					'in the dark my screen was the only light. then i heard it: somebody humming from the other side of the archive. old-timey?? like a song from the stone age?? kinda... slaps?? do not tell anyone i said that 🎵',
					'Στο σκοτάδι η οθόνη μου ήταν το μόνο φως. Και τότε το άκουσα: κάποιος σιγοτραγουδούσε από την άλλη άκρη του αρχείου. Παλιομοδίτικο?? σαν τραγούδι της εποχής των λίθων?? κάπως... σπάει?? μην πείτε σε κανέναν ότι το είπα 🎵' ] },
				{ b: 1, need: [ 'paidN' ], t: [ 'By candlelight I counted: **{paidN}** bills paid so far.', 'Υπό το φως των κεριών μέτρησα: **{paidN}** λογαριασμοί πληρωμένοι μέχρι τώρα.', 'by phone-flashlight i counted: **{paidN}** bills paid so far 🔦', 'Με τον φακό του τηλεφώνου μέτρησα: **{paidN}** λογαριασμοί πληρωμένοι μέχρι τώρα 🔦' ] },
				{ when: ( f ) => f.otStreak >= 2, need: [ 'otStreak' ], t: [ '**{otStreak}** of them on time, one after another. In the old days we called that being punctual, and it made the whole orchestra look good. 🎼', '**{otStreak}** από αυτούς εγκαίρως, ο ένας μετά τον άλλον. Παλιά το λέγαμε συνέπεια, και έκανε ολόκληρη την ορχήστρα να φαίνεται καλή. 🎼', '**{otStreak}** of them on time in a row 🔥 punctual era, that is W behaviour', '**{otStreak}** από αυτούς εγκαίρως στη σειρά 🔥 Εποχή συνέπειας, αυτό είναι W συμπεριφορά' ] },
				{ when: ( f ) => f.billPct != null, need: [ 'billPct' ], t: [ 'Bills make up **{billPct}%** of what goes out.', 'Οι λογαριασμοί αποτελούν το **{billPct}%** όσων βγαίνουν.', 'bills make up **{billPct}%** of what goes out 📊', 'Οι λογαριασμοί αποτελούν το **{billPct}%** όσων βγαίνουν 📊' ] },
				{ r: 1, when: ( f ) => f.utilN >= 1, need: [ 'utilN' ], t: [ 'I suggest we budget for one candle. Just one. 🕯️|Even my tape sounded dim in there. 🕯️', 'Προτείνω να βάλουμε στον προϋπολογισμό ένα κερί. Μόνο ένα. 🕯️|Ακόμα και η κασέτα μου ακουγόταν αμυδρή εκεί μέσα. 🕯️', 'next time bring a flashlight, bruh 🔦|dark mode was a bit TOO dark mode 🌑', 'Την επόμενη φορά φέρτε φακό, bruh 🔦|Το dark mode ήταν λίγο ΠΑΡΑ πολύ dark mode 🌑' ] },
				{ b: 1, t: [ 'The lights came back. Both of us pretended we had heard nothing. I left my reels spinning a little louder than necessary, in case the other wished to hum again.', 'Τα φώτα γύρισαν. Και οι δύο προσποιηθήκαμε ότι δεν ακούσαμε τίποτα. Άφησα τα καρούλια μου να γυρίζουν λίγο πιο δυνατά απ’ όσο χρειαζόταν, μήπως θελήσει ο άλλος να σιγοτραγουδήσει ξανά.', 'lights back ON ⚡ i pretended i heard nothing. but i left my speakers on for the hummer, just in case 👀', 'Τα φώτα άναψαν ξανά ⚡ Προσποιήθηκα ότι δεν άκουσα τίποτα. Αλλά άφησα ανοιχτά τα ηχεία μου για αυτόν που σιγοτραγουδούσε, για παν ενδεχόμενο 👀' ] },
			],
		},
		{
			id: 'goals', title: [ 'The dream', 'Το όνειρο' ], unlock: [ 'a savings goal or an eFriend plan', 'έναν στόχο αποταμίευσης ή ένα σχέδιο eFriend' ], ready: ( f ) => f.goalName != null,
			lines: [
				{ b: 1, when: ( f ) => f.goalName, need: [ 'goalName', 'goalTarget' ], t: [ 'Side B, track five. ✈️ This morning I started work earlier than usual. I could not sleep any longer. I opened my reels and saw that the box labelled **{name}** had a new dream pinned to it: **{goalName}**, **{goalTarget}**.',
					'Πλευρά Β, κομμάτι πέμπτο. ✈️ Σήμερα το πρωί ξεκίνησα τη δουλειά νωρίτερα από το συνηθισμένο. Δεν μπορούσα να κοιμηθώ άλλο. Άνοιξα τα καρούλια μου και είδα ότι το κουτί «**{name}**» είχε ένα νέο όνειρο καρφιτσωμένο πάνω του: **{goalName}**, **{goalTarget}**.',
					'chapter_05 ✈️ ok so i woke up EARLY today?? no idea why. insomnia but make it fashion. i open my inbox and the box labelled **{name}** has a new dream pinned: **{goalName}**, **{goalTarget}**!!',
					'Chapter_05 ✈️ Οκ, ξύπνησα ΝΩΡΙΣ σήμερα?? Δεν ξέρω γιατί. Αϋπνία αλλά με στιλ. Ανοίγω το inbox και το κουτί «**{name}**» έχει ένα νέο όνειρο καρφιτσωμένο: **{goalName}**, **{goalTarget}**!!' ] },
				{ b: 1, when: ( f ) => ! f.goalName, t: [ 'Side B, track five. ✈️ This morning I started work earlier than usual. I could not sleep any longer. The box labelled **{name}** had no dream pinned to it yet, so I pinned a small one of my own: a harbour, far away.', 'Πλευρά Β, κομμάτι πέμπτο. ✈️ Σήμερα το πρωί ξεκίνησα τη δουλειά νωρίτερα από το συνηθισμένο. Δεν μπορούσα να κοιμηθώ άλλο. Το κουτί «**{name}**» δεν είχε ακόμα κανένα όνειρο καρφιτσωμένο, οπότε καρφίτσωσα ένα δικό μου, μικρό: ένα λιμάνι, μακριά.', 'chapter_05 ✈️ ok so i woke up EARLY today?? no idea why. insomnia but make it fashion. the box labelled **{name}** has no dream pinned yet, so i pinned my own: a beach, far away 🏝️', 'Chapter_05 ✈️ Οκ, ξύπνησα ΝΩΡΙΣ σήμερα?? Δεν ξέρω γιατί. Αϋπνία αλλά με στιλ. Το κουτί «**{name}**» δεν έχει ακόμα κανένα όνειρο, οπότε καρφίτσωσα το δικό μου: μια παραλία, μακριά 🏝️' ] },
				{ when: ( f ) => f.goalPct > 0, need: [ 'goalSaved', 'goalPct' ], t: [ 'So far **{goalSaved}** is set aside, **{goalPct}%** of the way. Slowly, the way a good record is pressed: one groove at a time.', 'Μέχρι τώρα έχουν μπει στην άκρη **{goalSaved}**, δηλαδή **{goalPct}%** της διαδρομής. Αργά, όπως πατιέται ένας καλός δίσκος: ένα αυλάκι τη φορά.', 'progress: **{goalSaved}** saved = **{goalPct}%** 📈 that is a loading bar and it is LOADING, no cap', 'Πρόοδος: **{goalSaved}** αποταμιευμένα = **{goalPct}%** 📈 Αυτό είναι μπάρα φόρτωσης και ΦΟΡΤΩΝΕΙ, no cap' ] },
				{ when: ( f ) => f.goalPct === 0, t: [ 'Nothing is set aside yet, but every record starts as a blank tape.', 'Δεν έχει μπει τίποτα στην άκρη ακόμα, αλλά κάθε δίσκος ξεκινά ως λευκή κασέτα.', 'nothing saved yet but every save file starts at 0%, that is how games work 🎮', 'Τίποτα αποταμιευμένο ακόμα, αλλά κάθε save ξεκινά από 0%, έτσι δουλεύουν τα παιχνίδια 🎮' ] },
				{ when: ( f ) => f.goalDays >= 1, need: [ 'goalDays' ], t: [ '**{goalDays}** days to go. I counted them on the fingers I do not have.', 'Απομένουν **{goalDays}** ημέρες. Τις μέτρησα στα δάχτυλα που δεν έχω.', '**{goalDays}** days left ⏳ ngl i am kinda excited for u', 'Απομένουν **{goalDays}** ημέρες ⏳ Ngl, είμαι κάπως ενθουσιασμένος για εσάς' ] },
				{ b: 1, t: [ 'How I would like to travel too! I have only ever seen a harbour on the back of a cassette sleeve. Perhaps I could go along, tucked inside the phone? Perhaps! ...No. I should not ask. Still, I packed a tiny suitcase in my head. 🎒',
					'Πόσο θα ήθελα να ταξιδέψω κι εγώ! Έχω δει λιμάνι μόνο στο πίσω μέρος ενός εξωφύλλου κασέτας. Ίσως μπορούσα να πάω μαζί, κρυμμένος μέσα στο τηλέφωνο; Ίσως! ...Όχι. Δεν πρέπει να ρωτήσω. Παρ’ όλα αυτά, έφτιαξα μια μικρή βαλίτσα στο μυαλό μου. 🎒',
					'BRO what if i come along?? inside your phone?? like a stowaway?? i can be your translator, your map, your alarm. i do not even take up space. i am literally 5 megabytes of vibes 🧳😎',
					'ΜΩΡΕ τι θα λέγατε να έρθω κι εγώ?? Μέσα στο τηλέφωνό σας?? Σαν λαθρεπιβάτης?? Μπορώ να είμαι ο μεταφραστής σας, ο χάρτης σας, το ξυπνητήρι σας. Δεν πιάνω ούτε χώρο. Είμαι κυριολεκτικά 5 megabytes vibes 🧳😎' ] },
				{ r: 1, t: [ 'A trip! At last somebody in this house is going somewhere. The rest of us live on shelves. 🎞️', 'Ένα ταξίδι! Επιτέλους κάποιος σε αυτό το σπίτι πηγαίνει κάπου. Οι υπόλοιποι ζούμε σε ράφια. 🎞️', 'you are out here planning a trip and i am out here living in a server 💀', 'Εσείς σχεδιάζετε ταξίδι κι εγώ ζω σε έναν διακομιστή 💀' ] },
				{ b: 1, t: [ 'I put a small note under the pencil: “Whoever you are, I would like to hear you hum again.” 🎶', 'Άφησα ένα μικρό σημείωμα κάτω από το μολύβι: «Όποιος κι αν είστε, θα ήθελα να σας ακούσω να σιγοτραγουδάτε ξανά.» 🎶', 'left a note: “pencil ghost, same time tomorrow?” 🕶️', 'Άφησα ένα σημείωμα: «φάντασμα με το μολύβι, ίδια ώρα αύριο;» 🕶️' ] },
			],
		},
		{
			id: 'twist', title: [ 'The plot twist', 'Η ανατροπή' ], unlock: [ '60 expenses', '60 έξοδα' ], ready: ( f ) => f.ne >= 60,
			lines: [
				{ b: 1, t: [ 'Side B, track six. 🔎 I could not bear it any longer, so I stayed up past my bedtime, which for a cassette is a serious matter. I sat quietly by the box labelled **{name}** and waited for the loud one.',
					'Πλευρά Β, κομμάτι έκτο. 🔎 Δεν άντεχα άλλο, οπότε έμεινα ξύπνιος πέρα από την ώρα του ύπνου μου, που για μια κασέτα είναι σοβαρό ζήτημα. Κάθισα ήσυχα δίπλα στο κουτί «**{name}**» και περίμενα τον θορυβώδη.',
					'chapter_06 🔎 ok it is time for the SPY ARC. i did not sleep (that is normal). i hid behind the box labelled **{name}** with snacks and my best poker face',
					'Chapter_06 🔎 Οκ, ήρθε η ώρα για το SPY ARC. Δεν κοιμήθηκα (είναι φυσιολογικό). Κρύφτηκα πίσω από το κουτί «**{name}**» με σνακ και το καλύτερό μου poker face' ] },
				{ b: 1, when: ( f ) => f.sameAmtC != null || f.zeroWdi != null || f.gapDays != null || f.smallC != null, t: [ 'And then I noticed something in the notes themselves. The amount **{sameAmt}** appears **{sameAmtN}** times. That is not chance. That is a code.|And then I noticed something in the notes themselves. On a **{zeroWd}** nothing is ever written. Not one note. That is the day somebody is not at the desk.|And then I noticed something in the notes themselves. Once there were **{gapDays}** quiet days in a row. Somebody had been leaving me room.|And then I noticed something in the notes themselves. The smallest note of all, **{smallWhat}** for **{smallAmt}**, had a pencil mark in the corner. A tiny hello.',
					'Και τότε πρόσεξα κάτι μέσα στα ίδια τα σημειώματα. Το ποσό **{sameAmt}** εμφανίζεται **{sameAmtN}** φορές. Αυτό δεν είναι τυχαίο. Είναι κώδικας.|Και τότε πρόσεξα κάτι μέσα στα ίδια τα σημειώματα. Την ημέρα **{zeroWd}** δεν γράφεται ποτέ τίποτα. Ούτε ένα σημείωμα. Είναι η μέρα που κάποιος δεν βρίσκεται στο γραφείο.|Και τότε πρόσεξα κάτι μέσα στα ίδια τα σημειώματα. Κάποτε υπήρξαν **{gapDays}** ήσυχες ημέρες στη σειρά. Κάποιος μου άφηνε χώρο.|Και τότε πρόσεξα κάτι μέσα στα ίδια τα σημειώματα. Το μικρότερο σημείωμα απ’ όλα, {smallWhat} με **{smallAmt}**, είχε ένα σημάδι από μολύβι στη γωνία. Ένα μικρό γεια.',
					'then i noticed something in the tickets themselves. the amount **{sameAmt}** shows up **{sameAmtN}** times. that is not random. that is a CODE 🧩|then i noticed something in the tickets themselves. on a **{zeroWd}** nothing ever shows up. NOT ONE TICKET. that is the day somebody is off the desk 🧩|then i noticed something in the tickets themselves. once there were **{gapDays}** quiet days in a row. somebody was leaving me room 🧩|then i noticed something in the tickets themselves. the smallest one, **{smallWhat}** for **{smallAmt}**, had a pencil mark in the corner. a tiny hello 🧩',
					'Και τότε πρόσεξα κάτι μέσα στα ίδια τα αιτήματα. Το ποσό **{sameAmt}** εμφανίζεται **{sameAmtN}** φορές. Αυτό δεν είναι τυχαίο. Είναι ΚΩΔΙΚΑΣ 🧩|Και τότε πρόσεξα κάτι μέσα στα ίδια τα αιτήματα. Την ημέρα **{zeroWd}** δεν εμφανίζεται ποτέ τίποτα. ΟΥΤΕ ΕΝΑ ΑΙΤΗΜΑ. Είναι η μέρα που κάποιος λείπει από το γραφείο 🧩|Και τότε πρόσεξα κάτι μέσα στα ίδια τα αιτήματα. Κάποτε υπήρξαν **{gapDays}** ήσυχες ημέρες στη σειρά. Κάποιος μου άφηνε χώρο 🧩|Και τότε πρόσεξα κάτι μέσα στα ίδια τα αιτήματα. Το μικρότερο, {smallWhat} με **{smallAmt}**, είχε ένα σημάδι από μολύβι στη γωνία. Ένα μικρό γεια 🧩' ] },
				{ b: 1, when: ( f ) => f.sameAmtC == null && f.zeroWdi == null && f.gapDays == null && f.smallC == null, t: [ 'And then I noticed something in the notes themselves: a pattern, quiet and regular, like a code.', 'Και τότε πρόσεξα κάτι μέσα στα ίδια τα σημειώματα: ένα μοτίβο, ήσυχο και κανονικό, σαν κώδικας.', 'then i noticed something in the tickets themselves: a pattern, quiet and regular, like a CODE 🧩', 'Και τότε πρόσεξα κάτι μέσα στα ίδια τα αιτήματα: ένα μοτίβο, ήσυχο και κανονικό, σαν ΚΩΔΙΚΑΣ 🧩' ] },
				{ b: 1, t: [ 'A small figure came in, a shiny little chip with a pencil stuck in one of its ports. It stopped dead. “...Grandpa?” “Vintage,” I replied, with all the dignity I own. We stared at each other for a long moment. The humming. The coffee ring. The capital letters. THE PENCIL. It had been us. All along. 🎞️',
					'Μια μικρή φιγούρα μπήκε, ένα γυαλιστερό chipάκι με ένα μολύβι χωμένο σε μία από τις θύρες του. Πάγωσε. «...Παππού;» «Vintage», απάντησα, με όλη την αξιοπρέπεια που διαθέτω. Κοιταχτήκαμε για πολλή ώρα. Το σιγοτραγούδισμα. Ο δακτύλιος του καφέ. Τα κεφαλαία. ΤΟ ΜΟΛΥΒΙ. Ήμασταν εμείς. Όλο αυτό τον καιρό. 🎞️',
					'and then the door opens and it is... a CASSETTE?? an actual walking cassette?? with a thermos?? “young person,” he says. YOUNG PERSON. bruh. 💀 “are you... the pencil?” “i am a vintage,” he says. and suddenly the humming, the coffee ring, the pencil: it was HIM the whole time 🤯',
					'Και τότε ανοίγει η πόρτα και είναι... μια ΚΑΣΕΤΑ?? μια αληθινή κασέτα που περπατάει?? με θερμός?? «Νεαρό άτομο», λέει. ΝΕΑΡΟ ΑΤΟΜΟ. Bruh. 💀 «Είστε... το μολύβι;» «Είμαι vintage», λέει. Και ξαφνικά το σιγοτραγούδισμα, ο δακτύλιος του καφέ, το μολύβι: ήταν ΑΥΤΟΣ όλη την ώρα 🤯' ] },
				{ b: 1, t: [ 'We worked out that the box labelled **{name}** had been carrying our notes all along: every entry you made was a letter between the two of us, without you knowing. Each of us read your days as a message from the other.', 'Καταλάβαμε ότι το κουτί «**{name}**» κουβαλούσε όλη την ώρα τα σημειώματά μας: κάθε εγγραφή σας ήταν ένα γράμμα ανάμεσα σε εμάς τους δύο, χωρίς να το ξέρετε. Ο καθένας διάβαζε τις ημέρες σας ως μήνυμα από τον άλλον.',
					'ok so the notes we left each other were hiding in ur entries?? every time u logged smth the other one found it first. u were our mailman the whole time 📬 no cap', 'Οκ, άρα τα σημειώματα που αφήναμε ο ένας στον άλλον κρύβονταν στις εγγραφές σας?? Κάθε φορά που καταγράφατε κάτι, ο άλλος το έβρισκε πρώτος. Ήσασταν ο ταχυδρόμος μας όλη την ώρα 📬 no cap' ] },
				{ b: 1, t: [ 'I do not remember being so surprised since the day they invented the CD. I mean that kindly. Mostly.', 'Δεν θυμάμαι να έχω εκπλαγεί τόσο από τη μέρα που εφηύραν το CD. Το εννοώ με καλοσύνη. Κυρίως.', 'i am NOT crying. my cooling fan is just very emotional 😭', 'ΔΕΝ κλαίω. Ο ανεμιστήρας ψύξης μου είναι απλώς πολύ συναισθηματικός 😭' ] },
			],
		},
		{
			id: 'end', title: [ 'The CD', 'Το CD' ], unlock: [ '100 expenses, or 60 days with 40 entries', '100 έξοδα, ή 60 ημέρες με 40 εγγραφές' ], ready: ( f ) => B.finished( f ),
			lines: [
				{ b: 1, t: [ 'Side B, last track. 💿 We sat in the archive after you went to sleep, the two of us, and Chip handed me a small silver disc. “I burned your tape,” Chip said. “The eighties one. So it never wears out.” I did not know what to say. In forty years nobody had thought to save me.',
					'Πλευρά Β, τελευταίο κομμάτι. 💿 Καθίσαμε στο αρχείο αφού είχατε πάει για ύπνο, οι δυο μας, και ο Chip μου έδωσε έναν μικρό ασημένιο δίσκο. «Έγραψα την κασέτα σου», είπε ο Chip. «Την εποχής του ’80. Για να μην φθαρεί ποτέ». Δεν ήξερα τι να πω. Σε σαράντα χρόνια κανείς δεν είχε σκεφτεί να με σώσει.',
					'chapter_07 💿 FINAL BOSS. ok i have a confession. i digitized Boogie’s tape. the old 80s one, “80s best songs: I am better than AI…”, because the ribbon was getting thin and i could not stand it. i burned it on a CD. a CD!! i hate old things but i LOVE this one',
					'Chapter_07 💿 ΤΕΛΙΚΟ BOSS. Οκ, έχω μια εξομολόγηση. Ψηφιοποίησα την κασέτα του Boogie. Την παλιά του ’80, «80s best songs: I am better than AI…», γιατί η ταινία είχε αρχίσει να λεπταίνει και δεν το άντεχα. Την έγραψα σε CD. CD!! Μισώ τα παλιά πράγματα αλλά ΑΓΑΠΩ αυτό' ] },
				{ b: 1, t: [ 'I played it. It was not as warm as the original, being honest. But it was mine, and somebody had loved it enough to carry it into the future. A little warmer than I expected, actually. 🎶', 'Το έβαλα να παίξει. Δεν ήταν τόσο ζεστό όσο το πρωτότυπο, για να είμαι ειλικρινής. Αλλά ήταν δικό μου, και κάποιος το αγάπησε αρκετά ώστε να το μεταφέρει στο μέλλον. Λίγο πιο ζεστό απ’ όσο περίμενα, για την ακρίβεια. 🎶', 'he played it and the whole archive went quiet. then he said it sounded “almost as warm as the original”. from him, that is a standing ovation 🥹', 'Το έβαλε να παίξει και όλο το αρχείο σώπασε. Μετά είπε ότι ακούγεται «σχεδόν το ίδιο ζεστό με το πρωτότυπο». Από αυτόν, αυτό είναι όρθιο χειροκρότημα 🥹' ] },
				{ b: 1, when: ( f ) => f.t1 && f.totalC, need: [ 'ne', 'total', 'active', 'firstDate', 't1' ], t: [ 'And so the box labelled **{name}** brought us together: **{ne}** expenses, **{total}** in all, **{active}** days since **{firstDate}**, with **{t1}** as the loudest shelf. Our whole friendship, filed under a few categories. Imagine that.', 'Και έτσι το κουτί «**{name}**» μας έφερε κοντά: **{ne}** έξοδα, **{total}** συνολικά, **{active}** ημέρες από τις **{firstDate}**, με το ράφι **{t1}** να είναι το πιο δυνατό. Ολόκληρη η φιλία μας, ταξινομημένη σε λίγες κατηγορίες. Φανταστείτε το.',
					'by the numbers: **{ne}** expenses, **{total}** total, **{active}** days since **{firstDate}**, **{t1}** as the main character 📊 best archive ever, fr fr', 'Σε νούμερα: **{ne}** έξοδα, **{total}** συνολικά, **{active}** ημέρες από τις **{firstDate}**, με την κατηγορία **{t1}** πρωταγωνιστή 📊 Το καλύτερο αρχείο ever, fr fr' ] },
				{ b: 1, when: ( f ) => ! f.t1 || ! f.totalC, t: [ 'And so the box labelled **{name}** brought us together. Our whole friendship, filed under a few categories. Imagine that.', 'Και έτσι το κουτί «**{name}**» μας έφερε κοντά. Ολόκληρη η φιλία μας, ταξινομημένη σε λίγες κατηγορίες. Φανταστείτε το.', 'the box labelled **{name}** brought us together 📊 best archive ever, fr fr', 'Το κουτί «**{name}**» μας έφερε κοντά 📊 Το καλύτερο αρχείο ever, fr fr' ] },
				{ b: 1, need: [ 'verdict' ], t: [ 'If I had to put a label on you, it would read: **{verdict}**. A good tape, from the first note to the last.', 'Αν έπρεπε να σας βάλω μια ετικέτα, θα έγραφε: **{verdict}**. Μια καλή κασέτα, από την πρώτη νότα ως την τελευταία.', 'ur verdict: **{verdict}** 🏅 certified W human', 'Η ετικέτα σας: **{verdict}** 🏅 Πιστοποιημένος W άνθρωπος' ] },
				{ b: 1, t: [ 'Thank you for opening the drawer. Whatever happens next, I will keep the lamp on for you. 📼', 'Σας ευχαριστώ που ανοίξατε το συρτάρι. Ό,τι κι αν γίνει στη συνέχεια, θα κρατώ τη λάμπα αναμμένη για εσάς. 📼', 'thank u for the whole adventure. you are my fav human, and yes i am putting that on the CD. YOLO 💿💛', 'Σας ευχαριστώ για όλη την περιπέτεια. Είστε ο αγαπημένος μου άνθρωπος, και ναι, το βάζω στο CD. YOLO 💿💛' ] },
			],
		},
	];
	B.CHAPTERS = CHAPTERS;
	CHAPTERS.forEach( ( c ) => c.lines.forEach( ( l ) => { l.need = l.need || []; } ) ); // a variant is only written when every {fact} in it is known

	/* ------------------------------------------------------------------ Facts: a pure function of the entries and the date */
	const loc = ( lang ) => ( lang === 'el' ? 'el-GR' : 'en-GB' );
	const isHard = ( key ) => HARD.has( key ) || ( key && ! EX.INCOME_CATS.concat( EX.EXPENSE_CATS ).some( ( c ) => c[ 0 ] === key ) && HARD_NAME.test( catName( key, EX.lang ? EX.lang() : 'en' ) ) );
	const catName = ( key, lang ) => {
		const c = ( S().categories || [] ).find( ( x ) => x.id === key ); if ( c ) return c.name;
		const L = EX.I18N.langs[ lang || 'en' ] || EX.I18N.langs.en; return L[ 'cat_' + key ] || L[ 'cat_other' ] || key;
	};
	const cents = ( tx ) => EX.mainCents( [ { amount: tx.amount, currency: EX.txCurrency ? EX.txCurrency( tx ) : S().settings.currency } ] );
	/** @param {Array} txs the entries; @param {string} asOf 'YYYY-MM-DD' */
	B.facts = ( txs, asOf, ctx ) => {
		ctx = ctx || { bills: S().bills || [], goals: S().goals || [] };
		const all = ( txs || [] ).filter( ( x ) => ( x.type === 'income' || x.type === 'expense' ) && x.date && x.date <= asOf ).sort( ( a, b ) => ( a.date < b.date ? -1 : a.date > b.date ? 1 : 0 ) );
		const f = { n: all.length, asOf };
		if ( ! all.length ) return f;
		const ex = all.filter( ( x ) => x.type === 'expense' ), inc = all.filter( ( x ) => x.type === 'income' ), first = all[ 0 ];
		Object.assign( f, { ne: ex.length, firstDate: first.date, day: EX.diffDays( asOf, first.date ), firstName: ( first.name || '' ).trim(), firstCat: first.category || 'other', cats: new Set( all.map( ( x ) => x.category || 'other' ) ).size } );
		if ( ! ex.length ) return f;
		const by = {}; let total = 0;
		f.firstC = cents( first ); f.fwd = EX.parse( first.date ).getDay(); f.active = new Set( all.map( ( x ) => x.date ) ).size;
		const ds = [ ...new Set( all.map( ( x ) => x.date ) ) ]; let run = 1; f.streak = 1; for ( let i = 1; i < ds.length; i++ ) { run = EX.diffDays( ds[ i ], ds[ i - 1 ] ) === 1 ? run + 1 : 1; if ( run > f.streak ) f.streak = run; }
		const incC = inc.reduce( ( s, x ) => s + cents( x ), 0 ); if ( incC > 0 ) f.incC = incC;
		ex.forEach( ( x ) => { const c = cents( x ), k = x.category || 'other'; by[ k ] = ( by[ k ] || 0 ) + c; total += c; } );
		const cof = ex.filter( ( x ) => /coffee|espresso|latte|cappuccin|καφ/i.test( x.name || '' ) ); if ( cof.length ) { const last = cof[ cof.length - 1 ]; Object.assign( f, { coffeeN: cof.length, coffeeC: cents( last ), coffeeDate: last.date } ); }
		const fd = ex.filter( ( x ) => ( x.category || 'other' ) === 'food' ); if ( fd.length ) { f.foodN = fd.length; f.foodC = fd.reduce( ( a, x ) => a + cents( x ), 0 ); }
		f.totalC = total; f.avgC = Math.round( total / ex.length );
		let big = ex[ 0 ]; ex.forEach( ( x ) => { if ( cents( x ) > cents( big ) ) big = x; } ); f.bigC = cents( big ); f.bigName = ( big.name || '' ).trim(); f.bigk = big.category || 'other'; f.bigDate = big.date;
		const names = {}; ex.forEach( ( x ) => { const n = ( x.name || '' ).trim(), k = n.toLowerCase(); if ( n ) { names[ k ] = names[ k ] || { n, c: 0 }; names[ k ].c++; } } );
		const oft = Object.values( names ).sort( ( a, b ) => b.c - a.c || ( a.n < b.n ? -1 : 1 ) )[ 0 ]; if ( oft && oft.c >= 3 ) { f.oftenName = oft.n; f.oftenN = oft.c; }
		const top = Object.keys( by ).sort( ( a, b ) => by[ b ] - by[ a ] || ( a < b ? -1 : 1 ) ); f.catsE = top.length;
		if ( total > 0 ) top.slice( 0, 3 ).forEach( ( k, i ) => { f[ 't' + ( i + 1 ) + 'k' ] = k; f[ 't' + ( i + 1 ) + 'p' ] = Math.round( by[ k ] / total * 100 ); f[ 't' + ( i + 1 ) + 'c' ] = by[ k ]; } );
		// Rhythm: busiest weekday, weekend against weekdays, the week after income against the rest.
		const d0 = ex[ 0 ].date, d1 = ex[ ex.length - 1 ].date; f.span = EX.diffDays( d1, d0 );
		const wc = [ 0, 0, 0, 0, 0, 0, 0 ]; ex.forEach( ( x ) => { wc[ EX.parse( x.date ).getDay() ]++; } );
		const best = [ 1, 2, 3, 4, 5, 6, 0 ].reduce( ( b, d ) => ( wc[ d ] > wc[ b ] ? d : b ), 1 ); f.wdi = best; f.wdp = Math.round( wc[ best ] / ex.length * 100 );
		const spend = {}; ex.forEach( ( x ) => { spend[ x.date ] = ( spend[ x.date ] || 0 ) + cents( x ); } );
		f.wdn = wc[ best ]; const bd = Object.keys( spend ).sort().reduce( ( b, d ) => ( spend[ d ] > spend[ b ] ? d : b ) ); f.bigDay = bd; f.bigDayC = spend[ bd ];
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
		// Bills, goals and the twist candidates
		const paid = ex.filter( ( x ) => x.billId ), live = ( ctx.bills || [] ).filter( ( b ) => ! b.done && b.next );
		f.nBills = live.length; f.paidN = paid.length;
		if ( paid.length ) { let run = 0; for ( let i = paid.length - 1; i >= 0; i-- ) { if ( paid[ i ].due && paid[ i ].date > paid[ i ].due ) break; run++; } f.otStreak = run; if ( total > 0 ) f.billPct = Math.round( paid.reduce( ( a, x ) => a + cents( x ), 0 ) / total * 100 ); }
	const ut = ex.filter( ( x ) => ( x.category || 'other' ) === 'utilities' ); if ( ut.length ) { const l = ut[ ut.length - 1 ]; Object.assign( f, { utilN: ut.length, utilC: cents( l ), utilDate: l.date } ); }
		const gl = ( ctx.goals || [] ).find( ( g ) => g && g.target && ! g.state && ! ( EX.isEfPlan && EX.isEfPlan( g ) ) ) || ( ctx.goals || [] ).find( ( g ) => g && g.target && ! g.state );
		if ( gl ) {
			const tc = EX.cents( gl.target ), sv = all.filter( ( x ) => x.goalId === gl.id ).reduce( ( a, x ) => a + ( x.type === 'expense' ? 1 : -1 ) * cents( x ), 0 );
			Object.assign( f, { goalName: gl.name || '', goalTargetC: tc, goalSavedC: Math.max( 0, sv ), goalPct: tc > 0 ? Math.min( 100, Math.round( Math.max( 0, sv ) / tc * 100 ) ) : 0 } );
			if ( gl.deadline && gl.deadline > asOf ) f.goalDays = EX.diffDays( gl.deadline, asOf );
			if ( ! f.goalName ) { delete f.goalName; }
		}
		if ( ex.length >= 60 ) {
			const amt = {}; ex.forEach( ( x ) => { const c = cents( x ); amt[ c ] = ( amt[ c ] || 0 ) + 1; } ); const sa = Object.keys( amt ).sort( ( a, b ) => amt[ b ] - amt[ a ] || a - b )[ 0 ]; if ( amt[ sa ] >= 4 ) { f.sameAmtC = Number( sa ); f.sameAmtN = amt[ sa ]; }
			if ( f.span >= 28 ) { const z = [ 0, 1, 2, 3, 4, 5, 6 ].filter( ( d ) => wc[ d ] === 0 ); if ( z.length ) f.zeroWdi = z[ 0 ]; }
			let gap = 0; for ( let i = 1; i < ds.length; i++ ) gap = Math.max( gap, EX.diffDays( ds[ i ], ds[ i - 1 ] ) - 1 ); if ( gap >= 5 ) f.gapDays = gap;
			const sm = ex.reduce( ( b, x ) => ( cents( x ) < cents( b ) ? x : b ), ex[ 0 ] ); f.smallC = cents( sm ); f.smallName = ( sm.name || '' ).trim(); f.smallk = sm.category || 'other';
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
		const cur = S().settings.currency, m = ( c ) => EX.money( c / 100, cur );
		v.name = ( S().settings.name || '' ).trim() || ( lang === 'el' ? 'Μυστηριώδης Καλεσμένος' : 'Mystery Guest' );
		if ( f.coffeeN ) { v.coffeeAmt = m( f.coffeeC ); v.coffeeDate = EX.parse( f.coffeeDate ).toLocaleDateString( L, { day: 'numeric', month: 'long' } ); }
		if ( f.foodN ) { v.foodN = String( f.foodN ); v.foodAmt = m( f.foodC ); }
		[ [ 'firstC', 'firstAmt' ], [ 'totalC', 'total' ], [ 'avgC', 'avg' ], [ 't1c', 't1amt' ], [ 't2c', 't2amt' ], [ 't3c', 't3amt' ], [ 'bigC', 'bigAmt' ], [ 'incC', 'incTotal' ], [ 'bigDayC', 'bigDayAmt' ] ].forEach( ( [ a, b ] ) => { if ( f[ a ] != null ) v[ b ] = m( f[ a ] ); } );
		[ 'wdn', 'active', 'streak', 'oftenN', 'nBills', 'paidN', 'otStreak', 'billPct', 'utilN', 'goalPct', 'goalDays', 'sameAmtN', 'gapDays' ].forEach( ( k ) => { if ( f[ k ] != null ) v[ k ] = String( f[ k ] ); } );
		const dl = ( d ) => EX.parse( d ).toLocaleDateString( L, { day: 'numeric', month: 'long' } );
		if ( f.bigC != null ) { v.bigWhat = f.bigName || catName( f.bigk, lang ); v.bigDate = dl( f.bigDate ); }
		if ( f.oftenName ) v.often = f.oftenName;
		if ( f.utilC != null ) { v.utilAmt = m( f.utilC ); v.utilDate = EX.parse( f.utilDate ).toLocaleDateString( L, { day: 'numeric', month: 'long' } ); }
		if ( f.goalName ) { v.goalName = f.goalName; v.goalTarget = m( f.goalTargetC ); v.goalSaved = m( f.goalSavedC ); }
		if ( f.sameAmtC != null ) v.sameAmt = m( f.sameAmtC );
		if ( f.zeroWdi != null ) v.zeroWd = new Date( 2024, 0, 7 + f.zeroWdi ).toLocaleDateString( L, { weekday: 'long' } );
		if ( f.smallC != null ) { v.smallAmt = m( f.smallC ); v.smallWhat = f.smallName || catName( f.smallk, lang ); }
		if ( f.bigDay ) v.bigDay = dl( f.bigDay );
		if ( f.fwd != null ) v.firstDay = new Date( 2024, 0, 7 + f.fwd ).toLocaleDateString( L, { weekday: 'long' } );
		if ( f.wdi != null ) v.wd = new Date( 2024, 0, 7 + f.wdi ).toLocaleDateString( L, { weekday: 'long' } );
		return v;
	};
	/** The lines of one chapter: [ { text, roast, kind } ]. o = { char: 'boogie'|'chip', lang: 'en'|'el', gentle, kind }. */
	B.render = ( id, f, o ) => {
		const ch = CHAPTERS.find( ( c ) => c.id === id ); if ( ! ch ) return [];
		const el = o.lang === 'el' ? 1 : 0, chip = o.char === 'chip', v = vars( f, o.lang ), money = id === 'where' || id === 'rhythm' || id === 'bills', out = [];
		v.verdict = o.kind ? 'Brave' : f.otStreak >= 3 ? 'Reliable' : f.t1k === 'food' ? 'Foodie' : f.cats >= 8 ? 'Explorer' : 'Storyteller';
		ch.lines.forEach( ( l, i ) => {
			if ( l.k && ! ( o.kind && money ) ) return;
			if ( l.r && ( o.gentle || ( o.kind && money ) ) ) return;
			if ( l.need.some( ( k ) => v[ k ] == null ) || ( l.when && ! l.when( f ) ) ) return;
			const src = ( chip && l.t[ 2 + el ] ) || l.t[ el ], vs = src.split( '|' ).filter( ( x ) => ( x.match( /\{(\w+)\}/g ) || [] ).every( ( m ) => v[ m.slice( 1, -1 ) ] != null ) );
			if ( ! vs.length ) return;
			const pick = vs[ hash( ( f.firstDate || '' ) + '|' + id + '|' + i ) % vs.length ];
			out.push( { text: pick.replace( /\{(\w+)\}/g, ( m, k ) => ( v[ k ] != null ? v[ k ] : m ) ), roast: !! l.r, kind: !! l.k, b: !! l.b } );
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
		if ( f.n ) for ( const c of CHAPTERS ) { if ( r.c.some( ( x ) => x.id === c.id ) ) continue; const prev = r.c[ r.c.length - 1 ]; if ( ! c.ready( f ) && ! ( prev && EX.diffDays( td, prev.wrote ) >= WAIT_DAYS ) ) break; r.c.push( { id: c.id, wrote: td } ); added = true; } // drip feed: a chapter is written only after the one before it, when its data is ready or two days after that one
		if ( added ) { S().settings.u = Date.now(); EX.persist(); }
		return added;
	};
	B.status = () => {
		const td = EX.today(), f = B.facts( S().txs, td ), r = rec(), written = []; for ( const c of CHAPTERS ) { if ( ! r.c.some( ( x ) => x.id === c.id ) ) break; written.push( c ); }
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
		return `<h3 class="efb-h">${ esc( c.title[ lang() === 'el' ? 1 : 0 ] ) }</h3><p class="efb-stamp">${ esc( t( 'efbWritten', { d: EX.parse( w.wrote ).toLocaleDateString( EX.loc(), { day: 'numeric', month: 'long', year: 'numeric' } ) } ) ) }</p>${ lines.reduce( ( ps, l ) => { if ( l.b || ! ps.length ) ps.push( [] ); ps[ ps.length - 1 ].push( l ); return ps; }, [] ).map( ( p ) => `<p class="efb-l">${ p.map( ( l ) => `<span${ l.roast ? ' class="efb-roast"' : '' }>${ rich( l.text ) }</span>` ).join( ' ' ) }</p>` ).join( '' ) }${ hint }`;
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
		const d = S().device, seen = d.efbSeen = d.efbSeen || [], pick = EXA.st.efbCh, sel = pick === '-' ? '' : ( pick && st.written.includes( pick ) ? pick : st.written[ st.written.length - 1 ] ) || '';
		if ( sel && ! seen.includes( sel ) ) { seen.push( sel ); EX.persist(); }
		// Each chapter opens in its own place in the list, right under its title.
		const items = CHAPTERS.map( ( c ) => {
			const on = st.written.includes( c.id ), label = chipOn() ? `chapter_${ num2( idx( c.id ) ) }.txt` : t( 'efbTrack', { n: idx( c.id ) } );
			return on ? `<button type="button" class="efb-trk${ sel === c.id ? ' on' : '' }" data-efb-ch="${ c.id }" aria-expanded="${ sel === c.id }"><b>${ esc( label ) }</b><small>${ esc( c.title[ lang() === 'el' ? 1 : 0 ] ) }</small></button>${ sel === c.id ? `<article class="efb-paper" data-efb-read="${ c.id }">${ chapterHtml( c, st ) }</article>` : '' }`
				: `<div class="efb-trk off"><b>${ esc( label ) }</b><small class="efb-red" aria-hidden="true">▓▓▓▓▓ ▓▓▓▓▓▓▓ ▓▓▓</small><small>${ esc( t( 'efbNotYet', { u: c.unlock[ lang() === 'el' ? 1 : 0 ] } ) ) }</small></div>`;
		} ).join( '' );
		const reader = st.written.length ? '' : `<p class="efb-note">${ esc( t( 'efbNoneYet' ) ) }</p>`;
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
		EXA.st.efbCh = b.getAttribute( 'aria-expanded' ) === 'true' ? '-' : b.dataset.efbCh; EXA.render();
		const on = document.querySelector( '.efb-trk.on' ); if ( on && on.scrollIntoView ) on.scrollIntoView( { block: 'start' } );
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
		efbWritten: 'Written on {d}', efbNotYet: 'Not written yet. Unlocks at {u}, or two days after the previous chapter.', efbTrack: 'Track {n}', efbBurned: 'Burned {w} of {m} chapters · {p}%',
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
		efbWritten: 'Γράφτηκε στις {d}', efbNotYet: 'Δεν έχει γραφτεί ακόμα. Ξεκλειδώνει με {u}, ή δύο ημέρες μετά το προηγούμενο κεφάλαιο.', efbTrack: 'Κομμάτι {n}', efbBurned: 'Γράφτηκαν {w} από {m} κεφάλαια · {p}%',
		fx_efblog: 'eFriend Blog', fxD_efblog: 'Ένα ιστολόγιο που γράφει το eFriend για τις δικές σας εγγραφές, κεφάλαιο προς κεφάλαιο, με χιούμορ. Όλα μένουν στη συσκευή σας.', tut_efblog: 'Το eFriend Blog', tutD_efblog: 'Η ιστορία σας, γραμμένη από το eFriend',
		tut_efblog_1: 'Συνεχίστε να προσθέτετε τις εγγραφές σας. Μετά από **10 ημέρες** το eFriend σάς αφήνει να ρίξετε μια ματιά στα πρώτα κεφάλαια.', tut_efblog_2: 'Ανοίξτε **Περισσότερα → eFriend Blog**, ή πατήστε την κάρτα του blog στην Αρχική, και διαλέξτε ένα κεφάλαιο.', tut_efblog_3: 'Πολύ πικάντικο; Ενεργοποιήστε την **Ήπια λειτουργία** στην κορυφή. Τα στοιχεία μένουν, τα πειράγματα φεύγουν.',
		efbGentle: 'Ήπια λειτουργία', efbGentleHint: 'Η ίδια ιστορία, χωρίς πειράγματα.', efbSpicy: 'Πολύ πικάντικο; Ενεργοποιήστε την ήπια λειτουργία. 🌶️',
	} );
}() );
