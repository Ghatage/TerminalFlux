-- Sessions table to store game sessions
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,  -- UUID
    character_description TEXT NOT NULL,
    model_type TEXT DEFAULT 'trellis',
    player_mode INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
    game_state JSON,  -- Store position, score, etc.
    metadata JSON     -- Additional flexible data
);

-- Assets table to track generated assets per session
CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    asset_type TEXT NOT NULL,  -- 'ground', 'character', 'model'
    pose TEXT,                  -- 'idle', 'walking', 'shooting'
    view_name TEXT,             -- 'front', 'back', 'left', etc.
    file_path TEXT NOT NULL,
    remote_url TEXT,
    request_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    UNIQUE(session_id, asset_type, pose, view_name)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_last_accessed ON sessions(last_accessed);
CREATE INDEX IF NOT EXISTS idx_assets_session_id ON assets(session_id);