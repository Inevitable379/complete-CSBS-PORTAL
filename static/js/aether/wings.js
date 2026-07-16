/* ============================================================
   AETHER — Wing Structures
   Each section wing gets its own landmark in 3D space.
   Procedural-first; real assets (planets, GLB ship) load
   async on top and fail silently if missing.
   ============================================================ */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SECTION_POSITIONS, WING_COLORS } from './scene.js';

const ASSETS = '/static/assets';

// Animated registries, driven by updateWings()
const spinners = [];   // { obj, speed, axis }
const pulsers = [];    // { mat, base, amp, freq, phase }
const orbiters = [];   // { obj, center, radius, speed, angle, y }
const signalRings = []; // { mesh, speed }
let ionMixer = null;

const texLoader = new THREE.TextureLoader();

function loadTex(path, srgb = true) {
    return new Promise((resolve) => {
        texLoader.load(path, (t) => {
            if (srgb) t.colorSpace = THREE.SRGBColorSpace;
            resolve(t);
        }, undefined, () => resolve(null));
    });
}

// ── Entry Point ─────────────────────────────────────────────
export function createWings(scene) {
    buildArchives(scene);      // modules
    buildLogistics(scene);     // assignments
    buildShipyard(scene);      // projects
    buildComms(scene);         // announcements
    buildNavigation(scene);    // schedule
    buildReactor(scene);       // attendance
    buildObservatory(scene);   // gpa

    // Async asset layers — never block, never throw
    addGalaxySkybox(scene);
    addSaturn(scene);
    addEarth(scene);
    addMoon(scene);
    addIonDrive(scene);
}

// ── Helpers ─────────────────────────────────────────────────
function emissiveMat(color, intensity = 0.8) {
    return new THREE.MeshStandardMaterial({
        color: 0x0a0e18,
        emissive: color,
        emissiveIntensity: intensity,
        roughness: 0.3,
        metalness: 0.9,
    });
}

function ghostMat(color, opacity = 0.12) {
    return new THREE.MeshBasicMaterial({
        color, wireframe: true, transparent: true, opacity,
    });
}

function wingAnchor(name, dy = 0) {
    const { look } = SECTION_POSITIONS[name];
    return new THREE.Vector3(look.x, look.y + dy, look.z);
}

// ── Modules → Research Archives ─────────────────────────────
// Concentric shelves of data slabs around a light column
function buildArchives(scene) {
    const c = WING_COLORS.modules;
    const g = new THREE.Group();
    g.position.copy(wingAnchor('modules'));

    const column = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 14, 8),
        emissiveMat(c, 1.2)
    );
    g.add(column);

    const slabGeo = new THREE.BoxGeometry(1.4, 0.9, 0.08);
    for (let ring = 0; ring < 3; ring++) {
        const holder = new THREE.Group();
        const radius = 3 + ring * 1.8;
        const count = 8 + ring * 4;
        for (let i = 0; i < count; i++) {
            const slab = new THREE.Mesh(slabGeo, emissiveMat(c, 0.25 + Math.random() * 0.5));
            const a = (i / count) * Math.PI * 2;
            slab.position.set(Math.cos(a) * radius, (ring - 1) * 2.4, Math.sin(a) * radius);
            slab.lookAt(0, slab.position.y, 0);
            holder.add(slab);
        }
        g.add(holder);
        spinners.push({ obj: holder, speed: (ring % 2 ? -1 : 1) * (0.05 + ring * 0.02), axis: 'y' });
    }
    scene.add(g);
}

// ── Assignments → Logistics Bay ─────────────────────────────
// Floating cargo crates drifting in a loose stack
function buildLogistics(scene) {
    const c = WING_COLORS.assignments;
    const g = new THREE.Group();
    g.position.copy(wingAnchor('assignments'));

    for (let i = 0; i < 14; i++) {
        const s = 0.7 + Math.random() * 1.2;
        const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), emissiveMat(c, 0.15));
        crate.position.set(
            (Math.random() - 0.5) * 12,
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 8
        );
        crate.rotation.set(Math.random(), Math.random(), Math.random());
        const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(crate.geometry),
            new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.5 })
        );
        crate.add(edges);
        g.add(crate);
        spinners.push({ obj: crate, speed: 0.02 + Math.random() * 0.05, axis: Math.random() > 0.5 ? 'y' : 'x' });
    }
    scene.add(g);
}

// ── Projects → Shipyard ─────────────────────────────────────
// Wireframe scaffold dock; the ion-drive GLB parks inside it
function buildShipyard(scene) {
    const c = WING_COLORS.projects;
    const g = new THREE.Group();
    g.position.copy(wingAnchor('projects'));

    const cage = new THREE.Mesh(new THREE.BoxGeometry(10, 7, 12, 3, 2, 3), ghostMat(c, 0.1));
    g.add(cage);

    // Corner pylons with work lights
    [[-5, -3.5, -6], [5, -3.5, -6], [-5, -3.5, 6], [5, -3.5, 6]].forEach(([x, y, z]) => {
        const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 7, 6), emissiveMat(c, 0.6));
        pylon.position.set(x, y + 3.5, z);
        g.add(pylon);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), emissiveMat(c, 2.0));
        tip.position.set(x, y + 7.2, z);
        g.add(tip);
        pulsers.push({ mat: tip.material, base: 1.2, amp: 1.0, freq: 2.5, phase: x + z });
    });
    scene.add(g);
}

