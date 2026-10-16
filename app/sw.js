/* Expenity service worker: the app works offline. Network first, so updates arrive as soon as you are online. */
const CACHE = 'expenity-beta-v11-1792167146';
const FILES = [ './', 'index.html', 'icons.js', 'i18n.js', 'core.js', 'sync.js', 'ui.js', 'views.js', 'forms.js', 'photos.js', 'reports.js', 'plan.js', 'insights.js', 'share.js', 'push.js', 'flow.js', 'themes.js', 'app.js', 'theme.js', 'style.css', 'themes.css', 'favicon.svg', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png' ].map( f => /\.(js|css)$/.test(f) ? f + "?v=mvb61o3k" : f );

self.addEventListener( 'install', ( e ) => {
	e.waitUntil( caches.open( CACHE ).then( ( c ) => c.addAll( FILES ) ).then( () => self.skipWaiting() ) );
} );
self.addEventListener( 'activate', ( e ) => {
	e.waitUntil( caches.keys().then( ( keys ) => Promise.all( keys.filter( ( k ) => k !== CACHE ).map( ( k ) => caches.delete( k ) ) ) ).then( () => self.clients.claim() ) );
} );
self.addEventListener( 'fetch', ( e ) => {
	const req = e.request;
	if ( req.method !== 'GET' || new URL( req.url ).origin !== location.origin ) return; // the API is another origin and is never cached
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
