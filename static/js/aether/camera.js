/* ============================================================
   AETHER — Camera Controller
   Cinematic transitions + WASD free-roam
   ============================================================ */

import * as THREE from 'three';
import { SECTION_POSITIONS } from './scene.js';

// ── State ───────────────────────────────────────────────────
let camera = null;
let currentTarget = new THREE.Vector3();
let desiredPosition = new THREE.Vector3();
let desiredLookAt = new THREE.Vector3();
let isTransitioning = false;
let isExploreMode = false;
let currentSection = 'dashboard';

// WASD state
const keys = { w: false, a: false, s: false, d: false, shift: false, space: false };
const moveSpeed = 0.3;
const lookSensitivity = 0.002;
let euler = new THREE.Euler(0, 0, 0, 'YXZ');
let pointerLocked = false;

// Animation
let transitionProgress = 0;
let transitionDuration = 2.0; // seconds
let transitionStart = null;
let fromPos = new THREE.Vector3();
let fromLook = new THREE.Vector3();
let toPos = new THREE.Vector3();
let toLook = new THREE.Vector3();
let onTransitionComplete = null;

// ── Initialize ──────────────────────────────────────────────
export function initCamera(cam) {
    camera = cam;

    // Start at entry position (pulled back, looking at center)
    camera.position.set(0, 4, 45);
    currentTarget.set(0, 0, 0);
    camera.lookAt(currentTarget);

    // Keyboard events
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Pointer lock for explore mode
    document.addEventListener('pointerlockchange', () => {
        pointerLocked = document.pointerLockElement != null;
    });

    document.addEventListener('mousemove', onMouseMove);
}

// ── Fly To Section (Cinematic Mode) ─────────────────────────
export function flyTo(section, duration = 2.0, callback = null) {
    const target = SECTION_POSITIONS[section];
    if (!target || !camera) return;

    currentSection = section;
    isTransitioning = true;
    transitionDuration = duration;
    transitionStart = performance.now();
    onTransitionComplete = callback;

    // Store start position
    fromPos.copy(camera.position);
    fromLook.copy(currentTarget);

    // Set destination
    toPos.copy(target.pos);
    toLook.copy(target.look);
}

// ── Entrance Animation ──────────────────────────────────────
export function playEntrance(callback) {
    // Start far away, zoom in to dashboard
    camera.position.set(0, 8, 80);
    currentTarget.set(0, 0, 40);
    camera.lookAt(currentTarget);

    flyTo('dashboard', 3.0, callback);
}

// ── Explore Mode Toggle ─────────────────────────────────────
export function setExploreMode(enabled) {
    isExploreMode = enabled;

    if (enabled) {
        // Store current camera orientation as euler
        euler.setFromQuaternion(camera.quaternion);
        // Request pointer lock for mouse look
        document.body.requestPointerLock?.();
    } else {
        document.exitPointerLock?.();
        // Return to current section position
        flyTo(currentSection, 1.5);
    }
}

export function getExploreMode() { return isExploreMode; }

// ── Update (called every frame) ─────────────────────────────
export function updateCamera() {
    if (!camera) return;

    if (isTransitioning) {
        updateTransition();
    } else if (isExploreMode) {
        updateExploreMode();
    }
}

// ── Cinematic Transition Update ─────────────────────────────
function updateTransition() {
    const now = performance.now();
    const elapsed = (now - transitionStart) / 1000;
    let t = Math.min(elapsed / transitionDuration, 1);

    // Smooth easing (ease-in-out exponential)
    t = t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;

    // Interpolate position
    camera.position.lerpVectors(fromPos, toPos, t);

    // Interpolate look target
    currentTarget.lerpVectors(fromLook, toLook, t);
    camera.lookAt(currentTarget);

    if (elapsed >= transitionDuration) {
        isTransitioning = false;
        camera.position.copy(toPos);
        currentTarget.copy(toLook);
        camera.lookAt(currentTarget);

        if (onTransitionComplete) {
            onTransitionComplete();
            onTransitionComplete = null;
        }
    }
}

// ── WASD Explore Mode Update ────────────────────────────────
function updateExploreMode() {
    const speed = keys.shift ? moveSpeed * 2 : moveSpeed;

    // Direction vectors
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, camera.up).normalize();

    // Move
    if (keys.w) camera.position.addScaledVector(forward, speed);
    if (keys.s) camera.position.addScaledVector(forward, -speed);
    if (keys.a) camera.position.addScaledVector(right, -speed);
    if (keys.d) camera.position.addScaledVector(right, speed);
    if (keys.space) camera.position.y += speed * 0.5;

    // Clamp position (keep within bounds)
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -100, 100);
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, -2, 30);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -100, 100);

    // Check proximity to section markers
    checkProximity();
}

// ── Proximity Detection ─────────────────────────────────────
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

// ── Smooth Camera Shake (subtle, for ambiance) ──────────────
let shakeIntensity = 0;
export function cameraShake(intensity = 0.1, duration = 300) {
    shakeIntensity = intensity;
    setTimeout(() => { shakeIntensity = 0; }, duration);
}

// This is called from the main animate loop if needed
export function getShakeOffset(time) {
    if (shakeIntensity <= 0) return { x: 0, y: 0 };
    return {
        x: Math.sin(time * 30) * shakeIntensity * 0.01,
        y: Math.cos(time * 25) * shakeIntensity * 0.01,
    };
}
