// ==================== TERMINAL LOADING SCREEN ====================
// Wrapped in IIFE for variable isolation
(function() {
    'use strict';

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTerminalLoadingScreen);
    } else {
        initTerminalLoadingScreen();
    }

    function initTerminalLoadingScreen() {
        // --- CONFIG ---
        const canvas = document.getElementById('terminal-bg-canvas');
        const ctx = canvas.getContext('2d');
        const bootLog = document.getElementById('terminal-boot-log');
        const mainMenu = document.getElementById('terminal-main-menu');
        const camCoords = document.getElementById('terminal-cam-coords');
        const camTargetLabel = document.getElementById('terminal-cam-target');

        // --- MIDI MUSIC PLAYER ---
        let midiPlayer = null;
        let audioContext = null;
        let currentInstrument = null;

        async function initMusicPlayer() {
            try {
                console.log('[MUSIC] Initializing MIDI player...');

                // Create audio context
                audioContext = new (window.AudioContext || window.webkitAudioContext)();

                // Load MIDI file
                const response = await fetch('/assets/music/theme_music.mid');
                const arrayBuffer = await response.arrayBuffer();

                // Parse MIDI
                const midi = MidiParser.parse(new Uint8Array(arrayBuffer));
                console.log('[MUSIC] MIDI file loaded and parsed');

                // Load soundfont instrument (acoustic_grand_piano)
                currentInstrument = await Soundfont.instrument(audioContext, 'acoustic_grand_piano');
                console.log('[MUSIC] Soundfont loaded');

                // Start playing
                playMidiLoop(midi);

            } catch (error) {
                console.error('[MUSIC] Error loading MIDI:', error);
            }
        }

        function playMidiLoop(midi) {
            if (!midi || !midi.track || !currentInstrument) {
                console.error('[MUSIC] Invalid MIDI data or instrument not loaded');
                return;
            }

            // Combine all tracks
            const notes = [];
            midi.track.forEach(track => {
                let currentTime = 0;
                track.event.forEach(event => {
                    currentTime += event.deltaTime;
                    if (event.type === 9 && event.data[1] > 0) { // Note on
                        notes.push({
                            time: currentTime,
                            note: event.data[0],
                            velocity: event.data[1],
                            duration: 500 // Default duration
                        });
                    }
                });
            });

            // Convert MIDI ticks to seconds (assuming 480 ticks per beat, 120 BPM)
            const ticksPerBeat = midi.timeDivision || 480;
            const bpm = 120;
            const secondsPerTick = 60.0 / (bpm * ticksPerBeat);

            // Schedule all notes
            const startTime = audioContext.currentTime;
            let maxTime = 0;

            notes.forEach(note => {
                const time = startTime + (note.time * secondsPerTick);
                maxTime = Math.max(maxTime, time);

                // Convert MIDI note number to frequency
                const frequency = 440 * Math.pow(2, (note.note - 69) / 12);

                // Schedule note with soundfont
                currentInstrument.play(note.note, time, {
                    duration: note.duration / 1000,
                    gain: note.velocity / 127
                });
            });

            // Schedule loop restart
            const loopDuration = maxTime - startTime + 1; // Add 1 second buffer
            setTimeout(() => {
                console.log('[MUSIC] Looping theme music...');
                playMidiLoop(midi);
            }, loopDuration * 1000);
        }

        // Start music immediately (with user interaction fallback)
        function startMusic() {
            if (!midiPlayer) {
                initMusicPlayer().then(() => {
                    console.log('[MUSIC] Theme music started');
                }).catch(err => {
                    console.error('[MUSIC] Failed to start:', err);
                });
            }
        }

        // Try to start music immediately
        startMusic();

        // Also start on first user interaction if autoplay blocked
        const startOnInteraction = () => {
            startMusic();
            document.removeEventListener('click', startOnInteraction);
            document.removeEventListener('keydown', startOnInteraction);
        };
        document.addEventListener('click', startOnInteraction, { once: true });
        document.addEventListener('keydown', startOnInteraction, { once: true });

        // --- 3D LIDAR ENGINE SETUP ---
        let points = [];
        let fov = 400;
        let activeWalls = [];

        // --- SCENE GENERATION ---
        function addPoint(x, y, z) { points.push({ x, y, z }); }

        function generateRoom() {
            const gridSize = 800;
            const step = 40;
            for(let x = -gridSize; x <= gridSize; x += step) {
                for(let z = -gridSize; z <= gridSize; z += step) {
                    if(Math.random() > 0.05) addPoint(x, 300, z);
                    if(Math.random() > 0.8) addPoint(x, -300, z);
                }
            }
        }

        function generateHuman(offsetX, offsetZ) {
            for(let y = 300; y > 220; y-=5) {
                for(let i=0; i<6; i++) {
                    addPoint(offsetX - 10 + Math.random()*20, y, offsetZ - 5 + Math.random()*10);
                    addPoint(offsetX + 10 + Math.random()*20, y, offsetZ - 5 + Math.random()*10);
                }
            }
            for(let y = 220; y > 150; y-=5) {
                for(let i=0; i<15; i++) {
                    let r = 20; let theta = Math.random() * Math.PI * 2;
                    addPoint(offsetX + Math.cos(theta)*r, y, offsetZ + Math.sin(theta)*r);
                }
            }
            for(let y = 150; y > 120; y-=3) {
                for(let i=0; i<10; i++) {
                    let r = 10; let theta = Math.random() * Math.PI * 2;
                    addPoint(offsetX + Math.cos(theta)*r, y, offsetZ + Math.sin(theta)*r);
                }
            }
        }

        // --- DYNAMIC WALLS ---
        class DataWall {
            constructor() {
                this.axis = Math.random() > 0.5 ? 'x' : 'z';

                let dist = 100 + Math.random() * 400;
                let sign = Math.random() > 0.5 ? 1 : -1;
                let pos1 = dist * sign;
                let pos2 = (Math.random() - 0.5) * 800;

                if (this.axis === 'x') {
                    this.x = pos2; this.z = pos1;
                } else {
                    this.x = pos1; this.z = pos2;
                }

                this.length = 150 + Math.random() * 300;
                this.height = 0;
                this.targetHeight = 200 + Math.random() * 100;

                this.state = 0;
                this.timer = 0;
                this.holdTime = 100 + Math.random() * 200;
            }

            update() {
                if (this.state === 0) {
                    this.height += 4;
                    if (this.height >= this.targetHeight) this.state = 1;
                } else if (this.state === 1) {
                    this.timer++;
                    if (this.timer >= this.holdTime) this.state = 2;
                } else if (this.state === 2) {
                    this.height -= 4;
                    if (this.height <= 0) return false;
                }
                return true;
            }

            generatePoints() {
                const p = [];
                const spacing = 15;
                const start = -this.length / 2;
                const end = this.length / 2;
                const floorY = 300;

                for (let l = start; l <= end; l += spacing) {
                    for (let h = 0; h < this.height; h += spacing) {
                        let px, pz;
                        if (this.axis === 'x') {
                            px = this.x + l; pz = this.z;
                        } else {
                            px = this.x; pz = this.z + l;
                        }
                        p.push({ x: px, y: floorY - h, z: pz });
                    }
                }
                return p;
            }
        }

        // Initialize Scene
        generateRoom();
        const human1 = { x: 0, z: 0 };
        const human2 = { x: -300, z: 200 };
        const human3 = { x: 300, z: -200 };
        generateHuman(human1.x, human1.z);
        generateHuman(human2.x, human2.z);
        generateHuman(human3.x, human3.z);

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        window.addEventListener('resize', resize);
        resize();

        // --- CAMERA STATE MACHINE ---
        let camState = {
            angle: 0,
            dist: 1200,
            y: -500,
            pivotX: 0,
            pivotZ: 0,
            speed: 0.002
        };

        let targetState = { ...camState };
        let lastSwitchTime = 0;
        let sequenceIndex = 0;

        const sequence = [
            { label: "WIDE_SCAN",   dist: 1200, y: -600, px: 0, pz: 0,           speed: 0.002, duration: 3000 },
            { label: "TARGET_ALPHA", dist: 450,  y: -200, px: human1.x, pz: human1.z, speed: 0.003, duration: 2500 },
            { label: "TARGET_BRAVO", dist: 450,  y: -200, px: human2.x, pz: human2.z, speed: 0.003, duration: 2500 },
            { label: "TARGET_CHARLIE", dist: 450,  y: -200, px: human3.x, pz: human3.z, speed: 0.003, duration: 2500 },
            { label: "WIDE_SCAN",   dist: 1200, y: -600, px: 0, pz: 0,           speed: 0.002, duration: 3000 }
        ];

        function updateCameraLogic(now) {
            const currentSeq = sequence[sequenceIndex];

            if (now - lastSwitchTime > currentSeq.duration) {
                sequenceIndex = (sequenceIndex + 1) % sequence.length;
                lastSwitchTime = now;

                const next = sequence[sequenceIndex];
                targetState.dist = next.dist;
                targetState.y = next.y;
                targetState.pivotX = next.px;
                targetState.pivotZ = next.pz;
                targetState.speed = next.speed;

                camTargetLabel.innerText = "TARGET: " + next.label;
                triggerGlitch();
            }

            const ease = 0.04;
            camState.dist += (targetState.dist - camState.dist) * ease;
            camState.y += (targetState.y - camState.y) * ease;
            camState.pivotX += (targetState.pivotX - camState.pivotX) * ease;
            camState.pivotZ += (targetState.pivotZ - camState.pivotZ) * ease;
            camState.speed += (targetState.speed - camState.speed) * ease;
            camState.angle += camState.speed;
        }

        // --- WALL MANAGER ---
        function updateWalls() {
            activeWalls = activeWalls.filter(w => w.update());

            if (activeWalls.length < 4 && Math.random() > 0.98) {
                activeWalls.push(new DataWall());
            }
        }

        // --- RENDER LOOP ---
        function draw3D() {
            const now = performance.now();
            updateCameraLogic(now);
            updateWalls();

            ctx.fillStyle = 'rgba(5, 5, 5, 1)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const cx = canvas.width / 2;
            const cy = canvas.height / 2;

            const noiseY = Math.sin(now / 500) * 10;

            if (Math.random() > 0.9) {
                camCoords.innerText = `X:${Math.floor(camState.pivotX)} Z:${Math.floor(camState.pivotZ)} D:${Math.floor(camState.dist)}`;
            }

            let renderList = [...points];
            activeWalls.forEach(w => {
                renderList = renderList.concat(w.generatePoints());
            });

            renderList.forEach(p => {
                const relX = p.x - camState.pivotX;
                const relZ = p.z - camState.pivotZ;

                let x = relX * Math.cos(camState.angle) - relZ * Math.sin(camState.angle);
                let z = relZ * Math.cos(camState.angle) + relX * Math.sin(camState.angle);

                let y = p.y - (camState.y + noiseY);
                z += camState.dist;

                if (z > 10) {
                    let scale = fov / z;
                    let sx = x * scale + cx;
                    let sy = y * scale + cy;

                    let alpha = 1 - (z / 2500);
                    if(alpha < 0) alpha = 0;

                    ctx.fillStyle = `rgba(${0 + (1-alpha)*50}, 255, ${0 + (1-alpha)*50}, ${alpha})`;

                    let size = scale * 2.5;
                    ctx.fillRect(sx, sy, size, size);
                }
            });

            requestAnimationFrame(draw3D);
        }

        draw3D();

        // --- BOOT SEQUENCE ---
        const bootLines = [
            "Loading Kernel...",
            "Mounting File System...",
            "Scanning Ports...",
            "Connecting to Neural Net...",
            "Bypassing Firewall (Port 8080)...",
            "Access Granted.",
            "Initializing Lidar Tracking...",
            "Subject Alpha: LOCATED",
            "Subject Bravo: LOCATED",
            "Subject Charlie: LOCATED",
            "Live Feed Established."
        ];

        let lineIndex = 0;
        function runBootSequence() {
            if (lineIndex < bootLines.length) {
                const div = document.createElement('div');
                div.textContent = `> ${bootLines[lineIndex]}`;
                bootLog.appendChild(div);
                lineIndex++;
                setTimeout(runBootSequence, Math.random() * 200 + 50);
            } else {
                setTimeout(() => {
                    bootLog.style.display = 'none';
                    mainMenu.style.opacity = '1';
                    startRandomGlitches();
                }, 800);
            }
        }
        runBootSequence();

        // --- GLITCH SYSTEM ---
        function triggerGlitch() {
            const wrapper = document.getElementById('terminal-loading-wrapper');
            wrapper.classList.add('terminal-distortion-heavy');

            if (Math.random() > 0.5) mainMenu.style.transform = `skewX(${Math.random() * 20 - 10}deg)`;

            setTimeout(() => {
                wrapper.classList.remove('terminal-distortion-heavy');
                mainMenu.style.transform = 'none';
                scheduleNextGlitch();
            }, Math.random() * 200 + 50);
        }

        function scheduleNextGlitch() {
            setTimeout(triggerGlitch, Math.random() * 8000 + 3000);
        }
        function startRandomGlitches() { scheduleNextGlitch(); }
    }
})();

// ==================== MAIN GAME CODE ====================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';

// Physics world setup
const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0) // Earth gravity
});
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 10;
world.defaultContactMaterial.contactEquationStiffness = 1e8;
world.defaultContactMaterial.contactEquationRelaxation = 3;

// Wall configuration
const GROUND_SIZE = 20; // Gameplay boundaries
const VISUAL_GROUND_SIZE = 100; // Visual ground radius (extends to horizon)
const WALL_HEIGHT = 4;
const WALL_THICKNESS = 0.5;

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2d1b3d); // Dark purple ominous sky
scene.fog = new THREE.Fog(0x2d1b3d, 10, 50); // Matching dark purple fog

// Camera setup
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(0, 5, 8);
camera.lookAt(0, 0, 0);

// Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Critical for proper lighting and colors with GLTF models
renderer.outputColorSpace = THREE.SRGBColorSpace; // Proper color rendering
renderer.toneMapping = THREE.ACESFilmicToneMapping; // Better exposure handling
renderer.toneMappingExposure = 2.0; // Increased for super bright scene

const container = document.getElementById('canvas-container');
container.appendChild(renderer.domElement);

// OrbitControls setup
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 3;
controls.maxDistance = 30;
controls.maxPolarAngle = Math.PI / 2; // Don't let camera go below ground

// Lighting - Improved setup for GLTF models

// Add HemisphereLight for natural ambient gradient
const hemisphereLight = new THREE.HemisphereLight(
    0x2d1b3d, // Sky color (dark purple - matches ominous sky)
    0x8080a0, // Ground color (light grayish-purple)
    0.8       // Reduced intensity for moody atmosphere
);
scene.add(hemisphereLight);

// Ambient light with subtle purple tint for ominous atmosphere
const ambientLight = new THREE.AmbientLight(0xd8d0ff, 0.5); // Purple tint, reduced intensity
scene.add(ambientLight);

