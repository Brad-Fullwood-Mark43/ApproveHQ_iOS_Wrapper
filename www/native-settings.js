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
  function openScreen(){document.querySelectorAll('#mainView .screen').forEach(e=>e.classList.add('hidden'));$('nativeFeaturesScreen').classList.remove('hidden');$('bottomNav').classList.add('hidden');refresh();}
  function closeScreen(){selectTab('jobs');}
  async function plugin(){for(let i=0;i<40;i++){const p=secure();if(p)return p;await sleep(50)}return null;}
  async function refresh(){
    const p=await plugin();
    if(!p){$('faceIdStatus').textContent='Native bridge unavailable.';$('pushPermissionStatus').textContent='Native bridge unavailable.';$('pushRegistrationStatus').textContent='';return;}
    try{const b=await p.getBiometricStatus({});const label=b?.type==='faceID'?'Face ID':b?.type==='touchID'?'Touch ID':b?.type==='opticID'?'Optic ID':'Biometrics';$('faceIdStatus').textContent=b?.available?`${label} is available on this device and can unlock your saved ApproveHQ session.`:`${label} is not currently available${b?.error?': '+b.error:'.'}`;$('testFaceIdBtn').disabled=!b?.available;}catch(e){$('faceIdStatus').textContent='Could not read Face ID status: '+(e?.message||e);}
    try{const n=await p.getNotificationStatus({});const names={authorized:'Allowed',denied:'Denied',notDetermined:'Not requested',provisional:'Provisional',ephemeral:'Ephemeral',unknown:'Unknown'};$('pushPermissionStatus').textContent=`Permission: ${names[n?.status]||n?.status||'Unknown'}`;$('pushRegistrationStatus').textContent=`APNs device registration: ${n?.registered?'Registered':'Not registered'} · ${n?.environment||'unknown'} environment`;$('testPushBtn').disabled=!n?.registered;}catch(e){$('pushPermissionStatus').textContent='Could not read notification status: '+(e?.message||e);}
  }
  async function registerPush(){const p=await plugin(),s=$('pushTestStatus');if(!p){s.textContent='Native bridge unavailable.';return;}s.textContent='Requesting permission and registering this iPhone…';try{const permission=await p.requestPushPermission({});if(!permission?.granted){s.textContent='Notifications are not allowed. You can enable them in iPhone Settings.';await refresh();return}let token;for(let i=0;i<40;i++){token=await p.getPushToken({});if(token?.deviceToken)break;await sleep(250)}if(!token?.deviceToken)throw new Error('Apple has not returned a device token yet. Keep the app open and tap Enable notifications again.');const x=await post('/api/mobile/push/register',{deviceToken:token.deviceToken,environment:token.environment||'production'});if(!x.response.ok)throw new Error(x.data?.error||'Server registration failed.');s.textContent='Push notifications registered ✓';await refresh();}catch(e){s.textContent=e?.message||'Could not register notifications.';}}
  async function testFace(){const p=await plugin(),s=$('faceIdTestStatus');if(!p){s.textContent='Native bridge unavailable.';return;}s.textContent='Starting Face ID…';try{const r=await p.authenticate({reason:'Test Face ID for ApproveHQ'});s.textContent=r?.authenticated?'Face ID test passed ✓':r?.available===false?'Face ID is unavailable.':'Face ID was not completed.';}catch(e){s.textContent=e?.message||'Face ID test failed.';}}
  async function testPush(){const b=$('testPushBtn'),s=$('pushTestStatus');b.disabled=true;s.textContent='Sending through Railway → APNs → this iPhone…';try{const x=await post('/api/mobile/push/test',{});if(!x.response.ok)throw new Error(x.data?.error||'Test push failed.');s.textContent='Apple accepted the test notification ✓';}catch(e){s.textContent=e?.message||'Could not send test notification.';}finally{b.disabled=false;}}
  $('nativeFeaturesBtn')?.addEventListener('click',openScreen);$('backFromNativeFeatures')?.addEventListener('click',closeScreen);$('refreshNativeFeatures')?.addEventListener('click',refresh);$('testFaceIdBtn')?.addEventListener('click',testFace);$('enablePushBtn')?.addEventListener('click',registerPush);$('testPushBtn')?.addEventListener('click',testPush);
})();
