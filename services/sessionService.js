import { db, uuidv4 } from '../database/db.js';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

class SessionService {
    constructor() {
        this.assetsDir = join(process.cwd(), 'assets');
    }

    /**
     * Create a new session with a UUID
     */
    async createSession(character, modelType = 'trellis', playerMode = 1) {
        const sessionId = uuidv4();
        const now = new Date().toISOString();

        try {
            await db.runAsync(
                `INSERT INTO sessions (id, character_description, model_type, player_mode, created_at, updated_at, last_accessed)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [sessionId, character, modelType, playerMode, now, now, now]
            );

            // Create session-specific asset directories
            this.createSessionDirectories(sessionId);

            console.log(`[SESSION] Created new session: ${sessionId}`);
            return {
                sessionId,
                character,
                modelType,
                playerMode,
                createdAt: now
            };
        } catch (error) {
            console.error('[SESSION] Error creating session:', error);
            throw error;
        }
    }

    /**
     * Get session details by ID
     */
    async getSession(sessionId) {
        try {
            const session = await db.getAsync(
                'SELECT * FROM sessions WHERE id = ?',
                [sessionId]
            );

            if (session) {
                // Update last accessed time
                await db.runAsync(
                    'UPDATE sessions SET last_accessed = ? WHERE id = ?',
                    [new Date().toISOString(), sessionId]
                );
            }

            return session;
        } catch (error) {
            console.error('[SESSION] Error getting session:', error);
            throw error;
        }
    }

    /**
     * Check if a session exists
     */
    async sessionExists(sessionId) {
        try {
            const session = await db.getAsync(
                'SELECT id FROM sessions WHERE id = ?',
                [sessionId]
            );
            return !!session;
        } catch (error) {
            console.error('[SESSION] Error checking session:', error);
            return false;
        }
    }

    /**
     * Update session data
     */
    async updateSession(sessionId, updates) {
        const fields = [];
        const values = [];

        if (updates.gameState !== undefined) {
            fields.push('game_state = ?');
            values.push(JSON.stringify(updates.gameState));
        }
        if (updates.metadata !== undefined) {
            fields.push('metadata = ?');
            values.push(JSON.stringify(updates.metadata));
        }

        if (fields.length === 0) return;

        fields.push('updated_at = ?');
        values.push(new Date().toISOString());
        values.push(sessionId);

        try {
            await db.runAsync(
                `UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`,
                values
            );
        } catch (error) {
            console.error('[SESSION] Error updating session:', error);
            throw error;
        }
    }

    /**
     * List recent sessions
     */
    async listSessions(limit = 10, offset = 0) {
        try {
            const sessions = await db.allAsync(
                `SELECT id, character_description, model_type, player_mode, created_at, last_accessed
                 FROM sessions
                 ORDER BY last_accessed DESC
                 LIMIT ? OFFSET ?`,
                [limit, offset]
            );

            const total = await db.getAsync('SELECT COUNT(*) as count FROM sessions');

            return {
                sessions,
                total: total.count
            };
        } catch (error) {
            console.error('[SESSION] Error listing sessions:', error);
            throw error;
        }
    }

    /**
     * Delete a session and its assets
     */
    async deleteSession(sessionId) {
        try {
            // Delete from database
            await db.runAsync('DELETE FROM sessions WHERE id = ?', [sessionId]);

            // Delete asset directories
            const sessionPath = join(this.assetsDir, sessionId);
            if (existsSync(sessionPath)) {
                rmSync(sessionPath, { recursive: true, force: true });
                console.log(`[SESSION] Deleted assets for session: ${sessionId}`);
            }

            return { success: true };
        } catch (error) {
            console.error('[SESSION] Error deleting session:', error);
            throw error;
        }
    }

    /**
     * Record an asset in the database
     */
    async recordAsset(sessionId, assetType, filePath, metadata = {}) {
        const { pose = null, viewName = null, remoteUrl = null, requestId = null } = metadata;

        try {
            await db.runAsync(
                `INSERT OR REPLACE INTO assets (session_id, asset_type, pose, view_name, file_path, remote_url, request_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [sessionId, assetType, pose, viewName, filePath, remoteUrl, requestId]
            );
        } catch (error) {
            console.error('[SESSION] Error recording asset:', error);
            throw error;
        }
    }

    /**
     * Get all assets for a session
     */
    async getSessionAssets(sessionId) {
        try {
            const assets = await db.allAsync(
                'SELECT * FROM assets WHERE session_id = ? ORDER BY created_at',
                [sessionId]
            );
            return assets;
        } catch (error) {
            console.error('[SESSION] Error getting session assets:', error);
            throw error;
        }
    }

    /**
     * Check if a specific asset exists for a session
     */
    async assetExists(sessionId, assetType, pose = null, viewName = null) {
        try {
            let query = 'SELECT file_path FROM assets WHERE session_id = ? AND asset_type = ?';
            const params = [sessionId, assetType];

            if (pose !== null) {
                query += ' AND pose = ?';
                params.push(pose);
            }
            if (viewName !== null) {
                query += ' AND view_name = ?';
                params.push(viewName);
            }

            const asset = await db.getAsync(query, params);
            if (asset && existsSync(asset.file_path)) {
                return asset.file_path;
            }
            return null;
        } catch (error) {
            console.error('[SESSION] Error checking asset:', error);
            return null;
        }
    }

    /**
     * Get asset with remote URL for a session
     */
    async getAssetWithRemoteUrl(sessionId, assetType, pose = null, viewName = null) {
        try {
            let query = 'SELECT file_path, remote_url FROM assets WHERE session_id = ? AND asset_type = ?';
            const params = [sessionId, assetType];

            if (pose !== null) {
                query += ' AND pose = ?';
                params.push(pose);
            }
            if (viewName !== null) {
                query += ' AND view_name = ?';
                params.push(viewName);
            }

            const asset = await db.getAsync(query, params);
            if (asset && existsSync(asset.file_path)) {
                return asset;
            }
            return null;
        } catch (error) {
            console.error('[SESSION] Error getting asset with remote URL:', error);
            return null;
        }
    }

    /**
     * Create session-specific directories
     */
    createSessionDirectories(sessionId) {
        const sessionPath = join(this.assetsDir, sessionId);
        const directories = [
            sessionPath,
            join(sessionPath, 'character'),
            join(sessionPath, 'character', 'idle'),
            join(sessionPath, 'character', 'walking'),
            join(sessionPath, 'character', 'shooting'),
            join(sessionPath, 'models'),
            join(sessionPath, 'ground')
        ];

        directories.forEach(dir => {
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }
        });

        console.log(`[SESSION] Created directories for session: ${sessionId}`);
    }

    /**
     * Get session-specific asset path
     */
    getAssetPath(sessionId, assetType, pose = null, fileName = null) {
        const parts = [this.assetsDir];

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
     * Clean up old sessions (older than 30 days)
     */
    async cleanupOldSessions(daysToKeep = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        try {
            const oldSessions = await db.allAsync(
                'SELECT id FROM sessions WHERE last_accessed < ?',
                [cutoffDate.toISOString()]
            );

            for (const session of oldSessions) {
                await this.deleteSession(session.id);
            }

            console.log(`[SESSION] Cleaned up ${oldSessions.length} old sessions`);
            return oldSessions.length;
        } catch (error) {
            console.error('[SESSION] Error cleaning up old sessions:', error);
            throw error;
        }
    }
}

// Export singleton instance
const sessionService = new SessionService();
export default sessionService;