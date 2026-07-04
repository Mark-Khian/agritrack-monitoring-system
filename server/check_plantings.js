import db from './config/db.js';
import process from 'process';

async function run() {
    try {
        const [rows] = await db.query('SELECT * FROM activities WHERE planting_id = 48 AND deleted_at IS NULL');
        console.log('--- Activities for Planting ID 48 ---');
        console.log(rows);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

run();