// Main directional light (stronger intensity for better visibility)
const directionalLight = new THREE.DirectionalLight(0xffffff, 3.0); // Increased for super bright
directionalLight.position.set(5, 10, 5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
// Better shadow camera configuration
directionalLight.shadow.camera.near = 0.1;
directionalLight.shadow.camera.far = 50;
directionalLight.shadow.camera.left = -10;
directionalLight.shadow.camera.right = 10;
directionalLight.shadow.camera.top = 10;
directionalLight.shadow.camera.bottom = -10;
scene.add(directionalLight);

// Single fill light instead of multiple directions (prevents washing out)
const fillLight = new THREE.DirectionalLight(0xffffff, 1.2); // Reduced for moody atmosphere
fillLight.position.set(-3, 5, 2);
scene.add(fillLight);

// Add some colored accent lights for sci-fi effect (animated)
const blueLight = new THREE.PointLight(0x00d4ff, 2.5, 20); // Increased intensity
blueLight.position.set(-5, 3, -5);
scene.add(blueLight);

const purpleLight = new THREE.PointLight(0xb400ff, 2.5, 20); // Increased intensity
purpleLight.position.set(5, 3, 5);
scene.add(purpleLight);

// Four powerful directional lights at ground level pointing inward
// North light (positive Z direction)
const northLight = new THREE.DirectionalLight(0xffffff, 1.5);
northLight.position.set(0, 1, 10); // At ground level, far north
northLight.target.position.set(0, 0, 0); // Point at center
scene.add(northLight);
scene.add(northLight.target);

// South light (negative Z direction)
const southLight = new THREE.DirectionalLight(0xffffff, 1.5);
southLight.position.set(0, 1, -10); // At ground level, far south
southLight.target.position.set(0, 0, 0); // Point at center
scene.add(southLight);
scene.add(southLight.target);

// East light (positive X direction)
const eastLight = new THREE.DirectionalLight(0xffffff, 1.5);
eastLight.position.set(10, 1, 0); // At ground level, far east
eastLight.target.position.set(0, 0, 0); // Point at center
scene.add(eastLight);
scene.add(eastLight.target);

// West light (negative X direction)
const westLight = new THREE.DirectionalLight(0xffffff, 1.5);
westLight.position.set(-10, 1, 0); // At ground level, far west
westLight.target.position.set(0, 0, 0); // Point at center
scene.add(westLight);
scene.add(westLight.target);

// Ring of 8 point lights around the scene at character height for complete coverage
const ringRadius = 8;
const numRingLights = 8;
for (let i = 0; i < numRingLights; i++) {
    const angle = (i / numRingLights) * Math.PI * 2;
    const pointLight = new THREE.PointLight(0xffffff, 1.2, 15);
    pointLight.position.set(
        Math.cos(angle) * ringRadius,
        2, // Character height
        Math.sin(angle) * ringRadius
    );
    scene.add(pointLight);
}

// Loaders
const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const loadingElement = document.getElementById('loading');
const characterModal = document.getElementById('character-modal');
const characterInput = document.getElementById('character-input');
const characterSubmit = document.getElementById('character-submit');

// Store the user's character choice, model type, and player mode
let userCharacter = 'sci-fi robot warrior'; // Default fallback
let userModelType = 'trellis'; // Default to Trellis
let userPlayerMode = 1; // Default to single player

// Session management
let currentSessionId = null;
let currentSession = null;

// Ground plane and character model
let groundMesh;
let groundBody;
let groundMaterial; // Store ground material globally
let characterModel;
let characterBody;
let currentPose = 'idle'; // Track current pose
let isWalkingMirrored = false; // Track if walking pose is currently mirrored

// Physics visualization helpers
let characterBoxHelper;
let groundBoxHelper;

// Boundary walls
let boundaryWalls = [];
let wallBodies = [];
let wallHelpers = [];

// Store generated images for display
const generatedImages = [];

// Environmental objects
let environmentalObjects = []; // Store {mesh, body} pairs for physics sync
let environmentalMeshes = [];
let environmentalBodies = [];

// Universal interactable objects registry
let interactableObjects = []; // Store {mesh, loreDescription, modelUrl, objectType}
let nearestInteractableObject = null; // Track which object player is currently near

// Inventory/Bag system (in-memory only, not persisted)
let playerBag = []; // Store collected items: [{objectIndex, puzzleType, description, loreDescription, modelUrl, mesh}]

// Altar and Nemotron model
let altarMesh;
let altarBody;
let nemotronModel;
let nemotronBody;

// Riddle puzzle system
let riddleText = null;
let puzzleObjects = []; // Store {mesh, body, type: 'solution'|'distractor', description, objectIndex}

// Function to update loading UI
function updateLoadingUI(message, submessage = '', showSpinner = true) {
    // Update only the text content, not the structure
    const spinnerContainer = document.getElementById('loading-spinner-container');
    const messageElement = document.getElementById('loading-message');
    const submessageElement = document.getElementById('loading-submessage');

    if (spinnerContainer) {
        spinnerContainer.style.display = showSpinner ? 'flex' : 'none';
    }

    if (messageElement) {
        messageElement.textContent = message;
    }

    if (submessageElement) {
        if (submessage) {
            submessageElement.textContent = submessage;
            submessageElement.style.display = 'block';
        } else {
            submessageElement.style.display = 'none';
        }
    }
}

// Function to add image to gallery
function addImageToGallery(imageUrl, label) {
    generatedImages.push({ url: imageUrl, label: label });

    const gallery = document.getElementById('loading-gallery');
    const galleryScroll = document.getElementById('gallery-scroll');

    // Show gallery if hidden
    if (gallery.classList.contains('hidden')) {
        gallery.classList.remove('hidden');
    }

    // Create thumbnail element
    const thumbnail = document.createElement('div');
    thumbnail.className = 'image-thumbnail';
    thumbnail.innerHTML = `
        <img src="${imageUrl}" alt="${label}">
        <div class="image-thumbnail-label">${label}</div>
    `;

    // Add click handler
    thumbnail.addEventListener('click', () => {
        showFullSizeImage(imageUrl, label);
    });

    galleryScroll.appendChild(thumbnail);

    // Auto-scroll to show latest image
    galleryScroll.scrollLeft = galleryScroll.scrollWidth;
}

// Function to show full-size image
function showFullSizeImage(imageUrl, label) {
    const modal = document.getElementById('image-viewer-modal');
    const img = document.getElementById('image-viewer-img');
    const title = document.getElementById('image-viewer-title');

    img.src = imageUrl;
    title.textContent = label;
    modal.classList.remove('hidden');
}

// Function to show/hide interaction prompt
function showInteractionPrompt(show) {
    const prompt = document.getElementById('interaction-prompt');
    if (show) {
        prompt.classList.remove('hidden');
    } else {
        prompt.classList.add('hidden');
    }
}

// Function to show Nemotron dialogue
function showNemotronDialogue() {
    const modal = document.getElementById('nemotron-modal');
    const messageElement = document.getElementById('nemotron-message');

    // Display riddle if available, otherwise show default message
    if (riddleText) {
        messageElement.textContent = riddleText;
    } else {
        messageElement.textContent = 'Welcome, traveler. You have found the sacred altar. What knowledge do you seek?';
    }

    modal.classList.remove('hidden');
    console.log('[INTERACTION] Nemotron dialogue shown');
}

// Function to hide Nemotron dialogue
function hideNemotronDialogue() {
    const modal = document.getElementById('nemotron-modal');
    modal.classList.add('hidden');
    console.log('[INTERACTION] Nemotron dialogue hidden');
}

// Register an object for universal interaction system
function registerInteractableObject(mesh, loreDescription, modelUrl, objectType) {
    if (!mesh || !loreDescription) {
        console.warn('[INTERACTION] Cannot register object - missing mesh or loreDescription');
        return;
    }

    interactableObjects.push({
        mesh: mesh,
        loreDescription: loreDescription,
        modelUrl: modelUrl || null,
        objectType: objectType || 'unknown'
    });

    console.log(`[INTERACTION] Registered ${objectType} object for interaction (total: ${interactableObjects.length})`);
}

// ==================== OBJECT VIEWER MINI SCENE ====================
// Separate Three.js scene for viewing individual objects

let viewerScene;
let viewerCamera;
let viewerRenderer;
let viewerModel;
let viewerAnimationId;

// Initialize the object viewer scene
function initObjectViewer() {
    const canvas = document.getElementById('object-viewer-canvas');
    const container = document.getElementById('object-viewer-canvas-container');

    if (!canvas || !container) {
        console.error('[VIEWER] Canvas or container not found');
        return;
    }

    // Create scene
    viewerScene = new THREE.Scene();
    viewerScene.background = new THREE.Color(0x1a0a24); // Dark purple background

    // Create camera
    const aspect = 500 / 400; // Match canvas dimensions
    viewerCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    viewerCamera.position.set(0, 1, 3);
    viewerCamera.lookAt(0, 0, 0);

    // Create renderer
    viewerRenderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    viewerRenderer.setSize(500, 400);
    viewerRenderer.setPixelRatio(window.devicePixelRatio);
    viewerRenderer.shadowMap.enabled = true;
    viewerRenderer.outputColorSpace = THREE.SRGBColorSpace;
    viewerRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    viewerRenderer.toneMappingExposure = 1.5;

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    viewerScene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight1.position.set(2, 3, 2);
    viewerScene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight2.position.set(-2, 2, -2);
    viewerScene.add(directionalLight2);

    const fillLight = new THREE.PointLight(0x39ff14, 0.5, 10);
    fillLight.position.set(0, 2, 0);
    viewerScene.add(fillLight);

    console.log('[VIEWER] Object viewer scene initialized');
}

// Load and display an object in the viewer
async function loadObjectInViewer(modelUrl, loreDescription) {
    if (!viewerScene) {
        initObjectViewer();
    }

    console.log(`[VIEWER] Loading object: ${modelUrl}`);

    try {
        // Remove previous model if exists
        if (viewerModel) {
            viewerScene.remove(viewerModel);
            viewerModel.traverse((child) => {
                if (child.isMesh) {
                    child.geometry?.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => mat.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                }
            });
        }

        // Load new model
        const gltf = await new Promise((resolve, reject) => {
            gltfLoader.load(
                modelUrl + '?t=' + Date.now(),
                resolve,
                undefined,
                reject
            );
        });

        viewerModel = gltf.scene;

        // Scale model to fit viewer nicely
        const box = new THREE.Box3().setFromObject(viewerModel);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 1.5 / maxDim; // Scale to fit in viewer
        viewerModel.scale.set(scale, scale, scale);

        // Center the model
        box.setFromObject(viewerModel);
        const center = box.getCenter(new THREE.Vector3());
        viewerModel.position.sub(center);

        // Enable proper materials
        viewerModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                    if (child.material.map) {
                        child.material.map.colorSpace = THREE.SRGBColorSpace;
                    }
                    child.material.needsUpdate = true;
                }
            }
        });

        viewerScene.add(viewerModel);
        console.log('[VIEWER] Object loaded successfully');

        // Update description
        const descElement = document.getElementById('object-viewer-description');
        if (descElement) {
            descElement.textContent = loreDescription || 'A mysterious object from this world...';
        }

        // Start animation loop
        animateObjectViewer();

    } catch (error) {
        console.error('[VIEWER] Error loading object:', error);
    }
}

// Animation loop for object viewer (rotate object)
function animateObjectViewer() {
    // Cancel previous animation if exists
    if (viewerAnimationId) {
        cancelAnimationFrame(viewerAnimationId);
    }

    function animate() {
        viewerAnimationId = requestAnimationFrame(animate);

        // Rotate model slowly
        if (viewerModel) {
            viewerModel.rotation.y += 0.01;
        }

        viewerRenderer.render(viewerScene, viewerCamera);
    }

    animate();
}

// Show object viewer modal with object
function showObjectViewer(object) {
    if (!object || !object.modelUrl) {
        console.warn('[VIEWER] Cannot show object - missing modelUrl');
        return;
    }

    console.log(`[VIEWER] Showing object viewer for ${object.objectType}`);

    const modal = document.getElementById('object-viewer-modal');
    if (modal) {
        modal.classList.remove('hidden');
        loadObjectInViewer(object.modelUrl, object.loreDescription);
    }
}

// Hide object viewer modal
function hideObjectViewer() {
    console.log('[VIEWER] Hiding object viewer');

    const modal = document.getElementById('object-viewer-modal');
    if (modal) {
        modal.classList.add('hidden');
    }

    // Stop animation loop
    if (viewerAnimationId) {
        cancelAnimationFrame(viewerAnimationId);
        viewerAnimationId = null;
    }
}

// ==================== INVENTORY/BAG SYSTEM ====================

// Check if an object is already in the bag
function isInBag(objectIndex) {
    return playerBag.some(item => item.objectIndex === objectIndex);
}

// Add object to bag and remove from scene
function addToBag(object) {
    if (!object || !object.mesh) {
        console.warn('[BAG] Cannot add to bag - invalid object');
        return false;
    }

    // Only puzzle objects can be collected
    if (!object.isPuzzleObject) {
        console.warn('[BAG] Cannot add to bag - not a puzzle object');
        return false;
    }

    // Prevent duplicates
    if (isInBag(object.objectIndex)) {
        console.log('[BAG] Item already in bag');
        return false;
    }

    // Add to bag
    playerBag.push({
        objectIndex: object.objectIndex,
        puzzleType: object.puzzleType,
        description: object.description,
        loreDescription: object.loreDescription,
        modelUrl: object.modelUrl,
        mesh: object.mesh
    });

    // Remove from scene
    scene.remove(object.mesh);

    // Remove from physics world
    if (object.body) {
        world.removeBody(object.body);
    }

    // Remove from interactable registry
    const index = interactableObjects.indexOf(object);
    if (index > -1) {
        interactableObjects.splice(index, 1);
    }

    console.log(`[BAG] Added ${object.objectType} to bag (${playerBag.length}/5 items)`);
    return true;
}

// Check if player has all solution objects
function hasAllSolutionObjects() {
    const solutionObjects = playerBag.filter(item => item.puzzleType === 'solution');
    return solutionObjects.length === 2; // Need both solution objects
}

