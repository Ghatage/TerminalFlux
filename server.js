import express from 'express';
import { fal } from '@fal-ai/client';
import Anthropic from '@anthropic-ai/sdk';
import { config } from 'dotenv';
import cors from 'cors';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import sessionService from './services/sessionService.js';
import { getAssetPath, getAssetUrl, checkAssetExists } from './utils/assetPaths.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config();

// Configure FAL AI client
fal.config({
  credentials: process.env.FAL_KEY
});

// Configure Anthropic AI client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
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
  const { prompt, sessionId } = req.body;

  console.log('[TEXTURE] Received texture generation request...');
  if (sessionId) console.log('[TEXTURE] For session:', sessionId);

  // Determine paths based on session or legacy
  const groundPath = sessionId
    ? getAssetPath(sessionId, 'ground', null, 'ground-texture.png')
    : join(GROUND_DIR, 'ground-texture.png');

  const groundUrl = sessionId
    ? getAssetUrl(sessionId, 'ground', null, 'ground-texture.png')
    : `/assets/ground/ground-texture.png`;

  // Check if texture exists (session-specific or legacy)
  if (existsSync(groundPath)) {
    console.log('[REUSE] Reusing existing ground texture');
    res.json({
      success: true,
      imageUrl: groundUrl,
      requestId: 'cached',
      cached: true
    });
    return;
  }

  // Don't use legacy assets for sessions - they lack remote URLs needed for Trellis
  // Legacy assets have been removed to ensure proper remote URL handling

  try {
    const result = await fal.subscribe("fal-ai/alpha-image-232/text-to-image", {
      input: {
        prompt: prompt || "Ultra high quality seamless tileable ground texture, photorealistic floor for games, highly detailed surface with depth and normal mapping details, PBR ready texture, crisp clean edges for 3D model conversion, top-down orthographic view, 8K resolution, ultra sharp details, perfect for high-end game environments"
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

      // Ensure directory exists
      const groundDir = dirname(groundPath);
      if (!existsSync(groundDir)) {
        mkdirSync(groundDir, { recursive: true });
      }

      // Download and save locally
      await downloadFile(imageUrl, groundPath);
      console.log('[SAVED] Ground texture saved locally');

      // Record asset in database if session-based
      if (sessionId) {
        await sessionService.recordAsset(sessionId, 'ground', groundPath, {
          remoteUrl: imageUrl,
          requestId: result.requestId
        });
      }

      res.json({
        success: true,
        imageUrl: groundUrl,
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
  const { pose = DEFAULT_POSE, character = 'sci-fi robot warrior', sessionId } = req.body;

  console.log(`[CHARACTER] Generating: ${character}`);
  if (sessionId) console.log('[CHARACTER] For session:', sessionId);

  // Determine paths based on session or legacy
  const frontPath = sessionId
    ? getAssetPath(sessionId, 'character', pose, 'front.png')
    : join(CHARACTER_DIR, pose, 'front.png');

  const frontUrl = sessionId
    ? getAssetUrl(sessionId, 'character', pose, 'front.png')
    : `/assets/character/${pose}/front.png`;

  // Check if character exists (session-specific or legacy)
  if (existsSync(frontPath)) {
    console.log('[REUSE] Reusing existing character');

    // If session-based, try to get the stored remote URL
    let remoteUrl = `http://localhost:8081${frontUrl}`; // Default fallback
    if (sessionId) {
      const assetData = await sessionService.getAssetWithRemoteUrl(sessionId, 'character', pose, 'front');
      if (assetData && assetData.remote_url) {
        remoteUrl = assetData.remote_url;
        console.log('[REUSE] Using stored remote URL for character');
      }
    }

    res.json({
      success: true,
      imageUrl: frontUrl,
      remoteUrl: remoteUrl,
      requestId: 'cached',
      cached: true
    });
    return;
  }

  // Don't use legacy assets for sessions - they lack remote URLs needed for Trellis
  // Legacy assets can only be used when NOT using sessions (backward compatibility)

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

      // Ensure directory exists
      const charDir = dirname(frontPath);
      if (!existsSync(charDir)) {
        mkdirSync(charDir, { recursive: true });
      }

      await downloadFile(imageUrl, frontPath);
      console.log('[SAVED] Character saved locally');

      // Record asset in database if session-based
      if (sessionId) {
        await sessionService.recordAsset(sessionId, 'character', frontPath, {
          pose: pose,
          viewName: 'front',
          remoteUrl: imageUrl,
          requestId: result.requestId
        });
      }

      res.json({
        success: true,
        imageUrl: frontUrl,
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
  const { targetPose, sessionId } = req.body;

  console.log(`[POSE] Generating ${targetPose} pose base from idle...`);
  if (sessionId) console.log('[POSE] For session:', sessionId);

  // Determine paths based on session or legacy
  const targetPath = sessionId
    ? getAssetPath(sessionId, 'character', targetPose, 'front.png')
    : join(CHARACTER_DIR, targetPose, 'front.png');

  const targetUrl = sessionId
    ? getAssetUrl(sessionId, 'character', targetPose, 'front.png')
    : `/assets/character/${targetPose}/front.png`;

  // Check if target pose assets already exist (session-specific or legacy)
  if (existsSync(targetPath)) {
    console.log(`[REUSE] Reusing existing ${targetPose} pose`);

    // If session-based, try to get the stored remote URL
    let remoteUrl = `http://localhost:8081${targetUrl}`; // Default fallback
    if (sessionId) {
      const assetData = await sessionService.getAssetWithRemoteUrl(sessionId, 'character', targetPose, 'front');
      if (assetData && assetData.remote_url) {
        remoteUrl = assetData.remote_url;
        console.log('[REUSE] Using stored remote URL for pose');
      }
    }

    res.json({
      success: true,
      pose: targetPose,
      imageUrl: targetUrl,
      remoteUrl: remoteUrl,
      cached: true
    });
    return;
  }

  // Don't use legacy assets for sessions - they lack remote URLs needed for Trellis
  // Legacy assets can only be used when NOT using sessions (backward compatibility)

  // Get idle pose images as source - need to consider session paths
  const idleFrontPath = sessionId
    ? getAssetPath(sessionId, 'character', 'idle', 'front.png')
    : join(CHARACTER_DIR, 'idle', 'front.png');

  if (!existsSync(idleFrontPath)) {
    // Try legacy path as fallback
    const legacyIdlePath = join(CHARACTER_DIR, 'idle', 'front.png');
    if (!existsSync(legacyIdlePath)) {
      res.status(400).json({
        success: false,
        error: 'Idle pose not found. Generate idle pose first.'
      });
      return;
    }
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

      // Ensure directory exists
      const poseDir = dirname(targetPath);
      if (!existsSync(poseDir)) {
        mkdirSync(poseDir, { recursive: true });
      }

      // Save the front view of the new pose
      await downloadFile(imageUrl, targetPath);
      console.log(`[SAVED] ${targetPose} base pose saved`);

      // Record asset in database if session-based
      if (sessionId) {
        await sessionService.recordAsset(sessionId, 'character', targetPath, {
          pose: targetPose,
          viewName: 'front',
          remoteUrl: imageUrl,
          requestId: result.requestId
        });
      }

      // Return only the base pose image (no views generated here)
      res.json({
        success: true,
        pose: targetPose,
        imageUrl: targetUrl,
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
  const { pose, viewName, imageUrl, sessionId } = req.body;

  console.log(`[VIEW] Generating ${viewName} view for ${pose} pose...`);
  if (sessionId) console.log('[VIEW] For session:', sessionId);

  // Determine paths based on session or legacy
  const viewPath = sessionId
    ? getAssetPath(sessionId, 'character', pose, `${viewName}.png`)
    : join(CHARACTER_DIR, pose, `${viewName}.png`);

  const viewUrl = sessionId
    ? getAssetUrl(sessionId, 'character', pose, `${viewName}.png`)
    : `/assets/character/${pose}/${viewName}.png`;

  // Check if view already exists (session-specific or legacy)
  if (existsSync(viewPath)) {
    console.log(`[REUSE] Reusing existing ${viewName} view for ${pose}`);

    // If session-based, try to get the stored remote URL
    let remoteUrl = `http://localhost:8081${viewUrl}`; // Default fallback
    if (sessionId) {
      const assetData = await sessionService.getAssetWithRemoteUrl(sessionId, 'character', pose, viewName);
      if (assetData && assetData.remote_url) {
        remoteUrl = assetData.remote_url;
        console.log(`[REUSE] Using stored remote URL for ${viewName} view`);
      }
    }

    res.json({
      success: true,
      pose: pose,
      viewName: viewName,
      imageUrl: viewUrl,
      remoteUrl: remoteUrl,
      cached: true
    });
    return;
  }

  // Don't use legacy assets for sessions - they lack remote URLs needed for Trellis
  // Legacy assets can only be used when NOT using sessions (backward compatibility)

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

      // Ensure directory exists
      const viewDir = dirname(viewPath);
      if (!existsSync(viewDir)) {
        mkdirSync(viewDir, { recursive: true });
      }

      // Save the view locally
      await downloadFile(newImageUrl, viewPath);
      console.log(`[SAVED] ${pose} ${viewName} view saved`);

      // Record asset in database if session-based
      if (sessionId) {
        await sessionService.recordAsset(sessionId, 'character', viewPath, {
          pose: pose,
          viewName: viewName,
          remoteUrl: newImageUrl,
          requestId: result.requestId
        });
      }

      res.json({
        success: true,
        pose: pose,
        viewName: viewName,
        imageUrl: viewUrl,
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
  const { imageUrls, pose = DEFAULT_POSE, modelType = 'trellis', sessionId } = req.body;

  console.log(`[3D MODEL] Generating 3D model for ${pose} pose using ${modelType.toUpperCase()}...`);
  if (sessionId) console.log('[3D MODEL] For session:', sessionId);

  // Validate image count based on model type
  const maxImages = modelType === 'trellis' ? 6 : 5; // Trellis supports 6, Rodin supports 5
  if (imageUrls && imageUrls.length > maxImages) {
    console.warn(`[3D MODEL] Received ${imageUrls.length} images, limiting to ${maxImages} (${modelType} constraint)`);
    imageUrls.splice(maxImages);
  }

  // Determine paths based on session or legacy
  const modelPath = sessionId
    ? getAssetPath(sessionId, 'models', null, `character_${pose}.glb`)
    : join(MODELS_DIR, `character_${pose}.glb`);

  const modelUrl = sessionId
    ? getAssetUrl(sessionId, 'models', null, `character_${pose}.glb`)
    : `/assets/models/character_${pose}.glb`;

  // Check if model already exists
  if (existsSync(modelPath)) {
    console.log('[REUSE] Reusing existing 3D model');
    res.json({
      success: true,
      modelUrl: modelUrl,
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
          texture_size: 1024,
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

      // Ensure directory exists
      const modelDir = dirname(modelPath);
      if (!existsSync(modelDir)) {
        mkdirSync(modelDir, { recursive: true });
      }

      await downloadFile(meshUrl, modelPath);
      console.log('[SAVED] 3D model saved locally');

      // Record asset in database if session-based
      if (sessionId) {
        await sessionService.recordAsset(sessionId, 'models', modelPath, {
          pose: pose,
          modelType: modelType,
          remoteUrl: meshUrl,
          requestId: result.requestId
        });
        console.log('[SESSION] Recorded 3D model in database');
      }

      res.json({
        success: true,
        modelUrl: modelUrl,
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
    // Log detailed error for debugging
    if (error.body && error.body.detail) {
      console.error('Validation error details:', JSON.stringify(error.body.detail, null, 2));
    }
    res.status(500).json({
      success: false,
      error: error.message,
      modelType: modelType,
      details: error.body?.detail || null
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

// ==================== SESSION API ENDPOINTS ====================

// Create a new session
app.post('/api/sessions/create', async (req, res) => {
  try {
    const { character, modelType, playerMode } = req.body;
    const session = await sessionService.createSession(character, modelType, playerMode);
    res.json({
      success: true,
      session
    });
  } catch (error) {
    console.error('[SESSION] Error creating session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get session details
app.get('/api/sessions/:id', async (req, res) => {
  try {
    const session = await sessionService.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    res.json({
      success: true,
      session
    });
  } catch (error) {
    console.error('[SESSION] Error getting session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// List recent sessions
app.get('/api/sessions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const result = await sessionService.listSessions(limit, offset);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[SESSION] Error listing sessions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete a session
app.delete('/api/sessions/:id', async (req, res) => {
  try {
    await sessionService.deleteSession(req.params.id);
    res.json({
      success: true,
      message: 'Session deleted successfully'
    });
  } catch (error) {
    console.error('[SESSION] Error deleting session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update session metadata
app.patch('/api/sessions/:id', async (req, res) => {
  try {
    const { gameState, metadata } = req.body;
    await sessionService.updateSession(req.params.id, { gameState, metadata });
    res.json({
      success: true,
      message: 'Session updated successfully'
    });
  } catch (error) {
    console.error('[SESSION] Error updating session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Check if session assets exist
app.get('/api/sessions/:id/assets', async (req, res) => {
  try {
    const assets = await sessionService.getSessionAssets(req.params.id);
    res.json({
      success: true,
      assets
    });
  } catch (error) {
    console.error('[SESSION] Error getting session assets:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Check if a specific asset exists for a session
app.get('/api/sessions/:id/assets/check', async (req, res) => {
  try {
    const { assetType, pose, viewName } = req.query;
    const assetPath = await sessionService.assetExists(req.params.id, assetType, pose, viewName);
    res.json({
      success: true,
      exists: !!assetPath,
      path: assetPath
    });
  } catch (error) {
    console.error('[SESSION] Error checking asset:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== LLM API ENDPOINTS ====================

// Query Claude with structured JSON output
app.post('/api/llm/query', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    console.log('[LLM] Received query:', prompt.substring(0, 100) + '...');

    // Call Anthropic API with structured output using raw fetch
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'structured-outputs-2025-11-13'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        output_format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              question: {
                type: 'string',
                description: 'The question or prompt that was asked'
              },
              answer: {
                type: 'string',
                description: 'The answer or response to the question'
              }
            },
            required: ['question', 'answer'],
            additionalProperties: false
          }
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${errorData}`);
    }

    const responseData = await response.json();
    console.log('[LLM] Response received from Claude');

    // Parse the JSON response from content
    const content = responseData.content[0].text;
    const parsedResponse = JSON.parse(content);

    res.json({
      success: true,
      question: parsedResponse.question,
      answer: parsedResponse.answer,
      requestId: responseData.id
    });

  } catch (error) {
    console.error('[LLM] Error querying Claude:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== MEME GENERATION API ====================

// Generate meme poster
app.post('/api/generate-meme', async (req, res) => {
  try {
    const { prompt, sessionId } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    console.log('[MEME] Generating meme poster...');

    // Determine paths based on session or legacy
    const memePath = sessionId
      ? getAssetPath(sessionId, 'images', null, 'meme-poster.png')
      : join(ASSETS_DIR, 'images', 'meme-poster.png');

    const memeUrl = sessionId
      ? getAssetUrl(sessionId, 'images', null, 'meme-poster.png')
      : `/assets/images/meme-poster.png`;

    // Check if meme exists (reuse)
    if (existsSync(memePath)) {
      console.log('[REUSE] Reusing existing meme poster');
      res.json({
        success: true,
        imageUrl: memeUrl,
        cached: true
      });
      return;
    }

    // Generate with FAL AI
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

    console.log('[OK] Meme generation complete!');

    if (result.data && result.data.images && result.data.images.length > 0) {
      const imageUrl = result.data.images[0].url;

      // Ensure directory exists
      const memeDir = dirname(memePath);
      if (!existsSync(memeDir)) {
        mkdirSync(memeDir, { recursive: true });
      }

      // Download and save
      await downloadFile(imageUrl, memePath);
      console.log('[SAVED] Meme poster saved locally');

      // Record asset in database if session-based
      if (sessionId) {
        await sessionService.recordAsset(sessionId, 'images', memePath, {
          remoteUrl: imageUrl,
          requestId: result.requestId
        });
      }

      res.json({
        success: true,
        imageUrl: memeUrl,
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
    console.error('❌ Error generating meme:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
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
