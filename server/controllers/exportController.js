const db = require('../config/db');
const puppeteer = require('puppeteer');
const logActivity = require('../middleware/logger');
const {
    formatDate,
    formatPdfDate,
    formatPdfTimestamp,
    formatQualityGrade,
    formatEnum,
    formatRoleLabel,
    formatActivityLabel,
} = require('../utils/completedCropExportPresentation');
const {
    buildCompletedCropsHtml,
    buildActivityHistoryHtml,
} = require('../utils/completedCropExportHtml');

const resolveExporterLabel = async (req) => {
    const userId = req?.user?.id;
    if (!userId) return 'Authenticated User';
    try {
        const [rows] = await db.query(
            `SELECT name, username, email, role FROM users WHERE id = ? LIMIT 1`,
            [userId]
        );
        if (!rows.length) return 'Authenticated User';
        const row = rows[0];
        const displayName = row.name || row.username || row.email || 'Authenticated User';
        const roleLabel = formatRoleLabel(row.role || req.user.role);
        return `${displayName} (${roleLabel})`;
    } catch (err) {
        console.error('Failed to resolve exporter identity:', err.message);
        return `User (${formatRoleLabel(req.user?.role)})`;
    }
};

// ── Shared Data Fetching ───────────────────────────────────────────
const getCompletedCropRecords = async (req, isPlantings) => {
    let sql = `
        SELECT 
            p.id AS planting_id,
            p.field_name,
            p.variety AS crop_variety,
            p.cropping_season,
            p.establishment_method,
            p.field_condition,
            p.planting_date,
            p.expected_harvest,
            h.harvest_date,
            h.yield_kg,
            h.quality_grade,
            h.financial_value,
            h.remarks AS harvest_remarks,
            DATEDIFF(h.harvest_date, p.planting_date) AS cycle_duration
        FROM plantings p
        INNER JOIN harvests h ON p.id = h.planting_id
        WHERE p.status = 'completed'
          AND p.deleted_at IS NULL
          AND h.deleted_at IS NULL
    `;

    const queryParams = [];

    if (isPlantings) {
        const plantingId = req.query.plantingId || (req.params && req.params.id);
        if (plantingId) {
            const parsedId = Number(plantingId);
            if (!Number.isInteger(parsedId) || parsedId <= 0) {
                throw { status: 400, message: 'Validation failed.', errors: [{ field: 'plantingId', message: 'Invalid planting ID.' }] };
            }
            sql += ` AND p.id = ?`;
            queryParams.push(parsedId);
        } else if (typeof req.query.plantingIds === 'string' && req.query.plantingIds.trim() !== '') {
            const ids = req.query.plantingIds.split(',').map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
            if (ids.length === 0) {
                throw { status: 400, message: 'Validation failed.', errors: [{ field: 'plantingIds', message: 'No valid planting IDs provided.' }] };
            }
            sql += ` AND p.id IN (?)`;
            queryParams.push(ids);
        } else {
            throw { status: 400, message: 'Validation failed.', errors: [{ field: 'plantingIds', message: 'Select at least one planting record to export.' }] };
        }
    } else {
        const harvestId = req.query.harvestId || (req.params && req.params.id);
        if (harvestId) {
            const parsedId = Number(harvestId);
            if (!Number.isInteger(parsedId) || parsedId <= 0) {
                throw { status: 400, message: 'Validation failed.', errors: [{ field: 'harvestId', message: 'Invalid harvest ID.' }] };
            }
            sql += ` AND h.id = ?`;
            queryParams.push(parsedId);
        } else if (typeof req.query.harvestIds === 'string' && req.query.harvestIds.trim() !== '') {
            const ids = req.query.harvestIds.split(',').map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
            if (ids.length === 0) {
                throw { status: 400, message: 'Validation failed.', errors: [{ field: 'harvestIds', message: 'No valid harvest IDs provided.' }] };
            }
            sql += ` AND h.id IN (?)`;
            queryParams.push(ids);
        } else {
            throw { status: 400, message: 'Validation failed.', errors: [{ field: 'harvestIds', message: 'Select at least one harvest record to export.' }] };
        }
    }

    sql += ` ORDER BY h.harvest_date DESC`;

    const [rows] = await db.query(sql, queryParams);
    return rows;
};