// Show bag inventory modal
function showBagModal() {
    console.log('[BAG] Opening bag modal');

    const modal = document.getElementById('bag-modal');
    if (!modal) return;

    // Update item count
    const countElement = document.getElementById('bag-item-count');
    if (countElement) {
        countElement.textContent = `${playerBag.length}/5`;
    }

    // Render bag items
    const gridElement = document.getElementById('bag-grid');
    if (gridElement) {
        if (playerBag.length === 0) {
            gridElement.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; color: #888; padding: 40px 20px;">
                    <p style="font-size: 18px; margin: 0;">No items collected yet</p>
                    <p style="font-size: 14px; margin-top: 10px;">Press F near puzzle objects to collect them</p>
                </div>
            `;
        } else {
            gridElement.innerHTML = playerBag.map((item, index) => {
                const displayName = item.description.substring(0, 40) + (item.description.length > 40 ? '...' : '');
                const typeColor = item.puzzleType === 'solution' ? '#39ff14' : '#888';
                return `
                    <div class="bag-item-card" data-bag-index="${index}">
                        <div class="bag-item-icon" style="background: rgba(57, 255, 20, 0.1); border: 2px solid ${typeColor};">
                            <span style="font-size: 40px;">📦</span>
                        </div>
                        <div class="bag-item-name" style="color: ${typeColor};">${displayName}</div>
                        <div class="bag-item-type" style="color: #666; font-size: 11px; margin-top: 4px;">${item.puzzleType}</div>
                    </div>
                `;
            }).join('');

            // Add click handlers for bag items
            document.querySelectorAll('.bag-item-card').forEach((card) => {
                card.addEventListener('click', () => {
                    const bagIndex = parseInt(card.dataset.bagIndex);
                    const item = playerBag[bagIndex];
                    if (item) {
                        hideBagModal();
                        showObjectViewer(item);
                    }
                });
            });
        }
    }

    modal.classList.remove('hidden');
}

// Hide bag inventory modal
function hideBagModal() {
    console.log('[BAG] Closing bag modal');

    const modal = document.getElementById('bag-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Show congratulations modal
function showCongratulationsModal() {
    console.log('[CONGRATS] Showing congratulations modal');

    const modal = document.getElementById('congratulations-modal');
    if (!modal) return;

    // List the collected solution objects
    const solutionObjects = playerBag.filter(item => item.puzzleType === 'solution');
    const listElement = document.getElementById('congratulations-objects');
    if (listElement) {
        listElement.innerHTML = solutionObjects.map(item =>
            `<li>${item.description.substring(0, 50)}${item.description.length > 50 ? '...' : ''}</li>`
        ).join('');
    }

    modal.classList.remove('hidden');
}

// Hide congratulations modal
function hideCongratulationsModal() {
    console.log('[CONGRATS] Closing congratulations modal');

    const modal = document.getElementById('congratulations-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ==================== TERMINAL LOADING SCREEN BUTTON HANDLERS ====================
// Wire Initialize and Abort buttons
document.addEventListener('DOMContentLoaded', () => {
    const terminalWrapper = document.getElementById('terminal-loading-wrapper');
    const sessionModal = document.getElementById('session-modal');
    const initializeBtn = document.getElementById('terminal-initialize-btn');
    const abortBtn = document.getElementById('terminal-abort-btn');

    // Initialize button: hide loading screen and show session modal
    if (initializeBtn) {
        initializeBtn.addEventListener('click', () => {
            console.log('[TERMINAL] Initialize button clicked - starting game');
            // Hide terminal loading screen
            if (terminalWrapper) {
                terminalWrapper.classList.add('hidden');
            }
            // Show session modal (existing game entry point)
            if (sessionModal) {
                sessionModal.classList.remove('hidden');
                sessionModal.style.display = '';
            }
        });
    }

    // Abort button: confirm and close window
    if (abortBtn) {
        abortBtn.addEventListener('click', () => {
            console.log('[TERMINAL] Abort button clicked');
            const confirmed = confirm('Are you sure you want to abort? This will close the application.');
            if (confirmed) {
                window.close();
                // Fallback if window.close() doesn't work (some browsers block it)
                if (!window.closed) {
                    alert('Please close this tab manually.');
                }
            }
        });
    }
});

// Set up image viewer modal close handlers
document.addEventListener('DOMContentLoaded', () => {
    const imageViewerModal = document.getElementById('image-viewer-modal');
    const closeBtn = document.getElementById('image-viewer-close');
    const loadingModal = document.getElementById('loading');
    const loadingCloseBtn = document.getElementById('loading-close');

    // Close on X button click for image viewer
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            imageViewerModal.classList.add('hidden');
        });
    }

    // Add close handler for loading modal
    if (loadingCloseBtn) {
        loadingCloseBtn.addEventListener('click', () => {
            console.log('[UI] Force closing loading modal via X button');
            loadingModal.classList.add('hidden');
            loadingModal.style.display = 'none'; // Force hide with inline style

            // Also stop any pending operations if needed
            if (window.generationInProgress) {
                window.generationInProgress = false;
                console.log('[UI] Stopped generation process');
            }
        });
    }

    // Add close handler for Nemotron modal
    const nemotronModal = document.getElementById('nemotron-modal');
    const nemotronCloseBtn = document.getElementById('nemotron-close');
    if (nemotronCloseBtn) {
        nemotronCloseBtn.addEventListener('click', () => {
            hideNemotronDialogue();
        });
    }

    // Add close handler for Object Viewer modal
    const objectViewerModal = document.getElementById('object-viewer-modal');
    const objectViewerCloseBtn = document.getElementById('object-viewer-close');
    if (objectViewerCloseBtn) {
        objectViewerCloseBtn.addEventListener('click', () => {
            hideObjectViewer();
        });
    }

    // Add handler for "Add to Bag" button
    const addToBagBtn = document.getElementById('add-to-bag-btn');
    if (addToBagBtn) {
        addToBagBtn.addEventListener('click', () => {
            if (nearestInteractableObject && nearestInteractableObject.isPuzzleObject) {
                const success = addToBag(nearestInteractableObject);
                if (success) {
                    hideObjectViewer();
                    console.log('[BAG] Item added, closing viewer');
                }
            } else {
                console.warn('[BAG] Cannot add - not a puzzle object or no object selected');
            }
        });
    }

    // Add close handler for Bag modal
    const bagModal = document.getElementById('bag-modal');
    const bagCloseBtn = document.getElementById('bag-close');
    if (bagCloseBtn) {
        bagCloseBtn.addEventListener('click', () => {
            hideBagModal();
        });
    }

    // Add close handler for Congratulations modal
    const congratulationsModal = document.getElementById('congratulations-modal');
    const congratulationsCloseBtn = document.getElementById('congratulations-close');
    if (congratulationsCloseBtn) {
        congratulationsCloseBtn.addEventListener('click', () => {
            hideCongratulationsModal();
        });
    }

    // Add handler for Congratulations "Continue Adventure" button
    const congratulationsContinueBtn = document.getElementById('congratulations-continue');
    if (congratulationsContinueBtn) {
        congratulationsContinueBtn.addEventListener('click', () => {
            hideCongratulationsModal();
        });
    }

    // Close on ESC key
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (!imageViewerModal.classList.contains('hidden')) {
                imageViewerModal.classList.add('hidden');
            }
            // Also allow ESC to close loading modal
            if (!loadingModal.classList.contains('hidden')) {
                console.log('[UI] Closing loading modal via ESC key');
                loadingModal.classList.add('hidden');
                loadingModal.style.display = 'none';
            }
            // Also allow ESC to close Nemotron modal
            if (nemotronModal && !nemotronModal.classList.contains('hidden')) {
                hideNemotronDialogue();
            }
            // Also allow ESC to close Object Viewer modal
            if (objectViewerModal && !objectViewerModal.classList.contains('hidden')) {
                hideObjectViewer();
            }
            // Also allow ESC to close Bag modal
            if (bagModal && !bagModal.classList.contains('hidden')) {
                hideBagModal();
            }
            // Also allow ESC to close Congratulations modal
            if (congratulationsModal && !congratulationsModal.classList.contains('hidden')) {
                hideCongratulationsModal();
            }
        }
    });

    // Close on background click
    imageViewerModal.addEventListener('click', (event) => {
        if (event.target === imageViewerModal) {
            imageViewerModal.classList.add('hidden');
        }
    });

    // Close bag modal on background click
    if (bagModal) {
        bagModal.addEventListener('click', (event) => {
            if (event.target === bagModal) {
                hideBagModal();
            }
        });
    }

    // Close congratulations modal on background click
    if (congratulationsModal) {
        congratulationsModal.addEventListener('click', (event) => {
            if (event.target === congratulationsModal) {
                hideCongratulationsModal();
            }
        });
    }
});

// Create ground plane
function createGround(texture) {
    // Configure texture for tiling
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(100, 100); // Tile the texture 100x100 times for larger ground
    texture.colorSpace = THREE.SRGBColorSpace;

    // Create circular ground geometry (extends to horizon)
    const groundGeometry = new THREE.CircleGeometry(VISUAL_GROUND_SIZE, 64); // 64 segments for smooth circle

    // Create material with the texture
    const groundMeshMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.7,
        metalness: 0.3,
        side: THREE.DoubleSide
    });

    // Create mesh
    groundMesh = new THREE.Mesh(groundGeometry, groundMeshMaterial);
    groundMesh.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // Grid helper disabled - no gridlines on ground
    // const gridHelper = new THREE.GridHelper(20, 20, 0x00d4ff, 0x444444);
    // gridHelper.position.y = 0.01; // Slightly above ground
    // scene.add(gridHelper);

    // Create physics body for ground (infinite static plane)
    groundMaterial = new CANNON.Material('ground');
    groundBody = new CANNON.Body({
        mass: 0, // mass = 0 makes it static
        shape: new CANNON.Plane(),
        material: groundMaterial
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Rotate to be horizontal
    world.addBody(groundBody);

    // Create a visual bounding box for the ground (shows the collision area)
    const groundBoxGeometry = new THREE.BoxGeometry(20, 0.1, 20); // Thin box for ground
    const groundBoxEdges = new THREE.EdgesGeometry(groundBoxGeometry);
    groundBoxHelper = new THREE.LineSegments(
        groundBoxEdges,
        new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 })
    );
    groundBoxHelper.position.y = -0.05; // Position just below ground surface
    groundBoxHelper.visible = false; // Initially hidden
    scene.add(groundBoxHelper);

    console.log('[OK] Ground created successfully with physics!');
}

// Create boundary walls around the ground
function createBoundaryWalls() {
    // Only create South Wall (for meme posters)
    const walls = [
        {
            name: 'South Wall',
            position: { x: 0, y: WALL_HEIGHT / 2, z: -GROUND_SIZE / 2 },
            halfExtents: new CANNON.Vec3(GROUND_SIZE / 2, WALL_HEIGHT / 2, WALL_THICKNESS / 2),
            dimensions: { width: GROUND_SIZE, height: WALL_HEIGHT, depth: WALL_THICKNESS }
        }
    ];

    walls.forEach(wall => {
        // Create visual mesh
        const wallGeometry = new THREE.BoxGeometry(
            wall.dimensions.width,
            wall.dimensions.height,
            wall.dimensions.depth
        );
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x666666,
            roughness: 0.7,
            metalness: 0.3,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
        wallMesh.position.set(wall.position.x, wall.position.y, wall.position.z);
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        scene.add(wallMesh);
        boundaryWalls.push(wallMesh);

        // Create physics body
        const wallBody = new CANNON.Body({
            mass: 0, // Static body
            shape: new CANNON.Box(wall.halfExtents),
            material: groundMaterial // Reuse ground material
        });
        wallBody.position.set(wall.position.x, wall.position.y, wall.position.z);
        world.addBody(wallBody);
        wallBodies.push(wallBody);

        // Create visual helper for debugging
        const wallBoxEdges = new THREE.EdgesGeometry(wallGeometry);
        const wallHelper = new THREE.LineSegments(
            wallBoxEdges,
            new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 }) // Yellow for walls
        );
        wallHelper.position.set(wall.position.x, wall.position.y, wall.position.z);
        wallHelper.visible = false; // Initially hidden
        scene.add(wallHelper);
        wallHelpers.push(wallHelper);

        console.log(`[OK] ${wall.name} created at (${wall.position.x}, ${wall.position.y}, ${wall.position.z})`);
    });

    console.log('[OK] South Wall created with physics!');
}

// Create altar with physics (circular pedestal for Nemotron model)
function createAltar() {
    console.log('[ALTAR] Creating altar...');

    // Altar configuration
    const ALTAR_RADIUS = 1.5; // Radius of circular pedestal
    const ALTAR_HEIGHT = 0.75; // Height (0.5-1 unit, requires small jump)
    const ALTAR_POSITION = {
        x: 0, // Centered
        y: ALTAR_HEIGHT / 2, // Half height so base is at ground level
        z: -6.5 // 6.5 units from south wall (far enough to see meme posters)
    };

    // Create circular pedestal mesh
    const altarGeometry = new THREE.CylinderGeometry(
        ALTAR_RADIUS, // Top radius
        ALTAR_RADIUS, // Bottom radius
        ALTAR_HEIGHT, // Height
        32 // Segments for smooth circle
    );

    const altarMaterial = new THREE.MeshStandardMaterial({
        color: 0x8B7355, // Stone/brown color
        roughness: 0.8,
        metalness: 0.2
    });

    altarMesh = new THREE.Mesh(altarGeometry, altarMaterial);
    altarMesh.position.set(ALTAR_POSITION.x, ALTAR_POSITION.y, ALTAR_POSITION.z);
    altarMesh.castShadow = true;
    altarMesh.receiveShadow = true;
    scene.add(altarMesh);

    // Create physics body for altar (static cylinder)
    const altarShape = new CANNON.Cylinder(
        ALTAR_RADIUS, // Top radius
        ALTAR_RADIUS, // Bottom radius
        ALTAR_HEIGHT, // Height
        16 // Segments
    );

    altarBody = new CANNON.Body({
        mass: 0, // Static (immovable)
        shape: altarShape,
        material: groundMaterial
    });

    altarBody.position.set(ALTAR_POSITION.x, ALTAR_POSITION.y, ALTAR_POSITION.z);
    world.addBody(altarBody);

    console.log(`[OK] Altar created at (${ALTAR_POSITION.x}, ${ALTAR_POSITION.y}, ${ALTAR_POSITION.z})`);
}

// Load Nemotron model and place it on the altar
async function loadNemotronModel() {
    console.log('[NEMOTRON] Loading Nemotron model...');

    const ALTAR_HEIGHT = 0.75; // Match altar height
    const ALTAR_Z = -6.5; // Match altar Z position

    return new Promise((resolve, reject) => {
        gltfLoader.load(
            '/assets/models/nemotron.glb',
            (gltf) => {
                nemotronModel = gltf.scene;

                // Calculate bounding box for scaling
                const box = new THREE.Box3().setFromObject(nemotronModel);
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);

                // Scale to be smaller than character (approximately 0.6 units tall)
                const targetSize = 0.6;
                const scale = targetSize / maxDim;
                nemotronModel.scale.set(scale, scale, scale);

                // Recalculate bounding box after scaling
                box.setFromObject(nemotronModel);
                const scaledSize = box.getSize(new THREE.Vector3());

                // Position on top of altar
                const nemotronY = ALTAR_HEIGHT + (scaledSize.y / 2);
                nemotronModel.position.set(0, nemotronY, ALTAR_Z);

                // Enable shadows and proper materials
                nemotronModel.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;

                        if (child.material) {
                            if (child.material.map) {
                                child.material.map.colorSpace = THREE.SRGBColorSpace;
                            }
                            child.material.needsUpdate = true;
                        }
                    }
                });

                scene.add(nemotronModel);

                // Create physics body (static box collider)
                const halfExtents = new CANNON.Vec3(
                    scaledSize.x / 2,
                    scaledSize.y / 2,
                    scaledSize.z / 2
                );

                const nemotronShape = new CANNON.Box(halfExtents);

                nemotronBody = new CANNON.Body({
                    mass: 0, // Static (immovable)
                    shape: nemotronShape,
                    material: groundMaterial
                });

                nemotronBody.position.set(0, nemotronY, ALTAR_Z);
                world.addBody(nemotronBody);

                console.log(`[OK] Nemotron model loaded and placed at (0, ${nemotronY.toFixed(2)}, ${ALTAR_Z})`);
                resolve(nemotronModel);
            },
            (progress) => {
                console.log('[NEMOTRON] Loading progress:', (progress.loaded / progress.total * 100).toFixed(1) + '%');
            },
            (error) => {
                console.error('[NEMOTRON] Error loading Nemotron model:', error);
                reject(error);
            }
        );
    });
}

// Generate riddle puzzle with Claude
async function generateRiddlePuzzle(sessionId) {
    console.log('[RIDDLE] Generating riddle puzzle...');

    try {
        const response = await fetch('http://localhost:8081/api/generate-riddle-puzzle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionId })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error('Riddle generation failed: ' + data.error);
        }

        console.log(`[RIDDLE] Generated riddle ${data.cached ? '(cached)' : '(new)'}:`, data.riddle);

        // Store riddle text globally
        riddleText = data.riddle;

        // Return object descriptions in order: [solution1, solution2, distractor1, distractor2, distractor3]
        return {
            success: true,
            riddle: data.riddle,
            objectDescriptions: [
                { description: data.object1_description, type: 'solution', index: 0 },
                { description: data.object2_description, type: 'solution', index: 1 },
                { description: data.random_object1_description, type: 'distractor', index: 2 },
                { description: data.random_object2_description, type: 'distractor', index: 3 },
                { description: data.random_object3_description, type: 'distractor', index: 4 }
            ],
            cached: data.cached
        };

    } catch (error) {
        console.error('[RIDDLE] Error generating riddle:', error);
        return { success: false, error: error.message };
    }
}

// Generate a single puzzle object (following createEnv pattern exactly)
async function generatePuzzleObject(objectDesc, objectType, objectIndex, sessionId) {
    console.log(`[PUZZLE] Generating puzzle object ${objectIndex} (${objectType})...`);

    try {
        // Step 0: Generate lore-friendly description via Claude
        const llmPrompt = `Given this object description: "${objectDesc.description}", create a lore-friendly atmospheric description (2-3 sentences) that explains what this object is and why a player might encounter it in their adventure. Make it mysterious and engaging.`;

        const llmResponse = await fetch('http://localhost:8081/api/llm/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: llmPrompt })
        });
        const llmData = await llmResponse.json();

        const loreDescription = llmData.success ? llmData.answer : objectDesc.description;
        console.log(`[PUZZLE] Generated lore for object ${objectIndex}`);

        // Step 1: Generate image with white background
        const imagePrompt = `Ultra high quality 3D object, ${objectDesc.description}, neutral white background, studio lighting setup, front view, highly detailed, perfect for 3D reconstruction, clean silhouette, 8K resolution, photorealistic, no shadows on ground, object centered in frame`;

        const imageResponse = await fetch('http://localhost:8081/api/generate-character', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pose: `puzzle_object_${objectIndex}`, // Unique pose identifier
                character: imagePrompt,
                sessionId: sessionId
            })
        });
        const imageData = await imageResponse.json();

        if (!imageData.success) {
            throw new Error('Image generation failed: ' + imageData.error);
        }

        console.log(`[PUZZLE] Object ${objectIndex} image generated:`, imageData.imageUrl);
        addImageToGallery(imageData.remoteUrl || imageData.imageUrl, `Puzzle Object ${objectIndex + 1}`);

        // CRITICAL: Ensure we have remote URL for Trellis
        if (!imageData.remoteUrl) {
            throw new Error('No remote URL returned from image generation - Trellis requires remote URLs');
        }

        // Step 2: Generate 3D model with Trellis (single image) - use REMOTE URL only
        const modelResponse = await fetch('http://localhost:8081/api/generate-3d-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageUrls: [imageData.remoteUrl], // Always use remote URL for Trellis
                pose: `puzzle_object_${objectIndex}`,
                modelType: userModelType, // Use same model type as character
                sessionId: sessionId
            })
        });
        const modelData = await modelResponse.json();

        if (!modelData.success) {
            throw new Error('3D model generation failed: ' + modelData.error);
        }

        console.log(`[PUZZLE] Object ${objectIndex} 3D model generated:`, modelData.modelUrl);

        return {
            success: true,
            modelUrl: modelData.modelUrl,
            description: objectDesc.description,
            loreDescription: loreDescription, // Add lore description for interaction
            type: objectType,
            objectIndex: objectIndex
        };

    } catch (error) {
        console.error(`[PUZZLE] Error generating puzzle object ${objectIndex}:`, error);
        return { success: false, error: error.message };
    }
}

// Place puzzle objects in scene with smart collision detection
async function placePuzzleObjects(objectModels, existingObjects) {
    console.log(`[PUZZLE] Placing ${objectModels.length} puzzle objects...`);

    const placementRadius = 15; // Closer than trees (18) but not too far
    const MIN_DISTANCE = 3; // Same as environmental objects
    const SOUTH_WALL_EXCLUSION_Z = -8; // Keep clear of south wall

    for (let i = 0; i < objectModels.length; i++) {
        const objData = objectModels[i];

        try {
            const gltf = await new Promise((resolve, reject) => {
                gltfLoader.load(
                    objData.modelUrl + '?t=' + Date.now() + '&puzzle=' + i,
                    resolve,
                    undefined,
                    reject
                );
            });

            const mesh = gltf.scene;

            // Calculate bounding box for scaling
            const box = new THREE.Box3().setFromObject(mesh);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);

            // Scale to small size (0.5-1 unit) - collectible item size
            const targetSize = 0.5 + Math.random() * 0.5; // Random between 0.5-1
            const scale = targetSize / maxDim;
            mesh.scale.set(scale, scale, scale);

            // Recalculate size after scaling
            box.setFromObject(mesh);
            const scaledSize = box.getSize(new THREE.Vector3());

            // Find valid position with collision detection
            let x, z, attempts = 0;
            const maxAttempts = 100;

            do {
                // Generate random polar coordinates for circular distribution
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.sqrt(Math.random()) * placementRadius;

                x = Math.cos(angle) * radius;
                z = Math.sin(angle) * radius;

                // Check if position is valid
                let validPosition = z > SOUTH_WALL_EXCLUSION_Z; // Not in front of south wall

                // Check minimum distance to environmental objects (trees, props)
                if (validPosition) {
                    for (const obj of existingObjects) {
                        if (obj && obj.mesh) {
                            const dx = x - obj.mesh.position.x;
                            const dz = z - obj.mesh.position.z;
                            const distance = Math.sqrt(dx * dx + dz * dz);
                            if (distance < MIN_DISTANCE) {
                                validPosition = false;
                                break;
                            }
                        }
                    }
                }

                // Check minimum distance to altar
                if (validPosition && altarMesh) {
                    const dx = x - altarMesh.position.x;
                    const dz = z - altarMesh.position.z;
                    const distance = Math.sqrt(dx * dx + dz * dz);
                    if (distance < MIN_DISTANCE) {
                        validPosition = false;
                    }
                }

                // Check minimum distance to previously placed puzzle objects
                if (validPosition && i > 0) {
                    for (let j = 0; j < i; j++) {
                        const otherObj = puzzleObjects[j];
                        if (otherObj && otherObj.mesh) {
                            const dx = x - otherObj.mesh.position.x;
                            const dz = z - otherObj.mesh.position.z;
                            const distance = Math.sqrt(dx * dx + dz * dz);
                            if (distance < MIN_DISTANCE) {
                                validPosition = false;
                                break;
                            }
                        }
                    }
                }

                if (validPosition) break;
                attempts++;
            } while (attempts < maxAttempts);

            if (attempts >= maxAttempts) {
                console.warn(`[PUZZLE] Could not find valid position for object ${i} after ${maxAttempts} attempts, using last attempt`);
            }

            const y = scaledSize.y / 2; // Place at ground level
            mesh.position.set(x, y, z);

            // Random rotation around Y axis for variety
            mesh.rotation.y = Math.random() * Math.PI * 2;

            // Enable shadows
            mesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;

                    if (child.material) {
                        if (child.material.map) {
                            child.material.map.colorSpace = THREE.SRGBColorSpace;
                        }
                        child.material.needsUpdate = true;
                    }
                }
            });

            scene.add(mesh);

            // Create static physics body (mass = 0 for now, can be made dynamic later for inventory)
            const halfExtents = new CANNON.Vec3(
                scaledSize.x / 2,
                scaledSize.y / 2,
                scaledSize.z / 2
            );
            const objectShape = new CANNON.Box(halfExtents);

            const objectBody = new CANNON.Body({
                mass: 0, // Static object (doesn't move) - prepare for future interaction
                shape: objectShape,
                material: groundMaterial
            });

            objectBody.position.set(x, y, z);
            objectBody.quaternion.copy(mesh.quaternion);

            world.addBody(objectBody);

            // Store with full metadata for future interaction
            const puzzleObject = {
                mesh: mesh,
                body: objectBody,
                isPuzzleObject: true,
                puzzleType: objData.type, // 'solution' or 'distractor'
                objectIndex: objData.objectIndex,
                description: objData.description,
                loreDescription: objData.loreDescription || objData.description,
                modelUrl: objData.modelUrl, // Store model URL for viewer
                objectType: `puzzle_${objData.type}`,
                preparingForInteraction: true // Flag for future inventory system
            };

            puzzleObjects.push(puzzleObject);

            // Register for universal interaction system - use the full object
            interactableObjects.push(puzzleObject);
            console.log(`[INTERACTION] Registered puzzle_${objData.type} object for interaction (total: ${interactableObjects.length})`);

            console.log(`[PUZZLE] Placed ${objData.type} object ${i + 1}/${objectModels.length} at (${x.toFixed(1)}, ${z.toFixed(1)})`);

        } catch (error) {
            console.error(`[PUZZLE] Error placing puzzle object ${i}:`, error);
        }
    }

    console.log(`[PUZZLE] Finished placing ${puzzleObjects.length} puzzle objects`);
}

// Create a single meme poster on wall
async function createSinglePoster(prompt, position, rotation, sessionId, filename) {
    console.log(`[POSTER] Generating meme: ${filename}...`);

    try {
        // Generate meme image via API
        const response = await fetch('http://localhost:8081/api/generate-meme', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: prompt,
                sessionId: sessionId,
                filename: filename
            })
        });

        const data = await response.json();
        if (!data.success) {
            console.error(`[POSTER] Failed to generate ${filename}:`, data.error);
            return;
        }

        // Load texture
        const posterTexture = await new Promise((resolve, reject) => {
            textureLoader.load(
                data.imageUrl + '?t=' + Date.now(),
                resolve,
                undefined,
                reject
            );
        });

        // Configure texture for poster (no repeat, fit to geometry)
        posterTexture.colorSpace = THREE.SRGBColorSpace;
        posterTexture.wrapS = THREE.ClampToEdgeWrapping;
        posterTexture.wrapT = THREE.ClampToEdgeWrapping;

        // Create poster geometry (3x3 units - readable size)
        const posterGeometry = new THREE.PlaneGeometry(3, 3);

        // Create poster material (opaque, not transparent)
        const posterMaterial = new THREE.MeshStandardMaterial({
            map: posterTexture,
            roughness: 0.8,
            metalness: 0.1,
            side: THREE.FrontSide
        });

        // Create mesh
        const posterMesh = new THREE.Mesh(posterGeometry, posterMaterial);
        posterMesh.position.set(position.x, position.y, position.z);
        posterMesh.rotation.y = rotation;

        scene.add(posterMesh);

        console.log(`[OK] ${filename} poster added!`);
    } catch (error) {
        console.error(`[POSTER] Error creating ${filename}:`, error);
    }
}

// Create all meme posters on walls
async function createMemePosters(sessionId) {
    console.log('[POSTERS] Generating all meme posters...');

    // Define all posters to create
    const posters = [
        {
            prompt: 'Make a funny meme about hackathons',
            position: { x: -4.5, y: 2, z: -9.74 },  // South Wall, left
            rotation: 0,
            filename: 'hackathons-meme.png'
        },
        {
            prompt: 'Make a funny meme about digital ocean the software company',
            position: { x: -1.5, y: 2, z: -9.74 },  // South Wall, center-left
            rotation: 0,
            filename: 'digitalocean-meme.png'
        },
        {
            prompt: 'Make a funny meme about blackforest labs the ai company',
            position: { x: 1.5, y: 2, z: -9.74 },   // South Wall, center-right
            rotation: 0,
            filename: 'blackforestlabs-meme.png'
        },
        {
            prompt: 'Make a funny meme about cerebral valley the hackathon organizer',
            position: { x: 4.5, y: 2, z: -9.74 },   // South Wall, right
            rotation: 0,
            filename: 'cerebralvalley-meme.png'
        }
    ];

    // Generate all posters in parallel for speed
    await Promise.all(
        posters.map(poster =>
            createSinglePoster(
                poster.prompt,
                poster.position,
                poster.rotation,
                sessionId,
                poster.filename
            )
        )
    );

    console.log('[OK] All meme posters created!');
}

// Load and place meme posters with random positions (for session reload)
async function loadAndPlaceMemes(sessionId) {
    console.log('[MEMES] Loading meme posters from session with random positions...');

    try {
        // Query database for meme poster assets
        const response = await fetch(`http://localhost:8081/api/sessions/${sessionId}/assets`);
        const data = await response.json();

        if (!data.success || !data.assets) {
            console.log('[MEMES] No assets found for session');
            return;
        }

        // Filter for meme poster images
        const memeAssets = data.assets.filter(asset =>
            asset.asset_type === 'images' &&
            asset.file_path.includes('meme') &&
            asset.file_path.endsWith('.png')
        );

        console.log(`[MEMES] Found ${memeAssets.length} meme posters to reload`);

        if (memeAssets.length === 0) {
            console.log('[MEMES] No meme posters found in session');
            return;
        }

        // Generate random positions for posters on South Wall
        const wallWidth = 18; // Usable width for posters (with margins)
        const wallHeight = 4; // Wall height
        const posterSpacing = wallWidth / memeAssets.length; // Evenly space posters

        for (let i = 0; i < memeAssets.length; i++) {
            const asset = memeAssets[i];

            // Extract filename from file path
            const filename = asset.file_path.split('/').pop();
            const posterUrl = `/assets/${sessionId}/images/${filename}`;

            // Generate random position on South Wall
            // X position: spread across wall with some randomness
            const baseX = (i * posterSpacing) - (wallWidth / 2) + (posterSpacing / 2);
            const randomOffsetX = (Math.random() - 0.5) * (posterSpacing * 0.5); // Random offset within spacing
            const x = baseX + randomOffsetX;

            // Y position: random height between 1.5 and 3.0
            const y = 1.5 + Math.random() * 1.5;

            // Z position: South Wall (fixed)
            const z = -9.74;

            // Load texture
            const posterTexture = await new Promise((resolve, reject) => {
                textureLoader.load(
                    posterUrl + '?t=' + Date.now(),
                    resolve,
                    undefined,
                    reject
                );
            });

            // Configure texture
            posterTexture.colorSpace = THREE.SRGBColorSpace;
            posterTexture.wrapS = THREE.ClampToEdgeWrapping;
            posterTexture.wrapT = THREE.ClampToEdgeWrapping;

            // Create poster geometry (3x3 units)
            const posterGeometry = new THREE.PlaneGeometry(3, 3);

            // Create poster material
            const posterMaterial = new THREE.MeshStandardMaterial({
                map: posterTexture,
                roughness: 0.8,
                metalness: 0.1,
                side: THREE.FrontSide
            });

            // Create mesh
            const posterMesh = new THREE.Mesh(posterGeometry, posterMaterial);
            posterMesh.position.set(x, y, z);
            posterMesh.rotation.y = 0; // Face forward

            scene.add(posterMesh);

            console.log(`[MEMES] Loaded poster ${i + 1}/${memeAssets.length} at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z})`);
        }

        console.log('[OK] All meme posters reloaded with random positions!');

    } catch (error) {
        console.error('[MEMES] Error loading meme posters:', error);
    }
}

// Create environmental objects (LLM → Image → Trellis pipeline)
async function createEnv(character, sessionId, objectType = 'object') {
    const typeLabel = objectType === 'tree' ? 'Trees' : 'Environmental Object';
    console.log(`[ENV] Generating ${typeLabel} for character: ${character}...`);

    try {
        // Step 1: Ask LLM for BOTH visual AND lore descriptions
        const llmPrompt = objectType === 'tree'
            ? `You are a game environment designer. Given this character: "${character}", generate TWO descriptions for a TREE that fits thematically in this character's world:

1. VISUAL DESCRIPTION (for image-to-3D generation): A detailed, technical description of the tree's appearance - specific about type, size, materials, and visual features. This will be used to generate a 3D model.

2. LORE-FRIENDLY DESCRIPTION (for player interaction): A narrative, atmospheric description (2-3 sentences) explaining what this tree is, why it exists in this character's world, and what makes it special or significant to the setting.

Be specific and creative.`
            : `You are a game environment designer. Given this character: "${character}", generate TWO descriptions for a recurring environmental object or prop that fits thematically in this character's world:

1. VISUAL DESCRIPTION (for image-to-3D generation): A detailed, technical description of the object's appearance - specific about materials, size, shape, and visual features. This will be used to generate a 3D model.

2. LORE-FRIENDLY DESCRIPTION (for player interaction): A narrative, atmospheric description (2-3 sentences) explaining what this object is, why it exists in this character's world, and what makes it special or significant to the setting.

Be specific and creative.`;

        const llmResponse = await fetch('http://localhost:8081/api/llm/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: llmPrompt })
        });
        const llmData = await llmResponse.json();

        if (!llmData.success) {
            throw new Error('LLM query failed: ' + llmData.error);
        }

        const objectDescription = llmData.answer;
        console.log(`[ENV] LLM generated ${typeLabel} description:`, objectDescription);

        // Parse the response to extract visual and lore descriptions
        // The LLM should return both descriptions in the answer
        // For now, we'll use the full answer as visual description and extract lore
        const loreDescription = objectDescription; // Full description includes lore context

        // Step 2: Generate image with white background
        const imagePrompt = `Ultra high quality 3D ${objectType === 'tree' ? 'tree' : 'object'}, ${objectDescription}, neutral white background, studio lighting setup, front view, highly detailed, perfect for 3D reconstruction, clean silhouette, 8K resolution, photorealistic, no shadows on ground, object centered in frame`;

        const imageResponse = await fetch('http://localhost:8081/api/generate-character', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pose: objectType, // Use 'tree' or 'object' as pose identifier
                character: imagePrompt,
                sessionId: sessionId
            })
        });
        const imageData = await imageResponse.json();

        if (!imageData.success) {
            throw new Error('Image generation failed: ' + imageData.error);
        }

        console.log(`[ENV] ${typeLabel} image generated:`, imageData.imageUrl);
        addImageToGallery(imageData.remoteUrl || imageData.imageUrl, `${typeLabel} - Base Image`);

        // Ensure we have remote URL for Trellis
        if (!imageData.remoteUrl) {
            throw new Error('No remote URL returned from image generation - Trellis requires remote URLs');
        }

        // Step 3: Generate 3D model with Trellis (single image) - use REMOTE URL only
        const modelResponse = await fetch('http://localhost:8081/api/generate-3d-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageUrls: [imageData.remoteUrl], // Always use remote URL for Trellis
                pose: objectType,
                modelType: userModelType, // Use same model type as character
                sessionId: sessionId
            })
        });
        const modelData = await modelResponse.json();

        if (!modelData.success) {
            throw new Error('3D model generation failed: ' + modelData.error);
        }

        console.log(`[ENV] ${typeLabel} 3D model generated:`, modelData.modelUrl);

        return {
            success: true,
            modelUrl: modelData.modelUrl,
            description: objectDescription,
            loreDescription: loreDescription, // Add lore description to return value
            objectType: objectType
        };

    } catch (error) {
        console.error(`[ENV] Error generating ${typeLabel}:`, error);
        return { success: false, error: error.message };
    }
}

