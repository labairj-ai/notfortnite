// Stylized sky: gradient dome with sun glow baked into the shader, a sun
// sprite, and drifting puffy clouds. Fortnite-bright.
import * as THREE from 'three';
import { cloudTexture, sunTexture } from './textures.js';

export const SUN_DIR = new THREE.Vector3(0.55, 0.72, 0.42).normalize();

export function createSky(scene) {
  const domeGeo = new THREE.SphereGeometry(640, 24, 16);
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
    uniforms: {
      uSunDir: { value: SUN_DIR },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      uniform vec3 uSunDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 horizon = vec3(0.78, 0.90, 0.98);
        vec3 zenith  = vec3(0.22, 0.52, 0.92);
        vec3 col = mix(horizon, zenith, pow(h, 0.75));
        // warm haze near the sun
        float sunAmt = pow(max(dot(vDir, uSunDir), 0.0), 6.0);
        col += vec3(1.0, 0.75, 0.45) * sunAmt * 0.35;
        // sea haze below horizon
        col = mix(vec3(0.62, 0.80, 0.92), col, smoothstep(-0.12, 0.04, vDir.y));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.renderOrder = -10;
  scene.add(dome);

  // sun sprite far along the sun direction
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTexture(), fog: false, depthWrite: false, transparent: true,
  }));
  sun.scale.setScalar(160);
  sun.position.copy(SUN_DIR).multiplyScalar(560);
  scene.add(sun);

  // clouds
  const cloudTex = cloudTexture();
  const clouds = [];
  for (let i = 0; i < 11; i++) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, transparent: true, opacity: 0.55 + Math.random() * 0.3,
      fog: false, depthWrite: false,
    }));
    const s = 55 + Math.random() * 70;
    spr.scale.set(s, s * 0.42, 1);
    spr.position.set(
      (Math.random() - 0.5) * 900,
      85 + Math.random() * 60,
      (Math.random() - 0.5) * 900,
    );
    spr.userData.speed = 1.2 + Math.random() * 1.6;
    scene.add(spr);
    clouds.push(spr);
  }

  return {
    update(dt, camera) {
      // dome + sun follow the camera so the sky never "arrives"
      dome.position.copy(camera.position);
      sun.position.copy(camera.position).addScaledVector(SUN_DIR, 560);
      for (const c of clouds) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 480) c.position.x = -480;
      }
    },
  };
}
