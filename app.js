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

// Ground plane and character model
let groundMesh;
let groundBody;
let groundMaterial; // Store ground material globally
let characterModel;
let characterBody;
let currentPose = 'idle'; // Track current pose

// Physics visualization helpers
let characterBoxHelper;
let groundBoxHelper;

// Function to update loading UI
function updateLoadingUI(message, submessage = '', showSpinner = true) {
    loadingElement.innerHTML = `
        ${showSpinner ? '<div class="spinner"></div>' : ''}
        <p>${message}</p>
        ${submessage ? `<p style="font-size: 14px; margin-top: 10px;">${submessage}</p>` : ''}
    `;
}

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

    // Add a subtle grid helper for reference
    const gridHelper = new THREE.GridHelper(20, 20, 0x00d4ff, 0x444444);
    gridHelper.position.y = 0.01; // Slightly above ground
    scene.add(gridHelper);

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

// Function to load a different pose model (all models are pre-generated at startup)
async function loadPoseModel(pose) {
    if (pose === currentPose) {
        console.log(`[POSE] Already using ${pose} pose`);
        return;
    }

    console.log(`[POSE] Switching to ${pose} pose...`);

    try {
        // Check if pose model exists (should always exist after startup generation)
        const checkResponse = await fetch(`http://localhost:8081/assets/models/character_${pose}.glb`);

        if (!checkResponse.ok) {
            console.error(`[POSE] ${pose} model not found! It should have been generated at startup.`);
            throw new Error(`${pose} model not available`);
        }

        // Remove old character model
        if (characterModel) {
            scene.remove(characterModel);
            if (characterModel.userData.axesHelper) {
                scene.remove(characterModel.userData.axesHelper);
            }
            if (characterModel.userData.arrowHelper) {
                scene.remove(characterModel.userData.arrowHelper);
            }
            if (characterModel.userData.boxHelper) {
                scene.remove(characterModel.userData.boxHelper);
            }
        }

        // Remove old physics body
        if (characterBody) {
            world.removeBody(characterBody);
        }

        // Load the new model
        await loadCharacterModel(`/assets/models/character_${pose}.glb?t=${Date.now()}`);

        currentPose = pose;
        console.log(`[POSE] Successfully switched to ${pose} pose`);

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

    // Add grid helper
    const gridHelper = new THREE.GridHelper(20, 20, 0x00d4ff, 0x444444);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);
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
async function generateAllAssets() {
    const startTime = Date.now();

    try {
        // ==================== PHASE 1: Ground + Idle Base (Parallel) ====================
        updateLoadingUI('🚀 Phase 1: Starting parallel generation...', 'Ground texture + Idle character base');
        console.log('🚀 PHASE 1: Generating ground and idle base in parallel...');

        const phase1Results = await parallelFetch([
            {
                type: 'ground',
                url: 'http://localhost:8081/api/generate-texture',
                options: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                }
            },
            {
                type: 'idle-base',
                url: 'http://localhost:8081/api/generate-character',
                options: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pose: 'idle' })
                }
            }
        ]);

        // Process Phase 1 results
        const groundData = phase1Results.find(r => r._requestType === 'ground');
        const idleBaseData = phase1Results.find(r => r._requestType === 'idle-base');

        if (!groundData.success) throw new Error(groundData.error || 'Failed to generate ground');
        if (!idleBaseData.success) throw new Error(idleBaseData.error || 'Failed to generate idle character');

        console.log(`✅ Phase 1 complete: Ground ${groundData.cached ? 'cached' : 'generated'}, Idle ${idleBaseData.cached ? 'cached' : 'generated'}`);

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
                    imageUrl: idleImageUrl
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
                idleViewUrls.push(viewResult.remoteUrl || viewResult.imageUrl);
                console.log(`✅ Idle ${viewName} view ${viewResult.cached ? 'cached' : 'generated'}`);
            } else {
                console.warn(`⚠️ Failed to generate idle ${viewName} view`);
            }
        }

        // Apply ground texture (from Phase 1)
        const groundTexture = await groundTexturePromise;
        createGround(groundTexture);

        // ==================== PHASE 3: Idle 3D + Pose Bases (3 Parallel) ====================
        updateLoadingUI('🎯 Phase 3: Building 3D models...', 'Idle 3D + Walking/Shooting base poses');
        console.log('🎯 PHASE 3: Generating idle 3D model and other pose bases in parallel...');

        const phase3Results = await parallelFetch([
            {
                type: 'idle-3d',
                url: 'http://localhost:8081/api/generate-3d-model',
                options: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imageUrls: idleViewUrls.slice(0, 6),
                        pose: 'idle'
                    })
                }
            },
            {
                type: 'walking-base',
                url: 'http://localhost:8081/api/generate-pose',
                options: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetPose: 'walking' })
                }
            },
            {
                type: 'shooting-base',
                url: 'http://localhost:8081/api/generate-pose',
                options: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetPose: 'shooting' })
                }
            }
        ]);

        // Process Phase 3 results
        const idleModelData = phase3Results.find(r => r._requestType === 'idle-3d');
        const walkingBaseData = phase3Results.find(r => r._requestType === 'walking-base');
        const shootingBaseData = phase3Results.find(r => r._requestType === 'shooting-base');

        if (!idleModelData.success) throw new Error(idleModelData.error || 'Failed to generate idle 3D model');
        console.log(`✅ Idle 3D model ${idleModelData.cached ? 'cached' : 'generated'}`);

        const walkingImageUrl = walkingBaseData?.success ? (walkingBaseData.remoteUrl || walkingBaseData.imageUrl) : null;
        const shootingImageUrl = shootingBaseData?.success ? (shootingBaseData.remoteUrl || shootingBaseData.imageUrl) : null;

        if (walkingImageUrl) console.log(`✅ Walking base ${walkingBaseData.cached ? 'cached' : 'generated'}`);
        if (shootingImageUrl) console.log(`✅ Shooting base ${shootingBaseData.cached ? 'cached' : 'generated'}`);

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
                            imageUrl: walkingImageUrl
                        })
                    }
                });
            });
        }

        // Add shooting view requests if shooting base succeeded
        if (shootingImageUrl) {
            views.forEach(viewName => {
                phase4Requests.push({
                    type: 'shooting-view',
                    meta: { viewName },
                    url: 'http://localhost:8081/api/generate-view',
                    options: {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            pose: 'shooting',
                            viewName: viewName,
                            imageUrl: shootingImageUrl
                        })
                    }
                });
            });
        }

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
                        walkingViewUrls.push(viewResult.remoteUrl || viewResult.imageUrl);
                        console.log(`✅ Walking ${viewName} view ${viewResult.cached ? 'cached' : 'generated'}`);
                    }
                }
            }

            // Collect shooting view URLs
            if (shootingImageUrl) {
                shootingViewUrls = [shootingImageUrl]; // Start with front
                for (const viewName of viewOrder) {
                    const viewResult = phase4Results.find(r =>
                        r._requestType === 'shooting-view' && r._requestMeta?.viewName === viewName
                    );
                    if (viewResult?.success) {
                        shootingViewUrls.push(viewResult.remoteUrl || viewResult.imageUrl);
                        console.log(`✅ Shooting ${viewName} view ${viewResult.cached ? 'cached' : 'generated'}`);
                    }
                }
            }
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
                        imageUrls: walkingViewUrls.slice(0, 6),
                        pose: 'walking'
                    })
                }
            });
        }

        if (shootingViewUrls.length >= 3) {
            phase4ModelRequests.push({
                type: 'shooting-3d',
                url: 'http://localhost:8081/api/generate-3d-model',
                options: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imageUrls: shootingViewUrls.slice(0, 6),
                        pose: 'shooting'
                    })
                }
            });
        }

        if (phase4ModelRequests.length > 0) {
            updateLoadingUI('🎲 Finalizing 3D models...', 'Converting walking and shooting poses');
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
        await loadCharacterModel(idleModelData.modelUrl + '?t=' + Date.now());

        // Calculate and log total time
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`🎉 All assets loaded in ${totalTime}s! (Parallel pipeline)`);

        // All done!
        loadingElement.classList.add('hidden');

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
const MOVE_SPEED = 5;
const JUMP_FORCE = 8;
const CAMERA_OFFSET = new THREE.Vector3(0, 3, 5); // Offset for third-person camera (back and up)
const CAMERA_LERP_FACTOR = 0.1; // Smooth camera follow speed

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
        // Calculate movement direction based on camera orientation and input
        const moveDirection = new THREE.Vector3();
        const isMoving = keys.w || keys.a || keys.s || keys.d;

        if (isMoving) {
            // Get character's forward direction (where yellow arrow points)
            const characterForward = new THREE.Vector3(0, 0, -1); // Forward in local space
            characterForward.applyAxisAngle(new THREE.Vector3(0, 1, 0), characterModel.rotation.y);
            characterForward.y = 0; // Project onto ground plane
            characterForward.normalize();

            // Get character's right direction
            const characterRight = new THREE.Vector3(1, 0, 0); // Right in local space
            characterRight.applyAxisAngle(new THREE.Vector3(0, 1, 0), characterModel.rotation.y);
            characterRight.y = 0; // Project onto ground plane
            characterRight.normalize();

            // Calculate movement direction based on WASD input (character-relative)
            if (keys.w) moveDirection.sub(characterForward);  // Forward (opposite of arrow for third-person)
            if (keys.s) moveDirection.add(characterForward);  // Backward
            if (keys.a) moveDirection.add(characterRight);    // Left
            if (keys.d) moveDirection.sub(characterRight);    // Right

            moveDirection.normalize();

            // Apply movement velocity to physics body
            characterBody.velocity.x = moveDirection.x * MOVE_SPEED;
            characterBody.velocity.z = moveDirection.z * MOVE_SPEED;

            // Character rotation is disabled - it maintains its initial facing direction
            // This keeps the camera in a stable "Back" view
        } else {
            // No movement input - stop horizontal movement
            characterBody.velocity.x = 0;
            characterBody.velocity.z = 0;
        }

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

        // Camera follows character using the saved camera offset from setup
        // This maintains the exact camera angle you had when you pressed S
        if (isMoving && window.cameraFollowOffset) {
            // Use the saved offset from when S was pressed
            const targetCameraPos = new THREE.Vector3()
                .copy(characterModel.position)
                .add(window.cameraFollowOffset);

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
    const key = event.key.toLowerCase();
    if (key === 'w') keys.w = true;
    if (key === 'a') keys.a = true;
    if (key === 's') keys.s = true;
    if (key === 'd') keys.d = true;
    if (key === ' ') keys.space = true;
});

