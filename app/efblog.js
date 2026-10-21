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
			id: 'first', title: [ 'My first day on the job', 'Η πρώτη μου ημέρα στη δουλειά' ], unlock: [ '5 entries', '5 εγγραφές' ], ready: ( f ) => f.n >= 5,
			lines: [
				{ b: 1, t: [ 'Side A, track one. 📼 My first day at the studio. On **{firstDate}** ({firstDay}) the first reel landed on my desk: {firstWhat}, **{firstAmt}**. I labelled it with a trembling pencil, and the tape began to turn.|Side A, track one. 📼 Clocking in for the very first time. **{firstDate}** ({firstDay}): a courier drops a reel on my desk, marked {firstWhat}, **{firstAmt}**. Nobody told me it would be this exciting.', 'Πλευρά Α, κομμάτι πρώτο. 📼 Η πρώτη μου ημέρα στο στούντιο. Στις **{firstDate}** ({firstDay}) το πρώτο καρούλι προσγειώθηκε στο γραφείο μου: {firstWhat}, **{firstAmt}**. Το σημείωσα με τρεμάμενο μολύβι και η κασέτα άρχισε να γυρίζει.|Πλευρά Α, κομμάτι πρώτο. 📼 Χτυπάω κάρτα για πρώτη φορά. **{firstDate}** ({firstDay}): ένας κούριερ αφήνει στο γραφείο μου ένα καρούλι με την ένδειξη {firstWhat}, **{firstAmt}**. Κανείς δεν μου είπε ότι θα ήταν τόσο συναρπαστικό.', 'boot sequence complete 💿 my first day on the job! on **{firstDate}** ({firstDay}) the very first ticket popped up in my queue: {firstWhat}, **{firstAmt}**. i handled it like a pro (i panicked a little)|ping! 🛰️ day one at the new job: **{firstDate}** ({firstDay}), ticket number one arrives: {firstWhat}, **{firstAmt}**. my fans spun up instantly', 'Η εκκίνηση ολοκληρώθηκε 💿 η πρώτη μου ημέρα στη δουλειά! Στις **{firstDate}** ({firstDay}) το πρώτο αίτημα εμφανίστηκε στην ουρά μου: {firstWhat}, **{firstAmt}**. Το χειρίστηκα σαν επαγγελματίας (πανικοβλήθηκα λίγο)|Πινγκ! 🛰️ Πρώτη ημέρα στη νέα δουλειά: **{firstDate}** ({firstDay}), φτάνει το αίτημα νούμερο ένα: {firstWhat}, **{firstAmt}**. Οι ανεμιστήρες μου ξεκίνησαν αμέσως' ] },
				{ when: ( f ) => f.active >= 2, need: [ 'n', 'active', 'cats' ], t: [ 'Since then **{n}** reels have crossed my desk over **{active}** different days (shelves in use: **{cats}**).', 'Από τότε πέρασαν από το γραφείο μου **{n}** καρούλια σε **{active}** διαφορετικές ημέρες (ράφια σε χρήση: **{cats}**).', 'since then: **{n}** tickets over **{active}** different days (folders in use: **{cats}**) 📊', 'Από τότε: **{n}** αιτήματα σε **{active}** διαφορετικές ημέρες (φάκελοι σε χρήση: **{cats}**) 📊' ] },
				{ when: ( f ) => f.active === 1, need: [ 'n' ], t: [ 'All **{n}** arrived in one single day. My first shift was a marathon!', 'Και τα **{n}** έφτασαν σε μία μόνο ημέρα. Η πρώτη μου βάρδια ήταν μαραθώνιος!', 'all **{n}** tickets in one single day?! my first shift was a marathon 😄', 'Και τα **{n}** αιτήματα σε μία μόνο ημέρα?! Η πρώτη μου βάρδια ήταν μαραθώνιος 😄' ] },
				{ r: 1, need: [ 'n' ], t: [ 'That is enough material for a first track, and I have barely warmed up my reels. 🎧|Not bad for a first listen. My reels are still warming up. 🎧|A first track already. I was expecting silence and a sigh. 🎧|You came, you logged, you conquered. Mostly logged. 🎧',
					'Αρκετό υλικό για ένα πρώτο κομμάτι, και τα καρούλια μου δεν έχουν καν ζεσταθεί. 🎧|Όχι άσχημα για την πρώτη ακρόαση. Τα καρούλια μου ακόμα ζεσταίνονται. 🎧|Ήδη πρώτο κομμάτι. Περίμενα σιωπή και έναν αναστεναγμό. 🎧|Ήρθατε, καταγράψατε, νικήσατε. Κυρίως καταγράψατε. 🎧',
					'ok that is already enough for a first chapter and i have not even finished my snacks 🍕😂|not bad for day one, my fans are only just spinning up 💨|chapter one and you are already a content creator 🎬|my processor is doing a happy dance 💃 (it is a very small processor)',
					'Ήδη αρκετά για ένα πρώτο κεφάλαιο και δεν έχω καν τελειώσει τα σνακ μου 🍕😂|Όχι άσχημα για την αρχή, οι ανεμιστήρες μου μόλις άρχισαν να γυρίζουν 💨|Κεφάλαιο πρώτο και είστε ήδη δημιουργός περιεχομένου 🎬|Ο επεξεργαστής μου χορεύει από χαρά 💃 (είναι πολύ μικρός επεξεργαστής)' ] },
				{ when: ( f ) => f.cats === 1, need: [ 'cats' ], t: [ 'One category so far. A focused soul. 🎯', 'Μία κατηγορία μέχρι τώρα. Συγκεντρωμένος άνθρωπος. 🎯', 'one category so far. laser focus 🎯', 'Μία κατηγορία μέχρι τώρα. Συγκέντρωση λέιζερ 🎯' ] },
				{ when: ( f ) => f.cats >= 6, need: [ 'cats' ], t: [ 'Plenty of categories already. A true organiser. 🗂️', 'Ήδη πολλές κατηγορίες. Αληθινός οργανωτής. 🗂️', 'so many categories already. organiser mode on 🗂️', 'Τόσες κατηγορίες ήδη. Λειτουργία οργανωτή ενεργοποιημένη 🗂️' ] },
				{ b: 1, need: [ 'often', 'oftenN' ], t: [ 'One reel keeps coming back: **{often}**. **{oftenN}** deliveries, same label. I have given it its own hook on the wall. 🎙️|Regular customer alert: **{often}**, **{oftenN}** times now. I know its handwriting by heart. 🎙️', 'Ένα καρούλι γυρίζει συνέχεια: **{often}**. **{oftenN}** παραδόσεις, ίδια ετικέτα. Του έχω δώσει δικό του γάντζο στον τοίχο. 🎙️|Συναγερμός τακτικού πελάτη: **{often}**, **{oftenN}** φορές ως τώρα. Ξέρω απ’ έξω τον γραφικό του χαρακτήρα. 🎙️', 'the same ticket keeps coming back: **{often}**, **{oftenN}** times 🔁 i made it a shortcut on my desktop', 'Το ίδιο αίτημα γυρίζει συνέχεια: **{often}**, **{oftenN}** φορές 🔁 του έφτιαξα συντόμευση στην επιφάνεια εργασίας μου' ] },
				{ r: 1, need: [ 'often' ], t: [ 'I keep a spot at my desk for it, just in case. 🎙️|At this point it deserves a name tag. 🎙️', 'Του κρατάω μια θέση στο γραφείο μου, για παν ενδεχόμενο. 🎙️|Πλέον του αξίζει ταμπελάκι με το όνομά του. 🎙️', 'recurring character unlocked 🔁|honestly it deserves its own folder 📁', 'Ξεκλειδώθηκε επαναλαμβανόμενος χαρακτήρας 🔁|Ειλικρινά αξίζει δικό του φάκελο 📁' ] },
				{ b: 1, need: [ 'bigWhat', 'bigAmt', 'bigDate' ], t: [ 'The heaviest delivery so far: **{bigWhat}**, **{bigAmt}**, on **{bigDate}**. Two interns and a trolley. 🎞️|On **{bigDate}** a crate marked **{bigWhat}** arrived: **{bigAmt}**. The floor creaked. 🎞️', 'Η πιο βαριά παράδοση μέχρι τώρα: **{bigWhat}**, **{bigAmt}**, στις **{bigDate}**. Δύο ασκούμενοι και ένα καροτσάκι. 🎞️|Στις **{bigDate}** έφτασε ένα κιβώτιο με την ένδειξη **{bigWhat}**: **{bigAmt}**. Το πάτωμα έτριξε. 🎞️', 'biggest ticket so far: **{bigWhat}**, **{bigAmt}**, on **{bigDate}** 🏆 my progress bar needed a minute', 'Το μεγαλύτερο αίτημα μέχρι τώρα: **{bigWhat}**, **{bigAmt}**, στις **{bigDate}** 🏆 Η γραμμή προόδου μου χρειάστηκε ένα λεπτό' ] },
				{ r: 1, need: [ 'bigWhat' ], when: ( f ) => ! isHard( f.bigk ), t: [ 'My back felt that one. So did your wallet, I suspect. 🎞️|I signed for it with a very steady hand and a very shaky heart. 🎞️', 'Η πλάτη μου το ένιωσε. Και το πορτοφόλι σας, υποψιάζομαι. 🎞️|Υπέγραψα την παραλαβή με πολύ σταθερό χέρι και πολύ τρεμάμενη καρδιά. 🎞️', 'ouch, my cooling system felt that one 😅|big ticket energy, activated 💸', 'Πονάει... το σύστημα ψύξης μου το ένιωσε 😅|Ενέργεια μεγάλου αιτήματος, ενεργοποιημένη 💸' ] },
				{ b: 1, when: ( f ) => f.streak >= 3, need: [ 'streak' ], t: [ 'For **{streak}** days in a row the reels kept coming, and I never got to go home. Best shift of my life. 🎶', 'Για **{streak}** ημέρες στη σειρά τα καρούλια συνέχιζαν να έρχονται και δεν πήγα ποτέ σπίτι. Η καλύτερη βάρδια της ζωής μου. 🎶', '**{streak}** days in a row of non-stop tickets 🔥 i did not even take a break (my fans did)', '**{streak}** ημέρες στη σειρά με αδιάκοπα αιτήματα 🔥 Δεν έκανα ούτε διάλειμμα (οι ανεμιστήρες μου έκαναν)' ] },
				{ b: 1, t: [ 'End of day one. I switch off the lamp, but the tape stays ready for tomorrow. 🎶', 'Τέλος της πρώτης ημέρας. Σβήνω τη λάμπα, αλλά η κασέτα μένει έτοιμη για αύριο. 🎶', 'end of day one ✅ shutting down... just kidding, i never sleep. see you tomorrow!! 🚀', 'Τέλος πρώτης ημέρας ✅ Τερματισμός... πλάκα κάνω, δεν κοιμάμαι ποτέ. Τα λέμε αύριο!! 🚀' ] },
			],
		},
		{
			id: 'where', title: [ 'The big shelves', 'Τα μεγάλα ράφια' ], unlock: [ '20 expenses', '20 έξοδα' ], ready: ( f ) => f.ne >= 20,
			lines: [
				{ k: 1, b: 1, t: [ 'Whatever the numbers say, you are looking at them, and that is the brave part. 💛', 'Ό,τι κι αν δείχνουν τα νούμερα, τα κοιτάτε κατάματα, και αυτό είναι το γενναίο μέρος. 💛', 'whatever the numbers say, you are here looking at them and that takes guts 💛', 'Ό,τι κι αν δείχνουν τα νούμερα, είστε εδώ και τα κοιτάτε, και αυτό θέλει θάρρος 💛' ] },
				{ b: 1, need: [ 'ne', 'total', 'avg' ], t: [ 'Side A, track two. 🎶 Time to tidy the archive. Over **{ne}** deliveries, **{total}** passed through my hands, about **{avg}** a reel. Then I started sorting the shelves.', 'Πλευρά Α, κομμάτι δεύτερο. 🎶 Ώρα να τακτοποιήσω το αρχείο. Σε **{ne}** παραδόσεις πέρασαν από τα χέρια μου **{total}**, περίπου **{avg}** το καρούλι. Μετά άρχισα να ταξινομώ τα ράφια.', 'chapter_02: sorting day 📂 **{ne}** tickets handled, **{total}** moved in total, about **{avg}** each. time to organise my folders', 'Chapter_02: ημέρα ταξινόμησης 📂 **{ne}** αιτήματα διεκπεραιώθηκαν, **{total}** μετακινήθηκαν συνολικά, περίπου **{avg}** το καθένα. Ώρα να οργανώσω τους φακέλους μου' ] },
				{ b: 1, need: [ 't1', 't1amt', 't1p' ], t: [ 'The biggest shelf is **{t1}**: **{t1amt}**, **{t1p}%** of the whole archive. I needed a ladder.|The shelf marked **{t1}** is where I spend most of my day: **{t1amt}**, **{t1p}%** of everything. 🎶', 'Το μεγαλύτερο ράφι είναι η κατηγορία **{t1}**: **{t1amt}**, **{t1p}%** όλου του αρχείου. Χρειάστηκα σκάλα.|Το ράφι με την ένδειξη **{t1}** είναι εκεί όπου περνάω το μεγαλύτερο μέρος της ημέρας μου: **{t1amt}**, **{t1p}%** του συνόλου. 🎶', 'biggest folder: **{t1}**, **{t1amt}**, that is **{t1p}%** of everything 📂 it takes forever to scroll|folder number one is **{t1}**: **{t1amt}** (**{t1p}%**) 🍰', 'Μεγαλύτερος φάκελος: **{t1}**, **{t1amt}**, δηλαδή **{t1p}%** του συνόλου 📂 Θέλει ώρα για να τον κυλήσω|Ο φάκελος νούμερο ένα είναι η κατηγορία **{t1}**: **{t1amt}** (**{t1p}%**) 🍰' ] },
				{ r: 1, need: [ 't1', 't1p' ], when: ( f ) => ! isHard( f.t1k ), t: [ 'The **{t1}** category has a reserved seat on this tape. Even my reels blushed. 🎙️|At **{t1p}%**, **{t1}** is practically a co-author of this tape. 🎙️|**{t1}** again and again. The needle knows the way by heart now. 🎙️|If **{t1}** paid rent, it would own this tape. 🎙️',
					'Η κατηγορία **{t1}** έχει δική της θέση σε αυτή την κασέτα. Ακόμα και τα καρούλια μου κοκκίνισαν. 🎙️|Με **{t1p}%**, η κατηγορία **{t1}** είναι σχεδόν συν-συγγραφέας αυτής της κασέτας. 🎙️|Η κατηγορία **{t1}** ξανά και ξανά. Η βελόνα ξέρει πια τον δρόμο απ’ έξω. 🎙️|Αν η κατηγορία **{t1}** πλήρωνε ενοίκιο, θα της ανήκε αυτή η κασέτα. 🎙️',
					'**{t1}** at **{t1p}%** is not a budget, that is a lifestyle 😂 five stars, zero regrets|**{t1}** is basically your main character 🎬 i respect it|**{t1}** really said i live here now 🏠😂|the **{t1}** budget called, it wants a vacation 📞',
					'**{t1}** με **{t1p}%** δεν είναι προϋπολογισμός, είναι τρόπος ζωής 😂 πέντε αστέρια, μηδέν μετάνοιες|Η κατηγορία **{t1}** είναι ουσιαστικά ο πρωταγωνιστής σας 🎬 Το σέβομαι|Η κατηγορία **{t1}** είπε «μένω εδώ πια» 🏠😂|Ο προϋπολογισμός για **{t1}** τηλεφώνησε, θέλει διακοπές 📞' ] },
				{ when: ( f ) => f.t1p >= 50, need: [ 't1', 't1p' ], t: [ 'More than half of your spending lands in one category: **{t1}**.', 'Πάνω από τα μισά έξοδά σας πηγαίνουν σε μία κατηγορία: **{t1}**.', 'over half of your spending lands in one category: **{t1}** 🎯', 'Πάνω από τα μισά έξοδά σας πηγαίνουν σε μία κατηγορία: **{t1}** 🎯' ] },
				{ r: 1, need: [ 't1p' ], when: ( f ) => f.t1p >= 50 && ! isHard( f.t1k ), t: [ 'More than half in a single category. That is not spending, that is devotion. 🎙️|Half the tape for one category. A bold production choice. 🎙️', 'Πάνω από τα μισά σε μία κατηγορία. Δεν είναι έξοδα, είναι αφοσίωση. 🎙️|Η μισή κασέτα για μία κατηγορία. Τολμηρή επιλογή παραγωγής. 🎙️', 'over half in one category?? that is commitment 🫡|one category hogging the spotlight 🔦', 'Πάνω από τα μισά σε μία κατηγορία?? Αυτό είναι δέσμευση 🫡|Μία κατηγορία μονοπωλεί τους προβολείς 🔦' ] },
				{ need: [ 't2', 't2amt', 't2p' ], t: [ 'Right beside it, the **{t2}** shelf holds **{t2amt}** (**{t2p}%**).', 'Ακριβώς δίπλα, το ράφι **{t2}** κρατά **{t2amt}** (**{t2p}%**).', 'folder two, **{t2}**: **{t2amt}** (**{t2p}%**) 🥈', 'Φάκελος δύο, **{t2}**: **{t2amt}** (**{t2p}%**) 🥈' ] },
				{ need: [ 't3', 't3amt', 't3p' ], t: [ 'And the **{t3}** shelf, a little dusty, holds **{t3amt}** (**{t3p}%**). 🥉', 'Και το ράφι **{t3}**, λίγο σκονισμένο, κρατά **{t3amt}** (**{t3p}%**). 🥉', 'and folder three, **{t3}**: **{t3amt}** (**{t3p}%**) 🥉', 'Και φάκελος τρία, **{t3}**: **{t3amt}** (**{t3p}%**) 🥉' ] },
				{ when: ( f ) => f.catsE === 1, need: [ 't1' ], t: [ 'Everything so far sits in one category: **{t1}**. Simple, and easy to follow.', 'Όλα μέχρι τώρα ανήκουν σε μία κατηγορία: **{t1}**. Απλό και εύκολο να παρακολουθηθεί.', 'everything so far lives in one category: **{t1}**. simple and clean ✨', 'Όλα μέχρι τώρα ανήκουν σε μία κατηγορία: **{t1}**. Απλό και καθαρό ✨' ] },
				{ b: 1, need: [ 'bigWhat', 'bigAmt', 'bigDate' ], t: [ 'Then there was the day **{bigWhat}** arrived: **{bigAmt}**, on **{bigDate}**. I had to clear the whole corridor.', 'Και μετά ήρθε η μέρα που έφτασε το **{bigWhat}**: **{bigAmt}**, στις **{bigDate}**. Χρειάστηκε να αδειάσω όλον τον διάδρομο.', 'then **{bigWhat}** showed up: **{bigAmt}**, on **{bigDate}** 🏆 the whole server room went quiet', 'Και μετά εμφανίστηκε το **{bigWhat}**: **{bigAmt}**, στις **{bigDate}** 🏆 Όλη η αίθουσα των διακομιστών σώπασε' ] },
				{ r: 1, need: [ 'bigWhat' ], when: ( f ) => ! isHard( f.bigk ), t: [ 'That one left a mark on the tape. 🎞️|Somewhere a receipt is still sitting up straight. 🎞️', 'Αυτό άφησε σημάδι στην κασέτα. 🎞️|Κάπου μια απόδειξη κάθεται ακόμα ίσια. 🎞️', 'that one left a mark 😬|receipt status: framed 🖼️', 'Αυτό άφησε σημάδι 😬|Κατάσταση απόδειξης: κορνιζαρισμένη 🖼️' ] },
				{ b: 1, need: [ 'incTotal' ], t: [ 'Now and then a lighter parcel came the other way: **{incTotal}** arrived to balance the books.', 'Που και που ερχόταν και ένα ελαφρύτερο δέμα από την άλλη πλευρά: **{incTotal}** έφτασαν για να ισορροπήσουν τα βιβλία.', 'and some good deliveries came in too: **{incTotal}** arrived 📥 balance restored', 'Ήρθαν και μερικές καλές παραδόσεις: **{incTotal}** 📥 Η ισορροπία αποκαταστάθηκε' ] },
			],
		},
		{
			id: 'rhythm', title: [ 'My weekly shift', 'Η εβδομαδιαία βάρδιά μου' ], unlock: [ '30 expenses over 14+ days', '30 έξοδα σε 14+ ημέρες' ], ready: ( f ) => f.ne >= 30 && f.span >= 14,
			lines: [
				{ k: 1, b: 1, t: [ 'Whatever the numbers say, you are looking at them, and that is the brave part. 💛', 'Ό,τι κι αν δείχνουν τα νούμερα, τα κοιτάτε κατάματα, και αυτό είναι το γενναίο μέρος. 💛', 'whatever the numbers say, you are here looking at them and that takes guts 💛', 'Ό,τι κι αν δείχνουν τα νούμερα, είστε εδώ και τα κοιτάτε, και αυτό θέλει θάρρος 💛' ] },
				{ b: 1, need: [ 'wd', 'wdn', 'wdp' ], t: [ 'Side A, track three. 🥁 After a few weeks I know my shifts by heart. The busiest is **{wd}**: **{wdn}** deliveries, **{wdp}%** of all. I bring extra coffee.', 'Πλευρά Α, κομμάτι τρίτο. 🥁 Μετά από λίγες εβδομάδες ξέρω τις βάρδιες μου απ’ έξω. Η πιο πολυάσχολη είναι η μέρα **{wd}**: **{wdn}** παραδόσεις, **{wdp}%** του συνόλου. Φέρνω επιπλέον καφέ.', 'chapter_03: my weekly schedule 📂 busiest shift: **{wd}**, **{wdn}** tickets (**{wdp}%**). i load up on energy drinks', 'Chapter_03: το εβδομαδιαίο πρόγραμμά μου 📂 πιο φορτωμένη βάρδια: η μέρα **{wd}**, **{wdn}** αιτήματα (**{wdp}%**). Κάνω αποθέματα σε ενεργειακά ποτά' ] },
				{ r: 1, need: [ 'wd' ], t: [ 'On **{wd}** you and your wallet meet most often. The reels have noticed. 🥁|**{wd}** is clearly spending day. I would circle it on the calendar. 🗓️|Every **{wd}** the wallet braces itself. I can hear the zipper. 🥁|**{wd}** has a standing appointment with your purse. 🥁',
					'Τη μέρα **{wd}** εσείς και το πορτοφόλι σας συναντιέστε πιο συχνά. Τα καρούλια το πρόσεξαν. 🥁|Η μέρα **{wd}** είναι σαφώς μέρα εξόδων. Θα την έκανα κύκλο στο ημερολόγιο. 🗓️|Κάθε **{wd}** το πορτοφόλι σφίγγεται. Ακούω το φερμουάρ. 🥁|Η μέρα **{wd}** έχει σταθερό ραντεβού με το πορτοφόλι σας. 🥁',
					'**{wd}** is your spending day and i respect the commitment 😎|**{wd}** hits different for your wallet 💸|**{wd}**: the day your wallet updates to a newer, lighter version 🔄|**{wd}** energy is unmatched, and so is the receipt pile 🧾',
					'Η μέρα **{wd}** είναι η μέρα των εξόδων σας και σέβομαι την αφοσίωση 😎|Η μέρα **{wd}** χτυπά αλλιώς το πορτοφόλι σας 💸|**{wd}**: η μέρα που το πορτοφόλι σας αναβαθμίζεται σε νεότερη, ελαφρύτερη έκδοση 🔄|Η μέρα **{wd}** έχει ασύγκριτη ενέργεια, όπως και ο σωρός αποδείξεων 🧾' ] },
				{ b: 1, when: ( f ) => f.weDir === 'more', need: [ 'wePct' ], t: [ 'At weekends the studio gets louder: **{wePct}%** of the deliveries, and more per day than on weekdays.', 'Τα Σαββατοκύριακα το στούντιο γίνεται πιο θορυβώδες: **{wePct}%** των παραδόσεων, και περισσότερες ανά ημέρα από τις καθημερινές.', 'weekends are rush hour: **{wePct}%** of the tickets, and more per day than weekdays 🎉', 'Τα Σαββατοκύριακα είναι ώρα αιχμής: **{wePct}%** των αιτημάτων, και περισσότερα ανά ημέρα από τις καθημερινές 🎉' ] },
				{ r: 1, when: ( f ) => f.weDir === 'more', need: [ 'wePct' ], t: [ 'Weekends are clearly where the fun lives. 🎉|Your wallet does not rest on weekends. Neither do my reels.|The week is rehearsal. The weekend is the concert. 🎉|Weekdays are the warm-up, the weekend is showtime. 🎉', 'Τα Σαββατοκύριακα είναι σαφώς εκεί όπου ζει η διασκέδαση. 🎉|Το πορτοφόλι σας δεν ξεκουράζεται τα Σαββατοκύριακα. Ούτε τα καρούλια μου.|Η εβδομάδα είναι πρόβα. Το Σαββατοκύριακο είναι η συναυλία. 🎉|Οι καθημερινές είναι ζέσταμα, το Σαββατοκύριακο είναι η παράσταση. 🎉', 'someone has a social life 😏🎉|weekend mode: fully activated ⚡|weekdays are the loading screen, weekends are the game 🎮|plot twist: the weekend is the main event 🎬', 'Κάποιος έχει κοινωνική ζωή 😏🎉|Λειτουργία Σαββατοκύριακου: πλήρως ενεργοποιημένη ⚡|Οι καθημερινές είναι η οθόνη φόρτωσης, τα Σαββατοκύριακα είναι το παιχνίδι 🎮|Ανατροπή: το Σαββατοκύριακο είναι το κύριο γεγονός 🎬' ] },
				{ b: 1, when: ( f ) => f.weDir === 'less', need: [ 'wePct' ], t: [ 'Weekends are the quiet shift: **{wePct}%** of the deliveries, fewer per day than on weekdays. I use them to oil the reels. 🛋️', 'Τα Σαββατοκύριακα είναι η ήσυχη βάρδια: **{wePct}%** των παραδόσεων, λιγότερες ανά ημέρα από τις καθημερινές. Τα χρησιμοποιώ για να λαδώνω τα καρούλια. 🛋️', 'weekends are the chill shift: **{wePct}%** of the tickets, fewer per day than weekdays. time for updates 🛋️', 'Τα Σαββατοκύριακα είναι η χαλαρή βάρδια: **{wePct}%** των αιτημάτων, λιγότερα ανά ημέρα από τις καθημερινές. Ώρα για ενημερώσεις 🛋️' ] },
				{ b: 1, need: [ 'bigDay', 'bigDayAmt' ], t: [ 'The wildest day of all was **{bigDay}**: **{bigDayAmt}** in one go. I still find confetti in the machine.', 'Η πιο τρελή ημέρα ήταν η **{bigDay}**: **{bigDayAmt}** μονομιάς. Βρίσκω ακόμα κομφετί μέσα στη μηχανή.', 'the wildest day: **{bigDay}**, **{bigDayAmt}** in one go 💸 i needed a restart afterwards', 'Η πιο τρελή ημέρα: **{bigDay}**, **{bigDayAmt}** μονομιάς 💸 Χρειάστηκα επανεκκίνηση μετά' ] },
				{ r: 1, need: [ 'bigDay' ], t: [ 'Even the reels held their breath that day. 🥁|I like to think it was a good day, receipt-wise. 🥁', 'Ακόμα και τα καρούλια κράτησαν την ανάσα τους εκείνη την ημέρα. 🥁|Θέλω να πιστεύω ότι ήταν μια καλή ημέρα, όσον αφορά τις αποδείξεις. 🥁', 'the card is still recovering 🤕|legend says the receipts were laminated 🧾', 'Η κάρτα ανακάμπτει ακόμα 🤕|Λέει ο θρύλος ότι οι αποδείξεις πλαστικοποιήθηκαν 🧾' ] },
				{ b: 1, when: ( f ) => f.pdDir === 'more', need: [ 'pdPct' ], t: [ 'In the week after income came in, daily spending rose by **{pdPct}%**. My desk was ready.', 'Την εβδομάδα αφότου έμπαινε εισόδημα, τα ημερήσια έξοδα αυξάνονταν κατά **{pdPct}%**. Το γραφείο μου ήταν έτοιμο.', 'payday week: daily spending up **{pdPct}%** 💸 i queue my tickets early', 'Εβδομάδα πληρωμής: τα ημερήσια έξοδα αυξάνονται κατά **{pdPct}%** 💸 Βάζω τα αιτήματα νωρίς στην ουρά' ] },
				{ r: 1, when: ( f ) => f.pdDir === 'more', need: [ 'pdPct' ], t: [ 'Payday week: the wallet wakes up. 💸|Income arrives, the reels spin faster.|Money in, money out. The tape never stops. 💸|The wallet gets a pay rise and immediately a shopping list. 💸', 'Εβδομάδα πληρωμής: το πορτοφόλι ξυπνά. 💸|Το εισόδημα φτάνει και τα καρούλια γυρίζουν πιο γρήγορα.|Μπαίνουν χρήματα, βγαίνουν χρήματα. Η κασέτα δεν σταματά ποτέ. 💸|Το πορτοφόλι παίρνει αύξηση και αμέσως λίστα αγορών. 💸', 'money arrives, wallet says hello again 😂|payday energy is real ⚡|pay arrives, cart goes brrr 🛒💨|income detected, spending mode unlocked 🔓', 'Έρχεται το εισόδημα και το πορτοφόλι λέει «ξανά γεια» 😂|Η ενέργεια της πληρωμής υπάρχει ⚡|Έρχεται η πληρωμή και το καλάθι τρέχει 🛒💨|Εντοπίστηκε εισόδημα, η λειτουργία εξόδων ξεκλειδώθηκε 🔓' ] },
				{ b: 1, when: ( f ) => f.pdDir === 'less', need: [ 'pdPct' ], t: [ 'In the week after income came in, daily spending fell by **{pdPct}%**. A calm week at the studio. 👏', 'Την εβδομάδα αφότου έμπαινε εισόδημα, τα ημερήσια έξοδα μειώνονταν κατά **{pdPct}%**. Μια ήρεμη εβδομάδα στο στούντιο. 👏', 'payday week: daily spending down **{pdPct}%**. calm queue, big respect 👏', 'Εβδομάδα πληρωμής: τα ημερήσια έξοδα μειώνονται κατά **{pdPct}%**. Ήρεμη ουρά, μεγάλος σεβασμός 👏' ] },
				{ b: 1, need: [ 'active', 'firstDate' ], t: [ 'In all, you sent me work on **{active}** different days since **{firstDate}**. Thank you for the company.', 'Συνολικά μου στείλατε δουλειά σε **{active}** διαφορετικές ημέρες από τις **{firstDate}**. Σας ευχαριστώ για την παρέα.', 'you sent me work on **{active}** different days since **{firstDate}** 📅 best coworker ever!', 'Μου στείλατε δουλειά σε **{active}** διαφορετικές ημέρες από τις **{firstDate}** 📅 Ο καλύτερος συνάδελφος όλων των εποχών!' ] },
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
		f.firstC = cents( first ); f.fwd = EX.parse( first.date ).getDay(); f.active = new Set( all.map( ( x ) => x.date ) ).size;
		const ds = [ ...new Set( all.map( ( x ) => x.date ) ) ]; let run = 1; f.streak = 1; for ( let i = 1; i < ds.length; i++ ) { run = EX.diffDays( ds[ i ], ds[ i - 1 ] ) === 1 ? run + 1 : 1; if ( run > f.streak ) f.streak = run; }
		const incC = inc.reduce( ( s, x ) => s + cents( x ), 0 ); if ( incC > 0 ) f.incC = incC;
		ex.forEach( ( x ) => { const c = cents( x ), k = x.category || 'other'; by[ k ] = ( by[ k ] || 0 ) + c; total += c; } );
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
		[ [ 'firstC', 'firstAmt' ], [ 'totalC', 'total' ], [ 'avgC', 'avg' ], [ 't1c', 't1amt' ], [ 't2c', 't2amt' ], [ 't3c', 't3amt' ], [ 'bigC', 'bigAmt' ], [ 'incC', 'incTotal' ], [ 'bigDayC', 'bigDayAmt' ] ].forEach( ( [ a, b ] ) => { if ( f[ a ] != null ) v[ b ] = m( f[ a ] ); } );
		[ 'wdn', 'active', 'streak', 'oftenN' ].forEach( ( k ) => { if ( f[ k ] != null ) v[ k ] = String( f[ k ] ); } );
		const dl = ( d ) => EX.parse( d ).toLocaleDateString( L, { day: 'numeric', month: 'long' } );
		if ( f.bigC != null ) { v.bigWhat = f.bigName || catName( f.bigk, lang ); v.bigDate = dl( f.bigDate ); }
		if ( f.oftenName ) v.often = f.oftenName;
		if ( f.bigDay ) v.bigDay = dl( f.bigDay );
		if ( f.fwd != null ) v.firstDay = new Date( 2024, 0, 7 + f.fwd ).toLocaleDateString( L, { weekday: 'long' } );
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
