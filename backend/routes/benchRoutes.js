const express = require('express');
const router  = express.Router();
const benchController = require('../controllers/benchController');
const { authenticate, authorize } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

router.use(authenticate);
router.use(auditLog);

router.get('/',      authorize('branches', 'read'),   benchController.listBenches);
router.get('/:id',   authorize('branches', 'read'),   benchController.getBench);
router.post('/',     authorize('branches', 'create'), benchController.createBench);
router.put('/:id',   authorize('branches', 'update'), benchController.updateBench);
router.delete('/:id', authorize('branches', 'delete'), benchController.removeBench);

module.exports = router;