// Create character-themed objects (same pipeline as createEnv but character-specific)
async function createCharacterThemedObject(character, sessionId, objectIndex) {
    console.log(`[CHARACTER-THEMED] Generating character-themed object ${objectIndex} for: ${character}...`);

    try {
        // Step 1: Ask LLM for BOTH visual AND lore descriptions
        const llmPrompt = `You are a game environment designer. Given this character: "${character}", generate TWO descriptions for a character-themed prop or object ${objectIndex + 1} that is directly related to this character's identity, profession, or background:

1. VISUAL DESCRIPTION (for image-to-3D generation): A detailed, technical description of the object's appearance - specific about materials, size, shape, and visual features. This object should be DIRECTLY associated with this character type (e.g., weapon, tool, equipment, personal item). This will be used to generate a 3D model.

2. LORE-FRIENDLY DESCRIPTION (for player interaction): A narrative, atmospheric description (2-3 sentences) explaining what this object is, how it relates to the character, and why a player would recognize it as belonging to this character type.

Make the object unique and thematically appropriate to the character.`;

        const llmResponse = await fetch('http://localhost:8081/api/llm/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: llmPrompt })
        });
        const llmData = await llmResponse.json();

        if (!llmData.success) {
            throw new Error('LLM query failed: ' + llmData.error);
        }

        const objectDescription = llmData.answer;
        const loreDescription = objectDescription; // Full description includes lore context
        console.log(`[CHARACTER-THEMED] LLM generated object ${objectIndex} description:`, objectDescription);

        // Step 2: Generate image with white background
        const imagePrompt = `Ultra high quality 3D object, ${objectDescription}, neutral white background, studio lighting setup, front view, highly detailed, perfect for 3D reconstruction, clean silhouette, 8K resolution, photorealistic, no shadows on ground, object centered in frame`;

        const imageResponse = await fetch('http://localhost:8081/api/generate-character', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pose: `character_themed_${objectIndex}`,
                character: imagePrompt,
                sessionId: sessionId
            })
        });
        const imageData = await imageResponse.json();

        if (!imageData.success) {
            throw new Error('Image generation failed: ' + imageData.error);
        }

        console.log(`[CHARACTER-THEMED] Object ${objectIndex} image generated:`, imageData.imageUrl);
        addImageToGallery(imageData.remoteUrl || imageData.imageUrl, `Character Object ${objectIndex + 1}`);

        // Ensure we have remote URL for Trellis
        if (!imageData.remoteUrl) {
            throw new Error('No remote URL returned from image generation - Trellis requires remote URLs');
        }

        // Step 3: Generate 3D model with Trellis - use REMOTE URL only
        const modelResponse = await fetch('http://localhost:8081/api/generate-3d-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageUrls: [imageData.remoteUrl],
                pose: `character_themed_${objectIndex}`,
                modelType: userModelType,
                sessionId: sessionId
            })
        });
        const modelData = await modelResponse.json();

        if (!modelData.success) {
            throw new Error('3D model generation failed: ' + modelData.error);
        }

        console.log(`[CHARACTER-THEMED] Object ${objectIndex} 3D model generated:`, modelData.modelUrl);

        return {
            success: true,
            modelUrl: modelData.modelUrl,
            description: objectDescription,
            loreDescription: loreDescription,
            objectType: 'character_themed',
            objectIndex: objectIndex
        };

    } catch (error) {
        console.error(`[CHARACTER-THEMED] Error generating object ${objectIndex}:`, error);
        return { success: false, error: error.message };
    }
}

