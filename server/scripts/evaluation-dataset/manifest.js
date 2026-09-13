'use strict';

const fs = require('fs');
const path = require('path');
const { SEED_DATASET_ID } = require('./constants');

/** Outside normal app data — local server backup/output area. */
const MANIFEST_DIR = path.join(__dirname, '..', '..', 'backups', 'evaluation-seed-manifests');
const LATEST_MANIFEST_NAME = `${SEED_DATASET_ID}.latest.json`;

const ensureManifestDir = () => {
    fs.mkdirSync(MANIFEST_DIR, { recursive: true });
};

const timestampSlug = (iso = new Date().toISOString()) => (
    iso.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
);

const writeSeedManifest = (manifest) => {
    ensureManifestDir();
    const stamp = timestampSlug(manifest.executed_at);
    const fileName = `${SEED_DATASET_ID}_${stamp}.json`;
    const filePath = path.join(MANIFEST_DIR, fileName);
    const latestPath = path.join(MANIFEST_DIR, LATEST_MANIFEST_NAME);
    const body = `${JSON.stringify(manifest, null, 2)}\n`;
    fs.writeFileSync(filePath, body, 'utf8');
    fs.writeFileSync(latestPath, body, 'utf8');
    return { filePath, latestPath };
};

const readSeedManifest = (explicitPath = null) => {
    const target = explicitPath
        ? path.resolve(explicitPath)
        : path.join(MANIFEST_DIR, LATEST_MANIFEST_NAME);
    if (!fs.existsSync(target)) {
        throw new Error(`Seed manifest not found at ${target}`);
    }
    const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
    if (parsed.seed_dataset_id !== SEED_DATASET_ID) {
        throw new Error(
            `Manifest seed_dataset_id "${parsed.seed_dataset_id}" does not match ${SEED_DATASET_ID}`
        );
    }
    return { path: target, manifest: parsed };
};

module.exports = {
    MANIFEST_DIR,
    LATEST_MANIFEST_NAME,
    writeSeedManifest,
    readSeedManifest,
};
