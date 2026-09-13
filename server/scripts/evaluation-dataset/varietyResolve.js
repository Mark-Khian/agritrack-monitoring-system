'use strict';

/**
 * Resolve preferred variety against live `varieties` table.
 * Tries preferred name, then alternates, then any row in the same class.
 */
const resolveVariety = async (connection, preferred) => {
    const candidates = [preferred.variety, ...(preferred.alternates || [])]
        .filter(Boolean)
        .map((name) => String(name).trim());

    for (const name of candidates) {
        const [rows] = await connection.query(
            `SELECT id, variety_class, name, default_expected_growth_days, min_growth_days, max_growth_days
             FROM varieties
             WHERE variety_class = ? AND name = ?
             LIMIT 1`,
            [preferred.variety_class, name]
        );
        if (rows.length) {
            const row = rows[0];
            const substituted = name !== preferred.variety || row.name !== preferred.variety;
            return {
                ok: true,
                row,
                requested: preferred.variety,
                resolved_name: row.name,
                substituted: substituted && row.name !== preferred.variety,
                reason: row.name === preferred.variety
                    ? 'exact preferred match'
                    : `substituted alternate "${row.name}" for requested "${preferred.variety}"`,
            };
        }
    }

    const [classRows] = await connection.query(
        `SELECT id, variety_class, name, default_expected_growth_days, min_growth_days, max_growth_days
         FROM varieties
         WHERE variety_class = ?
         ORDER BY name ASC
         LIMIT 1`,
        [preferred.variety_class]
    );
    if (classRows.length) {
        const row = classRows[0];
        return {
            ok: true,
            row,
            requested: preferred.variety,
            resolved_name: row.name,
            substituted: true,
            reason: `no preferred/alternate found; used first catalog variety in class "${row.name}"`,
        };
    }

    return {
        ok: false,
        requested: preferred.variety,
        variety_class: preferred.variety_class,
        reason: `no varieties found for class "${preferred.variety_class}"`,
    };
};

const resolveAllCropVarieties = async (connection, crops) => {
    const results = [];
    const substitutions = [];
    for (const crop of crops) {
        const resolved = await resolveVariety(connection, crop.preferred);
        if (!resolved.ok) {
            throw new Error(`Variety resolve failed for ${crop.key}: ${resolved.reason}`);
        }
        if (resolved.substituted) {
            substitutions.push({
                key: crop.key,
                field_name: crop.field_name,
                requested: resolved.requested,
                resolved: resolved.resolved_name,
                variety_id: resolved.row.id,
                reason: resolved.reason,
            });
        }
        results.push({
            key: crop.key,
            field_name: crop.field_name,
            variety_id: resolved.row.id,
            variety_class: resolved.row.variety_class,
            variety: resolved.row.name,
            default_expected_growth_days: resolved.row.default_expected_growth_days,
            min_growth_days: resolved.row.min_growth_days,
            max_growth_days: resolved.row.max_growth_days,
            substituted: resolved.substituted,
            reason: resolved.reason,
        });
    }
    return { results, substitutions };
};

module.exports = {
    resolveVariety,
    resolveAllCropVarieties,
};
