/* ============================================================
   AETHER — Camera Controller
   Voyage rail: one continuous route through every wing.
   Scroll / W / S glide you along it. E = free-fly explore.
   ============================================================ */

import * as THREE from 'three';
import { SECTION_POSITIONS } from './scene.js';

// ── Voyage Route (a closed circuit around the station) ──────
export const VOYAGE_ORDER = [
    'dashboard', 'announcements', 'schedule', 'modules',
    'assignments', 'gpa', 'projects', 'attendance',
];

const WING_COUNT = VOYAGE_ORDER.length;
const wingT = {};
VOYAGE_ORDER.forEach((name, i) => { wingT[name] = i / WING_COUNT; });

// ── State ───────────────────────────────────────────────────
let camera = null;
let curve = null;                    // closed Catmull-Rom through wing viewpoints
let railT = 0;                       // current position on route (unbounded float)
let targetT = 0;                     // where we're gliding to
let currentLook = new THREE.Vector3(0, 0, -15);
let isTransitioning = false;         // entrance animation only
let isExploreMode = false;
let currentSection = 'dashboard';
let mouseNX = 0, mouseNY = 0;        // normalized mouse for micro-drift

// Arrival / departure hysteresis
const ARRIVE_ZONE = 0.030;
const DEPART_ZONE = 0.055;
let arrivedWing = null;
let pendingArrival = null;           // { section, callback } from flyTo()

// Callbacks up to app.js
let railCallbacks = { onArrive: null, onDepart: null, onProgress: null };
export function setRailCallbacks(cbs) { railCallbacks = { ...railCallbacks, ...cbs }; }

// WASD state
const keys = { w: false, a: false, s: false, d: false, shift: false, space: false };
const moveSpeed = 0.3;
const lookSensitivity = 0.002;
let euler = new THREE.Euler(0, 0, 0, 'YXZ');
let pointerLocked = false;

// Entrance animation
let transitionStart = null;
let transitionDuration = 3.0;
let fromPos = new THREE.Vector3();
let fromLook = new THREE.Vector3();
let onTransitionComplete = null;

const fract = (x) => x - Math.floor(x);

// ── Initialize ──────────────────────────────────────────────
export function initCamera(cam) {
    camera = cam;

    // Build the closed voyage curve through every wing viewpoint
    const points = VOYAGE_ORDER.map((name) => SECTION_POSITIONS[name].pos.clone());
    curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.4);

    camera.position.set(0, 4, 45);
    currentLook.set(0, 0, 0);
    camera.lookAt(currentLook);

    // Keyboard
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Pointer lock for explore mode
    document.addEventListener('pointerlockchange', () => {
        pointerLocked = document.pointerLockElement != null;
    });
    document.addEventListener('mousemove', onMouseMove);

    // Normalized mouse for gentle look-drift on the rail
    window.addEventListener('mousemove', (e) => {
        mouseNX = (e.clientX / window.innerWidth - 0.5) * 2;
        mouseNY = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    // Scroll = travel. Up (deltaY < 0) = forward, down = back.
    window.addEventListener('wheel', (e) => {
        if (isExploreMode || isTransitioning) return;
        // Let panels / menus scroll their own content
        if (e.target.closest && e.target.closest('.aether-panel, .aether-nav, .cmd-backdrop, .modal-backdrop, .aether-topbar')) return;
        targetT += -e.deltaY * 0.00022;
    }, { passive: true });
}

// ── Fly To Section (glides along the voyage route) ──────────
export function flyTo(section, duration = 2.0, callback = null) {
    if (!(section in wingT) || !camera) return;
    currentSection = section;

    // Shortest way around the loop
    const here = fract(railT);
    let delta = wingT[section] - here;
    if (delta > 0.5) delta -= 1;
    if (delta < -0.5) delta += 1;
    targetT = railT + delta;

    pendingArrival = { section, callback };
}

// ── Entrance Animation (straight dive, then hand off to rail) ─
export function playEntrance(callback) {
    camera.position.set(0, 8, 80);
    currentLook.set(0, 0, 40);
    camera.lookAt(currentLook);

    isTransitioning = true;
    transitionStart = performance.now();
    transitionDuration = 3.0;
    fromPos.copy(camera.position);
    fromLook.copy(currentLook);
    onTransitionComplete = callback;
}

// ── Explore Mode Toggle ─────────────────────────────────────
export function setExploreMode(enabled) {
    isExploreMode = enabled;
    if (enabled) {
        euler.setFromQuaternion(camera.quaternion);
        document.body.requestPointerLock?.();
    } else {
        document.exitPointerLock?.();
        flyTo(currentSection, 1.5);
    }
}

export function getExploreMode() { return isExploreMode; }

// ── Update (called every frame) ─────────────────────────────
export function updateCamera() {
    if (!camera) return;

    if (isTransitioning) {
        updateEntrance();
    } else if (isExploreMode) {
        updateExploreMode();
    } else {
        updateRail();
    }
}

// ── Entrance Update ─────────────────────────────────────────
function updateEntrance() {
    const elapsed = (performance.now() - transitionStart) / 1000;
    let t = Math.min(elapsed / transitionDuration, 1);
    t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const dashPos = SECTION_POSITIONS.dashboard.pos;
    const dashLook = SECTION_POSITIONS.dashboard.look;
    camera.position.lerpVectors(fromPos, dashPos, t);
    currentLook.lerpVectors(fromLook, dashLook, t);
    camera.lookAt(currentLook);

    if (elapsed >= transitionDuration) {
        isTransitioning = false;
        railT = 0;
        targetT = 0;
        arrivedWing = null; // let the rail fire the dashboard arrival
        if (onTransitionComplete) {
            const cb = onTransitionComplete;
            onTransitionComplete = null;
            cb();
        }
    }
}

// ── Voyage Rail Update ──────────────────────────────────────
function updateRail() {
    // W/S also travel the route
    if (keys.w) targetT += 0.0016;
    if (keys.s) targetT -= 0.0016;

    // Damped glide
    railT += (targetT - railT) * 0.045;

    const tf = fract(railT);
    camera.position.copy(curve.getPoint(tf));

    // Nearest wing on the loop
    let nearest = null, nearestDist = Infinity;
    VOYAGE_ORDER.forEach((name) => {
        let d = Math.abs(wingT[name] - tf);
        d = Math.min(d, 1 - d);
        if (d < nearestDist) { nearestDist = d; nearest = name; }
    });

    // Look: ahead along the route while travelling,
    // easing onto the wing's viewpoint as we pull in
    const ahead = curve.getPoint(fract(railT + 0.02));
    const wingLook = SECTION_POSITIONS[nearest].look;
    const w = THREE.MathUtils.smoothstep(1 - nearestDist / DEPART_ZONE, 0, 1);
    const look = new THREE.Vector3().lerpVectors(ahead, wingLook, w);

    // Micro-drift from mouse — a head-turn, not a steering wheel
    look.x += mouseNX * 1.6;
    look.y += -mouseNY * 1.0;

    currentLook.lerp(look, 0.08);
    camera.lookAt(currentLook);

    // Arrival / departure with hysteresis
    if (arrivedWing === null && nearestDist < ARRIVE_ZONE && Math.abs(targetT - railT) < 0.02) {
        arrivedWing = nearest;
        currentSection = nearest;
        if (pendingArrival && pendingArrival.section === nearest) {
            const cb = pendingArrival.callback;
            pendingArrival = null;
            if (cb) cb();
        }
        if (railCallbacks.onArrive) railCallbacks.onArrive(nearest);
    } else if (arrivedWing !== null) {
        let d = Math.abs(wingT[arrivedWing] - tf);
        d = Math.min(d, 1 - d);
        if (d > DEPART_ZONE) {
            const left = arrivedWing;
            arrivedWing = null;
            if (railCallbacks.onDepart) railCallbacks.onDepart(left);
        }
    }

    if (railCallbacks.onProgress) railCallbacks.onProgress(tf, nearest, arrivedWing !== null);
}

// ── WASD Explore Mode Update ────────────────────────────────
function updateExploreMode() {
    const speed = keys.shift ? moveSpeed * 2 : moveSpeed;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, camera.up).normalize();

    if (keys.w) camera.position.addScaledVector(forward, speed);
    if (keys.s) camera.position.addScaledVector(forward, -speed);
    if (keys.a) camera.position.addScaledVector(right, -speed);
    if (keys.d) camera.position.addScaledVector(right, speed);
    if (keys.space) camera.position.y += speed * 0.5;

    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -100, 100);
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, -2, 30);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -100, 100);

    checkProximity();
}

