const db = require('../config/db');
const puppeteer = require('puppeteer');

// Helper: Format Date
const formatDate = (d) => {
    if (!d) return 'N/A';
    return new Date(d).toISOString().slice(0, 10);
};

// Helper: Format Currency
const formatCurrency = (val) => {
    if (val === null || val === undefined) return '₱0.00';
    return '₱' + parseFloat(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ── 1. BULK CSV EXPORT ──────────────────────────────────────────────
const exportPlantingsCSV = async (req, res) => {
    const { startDate, endDate, cropType, fieldLocation, plantingId } = req.query;

    try {
        let sql = `
            SELECT 
                p.id AS planting_id,
                p.field_name,
                p.field_location,
                p.field_size,
                p.field_category,
                p.variety_class AS crop_type,
                p.variety AS crop_variety,
                p.planting_date,
                p.expected_harvest,
                p.season,
                p.lifecycle_state,
                h.harvest_date,
                h.yield_kg,
                h.quality_grade,
                h.remarks AS harvest_remarks,
                h.financial_value,
                DATEDIFF(h.harvest_date, p.planting_date) AS cycle_duration
            FROM plantings p
            INNER JOIN harvests h ON p.id = h.planting_id
            WHERE p.status = 'completed'
              AND p.deleted_at IS NULL
              AND h.deleted_at IS NULL
        `;

        const params = [];

        if (startDate) {
            sql += ` AND p.planting_date >= ?`;
            params.push(startDate);
        }
        if (endDate) {
            sql += ` AND p.planting_date <= ?`;
            params.push(endDate);
        }
        if (cropType) {
            sql += ` AND (p.variety_class = ? OR p.variety = ?)`;
            params.push(cropType, cropType);
        }
        if (fieldLocation) {
            sql += ` AND (p.field_location LIKE ? OR p.field_name LIKE ?)`;
            params.push(`%${fieldLocation}%`, `%${fieldLocation}%`);
        }
        if (plantingId) {
            sql += ` AND p.id = ?`;
            params.push(plantingId);
        }

        sql += ` ORDER BY h.harvest_date DESC`;

        const [rows] = await db.query(sql, params);

        const fields = [
            { label: 'Planting ID', value: 'planting_id' },
            { label: 'Field Name', value: 'field_name' },
            { label: 'Field Location', value: 'field_location' },
            { label: 'Field Size (ha)', value: 'field_size' },
            { label: 'Field Category', value: 'field_category' },
            { label: 'Crop Type', value: 'crop_type' },
            { label: 'Crop Variety', value: 'crop_variety' },
            { label: 'Season', value: 'season' },
            { label: 'Planting Date', value: 'planting_date' },
            { label: 'Expected Harvest Date', value: 'expected_harvest' },
            { label: 'Actual Harvest Date', value: 'harvest_date' },
            { label: 'Cycle Duration (days)', value: 'cycle_duration' },
            { label: 'Yield (kg)', value: 'yield_kg' },
            { label: 'Quality Grade', value: 'quality_grade' },
            { label: 'Financial Value (PHP)', value: 'financial_value' },
            { label: 'Remarks', value: 'harvest_remarks' }
        ];

        let csvData = '';
        try {
            // Attempt importing json2csv dynamically
            const { Parser } = require('json2csv');
            const parser = new Parser({ fields });
            csvData = parser.parse(rows);
        } catch (err) {
            // Fallback manual CSV generation for maximum resilience
            const headers = fields.map(f => `"${f.label.replace(/"/g, '""')}"`).join(',');
            const csvRows = rows.map(row => 
                fields.map(f => {
                    let val = row[f.value];
                    if (val === null || val === undefined) return '""';
                    // format dates nicely
                    if (['planting_date', 'expected_harvest', 'harvest_date'].includes(f.value)) {
                        val = formatDate(val);
                    }
                    return `"${String(val).replace(/"/g, '""')}"`;
                }).join(',')
            );
            csvData = [headers, ...csvRows].join('\n');
        }

        const dateStr = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=completed_plantings_report_${dateStr}.csv`);
        return res.status(200).send(csvData);

    } catch (err) {
        console.error('CSV Export error:', err);
        return res.status(500).json({ message: 'Server error. Failed to export CSV.' });
    }
};

// ── 2. SINGLE PLANTING PDF EXPORT ──────────────────────────────────
const exportPlantingPDF = async (req, res) => {
    const plantingId = req.params.id;

    try {
        const [plantings] = await db.query(`
            SELECT 
                p.id AS planting_id,
                p.field_name,
                p.field_location,
                p.field_size,
                p.field_category,
                p.variety_class AS crop_type,
                p.variety AS crop_variety,
                p.planting_date,
                p.expected_harvest,
                p.season,
                p.status,
                h.harvest_date,
                h.yield_kg,
                h.quality_grade,
                h.financial_value,
                h.remarks AS harvest_remarks,
                DATEDIFF(h.harvest_date, p.planting_date) AS cycle_duration
            FROM plantings p
            LEFT JOIN harvests h ON p.id = h.planting_id
            WHERE p.id = ?
              AND p.deleted_at IS NULL
              AND (h.deleted_at IS NULL OR h.id IS NULL)
        `, [plantingId]);

        if (plantings.length === 0) {
            return res.status(404).json({ message: 'Planting record not found.' });
        }

        const planting = plantings[0];

        // Fetch activity counts summary
        const [activities] = await db.query(`
            SELECT activity_type, COUNT(*) as count
            FROM activities
            WHERE planting_id = ?
              AND status = 'completed'
              AND deleted_at IS NULL
            GROUP BY activity_type
        `, [plantingId]);

        const activityCounts = {
            fertilizing: 0,
            irrigation: 0,
            pest_control: 0
        };

        activities.forEach(act => {
            const type = String(act.activity_type || '').toLowerCase();
            const count = Number(act.count || 0);

            if (type.includes('fertiliz')) {
                activityCounts.fertilizing += count;
            } else if (type.includes('irrigation')) {
                activityCounts.irrigation += count;
            } else if (type.includes('pest')) {
                activityCounts.pest_control += count;
            }
        });

        // HTML/CSS Template for PDF
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Planting Report #${planting.planting_id}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
            font-family: 'Inter', sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 20px;
            font-size: 13px;
            line-height: 1.5;
        }
        .header {
            border-bottom: 2px solid #15803d;
            padding-bottom: 15px;
            margin-bottom: 25px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .logo-container {
            display: flex;
            align-items: center;
            gap: 8px;
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
            font-size: 16px;
            color: #0f172a;
            margin: 0 0 5px 0;
            font-weight: 700;
            text-transform: uppercase;
        }
        .report-meta {
            font-size: 11px;
            color: #64748b;
        }
        .kpi-container {
            display: flex;
            justify-content: space-between;
            gap: 15px;
            margin-bottom: 30px;
        }
        .kpi-card {
            flex: 1;
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 15px;
            text-align: center;
        }
        .kpi-value {
            font-size: 18px;
            font-weight: 700;
            color: #0f172a;
            margin-top: 5px;
        }
        .kpi-label {
            font-size: 10px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-weight: 600;
        }
        .section-title {
            font-size: 14px;
            font-weight: 700;
            color: #0f172a;
            border-left: 4px solid #15803d;
            padding-left: 10px;
            margin: 25px 0 15px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .grid-details {
            display: flex;
            gap: 30px;
            margin-bottom: 25px;
        }
        .grid-col {
            flex: 1;
        }
        table.info-table {
            width: 100%;
            border-collapse: collapse;
        }
        table.info-table td {
            padding: 8px 12px;
            border-bottom: 1px solid #f1f5f9;
        }
        table.info-table td.label {
            font-weight: 500;
            color: #64748b;
            width: 45%;
        }
        table.info-table td.value {
            font-weight: 600;
            color: #1e293b;
        }
        .activity-summary {
            display: flex;
            justify-content: space-around;
            background-color: #f0fdf4;
            border: 1px solid #bbf7d0;
            border-radius: 8px;
            padding: 20px;
            margin-top: 15px;
        }
        .activity-item {
            text-align: center;
        }
        .activity-count {
            font-size: 24px;
            font-weight: 700;
            color: #15803d;
        }
        .activity-label {
            font-size: 11px;
            color: #166534;
            font-weight: 600;
            margin-top: 5px;
        }
        .footer {
            margin-top: 60px;
            border-top: 1px solid #e2e8f0;
            padding-top: 15px;
            font-size: 10px;
            color: #94a3b8;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo-container">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 20V8a3 3 0 0 1 6 0v12" />
                <path d="M10 12a3 3 0 0 0-6 0v8h6" />
                <path d="M7 20h10" />
            </svg>
            <div class="logo-text">Agri<span class="logo-accent">Track</span></div>
        </div>
        <div class="report-title-container">
            <div class="report-title">Crop Performance Report</div>
            <div class="report-meta">Generated: ${new Date().toLocaleString()} &bull; Planting ID: #${planting.planting_id}</div>
        </div>
    </div>

    <!-- KPIs -->
    <div class="kpi-container">
        <div class="kpi-card">
            <div class="kpi-label">Yield</div>
            <div class="kpi-value">${planting.yield_kg ? Number(planting.yield_kg).toLocaleString() + ' kg' : 'N/A'}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Quality Grade</div>
            <div class="kpi-value">${planting.quality_grade || 'N/A'}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Financial Value</div>
            <div class="kpi-value">${formatCurrency(planting.financial_value)}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Cycle Duration</div>
            <div class="kpi-value">${planting.cycle_duration ? planting.cycle_duration + ' Days' : 'N/A'}</div>
        </div>
    </div>

    <div class="grid-details">
        <div class="grid-col">
            <div class="section-title">Planting & Field Details</div>
            <table class="info-table">
                <tr>
                    <td class="label">Field Name</td>
                    <td class="value">${planting.field_name}</td>
                </tr>
                <tr>
                    <td class="label">Field Location</td>
                    <td class="value">${planting.field_location || 'N/A'}</td>
                </tr>
                <tr>
                    <td class="label">Field Size</td>
                    <td class="value">${planting.field_size ? planting.field_size + ' ha' : 'N/A'}</td>
                </tr>
                <tr>
                    <td class="label">Field Category</td>
                    <td class="value">${planting.field_category || 'N/A'}</td>
                </tr>
                <tr>
                    <td class="label">Crop Type</td>
                    <td class="value">${planting.crop_type || 'Unclassified'}</td>
                </tr>
                <tr>
                    <td class="label">Crop Variety</td>
                    <td class="value">${planting.crop_variety}</td>
                </tr>
                <tr>
                    <td class="label">Season</td>
                    <td class="value" style="text-transform: capitalize;">${planting.season}</td>
                </tr>
            </table>
        </div>

        <div class="grid-col">
            <div class="section-title">Harvest & Life-cycle</div>
            <table class="info-table">
                <tr>
                    <td class="label">Planting Date</td>
                    <td class="value">${formatDate(planting.planting_date)}</td>
                </tr>
                <tr>
                    <td class="label">Expected Harvest</td>
                    <td class="value">${formatDate(planting.expected_harvest)}</td>
                </tr>
                <tr>
                    <td class="label">Actual Harvest Date</td>
                    <td class="value">${formatDate(planting.harvest_date)}</td>
                </tr>
                <tr>
                    <td class="label">Status</td>
                    <td class="value" style="text-transform: capitalize; color: #16a34a; font-weight: 700;">${planting.status || 'Completed'}</td>
                </tr>
                <tr>
                    <td class="label">Remarks</td>
                    <td class="value">${planting.harvest_remarks || 'No remarks recorded.'}</td>
                </tr>
            </table>
        </div>
    </div>

    <div class="section-title">Completed Activity Summary</div>
    <p style="color: #64748b; font-size: 11px; margin-top: -5px; margin-bottom: 12px;">Successful operational events executed during this crop cycle:</p>
    <div class="activity-summary">
        <div class="activity-item">
            <div class="activity-count">${activityCounts.fertilizing}</div>
            <div class="activity-label">Fertilization Events</div>
        </div>
        <div class="activity-item">
            <div class="activity-count">${activityCounts.irrigation}</div>
            <div class="activity-label">Irrigation Events</div>
        </div>
        <div class="activity-item">
            <div class="activity-count">${activityCounts.pest_control}</div>
            <div class="activity-label">Pest Control Events</div>
        </div>
    </div>

    <div class="footer">
        AgriTrack Monitoring System &copy; 2026. Generated by user authorization. Confidential.
    </div>
</body>
</html>
        `;

        // Generate PDF using Puppeteer
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '15mm',
                bottom: '15mm',
                left: '15mm',
                right: '15mm'
            }
        });

        await browser.close();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=planting_report_${plantingId}.pdf`);
        return res.send(pdfBuffer);

    } catch (err) {
        console.error('Single PDF Export error:', err);
        return res.status(500).json({ message: 'Server error. Failed to generate PDF.' });
    }
};

// ── 3. BULK PDF SUMMARY EXPORT (STRETCH GOAL) ──────────────────────
const exportPlantingsPDF = async (req, res) => {
    const { startDate, endDate, cropType, fieldLocation, plantingId } = req.query;

    try {
        let sql = `
            SELECT 
                p.id AS planting_id,
                p.field_name,
                p.field_location,
                p.variety_class AS crop_type,
                p.variety AS crop_variety,
                p.planting_date,
                p.season,
                h.harvest_date,
                h.yield_kg,
                h.quality_grade,
                h.financial_value,
                DATEDIFF(h.harvest_date, p.planting_date) AS cycle_duration
            FROM plantings p
            INNER JOIN harvests h ON p.id = h.planting_id
            WHERE p.status = 'completed'
              AND p.deleted_at IS NULL
              AND h.deleted_at IS NULL
        `;

        const params = [];

        if (startDate) {
            sql += ` AND p.planting_date >= ?`;
            params.push(startDate);
        }
        if (endDate) {
            sql += ` AND p.planting_date <= ?`;
            params.push(endDate);
        }
        if (cropType) {
            sql += ` AND (p.variety_class = ? OR p.variety = ?)`;
            params.push(cropType, cropType);
        }
        if (fieldLocation) {
            sql += ` AND (p.field_location LIKE ? OR p.field_name LIKE ?)`;
            params.push(`%${fieldLocation}%`, `%${fieldLocation}%`);
        }
        if (plantingId) {
            sql += ` AND p.id = ?`;
            params.push(plantingId);
        }

        sql += ` ORDER BY h.harvest_date DESC`;

        const [rows] = await db.query(sql, params);

        // Calculate KPIs
        const totalCount = rows.length;
        const totalYield = rows.reduce((sum, r) => sum + Number(r.yield_kg || 0), 0);
        const totalValue = rows.reduce((sum, r) => sum + Number(r.financial_value || 0), 0);
        const avgDuration = totalCount > 0 
            ? rows.reduce((sum, r) => sum + Number(r.cycle_duration || 0), 0) / totalCount 
            : 0;

        const filtersDesc = {
            dateRange: (startDate && endDate) ? `${startDate} to ${endDate}` : (startDate ? `From ${startDate}` : (endDate ? `Until ${endDate}` : 'All dates')),
            cropType: cropType || 'All crop types',
            fieldLocation: fieldLocation || 'All locations'
        };

        const rowsHtml = rows.map(r => `
            <tr>
                <td>#${r.planting_id}</td>
                <td>${r.field_name}</td>
                <td>
                    <div style="font-weight: 600;">${r.crop_variety}</div>
                    <div style="font-size: 8px; color: #64748b;">${r.crop_type || 'Unclassified'}</div>
                </td>
                <td style="text-transform: capitalize;">${r.season}</td>
                <td>${formatDate(r.harvest_date)}</td>
                <td class="text-right font-semibold">${Number(r.yield_kg || 0).toLocaleString()} kg</td>
                <td class="text-center font-bold">${r.quality_grade || 'N/A'}</td>
                <td class="text-right font-semibold">${formatCurrency(r.financial_value)}</td>
            </tr>
        `).join('');

        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Completed Plantings Summary Report</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
            font-family: 'Inter', sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 20px;
            font-size: 11px;
            line-height: 1.4;
        }
        .header {
            border-bottom: 2px solid #15803d;
            padding-bottom: 12px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .logo-container {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .logo-text {
            font-size: 20px;
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
            font-size: 14px;
            color: #0f172a;
            margin: 0 0 3px 0;
            font-weight: 700;
            text-transform: uppercase;
        }
        .report-meta {
            font-size: 10px;
            color: #64748b;
        }
        .filters-badge {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 10px;
            margin-bottom: 20px;
            font-size: 10px;
            color: #475569;
        }
        .kpi-container {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 20px;
        }
        .kpi-card {
            flex: 1;
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 12px 10px;
            text-align: center;
        }
        .kpi-value {
            font-size: 16px;
            font-weight: 700;
            color: #0f172a;
            margin-top: 4px;
        }
        .kpi-label {
            font-size: 9px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-weight: 600;
        }
        table.report-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }
        table.report-table th, table.report-table td {
            border: 1px solid #e2e8f0;
            padding: 8px 10px;
            text-align: left;
        }
        table.report-table th {
            background-color: #f8fafc;
            font-weight: 600;
            color: #334155;
            text-transform: uppercase;
            font-size: 9px;
            letter-spacing: 0.5px;
        }
        table.report-table tr:nth-child(even) {
            background-color: #f8fafc;
        }
        table.report-table tr {
            page-break-inside: avoid;
        }
        .footer {
            margin-top: 40px;
            border-top: 1px solid #e2e8f0;
            padding-top: 10px;
            font-size: 9px;
            color: #94a3b8;
            text-align: center;
        }
        .text-right {
            text-align: right;
        }
        .text-center {
            text-align: center;
        }
        .font-semibold {
            font-weight: 600;
        }
        .font-bold {
            font-weight: 700;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo-container">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 20V8a3 3 0 0 1 6 0v12" />
                <path d="M10 12a3 3 0 0 0-6 0v8h6" />
                <path d="M7 20h10" />
            </svg>
            <div class="logo-text">Agri<span class="logo-accent">Track</span></div>
        </div>
        <div class="report-title-container">
            <div class="report-title">Bulk Performance Report</div>
            <div class="report-meta">Generated: ${new Date().toLocaleString()} &bull; Total records: ${totalCount}</div>
        </div>
    </div>

    <div class="filters-badge">
        <strong>Active Filters:</strong> &bull; Date Range: ${filtersDesc.dateRange} &bull; Crop Type/Variety: ${filtersDesc.cropType} &bull; Location Query: ${filtersDesc.fieldLocation}
    </div>

    <!-- KPIs -->
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
            <div class="kpi-value">₱${totalValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Avg Crop Duration</div>
            <div class="kpi-value">${avgDuration.toFixed(1)} Days</div>
        </div>
    </div>

    <table class="report-table">
        <thead>
            <tr>
                <th>ID</th>
                <th>Field Name</th>
                <th>Variety Info</th>
                <th>Season</th>
                <th>Harvest Date</th>
                <th class="text-right">Yield (kg)</th>
                <th class="text-center">Grade</th>
                <th class="text-right">Value (PHP)</th>
            </tr>
        </thead>
        <tbody>
            ${totalCount > 0 ? rowsHtml : `<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 25px;">No completed plantings found matching the criteria.</td></tr>`}
        </tbody>
    </table>

    <div class="footer">
        AgriTrack Monitoring System &copy; 2026 &bull; Summary performance export &bull; Confidential
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
            margin: {
                top: '15mm',
                bottom: '15mm',
                left: '15mm',
                right: '15mm'
            }
        });

        await browser.close();

        const dateStr = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=completed_plantings_summary_${dateStr}.pdf`);
        return res.send(pdfBuffer);

    } catch (err) {
        console.error('Bulk PDF Export error:', err);
        return res.status(500).json({ message: 'Server error. Failed to generate PDF.' });
    }
};

module.exports = {
    exportPlantingsCSV,
    exportPlantingPDF,
    exportPlantingsPDF
};