// Place environmental objects randomly on ground with physics
async function placeEnvironmentalObjects(modelUrl, count, objectType, description, loreDescription = null) {
    const typeLabel = objectType === 'tree' ? 'Tree' : 'Object';
    console.log(`[ENV] Placing ${count} copies of ${typeLabel}...`);

    for (let i = 0; i < count; i++) {
        try {
            const gltf = await new Promise((resolve, reject) => {
                gltfLoader.load(
                    modelUrl + '?t=' + Date.now() + '&copy=' + i,
                    resolve,
                    undefined,
                    reject
                );
            });

            const mesh = gltf.scene;

            // Calculate bounding box for scaling
            const box = new THREE.Box3().setFromObject(mesh);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);

            // Scale based on object type
            let targetSize;
            if (objectType === 'tree') {
                targetSize = 4 + Math.random() * 2; // Trees: 4-6 units tall
            } else {
                targetSize = 1.5 + Math.random() * 1.5; // Objects: 1.5-3 units (variable)
            }

            const scale = targetSize / maxDim;
            mesh.scale.set(scale, scale, scale);

            // Recalculate size after scaling
            box.setFromObject(mesh);
            const scaledSize = box.getSize(new THREE.Vector3());

            // Random position on ground with improved dispersion
            // Use polar coordinates for circular distribution across larger ground
            let x, z, attempts = 0;
            const maxAttempts = 50;
            const MIN_DISTANCE = 3; // Minimum 3 units apart
            const SOUTH_WALL_EXCLUSION_Z = -8; // Keep area in front of south wall clear
            const placementRadius = 18; // Place within 18 unit radius

            // Try to find a valid position (not too close to other objects, not in front of wall)
            do {
                // Generate random polar coordinates for circular distribution
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.sqrt(Math.random()) * placementRadius; // sqrt for uniform distribution

                x = Math.cos(angle) * radius;
                z = Math.sin(angle) * radius;

                // Check if position is valid
                let validPosition = z > SOUTH_WALL_EXCLUSION_Z; // Not in front of south wall

                // Check minimum distance to previously placed objects in this batch
                if (validPosition && i > 0) {
                    for (let j = 0; j < i; j++) {
                        const otherObj = environmentalObjects[environmentalObjects.length - i + j];
                        if (otherObj && otherObj.mesh) {
                            const dx = x - otherObj.mesh.position.x;
                            const dz = z - otherObj.mesh.position.z;
                            const distance = Math.sqrt(dx * dx + dz * dz);
                            if (distance < MIN_DISTANCE) {
                                validPosition = false;
                                break;
                            }
                        }
                    }
                }

                if (validPosition) break;
                attempts++;
            } while (attempts < maxAttempts);

            const y = scaledSize.y / 2; // Place at ground level
            mesh.position.set(x, y, z);

            // Random rotation around Y axis for variety
            mesh.rotation.y = Math.random() * Math.PI * 2;

            // Enable shadows
            mesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;

                    if (child.material) {
                        if (child.material.map) {
                            child.material.map.colorSpace = THREE.SRGBColorSpace;
                        }
                        child.material.needsUpdate = true;
                    }
                }
            });

            scene.add(mesh);

            // Create physics body (STATIC - mass = 0)
            const halfExtents = new CANNON.Vec3(
                scaledSize.x / 2,
                scaledSize.y / 2,
                scaledSize.z / 2
            );
            const objectShape = new CANNON.Box(halfExtents);

            const objectBody = new CANNON.Body({
                mass: 0, // Static object (doesn't move)
                shape: objectShape,
                material: groundMaterial
            });

            // Position body at base of object
            objectBody.position.set(x, y, z);
            objectBody.quaternion.copy(mesh.quaternion);

            world.addBody(objectBody);

            // Store references with lore description for interaction
            environmentalObjects.push({
                mesh,
                body: objectBody,
                isEnvironmental: true,
                objectType: objectType,
                loreDescription: loreDescription || `A ${objectType} from this world.`,
                modelUrl: modelUrl // Store model URL for viewer
            });
            environmentalMeshes.push(mesh);
            environmentalBodies.push(objectBody);

            // Register for universal interaction system
            registerInteractableObject(mesh, loreDescription || `A ${objectType} from this world.`, modelUrl, objectType);

            console.log(`[ENV] Placed ${typeLabel} ${i + 1}/${count} at (${x.toFixed(1)}, ${z.toFixed(1)})`);

        } catch (error) {
            console.error(`[ENV] Error placing ${typeLabel} copy ${i + 1}:`, error);
        }
    }

    console.log(`[ENV] Finished placing ${count} ${typeLabel}s`);
}

// Function to load a different pose model (all models are pre-generated at startup)
async function loadPoseModel(pose) {
    if (pose === currentPose) {
        // Already using this pose, skip
        return;
    }

    // Switching to new pose

    try {
        // Check if pose model exists (should always exist after startup generation)
        const modelPath = currentSessionId
            ? `/assets/${currentSessionId}/models/character_${pose}.glb`
            : `/assets/models/character_${pose}.glb`;
        const checkResponse = await fetch(`http://localhost:8081${modelPath}`);

        if (!checkResponse.ok) {
            console.error(`[POSE] ${pose} model not found! It should have been generated at startup.`);
            throw new Error(`${pose} model not available`);
        }

        // Save current physics position and velocity before removing
        let savedPosition = null;
        let savedVelocity = null;
        let savedRotation = null;

        if (characterBody) {
            savedPosition = characterBody.position.clone();
            savedVelocity = characterBody.velocity.clone();
        }
        if (characterModel) {
            savedRotation = characterModel.rotation.y;
        }

        // Save references to old model and body (don't remove yet - prevents flicker)
        const oldModel = characterModel;
        const oldBody = characterBody;

        // Load the new model FIRST (use session-specific path if session is active)
        const modelUrl = currentSessionId
            ? `/assets/${currentSessionId}/models/character_${pose}.glb`
            : `/assets/models/character_${pose}.glb`;
        await loadCharacterModel(`${modelUrl}?t=${Date.now()}`);

        // Restore physics position and velocity after loading new model
        if (savedPosition && characterBody) {
            characterBody.position.copy(savedPosition);
            characterBody.velocity.copy(savedVelocity);
        }
        if (savedRotation !== null && characterModel) {
            characterModel.rotation.y = savedRotation;
        }

        // Now that new model is loaded and positioned, safely remove and dispose old model
        if (oldModel) {
            // Remove from scene
            scene.remove(oldModel);

            // Dispose of helpers
            if (oldModel.userData.axesHelper) {
                scene.remove(oldModel.userData.axesHelper);
                oldModel.userData.axesHelper.geometry?.dispose();
                oldModel.userData.axesHelper.material?.dispose();
            }
            if (oldModel.userData.arrowHelper) {
                scene.remove(oldModel.userData.arrowHelper);
                // ArrowHelper has multiple children
                oldModel.userData.arrowHelper.traverse((child) => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });
            }
            if (oldModel.userData.boxHelper) {
                scene.remove(oldModel.userData.boxHelper);
                oldModel.userData.boxHelper.geometry?.dispose();
                oldModel.userData.boxHelper.material?.dispose();
            }

            // Dispose of the model itself
            oldModel.traverse((child) => {
                if (child.isMesh) {
                    child.geometry?.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => mat.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                }
            });
        }

        // Remove old physics body
        if (oldBody) {
            world.removeBody(oldBody);
        }

        currentPose = pose;
        // Successfully switched to new pose

        // Update UI to show current pose
        const poseModeElement = document.getElementById('pose-mode');
        if (poseModeElement) {
            poseModeElement.textContent = pose.toUpperCase();
        }

    } catch (error) {
        console.error(`Error loading ${pose} pose:`, error);
        console.error(`[POSE] Error: ${error.message}`);
    }
}

// Function to mirror the character model
function mirrorCharacterModel(shouldMirror) {
    if (!characterModel) return;

    isWalkingMirrored = shouldMirror;

    if (shouldMirror) {
        // Flip model horizontally along X-axis
        characterModel.scale.x = -Math.abs(characterModel.scale.x);

        // Fix materials for proper lighting when mirrored
        characterModel.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material.side = THREE.DoubleSide;
                child.material.needsUpdate = true;
            }
        });

        console.log('[POSE] Mirrored walking pose');
    } else {
        // Restore normal orientation
        characterModel.scale.x = Math.abs(characterModel.scale.x);

        console.log('[POSE] Normal walking pose');
    }
}

// Load 3D character model
function loadCharacterModel(modelUrl) {
    return new Promise((resolve, reject) => {
        gltfLoader.load(
            modelUrl,
            (gltf) => {
                characterModel = gltf.scene;

                // Scale the model appropriately
                const box = new THREE.Box3().setFromObject(characterModel);
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = 2 / maxDim; // Scale to approximately 2 units tall
                characterModel.scale.set(scale, scale, scale);

                // Recalculate bounding box after scaling
                box.setFromObject(characterModel);
                const scaledSize = box.getSize(new THREE.Vector3());

                // Position character above ground so it can fall
                characterModel.position.set(0, 5, 0); // Start 5 units above ground

                // No rotation needed - character spawns in natural orientation
                // Forward direction (yellow arrow) points toward initial camera position

                // Enable shadows and fix material color spaces
                characterModel.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;

                        // Ensure materials are properly configured for lighting
                        if (child.material) {
                            // Ensure proper color space for any textures
                            if (child.material.map) {
                                child.material.map.colorSpace = THREE.SRGBColorSpace;
                            }
                            if (child.material.emissiveMap) {
                                child.material.emissiveMap.colorSpace = THREE.SRGBColorSpace;
                            }

                            // Ensure material updates with new settings
                            child.material.needsUpdate = true;
                        }
                    }
                });

                scene.add(characterModel);

                // Add axes helper to visualize orientation (FIXED IN WORLD SPACE)
                const axesHelper = new THREE.AxesHelper(2);
                axesHelper.position.copy(characterModel.position);
                axesHelper.visible = helpersVisible; // Set initial visibility based on current state
                scene.add(axesHelper); // Add to scene, not to model
                console.log('[DEBUG] Added AxesHelper to scene (fixed orientation)');

                // Add arrow helper to show forward direction (FIXED IN WORLD SPACE)
                const forwardDir = new THREE.Vector3(0, 0, -1); // Forward is negative Z
                const arrowOrigin = new THREE.Vector3(
                    characterModel.position.x,
                    characterModel.position.y + scaledSize.y / 2,
                    characterModel.position.z
                );
                const arrowLength = 1.5;
                const arrowColor = 0xffff00; // Bright yellow
                const arrowHelper = new THREE.ArrowHelper(forwardDir, arrowOrigin, arrowLength, arrowColor, 0.3, 0.2);
                arrowHelper.visible = helpersVisible; // Set initial visibility based on current state
                scene.add(arrowHelper); // Add to scene, not to model
                console.log('[DEBUG] Added ArrowHelper to scene (fixed orientation)');

                // Store references to helpers in userData for position updates
                characterModel.userData.axesHelper = axesHelper;
                characterModel.userData.arrowHelper = arrowHelper;
                characterModel.userData.modelHeight = scaledSize.y;
                characterModel.userData.halfHeight = scaledSize.y / 2; // Store half height for offset

                // Create physics body for character
                const halfExtents = new CANNON.Vec3(
                    scaledSize.x / 2,
                    scaledSize.y / 2,
                    scaledSize.z / 2
                );
                const characterShape = new CANNON.Box(halfExtents);

                // Create body without shape first
                characterBody = new CANNON.Body({
                    mass: 5, // 5kg mass
                    position: new CANNON.Vec3(0, 5, 0), // Start above ground
                    linearDamping: 0.0, // No damping for snappy movement controls
                    angularDamping: 0.9, // Prevent spinning
                    material: new CANNON.Material('character')
                });

                // Add shape with offset so the collision box center is at the bottom of the character
                // This means offsetting it up by half the character's height
                const shapeOffset = new CANNON.Vec3(0, scaledSize.y / 2, 0);
                characterBody.addShape(characterShape, shapeOffset);

                // No initial rotation needed - physics body matches visual model orientation

                world.addBody(characterBody);

                // Create contact material between character and ground
                const characterGroundContact = new CANNON.ContactMaterial(
                    characterBody.material,
                    groundMaterial,
                    {
                        friction: 0.4,
                        restitution: 0.0, // No bouncing
                        contactEquationStiffness: 1e8,
                        contactEquationRelaxation: 3
                    }
                );
                world.addContactMaterial(characterGroundContact);

                // Create a visual bounding box for the character
                const characterBoxGeometry = new THREE.BoxGeometry(
                    scaledSize.x,
                    scaledSize.y,
                    scaledSize.z
                );
                const characterBoxEdges = new THREE.EdgesGeometry(characterBoxGeometry);
                characterBoxHelper = new THREE.LineSegments(
                    characterBoxEdges,
                    new THREE.LineBasicMaterial({ color: 0xff00ff, linewidth: 2 }) // Magenta for character
                );
                characterBoxHelper.visible = false; // Initially hidden
                scene.add(characterBoxHelper);

                // Store reference to box helper in character userData
                characterModel.userData.boxHelper = characterBoxHelper;

                console.log('[OK] Character model loaded with physics!');
                resolve(characterModel);
            },
            (progress) => {
                const percent = (progress.loaded / progress.total) * 100;
                updateLoadingUI('📦 Loading 3D model...', `${Math.round(percent)}%`);
            },
            (error) => {
                console.error('❌ Error loading character model:', error);
                reject(error);
            }
        );
    });
}

// Create a fallback ground with a default material
function createFallbackGround() {
    const fallbackMeshMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.8,
        metalness: 0.2
    });
    const groundGeometry = new THREE.PlaneGeometry(20, 20, 100, 100);
    groundMesh = new THREE.Mesh(groundGeometry, fallbackMeshMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // Grid helper disabled in fallback ground as well
    // const gridHelper = new THREE.GridHelper(20, 20, 0x00d4ff, 0x444444);
    // gridHelper.position.y = 0.01;
    // scene.add(gridHelper);
}

// Helper function for parallel API calls
async function parallelFetch(requests) {
    return Promise.all(
        requests.map(async (req) => {
            try {
                const response = await fetch(req.url, req.options);
                const data = await response.json();
                return { ...data, _requestType: req.type, _requestMeta: req.meta };
            } catch (error) {
                console.error(`Error in ${req.type}:`, error);
                return { success: false, error: error.message, _requestType: req.type, _requestMeta: req.meta };
            }
        })
    );
}

