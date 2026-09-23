import {GLTFLoader} from './vendor/GLTFLoader.js?v=7';

// Share only an active download. A failed or completed request cannot trap retry.
let pendingDownload=null;
function download(){
 if(!pendingDownload)pendingDownload=(async()=>{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),30000);
  try{
   const response=await fetch(new URL('./assets/novaris-vanguard.glb?v=7',import.meta.url),{signal:controller.signal});
   if(!response.ok)throw new Error('Model download failed ('+response.status+')');
   return await response.arrayBuffer();
  }catch(error){
   if(controller.signal.aborted)throw new Error('Model download timed out. Please retry.');
   throw error;
  }finally{clearTimeout(timeout);}
 })().finally(()=>{pendingDownload=null;});
 return pendingDownload;
}
export async function loadVanguardModel(){
 const bytes=await download();
 return new GLTFLoader().parseAsync(bytes,new URL('./assets/',import.meta.url).href);
}
