const IDENTITY_MAX_LENGTH = 100;

const normalizeLoginIdentity = (username) => (
    String(username || '')
        .trim()
        .toLowerCase()
        .slice(0, IDENTITY_MAX_LENGTH)
);

module.exports = { IDENTITY_MAX_LENGTH, normalizeLoginIdentity };
