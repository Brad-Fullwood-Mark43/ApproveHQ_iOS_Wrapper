'use strict';

// Keep thumbnail decoding small and never retain more than one full-size viewer image.
// The main app owns photoObjectUrls; this patch deliberately uses that same binding
// so existing navigation cleanup continues to revoke everything.
let activeFullPhotoUrl=null;

async function fetchPhotoBlobUrl(id,size){
  const suffix=size==='thumb'?'?size=thumb':'';
  const response=await fetch(API_BASE+'/api/mobile/photos/'+encodeURIComponent(id)+suffix,{
    headers:{Authorization:'Bearer '+mobileToken}
  });
  if(!response.ok)throw new Error('Could not load photo.');
  return URL.createObjectURL(await response.blob());
}

// Full-resolution images are only fetched when the user opens the viewer.
fetchPhotoUrl=async function(id){
  if(activeFullPhotoUrl){
    try{URL.revokeObjectURL(activeFullPhotoUrl)}catch{}
    const oldIndex=photoObjectUrls.indexOf(activeFullPhotoUrl);
    if(oldIndex>=0)photoObjectUrls.splice(oldIndex,1);
    activeFullPhotoUrl=null;
  }
  const url=await fetchPhotoBlobUrl(id,'full');
  activeFullPhotoUrl=url;
  photoObjectUrls.push(url);
  return url;
};

// Load small 360px server-generated thumbnails one at a time. This avoids the
// large simultaneous decode spike caused by Promise.all on full-size images.
loadThumbs=async function(photos){
  for(const photo of photos){
    if(currentJobId==null)break;
    try{
      const url=await fetchPhotoBlobUrl(photo.id,'thumb');
      const image=$('pt'+photo.id);
      if(!image){URL.revokeObjectURL(url);continue;}
      photoObjectUrls.push(url);
      image.src=url;
      image.classList.remove('hidden');
      image.parentElement.querySelector('.photo-loading')?.classList.add('hidden');
      // Yield between decodes so WebKit/iOS can release temporary image memory.
      await new Promise(resolve=>setTimeout(resolve,0));
    }catch{}
  }
};

const originalClearPhotoUrls=clearPhotoUrls;
clearPhotoUrls=function(){
  const image=$('photoModalImage');
  if(image)image.removeAttribute('src');
  activeFullPhotoUrl=null;
  originalClearPhotoUrls();
};

// The original close listener still hides the viewer. This extra listener makes
// the expensive full-size blob eligible for release immediately on Close.
$('closePhotoModal').addEventListener('click',function(){
  if(activeFullPhotoUrl){
    try{URL.revokeObjectURL(activeFullPhotoUrl)}catch{}
    const index=photoObjectUrls.indexOf(activeFullPhotoUrl);
    if(index>=0)photoObjectUrls.splice(index,1);
    activeFullPhotoUrl=null;
  }
  $('photoModalImage').removeAttribute('src');
});
