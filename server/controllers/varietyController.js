const db = require('../config/db');

const getAllVarieties = async (req, res) => {
    try {
        const varietyClass = (req.query.variety_class || '').trim();
        const where = varietyClass ? 'WHERE variety_class = ?' : '';
        const params = varietyClass ? [varietyClass] : [];

        const [rows] = await db.query(
            `SELECT id, variety_class, name,
                    default_expected_growth_days, min_growth_days, max_growth_days
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