// ── Proximity Detection (explore mode) ──────────────────────
let lastNearSection = null;
let onSectionProximity = null;

export function setProximityCallback(callback) {
    onSectionProximity = callback;
}

function checkProximity() {
    const threshold = 15;
    let closest = null;
    let closestDist = Infinity;

    Object.entries(SECTION_POSITIONS).forEach(([name, { pos }]) => {
        const dist = camera.position.distanceTo(pos);
        if (dist < threshold && dist < closestDist) {
            closest = name;
            closestDist = dist;
        }
    });

    if (closest !== lastNearSection) {
        lastNearSection = closest;
        if (closest && onSectionProximity) {
            onSectionProximity(closest);
        }
    }
}

// ── Mouse Look (Explore Mode) ───────────────────────────────
function onMouseMove(e) {
    if (!isExploreMode || !pointerLocked) return;

    euler.setFromQuaternion(camera.quaternion);
    euler.y -= e.movementX * lookSensitivity;
    euler.x -= e.movementY * lookSensitivity;
    euler.x = THREE.MathUtils.clamp(euler.x, -Math.PI / 3, Math.PI / 3);
    camera.quaternion.setFromEuler(euler);
}

// ── Keyboard Input ──────────────────────────────────────────
function onKeyDown(e) {
    // Don't hijack typing
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = true;
    if (key === ' ') { keys.space = true; e.preventDefault(); }
    if (key === 'shift') keys.shift = true;
}

function onKeyUp(e) {
    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = false;
    if (key === ' ') keys.space = false;
    if (key === 'shift') keys.shift = false;
}

// ── Getters ─────────────────────────────────────────────────
export function getCurrentSection() { return currentSection; }
export function isInTransition() { return isTransitioning; }
export function getVoyageT(section) { return wingT[section]; }

// ── Smooth Camera Shake (subtle, for ambiance) ──────────────
let shakeIntensity = 0;
export function cameraShake(intensity = 0.1, duration = 300) {
    shakeIntensity = intensity;
    setTimeout(() => { shakeIntensity = 0; }, duration);
}

export function getShakeOffset(time) {
    if (shakeIntensity <= 0) return { x: 0, y: 0 };
    return {
        x: Math.sin(time * 30) * shakeIntensity * 0.01,
        y: Math.cos(time * 25) * shakeIntensity * 0.01,
    };
}