window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    if (key === 'w') keys.w = false;
    if (key === 'a') keys.a = false;
    if (key === 's') keys.s = false;
    if (key === 'd') keys.d = false;
    if (key === ' ') keys.space = false;
});

// Keyboard controls for debug/rotation
let helpersVisible = true;
let debugInfoVisible = true;

window.addEventListener('keydown', (event) => {
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

            // Calculate current camera offset relative to character
            // This preserves the camera's current position when entering gameplay
            const currentCameraOffset = new THREE.Vector3()
                .copy(camera.position)
                .sub(characterModel.position);

            // Store this offset for camera follow (we'll use this instead of hardcoded offset)
            window.cameraFollowOffset = currentCameraOffset;
            console.log('[SETUP] Camera offset saved:', currentCameraOffset);

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

        // Update helpers visible status
        helpersVisible = debugInfoVisible;
        document.getElementById('helpers-visible').textContent = helpersVisible ? 'Yes' : 'No';

        console.log(`[DEBUG] All UI, helpers, and physics boxes ${debugInfoVisible ? 'shown' : 'hidden'}`);
    }

    // Pose switching controls (number keys 1-3)
    if (key === '1' && gameplayMode) {
        loadPoseModel('idle');
    }
    if (key === '2' && gameplayMode) {
        loadPoseModel('walking');
    }
    if (key === '3' && gameplayMode) {
        loadPoseModel('shooting');
    }
});

// Start animation immediately
animate();

// Start the generation pipeline
generateAllAssets();

console.log('🚀 Three.js scene initialized!');
