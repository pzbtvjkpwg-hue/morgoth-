import {Box3, Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, SkeletonHelper, Vector3, WebGLRenderer} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

export async function showModel(container,bytes,showRig,signal){
  const {scene:model}=await new GLTFLoader().parseAsync(bytes,'');
  const resources=new Set();
  model.traverse(node=>{
    for(const r of [node.geometry,node.skeleton])if(r)resources.add(r);
    for(const material of [].concat(node.material||[])){
      resources.add(material);
      for(const value of Object.values(material))if(value?.isTexture)resources.add(value);
    }
  });
  let renderer,controls,observer,helper,frame=0;
  function dispose(){
    cancelAnimationFrame(frame);
    observer?.disconnect();controls?.dispose();renderer?.dispose();
    if(renderer){renderer.forceContextLoss();renderer.domElement.remove()}
    helper?.dispose();
    for(const resource of resources)resource.dispose();
  }
  if(signal.aborted){dispose();return}
  try{
    const box=new Box3().setFromObject(model);
    if(box.isEmpty())throw Error('У модели нет геометрии для предпросмотра');
    const scene=new Scene();scene.background=new Color(0x1a1a21);
    scene.add(model,new HemisphereLight(0xfff6e6,0x7c91b0,2));
    const key=new DirectionalLight(0xffe1bf,2);key.position.set(3,5,4);scene.add(key);
    if(showRig){helper=new SkeletonHelper(model);scene.add(helper)}
    const center=box.getCenter(new Vector3()),size=box.getSize(new Vector3()).length();
    const camera=new PerspectiveCamera(37,1,size/500,size*15);
    camera.position.copy(center).addScaledVector(new Vector3(.75,.32,1.3),size);
    renderer=new WebGLRenderer({antialias:true,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    renderer.domElement.style.cssText='width:100%;height:100%;display:block;touch-action:none';
    container.append(renderer.domElement);
    controls=new OrbitControls(camera,renderer.domElement);
    controls.target.copy(center);controls.update();
    const draw=()=>{if(!document.hidden)renderer.render(scene,camera)};
    controls.addEventListener('change',draw);
    observer=new ResizeObserver(()=>{
      const width=container.clientWidth,height=container.clientHeight;
      if(!width||!height)return;
      renderer.setSize(width,height,false);
      camera.aspect=width/height;camera.updateProjectionMatrix();
      frame=requestAnimationFrame(draw);
    });
    observer.observe(container);
    signal.addEventListener('abort',dispose,{once:true});
  }catch(error){dispose();throw error}
}
