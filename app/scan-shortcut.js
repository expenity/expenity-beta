/* Reserve the + hold gesture for scanning, never for dashboard editing. */
(function(){
'use strict';const E=window.EX,A=window.EXA,U=window.UI;
Object.assign(E.I18N.langs.en,{scanHoldHint:'Hold + to scan a receipt',scanRelease:'Release to scan receipt'});
Object.assign(E.I18N.langs.el,{scanHoldHint:'Κρατήστε πατημένο το + για σάρωση απόδειξης',scanRelease:'Αφήστε για σάρωση απόδειξης'});
let hold=null,suppressUntil=0;
const enabled=()=>E.state().settings.receiptScanner!==false;
A.startReceipt=()=>{if(!enabled()||A.flow.active())return;A.openTx(null,{type:'expense',scanOrigin:true,recoveryId:'scan-'+E.uid()});const id=A.receiptContext()?.id;A.receipts.open({camera:true,onCancel:()=>A.cancelScanEntry(id)});};
function clear(){if(!hold)return;clearTimeout(hold.timer);hold.feedback?.remove();hold.button.classList.remove('scan-holding','scan-armed');hold.button.querySelectorAll('.scan-hold-ring,.scan-hold-icon').forEach(x=>x.remove());hold=null;}
document.addEventListener('pointerdown',e=>{const button=e.target.closest('.fab[data-act=add],.rail-add[data-act=add]');if(!button||e.button!==0||!enabled()||A.dashboardEditing?.()||A.flow.active())return;clear();hold={button,id:e.pointerId,x:e.clientX,y:e.clientY,armed:false};button.classList.add('scan-holding');const r=button.getBoundingClientRect(),feedback=document.createElement('span');feedback.className='scan-hold-feedback';feedback.setAttribute('aria-hidden','true');feedback.style.left=(r.left+r.width/2)+'px';feedback.style.top=(r.top+r.height/2)+'px';feedback.innerHTML='<svg class="scan-hold-ring" viewBox="0 0 72 72"><circle class="scan-hold-track" cx="36" cy="36" r="32"/><circle cx="36" cy="36" r="32"/></svg>';document.body.append(feedback);hold.feedback=feedback;try{button.setPointerCapture(e.pointerId);}catch(_){}hold.timer=setTimeout(()=>{if(!hold)return;hold.armed=true;hold.feedback.classList.add('ready');button.classList.add('scan-armed');button.insertAdjacentHTML('beforeend','<span class="scan-hold-icon" aria-hidden="true">'+U.icon('photo',28)+'</span>');U.haptic(25);A.playSound?.('ready');},1000);},true);
document.addEventListener('pointermove',e=>{if(!hold||e.pointerId!==hold.id)return;const r=hold.button.getBoundingClientRect();if(Math.hypot(e.clientX-hold.x,e.clientY-hold.y)>12||e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){suppressUntil=performance.now()+1000;clear();}},true);
document.addEventListener('pointerup',e=>{if(!hold||e.pointerId!==hold.id)return;const armed=hold.armed;clear();if(armed){suppressUntil=performance.now()+1000;e.preventDefault();e.stopImmediatePropagation();A.startReceipt();}},true);
document.addEventListener('pointercancel',()=>{if(hold)suppressUntil=performance.now()+1000;clear();},true);
document.addEventListener('contextmenu',e=>{if(hold&&e.target.closest('[data-act=add]'))e.preventDefault();},true);
document.addEventListener('click',e=>{if(e.target.closest('[data-start-receipt]')){e.preventDefault();e.stopImmediatePropagation();A.startReceipt();return;}if(e.target.closest('.fab[data-act=add],.rail-add[data-act=add]')&&performance.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
const cancelFeedback=()=>{if(hold){suppressUntil=performance.now()+1000;clear();}};window.addEventListener('resize',cancelFeedback);document.addEventListener('scroll',cancelFeedback,true);
document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
A.scanShortcutHint=()=>{if(!enabled()||A.flow.active()||E.state().device.scanHoldHintSeen)return;E.state().device.scanHoldHintSeen=true;E.persist();U.toast(E.t('scanHoldHint'));};
}());
