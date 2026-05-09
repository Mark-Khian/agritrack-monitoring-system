const fs = require('fs');
const path = require('path');

const certPath = path.join(__dirname, '..', 'ssl');
const keyFile = path.join(certPath, 'server.key');
const certFile = path.join(certPath, 'server.cert');

const generateCerts = () => {
    // Create ssl folder if not exists
    if (!fs.existsSync(certPath)) {
        fs.mkdirSync(certPath, { recursive: true });
    }

    // Only generate if not already exists
    if (!fs.existsSync(keyFile) || !fs.existsSync(certFile)) {
        console.log('🔐 Generating SSL certificates...');

        try {
            // Use selfsigned package
            const selfsigned = require('selfsigned');
            const attrs = [
                { name: 'commonName', value: 'localhost' },
                { name: 'organizationName', value: 'AgriTrack' },
                { name: 'countryName', value: 'PH' },
                { name: 'localityName', value: 'Baguio City' },
            ];

            const pems = selfsigned.generate(attrs, {
                days: 365,
                algorithm: 'sha256',
                keySize: 2048,
                extensions: [{
                    name: 'subjectAltName',
                    altNames: [{
                        type: 2,
                        value: 'localhost'
                    }]
                }]
            });

            // Verify pems exist before writing
            if (!pems.private || !pems.cert) {
                throw new Error('Failed to generate SSL certificates.');
            }

            fs.writeFileSync(keyFile, pems.private);
            fs.writeFileSync(certFile, pems.cert);
            console.log('✅ SSL certificates generated!');

        } catch (err) {
            console.error('❌ SSL generation failed:', err.message);
            console.log('⚠️  Running without HTTPS...');
            return null;
        }
    }

    // Read and return existing certs
    try {
        const certs = {
            key: fs.readFileSync(keyFile),
            cert: fs.readFileSync(certFile)
        };
        console.log('✅ SSL certificates loaded!');
        return certs;
    } catch (err) {
        console.error('❌ Failed to read SSL certificates:', err.message);
        return null;
    }
};

module.exports = generateCerts;