import sqlite3 from 'sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize SQLite database with verbose mode for debugging
const sqlite = sqlite3.verbose();
const db = new sqlite.Database(join(__dirname, 'sessions.db'));

// Promisify database methods for easier async/await usage
db.runAsync = promisify(db.run.bind(db));
db.getAsync = promisify(db.get.bind(db));
db.allAsync = promisify(db.all.bind(db));

// Initialize database schema
const initDatabase = () => {
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');

    // Split schema into individual statements and execute
    const statements = schema.split(';').filter(stmt => stmt.trim());

    return new Promise((resolve, reject) => {
        db.serialize(() => {
            statements.forEach(statement => {
                if (statement.trim()) {
                    db.run(statement + ';', (err) => {
                        if (err) {
                            console.error('Error executing schema statement:', err);
                            reject(err);
                        }
                    });
                }
            });
            resolve();
        });
    });
};

// Initialize database on module load
initDatabase()
    .then(() => console.log('[DB] Database initialized successfully'))
    .catch(err => console.error('[DB] Database initialization failed:', err));

export { db, uuidv4 };