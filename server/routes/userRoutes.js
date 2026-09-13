const express = require('express');
const {
    listUsers,
    createUser,
    resetPassword,
    disableUser,
    reactivateUser,
    revokeSessions,
    archiveUser
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const {
    validateCreateUser,
    validateAdminSetPassword,
    validateUserId,
    validateEmptyBody
} = require('../middleware/validate');
const { authorize, CAPABILITIES } = require('../security/rbac');

const router = express.Router();

router.use(protect);
router.use(authorize(CAPABILITIES.ACCOUNT_MANAGE));

router.get('/', listUsers);
router.post('/', validateCreateUser, createUser);
router.post('/:id/reset-password', validateUserId, validateAdminSetPassword, resetPassword);
router.patch('/:id/disable', validateUserId, validateEmptyBody, disableUser);
router.patch('/:id/reactivate', validateUserId, validateAdminSetPassword, reactivateUser);
router.patch('/:id/archive', validateUserId, validateEmptyBody, archiveUser);
router.post('/:id/revoke-sessions', validateUserId, validateEmptyBody, revokeSessions);

module.exports = router;