/** One batched activities query for all selected planting IDs; grouped in memory. */
const getActivitiesByPlantingIds = async (plantingIds) => {
    const grouped = new Map();
    const ids = [...new Set((plantingIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    ids.forEach((id) => grouped.set(id, []));
    if (ids.length === 0) return grouped;

    const [rows] = await db.query(
        `SELECT planting_id, activity_type, planned_date, actual_date, status, notes
         FROM activities
         WHERE planting_id IN (?)
           AND deleted_at IS NULL
         ORDER BY
           COALESCE(actual_date, planned_date) ASC,
           id ASC`,
        [ids]
    );

    for (const row of rows) {
        const key = Number(row.planting_id);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row);
    }
    return grouped;
};

const attachActivitiesToRows = async (rows) => {
    const plantingIds = rows.map((row) => Number(row.planting_id)).filter(Boolean);
    const byPlanting = await getActivitiesByPlantingIds(plantingIds);
    return rows.map((row) => ({
        ...row,
        activities: byPlanting.get(Number(row.planting_id)) || [],
    }));
};

// ── Shared CSV Generator ───────────────────────────────────────────
const generateCompletedCropsCSV = (rows) => {
    const formattedRows = rows.map((row) => ({
        'Field Name': row.field_name || '',
        'Rice Variety': row.crop_variety || '',
        'Season': formatEnum(row.cropping_season),
        'Establishment Method': formatEnum(row.establishment_method),
        'Field Condition': formatEnum(row.field_condition),
        'Planting Date': row.planting_date ? formatDate(row.planting_date) : '',
        'Expected Harvest Date': row.expected_harvest ? formatDate(row.expected_harvest) : '',
        'Actual Harvest Date': row.harvest_date ? formatDate(row.harvest_date) : '',
        'Cycle Duration (Days)': row.cycle_duration !== null && row.cycle_duration !== undefined ? Number(row.cycle_duration) : '',
        'Yield (kg)': row.yield_kg !== null && row.yield_kg !== undefined ? Number(row.yield_kg) : '',
        'Quality Grade': formatQualityGrade(row.quality_grade),
        'Financial Value (PHP)': row.financial_value !== null && row.financial_value !== undefined ? Number(row.financial_value) : '',
        'Remarks': row.harvest_remarks || ''
    }));

    const fields = [
        'Field Name', 'Rice Variety', 'Season', 'Establishment Method',
        'Field Condition', 'Planting Date', 'Expected Harvest Date', 'Actual Harvest Date',
        'Cycle Duration (Days)', 'Yield (kg)', 'Quality Grade', 'Financial Value (PHP)', 'Remarks'
    ];

    let csvData = '';
    try {
        const { Parser } = require('json2csv');
        const parser = new Parser({ fields });
        csvData = parser.parse(formattedRows);
    } catch (err) {
        const headers = fields.map((f) => `"${f.replace(/"/g, '""')}"`).join(',');
        const csvRows = formattedRows.map((row) =>
            fields.map((f) => {
                const val = row[f];
                if (val === null || val === undefined || val === '') return '""';
                return `"${String(val).replace(/"/g, '""')}"`;
            }).join(',')
        );
        csvData = [headers, ...csvRows].join('\n');
    }
    return csvData;
};

// ── Shared PDF Generator ───────────────────────────────────────────
const generateCompletedCropsPDFBuffer = async (rows, exporter = {}) => {
    const htmlContent = buildCompletedCropsHtml(rows, {
        generatedBy: exporter.generatedBy,
        generatedAt: exporter.generatedAt || formatPdfTimestamp(),
    });

    const launchOptions = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    const browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `
            <div style="font-size: 8px; color: #64748b; width: 100%; text-align: center; font-family: Inter, sans-serif; padding: 0 15px;">
                AgriTrack Record Management System &copy; 2026 &bull; Page <span class="pageNumber"></span> of <span class="totalPages"></span>
            </div>
        `,
        margin: {
            top: '15mm',
            bottom: '20mm',
            left: '15mm',
            right: '15mm'
        }
    });

    await browser.close();
    return pdfBuffer;
};

const buildPdfExportPayload = async (req, isPlantings) => {
    const rows = await getCompletedCropRecords(req, isPlantings);
    const rowsWithActivities = await attachActivitiesToRows(rows);
    const generatedBy = await resolveExporterLabel(req);
    return { rows: rowsWithActivities, generatedBy };
};

