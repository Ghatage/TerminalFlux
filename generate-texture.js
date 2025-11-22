import { fal } from "@fal-ai/client";
import { writeFileSync } from "fs";
import { config } from "dotenv";
import https from "https";

// Load environment variables
config();

// Configure FAL AI client
fal.config({
  credentials: process.env.FAL_KEY
});

async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        writeFileSync(filepath, Buffer.concat(chunks));
        resolve();
      });
      response.on('error', reject);
    });
  });
}

async function generateGroundTexture() {
  console.log("🎨 Generating sci-fi ground texture with FAL AI...");

  try {
    const result = await fal.subscribe("fal-ai/alpha-image-232/text-to-image", {
      input: {
        prompt: "seamless tileable sci-fi abstract ground texture, futuristic floor pattern, metallic hexagonal tiles with glowing blue circuits, high detail, top-down view, perfect for game terrain, technical sci-fi aesthetic, 4k resolution"
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          update.logs.map((log) => log.message).forEach(console.log);
        }
      },
    });

    console.log("✅ Generation complete!");
    console.log("Request ID:", result.requestId);

    if (result.data && result.data.images && result.data.images.length > 0) {
      const imageUrl = result.data.images[0].url;
      console.log("📥 Downloading image...");

      await downloadImage(imageUrl, "ground-texture.png");
      console.log("💾 Texture saved as: ground-texture.png");
      console.log("\n🚀 You can now run 'npm start' to view the scene!");
    } else {
      console.error("❌ No images returned from API");
    }

  } catch (error) {
    console.error("❌ Error generating texture:", error);
    throw error;
  }
}

// Run the generation
generateGroundTexture();
