const express = require('express');
const {
    listUsers,
    createUser,
    resetPassword,
    disableUser,
    reactivateUser,
    revokeSessions
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const {
    validateCreateUser,
    validateUserId,
    validateEmptyBody
} = require('../middleware/validate');
const { authorize, CAPABILITIES } = require('../security/rbac');

const router = express.Router();

router.use(protect);
router.use(authorize(CAPABILITIES.ACCOUNT_MANAGE));

router.get('/', listUsers);
router.post('/', validateCreateUser, createUser);
router.post('/:id/reset-password', validateUserId, validateEmptyBody, resetPassword);
router.patch('/:id/disable', validateUserId, validateEmptyBody, disableUser);
router.patch('/:id/reactivate', validateUserId, validateEmptyBody, reactivateUser);
router.post('/:id/revoke-sessions', validateUserId, validateEmptyBody, revokeSessions);

module.exports = router;
