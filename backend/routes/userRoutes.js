const express = require('express');
const router  = express.Router();
const userController = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

// All user routes require authentication
router.use(authenticate);
router.use(auditLog);

router.get( '/roles',              userController.listRoles);
router.get( '/',                   authorize('users', 'read'),   userController.listUsers);
router.get( '/:id',                authorize('users', 'read'),   userController.getUser);
router.post('/',                   authorize('users', 'create'), userController.createUser);
router.put( '/:id',                authorize('users', 'update'), userController.updateUser);
router.post('/:id/suspend',        authorize('users', 'delete'), userController.suspendUser);
router.post('/:id/activate',       authorize('users', 'update'), userController.activateUser);
router.delete('/:id',              authorize('users', 'delete'), userController.deleteUser);
router.post('/:id/reset-password', authorize('users', 'update'), userController.resetPassword);

module.exports = router;
