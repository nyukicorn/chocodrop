let currentAsset;
let currentVideo;
let currentURL;
let mixer;
let ready = false;
let requestId = 0;
const status = document.querySelector('#preview-status');
function renderStill() {
  const {scene,camera,renderer} = window.previewScene;
  renderer.render(scene,camera);
}
function clearAsset() {
  currentVideo?.pause(); currentVideo?.removeAttribute('src'); currentVideo?.load(); currentVideo=null;
  if(currentURL) URL.revokeObjectURL(currentURL); currentURL=null;
  if(currentAsset) {
    window.previewScene.scene.remove(currentAsset);
    const textures=new Set(), materials=new Set(), geometries=new Set();
    currentAsset.traverse(o=>{if(o.geometry) geometries.add(o.geometry); for(const m of o.material ? (Array.isArray(o.material)?o.material:[o.material]):[]) {materials.add(m);for(const v of Object.values(m)) if(v?.isTexture) textures.add(v);}});
    textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());
  }
  currentAsset=null;mixer=null;
}
function mount(object,label) {
  clearAsset();
  const {scene,camera}=window.previewScene;
  object.position.set(7,9,12); object.lookAt(camera.position);
  scene.add(object); currentAsset=object;
  renderStill(); status.textContent=`${label}を置きました ✿ 裏側からも眺めてみてください`;
}
function panel(texture,width,height) {
  texture.colorSpace=THREE.SRGBColorSpace;
  const group=new THREE.Group();
  const h=Math.min(14,9*height/width), w=h*width/height;
  const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});
  // Open frame: no opaque backing to hide the reverse side.
  group.add(new THREE.Mesh(new THREE.PlaneGeometry(w,h),material));
  const edgeMaterial=new THREE.MeshStandardMaterial({color:0xffeef8});
  for(const [x,y,bw,bh] of [[0,h/2+.12,w+.48,.24],[0,-h/2-.12,w+.48,.24],[w/2+.12,0,.24,h],[-w/2-.12,0,.24,h]]) {
    const edge=new THREE.Mesh(new THREE.BoxGeometry(bw,bh,.15),edgeMaterial);edge.position.set(x,y,0);group.add(edge);
  }
  return group;
}
async function placeFile(file) {
  const id=++requestId;
  if(file.size>32*1024*1024) throw new Error('32MB以下のファイルを選んでください');
  const ext=file.name.split('.').pop().toLowerCase();
  if(ext==='glb') {
    const buffer=await file.arrayBuffer();const view=new DataView(buffer);
    if(buffer.byteLength<20 || view.getUint32(0,true)!==0x46546c67 || view.getUint32(4,true)!==2) throw new Error('GLB 2.0ファイルを選んでください');
    const length=view.getUint32(12,true);
    if(view.getUint32(16,true)!==0x4e4f534a || length>buffer.byteLength-20) throw new Error('GLBの内容を読み取れません');
    const json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)));
    if([...(json.buffers||[]),...(json.images||[])].some(x=>x.uri&&!x.uri.startsWith('data:'))) throw new Error('外部ファイルを参照しないGLBを選んでください');
    const {GLTFLoader}=await import('./assets/loaders/GLTFLoader.js');
    const gltf=await new GLTFLoader().parseAsync(buffer,'');
    if(id!==requestId)return;
    const object=gltf.scene;const box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    const factor=9/Math.max(size.x,size.y,size.z,0.001);
    const group=new THREE.Group();object.position.sub(center);group.add(object);group.scale.setScalar(factor);
    mount(group,'3Dモデル');
    if(gltf.animations.length){mixer=new THREE.AnimationMixer(object);gltf.animations.forEach(clip=>mixer.clipAction(clip).play());}
    return;
  }
  if(['mp4','webm'].includes(ext)) {
    const url=URL.createObjectURL(file),video=document.createElement('video');
    video.muted=true;video.loop=true;video.playsInline=true;video.src=url;
    try {await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(new Error('この動画形式をブラウザで再生できません'));});
      if(id!==requestId){video.src='';URL.revokeObjectURL(url);return;}
      const texture=new THREE.VideoTexture(video);mount(panel(texture,video.videoWidth,video.videoHeight),'動画');currentVideo=video;currentURL=url;
      if(!window.previewPaused) await video.play();
    }catch(error){URL.revokeObjectURL(url);throw error;}return;
  }
  if(!['png','jpg','jpeg','webp'].includes(ext))throw new Error('PNG・JPEG・WebP・MP4・WebM・GLBを選んでください');
  const url=URL.createObjectURL(file);
  try {const texture=await new THREE.TextureLoader().loadAsync(url);if(id!==requestId){texture.dispose();return;} mount(panel(texture,texture.image.width,texture.image.height),'画像');}finally{URL.revokeObjectURL(url);}
}
window.addEventListener('preview-ready',()=>{ready=true;document.querySelector('#preview-import').disabled=false;status.textContent='画像・動画・GLBを置いてみましょう';});
let last=0;
function tick(time){if(ready&&mixer&&!window.previewPaused)mixer.update(Math.min((time-last)/1000,.05));last=time;requestAnimationFrame(tick);}requestAnimationFrame(tick);
window.addEventListener('message',async event=>{
  if(event.source!==parent||event.origin!==location.origin||!ready)return;
  const data=event.data;
  try {
    if(data.type==='zoom' && ['in','out'].includes(data.direction)){window.previewScene.zoomPreview(data.direction);}
    if(data.type==='theme'){window.previewScene.applySceneTheme(data.theme==='light'?'day':'night');renderStill();status.textContent=data.theme==='light'?'昼の遊園地':'夜の遊園地';}
    if(data.type==='sample'){const response=await fetch('assets/cat.png');if(!response.ok)throw new Error('サンプル画像を準備中です');await placeFile(new File([await response.blob()],'cat.png',{type:'image/png'}));}
    if(data.type==='file' && data.file instanceof File)await placeFile(data.file);
    if(data.type==='pause'){window.previewPaused=data.stopped;if(currentVideo){if(data.stopped)currentVideo.pause();else await currentVideo.play();}status.textContent=data.stopped?'動きを停止しています':'動きを再開しました';}
  }catch(error){status.textContent=error.message || '読み込みに失敗しました';}
});
window.addEventListener('pagehide',clearAsset);

const previewFile = document.querySelector('#preview-file');
document.querySelector('#preview-import').addEventListener('click', () => {
  if (ready) previewFile.click();
});
previewFile.addEventListener('change', async () => {
  const file = previewFile.files[0];
  if (!file) return;
  try { await placeFile(file); }
  catch (error) { status.textContent = error.message || '読み込みに失敗しました'; }
  finally { previewFile.value = ''; }
});
