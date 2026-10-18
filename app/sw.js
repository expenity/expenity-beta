/* Expenity service worker: the app works offline. Network first, so updates arrive as soon as you are online. */
const CACHE = 'expenity-beta-v44-1792356910';
const FILES = [ 'assets/themes/fonts/alegreya-greek-400.woff2', 'assets/themes/fonts/alegreya-greek-700.woff2', 'assets/themes/fonts/alegreya-greek-ext-400.woff2', 'assets/themes/fonts/alegreya-greek-ext-700.woff2', 'assets/themes/fonts/alegreya-latin-400.woff2', 'assets/themes/fonts/alegreya-latin-700.woff2', 'assets/themes/fonts/alegreya-latin-ext-400.woff2', 'assets/themes/fonts/alegreya-latin-ext-700.woff2', 'assets/themes/fonts/comfortaa-greek-400.woff2', 'assets/themes/fonts/comfortaa-greek-700.woff2', 'assets/themes/fonts/comfortaa-latin-400.woff2', 'assets/themes/fonts/comfortaa-latin-700.woff2', 'assets/themes/fonts/comfortaa-latin-ext-400.woff2', 'assets/themes/fonts/comfortaa-latin-ext-700.woff2', 'assets/themes/fonts/fira-sans-greek-400.woff2', 'assets/themes/fonts/fira-sans-greek-700.woff2', 'assets/themes/fonts/fira-sans-greek-ext-400.woff2', 'assets/themes/fonts/fira-sans-greek-ext-700.woff2', 'assets/themes/fonts/fira-sans-latin-400.woff2', 'assets/themes/fonts/fira-sans-latin-700.woff2', 'assets/themes/fonts/fira-sans-latin-ext-400.woff2', 'assets/themes/fonts/fira-sans-latin-ext-700.woff2', 'assets/themes/fonts/geologica-greek-400.woff2', 'assets/themes/fonts/geologica-greek-700.woff2', 'assets/themes/fonts/geologica-latin-400.woff2', 'assets/themes/fonts/geologica-latin-700.woff2', 'assets/themes/fonts/geologica-latin-ext-400.woff2', 'assets/themes/fonts/geologica-latin-ext-700.woff2', 'assets/themes/fonts/literata-greek-400.woff2', 'assets/themes/fonts/literata-greek-700.woff2', 'assets/themes/fonts/literata-greek-ext-400.woff2', 'assets/themes/fonts/literata-greek-ext-700.woff2', 'assets/themes/fonts/literata-latin-400.woff2', 'assets/themes/fonts/literata-latin-700.woff2', 'assets/themes/fonts/literata-latin-ext-400.woff2', 'assets/themes/fonts/literata-latin-ext-700.woff2', 'assets/themes/fonts/noto-sans-greek-400.woff2', 'assets/themes/fonts/noto-sans-greek-700.woff2', 'assets/themes/fonts/noto-sans-greek-ext-400.woff2', 'assets/themes/fonts/noto-sans-greek-ext-700.woff2', 'assets/themes/fonts/noto-sans-latin-400.woff2', 'assets/themes/fonts/noto-sans-latin-700.woff2', 'assets/themes/fonts/noto-sans-latin-ext-400.woff2', 'assets/themes/fonts/noto-sans-latin-ext-700.woff2', 'assets/themes/fonts/noto-serif-greek-400.woff2', 'assets/themes/fonts/noto-serif-greek-700.woff2', 'assets/themes/fonts/noto-serif-greek-ext-400.woff2', 'assets/themes/fonts/noto-serif-greek-ext-700.woff2', 'assets/themes/fonts/noto-serif-latin-400.woff2', 'assets/themes/fonts/noto-serif-latin-700.woff2', 'assets/themes/fonts/noto-serif-latin-ext-400.woff2', 'assets/themes/fonts/noto-serif-latin-ext-700.woff2', 'assets/themes/fonts/open-sans-greek-400.woff2', 'assets/themes/fonts/open-sans-greek-700.woff2', 'assets/themes/fonts/open-sans-greek-ext-400.woff2', 'assets/themes/fonts/open-sans-greek-ext-700.woff2', 'assets/themes/fonts/open-sans-latin-400.woff2', 'assets/themes/fonts/open-sans-latin-700.woff2', 'assets/themes/fonts/open-sans-latin-ext-400.woff2', 'assets/themes/fonts/open-sans-latin-ext-700.woff2', 'assets/themes/fonts/roboto-greek-400.woff2', 'assets/themes/fonts/roboto-greek-700.woff2', 'assets/themes/fonts/roboto-greek-ext-400.woff2', 'assets/themes/fonts/roboto-greek-ext-700.woff2', 'assets/themes/fonts/roboto-latin-400.woff2', 'assets/themes/fonts/roboto-latin-700.woff2', 'assets/themes/fonts/roboto-latin-ext-400.woff2', 'assets/themes/fonts/roboto-latin-ext-700.woff2', 'assets/themes/fonts/roboto-slab-greek-400.woff2', 'assets/themes/fonts/roboto-slab-greek-700.woff2', 'assets/themes/fonts/roboto-slab-greek-ext-400.woff2', 'assets/themes/fonts/roboto-slab-greek-ext-700.woff2', 'assets/themes/fonts/roboto-slab-latin-400.woff2', 'assets/themes/fonts/roboto-slab-latin-700.woff2', 'assets/themes/fonts/roboto-slab-latin-ext-400.woff2', 'assets/themes/fonts/roboto-slab-latin-ext-700.woff2', './', 'index.html', 'nozoom.js', 'icons.js', 'i18n.js', 'core.js', 'sync.js', 'ui.js', 'views.js', 'forms.js', 'recurrence.js', 'editor-layout.js', 'sound-effects.js', 'catalog.js', 'scan-shortcut.js', 'photos.js', 'avatar.js', 'walletcolor.js', 'features.js', 'rowmenu.js', 'tutorials.js', 'fresh.js', 'contact.js', 'help.js', 'demo.js', 'usage.js', 'reports.js', 'plan.js', 'insights.js', 'safe-spend.js', 'extras.js', 'drafts.js', 'receipts.js', 'share.js', 'push.js', 'flow.js', 'installation.js', 'themes.js', 'app.js', 'enhancements.js', 'dashboard.js', 'productivity.js', 'releases.json', 'theme.js', 'style.css', 'themes.css', 'assets/themes/brick-pencil-v3.webp', 'assets/themes/vader-portrait-v1.webp', 'assets/themes/mario-pencil-v4.png', 'assets/themes/goomba-pencil-v1.png', 'assets/themes/mushroom-pencil-v1.png', 'assets/themes/boo-pencil-v1.png', 'assets/themes/star-pencil-v1.png', 'assets/themes/mickey-minnie-pencil-v1.webp', 'assets/themes/orbit-fighter.svg', 'assets/themes/orbit-cruiser.svg', 'favicon.svg', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'installation/ios-en.mp4', 'installation/ios-en.png', 'installation/ios-el.mp4', 'installation/ios-el.png', 'installation/android-en.mp4', 'installation/android-en.png', 'installation/android-el.mp4', 'installation/android-el.png', 'installation/desktop-en.mp4', 'installation/desktop-en.png', 'installation/desktop-el.mp4', 'installation/desktop-el.png' ].map( f => /\.(js|css)$/.test(f) ? f + "?v=mveb0z5p" : f );

