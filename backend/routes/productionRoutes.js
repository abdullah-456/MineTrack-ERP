const express = require('express');
const router  = express.Router();
const productionController = require('../controllers/productionController');
const { authenticate, authorize } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

router.use(authenticate);
router.use(auditLog);

router.get('/stats',  authorize('branches', 'read'),   productionController.stats);
router.get('/',       authorize('branches', 'read'),   productionController.list);
router.get('/:id',    authorize('branches', 'read'),   productionController.get);
router.post('/',      authorize('branches', 'create'), productionController.create);
router.put('/:id',    authorize('branches', 'update'), productionController.update);
router.delete('/:id', authorize('branches', 'delete'), productionController.remove);

module.exports = router;
