const db = require('../config/db');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// ── Helpers ────────────────────────────────────────────────────────
const formatDate = (d) => {
    if (!d) return 'N/A';
    return new Date(d).toISOString().slice(0, 10);
};

const formatCurrency = (val) => {
    if (val === null || val === undefined) return '₱0.00';
    return '₱' + parseFloat(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatQualityGrade = (val) => {
    if (!val) return '';
    const v = String(val).toUpperCase();
    if (v === 'REJECTED') return 'Rejected';
    if (['A', 'B', 'C'].includes(v)) return 'Grade ' + v;
    return val;
};

const formatEnum = (val) => {
    if (!val) return '';
    return String(val)
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
};

// CRM Logo Base64
let crmLogoBase64 = '';
try {
    const logoPath = path.join(__dirname, '../../src/assets/CRM-logo.png');
    if (fs.existsSync(logoPath)) {
        const logoData = fs.readFileSync(logoPath);
        crmLogoBase64 = 'data:image/png;base64,' + logoData.toString('base64');
    }
} catch (err) {
    console.error('Failed to load CRM logo for PDF export:', err);
}

// ── Shared Data Fetching ───────────────────────────────────────────
const getCompletedCropRecords = async (req, isPlantings) => {
    // isPlantings: boolean (true if request comes from Plantings endpoint, false if Harvests)
    let sql = `
        SELECT 
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
        const plantingId = req.query.plantingId || (req.params && req.params.id); // Support both query and path param
        if (plantingId) {
            const parsedId = Number(plantingId);
            if (!Number.isInteger(parsedId) || parsedId <= 0) {
                throw { status: 400, message: 'Validation failed.', errors: [{ field: 'plantingId', message: 'Invalid planting ID.' }] };
            }
            sql += ` AND p.id = ?`;
            queryParams.push(parsedId);
        } else if (typeof req.query.plantingIds === 'string' && req.query.plantingIds.trim() !== '') {
            const ids = req.query.plantingIds.split(',').map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0);
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
            const ids = req.query.harvestIds.split(',').map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0);
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

// ── Shared CSV Generator ───────────────────────────────────────────
const generateCompletedCropsCSV = (rows) => {
    const formattedRows = rows.map(row => ({
        'Planting Name': row.field_name || '',
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
        'Planting Name', 'Rice Variety', 'Season', 'Establishment Method',
        'Field Condition', 'Planting Date', 'Expected Harvest Date', 'Actual Harvest Date',
        'Cycle Duration (Days)', 'Yield (kg)', 'Quality Grade', 'Financial Value (PHP)', 'Remarks'
    ];

    let csvData = '';
    try {
        const { Parser } = require('json2csv');
        const parser = new Parser({ fields });
        csvData = parser.parse(formattedRows);
    } catch (err) {
        const headers = fields.map(f => `"${f.replace(/"/g, '""')}"`).join(',');
        const csvRows = formattedRows.map(row => 
            fields.map(f => {
                let val = row[f];
                if (val === null || val === undefined || val === '') return '""';
                return `"${String(val).replace(/"/g, '""')}"`;
            }).join(',')
        );
        csvData = [headers, ...csvRows].join('\n');
    }
    return csvData;
};

