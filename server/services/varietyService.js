const db = require('../config/db');

const getVarietyById = async (id) => {
    const [rows] = await db.query('SELECT * FROM varieties WHERE id = ?', [id]);
    return rows[0] || null;
};

const findVarietyByClassAndName = async (varietyClass, name) => {
    const [rows] = await db.query(
        'SELECT * FROM varieties WHERE variety_class = ? AND name = ? LIMIT 1',
        [varietyClass, name]
    );
    return rows[0] || null;
};

/**
 * Resolves catalog row when variety_id is set (must match class+name) or by class+name alone.
 */
const resolveVarietyForPlanting = async ({ variety_id, variety_class, variety }) => {
    if (variety_id != null && variety_id !== '' && !Number.isNaN(Number(variety_id))) {
        const row = await getVarietyById(Number(variety_id));
        if (!row) return { error: 'Variety catalog entry not found.' };
        if (row.variety_class !== variety_class || row.name !== variety) {
            return { error: 'variety_id does not match the selected variety class and name.' };
        }
        return { row };
    }
    const row = await findVarietyByClassAndName(variety_class, variety);
    return { row };
};

const countSystemGeneratedActivities = async (plantingId) => {
    const [[{ c }]] = await db.query(
        `SELECT COUNT(*) AS c FROM activities
         WHERE planting_id = ? AND is_system_generated = 1 AND deleted_at IS NULL`,
        [plantingId]
    );
    return Number(c) || 0;
};

module.exports = {
    getVarietyById,
    findVarietyByClassAndName,
    resolveVarietyForPlanting,
    countSystemGeneratedActivities,
};
