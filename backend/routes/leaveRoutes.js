const express = require('express');
const router  = express.Router();
const leaveController = require('../controllers/leaveController');
const { authenticate, authorize } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

router.use(authenticate);
router.use(auditLog);

router.get('/types',        authorize('leave', 'read'),   leaveController.listTypes);
router.post('/types',       authorize('leave', 'create'), leaveController.createType);
router.put('/types/:id',    authorize('leave', 'update'), leaveController.updateType);
router.delete('/types/:id', authorize('leave', 'delete'), leaveController.removeType);

router.get('/balance',      authorize('leave', 'read'),   leaveController.getBalance);
router.get('/records',      authorize('leave', 'read'),   leaveController.listRecords);
router.post('/records',     authorize('leave', 'create'), leaveController.createRecord);
router.delete('/records/:id', authorize('leave', 'delete'), leaveController.removeRecord);

module.exports = router;
