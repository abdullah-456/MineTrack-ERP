const express = require('express');
const router  = express.Router();
const truckLoadingController = require('../controllers/truckLoadingController');
const { authenticate, authorize } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

router.use(authenticate);
router.use(auditLog);

// Before '/:id' so 'commission'/'employees' are never parsed as a log id.
router.get('/commission', authorize('truck_loading', 'read'),   truckLoadingController.commissionPreview);
router.get('/employees',  authorize('truck_loading', 'read'),   truckLoadingController.roster);
router.get('/',           authorize('truck_loading', 'read'),   truckLoadingController.list);
router.get('/:id',        authorize('truck_loading', 'read'),   truckLoadingController.get);
router.post('/',          authorize('truck_loading', 'create'), truckLoadingController.create);
router.put('/:id',        authorize('truck_loading', 'update'), truckLoadingController.update);
router.delete('/:id',     authorize('truck_loading', 'delete'), truckLoadingController.remove);

module.exports = router;