self.addEventListener( 'install', ( e ) => {
	e.waitUntil( caches.open( CACHE ).then( ( c ) => c.addAll( FILES ) ).then( () => self.skipWaiting() ) );
} );
self.addEventListener( 'activate', ( e ) => {
	e.waitUntil( caches.keys().then( ( keys ) => Promise.all( keys.filter( ( k ) => k.startsWith(CACHE.startsWith('expenity-beta-') ? 'expenity-beta-' : 'expenity-v') && k !== CACHE ).map( ( k ) => caches.delete( k ) ) ) ).then( () => self.clients.claim() ) );
} );
self.addEventListener( 'fetch', ( e ) => {
	const req = e.request;
	if ( req.method !== 'GET' || new URL( req.url ).origin !== location.origin ) return; // the API is another origin and is never cached
	// Recognition resources are large: load only on demand and keep them through ordinary app updates.
	if(new URL(req.url).pathname.includes('/vendor/ocr/')){
	 e.respondWith((async()=>{const cache=await caches.open(new URL(req.url).pathname.includes('/paddle/')?'expenity-ocr-paddle-v1':'expenity-ocr-v7-fast-8741641');const hit=await cache.match(req);if(hit)return hit;
	  try{const res=await fetch(req);if(res.ok)await cache.put(req,res.clone());return res;}catch(e){return new Response('',{status:503});}
	 })());return;
	}

	// Video seeking (including offline Safari) needs a partial-content response, not the app HTML fallback.
	if(new URL(req.url).pathname.endsWith('.mp4')){
		e.respondWith((async()=>{
			const cache=await caches.open(CACHE);let full=await cache.match(req.url,{ignoreSearch:true});
			if(!full){try{full=await fetch(req.url);if(!full.ok)return full;if(full.status===200)await cache.put(req.url,full.clone());}catch(error){return new Response('',{status:503});}}
			const range=req.headers.get('Range');if(!range)return full;
			const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match)return new Response('',{status:416});
			const bytes=await full.arrayBuffer(),length=bytes.byteLength;
			const start=match[1]?Number(match[1]):Math.max(0,length-Number(match[2]));
			const end=match[1]&&match[2]?Math.min(length-1,Number(match[2])):length-1;
			if(start>=length||end<start||(!match[1]&&!match[2]))return new Response('',{status:416,headers:{'Content-Range':`bytes */${length}`}});
			return new Response(bytes.slice(start,end+1),{status:206,headers:{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${length}`,'Content-Length':String(end-start+1)}});
		})());return;
	}
	e.respondWith(
		fetch( req ).then( ( res ) => {
			const copy = res.clone();
			caches.open( CACHE ).then( ( c ) => c.put( req, copy ) );
			return res;
		} ).catch( () => caches.match( req ).then( ( hit ) => hit || caches.match( './' ) ) )
	);
} );
// A push message from the server: show it. (The browser requires that every push shows a notification.)
self.addEventListener( 'push', ( e ) => {
	let m = {};
	try { m = e.data ? e.data.json() : {}; } catch ( err ) { m = { title: 'Expenity', body: e.data ? e.data.text() : '' }; }
	e.waitUntil( self.registration.showNotification( m.title || 'Expenity', { body: m.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: m.tag || 'expenity', data: { url: m.url || './' } } ) );
} );
self.addEventListener( 'notificationclick', ( e ) => {
	e.notification.close();
	const url = ( e.notification.data && e.notification.data.url ) || './';
	e.waitUntil( self.clients.matchAll( { type: 'window', includeUncontrolled: true } ).then( ( list ) => ( list.length ? list[ 0 ].focus() : self.clients.openWindow( url ) ) ) );
} );
