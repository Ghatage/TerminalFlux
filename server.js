import express from 'express';
import { fal } from '@fal-ai/client';
import { config } from 'dotenv';
import cors from 'cors';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config();

// Configure FAL AI client
fal.config({
  credentials: process.env.FAL_KEY
});

// Parse CLI arguments
const args = process.argv.slice(2);
const REUSE_ASSETS = args.includes('--reuse');

const app = express();
const PORT = 8081;

// Asset paths
const ASSETS_DIR = join(__dirname, 'assets');
const CHARACTER_DIR = join(ASSETS_DIR, 'character');
const MODELS_DIR = join(ASSETS_DIR, 'models');
const GROUND_DIR = join(ASSETS_DIR, 'ground');

// Pose configurations
const POSES = ['idle', 'walking', 'shooting'];
const DEFAULT_POSE = 'idle';

// Ensure directories exist
[ASSETS_DIR, CHARACTER_DIR, MODELS_DIR, GROUND_DIR].forEach(dir => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
});

// Create pose subdirectories
POSES.forEach(pose => {
  const poseDir = join(CHARACTER_DIR, pose);
  if (!existsSync(poseDir)) {
    mkdirSync(poseDir, { recursive: true });
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for base64 images
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('.')); // Serve static files from current directory
app.use('/assets', express.static(ASSETS_DIR)); // Serve assets

// Utility function to download file
async function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        writeFileSync(filepath, Buffer.concat(chunks));
        resolve(filepath);
      });
      response.on('error', reject);
    });
  });
}

// Check if all required assets exist
function checkAssetsExist(pose = DEFAULT_POSE) {
  const requiredFiles = {
    ground: join(GROUND_DIR, 'ground-texture.png'),
    [`${pose}Front`]: join(CHARACTER_DIR, pose, 'front.png'),
    [`${pose}Back`]: join(CHARACTER_DIR, pose, 'back.png'),
    [`${pose}Left`]: join(CHARACTER_DIR, pose, 'left.png'),
    [`${pose}Right`]: join(CHARACTER_DIR, pose, 'right.png'),
    [`${pose}Angle30`]: join(CHARACTER_DIR, pose, 'angle_30.png'),
    [`${pose}AngleN30`]: join(CHARACTER_DIR, pose, 'angle_-30.png'),
    [`${pose}Model`]: join(MODELS_DIR, `character_${pose}.glb`)
  };

  const existing = {};
  let allExist = true;

  for (const [key, path] of Object.entries(requiredFiles)) {
    existing[key] = existsSync(path);
    if (!existing[key]) allExist = false;
  }

  return { allExist, existing, paths: requiredFiles };
}

// API endpoint to check assets
app.get('/api/check-assets', (req, res) => {
  const assetStatus = checkAssetsExist();
  res.json({
    reuseEnabled: REUSE_ASSETS,
    ...assetStatus
  });
});

