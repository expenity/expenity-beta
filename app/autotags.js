/**
 * Auto tags (Pro and up). Every entry, bill, income, budget, goal and eFriend plan can get up to three tags by itself.
 *  - The tags come from a built-in vocabulary of 200 everyday things, each with an English name, a Greek name and the words that count as the same
 *    thing in either language ("ρολόι", "watches", "wristwatch" are one tag), so the same kind of thing always gets the same tag.
 *  - A tag the person already has that means the same is always used instead of a new one, and their own tags are learned from the entries they tag.
 *  - Tags are never invented from free text. A tag added by the app is remembered as such (`autoTags` on the record), so a tag the person typed is never touched.
 *  - "Improve my tags" scans everything: merges tags that mean the same, and adds the better tags to older entries. It shows a preview first and can be undone.
 *  - Every 10 new entries a notice on Home suggests running it.
 * Everything happens on the device.
 */
( function () {
	'use strict';
	const EX = window.EX, EXA = window.EXA, UI = window.UI;
	if ( ! EX || ! EXA ) return;
	const S = EX.state, { t, esc } = EX, fold = EX.fold || ( ( x ) => String( x || '' ).toLowerCase() );
	const MAX = 3;

	/* ---------------------------------------------------------------- the vocabulary: key | English | Greek | other words (either language; plurals of English words are added automatically) */
	const RAW = `
coffee|Coffee|Καφές|cafe,espresso,latte,cappuccino,καφε,εσπρεσο,καπουτσινο,φραπε,φρεντο
groceries|Groceries|Σούπερ μάρκετ|grocery,supermarket,market,σουπερ μαρκετ,μαρκετ,ψωνια,μπακαλης,λιντλ,ab
eatingOut|Eating out|Έξοδος για φαγητό|restaurant,dining,dinner out,lunch out,εστιατοριο,ταβερνα,tavern,bistro,εξοδος
delivery|Delivery|Διανομή|takeaway,take away,takeout,efood,wolt,box,διανομη,ντελιβερι
breakfast|Breakfast|Πρωινό|brunch,πρωινο,μπραντς
lunch|Lunch|Μεσημεριανό|μεσημεριανο,γευμα
dinner|Dinner|Βραδινό|supper,βραδινο,δειπνο
bakery|Bakery|Αρτοποιείο|bread,bagel,croissant,αρτοποιειο,φουρνος,ψωμι,κρουασαν,τυροπιτα,πιτα
meat|Meat|Κρέας|butcher,steak,chicken,pork,beef,κρεας,κρεοπωλειο,κοτοπουλο,χοιρινο,μοσχαρι
fish|Fish|Ψάρι|seafood,fishmonger,ψαρι,θαλασσινα,ψαραδικο
fruitVeg|Fruit & veg|Φρούτα & λαχανικά|fruit,vegetables,veg,greengrocer,φρουτα,λαχανικα,μανάβικο,μανάβης
dairy|Dairy|Γαλακτοκομικά|milk,cheese,yogurt,yoghurt,γαλα,τυρι,γιαουρτι,γαλακτοκομικα
snacks|Snacks|Σνακ|chips,crisps,candy,chocolate,sweets,σνακ,πατατακια,σοκολατα,γλυκα,καραμελες
iceCream|Ice cream|Παγωτό|gelato,παγωτο,γκελατο
pizza|Pizza|Πίτσα|πιτσα,πιτσαρια
burger|Burger|Μπέργκερ|burgers,μπεργκερ,χαμπουργκερ
souvlaki|Souvlaki|Σουβλάκι|gyros,souvlaki,γυρος,σουβλακι,σουβλατζιδικο
sushi|Sushi|Σούσι|σουσι,ασιατικο
wine|Wine|Κρασί|winery,κρασι,οινοπνευματα
beer|Beer|Μπύρα|pub,brewery,μπυρα,μπυραρια
cocktails|Cocktails|Κοκτέιλ|cocktail,drinks,bar,κοκτειλ,ποτο,ποτα,μπαρ
water|Water|Νερό|bottled water,νερο,εμφιαλωμενο
nightlife|Nightlife|Νυχτερινή έξοδος|club,nightclub,party,disco,νυχτερινη,κλαμπ,ντισκο,πάρτι,παρτυ
rent|Rent|Ενοίκιο|rental,landlord,ενοικιο,νοικι
mortgage|Mortgage|Στεγαστικό|home loan,στεγαστικο,δοση σπιτιου
home|Home|Σπίτι|house,apartment,flat,σπιτι,διαμερισμα,κατοικια
furniture|Furniture|Έπιπλα|sofa,couch,table,chair,bed,mattress,wardrobe,επιπλα,καναπες,τραπεζι,καρεκλα,κρεβατι,στρωμα,ντουλαπα
appliances|Appliances|Οικιακές συσκευές|fridge,washing machine,oven,dishwasher,microwave,vacuum,οικιακες συσκευες,ψυγειο,πλυντηριο,φουρνος,πλυντηριο πιατων,σκουπα
decor|Decor|Διακόσμηση|decoration,curtains,rug,lamp,διακοσμηση,κουρτινες,χαλι,φωτιστικο,ντεκορ
cleaning|Cleaning|Καθαριότητα|cleaner,detergent,soap,laundry,καθαριστρια,απορρυπαντικο,σαπουνι,πλυσιμο,καθαριοτητα
laundry|Laundry|Πλυντήριο|dry cleaner,dry cleaning,launderette,στεγνοκαθαριστηριο,πλυντηριο ρουχων,σιδερωμα
repairs|Repairs|Επισκευές|repair,fix,plumber,electrician,handyman,επισκευη,επισκευες,υδραυλικος,ηλεκτρολογος,μερεμετια
garden|Garden|Κήπος|plants,flowers,gardening,nursery,κηπος,φυτα,λουλουδια,κηπουρος
electricity|Electricity|Ρεύμα|power,electric,dei,ρευμα,δεη,ηλεκτρικο,ηλεκτρισμος
waterBill|Water bill|Λογαριασμός νερού|water supply,eydap,υδρευση,εταιρεια υδρευσης,λογαριασμος νερου,εύδαπ,ευδαπ
gas|Gas|Φυσικό αέριο|natural gas,cooking gas,φυσικο αεριο,υγραεριο,δεπα
heating|Heating|Θέρμανση|heating oil,fuel oil,pellets,θερμανση,πετρελαιο θερμανσης,πελλετ,καλοριφερ
internet|Internet|Διαδίκτυο|wifi,broadband,fibre,fiber,adsl,ιντερνετ,διαδικτυο,οπτικη ινα
mobile|Mobile plan|Κινητή τηλεφωνία|phone bill,sim,prepaid,cosmote,vodafone,nova,κινητο,κινητη,καρτοκινητο,τηλεφωνο,συνδεση
tv|TV|Τηλεόραση|television,cable,tv license,τηλεοραση,συνδρομητικη,τηλεοπτικη
homeInsurance|Home insurance|Ασφάλεια σπιτιού|property insurance,fire insurance,ασφαλεια σπιτιου,ασφαλεια κατοικιας
commonCharges|Common charges|Κοινόχρηστα|service charges,building fees,κοινοχρηστα,διαχειριση πολυκατοικιας
bills|Bills|Λογαριασμοί|bill,utilities,utility,λογαριασμοι,λογαριασμος,παγια
car|Car|Αυτοκίνητο|vehicle,auto,αυτοκινητο,οχημα,αμαξι
fuel|Fuel|Καύσιμα|petrol,gasoline,diesel,gas station,καυσιμα,βενζινη,πετρελαιο,βενζινάδικο,βενζινάδικο,βενζινακι
parking|Parking|Στάθμευση|garage,car park,παρκινγκ,σταθμευση,γκαραζ,θεση
tolls|Tolls|Διόδια|toll,motorway,highway,διοδια,ιονια οδος,αττικη οδος,εγνατια
carService|Car service|Συντήρηση αυτοκινήτου|mechanic,oil change,tyres,tires,brakes,garage repair,συντηρηση,σερβις,μηχανικος,λαδια,ελαστικα,φρενα,συνεργειο
carWash|Car wash|Πλύσιμο αυτοκινήτου|carwash,πλυσιμο αυτοκινητου,πλυντηριο αυτοκινητων
carInsurance|Car insurance|Ασφάλεια αυτοκινήτου|vehicle insurance,ασφαλεια αυτοκινητου,ασφαλεια οχηματος
roadTax|Road tax|Τέλη κυκλοφορίας|registration,mot,kteo,τελη κυκλοφοριας,κτεο,πινακιδες,ταξι ελεγχος
taxi|Taxi|Ταξί|uber,cab,ride,beat,ταξι,οδηγος
publicTransport|Public transport|Δημόσιες συγκοινωνίες|bus,metro,tram,subway,train,ticket,οασα,λεωφορειο,μετρο,τραμ,τρενο,εισιτηριο,κάρτα
bike|Bike|Ποδήλατο|bicycle,cycling,ποδηλατο,ποδηλασια
scooter|Scooter|Σκούτερ|motorbike,motorcycle,moped,σκουτερ,μοτοσυκλετα,μηχανη,μοτο
flight|Flight|Πτήση|flights,airline,airfare,plane,ticket air,πτηση,πτησεις,αεροπορικα,αεροπορικο,αεροπλανο
ferry|Ferry|Πλοίο|boat,ship,ferries,πλοιο,φεριμποτ,καραβι,ακτοπλοικο
hotel|Hotel|Ξενοδοχείο|hostel,airbnb,booking,accommodation,stay,room,ξενοδοχειο,καταλυμα,διαμονη,δωματιο,ενοικιαζομενα
holiday|Holiday|Διακοπές|vacation,trip,getaway,διακοπες,ταξιδι,εκδρομη,αποδραση
travel|Travel|Ταξίδια|travelling,traveling,journey,tour,ταξιδια,περιηγηση
camping|Camping|Κάμπινγκ|camp,tent,κατασκηνωση,σκηνη,καμπινγκ
beach|Beach|Παραλία|sea,sunbed,umbrella,παραλια,θαλασσα,ξαπλωστρες
passport|Passport|Διαβατήριο|visa,id card,identity,διαβατηριο,βιζα,ταυτοτητα,εγγραφο
health|Health|Υγεία|medical,healthcare,υγεια,ιατρικα,ιατρικο
pharmacy|Pharmacy|Φαρμακείο|medicine,pills,prescription,drugstore,φαρμακειο,φαρμακο,φαρμακα,συνταγη
doctor|Doctor|Γιατρός|gp,clinic,checkup,appointment,physician,γιατρος,ιατρειο,εξετασεις,επισκεψη,κλινικη
dentist|Dentist|Οδοντίατρος|dental,teeth,orthodontist,οδοντιατρος,οδοντιατρικα,δοντια,ορθοδοντικος
optician|Optician|Οπτικά|glasses,lenses,eye test,contacts,οπτικα,γυαλια,φακοι,οφθαλμιατρος
therapy|Therapy|Θεραπεία|therapist,psychologist,counselling,counseling,physio,physiotherapy,θεραπεια,ψυχολογος,φυσιοθεραπεια,ψυχοθεραπεια
hospital|Hospital|Νοσοκομείο|surgery,operation,emergency,νοσοκομειο,εγχειρηση,επειγοντα
vitamins|Vitamins|Βιταμίνες|supplements,supplement,βιταμινες,συμπληρωματα
gym|Gym|Γυμναστήριο|fitness,workout,training,pilates,yoga,crossfit,γυμναστηριο,γυμναστικη,προπονηση,γιογκα,πιλατες
sports|Sports|Αθλητισμός|sport,football,basketball,tennis,swimming,running,αθλητισμος,αθλημα,ποδοσφαιρο,μπασκετ,τενις,κολυμβηση,τρεξιμο
massage|Massage|Μασάζ|spa,sauna,wellness,μασαζ,σπα,ευεξια
haircut|Haircut|Κούρεμα|hairdresser,barber,salon,hair,κουρεμα,κομμωτηριο,κουρειο,κομμωτης,μαλλια
beauty|Beauty|Ομορφιά|nails,manicure,pedicure,cosmetics,makeup,waxing,ομορφια,νυχια,μανικιουρ,πεντικιουρ,καλλυντικα,μακιγιαζ,αισθητικη
perfume|Perfume|Άρωμα|fragrance,cologne,αρωμα,αρωματα,κολωνια
shopping|Shopping|Αγορές|buy,bought,purchase,shop,store,αγορες,αγορα,ψωνια,μαγαζι
clothes|Clothes|Ρούχα|clothing,jacket,coat,dress,shirt,jeans,t-shirt,tshirt,pants,sweater,ρουχα,ρουχο,ζακετα,παλτο,φορεμα,πουκαμισο,παντελονι,μπλουζα,τζιν
shoes|Shoes|Παπούτσια|sneakers,boots,sandals,trainers,heels,παπουτσια,παπουτσι,μποτες,σανδαλια,αθλητικα
accessories|Accessories|Αξεσουάρ|belt,scarf,hat,sunglasses,wallet accessory,ζωνη,κασκολ,καπελο,γυαλια ηλιου,αξεσουαρ
bag|Bag|Τσάντα|handbag,backpack,suitcase,luggage,purse,τσαντα,σακιδιο,βαλιτσα,αποσκευες
watch|Watch|Ρολόι|watches,wristwatch,smartwatch,ρολοι,ρολογια,χειρολογιο,εξυπνο ρολοι
jewelry|Jewelry|Κοσμήματα|jewellery,ring,necklace,bracelet,earrings,gold,κοσμημα,κοσμηματα,δαχτυλιδι,κολιε,βραχιολι,σκουλαρικια,χρυσος
electronics|Electronics|Ηλεκτρονικά|gadget,gadgets,device,ηλεκτρονικα,συσκευη,gadget
phone|Phone|Κινητό τηλέφωνο|smartphone,iphone,android,samsung,κινητο τηλεφωνο,smartphone,τηλεφωνο
laptop|Laptop|Λάπτοπ|computer,notebook,macbook,pc,pc desktop,λαπτοπ,υπολογιστης,φορητος,κομπιουτερ
tablet|Tablet|Tablet|ipad,e-reader,kindle,ταμπλετα,ταμπλετ
headphones|Headphones|Ακουστικά|earbuds,airpods,earphones,speaker,ακουστικα,ηχειο,ηχεια
camera|Camera|Κάμερα|photography,lens,gopro,κάμερα,φωτογραφικη,φωτογραφιες,φακος
console|Game console|Κονσόλα|playstation,xbox,nintendo,switch,gaming,κονσολα,παιχνιδομηχανη
games|Games|Παιχνίδια|game,video game,steam,gaming,παιχνιδι,βιντεοπαιχνιδι,παιχνιδια υπολογιστη
tvset|TV set|Τηλεόραση (συσκευή)|smart tv,monitor,screen,οθονη,smarttv
books|Books|Βιβλία|book,novel,ebook,bookstore,βιβλιο,βιβλια,μυθιστορημα,βιβλιοπωλειο
stationery|Stationery|Χαρτικά|notebook paper,pens,pen,pencil,printer,ink,χαρτικα,στυλο,μολυβι,τετραδιο,εκτυπωτης,μελανι
toys|Toys|Παιχνίδια παιδιών|toy,lego,doll,puzzle,παιχνιδι παιδικο,παιδικα παιχνιδια,λεγκο,κουκλα,παζλ
gifts|Gifts|Δώρα|gift,present,presents,birthday gift,δωρο,δωρα,γενεθλια δωρο
flowers|Flowers|Λουλούδια|bouquet,florist,λουλουδια,ανθοδεσμη,ανθοπωλειο,μπουκετο
birthday|Birthday|Γενέθλια|party,cake,celebration,γενεθλια,τουρτα,γιορτη,παρτι γενεθλιων
wedding|Wedding|Γάμος|bride,groom,baptism,christening,γαμος,βαφτιση,νυφη,μπομπονιερες
cinema|Cinema|Κινηματογράφος|movie,movies,film,theater film,κινηματογραφος,σινεμα,ταινια
concert|Concert|Συναυλία|gig,festival,live music,συναυλια,φεστιβαλ,live
theatre|Theatre|Θέατρο|theater,play,musical,opera,θεατρο,παρασταση,οπερα
museum|Museum|Μουσείο|gallery,exhibition,archaeological,μουσειο,εκθεση,γκαλερι,αρχαιολογικος
streaming|Streaming|Streaming|netflix,disney,hbo,prime video,stream,streaming service,πλατφορμα
music|Music|Μουσική|spotify,apple music,vinyl,album,μουσικη,δισκος,βινυλιο,αλμπουμ
hobby|Hobby|Χόμπι|hobbies,craft,art supplies,painting,χομπι,τεχνη,ζωγραφικη,χειροτεχνια
instrument|Instrument|Μουσικό όργανο|guitar,piano,drums,violin,οργανο,κιθαρα,πιανο,νταουλι,βιολι
leisure|Leisure|Ψυχαγωγία|fun,entertainment,free time,ψυχαγωγια,διασκεδαση
outing|Outing|Έξοδος|day out,outing,hangout,εξοδος,βολτα,βόλτα
subscription|Subscription|Συνδρομή|subscriptions,membership,monthly plan,συνδρομη,συνδρομες,μηνιαια συνδρομη
software|Software|Λογισμικό|app,apps,license,licence,saas,λογισμικο,εφαρμογη,αδεια χρησης
cloud|Cloud storage|Αποθηκευτικός χώρος|icloud,dropbox,google drive,onedrive,storage,cloud,αποθηκευτικος χωρος,νεφος
domain|Domain & hosting|Domain & hosting|hosting,website,domain name,ssl,server,ιστοσελιδα,φιλοξενια,ονομα χωρου
coworking|Coworking|Χώρος συνεργασίας|office,desk,coworking space,γραφειο,χωρος εργασιας,συνεργαζομενος χωρος
work|Work|Εργασία|business,job,office work,εργασια,δουλεια,επαγγελματικο,επιχειρηση
workTools|Work tools|Εργαλεία εργασίας|equipment,tools,supplies,εργαλεια,εξοπλισμος,αναλωσιμα
courses|Courses|Μαθήματα|course,class,lesson,lessons,workshop,training course,μαθημα,μαθηματα,σεμιναριο,κουρσος,φροντιστηριο
education|Education|Εκπαίδευση|school,university,college,study,tuition,εκπαιδευση,σχολειο,πανεπιστημιο,σπουδες,διδακτρα
languages|Languages|Γλώσσες|english lessons,language school,ielts,γλωσσες,αγγλικα,γαλλικα,γερμανικα,ξενες γλωσσες
kids|Kids|Παιδιά|child,children,kid,son,daughter,παιδι,παιδια,γιος,κορη,παιδικο
baby|Baby|Μωρό|diapers,nappies,formula,stroller,pram,μωρο,πανες,γαλα μωρου,καροτσι,βρεφικα
school|School supplies|Σχολικά|backpack school,uniform,school fees,σχολικα,στολη,τετραδια,σχολικες δαπανες
daycare|Daycare|Παιδικός σταθμός|nursery school,kindergarten,creche,παιδικος σταθμος,νηπιαγωγειο,βρεφονηπιακος
babysitter|Babysitter|Νταντά|nanny,childminder,ντανα,μπεϊμπισιτερ,μπεμπισιτερ
family|Family|Οικογένεια|relatives,parents,mum,dad,grandma,οικογενεια,συγγενεις,γονεις,μαμα,μπαμπας,γιαγια
pets|Pets|Κατοικίδια|pet,dog,cat,κατοικιδιο,κατοικιδια,σκυλος,γατα
vet|Vet|Κτηνίατρος|veterinary,vaccination,κτηνιατρος,εμβολιο,κτηνιατρειο
petFood|Pet food|Τροφή κατοικιδίων|dog food,cat food,kibble,τροφη κατοικιδιων,κροκετες,τροφη σκυλου
insurance|Insurance|Ασφάλεια|policy,cover,premium,ασφαλεια,ασφαλιστηριο,ασφαλιστρο
healthInsurance|Health insurance|Ασφάλεια υγείας|medical insurance,private health,ασφαλεια υγειας,ιδιωτικη ασφαλιση
lifeInsurance|Life insurance|Ασφάλεια ζωής|life cover,ασφαλεια ζωης
tax|Tax|Φόροι|taxes,income tax,enfia,vat,φορος,φοροι,ενφια,φπα,εφορια,τελη
fees|Fees|Τέλη & προμήθειες|fee,commission,charge,service fee,τελος,προμηθεια,χρεωση
bankFees|Bank fees|Τραπεζικά έξοδα|bank charge,card fee,atm,τραπεζικα εξοδα,προμηθεια τραπεζας,εξοδα τραπεζας
loan|Loan|Δάνειο|credit,instalment,installment,debt,δανειο,δοση,πιστωτικη,οφειλη,χρεος
creditCard|Credit card|Πιστωτική κάρτα|card payment,visa,mastercard,πιστωτικη καρτα,πληρωμη καρτας
interest|Interest|Τόκοι|interest payment,τοκοι,τοκος,επιτοκιο
salary|Salary|Μισθός|wage,payroll,paycheck,pay,μισθος,μισθοδοσια,πληρωμη εργοδοτη,αποδοχες
bonus|Bonus|Μπόνους|tip income,commission income,μπονους,επιδομα,δωρο χριστουγεννων
freelance|Freelance|Ελεύθερος επαγγελματίας|invoice,client,contract,gig work,τιμολογιο,πελατης,συμβαση,ελευθερος επαγγελματιας,παροχη υπηρεσιων
refund|Refund|Επιστροφή χρημάτων|reimbursement,money back,cashback,επιστροφη,επιστροφη χρηματων,αποζημιωση
pension|Pension|Σύνταξη|retirement,pension fund,συνταξη,συνταξιοδοτηση,ταμειο
benefits|Benefits|Επιδόματα|allowance,welfare,grant,επιδομα,επιδοτηση,βοηθημα
rentalIncome|Rental income|Εισόδημα από ενοίκιο|tenant,tenant rent,εισοδημα ενοικιου,ενοικιαστης
dividends|Dividends|Μερίσματα|dividend,shares,stocks,μερισμα,μετοχες
investment|Investment|Επένδυση|invest,etf,crypto,bitcoin,fund,επενδυση,επενδυσεις,κρυπτο,αμοιβαιο
savings|Savings|Αποταμίευση|saving,save,piggy bank,rainy day,αποταμιευση,οικονομιες,αποθεματικο
emergencyFund|Emergency fund|Αποθεματικό έκτακτης ανάγκης|safety net,αποθεματικο εκτακτης αναγκης,ταμειο ανάγκης
donation|Donation|Δωρεά|charity,donate,ngo,δωρεα,φιλανθρωπια,προσφορα,ελεημοσυνη
tips|Tips|Φιλοδώρημα|tip,gratuity,φιλοδωρημα,πουρμπουαρ
fines|Fines|Πρόστιμα|fine,ticket fine,penalty,προστιμο,προστιμα,κλησεις,κληση
postal|Postal|Ταχυδρομικά|post,courier,shipping,parcel,stamps,acs,elta,ταχυδρομικα,ταχυδρομειο,αποστολη,δεμα,κουριερ,γραμματοσημα
government|Government|Δημόσιο|passport fee,permit,licence fee,stamp duty,δημοσιο,παραβολο,αδεια,ληξιαρχειο,δημοσια υπηρεσια
legal|Legal|Νομικά|lawyer,notary,court,attorney,νομικα,δικηγορος,συμβολαιογραφος,δικαστηριο
accountant|Accountant|Λογιστής|accounting,bookkeeper,λογιστης,λογιστικα,λογιστικο γραφειο
advertising|Advertising|Διαφήμιση|ads,marketing,promotion,διαφημιση,μαρκετινγκ,προωθηση
printing|Printing|Εκτυπώσεις|print,copy shop,photocopy,εκτυπωση,φωτοτυπιες,τυπογραφειο
repairsTech|Tech repairs|Επισκευή συσκευών|screen repair,phone repair,επισκευη κινητου,επισκευη υπολογιστη,service συσκευων
moving|Moving|Μετακόμιση|removals,mover,storage unit,μετακομιση,μεταφορες,αποθηκη
renovation|Renovation|Ανακαίνιση|refurbishment,builder,paint,painting walls,ανακαινιση,χρωματισμος,οικοδομος,εργολαβος
tools|Tools|Εργαλεία|drill,hardware,diy,εργαλεια,τρυπανι,σιδηρικα,ειδη οικιας
art|Art|Τέχνη|artwork,painting art,gallery purchase,τεχνη,εργο τεχνης,πινακας
photography|Photography|Φωτογραφία|photo,photos,photoshoot,prints,φωτογραφια,φωτογραφιση,φωτογραφος
lottery|Lottery|Λαχεία|lotto,tzoker,scratch,opap,λαχειο,τζοκερ,λοττο,οπαπ,στοιχημα
betting|Betting|Στοίχημα|bet,casino,gambling,στοιχημα,καζινο,τζογος
smoking|Smoking|Κάπνισμα|cigarettes,tobacco,vape,τσιγαρα,καπνος,ηλεκτρονικο τσιγαρο
snackBar|Snack bar|Κυλικείο|kiosk,periptero,vending,περιπτερο,κυλικειο,αυτοματος πωλητης
bakeryCake|Pastry shop|Ζαχαροπλαστείο|pastries,cake shop,dessert,ζαχαροπλαστειο,γλυκο,επιδορπιο,τουρτα
streetFood|Street food|Street food|food truck,kebab,crepe,κρεπα,τοστ,toast,σάντουιτς,sandwich
tavern|Tavern|Ταβέρνα|meze,ouzeri,ψητοπωλειο,μεζεδες,ουζερι,ψαροταβερνα
fastFood|Fast food|Γρήγορο φαγητό|mcdonalds,kfc,goody,everest,γρηγορο φαγητο,φαστ φουντ,γκουντις
cafeSnack|Café|Καφετέρια|coffee shop,cafeteria,starbucks,καφετερια,καφενειο,starbucks
kitchen|Kitchen|Κουζίνα|cookware,pans,pots,cutlery,κουζινα,σκευη,τηγανι,κατσαρολα,μαχαιροπιρουνα
bedding|Bedding|Κλινοσκεπάσματα|sheets,pillow,duvet,towels,σεντονια,μαξιλαρι,πουπουλενιο,πετσετες
lighting|Lighting|Φωτισμός|light bulb,lamp shop,led,φωτισμος,λαμπα,λαμπτηρας
security|Security|Ασφάλεια χώρου|alarm,cctv,lock,locksmith,συναγερμος,κλειδαρας,κλειδαρια,καμερες ασφαλειας
cleaningService|Cleaning service|Υπηρεσία καθαρισμού|maid,housekeeper,cleaning lady,οικιακη βοηθος,καθαριστρια,υπηρεσια καθαρισμου
laundryDetergent|Household supplies|Είδη σπιτιού|household,paper towels,toilet paper,είδη σπιτιου,χαρτι υγειας,χαρτοπετσετες,αναλωσιμα σπιτιου
parkingFine|Parking fine|Κλήση στάθμευσης|parking ticket,κληση σταθμευσης,προστιμο παρκινγκ
ev|Electric car|Ηλεκτρικό αυτοκίνητο|ev,charging,charger,tesla,ηλεκτρικο αυτοκινητο,φορτιστης,φορτιση
roadside|Roadside help|Οδική βοήθεια|breakdown,towing,οδικη βοηθεια,γερανος,ρυμουλκηση
sportsGear|Sports gear|Αθλητικός εξοπλισμός|racket,ball,gear,sportswear,αθλητικος εξοπλισμος,ρακετα,μπαλα,αθλητικα ρουχα
outdoors|Outdoors|Υπαίθρια|hiking,mountain,ski,skiing,υπαιθρια,πεζοπορια,βουνο,σκι,χιονοδρομικο
pool|Pool|Πισίνα|swimming pool,πισινα,κολυμβητηριο
dance|Dance|Χορός|dancing,ballet,χορος,χοροι,μπαλετο
martialArts|Martial arts|Πολεμικές τέχνες|karate,judo,boxing,πολεμικες τεχνες,καρατε,τζουντο,πυγμαχια
musicLessons|Music lessons|Μαθήματα μουσικής|piano lessons,guitar lessons,μαθηματα μουσικης,ωδειο
tutoring|Tutoring|Ιδιαίτερα|private lessons,tutor,ιδιαιτερα,ιδιαιτερο μαθημα,καθηγητης
exams|Exams|Εξετάσεις|exam,certificate,exam fee,εξετασεις,εξεταστικο,πιστοποιητικο,πιστοποιηση
conference|Conference|Συνέδριο|event ticket,seminar,meetup,συνεδριο,εκδηλωση,σεμιναριο
membership|Membership|Συνδρομή μέλους|club membership,association,μελος,συλλογος,ενωση,εγγραφη
newspaper|Newspaper|Εφημερίδα|magazine,news,εφημεριδα,περιοδικο,ειδησεις
phoneAccessories|Phone accessories|Αξεσουάρ κινητού|case,charger cable,screen protector,θηκη,καλωδιο φορτισης,προστατευτικο οθονης
computerParts|Computer parts|Εξαρτήματα υπολογιστή|keyboard,mouse,ssd,ram,memory,πληκτρολογιο,ποντικι,δισκος,μνημη
smartHome|Smart home|Έξυπνο σπίτι|alexa,smart speaker,smart bulb,εξυπνο σπιτι,εξυπνη συσκευη
babyClothes|Baby clothes|Βρεφικά ρούχα|onesie,βρεφικα ρουχα,μπορντουρες
maternity|Maternity|Μητρότητα|pregnancy,obstetrician,μητροτητα,εγκυμοσυνη,μαιευτηρας,μαια
elderCare|Elder care|Φροντίδα ηλικιωμένων|carer,nursing home,φροντιδα ηλικιωμενων,οικος ευγηριας,συνοδος
funeral|Funeral|Κηδεία|memorial,flowers funeral,κηδεια,μνημοσυνο,γραφειο τελετων
cosmeticsStore|Drugstore|Είδη προσωπικής φροντίδας|toiletries,shampoo,toothpaste,deodorant,είδη προσωπικης φροντιδας,σαμπουαν,οδοντοκρεμα,αποσμητικο
sunscreen|Sunscreen|Αντηλιακό|suncream,αντηλιακο,after sun
airportTransfer|Airport transfer|Μεταφορά αεροδρομίου|airport,shuttle,transfer,αεροδρομιο,μεταφορα αεροδρομιου,shuttle
luggage|Luggage fees|Αποσκευές|baggage,extra bag,excess baggage,επιπλεον αποσκευη,υπερβαρο
carRental|Car rental|Ενοικίαση αυτοκινήτου|rent a car,hire car,ενοικιαση αυτοκινητου,rent a car
guide|Guided tour|Ξενάγηση|excursion,tour guide,ticket attraction,ξεναγηση,εκδρομη οργανωμενη,ξεναγος
souvenirs|Souvenirs|Αναμνηστικά|souvenir,keepsake,αναμνηστικα,σουβενιρ
streamingGames|Online games|Διαδικτυακά παιχνίδια|in-app purchase,skins,gems,αγορα εντος εφαρμογης,διαδικτυακα παιχνιδια
`;

	// the words in a vocabulary line may mix both languages; they are compared without accents or capitals
	const norm = ( s ) => fold( s ).replace( /ς/g, 'σ' ).replace( /[^a-z0-9α-ω ]+/g, ' ' ).replace( /\s+/g, ' ' ).trim();
	const VOCAB = {}, INDEX = [];
	RAW.trim().split( '\n' ).forEach( ( line ) => {
		const [ key, en, el, words ] = line.split( '|' ); if ( ! key ) return;
		const alias = new Set( [ en, el, ...String( words || '' ).split( ',' ) ].map( norm ).filter( Boolean ) );
		[ ...alias ].forEach( ( a ) => { if ( /^[a-z0-9 ]+$/.test( a ) && ! a.endsWith( 's' ) && a.length > 2 ) { alias.add( a + 's' ); alias.add( a + 'es' ); } } );
		VOCAB[ key ] = { key, en, el, alias: [ ...alias ] };
		alias.forEach( ( a ) => INDEX.push( [ a, key ] ) );
	} );
	INDEX.sort( ( x, y ) => y[ 0 ].length - x[ 0 ].length ); // the longest phrase first: "car wash" before "car"

	// which general concepts go with which category (a gentle default when the words say little)
	const CAT = {
		coffee: [ 'coffee' ], food: [ 'groceries' ], dining: [ 'eatingOut' ], delivery: [ 'delivery' ], fuel: [ 'fuel', 'car' ], parking: [ 'parking', 'car' ], tolls: [ 'tolls', 'car' ], vehicleMaintenance: [ 'carService', 'car' ],
		transport: [ 'publicTransport' ], publicTransport: [ 'publicTransport' ], health: [ 'health' ], pharmacy: [ 'pharmacy', 'health' ], dental: [ 'dentist', 'health' ], vision: [ 'optician', 'health' ],
		utilities: [ 'bills' ], housing: [ 'rent', 'home' ], commonCharges: [ 'commonCharges', 'home' ], homeMaintenance: [ 'repairs', 'home' ], furniture: [ 'furniture', 'home' ], cleaning: [ 'cleaning' ],
		subscriptions: [ 'subscription' ], software: [ 'software', 'subscription' ], cloudStorage: [ 'cloud', 'subscription' ], shopping: [ 'shopping' ], clothing: [ 'clothes', 'shopping' ], electronics: [ 'electronics', 'shopping' ],
		leisure: [ 'leisure' ], entertainment: [ 'leisure' ], travel: [ 'travel' ], education: [ 'education' ], gifts: [ 'gifts' ], pets: [ 'pets' ], family: [ 'family' ], kids: [ 'kids' ], insurance: [ 'insurance' ], taxes: [ 'tax' ],
		salary: [ 'salary' ], bonus: [ 'bonus' ], freelance: [ 'freelance' ], interest: [ 'interest' ], dividends: [ 'dividends' ], investments: [ 'investment' ], savings: [ 'savings' ], donations: [ 'donation' ], fitness: [ 'gym' ], sports: [ 'sports' ],
	};

	/* ---------------------------------------------------------------- the person's own tags */
	const KINDS = [ 'txs', 'bills', 'incomes', 'budgets', 'goals' ];
	const allTags = () => { const m = new Map(); KINDS.forEach( ( k ) => ( S()[ k ] || [] ).forEach( ( r ) => ( r.tags || [] ).forEach( ( g ) => m.set( g, ( m.get( g ) || 0 ) + 1 ) ) ) ); ( S().settings.tags || [] ).forEach( ( g ) => { if ( ! m.has( g ) ) m.set( g, 0 ); } ); return m; };
	const stemWord = ( w ) => w.length > 4 ? w.replace( /(ies|es|s)$/, '' ) : w.replace( /s$/, '' );
	const tagKey = ( g ) => norm( g ).split( ' ' ).map( stemWord ).join( ' ' );
	/** The tag the person already has that means the same as a vocabulary concept, or the concept's name in their language. */
	const resolve = ( key, have ) => {
		const v = VOCAB[ key ]; if ( ! v ) return null; const names = new Set( v.alias.map( ( a ) => a.split( ' ' ).map( stemWord ).join( ' ' ) ) );
		for ( const g of have.keys() ) if ( names.has( tagKey( g ) ) ) return g;
		return EX.lang() === 'el' ? v.el : v.en;
	};
	const tokensOf = ( s ) => norm( s ).split( ' ' ).filter( ( w ) => w.length > 2 );

	/** Up to `room` tags for a description (and optionally a category): words first, then the category, then what the person's own history says. */
	const suggest = ( text, opts = {} ) => {
		const room = opts.room == null ? MAX : opts.room; if ( room <= 0 ) return [];
		const have = opts.have || allTags(), padded = ' ' + norm( text ) + ' ', found = [];
		let rest = padded;
		for ( const [ a, key ] of INDEX ) { if ( rest.includes( ' ' + a + ' ' ) ) { if ( ! found.includes( key ) ) found.push( key ); rest = rest.split( ' ' + a + ' ' ).join( ' ' ); } }
		const out = [], push = ( g ) => { if ( g && ! out.some( ( x ) => tagKey( x ) === tagKey( g ) ) && ! ( opts.skip || [] ).some( ( x ) => tagKey( x ) === tagKey( g ) ) ) out.push( g ); };
		// the person's own tags that appear in the words
		const toks = new Set( tokensOf( text ).map( stemWord ) );
		[ ...have.entries() ].filter( ( [ g ] ) => tagKey( g ).split( ' ' ).every( ( w ) => toks.has( w ) ) ).sort( ( p, q ) => q[ 1 ] - p[ 1 ] ).forEach( ( [ g ] ) => push( g ) );
		found.slice( 0, MAX ).forEach( ( k ) => push( resolve( k, have ) ) );
		( CAT[ opts.category ] || [] ).forEach( ( k ) => push( resolve( k, have ) ) );
		// learned from their own entries: the tags that went with the same words before
		if ( out.length < room && toks.size ) {
			const score = new Map();
			KINDS.forEach( ( k ) => ( S()[ k ] || [] ).forEach( ( r ) => { if ( ! r.name || ! ( r.tags || [] ).length ) return; const w = tokensOf( r.name ).map( stemWord ); if ( w.some( ( x ) => toks.has( x ) ) ) ( r.tags || [] ).forEach( ( g ) => score.set( g, ( score.get( g ) || 0 ) + 1 ) ); } ) );
			[ ...score.entries() ].filter( ( [ , n ] ) => n >= 2 ).sort( ( p, q ) => q[ 1 ] - p[ 1 ] ).forEach( ( [ g ] ) => push( g ) );
		}
		return out.slice( 0, room );
	};
	EXA.autoTagsSuggest = suggest;

	/* ---------------------------------------------------------------- switching it on and off, and putting it to work */
	const on = () => ( ! EX.feature || EX.feature( 'autoTags' ) !== false ) && S().settings.autoTags !== false && ( ! EX.feature || EX.feature( 'tags' ) !== false );
	/** Add tags to a NEW record that has fewer than three. `kind` is tx, bill, income, budget or goal. Tags the person typed are never touched. */
	const apply = ( rec, kind, extra = {} ) => {
		if ( ! rec || ! on() ) return rec; const have = ( rec.tags || [] ).slice(); if ( have.length >= MAX ) return rec;
		const text = [ rec.name, rec.note || rec.notes, extra.text ].filter( Boolean ).join( ' ' ), cat = rec.category || extra.category;
		const add = suggest( text, { category: cat, room: MAX - have.length, skip: have } ); if ( ! add.length ) return rec;
		rec.tags = have.concat( add ); rec.autoTags = ( rec.autoTags || [] ).concat( add );
		if ( [ 'tx', 'bill', 'income' ].includes( kind ) ) { S().device.atNew = ( S().device.atNew || 0 ) + 1; }
		return rec;
	};
	EXA.autoTags = { on, apply, suggest, vocab: VOCAB, max: MAX };

	/* ---------------------------------------------------------------- improve my tags: scan, preview, apply, undo */
	const records = () => KINDS.flatMap( ( k ) => ( S()[ k ] || [] ).map( ( r ) => ( { k, r } ) ) );
	/** Plan the improvements without changing anything: merges of tags that mean the same, and better auto tags on older entries. */
	const plan = () => {
		const have = allTags(), merges = [], rename = new Map();
		// 1. tags that mean the same: same stem, same vocabulary concept, or one letter apart
		const keys = [ ...have.keys() ], used = new Set();
		const concept = ( g ) => { const kk = tagKey( g ); for ( const v of Object.values( VOCAB ) ) if ( v.alias.some( ( a ) => a.split( ' ' ).map( stemWord ).join( ' ' ) === kk ) ) return v.key; return ''; };
		const lev1 = ( a, b ) => { if ( Math.abs( a.length - b.length ) > 1 || a.length < 5 ) return false; let i = 0, j = 0, d = 0; while ( i < a.length && j < b.length ) { if ( a[ i ] === b[ j ] ) { i++; j++; } else { if ( ++d > 1 ) return false; if ( a.length > b.length ) i++; else if ( b.length > a.length ) j++; else { i++; j++; } } } return d + ( a.length - i ) + ( b.length - j ) <= 1; };
		keys.forEach( ( g ) => {
			if ( used.has( g ) ) return; const group = keys.filter( ( h ) => ! used.has( h ) && ( h === g || tagKey( h ) === tagKey( g ) || ( concept( h ) && concept( h ) === concept( g ) ) || lev1( tagKey( h ), tagKey( g ) ) ) );
			if ( group.length < 2 ) return; group.forEach( ( h ) => used.add( h ) );
			const known = ( h ) => Object.values( VOCAB ).some( ( v ) => v.alias.includes( norm( h ) ) ), best = group.slice().sort( ( p, q ) => ( known( q ) - known( p ) ) || ( have.get( q ) - have.get( p ) ) || q.length - p.length )[ 0 ];
			group.filter( ( h ) => h !== best ).forEach( ( h ) => { rename.set( h, best ); } ); merges.push( { to: best, from: group.filter( ( h ) => h !== best ), n: group.reduce( ( s, h ) => s + have.get( h ), 0 ) } );
		} );
		// 2. entries: apply the merges, then give entries with fewer than three tags the best tags that now exist (only adding, never removing a tag the person typed)
		const changes = [];
		records().forEach( ( { k, r } ) => {
			const before = ( r.tags || [] ).slice(), beforeAuto = ( r.autoTags || [] ).slice(); let tags = before.map( ( g ) => rename.get( g ) || g ).filter( ( g, i, a ) => a.findIndex( ( x ) => tagKey( x ) === tagKey( g ) ) === i );
			let auto = beforeAuto.map( ( g ) => rename.get( g ) || g ).filter( ( g ) => tags.includes( g ) );
			if ( tags.length < MAX && ( r.name || tags.length ) ) { const add = suggest( [ r.name, r.note || r.notes ].filter( Boolean ).join( ' ' ), { category: r.category, room: MAX - tags.length, skip: tags, have } ); if ( add.length ) { tags = tags.concat( add ); auto = auto.concat( add ); } }
			if ( tags.join( '|' ) !== before.join( '|' ) ) changes.push( { k, id: r.id, name: r.name || '', before, beforeAuto, tags, auto } );
		} );
		const added = {}; changes.forEach( ( c ) => c.tags.filter( ( g ) => ! c.before.includes( g ) && ! [ ...rename.values() ].includes( g ) ).forEach( ( g ) => { added[ g ] = ( added[ g ] || 0 ) + 1; } ) );
		return { merges, rename, changes, added };
	};
	const applyPlan = ( p ) => {
		const snap = p.changes.map( ( c ) => ( { k: c.k, id: c.id, tags: c.before, auto: c.beforeAuto } ) );
		p.changes.forEach( ( c ) => { const r = ( S()[ c.k ] || [] ).find( ( x ) => x.id === c.id ); if ( ! r ) return; r.tags = c.tags.slice(); r.autoTags = c.auto.slice(); } );
		if ( Array.isArray( S().settings.tags ) ) S().settings.tags = [ ...new Set( S().settings.tags.map( ( g ) => p.rename.get( g ) || g ) ) ];
		S().device.atUndo = { ts: Date.now(), snap, n: p.changes.length }; S().device.atNew = 0; S().device.atLast = Date.now(); S().settings.u = Date.now(); EX.save();
	};
	const undo = () => {
		const u = S().device.atUndo; if ( ! u ) return false;
		u.snap.forEach( ( c ) => { const r = ( S()[ c.k ] || [] ).find( ( x ) => x.id === c.id ); if ( ! r ) return; r.tags = c.tags.slice(); if ( c.auto.length ) r.autoTags = c.auto.slice(); else delete r.autoTags; } );
		delete S().device.atUndo; S().settings.u = Date.now(); EX.save(); return true;
	};
	EXA.autoTags.plan = plan; EXA.autoTags.applyPlan = applyPlan; EXA.autoTags.undo = undo;
	let pending = null;
	EXA.openImproveTags = () => {
		pending = plan(); const p = pending, X = `<button type="button" class="ab-btn" data-close aria-label="${ esc( t( 'close' ) ) }">${ UI.icon( 'x', 24 ) }</button>`;
		const mergeRows = p.merges.map( ( m ) => `<li>🔀 ${ esc( t( 'atMergeRow', { from: m.from.join( ', ' ), to: m.to } ) ) }</li>` ).join( '' ), addRows = Object.entries( p.added ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, 12 ).map( ( [ g, n ] ) => `<li>🏷️ ${ esc( t( 'atAddRow', { tag: g, n } ) ) }</li>` ).join( '' );
		const body = p.changes.length ? `<p>${ esc( t( 'atPreview', { n: p.changes.length } ) ) }</p>${ mergeRows ? `<h3 class="sub">${ esc( t( 'atMerges' ) ) }</h3><ul class="plain">${ mergeRows }</ul>` : '' }${ addRows ? `<h3 class="sub">${ esc( t( 'atAdds' ) ) }</h3><ul class="plain">${ addRows }</ul>` : '' }<p class="muted small">${ esc( t( 'atSafe' ) ) }</p><div class="btn-row"><button type="button" class="btn btn-primary wide" data-at="apply">✨ ${ esc( t( 'atApply' ) ) }</button></div>` : `<p>${ esc( t( 'atNothing' ) ) }</p>`;
		UI.openSheet( `<div class="sheet-head">${ X }<h2 id="sheetTitle">🏷️ ${ esc( t( 'atTitle' ) ) }</h2><span class="sp"></span></div><div class="sheet-pad">${ body }</div>`, { cls: 'small' } );
	};

	/* ---------------------------------------------------------------- the settings card and the notice on Home */
	EXA.autoTagsCard = () => {
		if ( EX.feature && EX.feature( 'tags' ) === false ) return '';
		const u = S().device.atUndo, off = S().settings.autoTags === false;
		return `<section class="card"><h2>🏷️ ${ esc( t( 'atTitleCard' ) ) }</h2><p class="muted small">${ esc( t( 'atText' ) ) }</p>
			<label class="entry-paid fx-theme"><span><b>${ esc( t( 'atToggle' ) ) }</b><small>${ esc( t( 'atToggleHint' ) ) }</small></span><span class="switch"><input type="checkbox" data-at-toggle${ off ? '' : ' checked' }><i></i></span></label>
			<div class="btn-row"><button type="button" class="btn btn-ghost wide" data-at="improve">✨ ${ esc( t( 'atImprove' ) ) }</button>${ u ? `<button type="button" class="btn btn-ghost wide" data-at="undo">↩️ ${ esc( t( 'atUndo', { n: u.n } ) ) }</button>` : '' }</div></section>`;
	};
	EXA.autoTagsNotice = () => {
		if ( ! on() || ( S().device.atNew || 0 ) < 10 ) return '';
		return `<section class="promo at-notice" data-at-notice><div class="promo-head">${ UI.ci( 'tag', 'teal', 44 ) }<div><b>${ esc( t( 'atNoticeTitle' ) ) }</b><p>${ esc( t( 'atNoticeText' ) ) }</p></div></div><div class="btn-row"><button type="button" class="btn btn-primary" data-at="improve">✨ ${ esc( t( 'atImprove' ) ) }</button><button type="button" class="btn btn-ghost" data-at="later">${ esc( t( 'atLater' ) ) }</button></div></section>`;
	};
	document.addEventListener( 'click', ( e ) => {
		const b = e.target.closest && e.target.closest( '[data-at]' ); if ( ! b ) return; const a = b.dataset.at;
		if ( a === 'improve' ) { e.preventDefault(); EXA.openImproveTags(); }
		else if ( a === 'apply' && pending ) { applyPlan( pending ); pending = null; UI.closeSheet && UI.closeSheet(); UI.toast && UI.toast( t( 'atDone' ) ); }
		else if ( a === 'undo' ) { if ( undo() ) UI.toast && UI.toast( t( 'atUndone' ) ); }
		else if ( a === 'later' ) { S().device.atNew = 0; EX.persist(); const n = document.querySelector( '[data-at-notice]' ); if ( n ) n.remove(); }
	} );
	document.addEventListener( 'change', ( e ) => { const i = e.target.matches && e.target.matches( '[data-at-toggle]' ) ? e.target : null; if ( ! i ) return; S().settings.autoTags = !! i.checked; S().settings.u = Date.now(); EX.save(); } );

	Object.assign( EX.I18N.langs.en, {
		fx_autoTags: 'Auto tags', fxD_autoTags: 'Adds up to three tags to new entries by itself, from a built-in list of 200 everyday things and your own tags.',
		atTitleCard: 'Auto tags', atText: 'New entries, bills, income, budgets, goals and eFriend plans get up to three tags by themselves. The app reuses the tags you already have, and learns from the ones you add. Tags you type are never changed.', atToggle: 'Add tags automatically', atToggleHint: 'Turn off to add tags yourself.',
		atImprove: 'Improve my tags', atUndo: 'Undo the last scan ({n} entries)', atTitle: 'Improve my tags', atPreview: 'This would change {n} entries. Nothing changes until you press the button.', atMerges: 'Tags that mean the same', atMergeRow: '{from} becomes {to}', atAdds: 'Better tags for older entries', atAddRow: '{tag} added to {n} entries',
		atSafe: 'You can undo this right after, from Settings. Tags you typed are never removed.', atApply: 'Apply the improvements', atNothing: 'Your tags already look good. Nothing to change right now.', atDone: 'Your tags are improved. You can undo this in Settings.', atUndone: 'Undone: your tags are back as they were.',
		atNoticeTitle: 'Make your tags better', atNoticeText: 'You added 10 new entries. A quick scan can merge look-alike tags and tag your older entries better, so your tracking gets more accurate.', atLater: 'Not now',
	} );
	Object.assign( EX.I18N.langs.el, {
		fx_autoTags: 'Αυτόματες ετικέτες', fxD_autoTags: 'Προσθέτει μόνο του έως τρεις ετικέτες στις νέες εγγραφές, από μια ενσωματωμένη λίστα 200 καθημερινών πραγμάτων και τις δικές σας ετικέτες.',
		atTitleCard: 'Αυτόματες ετικέτες', atText: 'Οι νέες εγγραφές, οι λογαριασμοί, τα έσοδα, οι προϋπολογισμοί, οι στόχοι και τα σχέδια του eFriend παίρνουν μόνα τους έως τρεις ετικέτες. Η εφαρμογή χρησιμοποιεί τις ετικέτες που έχετε ήδη και μαθαίνει από όσες προσθέτετε. Οι ετικέτες που γράφετε εσείς δεν αλλάζουν ποτέ.', atToggle: 'Αυτόματη προσθήκη ετικετών', atToggleHint: 'Απενεργοποιήστε το για να προσθέτετε εσείς ετικέτες.',
		atImprove: 'Βελτίωση των ετικετών μου', atUndo: 'Αναίρεση της τελευταίας σάρωσης ({n} εγγραφές)', atTitle: 'Βελτίωση των ετικετών μου', atPreview: 'Θα άλλαζαν {n} εγγραφές. Τίποτα δεν αλλάζει μέχρι να πατήσετε το κουμπί.', atMerges: 'Ετικέτες που σημαίνουν το ίδιο', atMergeRow: 'Το {from} γίνεται {to}', atAdds: 'Καλύτερες ετικέτες σε παλαιότερες εγγραφές', atAddRow: 'Το {tag} προστέθηκε σε {n} εγγραφές',
		atSafe: 'Μπορείτε να το αναιρέσετε αμέσως μετά, από τις Ρυθμίσεις. Οι ετικέτες που γράψατε εσείς δεν αφαιρούνται ποτέ.', atApply: 'Εφαρμογή των βελτιώσεων', atNothing: 'Οι ετικέτες σας φαίνονται ήδη καλές. Δεν υπάρχει τίποτα να αλλάξει τώρα.', atDone: 'Οι ετικέτες σας βελτιώθηκαν. Μπορείτε να το αναιρέσετε στις Ρυθμίσεις.', atUndone: 'Αναιρέθηκε: οι ετικέτες σας επανήλθαν όπως ήταν.',
		atNoticeTitle: 'Κάντε τις ετικέτες σας καλύτερες', atNoticeText: 'Προσθέσατε 10 νέες εγγραφές. Μια γρήγορη σάρωση μπορεί να ενώσει παρόμοιες ετικέτες και να βάλει καλύτερες ετικέτες στις παλαιότερες εγγραφές, ώστε η καταγραφή σας να γίνει πιο ακριβής.', atLater: 'Όχι τώρα',
	} );
}() );
