const db = require('../server/config/db');

async function main() {
    try {
        for (const tableName of ['plantings', 'harvests']) {
            const [columns] = await db.query(`DESCRIBE \`${tableName}\``);
            console.log(`\nTable: ${tableName}`);
            console.table(columns.map(c => ({ Field: c.Field, Type: c.Type, Null: c.Null, Key: c.Key, Default: c.Default })));
        }
    } catch (err) {
        console.error('Error describing database:', err);
    } finally {
        process.exit(0);
    }
}

main();
