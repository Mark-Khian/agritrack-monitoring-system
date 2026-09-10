export const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  SECRETARY: 'SECRETARY',
  FARM_WORKER: 'FARM_WORKER',
});

export const CAPABILITIES = Object.freeze({
  DASHBOARD_READ: 'dashboard.read',
  PLANTING_READ: 'planting.read',
  PLANTING_CREATE: 'planting.create',
  PLANTING_UPDATE: 'planting.update',
  PLANTING_DELETE: 'planting.delete',
  PLANTING_EXPORT: 'planting.export',
  ACTIVITY_READ: 'activity.read',
  ACTIVITY_CREATE: 'activity.create',
  ACTIVITY_UPDATE: 'activity.update',
  ACTIVITY_UPDATE_LIMITED: 'activity.update_limited',
  HARVEST_READ: 'harvest.read',
  HARVEST_CREATE: 'harvest.create',
  HARVEST_UPDATE: 'harvest.update',
  HARVEST_DELETE: 'harvest.delete',
  HARVEST_EXPORT: 'harvest.export',
  CALENDAR_READ: 'calendar.read',
  NOTE_MANAGE: 'note.manage',
  ANALYTICS_READ: 'analytics.read',
  FARM_LOCATION_MANAGE: 'farm_location.manage',
  ACCOUNT_MANAGE: 'account.manage',
  AUDIT_READ: 'audit.read',
});

const COMMON = Object.freeze([
  CAPABILITIES.DASHBOARD_READ,
  CAPABILITIES.PLANTING_READ,
  CAPABILITIES.ACTIVITY_READ,
  CAPABILITIES.ACTIVITY_UPDATE_LIMITED,
  CAPABILITIES.CALENDAR_READ,
]);

const ROLE_CAPABILITIES = Object.freeze({
  [ROLES.ADMIN]: Object.freeze([
    ...COMMON,
    CAPABILITIES.PLANTING_CREATE,
    CAPABILITIES.PLANTING_UPDATE,
    CAPABILITIES.PLANTING_DELETE,
    CAPABILITIES.PLANTING_EXPORT,
    CAPABILITIES.ACTIVITY_CREATE,
    CAPABILITIES.ACTIVITY_UPDATE,
    CAPABILITIES.HARVEST_READ,
    CAPABILITIES.HARVEST_CREATE,
    CAPABILITIES.HARVEST_UPDATE,
    CAPABILITIES.HARVEST_DELETE,
    CAPABILITIES.HARVEST_EXPORT,
    CAPABILITIES.NOTE_MANAGE,
    CAPABILITIES.ANALYTICS_READ,
    CAPABILITIES.FARM_LOCATION_MANAGE,
    CAPABILITIES.ACCOUNT_MANAGE,
    CAPABILITIES.AUDIT_READ,
  ]),
  [ROLES.SECRETARY]: Object.freeze([
    ...COMMON,
    CAPABILITIES.PLANTING_CREATE,
    CAPABILITIES.PLANTING_UPDATE,
    CAPABILITIES.ACTIVITY_CREATE,
    CAPABILITIES.ACTIVITY_UPDATE,
    CAPABILITIES.HARVEST_READ,
    CAPABILITIES.HARVEST_CREATE,
    CAPABILITIES.HARVEST_UPDATE,
    CAPABILITIES.NOTE_MANAGE,
    CAPABILITIES.ANALYTICS_READ,
  ]),
  [ROLES.FARM_WORKER]: COMMON,
});

export const normalizeRole = (role) => {
  if (role === 'admin' || role === 'ADMIN') return ROLES.ADMIN;
  if (role === 'SECRETARY') return ROLES.SECRETARY;
  if (role === 'FARM_WORKER') return ROLES.FARM_WORKER;
  return null;
};

export const hasCapability = (role, capability) => {
  const normalizedRole = normalizeRole(role);
  return Boolean(normalizedRole && ROLE_CAPABILITIES[normalizedRole]?.includes(capability));
};
