'use strict';
(function(){
  const $=id=>document.getElementById(id);
  let securePlugin=null;
  const secure=()=>{
    if(securePlugin)return securePlugin;
    const cap=window.Capacitor;
    if(!cap)return null;
    if(cap.Plugins?.SecureSession){securePlugin=cap.Plugins.SecureSession;return securePlugin;}
    if(typeof cap.registerPlugin==='function'&&cap.isPluginAvailable?.('SecureSession')){securePlugin=cap.registerPlugin('SecureSession');return securePlugin;}
    return null;
  };
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const envLabel=value=>value==='sandbox'?'Development':value==='production'?'Production':value||'Unknown';

  function installLogoCard(){
    const screen=$('nativeFeaturesScreen');
    if(!screen||$('businessLogoCard'))return;
    const firstCard=screen.querySelector('.detail-card');
    const card=document.createElement('div');
    card.id='businessLogoCard';
    card.className='detail-card';
    card.innerHTML=`<div class="section-title">Business Logo</div><div id="businessLogoPreviewWrap" class="hidden" style="text-align:center;margin-bottom:12px"><img id="businessLogoPreview" alt="Business logo" style="max-width:180px;max-height:130px;border-radius:10px;object-fit:contain;background:#fff;padding:8px"></div><p id="businessLogoStatus" class="meta">Checking logo…</p><label class="upload-label" style="margin-top:10px">Upload / Replace Logo<input id="businessLogoInput" type="file" accept="image/*"></label><button id="removeBusinessLogo" class="action-btn danger hidden" type="button" style="width:100%;margin-top:10px">Remove Logo</button><div id="businessLogoActionStatus" class="form-status"></div>`;
    if(firstCard)screen.insertBefore(card,firstCard);else screen.appendChild(card);

    $('businessLogoInput').addEventListener('change',async function(){
      const file=this.files?.[0];
      if(!file)return;
      const action=$('businessLogoActionStatus');
      action.textContent='Uploading logo…';
      try{
        const fd=new FormData();fd.append('logo',file);
        const response=await fetch(API_BASE+'/api/mobile/business/logo',{method:'POST',headers:{Authorization:'Bearer '+mobileToken},body:fd});
        let data={};try{data=await response.json()}catch{}
        if(!response.ok)throw new Error(data.error||'Could not upload business logo.');
        action.textContent='Logo saved ✓';
        await refreshLogo();
      }catch(e){action.textContent=e?.message||'Could not upload business logo.';}finally{this.value='';}
    });

    $('removeBusinessLogo').addEventListener('click',async()=>{
      if(!window.confirm('Remove this business logo?'))return;
      const action=$('businessLogoActionStatus');
      action.textContent='Removing logo…';
      try{
        const response=await fetch(API_BASE+'/api/mobile/business/logo',{method:'DELETE',headers:{Authorization:'Bearer '+mobileToken}});
        let data={};try{data=await response.json()}catch{}
        if(!response.ok)throw new Error(data.error||'Could not remove business logo.');
        action.textContent='Logo removed ✓';
        await refreshLogo();
      }catch(e){action.textContent=e?.message||'Could not remove business logo.';}
    });
  }

  async function refreshLogo(){
    const status=$('businessLogoStatus');
    if(!status||!mobileToken)return;
    try{
      const response=await fetch(API_BASE+'/api/mobile/business/logo',{headers:{Authorization:'Bearer '+mobileToken}});
      let data={};try{data=await response.json()}catch{}
      if(!response.ok)throw new Error(data.error||'Could not load business logo.');
      const wrap=$('businessLogoPreviewWrap'),img=$('businessLogoPreview'),remove=$('removeBusinessLogo');
      if(data.hasLogo&&data.logoUrl){
        img.src=API_BASE+data.logoUrl;
        wrap.classList.remove('hidden');
        remove.classList.remove('hidden');
        status.textContent='Current business logo';
      }else{
        img.removeAttribute('src');
        wrap.classList.add('hidden');
        remove.classList.add('hidden');
        status.textContent='No business logo uploaded yet.';
      }
    }catch(e){status.textContent=e?.message||'Could not load business logo.';}
  }

  function hideSettings(){const screen=$('nativeFeaturesScreen');if(screen)screen.classList.add('hidden');}
  function openScreen(){document.querySelectorAll('#mainView .screen').forEach(e=>e.classList.add('hidden'));$('nativeFeaturesScreen').classList.remove('hidden');$('bottomNav').classList.add('hidden');refresh();}
  function closeScreen(){hideSettings();selectTab('jobs');}
  async function plugin(){for(let i=0;i<40;i++){const p=secure();if(p)return p;await sleep(50)}return null;}
  async function refresh(){
    installLogoCard();
    refreshLogo();
    const p=await plugin();
    if(!p){$('faceIdStatus').textContent='Native bridge unavailable.';$('pushPermissionStatus').textContent='Native bridge unavailable.';$('pushRegistrationStatus').textContent='';return;}
    try{const b=await p.getBiometricStatus({});const label=b?.type==='faceID'?'Face ID':b?.type==='touchID'?'Touch ID':b?.type==='opticID'?'Optic ID':'Biometrics';$('faceIdStatus').textContent=b?.available?`${label} is available on this device and can unlock your saved ApproveHQ session.`:`${label} is not currently available${b?.error?': '+b.error:'.'}`;$('testFaceIdBtn').disabled=!b?.available;}catch(e){$('faceIdStatus').textContent='Could not read Face ID status: '+(e?.message||e);}
    try{const n=await p.getNotificationStatus({});const names={authorized:'Allowed',denied:'Denied',notDetermined:'Not requested',provisional:'Provisional',ephemeral:'Ephemeral',unknown:'Unknown'};$('pushPermissionStatus').textContent=`Permission: ${names[n?.status]||n?.status||'Unknown'}`;$('pushRegistrationStatus').textContent=`APNs device registration: ${n?.registered?'Registered':'Not registered'} · ${envLabel(n?.environment)}`;$('testPushBtn').disabled=!n?.registered;}catch(e){$('pushPermissionStatus').textContent='Could not read notification status: '+(e?.message||e);}
  }
  async function registerPush(){const p=await plugin(),s=$('pushTestStatus');if(!p){s.textContent='Native bridge unavailable.';return;}s.textContent='Requesting permission and registering this iPhone…';try{const permission=await p.requestPushPermission({});if(!permission?.granted){s.textContent='Notifications are not allowed. You can enable them in iPhone Settings.';await refresh();return}let token;for(let i=0;i<40;i++){token=await p.getPushToken({});if(token?.deviceToken)break;await sleep(250)}if(!token?.deviceToken)throw new Error('Apple has not returned a device token yet. Keep the app open and tap Enable notifications again.');const x=await post('/api/mobile/push/register',{deviceToken:token.deviceToken,environment:token.environment||'production'});if(!x.response.ok)throw new Error(x.data?.error||'Server registration failed.');s.textContent='Push notifications registered ✓';await refresh();}catch(e){s.textContent=e?.message||'Could not register notifications.';}}
  async function testFace(){const p=await plugin(),s=$('faceIdTestStatus');if(!p){s.textContent='Native bridge unavailable.';return;}s.textContent='Starting Face ID…';try{const r=await p.authenticate({reason:'Test Face ID for ApproveHQ'});s.textContent=r?.authenticated?'Face ID test passed ✓':r?.available===false?'Face ID is unavailable.':'Face ID was not completed.';}catch(e){s.textContent=e?.message||'Face ID test failed.';}}
  async function testPush(){const b=$('testPushBtn'),s=$('pushTestStatus');b.disabled=true;s.textContent='Sending through Railway → APNs → this iPhone…';try{const x=await post('/api/mobile/push/test',{});console.log('ApproveHQ APNs test response',x.data);if(!x.response.ok)throw new Error(x.data?.error||'Test push failed.');const a=x.data?.attempts?.[0];if(a){s.textContent=`APNs ${a.accepted?'accepted':'rejected'} · ${envLabel(a.environment)} · HTTP ${a.status||'?'} · token ${a.token||'?'} · apns-id ${a.apnsId||'none'}`;}else{s.textContent='Apple accepted the test notification ✓';}}catch(e){s.textContent=e?.message||'Could not send test notification.';}finally{b.disabled=false;}}
  installLogoCard();
  $('nativeFeaturesBtn')?.addEventListener('click',openScreen);
  $('backFromNativeFeatures')?.addEventListener('click',closeScreen);
  $('refreshNativeFeatures')?.addEventListener('click',refresh);
  $('testFaceIdBtn')?.addEventListener('click',testFace);
  $('enablePushBtn')?.addEventListener('click',registerPush);
  $('testPushBtn')?.addEventListener('click',testPush);
  document.querySelectorAll('#bottomNav .tab').forEach(tab=>tab.addEventListener('click',hideSettings));
})();
