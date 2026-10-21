/**
 * Gentle ambient motion for a few colour themes: embers rising on Sunset, leaves drifting on Emerald, bubbles and sprinkles on
 * Pastel candy, falling digits on Terminal. It sits behind the content, never takes taps, and is switched off by the
 * Animations setting, by the device's reduced-motion setting and while the app is in the background (EXA.updateTrails calls it).
 */
( function () {
	'use strict';
	const EXA = window.EXA;
	let layer = null, kind = '';
	const rnd = ( a, b ) => a + Math.random() * ( b - a );
	const SPEC = {
		sunset: { n: 9, make: ( el, i ) => { el.className = 'amb-ember'; set( el, { '--x': rnd( 2, 98 ) + '%', '--s': rnd( 4, 10 ) + 'px', '--d': rnd( 9, 17 ) + 's', '--w': ( -rnd( 0, 16 ) ) + 's', '--sway': rnd( -40, 40 ) + 'px' } ); } },
		emerald: { n: 3, make: ( el, i ) => { el.className = 'amb-leaf'; set( el, { '--x': rnd( 0, 100 ) + '%', '--s': rnd( 14, 26 ) + 'px', '--d': rnd( 14, 24 ) + 's', '--w': ( -rnd( 0, 22 ) ) + 's', '--sway': rnd( 30, 120 ) + 'px', '--rot': rnd( 180, 540 ) + 'deg' } ); } },
		candy: { n: 7, make: ( el, i ) => { el.className = i % 3 ? 'amb-bubble' : 'amb-sprinkle'; set( el, { '--x': rnd( 2, 98 ) + '%', '--s': rnd( 10, 34 ) + 'px', '--d': rnd( 10, 20 ) + 's', '--w': ( -rnd( 0, 20 ) ) + 's', '--sway': rnd( -30, 30 ) + 'px', '--rot': rnd( 90, 360 ) + 'deg' } ); } },
		terminal: { n: 5, make: ( el ) => { el.className = 'amb-digits'; el.textContent = Array.from( { length: 12 }, () => ( Math.random() > .5 ? '1' : '0' ) ).join( '\n' ); set( el, { '--x': rnd( 2, 96 ) + '%', '--d': rnd( 9, 20 ) + 's', '--w': ( -rnd( 0, 20 ) ) + 's' } ); } },
		cassette: { n: 6, make: ( el ) => { el.className = 'amb-nixie'; set( el, { '--x': rnd( 4, 96 ) + '%', '--y': rnd( 8, 92 ) + '%', '--s': rnd( 3, 6 ) + 'px', '--d': rnd( 3, 6 ) + 's', '--w': ( -rnd( 0, 6 ) ) + 's' } ); } },
	};
	const set = ( el, vars ) => Object.keys( vars ).forEach( ( k ) => el.style.setProperty( k, vars[ k ] ) );
	EXA.updateAmbient = ( on ) => {
		const skin = EXA.skin ? EXA.skin() : '', spec = SPEC[ skin ];
		if ( ! spec ) { if ( layer ) { layer.remove(); layer = null; kind = ''; } return; }
		if ( kind !== skin || ! layer ) {
			if ( layer ) layer.remove();
			layer = document.createElement( 'div' ); layer.className = 'ambient ambient-' + skin; layer.setAttribute( 'aria-hidden', 'true' );
			for ( let i = 0; i < spec.n; i++ ) { const el = document.createElement( 'i' ); spec.make( el, i ); layer.appendChild( el ); }
			if ( skin === 'sunset' ) { const g = document.createElement( 'b' ); g.className = 'amb-glow'; layer.prepend( g ); }
			document.body.prepend( layer ); kind = skin;
		}
		layer.hidden = ! on;
	};
	if ( EXA.updateTrails ) EXA.updateTrails();
}() );