// Main generation pipeline - PARALLELIZED VERSION
async function generateAllAssets(character = 'sci-fi robot warrior') {
    const startTime = Date.now();

    try {
        // ==================== PHASE 1: Ground + Idle Base (Parallel) ====================
        updateLoadingUI('🚀 Phase 1: Starting parallel generation...', 'Ground texture + Idle character base');
        console.log('🚀 PHASE 1: Generating ground and idle base in parallel...');
        console.log(`Character: ${character}`);

        const phase1Results = await parallelFetch([
            {
                type: 'ground',
                url: 'http://localhost:8081/api/generate-texture',
                options: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: currentSessionId })
                }
            },
            {
                type: 'idle-base',
                url: 'http://localhost:8081/api/generate-character',
                options: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pose: 'idle', character: character, sessionId: currentSessionId })
                }
            }
        ]);

        // Process Phase 1 results
        const groundData = phase1Results.find(r => r._requestType === 'ground');
        const idleBaseData = phase1Results.find(r => r._requestType === 'idle-base');

        if (!groundData.success) throw new Error(groundData.error || 'Failed to generate ground');
        if (!idleBaseData.success) throw new Error(idleBaseData.error || 'Failed to generate idle character');

        console.log(`✅ Phase 1 complete: Ground ${groundData.cached ? 'cached' : 'generated'}, Idle ${idleBaseData.cached ? 'cached' : 'generated'}`);

        // Add ground texture to gallery
        if (groundData.imageUrl) {
            addImageToGallery(groundData.imageUrl, 'Ground Texture');
        }

        // Add idle front image to gallery
        if (idleBaseData.imageUrl || idleBaseData.remoteUrl) {
            const url = idleBaseData.imageUrl || idleBaseData.remoteUrl;
            addImageToGallery(url, 'Character - Idle Front');
        }

        // Load and create ground while Phase 2 is running
        const groundTexturePromise = new Promise((resolve, reject) => {
            textureLoader.load(
                groundData.imageUrl + '?t=' + Date.now(),
                resolve,
                undefined,
                reject
            );
        });

        const idleImageUrl = idleBaseData.remoteUrl || idleBaseData.imageUrl;

        // ==================== RIDDLE PUZZLE: Start generation in background ====================
        updateLoadingUI('🧩 Starting riddle puzzle generation...', 'Claude is creating a puzzle');
        console.log('🧩 RIDDLE: Starting riddle puzzle generation...');

        // Generate riddle and get object descriptions (parallel with everything else)
        const riddleGenerationPromise = generateRiddlePuzzle(currentSessionId);

        // ==================== ENV OBJECTS: Start generation in background ====================
        updateLoadingUI('🌲 Starting environmental generation...', 'Creating thematic props, trees, and character objects');
        console.log('🌲 ENV: Starting environmental objects, trees, and character-themed objects generation...');

        const envPromises = [
            createEnv(character, currentSessionId, 'object'),
            createEnv(character, currentSessionId, 'tree'),
            // Generate 5 character-themed objects in parallel
            ...Array.from({ length: 5 }, (_, i) => createCharacterThemedObject(character, currentSessionId, i))
        ];

        // Don't await yet - let them run in background while we do Phase 2
        const envGenerationPromise = Promise.all(envPromises);

        // ==================== PHASE 2: Idle Views (5 Parallel) ====================
        updateLoadingUI('⚡ Phase 2: Generating all idle views...', 'Creating 5 views in parallel');
        console.log('⚡ PHASE 2: Generating 5 idle views in parallel...');

        const views = ['back', 'left', 'right', 'angle_30', 'angle_-30'];
        const phase2Requests = views.map(viewName => ({
            type: 'idle-view',
            meta: { viewName },
            url: 'http://localhost:8081/api/generate-view',
            options: {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pose: 'idle',
                    viewName: viewName,
                    imageUrl: idleImageUrl,
                    sessionId: currentSessionId
                })
            }
        }));

        const phase2Results = await parallelFetch(phase2Requests);

        // Collect idle view URLs in correct order for Trellis
        const idleViewUrls = [idleImageUrl]; // Start with front
        const viewOrder = ['back', 'left', 'right', 'angle_30', 'angle_-30'];

        for (const viewName of viewOrder) {
            const viewResult = phase2Results.find(r => r._requestMeta?.viewName === viewName);
            if (viewResult?.success) {
                const viewUrl = viewResult.remoteUrl || viewResult.imageUrl;
                idleViewUrls.push(viewUrl);
                console.log(`✅ Idle ${viewName} view ${viewResult.cached ? 'cached' : 'generated'}`);
                // Add to gallery
                const friendlyName = viewName.replace('_', ' ').replace('-', ' ');
                addImageToGallery(viewUrl, `Idle - ${friendlyName}`);
            } else {
                console.warn(`⚠️ Failed to generate idle ${viewName} view`);
            }
        }

        // Apply ground texture (from Phase 1)
        const groundTexture = await groundTexturePromise;
        createGround(groundTexture);

        // Create boundary walls
        createBoundaryWalls();

        // Create all meme posters on walls
        await createMemePosters(currentSessionId);

        // ==================== PHASE 3: Idle 3D + Pose Bases (2 Parallel) ====================
        updateLoadingUI('🎯 Phase 3: Building 3D models...', 'Idle 3D + Walking base pose');
        console.log('🎯 PHASE 3: Generating idle 3D model and walking pose base in parallel...');

        const phase3Results = await parallelFetch([
            {
                type: 'idle-3d',
                url: 'http://localhost:8081/api/generate-3d-model',
                options: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imageUrls: userModelType === 'trellis' ? idleViewUrls.slice(0, 6) : idleViewUrls.slice(0, 5),  // Trellis supports 6, Rodin supports 5
                        pose: 'idle',
                        modelType: userModelType,  // Pass selected model type
                        sessionId: currentSessionId  // Pass session ID for proper asset storage
                    })
                }
            },
            {
                type: 'walking-base',
                url: 'http://localhost:8081/api/generate-pose',
                options: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetPose: 'walking', sessionId: currentSessionId })
                }
            }
            // SHOOTING POSE GENERATION DISABLED
            // {
            //     type: 'shooting-base',
            //     url: 'http://localhost:8081/api/generate-pose',
            //     options: {
            //         method: 'POST',
            //         headers: { 'Content-Type': 'application/json' },
            //         body: JSON.stringify({ targetPose: 'shooting' })
            //     }
            // }
        ]);

        // Process Phase 3 results
        const idleModelData = phase3Results.find(r => r._requestType === 'idle-3d');
        const walkingBaseData = phase3Results.find(r => r._requestType === 'walking-base');
        // const shootingBaseData = phase3Results.find(r => r._requestType === 'shooting-base');

        if (!idleModelData.success) throw new Error(idleModelData.error || 'Failed to generate idle 3D model');
        console.log(`✅ Idle 3D model ${idleModelData.cached ? 'cached' : 'generated'}`);

        const walkingImageUrl = walkingBaseData?.success ? (walkingBaseData.remoteUrl || walkingBaseData.imageUrl) : null;
        // const shootingImageUrl = shootingBaseData?.success ? (shootingBaseData.remoteUrl || shootingBaseData.imageUrl) : null;
        const shootingImageUrl = null; // Shooting pose disabled

        if (walkingImageUrl) {
            console.log(`✅ Walking base ${walkingBaseData.cached ? 'cached' : 'generated'}`);
            // Add walking base to gallery
            addImageToGallery(walkingImageUrl, 'Character - Walking Front');
        }
        // if (shootingImageUrl) console.log(`✅ Shooting base ${shootingBaseData.cached ? 'cached' : 'generated'}`);

        // ==================== ENV OBJECTS: Wait for generation and place in scene ====================
        updateLoadingUI('🌲 Placing environmental objects...', 'Adding props and trees to scene');
        console.log('🌲 ENV: Waiting for environmental object generation to complete...');

        const envResults = await envGenerationPromise;
        const objectResult = envResults[0];
        const treeResult = envResults[1];
        const characterThemedResults = envResults.slice(2); // Remaining 5 are character-themed objects

        if (objectResult.success) {
            console.log('✅ Environmental object model ready:', objectResult.description);
            await placeEnvironmentalObjects(objectResult.modelUrl, 5, 'object', objectResult.description, objectResult.loreDescription);
        } else {
            console.warn('⚠️ Environmental object generation failed:', objectResult.error);
        }

        if (treeResult.success) {
            console.log('✅ Tree model ready:', treeResult.description);
            await placeEnvironmentalObjects(treeResult.modelUrl, 5, 'tree', treeResult.description, treeResult.loreDescription);
        } else {
            console.warn('⚠️ Tree generation failed:', treeResult.error);
        }

        // Place character-themed objects (each one is unique, so place 1 copy each)
        for (let i = 0; i < characterThemedResults.length; i++) {
            const charObj = characterThemedResults[i];
            if (charObj.success) {
                console.log(`✅ Character-themed object ${i + 1} ready:`, charObj.description);
                await placeEnvironmentalObjects(charObj.modelUrl, 1, 'character_themed', charObj.description, charObj.loreDescription);
            } else {
                console.warn(`⚠️ Character-themed object ${i + 1} generation failed:`, charObj.error);
            }
        }

        console.log('🎉 Environmental and character-themed objects complete!');

        // ==================== CREATE ALTAR & NEMOTRON ====================
        updateLoadingUI('🏛️ Creating altar and Nemotron...', 'Setting up interactive elements');
        console.log('🏛️ Creating altar and Nemotron model...');
        createAltar();
        await loadNemotronModel();
        console.log('✅ Altar and Nemotron ready!');

        // ==================== RIDDLE PUZZLE OBJECTS: Wait for riddle and generate 5 objects in parallel ====================
        updateLoadingUI('🧩 Generating puzzle objects...', 'Creating 5 3D puzzle items in parallel');
        console.log('🧩 RIDDLE: Waiting for riddle generation and creating puzzle objects...');

        const riddleData = await riddleGenerationPromise;
        if (riddleData.success) {
            console.log('✅ Riddle ready:', riddleData.riddle);

            // Generate all 5 puzzle objects in parallel for maximum speed
            const puzzleObjectPromises = riddleData.objectDescriptions.map(objDesc =>
                generatePuzzleObject(objDesc, objDesc.type, objDesc.index, currentSessionId)
            );

            const puzzleObjectResults = await Promise.all(puzzleObjectPromises);

            // Filter successful results
            const successfulPuzzleObjects = puzzleObjectResults.filter(result => result.success);

            if (successfulPuzzleObjects.length > 0) {
                console.log(`✅ Generated ${successfulPuzzleObjects.length}/5 puzzle objects`);

                // Place puzzle objects with smart collision detection
                await placePuzzleObjects(successfulPuzzleObjects, environmentalObjects);
                console.log('✅ Puzzle objects placed in scene!');
            } else {
                console.warn('⚠️ No puzzle objects were successfully generated');
            }
        } else {
            console.warn('⚠️ Riddle generation failed:', riddleData.error);
        }

        // ==================== PHASE 4: All Views + 3D Models (12 Parallel) ====================
        updateLoadingUI('💥 Phase 4: Final parallel generation...', 'All remaining views and 3D models');
        console.log('💥 PHASE 4: Generating all remaining views and 3D models in parallel...');

        const phase4Requests = [];

        // Add walking view requests if walking base succeeded
        if (walkingImageUrl) {
            views.forEach(viewName => {
                phase4Requests.push({
                    type: 'walking-view',
                    meta: { viewName },
                    url: 'http://localhost:8081/api/generate-view',
                    options: {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            pose: 'walking',
                            viewName: viewName,
                            imageUrl: walkingImageUrl,
                            sessionId: currentSessionId
                        })
                    }
                });
            });
        }

        // SHOOTING VIEWS GENERATION DISABLED
        // // Add shooting view requests if shooting base succeeded
        // if (shootingImageUrl) {
        //     views.forEach(viewName => {
        //         phase4Requests.push({
        //             type: 'shooting-view',
        //             meta: { viewName },
        //             url: 'http://localhost:8081/api/generate-view',
        //             options: {
        //                 method: 'POST',
        //                 headers: { 'Content-Type': 'application/json' },
        //                 body: JSON.stringify({
        //                     pose: 'shooting',
        //                     viewName: viewName,
        //                     imageUrl: shootingImageUrl
        //                 })
        //             }
        //         });
        //     });
        // }

        // Execute all Phase 4 view generations in parallel
        let walkingViewUrls = [];
        let shootingViewUrls = [];

        if (phase4Requests.length > 0) {
            const phase4Results = await parallelFetch(phase4Requests);

            // Collect walking view URLs
            if (walkingImageUrl) {
                walkingViewUrls = [walkingImageUrl]; // Start with front
                for (const viewName of viewOrder) {
                    const viewResult = phase4Results.find(r =>
                        r._requestType === 'walking-view' && r._requestMeta?.viewName === viewName
                    );
                    if (viewResult?.success) {
                        const viewUrl = viewResult.remoteUrl || viewResult.imageUrl;
                        walkingViewUrls.push(viewUrl);
                        console.log(`✅ Walking ${viewName} view ${viewResult.cached ? 'cached' : 'generated'}`);
                        // Add to gallery
                        const friendlyName = viewName.replace('_', ' ').replace('-', ' ');
                        addImageToGallery(viewUrl, `Walking - ${friendlyName}`);
                    }
                }
            }

            // SHOOTING VIEW COLLECTION DISABLED
            // // Collect shooting view URLs
            // if (shootingImageUrl) {
            //     shootingViewUrls = [shootingImageUrl]; // Start with front
            //     for (const viewName of viewOrder) {
            //         const viewResult = phase4Results.find(r =>
            //             r._requestType === 'shooting-view' && r._requestMeta?.viewName === viewName
            //         );
            //         if (viewResult?.success) {
            //             shootingViewUrls.push(viewResult.remoteUrl || viewResult.imageUrl);
            //             console.log(`✅ Shooting ${viewName} view ${viewResult.cached ? 'cached' : 'generated'}`);
            //         }
            //     }
            // }
        }

        // Generate 3D models for walking and shooting in parallel
        const phase4ModelRequests = [];

        if (walkingViewUrls.length >= 3) {
            phase4ModelRequests.push({
                type: 'walking-3d',
                url: 'http://localhost:8081/api/generate-3d-model',
                options: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imageUrls: userModelType === 'trellis' ? walkingViewUrls.slice(0, 6) : walkingViewUrls.slice(0, 5),  // Trellis supports 6, Rodin supports 5
                        pose: 'walking',
                        modelType: userModelType,  // Pass selected model type
                        sessionId: currentSessionId  // Pass session ID for proper asset storage
                    })
                }
            });
        }

        // SHOOTING 3D MODEL GENERATION DISABLED
        // if (shootingViewUrls.length >= 3) {
        //     phase4ModelRequests.push({
        //         type: 'shooting-3d',
        //         url: 'http://localhost:8081/api/generate-3d-model',
        //         options: {
        //             method: 'POST',
        //             headers: { 'Content-Type': 'application/json' },
        //             body: JSON.stringify({
        //                 imageUrls: shootingViewUrls.slice(0, 6),
        //                 pose: 'shooting'
        //             })
        //         }
        //     });
        // }

        if (phase4ModelRequests.length > 0) {
            updateLoadingUI('🎲 Finalizing 3D models...', 'Converting walking pose to 3D');
            const phase4ModelResults = await parallelFetch(phase4ModelRequests);

            phase4ModelResults.forEach(result => {
                if (result.success) {
                    const poseType = result._requestType.replace('-3d', '');
                    console.log(`✅ ${poseType} 3D model ${result.cached ? 'cached' : 'generated'}`);
                }
            });
        }

        // ==================== FINAL: Load Character ====================
        updateLoadingUI('📦 Loading 3D character...', 'Preparing scene');

        // Load the character model - ensure modelUrl exists
        if (idleModelData.modelUrl) {
            await loadCharacterModel(idleModelData.modelUrl + '?t=' + Date.now());
        } else {
            console.error('No model URL found in idle model data');
            throw new Error('Failed to get 3D model URL');
        }

        // Calculate and log total time
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`🎉 All assets loaded in ${totalTime}s! (Parallel pipeline)`);

        // All done! - Hide loading modal
        console.log('[UI] Hiding loading modal...');
        loadingElement.classList.add('hidden');
        loadingElement.style.display = 'none'; // Force hide with inline style as well

    } catch (error) {
        console.error('❌ Error in generation pipeline:', error);
        updateLoadingUI(
            '<span style="color: #ff4444;">Error generating assets!</span>',
            error.message
        );

        // Wait a moment to show the error, then create fallback
        setTimeout(() => {
            createFallbackGround();
            updateLoadingUI(
                '<span style="color: #ffaa00;">Using fallback scene</span>',
                'Generation failed, showing basic ground'
            );
            setTimeout(() => {
                loadingElement.classList.add('hidden');
            }, 2000);
        }, 2000);
    }
}

// Animation variables
let time = 0;
const timeStep = 1 / 60; // Physics runs at 60 FPS

// Movement constants
const MOVE_SPEED = 20;  // Increased for faster movement
const JUMP_FORCE = 8;
const ROTATE_SPEED = 0.05; // Speed of character rotation (from unicorngame)
const CAMERA_OFFSET = new THREE.Vector3(0, 3, 5); // Offset for third-person camera (back and up)
const CAMERA_LERP_FACTOR = 0.1; // Smooth camera follow speed

// Auto-swap pose tracking
let lastPoseSwapTime = 0;
const POSE_SWAP_INTERVAL = 500; // 0.5 seconds in milliseconds (reduced from 250ms for smoother transitions)
let isAutoSwapping = false;
let lastMovementState = false;

