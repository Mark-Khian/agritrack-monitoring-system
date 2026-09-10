const ROLES = Object.freeze({
    ADMIN: 'ADMIN',
    SECRETARY: 'SECRETARY',
    FARM_WORKER: 'FARM_WORKER',
});

const CAPABILITIES = Object.freeze({
    DASHBOARD_READ: 'dashboard.read',
    PLANTING_READ: 'planting.read',
    PLANTING_CREATE: 'planting.create',
    PLANTING_UPDATE: 'planting.update',
    PLANTING_DELETE: 'planting.delete',
    PLANTING_EXPORT: 'planting.export',
    VARIETY_READ: 'variety.read',
    ACTIVITY_READ: 'activity.read',
    ACTIVITY_CREATE: 'activity.create',
    ACTIVITY_UPDATE: 'activity.update',
    ACTIVITY_UPDATE_LIMITED: 'activity.update_limited',
    ACTIVITY_DELETE: 'activity.delete',
    HARVEST_READ: 'harvest.read',
    HARVEST_CREATE: 'harvest.create',
    HARVEST_UPDATE: 'harvest.update',
    HARVEST_DELETE: 'harvest.delete',
    HARVEST_EXPORT: 'harvest.export',
    NOTE_READ: 'note.read',
    NOTE_MANAGE: 'note.manage',
    WEATHER_READ: 'weather.read',
    NOTIFICATION_MANAGE_OWN: 'notification.manage_own',
    SESSION_READ_OWN: 'session.read_own',
    SESSION_REVOKE_OWN: 'session.revoke_own',
    ACCOUNT_MANAGE: 'account.manage',
    FARM_LOCATION_MANAGE: 'farm_location.manage',
    BACKUPS_MANAGE: 'backups.manage',
});

const COMMON_READ = Object.freeze([
    CAPABILITIES.DASHBOARD_READ,
    CAPABILITIES.PLANTING_READ,
    CAPABILITIES.VARIETY_READ,
    CAPABILITIES.ACTIVITY_READ,
    CAPABILITIES.ACTIVITY_UPDATE_LIMITED,
    CAPABILITIES.NOTE_READ,
    CAPABILITIES.WEATHER_READ,
    CAPABILITIES.NOTIFICATION_MANAGE_OWN,
    CAPABILITIES.SESSION_READ_OWN,
    CAPABILITIES.SESSION_REVOKE_OWN,
]);

const ROLE_CAPABILITIES = Object.freeze({
    [ROLES.ADMIN]: Object.freeze([
        ...COMMON_READ,
        CAPABILITIES.PLANTING_CREATE,
        CAPABILITIES.PLANTING_UPDATE,
        CAPABILITIES.PLANTING_DELETE,
        CAPABILITIES.PLANTING_EXPORT,
        CAPABILITIES.ACTIVITY_CREATE,
        CAPABILITIES.ACTIVITY_UPDATE,
        CAPABILITIES.ACTIVITY_DELETE,
        CAPABILITIES.HARVEST_READ,
        CAPABILITIES.HARVEST_CREATE,
        CAPABILITIES.HARVEST_UPDATE,
        CAPABILITIES.HARVEST_DELETE,
        CAPABILITIES.HARVEST_EXPORT,
        CAPABILITIES.NOTE_MANAGE,
        CAPABILITIES.ACCOUNT_MANAGE,
        CAPABILITIES.FARM_LOCATION_MANAGE,
        CAPABILITIES.BACKUPS_MANAGE,
    ]),
    [ROLES.SECRETARY]: Object.freeze([
        ...COMMON_READ,
        CAPABILITIES.PLANTING_CREATE,
        CAPABILITIES.PLANTING_UPDATE,
        CAPABILITIES.ACTIVITY_CREATE,
        CAPABILITIES.ACTIVITY_UPDATE,
        CAPABILITIES.HARVEST_READ,
        CAPABILITIES.HARVEST_CREATE,
        CAPABILITIES.HARVEST_UPDATE,
        CAPABILITIES.NOTE_MANAGE,
    ]),
    [ROLES.FARM_WORKER]: COMMON_READ,
});

const normalizeRole = (role) => {
    if (role === 'admin' || role === 'ADMIN') return ROLES.ADMIN;
    if (role === 'SECRETARY') return ROLES.SECRETARY;
    if (role === 'FARM_WORKER') return ROLES.FARM_WORKER;
    return null;
};

const hasCapability = (role, capability) => {
    const normalizedRole = normalizeRole(role);
    return Boolean(
        normalizedRole
        && Object.values(CAPABILITIES).includes(capability)
        && ROLE_CAPABILITIES[normalizedRole].includes(capability)
    );
};

const authorize = (capability) => (req, res, next) => {
    if (!req.user?.id) {
        return res.status(401).json({ message: 'Access denied. User not authenticated.' });
    }

    const normalizedRole = normalizeRole(req.user.role);
    if (!normalizedRole || !hasCapability(normalizedRole, capability)) {
        return res.status(403).json({ message: 'Access denied. Insufficient privilege.' });
    }

    req.user.role = normalizedRole;
    return next();
};

module.exports = {
    ROLES,
    CAPABILITIES,
    ROLE_CAPABILITIES,
    normalizeRole,
    hasCapability,
    authorize,
};
