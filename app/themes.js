/**
 * Expenity themes: the list, the picker with live previews, and switching. The colors and shapes themselves are in
 * themes.css; the default (Emerald) is in style.css. theme.js applies the saved choice before the first paint.
 */
( function () {
	'use strict';
	const EX = window.EX, UI = window.UI, EXA = window.EXA;
	const { t, esc } = EX;
	const root = document.documentElement;
	// swatch: page color, card color, accent, text. mode: the theme also has a light and a dark version.
	const THEMES = [
		{ id: 'emerald', mode: true, sw: [ '#eef6f3', '#ffffff', '#0a8f6a', '#0f1f1a' ] },
		{ id: 'minimal', mode: true, sw: [ '#fafafa', '#ffffff', '#111111', '#111111' ] },
		{ id: 'paper', sw: [ '#f4ecd8', '#fffdf3', '#2f4b9a', '#2b2a40' ] },
		{ id: 'ledger', sw: [ '#e9eedd', '#fafcf2', '#1f5d3a', '#1c2a1c' ] },
		{ id: 'terminal', sw: [ '#030803', '#071307', '#36ff6d', '#36ff6d' ] },
		{ id: 'synthwave', sw: [ '#120726', '#1f0f45', '#ff3ea5', '#2de2e6' ] },
		{ id: 'amberwave', sw: [ '#120c07', '#24160d', '#ffbd59', '#fff2d6' ] },
		{ id: 'ion', sw: [ '#04131d', '#092735', '#61eeff', '#dcfbff' ] },
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
		store( 'expenity.skin', id === 'emerald' ? null : id );
		EXA.applyCustomTheme(); EXA.updateTrails();
		const m = document.querySelector( 'meta[name=theme-color]' );
		if ( m ) m.content = id === 'custom' ? EXA.customPalette().accent : THEMES.find( ( x ) => x.id === id ).sw[ 2 ];
	};
	EXA.setMode = ( v ) => {
		if ( v === 'auto' ) delete root.dataset.theme; else root.dataset.theme = v;
		store( 'expenity.theme', v === 'auto' ? null : v );
	};
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
			<span class="tc-name">${ esc( t( 'theme_' + th.id ) ) }</span><small>${ esc( t( 'themeD_' + th.id ) ) }</small></button>`;
	};
	/** The picker: theme cards, then light/dark chips for themes that have both. */
	EXA.themePicker = () => {
		const cur = EXA.skin(), th = THEMES.find( ( x ) => x.id === cur ) || THEMES[ 0 ];
		const mode = root.dataset.theme || 'auto';
		const mc = ( v, label, ic ) => `<button type="button" class="chip big${ mode === v ? ' on' : '' }" data-mode-set="${ v }">${ UI.icon( ic, 20 ) } ${ esc( label ) }</button>`;
		return `<div class="theme-grid" role="radiogroup" aria-label="${ esc( t( 'themesTitle' ) ) }">${ THEMES.map( ( x ) => card( x, cur ) ).join( '' ) }</div>
			${ cur === 'custom' ? `<button type="button" class="btn btn-ghost" data-custom-edit>${ esc( t( 'customEdit' ) ) }</button>` : '' }
			${ th.mode ? `<div class="lbl pad0">${ esc( t( 'themeLabel' ) ) }</div><div class="chips wrap">${ mc( 'auto', t( 'themeAuto' ), 'device-mobile' ) }${ mc( 'light', t( 'themeLight' ), 'sun' ) }${ mc( 'dark', t( 'themeDark' ), 'moon' ) }</div>` : '' }`;
	};

	const defaults = { bg: '#101724', surface: '#1c283b', accent: '#89baff', ink: '#eef4ff', round: '1', font: 'sans', trails: false };
	const keys = [ 'bg', 'surface', 'accent', 'ink' ];
	EXA.customPalette = () => {
		let raw = {}; try { raw = JSON.parse( localStorage.getItem( 'expenity.custom' ) || '{}' ) || {}; } catch ( e ) { /* default */ }
		const p = { ...defaults };
		keys.forEach( k => { if ( /^#[0-9a-f]{6}$/i.test( raw[k] ) ) p[k] = raw[k]; } );
		if ( [ '0.3', '1', '1.5' ].includes( raw.round ) ) p.round = raw.round;
		if ( [ 'sans', 'serif', 'mono' ].includes( raw.font ) ) p.font = raw.font;
		p.trails = raw.trails === true; return p;
	};
	const lum = c => { const v = c.slice( 1 ).match( /../g ).map( x => parseInt( x, 16 ) / 255 ).map( n => n <= .04045 ? n / 12.92 : ( ( n + .055 ) / 1.055 ) ** 2.4 ); return .2126*v[0]+.7152*v[1]+.0722*v[2]; };
	const contrast = ( a, b ) => ( Math.max( lum(a), lum(b) ) + .05 ) / ( Math.min( lum(a), lum(b) ) + .05 );
	const foreground = bg => contrast( bg, '#ffffff' ) >= contrast( bg, '#000000' ) ? '#ffffff' : '#000000';
	EXA.applyCustomTheme = () => {
		let el = document.getElementById( 'customPalette' ); if ( ! el ) { el = document.createElement( 'style' ); el.id = 'customPalette'; document.head.appendChild( el ); }
		const p = EXA.customPalette();
		el.textContent = `:root[data-skin="custom"]{--bg:${p.bg};--bg-img:none;--surface:${p.surface};--ink:${p.ink};--ink-2:${p.ink};--muted:${p.ink};--line:${p.ink}33;--card-line:${p.ink}33;--accent:${p.accent};--accent-2:${p.accent};--accent-ink:${foreground(p.accent)};--accent-soft:${p.surface};--brand:${p.accent};--brand-ink:${foreground(p.accent)};--fab-bg:${p.accent};--hero-bg:${p.accent};--hero-ink:${foreground(p.accent)};--rk:${p.round};--font-head:${p.font === 'mono' ? 'var(--mono)' : p.font === 'serif' ? 'var(--serif)' : 'var(--font)'};--trail:${p.accent};color-scheme:${lum(p.bg)<.18?'dark':'light'}}`;
	};
	function editCustom() {
		const p = EXA.customPalette();
		UI.openSheet( `<div class="sheet-head"><h2 id="sheetTitle">${esc(t('customEdit'))}</h2><button type="button" class="icon-btn" data-close aria-label="${esc(t('close'))}">${UI.icon('x',24)}</button></div><form id="customThemeForm" class="sheet-pad"><p>${esc(t('customHelp'))}</p><div class="grid2">${ keys.map( k => `<label class="f"><span>${esc(t('custom_'+k))}</span><input type="color" name="${k}" value="${p[k]}"></label>` ).join('') }</div><label class="f"><span>${esc(t('customRound'))}</span><select name="round">${['0.3','1','1.5'].map((x,i)=>`<option value="${x}" ${p.round===x?'selected':''}>${esc(t(['customSquare','customSoft','customRounder'][i]))}</option>`).join('')}</select></label><label class="f"><span>${esc(t('customFont'))}</span><select name="font">${['sans','serif','mono'].map(x=>`<option value="${x}" ${p.font===x?'selected':''}>${esc(t('customFont_'+x))}</option>`).join('')}</select></label><label class="f chk"><input name="trails" type="checkbox" ${p.trails?'checked':''}><span>${esc(t('customTrails'))}</span></label><div id="palettePreview" class="card">${esc(t('customPreview'))}<b>€1,234</b></div><p id="paletteError" class="err" role="alert" hidden>${esc(t('customContrast'))}</p><button type="submit" class="btn btn-primary">${esc(t('save'))}</button></form>` );
		const f=document.getElementById('customThemeForm'), preview=document.getElementById('palettePreview');
		const read=()=>Object.fromEntries([...keys,'round','font'].map(k=>[k,f.elements[k].value]).concat([['trails',f.elements.trails.checked]]));
		const paint=()=>{ const v=read(); preview.style.background=v.surface;preview.style.color=v.ink;preview.style.borderColor=v.accent;preview.style.borderRadius=(Number(v.round)*16)+'px';document.getElementById('paletteError').hidden=contrast(v.ink,v.surface)>=4.5&&contrast(v.ink,v.bg)>=4.5; }; f.addEventListener('input',paint); paint();
		f.addEventListener('submit',e=>{e.preventDefault();const v=read();if(contrast(v.ink,v.surface)<4.5||contrast(v.ink,v.bg)<4.5)return;store('expenity.custom',JSON.stringify(v));EXA.setSkin('custom');UI.closeSheet();if(EXA.flow.active())EXA.flow.show(true);else EXA.render();});
	}
	let trails;
	EXA.updateTrails = () => {
		const m=root.dataset.motion, on=!document.hidden&&(m==='full'||(m!=='off'&&m!=='reduced'&&!matchMedia('(prefers-reduced-motion: reduce)').matches));
		const enabled=['synthwave','amberwave','ion'].includes(EXA.skin())||(EXA.skin()==='custom'&&EXA.customPalette().trails);
		if(!enabled){if(trails)trails.remove();trails=null;return;}
		if(!trails){trails=document.createElement('div');trails.className='neon-trails';trails.setAttribute('aria-hidden','true');for(let i=0;i<22;i++){const dot=document.createElement('i');dot.style.left=(Math.random()*100)+'%';dot.style.setProperty('--duration',(7+Math.random()*12)+'s');dot.style.setProperty('--delay',(-Math.random()*20)+'s');dot.style.setProperty('--length',(15+Math.random()*45)+'px');trails.appendChild(dot);}document.body.prepend(trails);}
		trails.hidden=!on;
	};
	document.addEventListener('click',e=>{if(e.target.closest('[data-custom-edit]'))editCustom();});
	document.addEventListener('visibilitychange',()=>EXA.updateTrails());
	matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>EXA.updateTrails());
	EXA.applyCustomTheme(); EXA.updateTrails();
}() );
