import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Base assets directory
const ASSETS_DIR = join(dirname(__dirname), 'assets');

/**
 * Get the full file system path for an asset
 * @param {string|null} sessionId - Session ID or null for legacy paths
 * @param {string} assetType - Type of asset ('character', 'models', 'ground')
 * @param {string|null} pose - Pose name for character assets
 * @param {string} fileName - Name of the file
 * @returns {string} Full file system path
 */
export function getAssetPath(sessionId, assetType, pose, fileName) {
    const parts = [ASSETS_DIR];

    if (sessionId) {
        parts.push(sessionId);
    }

    parts.push(assetType);

    if (pose) {
        parts.push(pose);
    }

    if (fileName) {
        parts.push(fileName);
    }

    return join(...parts);
}

/**
 * Get the URL path for an asset (for client access)
 * @param {string|null} sessionId - Session ID or null for legacy paths
 * @param {string} assetType - Type of asset ('character', 'models', 'ground')
 * @param {string|null} pose - Pose name for character assets
 * @param {string} fileName - Name of the file
 * @returns {string} URL path
 */
export function getAssetUrl(sessionId, assetType, pose, fileName) {
    const parts = ['/assets'];

    if (sessionId) {
        parts.push(sessionId);
    }

    parts.push(assetType);

    if (pose) {
        parts.push(pose);
    }

    if (fileName) {
        parts.push(fileName);
    }

    return parts.join('/');
}

/**
 * Check if an asset exists (with fallback to legacy path)
 * @param {string|null} sessionId - Session ID
 * @param {string} assetType - Type of asset
 * @param {string|null} pose - Pose name
 * @param {string} fileName - File name
 * @returns {object} Object with exists flag and path
 */
export function checkAssetExists(sessionId, assetType, pose, fileName) {
    // First check session-specific path
    if (sessionId) {
        const sessionPath = getAssetPath(sessionId, assetType, pose, fileName);
        if (existsSync(sessionPath)) {
            return {
                exists: true,
                path: sessionPath,
                url: getAssetUrl(sessionId, assetType, pose, fileName)
            };
        }
    }

    // Fall back to legacy path (without sessionId)
    const legacyPath = getAssetPath(null, assetType, pose, fileName);
    if (existsSync(legacyPath)) {
        return {
            exists: true,
            path: legacyPath,
            url: getAssetUrl(null, assetType, pose, fileName),
            isLegacy: true
        };
    }

    return {
        exists: false,
        path: sessionId ? getAssetPath(sessionId, assetType, pose, fileName) : legacyPath,
        url: sessionId ? getAssetUrl(sessionId, assetType, pose, fileName) : getAssetUrl(null, assetType, pose, fileName)
    };
}

/**
 * Get all required asset paths for a session
 * @param {string|null} sessionId - Session ID
 * @param {string} pose - Current pose
 * @returns {object} Object with all asset paths
 */
export function getSessionAssetPaths(sessionId, pose = 'idle') {
    return {
        ground: getAssetPath(sessionId, 'ground', null, 'ground-texture.png'),
        character: {
            front: getAssetPath(sessionId, 'character', pose, 'front.png'),
            back: getAssetPath(sessionId, 'character', pose, 'back.png'),
            left: getAssetPath(sessionId, 'character', pose, 'left.png'),
            right: getAssetPath(sessionId, 'character', pose, 'right.png'),
            angle30: getAssetPath(sessionId, 'character', pose, 'angle_30.png'),
            angleN30: getAssetPath(sessionId, 'character', pose, 'angle_-30.png')
        },
        model: getAssetPath(sessionId, 'models', null, `character_${pose}.glb`)
    };
}

/**
 * Get all required asset URLs for a session (for client)
 * @param {string|null} sessionId - Session ID
 * @param {string} pose - Current pose
 * @returns {object} Object with all asset URLs
 */
export function getSessionAssetUrls(sessionId, pose = 'idle') {
    return {
        ground: getAssetUrl(sessionId, 'ground', null, 'ground-texture.png'),
        character: {
            front: getAssetUrl(sessionId, 'character', pose, 'front.png'),
            back: getAssetUrl(sessionId, 'character', pose, 'back.png'),
            left: getAssetUrl(sessionId, 'character', pose, 'left.png'),
            right: getAssetUrl(sessionId, 'character', pose, 'right.png'),
            angle30: getAssetUrl(sessionId, 'character', pose, 'angle_30.png'),
            angleN30: getAssetUrl(sessionId, 'character', pose, 'angle_-30.png')
        },
        model: getAssetUrl(sessionId, 'models', null, `character_${pose}.glb`)
    };
}

export { ASSETS_DIR };