// ── Announcements → Comms Array ─────────────────────────────
// Parabolic dish emitting expanding signal rings
function buildComms(scene) {
    const c = WING_COLORS.announcements;
    const g = new THREE.Group();
    g.position.copy(wingAnchor('announcements', 2));

    // Dish via lathe (parabola profile)
    const pts = [];
    for (let i = 0; i <= 12; i++) {
        const x = (i / 12) * 3;
        pts.push(new THREE.Vector2(x, x * x * 0.22));
    }
    const dish = new THREE.Mesh(
        new THREE.LatheGeometry(pts, 32),
        new THREE.MeshStandardMaterial({
            color: 0x0a0e18, emissive: c, emissiveIntensity: 0.3,
            roughness: 0.4, metalness: 0.95, side: THREE.DoubleSide,
        })
    );
    dish.rotation.x = -Math.PI / 2.6;
    g.add(dish);

    const feed = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), emissiveMat(c, 2.2));
    feed.position.set(0, 1.4, 1.6);
    g.add(feed);
    pulsers.push({ mat: feed.material, base: 1.6, amp: 1.2, freq: 3.2, phase: 0 });

    // Expanding broadcast rings
    for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(1, 0.02, 8, 48),
            new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.4 })
        );
        ring.position.copy(g.position).add(new THREE.Vector3(0, 1.5, 2));
        ring.rotation.x = -Math.PI / 2.6;
        ring.userData.t = i / 3;
        scene.add(ring);
        signalRings.push({ mesh: ring, speed: 0.25 });
    }
    scene.add(g);
}

// ── Schedule → Navigation Gyroscope ─────────────────────────
// Three nested rotating rings — an astrolabe
function buildNavigation(scene) {
    const c = WING_COLORS.schedule;
    const g = new THREE.Group();
    g.position.copy(wingAnchor('schedule', 2));

    const radii = [3.4, 2.7, 2.0];
    radii.forEach((r, i) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 8, 64), emissiveMat(c, 0.7));
        g.add(ring);
        spinners.push({
            obj: ring,
            speed: 0.15 + i * 0.1,
            axis: ['x', 'y', 'z'][i],
        });
    });

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), emissiveMat(c, 1.5));
    g.add(core);
    pulsers.push({ mat: core.material, base: 1.2, amp: 0.6, freq: 1.8, phase: 1 });
    scene.add(g);
}

// ── Attendance → Reactor Core ───────────────────────────────
// Pulsing energy sphere in containment rings
function buildReactor(scene) {
    const c = WING_COLORS.attendance;
    const g = new THREE.Group();
    g.position.copy(wingAnchor('attendance', 1));

    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 2), emissiveMat(c, 1.6));
    g.add(core);
    pulsers.push({ mat: core.material, base: 1.3, amp: 0.9, freq: 2.2, phase: 0 });
    spinners.push({ obj: core, speed: 0.1, axis: 'y' });

    for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4 + i * 0.5, 0.04, 8, 64), emissiveMat(c, 0.5));
        ring.rotation.x = Math.PI / 2 + (i - 1) * 0.5;
        g.add(ring);
        spinners.push({ obj: ring, speed: 0.2 - i * 0.05, axis: 'z' });
    }

    const light = new THREE.PointLight(c, 1.2, 30);
    g.add(light);
    scene.add(g);
}

// ── GPA → Observatory ───────────────────────────────────────
// Open telescope ring aimed at Earth
function buildObservatory(scene) {
    const c = WING_COLORS.gpa;
    const g = new THREE.Group();
    g.position.copy(wingAnchor('gpa', 2));

    const aperture = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.12, 12, 64), emissiveMat(c, 0.8));
    g.add(aperture);
    spinners.push({ obj: aperture, speed: 0.04, axis: 'z' });

    const lens = new THREE.Mesh(
        new THREE.CircleGeometry(2.9, 48),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.05, side: THREE.DoubleSide })
    );
    g.add(lens);

    // Aim out toward deep space (where Earth sits)
    g.lookAt(0, 14, 160);
    scene.add(g);
}

// ── Async Asset Layers ──────────────────────────────────────
async function addGalaxySkybox(scene) {
    const tex = await loadTex(`${ASSETS}/premium/planets_8k/galaxy_starmap_8k.jpg`);
    if (!tex) return;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = tex;
    scene.backgroundIntensity = 0.18; // keep it deep and dark
}

