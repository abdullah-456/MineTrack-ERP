const express = require('express');
const router  = express.Router();
const designationController = require('../controllers/designationController');
const { authenticate, authorize } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

router.use(authenticate);
router.use(auditLog);

router.get('/',      authorize('employees', 'read'),   designationController.list);
router.post('/',     authorize('employees', 'create'), designationController.create);
router.put('/:id',   authorize('employees', 'update'), designationController.update);
router.delete('/:id', authorize('employees', 'delete'), designationController.remove);

module.exports = router;