// API endpoint to generate ground texture
app.post('/api/generate-texture', async (req, res) => {
  const { prompt } = req.body;

  console.log('[TEXTURE] Received texture generation request...');

  // Check if reuse is enabled and texture exists
  const groundPath = join(GROUND_DIR, 'ground-texture.png');
  if (REUSE_ASSETS && existsSync(groundPath)) {
    console.log('[REUSE] Reusing existing ground texture');
    res.json({
      success: true,
      imageUrl: `/assets/ground/ground-texture.png`,
      requestId: 'cached',
      cached: true
    });
    return;
  }

  try {
    const result = await fal.subscribe("fal-ai/alpha-image-232/text-to-image", {
      input: {
        prompt: prompt || "Ultra high quality seamless tileable sci-fi ground texture, photorealistic metallic floor with intricate circuit patterns, highly detailed surface with depth and normal mapping details, PBR ready texture, crisp clean edges for 3D model conversion, top-down orthographic view, 8K resolution, ultra sharp details, perfect for high-end game environments"
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          update.logs.map((log) => log.message).forEach(console.log);
        }
      },
    });

    console.log('[OK] Ground generation complete!');
    console.log('Request ID:', result.requestId);

    if (result.data && result.data.images && result.data.images.length > 0) {
      const imageUrl = result.data.images[0].url;

      // Download and save locally
      await downloadFile(imageUrl, groundPath);
      console.log('[SAVED] Ground texture saved locally');

      res.json({
        success: true,
        imageUrl: `/assets/ground/ground-texture.png`,
        requestId: result.requestId,
        cached: false
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'No images returned from API'
      });
    }

  } catch (error) {
    console.error('❌ Error generating texture:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API endpoint to generate character
app.post('/api/generate-character', async (req, res) => {
  console.log('[CHARACTER] Received character generation request...');
  const { pose = DEFAULT_POSE, character = 'sci-fi robot warrior' } = req.body;

  console.log(`[CHARACTER] Generating: ${character}`);

  const frontPath = join(CHARACTER_DIR, pose, 'front.png');
  if (REUSE_ASSETS && existsSync(frontPath)) {
    console.log('[REUSE] Reusing existing character');

    // Return the local URL instead of base64 for cached assets
    // This prevents payload size issues
    const localUrl = `/assets/character/${pose}/front.png`;

    res.json({
      success: true,
      imageUrl: localUrl,
      remoteUrl: `http://localhost:8081${localUrl}`, // Use full URL for remoteUrl
      requestId: 'cached',
      cached: true
    });
    return;
  }

  try {
    // Replace <character> placeholder with the actual character description
    const prompt = `Ultra high quality 3D character design, photorealistic ${character}, FULL BODY VIEW showing complete figure from head to toe including legs and feet, extremely detailed, perfect for 3D reconstruction, front view facing camera directly, character standing naturally, entire body visible in frame, neutral white background, studio lighting setup, ultra sharp focus, 8K resolution, highly detailed textures and materials, clean silhouette for 3D model generation, symmetrical design, no occlusions or overlapping parts, complete full-body character model`;

    const result = await fal.subscribe("fal-ai/alpha-image-232/text-to-image", {
      input: {
        prompt: prompt
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          update.logs.map((log) => log.message).forEach(console.log);
        }
      },
    });

    console.log('[OK] Character generation complete!');
    console.log('Request ID:', result.requestId);

    if (result.data && result.data.images && result.data.images.length > 0) {
      const imageUrl = result.data.images[0].url;

      await downloadFile(imageUrl, frontPath);
      console.log('[SAVED] Character saved locally');

      res.json({
        success: true,
        imageUrl: `/assets/character/${pose}/front.png`,
        remoteUrl: imageUrl,
        requestId: result.requestId,
        cached: false
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'No images returned from API'
      });
    }

  } catch (error) {
    console.error('❌ Error generating character:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API endpoint to repose character (generate angle variations)
app.post('/api/repose-character', async (req, res) => {
  const { imageUrl, angle, viewName, pose = DEFAULT_POSE } = req.body;

  console.log(`[REPOSE] Reposing character to: ${viewName}`);

  const outputPath = join(CHARACTER_DIR, pose, `${viewName}.png`);
  if (REUSE_ASSETS && existsSync(outputPath)) {
    console.log(`[REUSE] Reusing existing ${viewName} view`);
    res.json({
      success: true,
      imageUrl: `/assets/character/${pose}/${viewName}.png`,
      requestId: 'cached',
      cached: true,
      viewName
    });
    return;
  }

  // Define prompts for different views - ultra high quality for 3D reconstruction
  const viewPrompts = {
    'back': 'Ultra high quality back view of exact same character, rear view showing all details, perfect for 3D reconstruction, clean white background, ultra sharp 8K resolution, maintain exact proportions and design, no occlusions',
    'left': 'Ultra high quality left side profile view of exact same character, perfect 90 degree profile from left, optimal for 3D model generation, clean white background, ultra sharp 8K resolution, maintain exact proportions',
    'right': 'Ultra high quality right side profile view of exact same character, perfect 90 degree profile from right, optimal for 3D model generation, clean white background, ultra sharp 8K resolution, maintain exact proportions',
    'angle_30': 'Ultra high quality three-quarter view, character rotated exactly 30 degrees to the right, perfect for 3D reconstruction, clean white background, ultra sharp 8K resolution, maintain all details and proportions',
    'angle_-30': 'Ultra high quality three-quarter view, character rotated exactly 30 degrees to the left, perfect for 3D reconstruction, clean white background, ultra sharp 8K resolution, maintain all details and proportions'
  };

  try {
    const result = await fal.subscribe("fal-ai/alpha-image-232/edit-image", {
      input: {
        prompt: viewPrompts[viewName] || `${viewName} view of the character`,
        image_urls: [imageUrl]
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          update.logs.map((log) => log.message).forEach(console.log);
        }
      },
    });

    console.log(`[OK] ${viewName} view generation complete!`);

    if (result.data && result.data.images && result.data.images.length > 0) {
      const newImageUrl = result.data.images[0].url;

      await downloadFile(newImageUrl, outputPath);
      console.log(`[SAVED] ${viewName} view saved locally`);

      res.json({
        success: true,
        imageUrl: `/assets/character/${pose}/${viewName}.png`,
        remoteUrl: newImageUrl,
        requestId: result.requestId,
        cached: false,
        viewName
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'No images returned from API'
      });
    }

  } catch (error) {
    console.error(`❌ Error reposing character (${viewName}):`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      viewName
    });
  }
});

// API endpoint to generate pose base image only (no views)
app.post('/api/generate-pose', async (req, res) => {
  const { targetPose } = req.body;

  console.log(`[POSE] Generating ${targetPose} pose base from idle...`);

  // Check if target pose assets already exist
  const targetPath = join(CHARACTER_DIR, targetPose, 'front.png');
  if (REUSE_ASSETS && existsSync(targetPath)) {
    console.log(`[REUSE] Reusing existing ${targetPose} pose`);

    // Return the local URL instead of base64 for cached assets
    const localUrl = `/assets/character/${targetPose}/front.png`;

    res.json({
      success: true,
      pose: targetPose,
      imageUrl: localUrl,
      remoteUrl: `http://localhost:8081${localUrl}`,  // Use full URL for remoteUrl
      cached: true
    });
    return;
  }

  // Get idle pose images as source
  const idleFrontPath = join(CHARACTER_DIR, 'idle', 'front.png');
  if (!existsSync(idleFrontPath)) {
    res.status(400).json({
      success: false,
      error: 'Idle pose not found. Generate idle pose first.'
    });
    return;
  }

  // Define pose prompts - ultra high quality for 3D model generation
  const posePrompts = {
    'walking': 'Ultra high quality exact same character in dynamic walking pose, FULL BODY VIEW showing complete figure from head to toe including legs and feet, mid-stride action with one leg forward, natural arm swing, entire body visible in frame, perfect for 3D animation model, clean white background, ultra sharp 8K resolution, maintain all mechanical details and proportions, optimal for 3D reconstruction, complete full-body character model',
    'shooting': 'Ultra high quality exact same character in shooting action pose, FULL BODY VIEW showing complete figure from head to toe including legs and feet, arms extended forward holding futuristic weapon, dynamic combat stance, entire body visible in frame, perfect for 3D game model, clean white background, ultra sharp 8K resolution, maintain all mechanical details, optimal for 3D reconstruction, complete full-body character model'
  };

  const prompt = posePrompts[targetPose];
  if (!prompt) {
    res.status(400).json({
      success: false,
      error: `Unknown pose: ${targetPose}`
    });
    return;
  }

  try {
    // Read idle front image and upload it to FAL storage for use
    const idleImageBuffer = readFileSync(idleFrontPath);
    const idleImageBase64 = `data:image/png;base64,${idleImageBuffer.toString('base64')}`;

    console.log(`[POSE] Transforming idle to ${targetPose}...`);

    // Generate the new pose using image-to-image
    const result = await fal.subscribe("fal-ai/alpha-image-232/edit-image", {
      input: {
        prompt: prompt,
        image_urls: [idleImageBase64],
        enable_prompt_expansion: false
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          update.logs.map((log) => log.message).forEach(console.log);
        }
      },
    });

    console.log(`[OK] ${targetPose} pose base generation complete!`);

    if (result.data && result.data.images && result.data.images.length > 0) {
      const imageUrl = result.data.images[0].url;

      // Save the front view of the new pose
      const frontPath = join(CHARACTER_DIR, targetPose, 'front.png');
      await downloadFile(imageUrl, frontPath);
      console.log(`[SAVED] ${targetPose} base pose saved`);

      // Return only the base pose image (no views generated here)
      res.json({
        success: true,
        pose: targetPose,
        imageUrl: `/assets/character/${targetPose}/front.png`,
        remoteUrl: imageUrl,  // Return the FAL remote URL
        cached: false
      });

    } else {
      res.status(500).json({
        success: false,
        error: 'No images returned from API'
      });
    }

  } catch (error) {
    console.error(`Error generating ${targetPose} pose:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API endpoint to generate a single view for a pose
app.post('/api/generate-view', async (req, res) => {
  const { pose, viewName, imageUrl } = req.body;

  console.log(`[VIEW] Generating ${viewName} view for ${pose} pose...`);

  // Check if view already exists
  const viewPath = join(CHARACTER_DIR, pose, `${viewName}.png`);
  if (REUSE_ASSETS && existsSync(viewPath)) {
    console.log(`[REUSE] Reusing existing ${viewName} view for ${pose}`);

    // Return the local URL instead of base64 for cached assets
    const localUrl = `/assets/character/${pose}/${viewName}.png`;

    res.json({
      success: true,
      pose: pose,
      viewName: viewName,
      imageUrl: localUrl,
      remoteUrl: `http://localhost:8081${localUrl}`,  // Use full URL for remoteUrl
      cached: true
    });
    return;
  }

  // Define prompts for different views - ultra high quality for 3D reconstruction
  const viewPrompts = {
    'idle': {
      'back': 'Ultra high quality back view of exact same character, FULL BODY VIEW from head to toe, rear view showing all details including legs and feet, perfect for 3D reconstruction, clean white background, ultra sharp 8K resolution, maintain exact proportions and design, no occlusions, complete full-body visible',
      'left': 'Ultra high quality left side profile view of exact same character, FULL BODY VIEW from head to toe, perfect 90 degree profile from left including legs and feet, optimal for 3D model generation, clean white background, ultra sharp 8K resolution, maintain exact proportions, complete full-body visible',
      'right': 'Ultra high quality right side profile view of exact same character, FULL BODY VIEW from head to toe, perfect 90 degree profile from right including legs and feet, optimal for 3D model generation, clean white background, ultra sharp 8K resolution, maintain exact proportions, complete full-body visible',
      'angle_30': 'Ultra high quality three-quarter view, FULL BODY VIEW from head to toe, character rotated exactly 30 degrees to the right including legs and feet, perfect for 3D reconstruction, clean white background, ultra sharp 8K resolution, maintain all details and proportions, complete full-body visible',
      'angle_-30': 'Ultra high quality three-quarter view, FULL BODY VIEW from head to toe, character rotated exactly 30 degrees to the left including legs and feet, perfect for 3D reconstruction, clean white background, ultra sharp 8K resolution, maintain all details and proportions, complete full-body visible'
    },
    'walking': {
      'back': 'Ultra high quality back view of character in dynamic walking pose, FULL BODY VIEW from head to toe including legs and feet, perfect rear view for 3D reconstruction, clean white background, ultra sharp 8K resolution, maintain exact pose and proportions, complete full-body visible',
      'left': 'Ultra high quality left side profile of character in dynamic walking pose, FULL BODY VIEW from head to toe including legs and feet, perfect 90 degree left view for 3D model generation, clean white background, ultra sharp 8K resolution, complete full-body visible',
      'right': 'Ultra high quality right side profile of character in dynamic walking pose, FULL BODY VIEW from head to toe including legs and feet, perfect 90 degree right view for 3D model generation, clean white background, ultra sharp 8K resolution, complete full-body visible',
      'angle_30': 'Ultra high quality three-quarter view of character in dynamic walking pose, FULL BODY VIEW from head to toe including legs and feet, rotated exactly 30 degrees right, perfect for 3D reconstruction, clean white background, ultra sharp 8K resolution, complete full-body visible',
      'angle_-30': 'Ultra high quality three-quarter view of character in dynamic walking pose, FULL BODY VIEW from head to toe including legs and feet, rotated exactly 30 degrees left, perfect for 3D reconstruction, clean white background, ultra sharp 8K resolution, complete full-body visible'
    },
    'shooting': {
      'back': 'Ultra high quality back view of character in shooting action pose, perfect rear view for 3D reconstruction, clean white background, ultra sharp 8K resolution, maintain exact pose and proportions',
      'left': 'Ultra high quality left side profile of character in shooting action pose, perfect 90 degree left view for 3D model generation, clean white background, ultra sharp 8K resolution',
      'right': 'Ultra high quality right side profile of character in shooting action pose, perfect 90 degree right view for 3D model generation, clean white background, ultra sharp 8K resolution',
      'angle_30': 'Ultra high quality three-quarter view of character in shooting action pose, rotated exactly 30 degrees right, perfect for 3D reconstruction, clean white background, ultra sharp 8K resolution',
      'angle_-30': 'Ultra high quality three-quarter view of character in shooting action pose, rotated exactly 30 degrees left, perfect for 3D reconstruction, clean white background, ultra sharp 8K resolution'
    }
  };

  const prompt = viewPrompts[pose]?.[viewName];
  if (!prompt) {
    res.status(400).json({
      success: false,
      error: `Unknown view: ${viewName} for pose: ${pose}`
    });
    return;
  }

  try {
    console.log(`[VIEW] Generating ${viewName} from provided image...`);

    // Generate the view using image-to-image
    const result = await fal.subscribe("fal-ai/alpha-image-232/edit-image", {
      input: {
        prompt: prompt,
        image_urls: [imageUrl],
        enable_prompt_expansion: false
      },
      logs: false  // Reduce log noise for parallel operations
    });

    if (result.data && result.data.images && result.data.images.length > 0) {
      const newImageUrl = result.data.images[0].url;

      // Save the view locally
      await downloadFile(newImageUrl, viewPath);
      console.log(`[SAVED] ${pose} ${viewName} view saved`);

      res.json({
        success: true,
        pose: pose,
        viewName: viewName,
        imageUrl: `/assets/character/${pose}/${viewName}.png`,
        remoteUrl: newImageUrl,
        cached: false
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'No images returned from API'
      });
    }

  } catch (error) {
    console.error(`Error generating ${viewName} view for ${pose}:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      pose: pose,
      viewName: viewName
    });
  }
});

// API endpoint to generate 3D model using either Trellis or Hyper3D/Rodin
app.post('/api/generate-3d-model', async (req, res) => {
  const { imageUrls, pose = DEFAULT_POSE, modelType = 'trellis' } = req.body;

  console.log(`[3D MODEL] Generating 3D model for ${pose} pose using ${modelType.toUpperCase()}...`);

  // Validate image count based on model type
  const maxImages = modelType === 'trellis' ? 6 : 5; // Trellis supports 6, Rodin supports 5
  if (imageUrls && imageUrls.length > maxImages) {
    console.warn(`[3D MODEL] Received ${imageUrls.length} images, limiting to ${maxImages} (${modelType} constraint)`);
    imageUrls.splice(maxImages);
  }

  const modelPath = join(MODELS_DIR, `character_${pose}.glb`);
  if (REUSE_ASSETS && existsSync(modelPath)) {
    console.log('[REUSE] Reusing existing 3D model');
    res.json({
      success: true,
      modelUrl: `/assets/models/character_${pose}.glb`,
      requestId: 'cached',
      cached: true
    });
    return;
  }

  try {
    let result;

    if (modelType === 'trellis') {
      // Use Trellis API
      console.log('[3D MODEL] Using Trellis API...');
      result = await fal.subscribe("fal-ai/trellis/multi", {
        input: {
          image_urls: imageUrls,
          ss_guidance_strength: 7.5,
          ss_sampling_steps: 12,
          slat_guidance_strength: 3,
          slat_sampling_steps: 12,
          mesh_simplify: 0.95,
          texture_size: "1024",
          multiimage_algo: "stochastic"
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === "IN_PROGRESS") {
            update.logs.map((log) => log.message).forEach(console.log);
          }
        },
      });
    } else {
      // Use Rodin API
      console.log('[3D MODEL] Using Rodin API...');
      result = await fal.subscribe("fal-ai/hyper3d/rodin/v2", {
        input: {
          input_image_urls: imageUrls,  // Rodin uses input_image_urls
          geometry_file_format: "glb",  // Specify GLB format for Three.js compatibility
          material: "All",              // Include both PBR and shaded materials
          quality_mesh_option: "500K Triangle", // Highest quality for best results
          prompt: ""  // Let AI auto-generate prompt from images
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === "IN_PROGRESS") {
            update.logs.map((log) => log.message).forEach(console.log);
          }
        },
      });
    }

    console.log(`[OK] 3D model generation complete using ${modelType}!`);
    console.log('Request ID:', result.requestId);

    if (result.data && result.data.model_mesh && result.data.model_mesh.url) {
      const meshUrl = result.data.model_mesh.url;

      await downloadFile(meshUrl, modelPath);
      console.log('[SAVED] 3D model saved locally');

      res.json({
        success: true,
        modelUrl: `/assets/models/character_${pose}.glb`,
        requestId: result.requestId,
        cached: false,
        modelType: modelType
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'No model returned from API'
      });
    }

  } catch (error) {
    console.error(`❌ Error generating 3D model with ${modelType}:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      modelType: modelType
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    falKeyConfigured: !!process.env.FAL_KEY,
    reuseEnabled: REUSE_ASSETS
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`[SERVER] Server running at http://localhost:${PORT}`);
  console.log(`[API] API endpoints available`);
  console.log(`[OK] FAL API Key: ${process.env.FAL_KEY ? 'Configured' : 'NOT FOUND'}`);
  console.log(`[REUSE] Asset Reuse: ${REUSE_ASSETS ? 'ENABLED' : 'DISABLED'}`);

  if (REUSE_ASSETS) {
    const assetStatus = checkAssetsExist();
    console.log(`[ASSETS] Existing assets: ${assetStatus.allExist ? 'All present' : 'Some missing'}`);
  }
});
