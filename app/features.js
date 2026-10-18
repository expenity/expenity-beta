/**
 * Features: three ready-made plans (Basic, Pro, Advanced) and a custom mix. Core money tracking is always on. Everything
 * else is a named feature that is shown or hidden: CSS hides the screens (html[data-off]) and a few functions stop doing
 * work. Nothing is ever deleted, so turning a feature off and on again brings every record back.
 */
( function () {
	'use strict';
	const { EX, EXA, UI } = window, { t, esc } = EX;
	const S = () => EX.state();
	const RANK = { basic: 0, pro: 1, advanced: 2 };
	// id, lowest plan that has it, icon, what the CSS hides lives in style.css under [data-off~=id]
	const FEATURES = [
		[ 'recurring', 'pro', 'repeat' ], [ 'plan', 'pro', 'target' ], [ 'tags', 'pro', 'tag' ], [ 'presets', 'pro', 'pin' ],
		[ 'photos', 'pro', 'photo' ], [ 'avatar', 'pro', 'mood-smile' ], [ 'push', 'pro', 'bell' ], [ 'shared', 'pro', 'users' ],
		[ 'receipts', 'advanced', 'receipt' ], [ 'insights', 'advanced', 'bulb' ], [ 'forecast', 'advanced', 'wallet' ],
		[ 'sounds', 'advanced', 'music' ], [ 'homeEdit', 'advanced', 'layout-dashboard' ], [ 'themeEdit', 'advanced', 'pencil' ],
	].map( ( [ id, tier, icon ] ) => ( { id, tier, icon } ) );
	const CORE = [ 'wallets', 'entries', 'categories', 'bills', 'activity', 'reports', 'themes', 'backup' ];
	const PLANS = [ 'basic', 'pro', 'advanced' ];
	const fx = EXA.features = { list: FEATURES, core: CORE, plans: PLANS };
	const cfg = () => { const f = S().settings.features; return f && typeof f === 'object' ? f : { tier: 'advanced' }; };
	const inPlan = ( id, plan ) => RANK[ FEATURES.find( ( f ) => f.id === id ).tier ] <= RANK[ plan ];
	fx.plan = () => { const c = cfg(); return c.tier === 'custom' || PLANS.includes( c.tier ) ? c.tier : 'advanced'; };
	fx.on = ( id ) => { const c = cfg(), plan = fx.plan(); if ( plan === 'custom' ) return !( c.off || [] ).includes( id ); return inPlan( id, plan ); };
	EX.feature = fx.on;
	const save = ( v ) => { const s = S().settings; s.features = v; s.u = Date.now(); EX.persist(); fx.apply(); EXA.render(); };
	fx.apply = () => { document.documentElement.dataset.off = FEATURES.filter( ( f ) => ! fx.on( f.id ) ).map( ( f ) => f.id ).join( ' ' ); };
	fx.choose = ( plan ) => save( plan === 'custom' ? { tier: 'custom', off: FEATURES.filter( ( f ) => ! fx.on( f.id ) ).map( ( f ) => f.id ) } : { tier: plan } );
	let keepOpen = false;
	fx.toggle = ( id ) => {
		keepOpen = true;
		const off = new Set( FEATURES.filter( ( f ) => ! fx.on( f.id ) ).map( ( f ) => f.id ) );
		if ( off.has( id ) ) off.delete( id ); else off.add( id );
		save( { tier: 'custom', off: [ ...off ] } );
	};
	const count = ( plan ) => CORE.length + FEATURES.filter( ( f ) => inPlan( f.id, plan ) ).length;

	// Behaviour that CSS cannot switch off.
	const wrap = ( obj, key, id, empty ) => { const f = obj && obj[ key ]; if ( typeof f !== 'function' ) return; obj[ key ] = function () { return fx.on( id ) ? f.apply( this, arguments ) : empty; }; };
	wrap( EXA, 'ideasHome', 'insights', '' ); wrap( EXA, 'safeHome', 'forecast', '' ); wrap( EXA, 'pushCard', 'push', '' ); wrap( EXA, 'tagsInline', 'tags', '' ); wrap( EXA, 'pinnedEntries', 'presets', '' );
	if ( EXA.avatar ) wrap( EXA.avatar, 'current', 'avatar', null );

	const mark = ( on ) => on ? `<span class="fx-yes" aria-label="${ esc( t( 'fxIncluded' ) ) }">${ UI.icon( 'check', 18 ) }</span>` : `<span class="fx-no" aria-label="${ esc( t( 'fxNotIncluded' ) ) }">–</span>`;
	fx.view = () => {
		const cur = fx.plan();
		const card = ( id ) => `<button type="button" class="fx-plan${ cur === id ? ' on' : '' }" role="radio" aria-checked="${ cur === id }" data-fx-plan="${ id }"><span class="fx-name">${ esc( t( 'fxPlan_' + id ) ) }${ cur === id ? UI.icon( 'check', 18 ) : '' }</span><small>${ esc( t( 'fxPlanD_' + id ) ) }</small><em>${ esc( t( 'fxCount', { n: id === 'custom' ? count( 'custom' ) : count( id ) } ) ) }</em></button>`;
		const tableRows = [ ...CORE.map( ( id ) => `<tr><th scope="row">${ esc( t( 'fxCore_' + id ) ) }</th>${ PLANS.map( () => `<td>${ mark( true ) }</td>` ).join( '' ) }</tr>` ), ...FEATURES.map( ( f ) => `<tr><th scope="row">${ UI.icon( f.icon, 16 ) } ${ esc( t( 'fx_' + f.id ) ) }</th>${ PLANS.map( ( p ) => `<td>${ mark( inPlan( f.id, p ) ) }</td>` ).join( '' ) }</tr>` ) ].join( '' );
		const toggles = FEATURES.map( ( f ) => `<label class="fx-row">${ UI.ci( f.icon, 'teal', 36 ) }<span class="mid"><b>${ esc( t( 'fx_' + f.id ) ) }</b><small>${ esc( t( 'fxD_' + f.id ) ) }</small></span><input type="checkbox" role="switch" data-fx-toggle="${ f.id }"${ fx.on( f.id ) ? ' checked' : '' }></label>` ).join( '' );
		return `<section class="card"><p class="muted small">${ esc( t( 'fxIntro' ) ) }</p><div class="fx-plans" role="radiogroup" aria-label="${ esc( t( 'fxTitle' ) ) }">${ PLANS.map( card ).join( '' ) }${ cur === 'custom' ? card( 'custom' ) : '' }</div></section>
			<details class="card account-section"><summary>${ esc( t( 'fxTable' ) ) }</summary><div><div class="fx-table-wrap"><table class="fx-table"><thead><tr><th></th>${ PLANS.map( ( p ) => `<th scope="col">${ esc( t( 'fxPlan_' + p ) ) }</th>` ).join( '' ) }</tr></thead><tbody>${ tableRows }</tbody></table></div></div></details>
			<details class="card account-section"${ keepOpen ? ' open' : '' }><summary>${ esc( t( 'fxCustom' ) ) }</summary><div><p class="muted small">${ esc( t( 'fxCustomHelp' ) ) }</p><div class="fx-rows">${ toggles }</div></div></details>`;
	};
	document.addEventListener( 'click', ( e ) => { const b = e.target.closest( '[data-fx-plan]' ); if ( ! b ) return; e.preventDefault(); e.stopImmediatePropagation(); if ( b.dataset.fxPlan !== fx.plan() ) { keepOpen = false; fx.choose( b.dataset.fxPlan ); UI.done( t( 'fxSaved' ) ); } }, true );
	document.addEventListener( 'change', ( e ) => { const c = e.target.closest( '[data-fx-toggle]' ); if ( ! c ) return; e.stopImmediatePropagation(); fx.toggle( c.dataset.fxToggle ); }, true );
	fx.apply(); EX.on( 'syncstatus', fx.apply );
}() );
