const express = require('express');
const router  = express.Router();
const mineralController = require('../controllers/mineralController');
const { authenticate, authorize } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

router.use(authenticate);
router.use(auditLog);

router.get('/',      authorize('branches', 'read'),   mineralController.list);
router.post('/',     authorize('branches', 'create'), mineralController.create);
router.put('/:id',   authorize('branches', 'update'), mineralController.update);
router.delete('/:id', authorize('branches', 'delete'), mineralController.remove);

module.exports = router;