// Helper function to check if character is on ground
function isGrounded() {
    if (!characterBody) return false;
    // Character is grounded if the physics body (which is now at the bottom) is close to ground level
    return Math.abs(characterBody.position.y) < 0.2 && Math.abs(characterBody.velocity.y) < 0.5;
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    time += 0.01;

    // Update physics world
    world.step(timeStep);

    // Handle character movement and controls (only in gameplay mode)
    if (characterModel && characterBody && gameplayMode) {
        // Check if any movement keys are pressed
        const isMoving = keys.w || keys.s;  // Only W/S count as movement now
        const isRotating = keys.a || keys.d;  // A/D are for rotation

        // Handle automatic pose swapping
        const currentTime = Date.now();

        // Handle rotation with A/D keys (like unicorngame)
        if (keys.a) {
            // Rotate character left (counter-clockwise)
            characterModel.rotation.y += ROTATE_SPEED;
            if (characterBody) {
                characterBody.quaternion.setFromEuler(0, characterModel.rotation.y, 0);
            }
        }
        if (keys.d) {
            // Rotate character right (clockwise)
            characterModel.rotation.y -= ROTATE_SPEED;
            if (characterBody) {
                characterBody.quaternion.setFromEuler(0, characterModel.rotation.y, 0);
            }
        }

        // Calculate movement direction based on character facing
        const moveDirection = new THREE.Vector3();

        if (isMoving) {
            // Check if we need to start auto-swapping
            if (!isAutoSwapping && !lastMovementState) {
                isAutoSwapping = true;
                lastPoseSwapTime = currentTime;
                // Immediately switch to walking pose when starting movement
                if (currentPose === 'idle') {
                    loadPoseModel('walking');
                    mirrorCharacterModel(false); // Start with normal walking
                }
            }

            // Auto-swap poses every 0.5 seconds while moving (two-state cycle)
            if (isAutoSwapping && (currentTime - lastPoseSwapTime) >= POSE_SWAP_INTERVAL) {
                lastPoseSwapTime = currentTime;

                // Two-state cycle: walking (normal) ↔ walking (mirrored)
                if (currentPose === 'idle') {
                    // idle → walking (normal) - initial transition
                    loadPoseModel('walking');
                    mirrorCharacterModel(false);
                } else if (currentPose === 'walking') {
                    // Toggle between normal and mirrored walking
                    mirrorCharacterModel(!isWalkingMirrored);
                }
            }

            // Get character's forward direction based on its rotation
            const characterForward = new THREE.Vector3(
                Math.sin(characterModel.rotation.y),
                0,
                Math.cos(characterModel.rotation.y)
            );
            characterForward.normalize();

            // W/S move forward/backward relative to character facing
            if (keys.w) {
                // Move forward in the direction character is facing
                moveDirection.add(characterForward);
            }
            if (keys.s) {
                // Move backward (opposite of facing direction)
                moveDirection.sub(characterForward);
            }

            // Apply movement velocity to physics body
            characterBody.velocity.x = moveDirection.x * MOVE_SPEED;
            characterBody.velocity.z = moveDirection.z * MOVE_SPEED;

        } else {
            // No movement input - stop horizontal movement
            characterBody.velocity.x = 0;
            characterBody.velocity.z = 0;

            // Stop auto-swapping and return to idle when movement stops
            if (isAutoSwapping) {
                isAutoSwapping = false;
                // Return to idle pose when stopping and reset mirror
                if (currentPose !== 'idle') {
                    loadPoseModel('idle');
                }
                mirrorCharacterModel(false); // Reset mirror state
            }
        }

        // Update last movement state
        lastMovementState = isMoving;

        // Handle jumping
        if (keys.space && isGrounded()) {
            characterBody.velocity.y = JUMP_FORCE;
            console.log('[MOVEMENT] Jump!');
        }

        // Sync Three.js model position with physics body
        // The physics body is at the character's feet, but the visual model's origin is at its center
        // So we need to offset the visual model up by half its height
        characterModel.position.copy(characterBody.position);
        characterModel.position.y = characterBody.position.y + (characterModel.userData.halfHeight || 0);
        // Don't sync quaternion - we're handling rotation manually for Y axis

        // Camera follows character - update for rotation-based movement
        if ((isMoving || isRotating) && characterModel) {
            // Calculate camera position behind the character based on its rotation
            // Note: negative Z is forward in Three.js, so camera behind means negative Z offset
            const cameraOffset = new THREE.Vector3(0, 3, -8); // Behind and above

            // Rotate the offset based on character's current rotation
            const rotatedOffset = cameraOffset.clone();
            rotatedOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), characterModel.rotation.y);

            // Target camera position
            const targetCameraPos = new THREE.Vector3()
                .copy(characterModel.position)
                .add(rotatedOffset);

            // Smoothly interpolate camera position to follow character
            camera.position.lerp(targetCameraPos, CAMERA_LERP_FACTOR);

            // Make camera look at character (slightly above base)
            const lookAtTarget = new THREE.Vector3()
                .copy(characterModel.position)
                .add(new THREE.Vector3(0, 1, 0));

            controls.target.lerp(lookAtTarget, CAMERA_LERP_FACTOR);
        }
    }

    // In setup mode, keep model synced with physics position
    if (characterModel && characterBody && !gameplayMode) {
        characterModel.position.copy(characterBody.position);
        characterModel.position.y = characterBody.position.y + (characterModel.userData.halfHeight || 0);
    }

    // Update helper positions to follow character (but keep fixed orientation)
    if (characterModel && characterModel.userData.axesHelper) {
        // Axes helper follows character position
        characterModel.userData.axesHelper.position.copy(characterModel.position);

        // Arrow helper follows character position at correct height
        characterModel.userData.arrowHelper.position.copy(characterModel.position);
        characterModel.userData.arrowHelper.position.y += characterModel.userData.modelHeight / 2;
    }

    // Update physics bounding box position to follow character
    if (characterModel && characterModel.userData.boxHelper) {
        // The box helper should be centered on the character visual model
        // which is already offset up from the physics body position
        characterModel.userData.boxHelper.position.copy(characterModel.position);
        // Match the character's rotation for the bounding box
        characterModel.userData.boxHelper.rotation.copy(characterModel.rotation);
    }

    // Animate the colored lights
    blueLight.position.x = Math.sin(time) * 5;
    blueLight.position.z = Math.cos(time) * 5;

    purpleLight.position.x = Math.cos(time * 0.7) * 5;
    purpleLight.position.z = Math.sin(time * 0.7) * 5;

    // Check proximity to ALL interactable objects (universal system)
    if (characterModel && gameplayMode) {
        const INTERACTION_DISTANCE = 4; // 4 units for all objects
        let closestObject = null;
        let closestDistance = INTERACTION_DISTANCE;

        // Check Nemotron first (special case with its own modal)
        if (nemotronModel) {
            const distance = characterModel.position.distanceTo(nemotronModel.position);
            if (distance <= INTERACTION_DISTANCE) {
                closestObject = {
                    isNemotron: true,
                    mesh: nemotronModel,
                    distance: distance
                };
                closestDistance = distance;
            }
        }

        // Check all registered interactable objects
        for (const obj of interactableObjects) {
            if (obj.mesh) {
                const distance = characterModel.position.distanceTo(obj.mesh.position);
                if (distance < closestDistance) {
                    closestObject = obj;
                    closestDistance = distance;
                }
            }
        }

        // Update UI based on closest object
        if (closestObject) {
            nearestInteractableObject = closestObject;
            showInteractionPrompt(true);
        } else {
            nearestInteractableObject = null;
            showInteractionPrompt(false);
        }
    }

    // Update controls
    controls.update();

    // Update debug info
    updateDebugInfo();

    // Render scene
    renderer.render(scene, camera);
}

// Helper function to convert radians to degrees
function radToDeg(rad) {
    return (rad * 180 / Math.PI).toFixed(1);
}

// Helper function to determine current view
function getCurrentView(cameraDir, modelRotation) {
    // Get the angle between camera direction and model's forward direction
    // Model's forward is initially along negative Z axis
    const modelForward = new THREE.Vector3(0, 0, -1);
    modelForward.applyAxisAngle(new THREE.Vector3(0, 1, 0), modelRotation);

    // Project camera direction onto XZ plane
    const camDirXZ = new THREE.Vector3(cameraDir.x, 0, cameraDir.z).normalize();

    // Calculate angle
    const angle = Math.atan2(camDirXZ.x, camDirXZ.z) - Math.atan2(modelForward.x, modelForward.z);
    let normalizedAngle = ((angle * 180 / Math.PI) + 360) % 360;

    // Determine view based on angle
    if (normalizedAngle > 315 || normalizedAngle <= 45) return 'Front';
    if (normalizedAngle > 45 && normalizedAngle <= 135) return 'Left';
    if (normalizedAngle > 135 && normalizedAngle <= 225) return 'Back';
    if (normalizedAngle > 225 && normalizedAngle <= 315) return 'Right';
    return 'Unknown';
}

// Update debug info panel
function updateDebugInfo() {
    if (!debugInfoVisible) return;

    // Camera position
    const camPos = camera.position;
    document.getElementById('camera-pos').textContent =
        `(${camPos.x.toFixed(2)}, ${camPos.y.toFixed(2)}, ${camPos.z.toFixed(2)})`;

    // Camera direction
    const cameraDir = new THREE.Vector3();
    camera.getWorldDirection(cameraDir);
    document.getElementById('camera-dir').textContent =
        `(${cameraDir.x.toFixed(2)}, ${cameraDir.y.toFixed(2)}, ${cameraDir.z.toFixed(2)})`;

    // Model rotation (if model exists)
    if (characterModel) {
        const modelRot = characterModel.rotation;
        document.getElementById('model-rot').textContent =
            `(${radToDeg(modelRot.x)}°, ${radToDeg(modelRot.y)}°, ${radToDeg(modelRot.z)}°)`;

        // Current view
        const view = getCurrentView(cameraDir, modelRot.y);
        document.getElementById('current-view').textContent = view;
    } else {
        document.getElementById('model-rot').textContent = 'No model';
        document.getElementById('current-view').textContent = '-';
    }
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Game state management
let gameplayMode = false;  // false = setup mode, true = gameplay mode
let savedOrientation = 0;  // Stores the locked character orientation

// Movement input state
const keys = {
    w: false,
    a: false,
    s: false,
    d: false,
    space: false
};

// Track keyboard input for movement
window.addEventListener('keydown', (event) => {
    if (!event.key) return; // Guard against undefined key
    const key = event.key.toLowerCase();
    if (key === 'w') keys.w = true;
    if (key === 'a') keys.a = true;
    if (key === 's') keys.s = true;
    if (key === 'd') keys.d = true;
    if (key === ' ') keys.space = true;
});

window.addEventListener('keyup', (event) => {
    if (!event.key) return; // Guard against undefined key
    const key = event.key.toLowerCase();
    if (key === 'w') keys.w = false;
    if (key === 'a') keys.a = false;
    if (key === 's') keys.s = false;
    if (key === 'd') keys.d = false;
    if (key === ' ') keys.space = false;
});

// Keyboard controls for debug/rotation
let helpersVisible = false;  // Start with helpers hidden
let debugInfoVisible = false;  // Start with debug info hidden

window.addEventListener('keydown', (event) => {
    if (!event.key) return; // Guard against undefined key
    const key = event.key.toLowerCase();

    // SETUP MODE: R/T rotate character, S to save and start gameplay
    if (!gameplayMode) {
        // R - Rotate model left (counterclockwise) in setup mode
        if (key === 'r' && characterModel) {
            characterModel.rotation.y += Math.PI / 2;
            // Update physics body rotation
            if (characterBody) {
                characterBody.quaternion.copy(characterModel.quaternion);
            }
            console.log('[SETUP] Rotated model left');
        }

        // T - Rotate model right (clockwise) in setup mode
        if (key === 't' && characterModel) {
            characterModel.rotation.y -= Math.PI / 2;
            // Update physics body rotation
            if (characterBody) {
                characterBody.quaternion.copy(characterModel.quaternion);
            }
            console.log('[SETUP] Rotated model right');
        }

        // S - Save orientation and enter gameplay mode
        if (key === 's' && characterModel) {
            savedOrientation = characterModel.rotation.y;
            gameplayMode = true;
            console.log('[SETUP] Orientation saved! Gameplay mode activated');
            console.log('[SETUP] Saved orientation:', savedOrientation);

            // Set camera behind character for third-person view
            // Note: In Three.js, positive Z is towards the camera, so "behind" means positive Z
            const cameraOffset = new THREE.Vector3(0, 3, -8); // Behind and above (negative Z is forward)
            const rotatedOffset = cameraOffset.clone();
            rotatedOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), characterModel.rotation.y);

            // Position camera behind character
            camera.position.copy(characterModel.position).add(rotatedOffset);

            // Make camera look at character
            controls.target.copy(characterModel.position);
            controls.target.y += 1;
            controls.update();

            // Update UI to show gameplay mode
            document.getElementById('game-mode').textContent = 'GAMEPLAY';
            document.getElementById('game-mode').style.color = '#00ff00';

            // Hide setup message
            const setupMsg = document.getElementById('setup-message');
            if (setupMsg) {
                setupMsg.style.display = 'none';
            }
        }
    }

    // H - Toggle helpers (works in both modes)
    if (key === 'h') {
        helpersVisible = !helpersVisible;
        if (characterModel && characterModel.userData.axesHelper) {
            characterModel.userData.axesHelper.visible = helpersVisible;
            characterModel.userData.arrowHelper.visible = helpersVisible;
        }
        // Also toggle physics bounding boxes with H key
        if (characterModel && characterModel.userData.boxHelper) {
            characterModel.userData.boxHelper.visible = helpersVisible;
        }
        if (groundBoxHelper) {
            groundBoxHelper.visible = helpersVisible;
        }
        // Toggle wall helpers
        wallHelpers.forEach(helper => {
            helper.visible = helpersVisible;
        });
        document.getElementById('helpers-visible').textContent = helpersVisible ? 'Yes' : 'No';
        console.log(`[DEBUG] Helpers and physics boxes ${helpersVisible ? 'shown' : 'hidden'}`);
    }

    // I - Toggle ALL UI and helpers (works in both modes)
    if (key === 'i') {
        debugInfoVisible = !debugInfoVisible;

        // Toggle debug panel
        const debugPanel = document.getElementById('debug-info');
        debugPanel.style.display = debugInfoVisible ? 'block' : 'none';

        // Toggle info panel
        const infoPanel = document.getElementById('info');
        infoPanel.style.display = debugInfoVisible ? 'block' : 'none';

        // Toggle helpers (axes and arrow)
        if (characterModel && characterModel.userData.axesHelper) {
            characterModel.userData.axesHelper.visible = debugInfoVisible;
            characterModel.userData.arrowHelper.visible = debugInfoVisible;
        }

        // Toggle physics bounding boxes
        if (characterModel && characterModel.userData.boxHelper) {
            characterModel.userData.boxHelper.visible = debugInfoVisible;
        }
        if (groundBoxHelper) {
            groundBoxHelper.visible = debugInfoVisible;
        }
        // Toggle wall helpers
        wallHelpers.forEach(helper => {
            helper.visible = debugInfoVisible;
        });

        // Update helpers visible status
        helpersVisible = debugInfoVisible;
        document.getElementById('helpers-visible').textContent = helpersVisible ? 'Yes' : 'No';

        console.log(`[DEBUG] All UI, helpers, and physics boxes ${debugInfoVisible ? 'shown' : 'hidden'}`);
    }

    // Pose switching controls (number keys 1-2) - disabled during auto-swapping
    if (key === '1' && gameplayMode && !isAutoSwapping) {
        loadPoseModel('idle');
        mirrorCharacterModel(false); // Reset mirror when manually switching
    }
    if (key === '2' && gameplayMode && !isAutoSwapping) {
        loadPoseModel('walking');
        mirrorCharacterModel(false); // Reset mirror when manually switching
    }
    // SHOOTING POSE DISABLED
    // if (key === '3' && gameplayMode) {
    //     loadPoseModel('shooting');
    // }

    // B - Toggle bag inventory modal (only in gameplay mode)
    if (key === 'b' && gameplayMode) {
        const bagModal = document.getElementById('bag-modal');
        if (bagModal) {
            if (bagModal.classList.contains('hidden')) {
                showBagModal();
            } else {
                hideBagModal();
            }
        }
    }

    // F - Universal object interaction (when in proximity and in gameplay mode)
    if (key === 'f' && gameplayMode && nearestInteractableObject) {
        console.log('[INTERACTION] F key pressed - interacting with nearest object');

        // Check if it's Nemotron (special case with riddle/victory modal)
        if (nearestInteractableObject.isNemotron) {
            console.log('[INTERACTION] Interacting with Nemotron');

            // Check if player has all solution objects (victory condition)
            if (hasAllSolutionObjects()) {
                console.log('[VICTORY] Player has all solution objects! Showing congratulations modal');
                showCongratulationsModal();
            } else {
                console.log('[INTERACTION] Showing Nemotron dialogue (riddle)');
                showNemotronDialogue();
            }
        } else {
            // Show object viewer for all other interactable objects
            console.log(`[INTERACTION] Showing object viewer for ${nearestInteractableObject.objectType}`);
            showObjectViewer(nearestInteractableObject);
        }
    }
});

