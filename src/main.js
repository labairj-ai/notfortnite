import * as THREE from 'three';

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

const light = new THREE.DirectionalLight(0xffffff, 1.2);
light.position.set(10, 20, 10);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.4));

// Placeholder ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshLambertMaterial({ color: 0x4a7c4e })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Build timestamp
if (typeof __BUILD_TIME__ !== 'undefined') {
  const el = document.getElementById('build-time');
  if (el) el.textContent = `Build: ${__BUILD_TIME__}`;
}

// Menu
let gameState = 'menu';
document.getElementById('play-btn').addEventListener('click', () => {
  document.getElementById('menu-screen').classList.add('hidden');
  gameState = 'playing';
  canvas.requestPointerLock();
});

document.getElementById('resume-btn').addEventListener('click', () => {
  document.getElementById('pause-screen').classList.add('hidden');
  gameState = 'playing';
  canvas.requestPointerLock();
});

document.getElementById('quit-btn').addEventListener('click', () => {
  document.getElementById('pause-screen').classList.add('hidden');
  document.getElementById('menu-screen').classList.remove('hidden');
  gameState = 'menu';
  document.exitPointerLock();
});

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && gameState === 'playing') {
    gameState = 'paused';
    document.getElementById('pause-screen').classList.remove('hidden');
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
