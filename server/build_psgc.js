/**
 * build_psgc.js
 *
 * Generates the `psgc.json` normalized offline dataset from the official
 * Philippine Statistics Authority (PSA) Excel publication.
 *
 * EXPECTED SOURCE:
 * The official 2Q 2026 PSA Publication Datafile downloaded manually from psa.gov.ph.
 * Target path: data/PSGC-2Q-2026-Publication-Datafile.xlsx
 *
 * SECURITY NOTE:
 * This script MUST NOT automatically download files from unofficial community mirrors
 * or NPM packages. Only manually verified PSA files should be placed in the data folder.
 */
const xlsx = require('xlsx');
const fs = require('fs');

function run() {
    const workbook = xlsx.readFile('data/PSGC-2Q-2026-Publication-Datafile.xlsx');
    const sheetName = workbook.SheetNames.find(s => s.toLowerCase().includes('psgc'));
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    let curReg = null;
    let curProv = null;
    let curCM = null;

    const results = [];

    const clean = (s) => (s || '').toString().trim().replace(/\s+/g, ' ');

    let numProv = 0, numHUC = 0, numOtherCity = 0, numMun = 0, numBgy = 0;

    for (const row of data) {
        const level = clean(row['Geographic Level']);
        const name = clean(row['Name']);
        const code = clean(row['10-digit PSGC']);
        const cityClass = clean(row['City Class']);

        if (!level || !name || !code) continue;

        if (level === 'Reg') {
            curReg = name;
            curProv = null;
            curCM = null;
        } else if (level === 'Prov') {
            curProv = name;
            curCM = null;
            numProv++;

            results.push({
                psgcCode: code,
                type: 'Province',
                resolvedName: `${name} / PH`,
                barangay: null,
                municipalityCity: null,
                province: name,
                region: curReg,
                country: 'PH'
            });

        } else if (level === 'Dist') {
            curProv = null;
            curCM = null;
        } else if (level === 'City' || level === 'Mun') {
            curCM = name;

            let parts = [name];
            if (curProv) parts.push(curProv);
            parts.push('PH');

            const type = level === 'City' ? 'City' : 'Municipality';
            if (type === 'City') {
                if (cityClass === 'HUC') numHUC++;
                else numOtherCity++;
            } else {
                numMun++;
            }

            results.push({
                psgcCode: code,
                type: type,
                resolvedName: parts.join(' / '),
                barangay: null,
                municipalityCity: name,
                province: curProv,
                region: curReg,
                country: 'PH'
            });

        } else if (level === 'Bgy') {
            numBgy++;
            let parts = [name, curCM];
            if (curProv) parts.push(curProv);
            parts.push('PH');

            results.push({
                psgcCode: code,
                type: 'Barangay',
                resolvedName: parts.join(' / '),
                barangay: name,
                municipalityCity: curCM,
                province: curProv,
                region: curReg,
                country: 'PH'
            });
        }
    }

    const finalJSON = {
        metadata: {
            "Source": "Philippine Statistics Authority",
            "Dataset": "Philippine Standard Geographic Code",
            "Version": "2Q 2026",
            "As of": "2026-06-30",
            "Source file": "PSGC-2Q-2026-Publication-Datafile.xlsx"
        },
        data: results
    };

    fs.writeFileSync('data/psgc.json', JSON.stringify(finalJSON));
    console.log('Saved data/psgc.json');
}

run();
