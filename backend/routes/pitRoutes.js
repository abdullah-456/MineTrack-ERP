const express = require('express');
const router  = express.Router();
const pitController = require('../controllers/pitController');
const { authenticate, authorize } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

router.use(authenticate);
router.use(auditLog);

router.get('/',      authorize('branches', 'read'),   pitController.listPits);
router.get('/:id',   authorize('branches', 'read'),   pitController.getPit);
router.post('/',     authorize('branches', 'create'), pitController.createPit);
router.put('/:id',   authorize('branches', 'update'), pitController.updatePit);
router.delete('/:id', authorize('branches', 'delete'), pitController.removePit);

module.exports = router;
