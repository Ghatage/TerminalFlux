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
const GROUND_SIZE = 20;
const WALL_HEIGHT = 4;
const WALL_THICKNESS = 0.5;

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Light blue sky background
scene.fog = new THREE.Fog(0x87CEEB, 10, 50); // Matching light blue fog

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
    0x87CEEB, // Sky color (light blue)
    0xffffff, // Ground color (white for brighter ground)
    1.5       // Increased intensity for super bright
);
scene.add(hemisphereLight);

// Brighter white ambient light (changed from gray)
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); // Increased for super bright
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
const fillLight = new THREE.DirectionalLight(0xffffff, 1.5); // Increased for super bright
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
const northLight = new THREE.DirectionalLight(0xffffff, 2.5);
northLight.position.set(0, 1, 10); // At ground level, far north
northLight.target.position.set(0, 0, 0); // Point at center
scene.add(northLight);
scene.add(northLight.target);

// South light (negative Z direction)
const southLight = new THREE.DirectionalLight(0xffffff, 2.5);
southLight.position.set(0, 1, -10); // At ground level, far south
southLight.target.position.set(0, 0, 0); // Point at center
scene.add(southLight);
scene.add(southLight.target);

// East light (positive X direction)
const eastLight = new THREE.DirectionalLight(0xffffff, 2.5);
eastLight.position.set(10, 1, 0); // At ground level, far east
eastLight.target.position.set(0, 0, 0); // Point at center
scene.add(eastLight);
scene.add(eastLight.target);

// West light (negative X direction)
const westLight = new THREE.DirectionalLight(0xffffff, 2.5);
westLight.position.set(-10, 1, 0); // At ground level, far west
westLight.target.position.set(0, 0, 0); // Point at center
scene.add(westLight);
scene.add(westLight.target);

// Ring of 8 point lights around the scene at character height for complete coverage
const ringRadius = 8;
const numRingLights = 8;
for (let i = 0; i < numRingLights; i++) {
    const angle = (i / numRingLights) * Math.PI * 2;
    const pointLight = new THREE.PointLight(0xffffff, 2.0, 15);
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
        }
    });

    // Close on background click
    imageViewerModal.addEventListener('click', (event) => {
        if (event.target === imageViewerModal) {
            imageViewerModal.classList.add('hidden');
        }
    });
});

// Create ground plane
function createGround(texture) {
    // Configure texture for tiling
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4); // Tile the texture 4x4 times
    texture.colorSpace = THREE.SRGBColorSpace;

    // Create ground geometry
    const groundGeometry = new THREE.PlaneGeometry(20, 20, 100, 100);

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
    // Wall configurations: [name, position, halfExtents]
    const walls = [
        {
            name: 'North Wall',
            position: { x: 0, y: WALL_HEIGHT / 2, z: GROUND_SIZE / 2 },
            halfExtents: new CANNON.Vec3(GROUND_SIZE / 2, WALL_HEIGHT / 2, WALL_THICKNESS / 2),
            dimensions: { width: GROUND_SIZE, height: WALL_HEIGHT, depth: WALL_THICKNESS }
        },
        {
            name: 'South Wall',
            position: { x: 0, y: WALL_HEIGHT / 2, z: -GROUND_SIZE / 2 },
            halfExtents: new CANNON.Vec3(GROUND_SIZE / 2, WALL_HEIGHT / 2, WALL_THICKNESS / 2),
            dimensions: { width: GROUND_SIZE, height: WALL_HEIGHT, depth: WALL_THICKNESS }
        },
        {
            name: 'East Wall',
            position: { x: GROUND_SIZE / 2, y: WALL_HEIGHT / 2, z: 0 },
            halfExtents: new CANNON.Vec3(WALL_THICKNESS / 2, WALL_HEIGHT / 2, GROUND_SIZE / 2),
            dimensions: { width: WALL_THICKNESS, height: WALL_HEIGHT, depth: GROUND_SIZE }
        },
        {
            name: 'West Wall',
            position: { x: -GROUND_SIZE / 2, y: WALL_HEIGHT / 2, z: 0 },
            halfExtents: new CANNON.Vec3(WALL_THICKNESS / 2, WALL_HEIGHT / 2, GROUND_SIZE / 2),
            dimensions: { width: WALL_THICKNESS, height: WALL_HEIGHT, depth: GROUND_SIZE }
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

    console.log('[OK] All boundary walls created with physics!');
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

    // Show session modal initially
    document.getElementById('session-modal').classList.remove('hidden');
    characterModal.classList.add('hidden');
    loadingElement.classList.add('hidden');
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
