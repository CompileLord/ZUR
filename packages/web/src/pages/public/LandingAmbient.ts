import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Clock, Color, Group, IcosahedronGeometry, LineBasicMaterial, LineSegments,
  Mesh, MeshPhysicalMaterial, OctahedronGeometry, PerspectiveCamera, PMREMGenerator, Points, PointsMaterial, Scene,
  TorusGeometry, TorusKnotGeometry, WebGLRenderer, WireframeGeometry, type BufferGeometry as Geometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface LandingAmbient { setPaused(paused: boolean): void; dispose(): void }

/** Units of world-space per page pixel; the camera tracks scroll so shapes drift past like a parallax layer. */
const WORLD_PER_PX = 1 / 110;

/**
 * Fixed full-viewport canvas behind the sections below the hero: glass primitives float at the page edges at
 * different scroll depths, with a slow particle stream. Fades in once the hero sculpture scrolls away.
 */
export function initLandingAmbient(canvas: HTMLCanvasElement, hero: HTMLElement): LandingAmbient | null {
  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' }); }
  catch { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));

  const accent = new Color(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c9df7e');
  const isDark = document.documentElement.dataset.theme === 'dark'
    || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const secondary = new Color(isDark ? '#7ea8ff' : '#3556b8');

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  scene.environment = environment;
  const camera = new PerspectiveCamera(35, 1, .1, 100);
  camera.position.z = 14;
  const world = new Group();
  scene.add(world);

  const glass = (tint: Color) => new MeshPhysicalMaterial({
    transmission: 1, thickness: 1.2, roughness: .08, ior: 1.5, clearcoat: 1, clearcoatRoughness: .04,
    iridescence: .8, iridescenceIOR: 1.35, envMapIntensity: isDark ? 1.3 : 1.7,
    attenuationColor: tint, attenuationDistance: 2.5, specularIntensity: 1,
  });

  // [geometry, tint, x (fraction of half-width), page depth in px below the hero, scale, spin speed]
  const specs: Array<[Geometry, Color, number, number, number, number]> = [
    [new TorusKnotGeometry(.9, .3, 220, 32), accent, .78, 180, 1, .25],
    [new OctahedronGeometry(1.1, 0), secondary, -.82, 520, 1, .35],
    [new RoundedBoxGeometry(1.5, 1.5, 1.5, 6, .28), accent, .85, 900, .9, .2],
    [new TorusGeometry(1, .38, 48, 120), secondary, -.8, 1250, 1, .3],
    [new IcosahedronGeometry(1.1, 0), accent, .8, 1600, 1, .28],
  ];
  const shapes = specs.map(([geometry, tint, x, depth, scale, speed], i) => {
    const mesh = new Mesh(geometry, glass(tint));
    const wire = new LineSegments(new WireframeGeometry(geometry), new LineBasicMaterial({ color: tint, transparent: true, opacity: .18 }));
    wire.scale.setScalar(1.18);
    const holder = new Group();
    holder.add(mesh, wire);
    holder.scale.setScalar(scale);
    world.add(holder);
    return { holder, mesh, wire, x, depth, speed, phase: i * 1.7 };
  });

  const count = window.innerWidth < 768 ? 500 : 1400;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) positions.set([(Math.random() - .5) * 24, -Math.random() * 40, (Math.random() - .5) * 10 - 3], i * 3);
  const dustGeometry = new BufferGeometry();
  dustGeometry.setAttribute('position', new BufferAttribute(positions, 3));
  const dust = new Points(dustGeometry, new PointsMaterial({
    color: accent, size: .045, transparent: true, opacity: isDark ? .7 : .45, depthWrite: false,
    blending: isDark ? AdditiveBlending : undefined, sizeAttenuation: true,
  }));
  world.add(dust);

  let halfWidth = 6;
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    halfWidth = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z * camera.aspect;
    const narrow = window.innerWidth < 768;
    for (const shape of shapes) {
      shape.holder.position.x = shape.x * halfWidth * (narrow ? 1.05 : .92);
      shape.holder.position.y = -shape.depth * WORLD_PER_PX;
    }
  };
  window.addEventListener('resize', resize);
  resize();

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPointer = (event: PointerEvent) => {
    pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener('pointermove', onPointer, { passive: true });

  const clock = new Clock();
  let elapsed = 0, frame = 0, paused = false, smoothScroll = 0;
  const render = () => {
    frame = 0;
    const delta = Math.min(clock.getDelta(), .05);
    if (!paused) elapsed += delta;
    pointer.x += (pointer.tx - pointer.x) * .05; pointer.y += (pointer.ty - pointer.y) * .05;
    // Scroll measured from the bottom of the hero; the layer is invisible while the hero sculpture owns the screen.
    const past = window.scrollY + window.innerHeight - (hero.offsetTop + hero.offsetHeight);
    smoothScroll += (past - smoothScroll) * .08;
    world.position.y = smoothScroll * WORLD_PER_PX * .85;
    const fade = Math.min(Math.max(past / (window.innerHeight * .5), 0), 1);
    canvas.style.opacity = String(fade);
    camera.position.x = pointer.x * .6; camera.position.y = -pointer.y * .4;
    camera.lookAt(0, 0, 0);
    const velocity = past - smoothScroll;
    for (const shape of shapes) {
      const t = elapsed * shape.speed + shape.phase;
      shape.mesh.rotation.set(t * .8 + velocity * .002, t, t * .4);
      shape.wire.rotation.copy(shape.mesh.rotation);
      shape.wire.rotation.y -= t * .3;
      shape.holder.position.z = Math.sin(t * .7) * .8;
    }
    dust.rotation.y = elapsed * .015;
    dust.position.y = Math.sin(elapsed * .2) * .3;
    renderer.render(scene, camera);
    if ((fade > 0 && !paused) || Math.abs(past - smoothScroll) > .5) frame = requestAnimationFrame(render);
  };
  const start = () => { if (!frame) { clock.getDelta(); frame = requestAnimationFrame(render); } };
  const stop = () => { cancelAnimationFrame(frame); frame = 0; };
  const onVisibility = () => { document.hidden ? stop() : start(); };
  document.addEventListener('visibilitychange', onVisibility);
  // Keep scroll tracking alive even while paused: paused only freezes spin, the layer still follows the page.
  const onScroll = () => start();
  window.addEventListener('scroll', onScroll, { passive: true });
  start();

  return {
    setPaused(next) { paused = next; start(); },
    dispose() {
      stop();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('scroll', onScroll);
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
