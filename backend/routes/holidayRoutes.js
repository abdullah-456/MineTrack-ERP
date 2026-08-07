const express = require('express');
const router  = express.Router();
const holidayController = require('../controllers/holidayController');
const { authenticate, authorize } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

router.use(authenticate);
router.use(auditLog);

router.get('/',      authorize('holidays', 'read'),   holidayController.list);
router.post('/',     authorize('holidays', 'create'), holidayController.create);
router.put('/:id',   authorize('holidays', 'update'), holidayController.update);
router.delete('/:id', authorize('holidays', 'delete'), holidayController.remove);

module.exports = router;
