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
scene.background = new THREE.Color(0x0a0a0a);
scene.fog = new THREE.Fog(0x0a0a0a, 10, 50);

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
renderer.toneMappingExposure = 1.1; // Brightness control (0.5 to 2.0 range)

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
    0x444444, // Ground color (dark gray)
    0.8       // Intensity
);
scene.add(hemisphereLight);

// Brighter white ambient light (changed from gray)
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // White ambient for better colors
scene.add(ambientLight);

// Main directional light (stronger intensity for better visibility)
const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0); // Increased from 1.2
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
const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
fillLight.position.set(-3, 5, 2);
scene.add(fillLight);

// Add some colored accent lights for sci-fi effect (animated)
const blueLight = new THREE.PointLight(0x00d4ff, 1.5, 20);
blueLight.position.set(-5, 3, -5);
scene.add(blueLight);

const purpleLight = new THREE.PointLight(0xb400ff, 1.5, 20);
purpleLight.position.set(5, 3, 5);
scene.add(purpleLight);

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

// Main generation pipeline
async function generateAllAssets() {
    try {
        // Step 1: Generate ground texture
        updateLoadingUI('🎨 Generating ground texture...', 'Calling FAL AI API');
        console.log('🎨 Step 1: Generating ground texture...');

        const groundResponse = await fetch('http://localhost:8081/api/generate-texture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: "seamless tileable sci-fi abstract ground texture, futuristic floor pattern, metallic hexagonal tiles with glowing blue circuits, high detail, top-down view, perfect for game terrain, technical sci-fi aesthetic, 4k resolution"
            })
        });

        const groundData = await groundResponse.json();
        if (!groundData.success) throw new Error(groundData.error || 'Failed to generate ground');

        console.log(`✅ Ground texture ${groundData.cached ? 'loaded from cache' : 'generated'}`);

        // Load ground texture
        updateLoadingUI('📥 Loading ground texture...', 'Applying to scene');
        const groundTexture = await new Promise((resolve, reject) => {
            textureLoader.load(
                groundData.imageUrl + '?t=' + Date.now(), // Cache bust
                resolve,
                undefined,
                reject
            );
        });

        createGround(groundTexture);

        // Step 2: Generate character base image
        updateLoadingUI('👤 Generating character...', 'Creating base image (1/6)');
        console.log('👤 Step 2: Generating character...');

        const characterResponse = await fetch('http://localhost:8081/api/generate-character', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const characterData = await characterResponse.json();
        if (!characterData.success) throw new Error(characterData.error || 'Failed to generate character');

        console.log(`✅ Character ${characterData.cached ? 'loaded from cache' : 'generated'}`);
        const characterImageUrl = characterData.remoteUrl || characterData.imageUrl;

        // Step 3: Generate angle variations
        const views = ['back', 'left', 'right', 'angle_30', 'angle_-30'];
        const viewUrls = [characterImageUrl]; // Start with front view

        for (let i = 0; i < views.length; i++) {
            const viewName = views[i];
            updateLoadingUI('👤 Generating character views...', `Creating ${viewName} view (${i + 2}/6)`);
            console.log(`🔄 Step 3.${i + 1}: Generating ${viewName} view...`);

            // For the Trellis API, we need to use the remote URLs from FAL
            // So we need to get the remoteUrl from the repose endpoint
            const reposeResponse = await fetch('http://localhost:8081/api/repose-character', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageUrl: characterImageUrl,
                    viewName: viewName
                })
            });

            const reposeData = await reposeResponse.json();
            if (!reposeData.success) {
                console.warn(`⚠️ Failed to generate ${viewName} view, skipping...`);
                continue;
            }

            console.log(`✅ ${viewName} view ${reposeData.cached ? 'loaded from cache' : 'generated'}`);
            viewUrls.push(reposeData.remoteUrl || reposeData.imageUrl);
        }

        // Step 4: Generate 3D model using Trellis
        updateLoadingUI('🎲 Generating 3D model...', 'Converting images to 3D (this may take a while)');
        console.log('🎲 Step 4: Generating 3D model from views...');
        console.log('Image URLs for Trellis:', viewUrls);

        const modelResponse = await fetch('http://localhost:8081/api/generate-3d-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageUrls: viewUrls.slice(0, 6) // Trellis accepts up to 6 images
            })
        });

        const modelData = await modelResponse.json();
        if (!modelData.success) throw new Error(modelData.error || 'Failed to generate 3D model');

        console.log(`✅ 3D model ${modelData.cached ? 'loaded from cache' : 'generated'}`);

        // Step 5: Load the 3D model
        updateLoadingUI('📦 Loading 3D character...', 'Preparing scene');
        await loadCharacterModel(modelData.modelUrl + '?t=' + Date.now());

        // All done!
        loadingElement.classList.add('hidden');
        console.log('🎉 All assets loaded successfully!');

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
});

// Start animation immediately
animate();

// Start the generation pipeline
generateAllAssets();

console.log('🚀 Three.js scene initialized!');
