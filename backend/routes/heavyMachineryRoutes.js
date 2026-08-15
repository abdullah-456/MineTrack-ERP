const express = require('express');
const router = express.Router();
const heavyMachineryController = require('../controllers/heavyMachineryController');
const { authenticate, authorize } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

router.use(authenticate);
router.use(auditLog);

// Cross-machine log feed (must come before the "/:id" routes so "logs" isn't
// swallowed as a machine id)
router.get('/logs', authorize('heavy_machinery', 'read'), heavyMachineryController.listAllMachineryLogs);

router.get('/', authorize('heavy_machinery', 'read'), heavyMachineryController.listMachinery);
router.get('/:id', authorize('heavy_machinery', 'read'), heavyMachineryController.getMachinery);
router.post('/', authorize('heavy_machinery', 'create'), heavyMachineryController.createMachinery);
router.put('/:id', authorize('heavy_machinery', 'update'), heavyMachineryController.updateMachinery);
router.delete('/:id', authorize('heavy_machinery', 'delete'), heavyMachineryController.deactivateMachinery);

router.get('/:id/logs', authorize('heavy_machinery', 'read'), heavyMachineryController.listMachineryLogs);
router.post('/:id/logs', authorize('heavy_machinery', 'update'), heavyMachineryController.upsertMachineryLog);
router.get('/:id/logs/summary', authorize('heavy_machinery', 'read'), heavyMachineryController.getMachineryMonthlySummary);
router.delete('/:id/logs/:logId', authorize('heavy_machinery', 'update'), heavyMachineryController.deleteMachineryLog);

module.exports = router;
