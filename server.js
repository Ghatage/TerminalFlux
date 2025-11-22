import express from 'express';
import { fal } from '@fal-ai/client';
import { config } from 'dotenv';
import cors from 'cors';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
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

// Ensure directories exist
[ASSETS_DIR, CHARACTER_DIR, MODELS_DIR, GROUND_DIR].forEach(dir => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
});

// Middleware
app.use(cors());
app.use(express.json());
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
function checkAssetsExist() {
  const requiredFiles = {
    ground: join(GROUND_DIR, 'ground-texture.png'),
    characterFront: join(CHARACTER_DIR, 'front.png'),
    characterBack: join(CHARACTER_DIR, 'back.png'),
    characterLeft: join(CHARACTER_DIR, 'left.png'),
    characterRight: join(CHARACTER_DIR, 'right.png'),
    characterAngle30: join(CHARACTER_DIR, 'angle_30.png'),
    characterAngleN30: join(CHARACTER_DIR, 'angle_-30.png'),
    model: join(MODELS_DIR, 'character.glb')
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
        prompt: prompt || "seamless tileable sci-fi abstract ground texture, futuristic floor pattern, metallic hexagonal tiles with glowing blue circuits, high detail, top-down view, perfect for game terrain, technical sci-fi aesthetic, 4k resolution"
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

  const frontPath = join(CHARACTER_DIR, 'front.png');
  if (REUSE_ASSETS && existsSync(frontPath)) {
    console.log('[REUSE] Reusing existing character');
    res.json({
      success: true,
      imageUrl: `/assets/character/front.png`,
      requestId: 'cached',
      cached: true
    });
    return;
  }

  try {
    const result = await fal.subscribe("fal-ai/alpha-image-232/text-to-image", {
      input: {
        prompt: "futuristic low poly character, sci-fi robot, simple geometric shapes, clean polygonal design, game asset style, front view facing camera, white background, highly detailed, 4k resolution, standing pose, symmetrical"
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
        imageUrl: `/assets/character/front.png`,
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
  const { imageUrl, angle, viewName } = req.body;

  console.log(`[REPOSE] Reposing character to: ${viewName}`);

  const outputPath = join(CHARACTER_DIR, `${viewName}.png`);
  if (REUSE_ASSETS && existsSync(outputPath)) {
    console.log(`[REUSE] Reusing existing ${viewName} view`);
    res.json({
      success: true,
      imageUrl: `/assets/character/${viewName}.png`,
      requestId: 'cached',
      cached: true,
      viewName
    });
    return;
  }

  // Define prompts for different views
  const viewPrompts = {
    'back': 'back view of the same character, rear view, same style and design',
    'left': 'left side view of the same character, profile from left, same style and design',
    'right': 'right side view of the same character, profile from right, same style and design',
    'angle_30': 'character rotated 30 degrees to the right, three-quarter view, same style and design',
    'angle_-30': 'character rotated 30 degrees to the left, three-quarter view, same style and design'
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
        imageUrl: `/assets/character/${viewName}.png`,
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

// API endpoint to generate 3D model using Trellis
app.post('/api/generate-3d-model', async (req, res) => {
  const { imageUrls } = req.body;

  console.log('[3D MODEL] Generating 3D model from images...');

  const modelPath = join(MODELS_DIR, 'character.glb');
  if (REUSE_ASSETS && existsSync(modelPath)) {
    console.log('[REUSE] Reusing existing 3D model');
    res.json({
      success: true,
      modelUrl: `/assets/models/character.glb`,
      requestId: 'cached',
      cached: true
    });
    return;
  }

  try {
    const result = await fal.subscribe("fal-ai/trellis/multi", {
      input: {
        image_urls: imageUrls,
        texture_size: 1024
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          update.logs.map((log) => log.message).forEach(console.log);
        }
      },
    });

    console.log('[OK] 3D model generation complete!');
    console.log('Request ID:', result.requestId);

    if (result.data && result.data.model_mesh && result.data.model_mesh.url) {
      const meshUrl = result.data.model_mesh.url;

      await downloadFile(meshUrl, modelPath);
      console.log('[SAVED] 3D model saved locally');

      res.json({
        success: true,
        modelUrl: `/assets/models/character.glb`,
        requestId: result.requestId,
        cached: false
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'No model returned from API'
      });
    }

  } catch (error) {
    console.error('❌ Error generating 3D model:', error);
    res.status(500).json({
      success: false,
      error: error.message
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
