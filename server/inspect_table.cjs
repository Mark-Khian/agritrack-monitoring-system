const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    try {
        console.log('Navigating to login page...');
        await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
        
        // Log in
        console.log('Entering credentials...');
        await page.type('input[type="text"], input[type="email"]', 'superadmin');
        await page.type('input[type="password"]', 'admin1234');
        await page.click('button[type="submit"]');
        
        console.log('Waiting for dashboard navigation...');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        
        console.log('Navigating to analytics...');
        await page.goto('http://localhost:5173/analytics', { waitUntil: 'networkidle2' });
        
        console.log('Waiting for table to load...');
        await page.waitForSelector('table');
        
        const tableDetails = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table tr'));
            return rows.map((row, idx) => {
                const computedStyle = window.getComputedStyle(row);
                const cells = Array.from(row.querySelectorAll('td, th')).map(cell => {
                    const cellStyle = window.getComputedStyle(cell);
                    return {
                        tag: cell.tagName,
                        text: cell.innerText.trim(),
                        borderBottom: cellStyle.borderBottom,
                        borderTop: cellStyle.borderTop,
                        borderBottomWidth: cellStyle.borderBottomWidth,
                        borderBottomColor: cellStyle.borderBottomColor,
                        boxShadow: cellStyle.boxShadow
                    };
                });
                return {
                    rowIndex: idx,
                    className: row.className,
                    borderBottom: computedStyle.borderBottom,
                    borderTop: computedStyle.borderTop,
                    boxShadow: computedStyle.boxShadow,
                    cells
                };
            });
        });

        console.log(JSON.stringify(tableDetails, null, 2));
    } catch (e) {
        console.error('Error occurred:', e);
    } finally {
        await browser.close();
    }
})();
