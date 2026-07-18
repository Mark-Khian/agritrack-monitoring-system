const db = require('../server/config/db');

async function main() {
    try {
        const [tables] = await db.query('SHOW TABLES');
        console.log('Tables:', tables);

        for (const tableObj of tables) {
            const tableName = Object.values(tableObj)[0];
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
