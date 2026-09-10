const normalizeIp = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return 'unknown';
    if (raw.startsWith('::ffff:')) return raw.slice(7);
    return raw;
};

const getClientIp = (req) => normalizeIp(req?.ip || req?.socket?.remoteAddress);

module.exports = { normalizeIp, getClientIp };
