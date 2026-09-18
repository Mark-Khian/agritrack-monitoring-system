const db = require('../config/db');

const getAllVarieties = async (req, res) => {
    try {
        const varietyClass = (req.query.variety_class || '').trim();
        const includeInactive = req.query.include_inactive === '1'
            || req.query.include_inactive === 'true';

        const clauses = [];
        const params = [];
        if (!includeInactive) {
            clauses.push('is_active = 1');
        }
        if (varietyClass) {
            clauses.push('variety_class = ?');
            params.push(varietyClass);
        }
        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

        const [rows] = await db.query(
            `SELECT id, variety_class, name,
                    default_expected_growth_days, min_growth_days, max_growth_days,
                    is_active
             FROM varieties
             ${where}
             ORDER BY variety_class ASC, name ASC`,
            params
        );

        res.status(200).json({ data: rows });
    } catch (err) {
        console.error('Get varieties error:', err.message);
        res.status(500).json({ message: 'Server error.' });
    }
};

module.exports = { getAllVarieties };