// Session management functions
async function loadSessions() {
    try {
        const response = await fetch('http://localhost:8081/api/sessions');
        const data = await response.json();
        if (data.success) {
            return data.sessions;
        }
    } catch (error) {
        console.error('Error loading sessions:', error);
    }
    return [];
}

async function createSession(character, modelType, playerMode) {
    try {
        const response = await fetch('http://localhost:8081/api/sessions/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ character, modelType, playerMode })
        });
        const data = await response.json();
        if (data.success) {
            return data.session;
        }
    } catch (error) {
        console.error('Error creating session:', error);
    }
    return null;
}

async function loadSession(sessionId) {
    try {
        const response = await fetch(`http://localhost:8081/api/sessions/${sessionId}`);
        const data = await response.json();
        if (data.success) {
            return data.session;
        }
    } catch (error) {
        console.error('Error loading session:', error);
    }
    return null;
}

async function deleteSession(sessionId) {
    try {
        const response = await fetch(`http://localhost:8081/api/sessions/${sessionId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        return data.success;
    } catch (error) {
        console.error('Error deleting session:', error);
    }
    return false;
}

// Check if session assets exist and load them directly
async function checkAndLoadSessionAssets(sessionId) {
    try {
        console.log(`[SESSION] Checking assets for session: ${sessionId}`);

        // Check if session assets exist
        const response = await fetch(`http://localhost:8081/api/sessions/${sessionId}/assets`);
        const data = await response.json();

        if (!data.success || !data.assets || data.assets.length === 0) {
            console.log('[SESSION] No assets found for session');
            return false;
        }

        console.log(`[SESSION] Found ${data.assets.length} assets in database`);
        console.log('[SESSION] Asset types:', [...new Set(data.assets.map(a => a.asset_type))]);

        // Check for minimum required assets to load the game
        const hasGround = data.assets.some(a => a.asset_type === 'ground');
        // Check if idle model exists in the file system (not database, since models aren't recorded yet)
        const modelPath = `/assets/${sessionId}/models/character_idle.glb`;
        const modelCheckResponse = await fetch(`http://localhost:8081${modelPath}`, { method: 'HEAD' });
        const hasIdleModel = modelCheckResponse.ok;

        console.log(`[SESSION] Has ground texture: ${hasGround}`);
        console.log(`[SESSION] Has idle model at ${modelPath}: ${hasIdleModel}`);

        if (!hasGround || !hasIdleModel) {
            console.log('[SESSION] Missing required assets - will regenerate');
            return false;
        }

        console.log(`[SESSION] Found ${data.assets.length} assets, loading directly...`);

        // Load ground texture directly
        const groundTexturePath = `/assets/${sessionId}/ground/ground-texture.png`;
        const groundTexture = await new Promise((resolve, reject) => {
            textureLoader.load(
                groundTexturePath + '?t=' + Date.now(),
                resolve,
                undefined,
                reject
            );
        });
        createGround(groundTexture);
        console.log('[SESSION] Loaded ground texture from disk');

        // Create boundary walls
        createBoundaryWalls();

        // Load the idle model directly
        await loadCharacterModel(modelPath + '?t=' + Date.now());
        console.log('[SESSION] Loaded character model from disk');

        // Load meme posters with random positions
        await loadAndPlaceMemes(sessionId);

        // Check for and load tree model
        const treeModel = data.assets.find(a =>
            a.asset_type === 'models' &&
            a.pose === 'tree' &&
            a.file_path.includes('character_tree.glb')
        );
        if (treeModel) {
            const treeModelUrl = `/assets/${sessionId}/models/character_tree.glb`;
            console.log('[SESSION] Found tree model, loading with random positions...');
            await placeEnvironmentalObjects(treeModelUrl, 5, 'tree', null);
        } else {
            console.log('[SESSION] No tree model found in session');
        }

        // Check for and load environmental object model
        const objectModel = data.assets.find(a =>
            a.asset_type === 'models' &&
            a.pose === 'object' &&
            a.file_path.includes('character_object.glb')
        );
        if (objectModel) {
            const objectModelUrl = `/assets/${sessionId}/models/character_object.glb`;
            console.log('[SESSION] Found environmental object model, loading with random positions...');
            await placeEnvironmentalObjects(objectModelUrl, 5, 'object', null);
        } else {
            console.log('[SESSION] No environmental object model found in session');
        }

        // Create altar and load Nemotron model
        createAltar();
        await loadNemotronModel();

        // Load riddle puzzle if it exists in session metadata
        console.log('[SESSION] Checking for riddle puzzle...');
        const session = await fetch(`http://localhost:8081/api/sessions/${sessionId}`).then(r => r.json());
        if (session.success && session.session && session.session.metadata) {
            try {
                const metadata = JSON.parse(session.session.metadata);
                if (metadata.riddle) {
                    riddleText = metadata.riddle.riddle;
                    console.log('[SESSION] Loaded riddle from session:', riddleText);

                    // Check for puzzle object GLB files
                    const puzzleObjectPaths = [];
                    for (let i = 0; i < 5; i++) {
                        const modelPath = `/assets/${sessionId}/models/character_puzzle_object_${i}.glb`;
                        const checkResponse = await fetch(`http://localhost:8081${modelPath}`, { method: 'HEAD' });
                        if (checkResponse.ok) {
                            puzzleObjectPaths.push(modelPath);
                        }
                    }

                    if (puzzleObjectPaths.length > 0) {
                        console.log(`[SESSION] Found ${puzzleObjectPaths.length} puzzle objects, loading...`);

                        // Load and place puzzle objects
                        for (let i = 0; i < puzzleObjectPaths.length; i++) {
                            try {
                                const gltf = await new Promise((resolve, reject) => {
                                    gltfLoader.load(
                                        puzzleObjectPaths[i] + '?t=' + Date.now(),
                                        resolve,
                                        undefined,
                                        reject
                                    );
                                });

                                const mesh = gltf.scene;

                                // Calculate bounding box for scaling
                                const box = new THREE.Box3().setFromObject(mesh);
                                const size = box.getSize(new THREE.Vector3());
                                const maxDim = Math.max(size.x, size.y, size.z);

                                // Scale to small size (0.5-1 unit)
                                const targetSize = 0.5 + Math.random() * 0.5;
                                const scale = targetSize / maxDim;
                                mesh.scale.set(scale, scale, scale);

                                // Recalculate size after scaling
                                box.setFromObject(mesh);
                                const scaledSize = box.getSize(new THREE.Vector3());

                                // Random placement (same algorithm as fresh generation)
                                const placementRadius = 15;
                                const MIN_DISTANCE = 3;
                                const SOUTH_WALL_EXCLUSION_Z = -8;

                                let x, z, attempts = 0;
                                const maxAttempts = 100;

                                do {
                                    const angle = Math.random() * Math.PI * 2;
                                    const radius = Math.sqrt(Math.random()) * placementRadius;
                                    x = Math.cos(angle) * radius;
                                    z = Math.sin(angle) * radius;

                                    let validPosition = z > SOUTH_WALL_EXCLUSION_Z;

                                    // Check distance from environmental objects
                                    if (validPosition && environmentalObjects.length > 0) {
                                        for (const obj of environmentalObjects) {
                                            if (obj && obj.mesh) {
                                                const dx = x - obj.mesh.position.x;
                                                const dz = z - obj.mesh.position.z;
                                                const distance = Math.sqrt(dx * dx + dz * dz);
                                                if (distance < MIN_DISTANCE) {
                                                    validPosition = false;
                                                    break;
                                                }
                                            }
                                        }
                                    }

                                    // Check distance from altar
                                    if (validPosition && altarMesh) {
                                        const dx = x - altarMesh.position.x;
                                        const dz = z - altarMesh.position.z;
                                        const distance = Math.sqrt(dx * dx + dz * dz);
                                        if (distance < MIN_DISTANCE) {
                                            validPosition = false;
                                        }
                                    }

                                    // Check distance from previously placed puzzle objects
                                    if (validPosition && i > 0) {
                                        for (let j = 0; j < i; j++) {
                                            const otherObj = puzzleObjects[j];
                                            if (otherObj && otherObj.mesh) {
                                                const dx = x - otherObj.mesh.position.x;
                                                const dz = z - otherObj.mesh.position.z;
                                                const distance = Math.sqrt(dx * dx + dz * dz);
                                                if (distance < MIN_DISTANCE) {
                                                    validPosition = false;
                                                    break;
                                                }
                                            }
                                        }
                                    }

                                    if (validPosition) break;
                                    attempts++;
                                } while (attempts < maxAttempts);

                                const y = scaledSize.y / 2;
                                mesh.position.set(x, y, z);
                                mesh.rotation.y = Math.random() * Math.PI * 2;

                                // Enable shadows
                                mesh.traverse((child) => {
                                    if (child.isMesh) {
                                        child.castShadow = true;
                                        child.receiveShadow = true;
                                        if (child.material) {
                                            if (child.material.map) {
                                                child.material.map.colorSpace = THREE.SRGBColorSpace;
                                            }
                                            child.material.needsUpdate = true;
                                        }
                                    }
                                });

                                scene.add(mesh);

                                // Create physics body
                                const halfExtents = new CANNON.Vec3(
                                    scaledSize.x / 2,
                                    scaledSize.y / 2,
                                    scaledSize.z / 2
                                );
                                const objectBody = new CANNON.Body({
                                    mass: 0,
                                    shape: new CANNON.Box(halfExtents),
                                    material: groundMaterial
                                });
                                objectBody.position.set(x, y, z);
                                objectBody.quaternion.copy(mesh.quaternion);
                                world.addBody(objectBody);

                                // Store with metadata
                                const objIndex = i;
                                const objType = objIndex < 2 ? 'solution' : 'distractor';
                                puzzleObjects.push({
                                    mesh: mesh,
                                    body: objectBody,
                                    isPuzzleObject: true,
                                    puzzleType: objType,
                                    objectIndex: objIndex,
                                    preparingForInteraction: true
                                });

                                console.log(`[SESSION] Placed puzzle object ${i + 1}/${puzzleObjectPaths.length}`);

                            } catch (error) {
                                console.error(`[SESSION] Error loading puzzle object ${i}:`, error);
                            }
                        }

                        console.log('✅ Puzzle objects reloaded from session');
                    } else {
                        console.log('[SESSION] No puzzle object models found');
                    }
                } else {
                    console.log('[SESSION] No riddle in session metadata');
                }
            } catch (e) {
                console.error('[SESSION] Error parsing session metadata:', e);
            }
        }

        // Hide loading modal immediately - no generation needed
        loadingElement.classList.add('hidden');
        loadingElement.style.display = 'none';

        console.log('✅ Session assets loaded successfully from disk');
        return true;

    } catch (error) {
        console.error('[SESSION] Error checking/loading assets:', error);
        return false;
    }
}

function displaySessionList(sessions) {
    const sessionList = document.getElementById('session-list');

    if (sessions.length === 0) {
        sessionList.innerHTML = '<p style="text-align: center; color: #888;">No existing sessions. Start a new adventure!</p>';
        return;
    }

    sessionList.innerHTML = sessions.map(session => {
        const date = new Date(session.last_accessed);
        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();

        return `
            <div class="session-item" data-session-id="${session.id}">
                <div class="session-item-header">
                    <div class="session-character">${session.character_description}</div>
                    <button class="delete-session-btn" data-session-id="${session.id}">Delete</button>
                </div>
                <div class="session-details">
                    <span>Model: ${session.model_type}</span>
                    <span>Players: ${session.player_mode}</span>
                </div>
                <div class="session-date">Last played: ${dateStr}</div>
                <div class="session-uuid">ID: ${session.id}</div>
            </div>
        `;
    }).join('');

    // Add click handlers for session items
    document.querySelectorAll('.session-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            // Don't trigger if clicking the delete button
            if (e.target.classList.contains('delete-session-btn')) return;

            const sessionId = item.dataset.sessionId;
            await startSessionGame(sessionId);
        });
    });

    // Add click handlers for delete buttons
    document.querySelectorAll('.delete-session-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const sessionId = btn.dataset.sessionId;
            if (confirm('Are you sure you want to delete this session?')) {
                if (await deleteSession(sessionId)) {
                    // Reload session list
                    const sessions = await loadSessions();
                    displaySessionList(sessions);
                }
            }
        });
    });
}

async function startSessionGame(sessionId) {
    // Load session details
    const session = await loadSession(sessionId);
    if (!session) {
        console.error('Failed to load session');
        return;
    }

    // Set current session
    currentSessionId = sessionId;
    currentSession = session;
    userCharacter = session.character_description;
    userModelType = session.model_type;
    userPlayerMode = session.player_mode;

    // Update UI with session ID
    document.getElementById('session-uuid').textContent = sessionId;

    // Hide session modal with explicit display none
    const sessionModal = document.getElementById('session-modal');
    sessionModal.classList.add('hidden');
    sessionModal.style.display = 'none';

    // Ensure character modal is also hidden
    characterModal.classList.add('hidden');
    characterModal.style.display = 'none';

    console.log('[SESSION] Starting session game:', sessionId);

    // CRITICAL: Check if assets already exist and load them directly
    const assetsLoaded = await checkAndLoadSessionAssets(sessionId);

    if (assetsLoaded) {
        console.log('✅ Session loaded from disk - no generation needed!');
        // Assets loaded successfully, game is ready to play
        // No loading modal was shown, no generation happened
        return;
    }

    // Only show loading modal and generate if assets don't exist
    console.log('📦 Session assets not found, generating new assets...');
    loadingElement.classList.remove('hidden');
    loadingElement.style.display = '';

    // Start generation with session ID
    generateAllAssets(userCharacter);
}

// Initialize the app with session selection
async function initializeApp() {
    // Load existing sessions
    const sessions = await loadSessions();
    displaySessionList(sessions);

    // Add handler for new session button
    const newSessionBtn = document.getElementById('new-session-btn');
    newSessionBtn.addEventListener('click', () => {
        // Hide session modal with explicit display none
        const sessionModal = document.getElementById('session-modal');
        sessionModal.classList.add('hidden');
        sessionModal.style.display = 'none';

        // Show character selection modal
        characterModal.classList.remove('hidden');
        characterModal.style.display = '';

        // Focus on the input field
        characterInput.focus();
    });

    // IMPORTANT: Keep session modal hidden initially - Terminal loading screen shows first!
    // Session modal will be shown by Initialize button click
    const sessionModal = document.getElementById('session-modal');
    sessionModal.classList.add('hidden');
    sessionModal.style.display = 'none';

    // Also hide character and loading modals
    characterModal.classList.add('hidden');
    characterModal.style.display = 'none';
    loadingElement.classList.add('hidden');
    loadingElement.style.display = 'none';
}

// Handle character submission
characterSubmit.addEventListener('click', async () => {
    const character = characterInput.value.trim();

    // Get selected model type from radio buttons
    const selectedModelType = document.querySelector('input[name="modelType"]:checked');
    if (selectedModelType) {
        userModelType = selectedModelType.value;
    }

    // Get selected player mode from radio buttons
    const selectedPlayerMode = document.querySelector('input[name="playerMode"]:checked');
    if (selectedPlayerMode) {
        userPlayerMode = parseInt(selectedPlayerMode.value);
    }

    if (character) {
        userCharacter = character;
        console.log('User selected character:', userCharacter);
        console.log('User selected model type:', userModelType);
        console.log('User selected player mode:', userPlayerMode, 'player(s)');

        // Create a new session
        const session = await createSession(userCharacter, userModelType, userPlayerMode);
        if (!session) {
            alert('Failed to create session. Please try again.');
            return;
        }

        // Set current session
        currentSessionId = session.sessionId;
        currentSession = session;

        // Update UI with session ID
        document.getElementById('session-uuid').textContent = currentSessionId;

        console.log('Created new session:', currentSessionId);

        // Hide modals with explicit display none
        characterModal.classList.add('hidden');
        characterModal.style.display = 'none';

        // Also ensure session modal is hidden
        const sessionModal = document.getElementById('session-modal');
        sessionModal.classList.add('hidden');
        sessionModal.style.display = 'none';

        // Show loading modal
        loadingElement.classList.remove('hidden');
        loadingElement.style.display = '';

        console.log('[UI] Character modal hidden, loading modal shown');

        // Start generation with the selected character and session
        generateAllAssets(userCharacter);
    } else {
        // Flash the input border to indicate it's required
        characterInput.style.borderColor = '#ff4444';
        setTimeout(() => {
            characterInput.style.borderColor = '';
        }, 500);
    }
});

// Allow Enter key to submit
characterInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        characterSubmit.click();
    }
});

// Start animation immediately
animate();

// Initialize the app (will show modal or start generation)
initializeApp();

console.log('🚀 Three.js scene initialized!');
