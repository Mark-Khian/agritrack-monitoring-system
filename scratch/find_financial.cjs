const db = require('../server/config/db');

async function main() {
    try {
        const [columns] = await db.query(`
            SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
              AND (COLUMN_NAME LIKE '%price%' 
                   OR COLUMN_NAME LIKE '%value%' 
                   OR COLUMN_NAME LIKE '%cost%' 
                   OR COLUMN_NAME LIKE '%financial%' 
                   OR COLUMN_NAME LIKE '%revenue%' 
                   OR COLUMN_NAME LIKE '%income%' 
                   OR COLUMN_NAME LIKE '%market%')
        `);
        console.log('Columns matching query:', columns);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

main();
