const express = require('express');
const router  = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticate, authorize } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

router.use(authenticate);
router.use(auditLog);

router.get('/',              authorize('notifications', 'read'),   notificationController.list);
router.get('/count',         authorize('notifications', 'read'),   notificationController.count);
router.put('/mark-all-read', authorize('notifications', 'update'), notificationController.markAllRead);
router.put('/:id/read',      authorize('notifications', 'update'), notificationController.markRead);

module.exports = router;