// ── Endpoints ──────────────────────────────────────────────────────

const exportPlantingsCSV = async (req, res) => {
    try {
        const rows = await getCompletedCropRecords(req, true);
        const csvData = generateCompletedCropsCSV(rows);
        const dateStr = new Date().toISOString().slice(0, 10);
        await logActivity.fromRequest(req, {
            action: 'EXPORT_PLANTINGS_CSV',
            entity: 'plantings',
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="completed-crop-records-${dateStr}.csv"`);
        return res.status(200).send(csvData);
    } catch (err) {
        if (err.status) return res.status(err.status).json({ message: err.message, errors: err.errors });
        console.error('Error generating Plantings CSV:', err);
        return res.status(500).json({ message: 'Server error. Failed to generate CSV.' });
    }
};

const exportHarvestsCSV = async (req, res) => {
    try {
        const rows = await getCompletedCropRecords(req, false);
        const csvData = generateCompletedCropsCSV(rows);
        const dateStr = new Date().toISOString().slice(0, 10);
        await logActivity.fromRequest(req, {
            action: 'EXPORT_HARVESTS_CSV',
            entity: 'harvests',
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="completed-crop-records-${dateStr}.csv"`);
        return res.status(200).send(csvData);
    } catch (err) {
        if (err.status) return res.status(err.status).json({ message: err.message, errors: err.errors });
        console.error('Error generating Harvests CSV:', err);
        return res.status(500).json({ message: 'Server error. Failed to generate CSV.' });
    }
};

const exportPlantingPDF = async (req, res) => {
    try {
        const { rows, generatedBy } = await buildPdfExportPayload(req, true);
        const pdfBuffer = await generateCompletedCropsPDFBuffer(rows, { generatedBy });
        const dateStr = new Date().toISOString().slice(0, 10);
        await logActivity.fromRequest(req, {
            action: 'EXPORT_PLANTING_PDF',
            entity: 'plantings',
            entity_id: parseInt(req.params.id, 10) || null,
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="completed-crop-records-${dateStr}.pdf"`);
        return res.send(pdfBuffer);
    } catch (err) {
        if (err.status) return res.status(err.status).json({ message: err.message, errors: err.errors });
        console.error('Error generating Plantings PDF:', err);
        return res.status(500).json({ message: 'Server error. Failed to generate PDF.' });
    }
};

const exportPlantingsPDF = async (req, res) => {
    try {
        const { rows, generatedBy } = await buildPdfExportPayload(req, true);
        const pdfBuffer = await generateCompletedCropsPDFBuffer(rows, { generatedBy });
        const dateStr = new Date().toISOString().slice(0, 10);
        await logActivity.fromRequest(req, {
            action: 'EXPORT_PLANTINGS_PDF',
            entity: 'plantings',
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="completed-crop-records-${dateStr}.pdf"`);
        return res.send(pdfBuffer);
    } catch (err) {
        if (err.status) return res.status(err.status).json({ message: err.message, errors: err.errors });
        console.error('Error generating Plantings PDF:', err);
        return res.status(500).json({ message: 'Server error. Failed to generate PDF.' });
    }
};

const exportHarvestsPDF = async (req, res) => {
    try {
        const { rows, generatedBy } = await buildPdfExportPayload(req, false);
        const pdfBuffer = await generateCompletedCropsPDFBuffer(rows, { generatedBy });
        const dateStr = new Date().toISOString().slice(0, 10);
        await logActivity.fromRequest(req, {
            action: 'EXPORT_HARVESTS_PDF',
            entity: 'harvests',
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="completed-crop-records-${dateStr}.pdf"`);
        return res.send(pdfBuffer);
    } catch (err) {
        if (err.status) return res.status(err.status).json({ message: err.message, errors: err.errors });
        console.error('Error generating Harvests PDF:', err);
        return res.status(500).json({ message: 'Server error. Failed to generate PDF.' });
    }
};

module.exports = {
    exportPlantingsCSV,
    exportPlantingPDF,
    exportPlantingsPDF,
    exportHarvestsCSV,
    exportHarvestsPDF,
    formatPdfDate,
    formatPdfTimestamp,
    formatActivityLabel,
    formatRoleLabel,
    buildCompletedCropsHtml,
    buildActivityHistoryHtml,
};
