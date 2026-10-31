import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Clock, Color, Group, IcosahedronGeometry, LineBasicMaterial,
  LineSegments, Mesh, MeshPhysicalMaterial, PerspectiveCamera, PMREMGenerator, Points, Scene, ShaderMaterial, TorusGeometry, WebGLRenderer, WireframeGeometry,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface LandingScene { setPaused(paused: boolean): void; dispose(): void }

const NOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

/** Morphing iridescent core, orbit rings and a drifting particle field behind the landing hero. */
export function initLandingScene(canvas: HTMLCanvasElement, host: HTMLElement): LandingScene | null {
  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true }); }
  catch { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const styles = getComputedStyle(document.documentElement);
  const accent = new Color(styles.getPropertyValue('--accent').trim() || '#c9df7e');
  const isDark = document.documentElement.dataset.theme === 'dark'
    || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const secondary = new Color(isDark ? '#7ea8ff' : '#3556b8');

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  scene.environment = environment;
  const camera = new PerspectiveCamera(40, 1, .1, 100);
  camera.position.set(0, 0, 9);
  const world = new Group();
  scene.add(world);

  const uniforms = {
    uTime: { value: 0 }, uAccent: { value: accent }, uSecondary: { value: secondary },
    uPointer: { value: new Float32Array([0, 0]) }, uDark: { value: isDark ? 1 : 0 },
  };

  const coreMaterial = new ShaderMaterial({
    uniforms,
    vertexShader: `${NOISE}
      uniform float uTime; varying vec3 vNormal; varying vec3 vView; varying float vNoise;
      void main(){
        float n = snoise(normal*1.4 + uTime*.35);
        vNoise = n;
        vec3 p = position + normal*n*.28;
        vec4 mv = modelViewMatrix*vec4(p,1.);
        vNormal = normalize(normalMatrix*normal); vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: `
      uniform vec3 uAccent; uniform vec3 uSecondary; uniform float uTime; uniform float uDark;
      varying vec3 vNormal; varying vec3 vView; varying float vNoise;
      void main(){
        float fres = pow(1. - max(dot(vNormal, vView), 0.), 2.2);
        vec3 col = mix(uSecondary, uAccent, smoothstep(-.6, .6, vNoise + sin(uTime*.6)*.25));
        float bands = .5 + .5*sin(vNoise*14. + uTime*1.5);
        col = mix(col*.75, col, bands) + fres*.6;
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const core = new Mesh(new IcosahedronGeometry(1.05, 64), coreMaterial);
  world.add(core);

  // Refractive glass shell: the morphing core is seen through it, bent and tinted.
  const glass = new Mesh(new IcosahedronGeometry(1.75, 24), new MeshPhysicalMaterial({
    transmission: 1, thickness: 1.4, roughness: .06, ior: 1.45, metalness: 0,
    clearcoat: 1, clearcoatRoughness: .05, iridescence: .6, iridescenceIOR: 1.3,
    envMapIntensity: isDark ? 1.2 : 1.6, attenuationColor: accent, attenuationDistance: 4,
    color: new Color('#ffffff'), specularIntensity: 1,
  }));
  world.add(glass);

  const cage = new LineSegments(
    new WireframeGeometry(new IcosahedronGeometry(2.15, 1)),
    new LineBasicMaterial({ color: accent, transparent: true, opacity: isDark ? .22 : .3 }),
  );
  world.add(cage);

  const rings: Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const ring = new Mesh(
      new TorusGeometry(2.5 + i * .45, .006 + i * .002, 8, 220),
      new ShaderMaterial({
        uniforms: { ...uniforms, uOffset: { value: i * 2.1 } }, transparent: true, blending: AdditiveBlending, depthWrite: false,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: `uniform float uTime; uniform float uOffset; uniform vec3 uAccent; uniform vec3 uSecondary; varying vec2 vUv;
          void main(){ float t = fract(vUv.x - uTime*.08 - uOffset*.1); float a = smoothstep(.0,.9,t)*smoothstep(1.,.92,t);
            gl_FragColor = vec4(mix(uSecondary,uAccent,t), .15 + a*.85); }`,
      }),
    );
    ring.rotation.set(Math.PI / 2 + (i - 1) * .5, i * .7, 0);
    rings.push(ring); world.add(ring);
  }

  const count = window.innerWidth < 768 ? 900 : 2200;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = 3 + Math.random() * 6, theta = Math.random() * Math.PI * 2, phi = Math.acos(2 * Math.random() - 1);
    positions.set([r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta) * .6, r * Math.cos(phi) - 2], i * 3);
    seeds[i] = Math.random();
  }
  const particleGeometry = new BufferGeometry();
  particleGeometry.setAttribute('position', new BufferAttribute(positions, 3));
  particleGeometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
  const particles = new Points(particleGeometry, new ShaderMaterial({
    uniforms: { ...uniforms, uPixelRatio: { value: renderer.getPixelRatio() } },
    transparent: true, depthWrite: false, blending: isDark ? AdditiveBlending : undefined,
    vertexShader: `uniform float uTime; uniform float uPixelRatio; attribute float aSeed; varying float vSeed;
      void main(){ vSeed = aSeed; vec3 p = position;
        p.y += sin(uTime*.4 + aSeed*20.)*.25; p.x += cos(uTime*.3 + aSeed*12.)*.2;
        vec4 mv = modelViewMatrix*vec4(p,1.);
        gl_PointSize = (2. + aSeed*3.)*uPixelRatio*(6./-mv.z);
        gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uAccent; uniform vec3 uSecondary; uniform float uTime; varying float vSeed;
      void main(){ float d = length(gl_PointCoord-.5); if(d>.5) discard;
        float tw = .5 + .5*sin(uTime*2. + vSeed*40.);
        gl_FragColor = vec4(mix(uSecondary,uAccent,vSeed), (1.-d*2.)*(.25+tw*.6)); }`,
  }));
  scene.add(particles);

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPointer = (event: PointerEvent) => {
    pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener('pointermove', onPointer, { passive: true });

  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Push the sculpture right on wide screens so it sits behind the workspace preview, not the headline.
    world.position.x = width >= 1024 ? 2.6 : 0;
    // Below 1024px the stage sits under the copy, so drop the sculpture toward the bottom of the hero.
    world.position.y = width >= 1024 ? 0 : -2.6;
    world.scale.setScalar(width >= 1024 ? 1.1 : .62);
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  const clock = new Clock();
  let elapsed = 0, frame = 0, paused = false, visible = true;
  const render = () => {
    frame = 0;
    elapsed += Math.min(clock.getDelta(), .05);
    uniforms.uTime.value = elapsed;
    pointer.x += (pointer.tx - pointer.x) * .05; pointer.y += (pointer.ty - pointer.y) * .05;
    const scroll = Math.min(window.scrollY / Math.max(host.offsetHeight, 1), 1);
    world.rotation.y = elapsed * .12 + pointer.x * .5;
    world.rotation.x = pointer.y * .3 + scroll * .6;
    glass.rotation.y = elapsed * .05;
    cage.rotation.y = -elapsed * .2; cage.rotation.z = elapsed * .07;
    rings.forEach((ring, i) => { ring.rotation.z = elapsed * (.1 + i * .05) * (i % 2 ? -1 : 1); });
    particles.rotation.y = elapsed * .02 + pointer.x * .1;
    camera.position.z = 9 + scroll * 3;
    canvas.style.opacity = String(1 - scroll * .7);
    renderer.render(scene, camera);
    if (!paused && visible) frame = requestAnimationFrame(render);
  };
  const start = () => { if (!frame && !paused && visible) { clock.getDelta(); frame = requestAnimationFrame(render); } };
  const stop = () => { cancelAnimationFrame(frame); frame = 0; };

  const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; visible ? start() : stop(); });
  intersection.observe(host);
  const onVisibility = () => { document.hidden ? stop() : start(); };
  document.addEventListener('visibilitychange', onVisibility);

  render();
  requestAnimationFrame(() => canvas.classList.add('is-ready'));

  return {
    setPaused(next) { paused = next; if (paused) stop(); else start(); },
    dispose() {
      stop(); resizeObserver.disconnect(); intersection.disconnect();
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
      scene.traverse(object => {
        const mesh = object as Mesh;
        mesh.geometry?.dispose();
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => material?.dispose());
      });
      environment.dispose(); pmrem.dispose(); renderer.dispose();
    },
  };
}
