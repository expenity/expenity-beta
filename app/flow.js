/**
 * Expenity first-run flow, in this order and nothing before it:
 *   welcome (sign in or create an account) -> install (animated "add to home screen" guide) -> setup wizard -> the app.
 * Every step after the welcome can be skipped. Progress is saved on the device, so quitting halfway resumes. No wallets,
 * transactions or bills are possible until the flow is done or skipped.
 */
( function () {
	'use strict';
	const EX = window.EX, UI = window.UI, EXA = window.EXA;
	const { t, esc } = EX;
	const S = EX.state;
	const $ = ( s, r = document ) => r.querySelector( s );
	const $$ = ( s, r = document ) => [ ...r.querySelectorAll( s ) ];
	const D = () => S().device;
	const flow = ( EXA.flow = {} );
	let platform = null, busy = false;
	const W = { step: 0, wallets: null, curQuery: '' };
	// The goal step only appears for people who said they want to save for something.
	const steps = () => [ 'name', 'currency', 'aims' ].concat( ( S().settings.aims || [] ).includes( 'save' ) ? [ 'goal' ] : [] ).concat( [ 'plan', 'wallets' ] ).concat( EX.feature && EX.feature( 'daily' ) === false ? [] : [ 'target' ] ).concat( [ 'look', 'tour' ] ).concat( EX.feature && EX.feature( 'receipts' ) === false ? [] : [ 'scan' ] ).concat( [ 'quick', 'extras', 'help' ] ).concat( UI.isPhone() ? [ 'tips' ] : [] ).concat( [ 'done' ] );
	const GOAL_PRESETS = [ [ 'trip', 'plane' ], [ 'car', 'car' ], [ 'gift', 'gift' ], [ 'home', 'home' ], [ 'emergency', 'heart' ], [ 'other', 'target' ] ];

	/* ------------------------------------------------------------------ Stage machine */

	const needsInstall = () => ! UI.isStandalone() && ! D().installDismissed;
	flow.active = () => [ 'welcome', 'install', 'setup', 'loading' ].includes( D().stage );
	flow.init = () => {
		const d = D();
		if ( UI.isStandalone() && d.stage === 'install' ) { d.installDismissed = true; d.stage = S().settings.setupDone ? 'done' : 'setup'; }
		if ( d.onboarded && ! d.stage ) d.stage = 'done'; // devices from before this flow
		if ( EX.auth.isSignedIn() && ! d.stage ) d.stage = 'done';
		if ( ! d.stage ) d.stage = ( S().bills.length || S().txs.length || S().accounts.some( ( a ) => ! a.auto ) ) ? 'done' : 'welcome'; // people who already had data on this device keep it
		EX.persist();
		if ( d.stage === 'done' ) EX.ensureWallet();
		flow.show();
	};
	const setStage = ( stage ) => { D().stage = stage; EX.persist(); flow.show(); };
	/** Used by tests and screenshots to jump straight into the app. */
	EXA.skipFlow = () => { const d = D(); d.stage = 'done'; d.onboarded = true; S().settings.setupDone = true; EX.ensureWallet(); EX.save(); flow.show(); };
	flow.show = ( keep ) => {
		const host = $( '#flow' ); const prev = host.scrollTop;
		const stage = D().stage;
		const on = flow.active();
		host.hidden = ! on;
		document.body.classList.toggle( 'in-flow', on );
		if ( ! on ) { host.innerHTML = ''; return; }
		if ( stage === 'welcome' ) welcome();
		else if ( stage === 'install' ) install();
		else if ( stage === 'setup' ) setup();
		else loading();
		const logo = $( '#flow #flowLogo' ); if ( logo && EXA.logoSvg ) logo.innerHTML = EXA.logoSvg;
		host.scrollTop = keep ? prev : 0;
	};
	const afterAuth = () => {
		if ( needsInstall() ) return setStage( 'install' );
		if ( S().settings.setupDone ) return finish();
		return startSetup();
	};
	flow.restart = () => startSetup();
	const startSetup = () => { W.planSeen = false; W.tgt = null; W.step = Math.min( D().setupStep || 0, steps().length - 1 ); W.wallets = null; setStage( 'setup' ); };
	function finish() {
		const d = D();
		d.stage = 'done'; d.onboarded = true;
		S().settings.setupDone = true;
		EX.ensureWallet();
		EX.save();
		flow.show();
		EXA.go( 'home' );
		setTimeout( () => EXA.tutorials && EXA.tutorials.maybeStart(), 700 );
		if ( EXA.tryJoin ) EXA.tryJoin();
	}

	/* ------------------------------------------------------------------ 1. Welcome: sign in or create an account */

	const langChips = () => `<div class="flow-lang" role="group">${ Object.keys( EX.I18N.langs ).map( ( k ) => `<button type="button" class="chip${ k === EX.lang() ? ' on' : '' }" data-lang="${ k }" lang="${ k }">${ esc( EX.I18N.langs[ k ].langName ) }</button>` ).join( '' ) }</div>`;
	const moneyScene = () => `<div class="money-scene" aria-hidden="true"><span class="scene-glow"></span><div class="scene-balance"><small>${esc(t('ovBalance'))}</small><b>${esc(EX.money(1240,'EUR'))}</b><div class="scene-bars"><i></i><i></i><i></i><i></i><i></i><i></i></div></div><div class="scene-expense">${UI.ci('coffee','amber',36)}<span>${esc(t('tourSampleName'))}<b>−${esc(EX.money(3.5,'EUR'))}</b></span>${UI.icon('check',18)}</div><div class="scene-goal">${UI.ci('target','pink',36)}<span>${esc(t('planGoals'))}<b>64%</b><i></i></span></div></div>`;

	/** First time only: for about a second the screen is locked and the language flips to the other one and back, to draw the eye to the language buttons. */
	function langAttention() {
		const d = D(); if ( d.langHinted ) return; d.langHinted = true; EX.persist();
		const keys = Object.keys( EX.I18N.langs ), orig = EX.lang(), other = keys.find( ( k ) => k !== orig ); if ( ! other ) return;
		const f = $( '#flow' ); f.classList.add( 'lang-attn' );
		setTimeout( () => EX.setLang( other ), 250 );
		setTimeout( () => EX.setLang( orig ), 850 );
		setTimeout( () => f.classList.remove( 'lang-attn' ), 1150 );
	}
	function welcome() {
		const first = ! D().langHinted;
		$( '#flow' ).innerHTML = `<div class="flow-card welcome">
			<div class="flow-top"><span class="brand-row"><span id="flowLogo"></span><b class="brand-name">Expen<i>ity</i></b></span>${ langChips() }</div>
			<div class="flow-body">
				${ moneyScene() }
				<h1>${ esc( t( 'onbWelcomeTitle' ) ) }</h1><p class="lead">${ esc( t( 'flowWelcomeText' ) ) }</p>${ EXA.pendingJoin && EXA.pendingJoin() ? `<p class="joinnote">${ UI.icon( 'users', 18 ) } ${ esc( t( 'joinNeedAccount' ) ) }</p>` : '' }
				<form id="flowRegister" novalidate><label class="f"><span class="sr">${ esc( t( 'authEmail' ) ) }</span><input name="email" type="email" autocomplete="email" placeholder="${ esc( t( 'flowEmailPh' ) ) }" required aria-label="${ esc( t( 'authEmail' ) ) }"></label>
					<p class="err" id="flowErr" role="alert" hidden></p>
					<button type="submit" class="btn btn-primary big wide">${ UI.icon( 'key', 22 ) } ${ esc( t( 'flowCreate' ) ) }</button></form>
				<p class="or"><span>${ esc( t( 'flowHaveAccount' ) ) }</span></p>
				<button type="button" class="btn btn-ghost big wide" data-flow="signin">${ esc( t( 'authSignIn' ) ) }</button>
				<p class="muted small center trust">${ esc( t( 'flowTrust' ) ) }</p>
			</div>
			<div class="flow-foot"><button type="button" class="link" data-flow="recover">${ esc( t( 'flowLost' ) ) }</button><button type="button" class="link" data-flow="guest">${ esc( t( 'flowGuest' ) ) }</button></div></div>`;
		if ( first ) langAttention();
	}
	const flowErr = ( code ) => { const e = $( '#flowErr' ); if ( e ) { e.textContent = EXA.errText( code ); e.hidden = false; } else UI.toast( EXA.errText( code ) ); };
	async function guarded( fn ) {
		if ( busy ) return;
		busy = true;
		const btns = $$( '#flow button' ); btns.forEach( ( b ) => { b.disabled = true; } );
		try { await fn(); } finally { busy = false; btns.forEach( ( b ) => { if ( b.isConnected ) b.disabled = false; } ); }
	}
	async function waitForSync() {
		for ( let i = 0; i < 60; i++ ) { if ( [ 'ok', 'error', 'offline' ].includes( EX.sync.status ) ) return; await new Promise( ( r ) => setTimeout( r, 250 ) ); }
	}
	const register = ( email ) => guarded( async () => {
		const r = await EX.auth.register( email );
		if ( r.error ) return flowErr( r.error );
		EXA.showCodes( r.recoveryCodes, () => afterAuth() );
	} );
	const login = () => guarded( async () => {
		const r = await EX.auth.login();
		if ( r.error ) return flowErr( r.error );
		D().stage = 'loading'; EX.persist(); flow.show(); // an existing account: its data arrives first
		await waitForSync();
		afterAuth();
	} );
	flow.onClick = ( e ) => {
		const el = e.target.closest( '[data-flow], [data-fstep]' );
		if ( ! el ) return false;
		if ( el.dataset.flow ) {
			const a = el.dataset.flow;
			if ( a === 'signin' ) login();
			else if ( a === 'recover' ) EXA.openAuth( 'recover' );
			else if ( a === 'guest' ) { D().guest = true; afterAuth(); }
			else if ( a === 'install-done' ) { if(UI.isStandalone()) { D().installDismissed=true; S().settings.setupDone ? finish() : startSetup(); } else EXA.installHandoff(); }
			else if ( a === 'install-skip' ) { EXA.confirm({title: EXA.label('browserTitle'), text: EXA.label('browserWarning'), confirm: t('instSkip'), danger:false}).then(ok=>{if(ok){D().installDismissed=true; S().settings.setupDone ? finish() : startSetup();}}); }
			else if ( a === 'install-now' && EXA.installEvent ) { EXA.installEvent.prompt(); EXA.installEvent.userChoice.then( choice => { EXA.installEvent = null; if(choice.outcome === 'accepted') EXA.installHandoff(); else flow.show(); } ).catch(()=>flow.show()); }
			else if ( a === 'skip-setup' ) finish();
			else if ( a === 'next' ) next();
			else if ( a === 'back' ) back();
			else if ( a === 'skip' ) { W.step += 1; D().setupStep = W.step; EX.persist(); flow.show(); }
			else if ( a === 'start' ) finish();
			else if ( a === 'add-goal' ) { readGoals(); ( W.goals = W.goals || [] ).push( { name: '', target: '', icon: 'target', preset: '' } ); flow.show( true ); }
			else if ( a === 'rm-goal' ) { readGoals(); W.goals.splice( Number( el.dataset.i ), 1 ); flow.show( true ); }
			else if ( a === 'add-wallet' ) { readWallets(); W.wallets.push( { type: 'other', on: true, name: '', opening: '' } ); flow.show(); }
			return true;
		}
		return false;
	};
	flow.onSubmit = ( f ) => {
		if ( f.id === 'flowRegister' ) { register( f.elements.email.value.trim() ); return true; }
		if ( f.id === 'setupForm' ) { next(); return true; }
		return false;
	};

	/* ------------------------------------------------------------------ 2. Install: an animated guide */

	function install() {
		if ( ! platform ) platform = EXA.installPlatform();
		const tab = ( id, label ) => `<button type="button" class="${ platform === id ? 'on' : '' }" data-fstep="plat" data-plat="${ id }" role="tab" aria-selected="${ platform === id }">${ esc( label ) }</button>`;
		$( '#flow' ).innerHTML = `<div class="flow-card install">
			<div class="flow-top"><span class="brand-row"><span id="flowLogo"></span></span><span class="flow-count">${ esc( t( 'stepOf', { n: 1, total: 2 } ) ) }</span></div>
			<div class="flow-body">
				<h1>${ esc( t( 'installTitle' ) ) }</h1><p class="lead">${ esc( t( 'instWhy' ) ) }</p>
				<div class="segm" role="tablist">${ tab( 'ios', t( 'platIos' ) ) }${ tab( 'android', t( 'platAndroid' ) ) }${ tab( 'desktop', t( 'platDesktop' ) ) }</div>
				<div class="install-video-guide plat-${platform}">${EXA.installVideoMarkup(platform)}</div>
			</div>
			<div class="flow-actions">${ EXA.installEvent ? `<button type="button" class="btn btn-primary big" data-flow="install-now">${ UI.icon( 'download', 22 ) } ${ esc( t( 'instNow' ) ) }</button>` : '' }<button type="button" class="btn ${ EXA.installEvent ? 'btn-ghost' : 'btn-primary' } big" data-flow="install-done">${ esc( t( 'instDone' ) ) }</button><button type="button" class="btn btn-text" data-flow="install-skip">${ esc( t( 'instSkip' ) ) }</button></div></div>`;
	}
	flow.onPlatform = ( p ) => { platform = p; flow.show(); };

	/* ------------------------------------------------------------------ 3. Setup wizard */

	const COMMON = [ 'EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'TRY', 'AED', 'SAR', 'ILS', 'EGP', 'INR', 'CNY', 'HKD', 'SGD', 'NZD', 'ZAR', 'BRL', 'MXN' ];
	const curName = ( c ) => { try { return new Intl.DisplayNames( [ EX.loc() || 'en' ], { type: 'currency' } ).of( c ); } catch ( e ) { return c; } };
	const curSym = ( c ) => { try { return ( new Intl.NumberFormat( EX.loc(), { style: 'currency', currency: c } ).formatToParts( 0 ).find( ( p ) => p.type === 'currency' ) || {} ).value || c; } catch ( e ) { return c; } };
	const defaultWallets = () => [ { type: 'cash', on: true, name: t( 'wCash' ), opening: '' }, { type: 'bank', on: true, name: t( 'wtBank' ), opening: '' }, { type: 'card', on: false, name: t( 'wtCard' ), opening: '' }, { type: 'savings', on: false, name: t( 'wtSavings' ), opening: '' } ];
	function readGoals() {
		$$( '#setupForm [data-grow]' ).forEach( ( r ) => { const g = ( W.goals || [] )[ Number( r.dataset.grow ) ]; if ( g ) { g.name = r.querySelector( '[name=gname]' ).value; g.target = r.querySelector( '[name=gtarget]' ).value; } } );
	}
	function readWallets() {
		$$( '#setupForm [data-wrow]' ).forEach( ( r ) => {
			const i = Number( r.dataset.wrow ), w = W.wallets[ i ];
			if ( ! w ) return;
			w.on = r.querySelector( '[name=on]' ).checked; w.name = r.querySelector( '[name=wname]' ).value; w.opening = r.querySelector( '[name=wopening]' ).value;
		} );
	}
	function setup() {
		const id = steps()[ W.step ];
		if ( id === 'wallets' && ! W.wallets ) W.wallets = defaultWallets();
		const total = steps().length - 1;
		const progress = `<div class="flow-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${ total }" aria-valuenow="${ Math.min( W.step, total ) }"><i style="width:${ Math.round( ( Math.min( W.step, total ) / total ) * 100 ) }%"></i></div>`;
		let body = '', icon = 'user-circle', color = 'teal', title = '', text = '';
		if ( id === 'name' ) {
			icon = 'user-circle'; title = t( 'setupNameTitle' ); text = t( 'setupNameText' );
			body = `<label class="f"><span class="sr">${ esc( t( 'setupNamePh' ) ) }</span><input name="name" maxlength="40" autocomplete="given-name" placeholder="${ esc( t( 'setupNamePh' ) ) }" value="${ esc( S().settings.name || '' ) }" aria-label="${ esc( t( 'setupNamePh' ) ) }"></label>`;
		} else if ( id === 'currency' ) {
			icon = 'coin'; color = 'amber'; title = t( 'setupCurTitle' ); text = t( 'setupCurText' );
			const q = EX.fold( W.curQuery || '' );
			const list = COMMON.concat( [ S().settings.currency ] ).filter( ( c, i, a ) => a.indexOf( c ) === i ).filter( ( c ) => ! q || EX.fold( c + ' ' + curName( c ) ).includes( q ) );
			body = `<div class="searchbar">${ UI.icon( 'search', 22 ) }<input id="curSearch" type="search" value="${ esc( W.curQuery || '' ) }" placeholder="${ esc( t( 'setupSearch' ) ) }" aria-label="${ esc( t( 'setupSearch' ) ) }" autocomplete="off"></div>
				<div class="cur-grid" role="radiogroup">${ list.map( ( c ) => `<button type="button" class="cur${ c === S().settings.currency ? ' on' : '' }" data-fstep="cur" data-cur="${ c }" role="radio" aria-checked="${ c === S().settings.currency }"><b>${ esc( curSym( c ) ) }</b><span>${ c }</span><small>${ esc( curName( c ) ) }</small></button>` ).join( '' ) }</div>`;
		} else if ( id === 'aims' ) {
			icon = 'target'; color = 'pink'; title = t( 'aimsSetupTitle' ); text = t( 'aimsSetupText' );
			if ( ! W.aimsSeen && ! ( S().settings.aims || [] ).length ) S().settings.aims = [ 'track' ]; W.aimsSeen = true; // one is already chosen to show that more than one can be
			const on = S().settings.aims || [];
			body = `<p class="multi-hint">${ UI.icon( 'checkbox', 18 ) } ${ esc( t( 'aimsMulti', { n: on.length } ) ) }</p><div class="aims">${ EX.ideas.AIMS.map( ( a ) => `<button type="button" class="aim${ on.includes( a.id ) ? ' on' : '' }" data-fstep="aim" data-aim="${ a.id }" aria-pressed="${ on.includes( a.id ) }">${ UI.ci( a.icon, a.color, 36 ) }<span>${ esc( t( 'aim_' + a.id ) ) }</span><i class=\"tick\" aria-hidden=\"true\">${ on.includes( a.id ) ? UI.icon( 'check', 18 ) : '' }</i></button>` ).join( '' ) }</div>`;
		} else if ( id === 'goal' ) {
			icon = 'plane'; color = 'pink'; title = t( 'goalSetupTitle' ); text = t( 'goalSetupText' );
			if ( ! W.goals ) W.goals = [];
			const used = ( k ) => W.goals.some( ( g ) => g.preset === k );
			body = `<div class="chips wrap" role="group" aria-label="${ esc( t( 'goalSetupTitle' ) ) }">${ GOAL_PRESETS.filter( ( p ) => p[ 0 ] !== 'other' ).map( ( [ k, ic ] ) => `<button type="button" class="chip big${ used( k ) ? ' on' : '' }" data-fstep="gpreset" data-k="${ k }" data-ic="${ ic }" aria-pressed="${ used( k ) }">${ UI.icon( used( k ) ? 'check' : ic, 20 ) } ${ esc( t( 'goalPreset_' + k ) ) }</button>` ).join( '' ) }</div>
				<div class="grows">${ W.goals.map( ( g, i ) => `<div class="grow" data-grow="${ i }">${ UI.ci( g.icon || 'target', 'pink', 44 ) }<input name="gname" maxlength="60" autocomplete="off" value="${ esc( g.name ) }" placeholder="${ esc( t( 'goalName' ) ) }" aria-label="${ esc( t( 'goalName' ) ) }"><input name="gtarget" inputmode="decimal" autocomplete="off" value="${ esc( g.target ) }" placeholder="${ esc( S().settings.currency ) } 0.00" aria-label="${ esc( t( 'goalTarget' ) ) }"><button type="button" class="ab-btn" data-flow="rm-goal" data-i="${ i }" aria-label="${ esc( t( 'del' ) ) }">${ UI.icon( 'x', 20 ) }</button></div>` ).join( '' ) }</div>
				<button type="button" class="btn btn-ghost" data-flow="add-goal">${ UI.icon( 'plus', 20 ) } ${ esc( t( W.goals.length ? 'setupAnotherGoal' : 'setupFirstGoal' ) ) }</button><p class="err" id="setupErr" role="alert" hidden></p>`;
		} else if ( id === 'wallets' ) {
			icon = 'wallet'; color = 'green'; title = t( 'setupWalletsTitle' ); text = t( 'setupWalletsText' );
			body = `<div class="wrows">${ W.wallets.map( ( w, i ) => `<div class="wrow${ w.on ? ' on' : '' }" data-wrow="${ i }">${ UI.ci( EX.WALLET_ICON[ w.type ] || 'wallet', 'teal', 44 ) }<label class="switch"><input type="checkbox" name="on"${ w.on ? ' checked' : '' } aria-label="${ esc( w.name || t( 'wtOther' ) ) }"><i></i></label>
				<input name="wname" maxlength="40" value="${ esc( EX.accountName(w) ) }" placeholder="${ esc( t( 'wName' ) ) }" aria-label="${ esc( t( 'wName' ) ) }"><input name="wopening" inputmode="decimal" value="${ esc( w.opening ) }" placeholder="${ esc( curSym( S().settings.currency ) ) } 0.00" aria-label="${ esc( t( 'wOpening' ) ) }"></div>` ).join( '' ) }</div>
				<button type="button" class="btn btn-ghost" data-flow="add-wallet">${ UI.icon( 'plus', 20 ) } ${ esc( t( 'setupAnother' ) ) }</button><p class="err" id="setupErr" role="alert" hidden></p>`;
		} else if ( id === 'look' ) {
			icon = 'palette'; color = 'pink'; title = t( 'setupLookTitle' ); text = t( 'setupLookText' );
			const mo = D().motion || 'auto';
			const mt = ( v, label ) => `<button type="button" class="chip big${ mo === v ? ' on' : '' }" data-fstep="motion" data-motion="${ v }">${ esc( label ) }</button>`;
			body = `${ EXA.themePicker() }<div class="lbl pad0">${ esc( t( 'setupMotion' ) ) }</div><div class="chips wrap">${ mt( 'auto', t( 'motionAuto' ) ) }${ mt( 'full', t( 'motionFull' ) ) }${ mt( 'reduced', t( 'motionReduced' ) ) }${ mt( 'off', t( 'motionOff' ) ) }</div>`;
		} else if ( id === 'tour' ) {
			icon='sparkles';color='purple';title=t('tourTitle');text=t('tourText');
			body=`<div class="tour-grid">${[['home','layout-dashboard','tourHome','tourHomeText'],['activity','arrows-sort','tourActivity','tourActivityText'],['plan','target','planTitle','tourPlanText'],['reports','chart-pie','tabReports','tourReportsText']].map(([id,ic,label,copy],i)=>`<article style="--tour-i:${i}">${UI.ci(ic,['teal','blue','pink','amber'][i],44)}<div><h2>${esc(t(label))}</h2><p>${esc(t(copy))}</p></div></article>`).join('')}</div>`;
		} else if ( id === 'scan' || id === 'quick' ) {
			icon = id === 'scan' ? 'receipt' : 'pencil'; color = id === 'scan' ? 'teal' : 'blue'; title = t( 'tut_' + id ); text = t( 'tutD_' + id );
			body = EXA.tutorials.body( id );
		} else if ( id === 'plan' ) {
			icon = 'sparkles'; color = 'teal'; title = t( 'setupPlanTitle' ); text = t( 'setupPlanText' );
			const cur = EXA.features.plan();
			body = `<div class="fx-plans" role="radiogroup">${ [ 'basic', 'pro', 'advanced' ].map( ( p ) => `<button type="button" class="fx-plan${ cur === p ? ' on' : '' }" role="radio" aria-checked="${ cur === p }" data-fstep="plan" data-plan="${ p }"><span class="fx-name">${ esc( t( 'fxPlan_' + p ) ) }${ cur === p ? UI.icon( 'check', 18 ) : '' }</span><small>${ esc( t( 'fxPlanD_' + p ) ) }</small></button>` ).join( '' ) }</div><p class="muted small center">${ esc( t( 'setupPlanNote' ) ) }</p>`;
		} else if ( id === 'target' ) {
			icon = 'sun'; color = 'amber'; title = t( 'setupTargetTitle' ); text = t( 'setupTargetText' );
			const g = W.tgt || ( W.tgt = { period: ( ( S().settings.targets || {} ).spend || {} ).period || 'auto', amount: ( ( S().settings.targets || {} ).spend || {} ).amount || '' } );
			const c = ( v, label ) => `<button type="button" class="chip big${ g.period === v ? ' on' : '' }" role="radio" aria-checked="${ g.period === v }" data-fstep="tgt" data-tgt="${ v }">${ esc( t( label ) ) }</button>`;
			body = `<div class="chips wrap" role="radiogroup">${ c( 'auto', 'targetAuto' ) }${ c( 'day', 'targetDay' ) }${ c( 'week', 'targetWeek' ) }${ c( 'month', 'targetMonth' ) }</div>${ g.period === 'auto' ? `<p class="muted small center">${ esc( t( 'setupTargetAuto' ) ) }</p>` : `<label class="f"><span>${ esc( t( 'targetAmount', { cur: S().settings.currency } ) ) }</span><input name="target" inputmode="decimal" value="${ esc( g.amount ) }" placeholder="0"></label>` }${ EXA.tutorials.demo( 'daily' ) }`;
		} else if ( id === 'extras' ) {
			icon = 'sparkles'; color = 'purple'; title = t( 'setupExtrasTitle' ); text = t( 'setupExtrasText' );
			body = EXA.tutorials.carousel();
		} else if ( id === 'help' ) {
			icon = 'help-circle'; color = 'amber'; title = t( 'setupHelpTitle' ); text = t( 'setupHelpText' );
			body = `<div class="help-demo" aria-hidden="true"><div class="hd-bar"><i></i><span class="help-ic demo">${ UI.icon( 'help-circle', 26 ) }</span><s class="hd-av"></s></div><div class="hd-screen"><div class="hd-row"></div><div class="hd-row"></div><div class="hd-pop"><b></b><u></u><u></u></div></div></div>
				<ul class="tip-list"><li>${ UI.icon( 'help-circle', 20 ) } ${ esc( t( 'setupHelpTip1' ) ) }</li><li>${ UI.icon( 'player-play', 20 ) } ${ esc( t( 'setupHelpTip2' ) ) }</li><li>${ UI.icon( 'mail', 20 ) } ${ esc( t( 'setupHelpTip3' ) ) }</li></ul>`;
		} else if ( id === 'tips' ) {
			icon = 'arrows-exchange'; color = 'blue'; title = t( 'setupTipsTitle' ); text = t( 'setupTipsText' );
			const row = ( cls, ic, tint, name, amt ) => `<div class="mock-sw ${ cls }"><div class="mb"><div class="l"><span class="mact paid">${ UI.icon( 'check', 20 ) }<b>${ esc( t( 'actPaid' ) ) }</b></span></div><div class="r"><span class="mact edit">${ UI.icon( 'pencil', 20 ) }<b>${ esc( t( 'actEdit' ) ) }</b></span><span class="mact del">${ UI.icon( 'trash', 20 ) }<b>${ esc( t( 'actDelete' ) ) }</b></span></div></div><div class="front">${ UI.ci( ic, tint, 40 ) }<span class="mid"><b>${ esc( name ) }</b><small>${ esc( t( 'relTomorrow' ) ) }</small></span><span class="a">${ amt }</span></div></div>`;
			body = `<div class="swipe-demo" aria-hidden="true">${ row( 'a', 'device-tv', 'purple', t('tourSubscription'), EX.money(15.99,'EUR') ) }${ row( 'b', 'home', 'blue', t( 'tplRent' ), '€850' ) }<span class="sfinger fa"></span><span class="sfinger fb"></span></div>
				<ul class="tip-list"><li>${ UI.icon( 'arrow-left', 20 ) } ${ esc( t( 'tipLeft' ) ) }</li><li>${ UI.icon( 'arrow-right', 20 ) } ${ esc( t( 'tipRight' ) ) }</li><li>${ UI.icon( 'hand-click', 20 ) } ${ esc( t( 'tipTap' ) ) }</li></ul>`;
		} else {
			icon = 'circle-check'; color = 'green'; title = t( 'setupDoneTitle', { name: ( S().settings.name || '' ).trim() } ); text = t( 'setupDoneText' );
		}
		const last = id === 'done';
		$( '#flow' ).innerHTML = `<div class="flow-card setup">
			<div class="flow-top">${ W.step > 0 && ! last ? `<button type="button" class="ab-btn" data-flow="back" aria-label="${ esc( t( 'back' ) ) }">${ UI.icon( 'arrow-left', 24 ) }</button>` : '<span class="ab-btn ghost"></span>' }${ progress }${ last ? '<span class="ab-btn ghost"></span>' : `<button type="button" class="link" data-flow="skip-setup">${ esc( t( 'skipSetup' ) ) }</button>` }</div>
			<form id="setupForm" class="flow-body" novalidate>
				<div class="hero-art small" aria-hidden="true">${ UI.ci( icon, color, last ? 112 : 84 ) }${ last ? '<span class="confetti"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>' : '' }</div>
				<h1>${ esc( title ) }</h1><p class="lead">${ esc( text ) }</p>${ body }</form>
			<div class="flow-actions">${ last ? `<button type="button" class="btn btn-primary big" data-flow="start">${ esc( t( 'setupStart' ) ) }</button>` : `<button type="button" class="btn btn-primary big" data-flow="next">${ esc( t( 'onbNext' ) ) }</button><button type="button" class="btn btn-text" data-flow="skip">${ esc( t( 'skipStep' ) ) }</button>` }</div></div>`;
	}
	function back() { W.step = Math.max( 0, W.step - 1 ); D().setupStep = W.step; EX.persist(); flow.show(); }
	function next() {
		const id = steps()[ W.step ];
		if ( id === 'name' ) { const n = $( '#setupForm [name=name]' ); S().settings.name = n ? n.value.trim() : ''; EX.persist(); }
		if ( id === 'target' ) {
			const i = $( '#setupForm [name=target]' ), g = W.tgt || { period: 'auto' }; if ( i ) g.amount = i.value;
			if ( g.period !== 'auto' ) { if ( ! /^\d{1,9}([.,]\d{1,2})?$/.test( String( g.amount ).trim() ) || parseFloat( String( g.amount ).replace( ',', '.' ) ) <= 0 ) { const e = $( '#setupErr' ); if ( e ) { e.textContent = t( 'targetBad' ); e.hidden = false; } return; } }
			const st = S().settings; st.targets = { spend: { period: g.period, amount: g.period === 'auto' ? '' : String( g.amount ).trim().replace( ',', '.' ) }, income: ( st.targets || {} ).income || { period: 'off', amount: '' } }; EX.persist();
		}
		if ( id === 'goal' ) {
			readGoals();
			const err = ( k ) => { const e = $( '#setupErr' ); e.textContent = t( k ); e.hidden = false; };
			const rows = ( W.goals || [] ).filter( ( g ) => g.name.trim() || g.target.trim() );
			for ( const g of rows ) { if ( ! g.name.trim() ) return err( 'errNameReq' ); if ( ! /^\d+(\.\d{1,2})?$/.test( g.target.trim().replace( ',', '.' ) ) || Number( g.target.replace( ',', '.' ) ) <= 0 ) return err( 'errAmount' ); }
			rows.forEach( ( g ) => { if ( ! S().goals.some( ( x ) => x.name === g.name.trim() ) ) S().goals.push( { id: EX.uid(), name: g.name.trim(), target: g.target.trim().replace( ',', '.' ), deadline: '', icon: g.icon || 'target' } ); } );
			W.goals = null; EX.save();
		}
		if ( id === 'wallets' ) {
			readWallets();
			const err = ( k ) => { const e = $( '#setupErr' ); e.textContent = t( k ); e.hidden = false; };
			for ( const w of W.wallets ) { if ( w.on && w.opening.trim() && ! /^-?\d+([.,]\d{1,2})?$/.test( w.opening.trim() ) ) return err( 'errAmount' ); }
			const cur = S().settings.currency;
			if ( W.wallets.some( ( w ) => w.on ) ) S().accounts = S().accounts.filter( ( a ) => ! a.auto );
			W.wallets.filter( ( w ) => w.on ).forEach( ( w ) => S().accounts.push( { id: EX.uid(), name: w.name.trim() || t( 'wt' + w.type.charAt( 0 ).toUpperCase() + w.type.slice( 1 ) ), type: w.type, currency: cur, opening: ( w.opening.trim() || '0' ).replace( ',', '.' ) } ) );
			W.wallets = null;
			EX.save();
		}
		W.step += 1; D().setupStep = W.step; EX.persist(); flow.show();
	}
	flow.onInput = ( e ) => {
		if ( e.target.id === 'curSearch' && e.isComposing ) { W.curQuery = e.target.value; return true; }
		if ( e.target.id === 'curSearch' ) { W.curQuery = e.target.value; const pos = e.target.selectionStart; flow.show(); const i = $( '#curSearch' ); if ( i ) { i.focus(); i.setSelectionRange( pos, pos ); } return true; }
		return false;
	};
	flow.onStepClick = ( e ) => {
		const el = e.target.closest( '[data-fstep]' );
		if ( ! el ) return false;
		const a = el.dataset.fstep;
		if ( a === 'plat' ) flow.onPlatform( el.dataset.plat );
		else if ( a === 'aim' ) { const cur = ( S().settings.aims || [] ).slice(), id = el.dataset.aim, i = cur.indexOf( id ); if ( i >= 0 ) cur.splice( i, 1 ); else cur.push( id ); S().settings.aims = cur; EX.persist(); flow.show( true ); }
		else if ( a === 'gpreset' ) { readGoals(); W.goals = W.goals || []; const k = el.dataset.k, i = W.goals.findIndex( ( g ) => g.preset === k ); if ( i >= 0 ) W.goals.splice( i, 1 ); else W.goals.push( { preset: k, name: t( 'goalPreset_' + k ), target: '', icon: el.dataset.ic } ); flow.show( true ); }
		else if ( a === 'plan' ) { S().settings.features = { tier: el.dataset.plan }; D().planChosen = true; EXA.features.apply(); EX.persist(); flow.show( true ); }
		else if ( a === 'tgt' ) { const i = $( '#setupForm [name=target]' ); if ( i && W.tgt ) W.tgt.amount = i.value; W.tgt = W.tgt || {}; W.tgt.period = el.dataset.tgt; flow.show( true ); const n = $( '#setupForm [name=target]' ); if ( n && el.dataset.tgt !== 'auto' ) n.focus(); }
		else if ( a === 'cur' ) { S().settings.currency = el.dataset.cur; EX.persist(); flow.show( true ); }
		else if ( a === 'theme' ) { const v = el.dataset.theme; try { if ( v === 'auto' ) localStorage.removeItem( 'expenity.theme' ); else localStorage.setItem( 'expenity.theme', v ); } catch ( err ) { /* ignore */ } if ( v === 'auto' ) delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v; flow.show(); }
		else if ( a === 'motion' ) { EXA.setMotion( el.dataset.motion ); flow.show( true ); }
		return true;
	};
	function loading() {
		$( '#flow' ).innerHTML = `<div class="flow-card"><div class="flow-body center"><div class="spinner" aria-hidden="true"></div><h1>${ esc( t( 'flowLoading' ) ) }</h1></div></div>`;
	}
	// A field that gets the keyboard is brought to the middle of the view, so nothing sits on top of it.
	document.addEventListener( 'focusin', ( e ) => { if ( e.target.matches( '#flow input, #flow textarea, #flow select' ) ) setTimeout( () => { try { e.target.scrollIntoView( { block: 'center' } ); } catch ( err ) { /* ignore */ } }, 300 ); } );
}() );
