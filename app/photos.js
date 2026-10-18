/** Small reference photos. Only opaque photo IDs travel with financial records. */
(function(){
 'use strict';
 const {EX,EXA,UI}=window, {t,esc}=EX;
 const P=EXA.photos={busy:0};
 const valid=id=>/^ph_[A-Za-z0-9_-]{24}$/.test(id||'');
 P.slot=(id='')=>!EX.auth.isSignedIn()&&!valid(id)?`<div class="photo-slot need-account"><div class="btn-row action-stack"><button type="button" class="btn btn-ghost" disabled aria-disabled="true">${UI.icon('photo',20)} ${esc(t('photoAdd'))}</button></div><p class="account-note" role="note">${UI.icon('lock',16)} ${esc(t('photoSignIn'))}</p></div>`:`<div class="photo-slot"><input type="hidden" name="photo" value="${valid(id)?id:''}"><input class="photo-file" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden><div class="btn-row action-stack"><button type="button" class="btn btn-ghost" data-photo-add>${UI.icon('photo',20)} ${esc(t(id?'photoReplace':'photoAdd'))}</button>${valid(id)?`<button type="button" class="btn btn-ghost" data-photo-view="${id}">${UI.icon('paperclip',20)} ${esc(t('photoView'))}</button><button type="button" class="btn btn-ghost" data-photo-remove>${esc(t('photoRemove'))}</button>`:''}</div><small class="muted">${esc(t('photoHint'))}</small><p class="photo-status" role="status"></p></div>`;
 P.value=host=>host.querySelector('[name=photo]')?.value||'';
 P.button=id=>valid(id)?`<button type="button" class="btn btn-ghost" data-photo-view="${id}">${UI.icon('paperclip',20)} ${esc(t('photoView'))}</button>`:'';
 P.compress=async file=>{
  if(!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)||file.size>20*1024*1024)throw Error('photoType');
  let img;try{img=await createImageBitmap(file,{imageOrientation:'from-image'});}catch(e){throw Error('photoType');}
  try{
   const canvas=document.createElement('canvas');let edge=1000;
   while(edge>=320){const ratio=Math.min(1,edge/Math.max(img.width,img.height));canvas.width=Math.max(1,Math.round(img.width*ratio));canvas.height=Math.max(1,Math.round(img.height*ratio));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    for(const quality of [.7,.55,.45,.35]){const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',quality));if(blob&&blob.size<=60*1024)return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});}edge=Math.floor(edge*.75);
   }throw Error('photoType');
  }finally{img.close();}
 };
 P.deleteAll=async()=>{
  if(P.busy){UI.toast(t('photoWorking'));return;}
  if(!await EXA.confirm({title:t('photoDeleteAll'),text:t('photoDeleteConfirm'),confirm:t('photoDeleteAll')}))return;
  const proof=await EX.auth.stepUp();if(!proof.ok){UI.toast(EXA.errText(proof.error));return;}
  const r=await EX.api('DELETE','/api/photos',{}, {stepUp:proof.token});
  if(!r.ok){UI.toast(EXA.errText(r.error));return;}
  const ids=new Set(r.json.ids);
  for(const name of ['txs','bills','accounts','budgets','goals','incomes'])for(const item of EX.state()[name])if(ids.has(item.photo))delete item.photo;
  EX.persist();EXA.render();
  await EX.sync.run();
  UI.toast(t('photoDeletedAll'));
 };

 async function view(id){
  if(!valid(id))return;
  const r=await EX.api('GET','/api/photos/'+id);
  if(!r.ok){UI.toast(t('photoUnavailable'));return;}
  if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(r.json.data))return;
  // Keep the edit sheet underneath; closing the viewer does not discard an unfinished form.
  const d=document.createElement('dialog');d.className='photo-viewer';d.setAttribute('aria-label',t('photoReference'));d.innerHTML=`<button type="button" class="btn btn-ghost">${UI.icon('x',22)} ${esc(t('close'))}</button><img alt="${esc(t('photoReference'))}">`;
  d.querySelector('img').src=r.json.data;document.body.appendChild(d);d.querySelector('button').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());d.showModal();
 }
 document.addEventListener('click',e=>{
  const b=e.target.closest('[data-photo-add],[data-photo-remove],[data-photo-view]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();
  const slot=b.closest('.photo-slot');
  if(b.hasAttribute('data-photo-add')){if(!EX.auth.isSignedIn())return;slot.querySelector('input[type=file]').click();}
  else if(b.hasAttribute('data-photo-remove')){if(slot.dataset.busy)return;slot.outerHTML=P.slot();EX.emit('photochange');}
  else view(b.dataset.photoView);
 },true);
 document.addEventListener('change',async e=>{
  if(!e.target.matches('.photo-file'))return;const slot=e.target.closest('.photo-slot'),file=e.target.files[0];if(!file)return;
  const status=slot.querySelector('.photo-status');P.busy++;slot.dataset.busy='true';status.textContent=t('photoWorking');
  try{const data=await P.compress(file);if(!slot.isConnected)return;const r=await EX.api('POST','/api/photos',{data});if(!r.ok)throw Error(r.error==='photo_limit'?'photoLimit':'photoUnavailable');UI.done(t('photoAttached'));if(slot.isConnected){slot.outerHTML=P.slot(r.json.id);EX.emit('photochange');}}
  catch(err){if(status.isConnected)status.textContent=t(err.message==='photoType'?'photoType':err.message==='photoLimit'?'photoLimit':'photoUnavailable');}
  finally{P.busy--;delete slot.dataset.busy;e.target.value='';}
 });
 // Avoid losing an in-flight upload through Save, changing keypad tabs or closing a sheet remains harmless.
 document.addEventListener('submit',e=>{if(P.busy&&e.target.querySelector('.photo-slot')){e.preventDefault();e.stopImmediatePropagation();UI.toast(t('photoWorking'));}},true);
 document.addEventListener('click',e=>{if(P.busy&&e.target.closest('[data-tx],[data-tx-type],[data-key],[data-tx-date],[data-tx-cat],[data-tx-account]')){e.preventDefault();e.stopImmediatePropagation();UI.toast(t('photoWorking'));}},true);
})();
