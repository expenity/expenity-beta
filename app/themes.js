/**
 * Expenity themes: the list, the picker with live previews, and switching. The colors and shapes themselves are in
 * themes.css; the default (Emerald) is in style.css. theme.js applies the saved choice before the first paint.
 */
( function () {
	'use strict';
	const EX = window.EX, UI = window.UI, EXA = window.EXA;
	const { t, esc } = EX;
	const root = document.documentElement;
 const S=EX.state;
 Object.assign(EX.I18N.langs.en,{customTitle:'My custom theme',customTemplates:'Theme templates',customPaletteTitle:'Choose a starting palette',customPaletteHint:'Pick a palette, then adjust every colour below. Changes stay in the preview until you save.',customApply:'Use my theme',customActive:'Currently active',customEditSaved:'Edit my theme',customCreate:'Create my theme',custom_icons:'Icons',customHex:'Hex colour',customInvalid:'Enter a six-digit hex colour, for example #89BAFF.',customIconContrast:'Choose an icon colour with stronger contrast against the page and cards.',customLive:'Live preview',customPreviewExpense:'Coffee',customPreviewGoal:'Savings goal',customPreset_0:'Ocean',customPreset_1:'Amber',customPreset_2:'Rose',customPreset_3:'Mint',customPreset_4:'Paper',customPreset_5:'Violet'});
 Object.assign(EX.I18N.langs.el,{customTitle:'Το δικό μου θέμα',customTemplates:'Έτοιμα θέματα',customPaletteTitle:'Επιλέξτε αρχική παλέτα',customPaletteHint:'Επιλέξτε παλέτα και προσαρμόστε κάθε χρώμα παρακάτω. Οι αλλαγές φαίνονται μόνο στην προεπισκόπηση μέχρι να τις αποθηκεύσετε.',customApply:'Χρήση του θέματός μου',customActive:'Ενεργό θέμα',customEditSaved:'Επεξεργασία του θέματός μου',customCreate:'Δημιουργία του θέματός μου',custom_icons:'Εικονίδια',customHex:'Δεκαεξαδικό χρώμα',customInvalid:'Γράψτε εξαψήφιο δεκαεξαδικό χρώμα, π.χ. #89BAFF.',customIconContrast:'Επιλέξτε χρώμα εικονιδίων με μεγαλύτερη αντίθεση στο φόντο και στις κάρτες.',customLive:'Ζωντανή προεπισκόπηση',customPreviewExpense:'Καφές',customPreviewGoal:'Στόχος αποταμίευσης',customPreset_0:'Ωκεανός',customPreset_1:'Κεχριμπάρι',customPreset_2:'Ροζ',customPreset_3:'Μέντα',customPreset_4:'Χαρτί',customPreset_5:'Βιολετί'});

 Object.assign(EX.I18N.langs.en,{theme_mario:'Mario · Pixel adventure',themeD_mario:'Graphite-pencil Mario joins the balance card, with floating pencil characters.',theme_bricks:'Brick party',themeD_bricks:'Colored-pencil bricks, sketchbook cards and gentle floating motion.',theme_minnie:'Minnie & Mickey · Pencil atelier',themeD_minnie:'Mickey and Minnie in pencil, with rose paper, bows and polka dots.'});
 Object.assign(EX.I18N.langs.el,{theme_mario:'Mario · Περιπέτεια σε πίξελ',themeD_mario:'Ο Mario στην κάρτα υπολοίπου, με αιωρούμενους χαρακτήρες ζωγραφισμένους με μολύβι.',theme_bricks:'Πάρτι με τουβλάκια',themeD_bricks:'Τουβλάκια με ξυλομπογιές, κάρτες σαν σελίδες τετραδίου και απαλή κίνηση.',theme_minnie:'Minnie & Mickey · Ατελιέ μολυβιού',themeD_minnie:'Ο Mickey και η Minnie ζωγραφισμένοι με μολύβι, με ροζ χαρτί, φιόγκους και πουά.'});
 Object.assign(EX.I18N.langs.en,{theme_vader:'Vader · Dark orbit',themeD_vader:'Absolute black, white light, distant worlds and patrolling fighters.'});
 Object.assign(EX.I18N.langs.el,{theme_vader:'Vader · Σκοτεινή τροχιά',themeD_vader:'Απόλυτο μαύρο, λευκό φως, μακρινοί πλανήτες και διαστημικές περιπολίες.'});
	// swatch: page color, card color, accent, text. mode: the theme also has a light and a dark version.
	const THEMES = [
		{ id: 'emerald', mode: true, sw: [ '#eef6f3', '#ffffff', '#0a8f6a', '#0f1f1a' ] },
		{ id: 'minimal', mode: true, sw: [ '#fafafa', '#ffffff', '#111111', '#111111' ] },
		{ id: 'mobie', mode: true, sw: [ '#f3f5f9', '#ffffff', '#3b5bdb', '#101828' ] },
		{ id: 'paper', sw: [ '#f4ecd8', '#fffdf3', '#2f4b9a', '#2b2a40' ] },
		{ id: 'ledger', sw: [ '#e9eedd', '#fafcf2', '#1f5d3a', '#1c2a1c' ] },
		{ id: 'terminal', sw: [ '#030803', '#071307', '#36ff6d', '#36ff6d' ] },
		{ id: 'synthwave', sw: [ '#120726', '#1f0f45', '#ff3ea5', '#2de2e6' ] },
		{ id: 'amberwave', sw: [ '#120c07', '#24160d', '#ffbd59', '#fff2d6' ] },
		{ id: 'ion', sw: [ '#04131d', '#092735', '#61eeff', '#dcfbff' ] },
		{ id: 'vader', sw: [ '#000000', '#0b0b0b', '#ffffff', '#f3f3f3' ] },
		{ id: 'mario', sw: [ '#dcf3ff', '#fffdf2', '#c52b32', '#172b49' ] },
		{ id: 'bricks', sw: [ '#fff5d8', '#ffffff', '#164bb2', '#182d4b' ] },
		{ id: 'minnie', sw: [ '#fff0f3', '#fffafd', '#a7194c', '#35202d' ] },
		{ id: 'custom', sw: [ '#101724', '#1c283b', '#89baff', '#eef4ff' ] },
		{ id: 'blueprint', sw: [ '#0d3b82', '#11449a', '#ffffff', '#f0f7ff' ] },
		{ id: 'candy', sw: [ '#fff1f8', '#ffffff', '#ff6fb0', '#4a2a5c' ] },
		{ id: 'oled', sw: [ '#000000', '#0a0a0a', '#19e6a3', '#ffffff' ] },
		{ id: 'glass', sw: [ '#c9d6ff', '#ffffff', '#5757d9', '#1d2142' ] },
		{ id: 'sunset', sw: [ '#fff3e8', '#fffaf5', '#f0572d', '#4a1f10' ] },
		{ id: 'chalk', sw: [ '#1f3a30', '#274a3d', '#ffd86b', '#f3f0e4' ] },
	];
	EXA.THEMES = THEMES;
	const store = ( k, v ) => { try { if ( v == null ) localStorage.removeItem( k ); else localStorage.setItem( k, v ); } catch ( e ) { /* ignore */ } };
	EXA.skin = () => root.dataset.skin || 'emerald';
	EXA.setSkin = ( id ) => {
		if ( ! THEMES.some( ( x ) => x.id === id ) ) return;
		if ( id === 'emerald' ) delete root.dataset.skin; else root.dataset.skin = id;
		store( 'expenity.skin', id );
		EXA.applyCustomTheme(); EXA.updateTrails();
		const m = document.querySelector( 'meta[name=theme-color]' );
		if ( m ) m.content = id === 'custom' ? EXA.customPalette().accent : THEMES.find( ( x ) => x.id === id ).sw[ 2 ];
	};
	EXA.setMode = ( v ) => {
		setTimeout( () => EXA.pillInk(), 30 );
		if ( v === 'auto' ) delete root.dataset.theme; else root.dataset.theme = v;
		store( 'expenity.theme', v === 'auto' ? null : v );
	};
	EXA.setStatusTint = ( v ) => { if ( ! [ 'off', 'low', 'normal', 'full' ].includes( v ) ) return; root.dataset.status = v; store( 'expenity.status', v ); EX.state().device.statusTint = v; EX.persist(); };
	// Theme effects (characters, trails, embers...) can be switched off for one theme at a time; the list lives in the browser so it is known before the page draws.
	const FX_SKINS = [ 'mario', 'bricks', 'minnie', 'vader', 'synthwave', 'amberwave', 'ion', 'sunset', 'emerald', 'candy', 'terminal' ];
	const fxOffList = () => { try { return ( localStorage.getItem( 'expenity.fxoff' ) || '' ).split( ',' ).filter( Boolean ); } catch ( e ) { return []; } };
	EXA.hasThemeFx = ( skin ) => FX_SKINS.includes( skin ) || ( skin === 'custom' && EXA.customPalette().trails );
	EXA.themeFxOn = ( skin ) => ! fxOffList().includes( skin );
	EXA.setThemeFx = ( skin, on ) => { const s = new Set( fxOffList() ); if ( on ) s.delete( skin ); else s.add( skin ); store( 'expenity.fxoff', [ ...s ].join( ',' ) || null ); EXA.updateTrails(); };
	// Dark or light text on the solid status labels, whichever reads better on the theme's own green, amber and red.
	EXA.pillInk = () => {
		const cs = getComputedStyle( root ), cv = document.createElement( 'canvas' ).getContext( '2d', { willReadFrequently: true } ); cv.canvas.width = cv.canvas.height = 1;
		const lum = ( css ) => { cv.clearRect( 0, 0, 1, 1 ); cv.fillStyle = '#000'; cv.fillStyle = css; cv.fillRect( 0, 0, 1, 1 ); const d = cv.getImageData( 0, 0, 1, 1 ).data, f = ( c ) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow( ( c + 0.055 ) / 1.055, 2.4 ); }; return 0.2126 * f( d[ 0 ] ) + 0.7152 * f( d[ 1 ] ) + 0.0722 * f( d[ 2 ] ); };
		[ 'ok', 'warn', 'late' ].forEach( ( k ) => { const c = cs.getPropertyValue( '--' + k ).trim(); if ( ! c ) return; const L = lum( c ); root.style.setProperty( '--pill-' + k, ( 1.05 / ( L + 0.05 ) ) >= ( ( L + 0.05 ) / 0.0556 ) ? '#fff' : '#111' ); } ); // white (L 1) or near-black (L .0056): the larger contrast wins
	};
	EXA.setDensity = ( compact ) => { if ( compact ) root.dataset.density = 'compact'; else delete root.dataset.density; store( 'expenity.density', compact ? 'compact' : null ); };
	EXA.setMotion = ( v ) => {
		const d = EX.state().device; d.motion = v; EX.persist();
		if ( v === 'auto' ) delete root.dataset.motion; else root.dataset.motion = v;
		store( 'expenity.motion', v === 'auto' ? null : v );
		EXA.updateTrails();
	};
	const card = ( th, cur ) => {
		const palette = th.id === 'custom' ? EXA.customPalette() : null;
		const [ bg, sf, ac, ink ] = palette ? [ palette.bg, palette.surface, palette.accent, palette.ink ] : th.sw;
		return `<button type="button" class="theme-card${ th.id === cur ? ' on' : '' }" data-skin-set="${ th.id }" role="radio" aria-checked="${ th.id === cur }">
			<span class="tc-prev" aria-hidden="true" style="background:${ bg }"><i style="background:${ sf };border-color:${ ink }33"><b style="background:${ ac }"></b><u style="background:${ ink }"></u><u style="background:${ ink };width:42%"></u></i></span>
			<span class="tc-name">${UI.icon(({vader:'shield',mario:'device-gamepad-2',bricks:'category-2',minnie:'heart'})[th.id]||'palette',16)} ${ esc( t( 'theme_' + th.id ) ) }</span><small>${ esc( t( 'themeD_' + th.id ) ) }</small></button>`;
	};
	/** The picker: theme cards, then light/dark chips for themes that have both. */
	EXA.themePicker = ( opts = {} ) => {
		const cur = EXA.skin(), th = THEMES.find( ( x ) => x.id === cur ) || THEMES[ 0 ];
		const mode = root.dataset.theme || 'auto';
		const mc = ( v, label, ic ) => `<button type="button" class="chip big${ mode === v ? ' on' : '' }" data-mode-set="${ v }">${ UI.icon( ic, 20 ) } ${ esc( label ) }</button>`;
		return `<div class="theme-grid${ EXA.themesOpen ? ' open' : '' }" role="radiogroup" aria-label="${ esc( t( 'themesTitle' ) ) }">${ ( () => { const list = THEMES.filter( ( x ) => x.id !== 'custom' ), shown = list.slice( 0, 4 ).map( ( x ) => x.id ); if ( ! shown.includes( cur ) && list.some( ( x ) => x.id === cur ) ) shown[ 3 ] = cur; EXA.themeShown = shown; return list; } )().map( ( x ) => `<div class="theme-cell${ EXA.themeShown.includes( x.id ) ? '' : ' theme-extra' }">${ card( x, cur ) }${ opts.edit === false ? '' : `<button type="button" class="tc-edit" data-theme-edit="${ x.id }" aria-label="${ esc( t( 'themeEdit', { n: t( 'theme_' + x.id ) } ) ) }">${ UI.icon( 'pencil', 16 ) }</button>` }</div>` ).join( '' ) }</div>
			${ ( () => { const n = THEMES.filter( ( x ) => x.id !== 'custom' ).length - EXA.themeShown.length; return n > 0 ? `<button type="button" class="btn btn-ghost theme-toggle" data-themes-toggle data-n="${ n + EXA.themeShown.length }" aria-expanded="${ !! EXA.themesOpen }">${ UI.icon( 'chevron-down', 18 ) } <span>${ esc( EXA.themesOpen ? t( 'themesShowFewer' ) : t( 'themesShowAll', { n: n + EXA.themeShown.length } ) ) }</span></button>` : ''; } )() }

			${ cur === 'mobie' ? '' : `<label class="entry-paid fx-theme"><span><b>${ esc( t( 'compactTitle' ) ) }</b><small>${ esc( t( 'compactHint' ) ) }</small></span><span class="switch"><input type="checkbox" data-density-toggle${ root.dataset.density === 'compact' ? ' checked' : '' } aria-label="${ esc( t( 'compactTitle' ) ) }"><i></i></span></label>` }
			${ EXA.hasThemeFx( cur ) ? `<label class="entry-paid fx-theme"><span><b>${ esc( t( 'themeFx' ) ) }</b><small>${ esc( t( 'themeFxHint' ) ) }</small></span><span class="switch"><input type="checkbox" data-fx-theme="${ cur }"${ EXA.themeFxOn( cur ) ? ' checked' : '' } aria-label="${ esc( t( 'themeFx' ) ) }"><i></i></span></label>` : '' }
			${ th.mode ? `<div class="lbl pad0">${ esc( t( 'themeLabel' ) ) }</div><div class="chips wrap">${ mc( 'auto', t( 'themeAuto' ), 'device-mobile' ) }${ mc( 'light', t( 'themeLight' ), 'sun' ) }${ mc( 'dark', t( 'themeDark' ), 'moon' ) }</div>` : '' }`;
	};

 const FONT_FAMILIES={sans:'"Noto Sans", ui-sans-serif, system-ui, sans-serif',serif:'"Noto Serif", Georgia, serif',mono:'"JetBrains Mono", ui-monospace, monospace',noto_sans:'"Noto Sans", sans-serif',noto_serif:'"Noto Serif", serif',roboto:'"Roboto", sans-serif',roboto_slab:'"Roboto Slab", serif',open_sans:'"Open Sans", sans-serif',fira_sans:'"Fira Sans", sans-serif',comfortaa:'"Comfortaa", sans-serif',alegreya:'"Alegreya", serif',literata:'"Literata", serif',geologica:'"Geologica", sans-serif'};
 const FONT_NAMES={noto_sans:'Noto Sans',noto_serif:'Noto Serif',roboto:'Roboto',roboto_slab:'Roboto Slab',open_sans:'Open Sans',fira_sans:'Fira Sans',comfortaa:'Comfortaa',alegreya:'Alegreya',literata:'Literata',geologica:'Geologica'};
 Object.assign(EX.I18N.langs.en,{customSlight:'Slightly rounded',homeAppearance:'Appearance',homeAppearanceHint:'Adjust the colors, font and roundness of this theme. Layout and positions are not affected.',homeAppearanceReset:'Reset theme styling',homeAppearanceApply:'Preview on Home',lookPreviewTitle:'Previewing your changes',lookApply:'Apply',lookKeep:'Keep editing',lookApplied:'Theme updated.'});
 Object.assign(EX.I18N.langs.el,{customSlight:'Ελαφρώς στρογγυλεμένο',homeAppearance:'Εμφάνιση',homeAppearanceHint:'Προσαρμόστε χρώματα, γραμματοσειρά και στρογγυλότητα αυτού του θέματος. Η διάταξη και οι θέσεις δεν αλλάζουν.',homeAppearanceReset:'Επαναφορά εμφάνισης θέματος',homeAppearanceApply:'Προεπισκόπηση στην Αρχική',lookPreviewTitle:'Προεπισκόπηση των αλλαγών σας',lookApply:'Εφαρμογή',lookKeep:'Συνέχεια επεξεργασίας',lookApplied:'Το θέμα ενημερώθηκε.'});
	const defaults = { bg: '#101724', surface: '#1c283b', accent: '#89baff', ink: '#eef4ff', round: '1', font: 'sans', trails: false, icons:'#89baff' };
	const keys = [ 'bg', 'surface', 'accent', 'ink', 'icons' ];
	EXA.customPalette = ( supplied ) => {
		let raw = supplied || {}; try { if(!supplied)raw = JSON.parse( localStorage.getItem( 'expenity.custom' ) || '{}' ) || {}; } catch ( e ) { /* default */ }
		const p = { ...defaults };
		keys.forEach( k => { if ( /^#[0-9a-f]{6}$/i.test( raw[k] ) ) p[k] = raw[k]; } );
		if ( [ '0', '0.3', '1', '1.5' ].includes( raw.round ) ) p.round = raw.round;
		if ( Object.hasOwn(FONT_FAMILIES,raw.font) ) p.font = raw.font;
		p.trails = raw.trails === true;if(!/^#[0-9a-f]{6}$/i.test(raw.icons||''))p.icons=p.accent;return p;
	};
	const lum = c => { const v = c.slice( 1 ).match( /../g ).map( x => parseInt( x, 16 ) / 255 ).map( n => n <= .04045 ? n / 12.92 : ( ( n + .055 ) / 1.055 ) ** 2.4 ); return .2126*v[0]+.7152*v[1]+.0722*v[2]; };
	const contrast = ( a, b ) => ( Math.max( lum(a), lum(b) ) + .05 ) / ( Math.min( lum(a), lum(b) ) + .05 );
	const foreground = bg => contrast( bg, '#ffffff' ) >= contrast( bg, '#000000' ) ? '#ffffff' : '#000000';
	EXA.applyCustomTheme = () => {
		let el = document.getElementById( 'customPalette' ); if ( ! el ) { el = document.createElement( 'style' ); el.id = 'customPalette'; document.head.appendChild( el ); }
		const p = EXA.customPalette();
		el.textContent = `:root[data-skin="custom"]{--bg:${p.bg};--bg-img:none;--surface:${p.surface};--ink:${p.ink};--ink-2:${p.ink};--muted:${p.ink};--line:${p.ink}33;--card-line:${p.ink}33;--accent:${p.accent};--accent-2:${p.accent};--accent-ink:${foreground(p.accent)};--accent-soft:color-mix(in srgb,${p.accent} 14%,${p.surface});--custom-icon:${p.icons};--brand:${p.accent};--brand-ink:${foreground(p.accent)};--fab-bg:${p.accent};--hero-bg:${p.accent};--hero-ink:${foreground(p.accent)};--rk:${p.round};--font:${FONT_FAMILIES[p.font]};--font-head:${FONT_FAMILIES[p.font]};--trail:${p.accent};color-scheme:${lum(p.bg)<.18?'dark':'light'}}:root[data-skin="custom"] .ab-btn .i,:root[data-skin="custom"] .tab.on .i,:root[data-skin="custom"] .rail-item .i{color:var(--custom-icon)}`;
  const skin=EXA.skin(),raw=(EXA.homeLookDraft||S().settings.themeLooks||{})[skin];
  if(raw){const v=EXA.customPalette(raw),selector=skin==='emerald'?':root:not([data-skin])':`:root[data-skin="${skin}"]`;el.textContent+=`${selector}{--bg:${v.bg}!important;--surface:${v.surface}!important;--ink:${v.ink}!important;--ink-2:${v.ink}!important;--muted:${v.ink}!important;--line:${v.ink}33!important;--card-line:${v.ink}33!important;--accent:${v.accent}!important;--accent-2:${v.accent}!important;--accent-soft:color-mix(in srgb,${v.accent} 14%,${v.surface})!important;--accent-ink:${foreground(v.accent)}!important;--brand:${v.accent}!important;--brand-ink:${foreground(v.accent)}!important;--fab-bg:${v.accent}!important;--hero-bg:linear-gradient(${v.accent},${v.accent})!important;--hero-ink:${foreground(v.accent)}!important;--rk:${v.round}!important;--font:${FONT_FAMILIES[v.font]}!important;--font-head:${FONT_FAMILIES[v.font]}!important;--trail:${v.accent}!important;--custom-icon:${v.icons}!important;color-scheme:${lum(v.bg)<.18?'dark':'light'}}${selector} :is(.ab-btn,.tab.on,.rail-item) .i{color:${v.icons}}`;}

	};

 const palettes=[
  {bg:'#101724',surface:'#1c283b',accent:'#89baff',ink:'#eef4ff',icons:'#89baff'},
  {bg:'#120c07',surface:'#24160d',accent:'#ffbd59',ink:'#fff2d6',icons:'#ffbd59'},
  {bg:'#21101d',surface:'#35192e',accent:'#ff9acc',ink:'#fff0f8',icons:'#ffb4d8'},
  {bg:'#eef8f4',surface:'#ffffff',accent:'#07694f',ink:'#102e25',icons:'#07694f'},
  {bg:'#f4ecd8',surface:'#fffdf3',accent:'#2f4b9a',ink:'#2b2a40',icons:'#2f4b9a'},
  {bg:'#130d25',surface:'#24173d',accent:'#ceb0ff',ink:'#f5eeff',icons:'#ceb0ff'}
 ];
 EXA.customThemeSection=()=>{
  const p=EXA.customPalette(),active=EXA.skin()==='custom';let saved=false;try{saved=!!localStorage.getItem('expenity.custom');}catch(e){}
  return `<section class="custom-theme-section" aria-label="${esc(t('customTitle'))}"><div class="custom-theme-heading">${UI.ci('palette','purple',42)}<div><h3>${esc(t('customTitle'))}</h3><p>${esc(t('customHelp'))}</p></div></div><div class="custom-theme-swatches" aria-hidden="true">${keys.map(k=>`<i style="background:${p[k]}"></i>`).join('')}</div><div class="btn-row"><button type="button" class="btn btn-primary" data-custom-edit>${UI.icon('pencil',20)} ${esc(t(saved?'customEditSaved':'customCreate'))}</button><button type="button" class="btn btn-ghost" data-skin-set="custom"${active?' disabled':''}>${UI.icon(active?'check':'palette',20)} ${esc(t(active?'customActive':'customApply'))}</button></div></section>`;
 };
 /** When edited from a theme's pencil (not from Home editing) the draft is saved straight away. */
 EXA.themeEditDirect=false;
 const finishDirect=()=>{if(!EXA.themeEditDirect)return;EXA.themeEditPrev=null;S().settings.themeLooks=JSON.parse(JSON.stringify(EXA.homeLookDraft||{}));S().settings.u=Date.now();EX.persist();delete EXA.homeLookDraft;EXA.themeEditDirect=false;};
 // Leaving the editor without saving: the draft goes, and so does the temporary switch to the theme that was being edited.
 function discardDirectEdit(){
  if(!EXA.themeEditDirect)return;
  delete EXA.homeLookDraft;EXA.themeEditDirect=false;
  const back=EXA.themeEditPrev;EXA.themeEditPrev=null;
  if(back&&back!==EXA.skin())EXA.setSkin(back);else EXA.applyCustomTheme();
 }
 // "Preview on Home": the edited look is shown on the real Home screen, nothing is saved yet, and a clear panel offers Apply or Cancel.
 let lookBar=null;
 const closeLookBar=()=>{lookBar?.remove();lookBar=null;};
 EXA.cancelLookPreview=()=>{if(!lookBar)return;closeLookBar();delete EXA.homeLookDraft;const back=EXA.themeEditPrev;EXA.themeEditPrev=null;if(back&&back!==EXA.skin())EXA.setSkin(back);else EXA.applyCustomTheme();};
 function startLookPreview(){
  EXA.themeEditDirect=false;closeLookBar();
  UI.closeSheet();EXA.applyCustomTheme();EXA.go('home');
  lookBar=document.createElement('div');lookBar.className='look-preview';lookBar.setAttribute('role','region');lookBar.setAttribute('aria-label',t('lookPreviewTitle'));
  lookBar.innerHTML=`<b>${esc(t('lookPreviewTitle'))}</b><div class="btn-row"><button type="button" class="btn btn-primary" data-look-apply>${esc(t('lookApply'))}</button><button type="button" class="btn btn-ghost" data-look-cancel>${esc(t('lookKeep'))}</button></div>`;
  document.body.append(lookBar);
 }
 document.addEventListener('click',e=>{
  if(!lookBar)return;
  if(e.target.closest('[data-look-apply]')){S().settings.themeLooks=JSON.parse(JSON.stringify(EXA.homeLookDraft||{}));S().settings.u=Date.now();EX.persist();delete EXA.homeLookDraft;EXA.themeEditPrev=null;closeLookBar();EXA.applyCustomTheme();EXA.render();UI.toast(t('lookApplied'));}
  else if(e.target.closest('[data-look-cancel]')){
   // Back to the editor of the same theme with every change still in it. Closing the editor then discards them, as before.
   closeLookBar();EXA.themeEditDirect=true;EXA.go('more','appearance');
   document.getElementById('sheet').addEventListener('close',discardDirectEdit,{once:true});
   editCustom(true);
  }
 });
 const hex=value=>/^#[0-9a-f]{6}$/i.test(value);
 EXA.editHomeAppearance=()=>editCustom(true);
 function editCustom(home=false) {
  const skin=EXA.skin(),computed=getComputedStyle(root),asHex=k=>{const c=document.createElement('canvas').getContext('2d');c.fillStyle=computed.getPropertyValue('--'+k).trim();return c.fillStyle;};
  const current=home?{bg:asHex('bg'),surface:asHex('surface'),accent:asHex('accent'),ink:asHex('ink'),icons:asHex('accent'),round:['0','0.3','1','1.5'].includes(computed.getPropertyValue('--rk').trim())?computed.getPropertyValue('--rk').trim():'1',font:'sans'}:null;
  const p=home?EXA.customPalette((EXA.homeLookDraft||S().settings.themeLooks||{})[skin]||current):EXA.customPalette(),iconFor={bg:'sun',surface:'wallet',accent:'palette',ink:'notes',icons:'palette'};
  UI.openSheet(`<div class="sheet-head"><button type="button" class="ab-btn" data-close aria-label="${esc(t('close'))}">${UI.icon('x',24)}</button><h2 id="sheetTitle">${UI.icon('palette',22)} ${esc(t(home?'homeAppearance':'customTitle'))}</h2></div><form id="customThemeForm" class="sheet-pad"><p class="muted">${esc(t(home?'homeAppearanceHint':'customPaletteHint'))}</p>${home?`<button type="button" class="btn btn-ghost" data-look-reset>${UI.icon('refresh',20)} ${esc(t('homeAppearanceReset'))}</button>`:''}<h3>${esc(t('customPaletteTitle'))}</h3><div class="custom-start-palettes" role="group" aria-label="${esc(t('customPaletteTitle'))}">${palettes.map((v,i)=>`<button type="button" class="palette-option" data-palette-preset="${i}" aria-label="${esc(t('customPreset_'+i))}"><span aria-hidden="true">${['bg','surface','accent','ink'].map(k=>`<i style="background:${v[k]}"></i>`).join('')}</span><b>${esc(t('customPreset_'+i))}</b></button>`).join('')}</div><div class="custom-colour-controls">${keys.map(k=>`<div class="custom-colour-row"><label for="palette-${k}">${UI.icon(iconFor[k],20)} ${esc(t('custom_'+k))}</label><input id="palette-${k}" type="color" name="${k}" value="${p[k]}" aria-label="${esc(t('custom_'+k))}"><input type="text" inputmode="text" data-palette-hex="${k}" value="${p[k].toUpperCase()}" maxlength="7" spellcheck="false" autocomplete="off" aria-label="${esc(t('custom_'+k)+' · '+t('customHex'))}"></div>`).join('')}</div><div class="grid2"><label class="f"><span>${UI.icon('palette',18)} ${esc(t('customRound'))}</span><select name="round">${['0','0.3','1','1.5'].map((x,i)=>`<option value="${x}"${p.round===x?' selected':''}>${esc(t(['customSquare','customSlight','customSoft','customRounder'][i]))}</option>`).join('')}</select></label><label class="f"><span>${UI.icon('notes',18)} ${esc(t('customFont'))}</span><select name="font">${Object.keys(FONT_FAMILIES).map(x=>`<option value="${x}"${p.font===x?' selected':''}>${esc(FONT_NAMES[x]||t('customFont_'+x))}</option>`).join('')}</select></label></div><label class="f chk"><input name="trails" type="checkbox"${p.trails?' checked':''}><span>${esc(t('customTrails'))}</span></label><h3>${esc(t('customLive'))}</h3><div id="palettePreview"><div class="palette-preview-nav">${UI.icon('wallet',24)} ${UI.icon('arrows-sort',24)} ${UI.icon('target',24)} ${UI.icon('chart-pie',24)}</div><div class="palette-preview-card"><small>${esc(t('customPreview'))}</small><b>${esc(EX.money(1234,S().settings.currency))}</b><span class="palette-preview-add" aria-hidden="true">${UI.icon('plus',22)}</span></div><div class="palette-preview-row">${UI.icon('coffee',22)}<span>${esc(t('customPreviewExpense'))}</span><strong>−${esc(EX.money(4,S().settings.currency))}</strong></div><div class="palette-preview-row">${UI.icon('target',22)}<span>${esc(t('customPreviewGoal'))}</span></div></div><p id="paletteError" class="err" role="alert" hidden></p><div class="btn-row sticky-actions"><button type="button" class="btn btn-ghost" data-close>${esc(t('cancel'))}</button><button type="submit" class="btn btn-primary">${UI.icon('check',20)} ${esc(t(home?'homeAppearanceApply':'saveTx'))}</button></div></form>`,{tall:true,cls:'custom-theme-editor'});
  const f=document.getElementById('customThemeForm'),preview=document.getElementById('palettePreview'),error=document.getElementById('paletteError');
  const read=()=>Object.fromEntries([...keys,'round','font'].map(k=>[k,f.elements[k].value]).concat([['trails',f.elements.trails.checked]]));
  const paint=()=>{
   const v=read(),invalid=keys.some(k=>!hex(f.querySelector(`[data-palette-hex="${k}"]`).value));
   const lowText=contrast(v.ink,v.surface)<4.5||contrast(v.ink,v.bg)<4.5,lowIcon=contrast(v.icons,v.surface)<3||contrast(v.icons,v.bg)<3;
   error.textContent=t(invalid?'customInvalid':lowText?'customContrast':'customIconContrast');error.hidden=!invalid&&!lowText&&!lowIcon;f.querySelector('[type=submit]').disabled=!error.hidden;
   preview.style.cssText=`--preview-bg:${v.bg};--preview-surface:${v.surface};--preview-ink:${v.ink};--preview-accent:${v.accent};--preview-icon:${v.icons};--preview-on-accent:${foreground(v.accent)};--preview-round:${Number(v.round)*16}px;font-family:${FONT_FAMILIES[v.font]}`;
   f.querySelectorAll('[data-palette-preset]').forEach(b=>{const v0=palettes[Number(b.dataset.palettePreset)],on=keys.every(k=>v[k].toLowerCase()===v0[k]);b.setAttribute('aria-pressed',String(on));});
  };
  f.addEventListener('input',e=>{const k=e.target.dataset.paletteHex;if(k&&hex(e.target.value))f.elements[k].value=e.target.value;else if(e.target.type==='color'){f.querySelector(`[data-palette-hex="${e.target.name}"]`).value=e.target.value.toUpperCase();}paint();});
  f.addEventListener('change',paint);
  f.addEventListener('click',e=>{if(home&&e.target.closest('[data-look-reset]')){delete EXA.homeLookDraft[skin];finishDirect();EXA.applyCustomTheme();UI.closeSheet();EXA.render();return;}const b=e.target.closest('[data-palette-preset]');if(!b)return;const v=palettes[Number(b.dataset.palettePreset)];keys.forEach(k=>{f.elements[k].value=v[k];f.querySelector(`[data-palette-hex="${k}"]`).value=v[k].toUpperCase();});paint();});
  f.addEventListener('submit',e=>{e.preventDefault();e.stopPropagation();paint();if(!error.hidden)return;const v=read();if(home){EXA.homeLookDraft[skin]=v;if(EXA.themeEditDirect){startLookPreview();return;}EXA.applyCustomTheme();UI.closeSheet();EXA.render();return;}store('expenity.custom',JSON.stringify(v));EXA.setSkin('custom');UI.closeSheet();if(EXA.flow.active())EXA.flow.show(true);else EXA.render();});
  paint();
 }


 // Decorative scenery only. Character artwork will be integrated with the balance card.
 let funScene,funSkin;
 EXA.updateFunThemes=on=>{
  const skin=EXA.skin(),active=['mario','bricks','minnie','vader'].includes(skin);
  if(!active){funScene?.remove();funScene=null;funSkin=null;delete root.dataset.funMotion;root.style.removeProperty('--theme-cameo');root.style.removeProperty('--theme-friend');return;}
  root.dataset.funMotion=on?'on':'still';
  if(funSkin!==skin||!funScene){funScene?.remove();funSkin=skin;funScene=document.createElement('div');funScene.className='fun-scene '+skin+'-scene';funScene.setAttribute('aria-hidden','true');
   const kinds=skin==='vader'?[...Array(48).fill('star'),'planet','moon','station','fighter','fighter','fighter','cruiser']:skin==='mario'?['sketch-goomba','sketch-mushroom','sketch-boo','sketch-star']:skin==='bricks'?Array(3).fill('brick'):Array.from({length:13},(_,i)=>i%3===0?'bow':i%3===1?'confetti':'petal');
   kinds.forEach((kind,i)=>{const el=document.createElement('i');el.className='fun-'+kind;el.style.setProperty('--n',i);el.style.setProperty('--x',((i*29+7)%94)+'%');el.style.setProperty('--y',((i*19+8)%88)+'%');el.style.setProperty('--delay',(-i*1.7)+'s');if(skin==='vader')el.style.setProperty('--y',((i*23+13)%89)+'%');el.style.setProperty('--turn',((i%2?-1:1)*(6+i%4*4))+'deg');funScene.append(el);});document.body.prepend(funScene);
  }
 };

	let trails;
	EXA.updateTrails = () => {
		const m=root.dataset.motion, on=!document.hidden&&(m==='full'||(m!=='off'&&m!=='reduced'&&!matchMedia('(prefers-reduced-motion: reduce)').matches))&&EXA.themeFxOn(EXA.skin());
		EXA.pillInk(); EXA.updateFunThemes(on);
		if ( EXA.updateAmbient ) EXA.updateAmbient( on );
		const enabled=['synthwave','amberwave','ion'].includes(EXA.skin())||(EXA.skin()==='custom'&&EXA.customPalette().trails);
		if(!enabled){if(trails)trails.remove();trails=null;return;}
		if(!trails){trails=document.createElement('div');trails.className='neon-trails';trails.setAttribute('aria-hidden','true');for(let i=0;i<8;i++){const dot=document.createElement('i');dot.style.left=(Math.random()*100)+'%';dot.style.setProperty('--duration',(7+Math.random()*12)+'s');dot.style.setProperty('--delay',(-Math.random()*20)+'s');dot.style.setProperty('--length',(15+Math.random()*45)+'px');trails.appendChild(dot);}document.body.prepend(trails);}
		trails.hidden=!on;
	};
	document.addEventListener('click',e=>{if(e.target.closest('[data-custom-edit]'))editCustom();});
	document.addEventListener('click',e=>{const b=e.target.closest('[data-theme-edit]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();if(EXA.skin()!==b.dataset.themeEdit){EXA.themeEditPrev=EXA.skin();EXA.setSkin(b.dataset.themeEdit);}if(!EXA.homeLookDraft){EXA.homeLookDraft=JSON.parse(JSON.stringify(S().settings.themeLooks||{}));EXA.themeEditDirect=true;document.getElementById('sheet').addEventListener('close',discardDirectEdit,{once:true});}EXA.render();editCustom(true);},true);
	document.addEventListener('visibilitychange',()=>EXA.updateTrails());
	matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>EXA.updateTrails());
	matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>setTimeout(()=>EXA.pillInk(),50));
	EXA.applyCustomTheme(); EXA.updateTrails();
	EX.I18N.langs.en.themesShowAll = 'Show all {n} themes'; EX.I18N.langs.en.themesShowFewer = 'Show fewer themes';
	EX.I18N.langs.el.themesShowAll = 'Εμφάνιση και των {n} θεμάτων'; EX.I18N.langs.el.themesShowFewer = 'Εμφάνιση λιγότερων θεμάτων';
	document.addEventListener( 'click', ( e ) => {
		const b = e.target.closest && e.target.closest( '[data-themes-toggle]' ); if ( ! b ) return;
		EXA.themesOpen = ! EXA.themesOpen; const g = b.parentNode.querySelector( '.theme-grid' ); if ( g ) g.classList.toggle( 'open', EXA.themesOpen );
		b.setAttribute( 'aria-expanded', String( EXA.themesOpen ) ); b.querySelector( 'span' ).textContent = EXA.themesOpen ? EX.t( 'themesShowFewer' ) : EX.t( 'themesShowAll', { n: b.dataset.n || '' } );
	} );
}() );
