const db = require('../config/db');

// Check if farm belongs to logged in user
const checkFarmOwnership = async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.id;
    const role = req.user.role;

    // Admins can access everything
    if (role === 'admin') return next();

    try {
        const [farms] = await db.query(
            'SELECT owner_id FROM farms WHERE id = ?', [id]
        );
        if (farms.length === 0) {
            return res.status(404).json({ message: 'Farm not found.' });
        }
        if (farms[0].owner_id !== userId) {
            return res.status(403).json({
                message: 'Access denied. This farm does not belong to you.'
            });
        }
        next();
    } catch (err) {
        res.status(500).json({ message: 'Server error.' });
    }
};

// Check if field belongs to user's farm
const checkFieldOwnership = async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.id;
    const role = req.user.role;

    if (role === 'admin') return next();

    try {
        const [fields] = await db.query(
            `SELECT farms.owner_id FROM fields
       JOIN farms ON fields.farm_id = farms.id
       WHERE fields.id = ?`, [id]
        );
        if (fields.length === 0) {
            return res.status(404).json({ message: 'Field not found.' });
        }
        if (fields[0].owner_id !== userId) {
            return res.status(403).json({
                message: 'Access denied. This field does not belong to you.'
            });
        }
        next();
    } catch (err) {
        res.status(500).json({ message: 'Server error.' });
    }
};

module.exports = { checkFarmOwnership, checkFieldOwnership };