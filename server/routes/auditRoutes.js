const express = require('express');
const router = express.Router();
const { listAuditLogs } = require('../controllers/auditController');
const { protect } = require('../middleware/authMiddleware');
const { authorize, CAPABILITIES } = require('../security/rbac');

router.get('/', protect, authorize(CAPABILITIES.AUDIT_READ), listAuditLogs);

module.exports = router;
