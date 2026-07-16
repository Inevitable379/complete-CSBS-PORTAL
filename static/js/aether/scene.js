/* ============================================================
   AETHER — 3D Scene Engine
   Three.js environment: particles, geometry, lighting, post-FX
   ============================================================ */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ── Scene State ─────────────────────────────────────────────
let scene, camera, renderer, composer;
let starField, nebulaParticles, dustParticles;
let sectionMarkers = {};
let floatingGeometry = [];
let clock = new THREE.Clock();
let mouseX = 0, mouseY = 0;

// ── Section Positions in 3D Space ───────────────────────────
export const SECTION_POSITIONS = {
    dashboard:     { pos: new THREE.Vector3(0, 2, 0),     look: new THREE.Vector3(0, 0, -15) },
    modules:       { pos: new THREE.Vector3(-30, 4, -25), look: new THREE.Vector3(-35, 0, -35) },
    assignments:   { pos: new THREE.Vector3(-30, 4, 25),  look: new THREE.Vector3(-35, 0, 35) },
    projects:      { pos: new THREE.Vector3(30, 4, 25),   look: new THREE.Vector3(35, 0, 35) },
    announcements: { pos: new THREE.Vector3(0, 6, -35),   look: new THREE.Vector3(0, 3, -50) },
    schedule:      { pos: new THREE.Vector3(0, 3, -55),   look: new THREE.Vector3(0, 0, -70) },
    attendance:    { pos: new THREE.Vector3(30, 4, -25),   look: new THREE.Vector3(35, 0, -35) },
    gpa:           { pos: new THREE.Vector3(0, 5, 45),     look: new THREE.Vector3(0, 2, 60) },
};

