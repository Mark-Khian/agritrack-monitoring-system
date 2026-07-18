const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    try {
        await page.goto('http://localhost:5173/analytics', { waitUntil: 'networkidle2' });
        
        // Wait for the table to render
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
                        borderBottomColor: cellStyle.borderBottomColor
                    };
                });
                return {
                    rowIndex: idx,
                    className: row.className,
                    borderBottom: computedStyle.borderBottom,
                    borderTop: computedStyle.borderTop,
                    cells
                };
            });
        });

        console.log(JSON.stringify(tableDetails, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
})();
