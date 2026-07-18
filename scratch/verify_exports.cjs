const db = require('../server/config/db');
const { exportPlantingsCSV, exportPlantingPDF, exportPlantingsPDF } = require('../server/controllers/exportController');

// Mock response object
class MockResponse {
    constructor() {
        this.headers = {};
        this.body = null;
        this.statusCode = 200;
        this.type = null;
    }

    status(code) {
        this.statusCode = code;
        return this;
    }

    setHeader(name, value) {
        this.headers[name] = value;
        return this;
    }

    contentType(type) {
        this.type = type;
        return this;
    }

    send(data) {
        this.body = data;
        return this;
    }

    json(data) {
        this.body = JSON.stringify(data);
        return this;
    }
}

async function verify() {
    console.log('--- 🧪 Verifying Export Feature Backend Controllers ---');

    // Find any planting to test single PDF export (active or completed)
    const [completed] = await db.query(
        "SELECT id FROM plantings WHERE deleted_at IS NULL LIMIT 1"
    );

    if (completed.length === 0) {
        console.warn('⚠️ No plantings in DB at all.');
    }

    const testId = completed.length > 0 ? completed[0].id : 1;
    console.log(`Using planting ID: ${testId} for single PDF test.`);

    // 1. Test CSV Export
    console.log('\n1. Testing CSV Export...');
    const reqCSV = { query: {} };
    const resCSV = new MockResponse();
    await exportPlantingsCSV(reqCSV, resCSV);
    console.log('CSV Status:', resCSV.statusCode);
    console.log('CSV Headers:', resCSV.headers);
    if (resCSV.statusCode === 200) {
        console.log('CSV Content Start:\n', String(resCSV.body).split('\n').slice(0, 5).join('\n'));
        console.log('✅ CSV Export Verified.');
    } else {
        console.error('❌ CSV Export Failed:', resCSV.body);
    }

    // 2. Test Bulk PDF Export
    console.log('\n2. Testing Bulk PDF Export...');
    const reqBulkPDF = { query: {} };
    const resBulkPDF = new MockResponse();
    await exportPlantingsPDF(reqBulkPDF, resBulkPDF);
    console.log('Bulk PDF Status:', resBulkPDF.statusCode);
    console.log('Bulk PDF Headers:', resBulkPDF.headers);
    if (resBulkPDF.statusCode === 200) {
        console.log('Bulk PDF Buffer Size:', resBulkPDF.body ? resBulkPDF.body.length : 0, 'bytes');
        console.log('✅ Bulk PDF Export Verified.');
    } else {
        console.error('❌ Bulk PDF Export Failed:', resBulkPDF.body);
    }

    // 3. Test Single PDF Export
    console.log('\n3. Testing Single PDF Export...');
    const reqSinglePDF = { params: { id: testId } };
    const resSinglePDF = new MockResponse();
    await exportPlantingPDF(reqSinglePDF, resSinglePDF);
    console.log('Single PDF Status:', resSinglePDF.statusCode);
    console.log('Single PDF Headers:', resSinglePDF.headers);
    if (resSinglePDF.statusCode === 200) {
        console.log('Single PDF Buffer Size:', resSinglePDF.body ? resSinglePDF.body.length : 0, 'bytes');
        console.log('✅ Single PDF Export Verified.');
    } else {
        console.error('❌ Single PDF Export Failed:', resSinglePDF.body);
    }

    console.log('\n--- 🏁 Verification Completed ---');
    process.exit(0);
}

verify().catch(err => {
    console.error('Verification crashed:', err);
    process.exit(1);
});