// ── Initialize Scene ────────────────────────────────────────
export function initScene(canvas) {
    // Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x090B10, 0.008);

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 3, 30);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.8;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Post-processing
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.6,   // strength
        0.4,   // radius
        0.85   // threshold
    );
    composer.addPass(bloomPass);

    // Film grain shader
    const grainShader = {
        uniforms: {
            tDiffuse: { value: null },
            time: { value: 0 },
            amount: { value: 0.03 },
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform float time;
            uniform float amount;
            varying vec2 vUv;

            float rand(vec2 co) {
                return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
            }

            void main() {
                vec4 color = texture2D(tDiffuse, vUv);
                float noise = (rand(vUv + time) - 0.5) * amount;
                color.rgb += noise;
                gl_FragColor = color;
            }
        `
    };
    const grainPass = new ShaderPass(grainShader);
    composer.addPass(grainPass);

    // Build scene elements
    createStarField();
    createNebulaParticles();
    createDustParticles();
    createEnvironmentGeometry();
    createSectionMarkers();
    createLighting();

    // Mouse tracking for parallax
    window.addEventListener('mousemove', (e) => {
        mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
        mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    // Resize
    window.addEventListener('resize', onResize);

    return { scene, camera, renderer, composer };
}

// ── Star Field ──────────────────────────────────────────────
function createStarField() {
    const count = 12000;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        // Distribute in a large sphere
        const radius = 200 + Math.random() * 400;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        positions[i3]     = radius * Math.sin(phi) * Math.cos(theta);
        positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i3 + 2] = radius * Math.cos(phi);

        sizes[i] = Math.random() * 1.5 + 0.3;

        // Slight color variation: white to blue
        const warmth = Math.random();
        colors[i3]     = 0.7 + warmth * 0.3;
        colors[i3 + 1] = 0.75 + warmth * 0.25;
        colors[i3 + 2] = 0.85 + warmth * 0.15;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 0.6,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    starField = new THREE.Points(geometry, material);
    scene.add(starField);
}

// ── Nebula Particles ────────────────────────────────────────
function createNebulaParticles() {
    const count = 300;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const nebulaColors = [
        new THREE.Color(0x4DA8FF).multiplyScalar(0.3), // blue
        new THREE.Color(0x8B5CF6).multiplyScalar(0.3), // purple
        new THREE.Color(0x2A6CB8).multiplyScalar(0.2), // deep blue
    ];

    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        // Cluster in several nebula regions
        const cluster = Math.floor(Math.random() * 4);
        const cx = [50, -60, 0, -30][cluster];
        const cy = [30, -20, 50, -40][cluster];
        const cz = [-80, -60, -120, 40][cluster];

        positions[i3]     = cx + (Math.random() - 0.5) * 80;
        positions[i3 + 1] = cy + (Math.random() - 0.5) * 60;
        positions[i3 + 2] = cz + (Math.random() - 0.5) * 80;

        const c = nebulaColors[Math.floor(Math.random() * nebulaColors.length)];
        colors[i3]     = c.r;
        colors[i3 + 1] = c.g;
        colors[i3 + 2] = c.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 12,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    nebulaParticles = new THREE.Points(geometry, material);
    scene.add(nebulaParticles);
}

// ── Dust Particles (Near Camera) ────────────────────────────
function createDustParticles() {
    const count = 150;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        positions[i3]     = (Math.random() - 0.5) * 100;
        positions[i3 + 1] = (Math.random() - 0.5) * 60;
        positions[i3 + 2] = (Math.random() - 0.5) * 100;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        size: 0.15,
        color: 0x4DA8FF,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    dustParticles = new THREE.Points(geometry, material);
    scene.add(dustParticles);
}

// ── Environment Geometry ────────────────────────────────────
function createEnvironmentGeometry() {
    const emissiveBlue = new THREE.MeshStandardMaterial({
        color: 0x0a0e18,
        emissive: 0x4DA8FF,
        emissiveIntensity: 0.08,
        roughness: 0.8,
        metalness: 0.9,
        transparent: true,
        opacity: 0.6,
    });

    const emissivePurple = new THREE.MeshStandardMaterial({
        color: 0x0a0e18,
        emissive: 0x8B5CF6,
        emissiveIntensity: 0.06,
        roughness: 0.8,
        metalness: 0.9,
        transparent: true,
        opacity: 0.5,
    });

    const wireframeMat = new THREE.MeshBasicMaterial({
        color: 0x4DA8FF,
        wireframe: true,
        transparent: true,
        opacity: 0.04,
    });

    // Central ring — orbits the dashboard
    const ring1 = new THREE.Mesh(
        new THREE.TorusGeometry(18, 0.08, 16, 128),
        new THREE.MeshStandardMaterial({
            color: 0x111520,
            emissive: 0x4DA8FF,
            emissiveIntensity: 0.3,
            roughness: 0.3,
            metalness: 1.0,
        })
    );
    ring1.rotation.x = Math.PI / 2;
    ring1.position.y = 1;
    scene.add(ring1);
    floatingGeometry.push({ mesh: ring1, rotSpeed: 0.02, axis: 'y' });

    // Second ring — tilted
    const ring2 = new THREE.Mesh(
        new THREE.TorusGeometry(22, 0.05, 16, 128),
        new THREE.MeshStandardMaterial({
            color: 0x111520,
            emissive: 0x8B5CF6,
            emissiveIntensity: 0.2,
            roughness: 0.3,
            metalness: 1.0,
        })
    );
    ring2.rotation.x = Math.PI / 3;
    ring2.rotation.z = Math.PI / 6;
    ring2.position.y = 2;
    scene.add(ring2);
    floatingGeometry.push({ mesh: ring2, rotSpeed: -0.015, axis: 'y' });

    // Floating platforms at section positions
    Object.entries(SECTION_POSITIONS).forEach(([name, { pos }]) => {
        if (name === 'dashboard') return; // Dashboard is at center

        // Hexagonal platform
        const platformGeo = new THREE.CylinderGeometry(5, 5, 0.15, 6);
        const platform = new THREE.Mesh(platformGeo, emissiveBlue.clone());
        platform.position.copy(pos).add(new THREE.Vector3(0, -3, 0));
        scene.add(platform);

        // Edge glow ring
        const edgeRing = new THREE.Mesh(
            new THREE.TorusGeometry(5, 0.03, 8, 6),
            new THREE.MeshBasicMaterial({
                color: 0x4DA8FF,
                transparent: true,
                opacity: 0.3,
            })
        );
        edgeRing.rotation.x = Math.PI / 2;
        edgeRing.position.copy(platform.position).add(new THREE.Vector3(0, 0.1, 0));
        scene.add(edgeRing);
    });

    // Large distant wireframe structures (architectural depth)
    const structures = [
        { pos: [80, 20, -100], size: [30, 40, 30] },
        { pos: [-90, -10, -80], size: [25, 35, 25] },
        { pos: [60, 15, 80], size: [20, 30, 20] },
        { pos: [-70, 25, 60], size: [22, 28, 22] },
    ];

    structures.forEach(({ pos, size }) => {
        const box = new THREE.Mesh(
            new THREE.BoxGeometry(...size),
            wireframeMat.clone()
        );
        box.position.set(...pos);
        box.rotation.set(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.3);
        scene.add(box);
        floatingGeometry.push({ mesh: box, rotSpeed: 0.003 + Math.random() * 0.003, axis: 'y' });
    });

    // Grid floor plane
    const gridHelper = new THREE.GridHelper(200, 80, 0x4DA8FF, 0x4DA8FF);
    gridHelper.position.y = -5;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.02;
    gridHelper.material.depthWrite = false;
    scene.add(gridHelper);

    // Subtle horizontal energy lines
    for (let i = 0; i < 6; i++) {
        const lineGeo = new THREE.BufferGeometry();
        const startX = -100;
        const endX = 100;
        const y = -3 + Math.random() * 8;
        const z = (Math.random() - 0.5) * 80;
        lineGeo.setFromPoints([
            new THREE.Vector3(startX, y, z),
            new THREE.Vector3(endX, y, z),
        ]);
        const lineMat = new THREE.LineBasicMaterial({
            color: 0x4DA8FF,
            transparent: true,
            opacity: 0.04,
        });
        scene.add(new THREE.Line(lineGeo, lineMat));
    }
}

// ── Section Markers (glowing indicators) ────────────────────
function createSectionMarkers() {
    const markerGeo = new THREE.IcosahedronGeometry(0.4, 1);

    Object.entries(SECTION_POSITIONS).forEach(([name, { pos }]) => {
        const markerMat = new THREE.MeshStandardMaterial({
            color: 0x090B10,
            emissive: name === 'dashboard' ? 0x4DA8FF : 0x8B5CF6,
            emissiveIntensity: 0.8,
            roughness: 0.2,
            metalness: 0.8,
        });

        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.position.copy(pos);
        scene.add(marker);

        // Point light at marker
        const light = new THREE.PointLight(
            name === 'dashboard' ? 0x4DA8FF : 0x8B5CF6,
            0.5, 15
        );
        light.position.copy(pos);
        scene.add(light);

        sectionMarkers[name] = { mesh: marker, light };
        floatingGeometry.push({ mesh: marker, rotSpeed: 0.01 + Math.random() * 0.01, axis: 'y', float: true });
    });
}

// ── Lighting ────────────────────────────────────────────────
function createLighting() {
    // Ambient
    const ambient = new THREE.AmbientLight(0x4DA8FF, 0.03);
    scene.add(ambient);

    // Key light (from above-front)
    const keyLight = new THREE.DirectionalLight(0xCCDDFF, 0.15);
    keyLight.position.set(10, 30, 20);
    scene.add(keyLight);

    // Fill light (soft, from side)
    const fillLight = new THREE.DirectionalLight(0x8B5CF6, 0.05);
    fillLight.position.set(-20, 10, -10);
    scene.add(fillLight);

    // Central point light (dashboard glow)
    const centerLight = new THREE.PointLight(0x4DA8FF, 1.0, 40);
    centerLight.position.set(0, 3, 0);
    scene.add(centerLight);
}

// ── Highlight Active Section Marker ─────────────────────────
export function highlightSection(name) {
    Object.entries(sectionMarkers).forEach(([key, { mesh, light }]) => {
        const isActive = key === name;
        mesh.material.emissiveIntensity = isActive ? 1.5 : 0.4;
        light.intensity = isActive ? 1.5 : 0.3;
    });
}

// ── Animation Loop ──────────────────────────────────────────
export function animate() {
    requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();
    const delta = clock.getDelta();

    // Rotate floating geometry
    floatingGeometry.forEach(({ mesh, rotSpeed, axis, float: doFloat }) => {
        mesh.rotation[axis] += rotSpeed;
        if (doFloat) {
            mesh.position.y += Math.sin(elapsed * 0.8 + mesh.id) * 0.002;
        }
    });

    // Slowly rotate star field
    if (starField) {
        starField.rotation.y += 0.0001;
        starField.rotation.x += 0.00005;
    }

    // Drift nebula
    if (nebulaParticles) {
        nebulaParticles.rotation.y += 0.0002;
    }

    // Drift dust particles
    if (dustParticles) {
        const dustPositions = dustParticles.geometry.attributes.position.array;
        for (let i = 0; i < dustPositions.length; i += 3) {
            dustPositions[i + 1] += Math.sin(elapsed * 0.3 + i) * 0.003;
            dustPositions[i] += Math.cos(elapsed * 0.2 + i) * 0.001;
        }
        dustParticles.geometry.attributes.position.needsUpdate = true;
    }

    // Subtle camera parallax from mouse
    if (camera) {
        camera.rotation.y += (mouseX * 0.01 - camera.rotation.y) * 0.02;
        camera.rotation.x += (-mouseY * 0.008 - camera.rotation.x) * 0.02;
    }

    // Update grain shader time
    if (composer && composer.passes.length > 2) {
        const grainPass = composer.passes[2];
        if (grainPass.uniforms && grainPass.uniforms.time) {
            grainPass.uniforms.time.value = elapsed;
        }
    }

    // Render
    if (composer) {
        composer.render();
    }
}

// ── Resize Handler ──────────────────────────────────────────
function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
}

// ── Exports ─────────────────────────────────────────────────
export function getCamera() { return camera; }
export function getScene() { return scene; }
export function getRenderer() { return renderer; }