// ── Shared PDF Generator ───────────────────────────────────────────
const generateCompletedCropsPDFBuffer = async (rows) => {
    const totalCount = rows.length;
    const totalYield = rows.reduce((sum, r) => sum + Number(r.yield_kg || 0), 0);
    const totalValue = rows.reduce((sum, r) => sum + Number(r.financial_value || 0), 0);
    const avgDuration = totalCount > 0 
        ? rows.reduce((sum, r) => sum + Number(r.cycle_duration || 0), 0) / totalCount 
        : 0;

    const cardsHtml = rows.map(r => `
        <div class="crop-card">
            <h2 class="crop-card-title">${r.field_name || 'Unnamed Planting'}</h2>
            
            <div class="crop-grid">
                <!-- Column 1: Crop Information -->
                <div class="crop-section">
                    <div class="section-title">Crop Information</div>
                    
                    <div class="field-row">
                        <div class="field-label">Planting Name</div>
                        <div class="field-value">${r.field_name || '—'}</div>
                    </div>
                    <div class="field-row">
                        <div class="field-label">Rice Variety</div>
                        <div class="field-value">${r.crop_variety || '—'}</div>
                    </div>
                    <div class="field-row">
                        <div class="field-label">Season</div>
                        <div class="field-value">${formatEnum(r.cropping_season) || '—'}</div>
                    </div>
                    <div class="field-row">
                        <div class="field-label">Establishment Method</div>
                        <div class="field-value">${formatEnum(r.establishment_method) || '—'}</div>
                    </div>
                    <div class="field-row">
                        <div class="field-label">Field Condition</div>
                        <div class="field-value">${formatEnum(r.field_condition) || '—'}</div>
                    </div>
                </div>

                <!-- Column 2: Crop Schedule -->
                <div class="crop-section">
                    <div class="section-title">Crop Schedule</div>
                    
                    <div class="field-row">
                        <div class="field-label">Planting Date</div>
                        <div class="field-value">${r.planting_date ? formatDate(r.planting_date) : '—'}</div>
                    </div>
                    <div class="field-row">
                        <div class="field-label">Expected Harvest Date</div>
                        <div class="field-value">${r.expected_harvest ? formatDate(r.expected_harvest) : '—'}</div>
                    </div>
                    <div class="field-row">
                        <div class="field-label">Actual Harvest Date</div>
                        <div class="field-value">${r.harvest_date ? formatDate(r.harvest_date) : '—'}</div>
                    </div>
                    <div class="field-row">
                        <div class="field-label">Cycle Duration</div>
                        <div class="field-value">${r.cycle_duration !== null ? Number(r.cycle_duration) + ' Days' : '—'}</div>
                    </div>
                </div>

                <!-- Column 3: Harvest Result -->
                <div class="crop-section">
                    <div class="section-title">Harvest Result</div>
                    
                    <div class="field-row">
                        <div class="field-label">Yield</div>
                        <div class="field-value">${r.yield_kg !== null ? Number(r.yield_kg).toLocaleString() + ' kg' : '—'}</div>
                    </div>
                    <div class="field-row">
                        <div class="field-label">Quality Grade</div>
                        <div class="field-value">${formatQualityGrade(r.quality_grade) || '—'}</div>
                    </div>
                    <div class="field-row">
                        <div class="field-label">Financial Value</div>
                        <div class="field-value">${r.financial_value !== null ? formatCurrency(r.financial_value) : '—'}</div>
                    </div>
                    <div class="field-row">
                        <div class="field-label">Remarks</div>
                        <div class="field-value remarks-value">${r.harvest_remarks || '—'}</div>
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Completed Crop Records Report</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
            font-family: 'Inter', sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 0;
            font-size: 11px;
            line-height: 1.4;
            background-color: #ffffff;
        }
        .header {
            border-bottom: 2px solid #15803d;
            padding-bottom: 15px;
            margin-bottom: 25px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
        }
        .logo-container {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .logo-image {
            height: 32px;
            width: auto;
        }
        .logo-text {
            font-size: 22px;
            font-weight: 700;
            color: #0f172a;
        }
        .logo-accent {
            color: #15803d;
        }
        .report-title-container {
            text-align: right;
        }
        .report-title {
            font-size: 15px;
            color: #0f172a;
            margin: 0 0 4px 0;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .report-meta {
            font-size: 10px;
            color: #64748b;
        }
        .kpi-container {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 30px;
        }
        .kpi-card {
            flex: 1;
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 14px 12px;
            text-align: center;
        }
        .kpi-value {
            font-size: 17px;
            font-weight: 700;
            color: #0f172a;
            margin-top: 6px;
        }
        .kpi-label {
            font-size: 9px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-weight: 700;
        }
        .crop-card {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            margin-bottom: 20px;
            padding: 16px;
            page-break-inside: avoid;
        }
        .crop-card-title {
            font-size: 14px;
            font-weight: 700;
            color: #15803d;
            margin: 0 0 12px 0;
            padding-bottom: 8px;
            border-bottom: 1px solid #f1f5f9;
        }
        .crop-grid {
            display: flex;
            gap: 20px;
        }
        .crop-section {
            flex: 1;
        }
        .section-title {
            font-size: 10px;
            font-weight: 700;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
        }
        .field-row {
            margin-bottom: 6px;
        }
        .field-label {
            font-size: 9px;
            color: #64748b;
            margin-bottom: 2px;
        }
        .field-value {
            font-size: 11px;
            font-weight: 500;
            color: #0f172a;
        }
        .remarks-value {
            white-space: pre-wrap;
            word-break: break-word;
        }
        .no-records {
            text-align: center;
            padding: 40px;
            color: #64748b;
            font-style: italic;
            border: 1px dashed #cbd5e1;
            border-radius: 8px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo-container">
            ${crmLogoBase64 ? `<img src="${crmLogoBase64}" class="logo-image" alt="Logo" />` : ''}
            <div class="logo-text">Agri<span class="logo-accent">Track</span></div>
        </div>
        <div class="report-title-container">
            <h1 class="report-title">COMPLETED CROP RECORDS REPORT</h1>
            <div class="report-meta">Generated: ${new Date().toLocaleString()} &bull; Total Records: ${totalCount}</div>
        </div>
    </div>

    <div class="kpi-container">
        <div class="kpi-card">
            <div class="kpi-label">Completed Crops</div>
            <div class="kpi-value">${totalCount}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Total Yield</div>
            <div class="kpi-value">${totalYield.toLocaleString()} kg</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Total Crop Value</div>
            <div class="kpi-value">${totalValue ? formatCurrency(totalValue) : '₱0.00'}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Average Crop Duration</div>
            <div class="kpi-value">${avgDuration.toFixed(1)} Days</div>
        </div>
    </div>

    <div class="records-container">
        ${totalCount > 0 ? cardsHtml : '<div class="no-records">No completed crop records found.</div>'}
    </div>
</body>
</html>
`;

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
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

// ── Endpoints ──────────────────────────────────────────────────────

const exportPlantingsCSV = async (req, res) => {
    try {
        const rows = await getCompletedCropRecords(req, true);
        const csvData = generateCompletedCropsCSV(rows);
        const dateStr = new Date().toISOString().slice(0, 10);
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
        const rows = await getCompletedCropRecords(req, true);
        const pdfBuffer = await generateCompletedCropsPDFBuffer(rows);
        const dateStr = new Date().toISOString().slice(0, 10);
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
        const rows = await getCompletedCropRecords(req, true);
        const pdfBuffer = await generateCompletedCropsPDFBuffer(rows);
        const dateStr = new Date().toISOString().slice(0, 10);
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
        const rows = await getCompletedCropRecords(req, false);
        const pdfBuffer = await generateCompletedCropsPDFBuffer(rows);
        const dateStr = new Date().toISOString().slice(0, 10);
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
    exportHarvestsPDF
};