async function addSaturn(scene) {
    const [satTex, ringTex] = await Promise.all([
        loadTex(`${ASSETS}/premium/planets_8k/saturn_8k.jpg`),
        loadTex(`${ASSETS}/premium/planets_8k/saturn_ring_8k.png`),
    ]);
    if (!satTex) return;

    const saturn = new THREE.Mesh(
        new THREE.SphereGeometry(26, 48, 48),
        new THREE.MeshStandardMaterial({ map: satTex, roughness: 1, metalness: 0 })
    );
    saturn.position.set(-190, 45, -230);
    saturn.rotation.z = 0.45;
    scene.add(saturn);
    spinners.push({ obj: saturn, speed: 0.008, axis: 'y' });

    if (ringTex) {
        const inner = 32, outer = 52;
        const ringGeo = new THREE.RingGeometry(inner, outer, 96);
        // Remap UVs radially so the ring texture bands read correctly
        const pos = ringGeo.attributes.position;
        const uv = ringGeo.attributes.uv;
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
        }
        const ring = new THREE.Mesh(
            ringGeo,
            new THREE.MeshBasicMaterial({
                map: ringTex, transparent: true, opacity: 0.85,
                side: THREE.DoubleSide, depthWrite: false,
            })
        );
        ring.position.copy(saturn.position);
        ring.rotation.x = Math.PI / 2 - 0.35;
        ring.rotation.y = 0.2;
        scene.add(ring);
    }
}

async function addEarth(scene) {
    const [map, normal, spec] = await Promise.all([
        loadTex(`${ASSETS}/textures/earth_atmos_2048.jpg`),
        loadTex(`${ASSETS}/textures/earth_normal_2048.jpg`, false),
        loadTex(`${ASSETS}/textures/earth_specular_2048.jpg`, false),
    ]);
    if (!map) return;

    const earth = new THREE.Mesh(
        new THREE.SphereGeometry(18, 48, 48),
        new THREE.MeshPhongMaterial({
            map,
            normalMap: normal || undefined,
            specularMap: spec || undefined,
            specular: new THREE.Color(0x333333),
            shininess: 12,
        })
    );
    // Beyond the Observatory wing — the thing the telescope points at
    earth.position.set(0, 14, 170);
    scene.add(earth);
    spinners.push({ obj: earth, speed: 0.015, axis: 'y' });

    // Soft atmosphere glow
    const glow = new THREE.Mesh(
        new THREE.SphereGeometry(18.8, 48, 48),
        new THREE.MeshBasicMaterial({
            color: 0x4DA8FF, transparent: true, opacity: 0.07,
            side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
        })
    );
    glow.position.copy(earth.position);
    scene.add(glow);

    const sun = new THREE.DirectionalLight(0xFFF4E0, 1.4);
    sun.position.set(80, 60, 120);
    sun.target = earth;
    scene.add(sun);
}

async function addMoon(scene) {
    const tex = await loadTex(`${ASSETS}/textures/moon_1024.jpg`);
    if (!tex) return;
    const moon = new THREE.Mesh(
        new THREE.SphereGeometry(3.5, 32, 32),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 })
    );
    const center = wingAnchor('schedule', 4);
    moon.position.copy(center).add(new THREE.Vector3(14, 4, -10));
    scene.add(moon);
    orbiters.push({ obj: moon, center, radius: 18, speed: 0.03, angle: 0.6, y: 6 });
}

function addIonDrive(scene) {
    const loader = new GLTFLoader();
    loader.load(
        `${ASSETS}/models/PrimaryIonDrive.glb`,
        (gltf) => {
            const ship = gltf.scene;
            ship.scale.setScalar(1.6);
            ship.position.copy(wingAnchor('projects')); // inside the scaffold cage
            ship.rotation.y = Math.PI / 4;
            scene.add(ship);
            if (gltf.animations && gltf.animations.length) {
                ionMixer = new THREE.AnimationMixer(ship);
                gltf.animations.forEach((clip) => ionMixer.clipAction(clip).play());
            }
            spinners.push({ obj: ship, speed: 0.02, axis: 'y' });
        },
        undefined,
        () => { /* scaffold alone still reads as a shipyard */ }
    );
}

// ── Per-Frame Update ────────────────────────────────────────
export function updateWings(elapsed, delta) {
    spinners.forEach(({ obj, speed, axis }) => { obj.rotation[axis] += speed * 0.016; });

    pulsers.forEach(({ mat, base, amp, freq, phase }) => {
        mat.emissiveIntensity = base + Math.sin(elapsed * freq + phase) * amp * 0.5;
    });

    orbiters.forEach((o) => {
        o.angle += o.speed * 0.016;
        o.obj.position.set(
            o.center.x + Math.cos(o.angle) * o.radius,
            o.center.y + o.y + Math.sin(o.angle * 0.7) * 2,
            o.center.z + Math.sin(o.angle) * o.radius
        );
        o.obj.rotation.y += 0.002;
    });

    signalRings.forEach(({ mesh, speed }) => {
        mesh.userData.t = (mesh.userData.t + speed * 0.016) % 1;
        const t = mesh.userData.t;
        const s = 1 + t * 6;
        mesh.scale.setScalar(s);
        mesh.material.opacity = 0.4 * (1 - t);
    });

    if (ionMixer) ionMixer.update(delta || 0.016);
}
