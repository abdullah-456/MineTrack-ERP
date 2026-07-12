const express = require('express');
const router  = express.Router();
const branchController = require('../controllers/branchController');
const { authenticate, authorize } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

router.use(authenticate);
router.use(auditLog);

router.get('/shops', authorize('users', 'read'), branchController.listShopsForPicker);
router.get('/',     authorize('branches', 'read'),   branchController.listBranches);
router.post('/',    authorize('branches', 'create'), branchController.createBranch);
router.put('/:id',  authorize('branches', 'update'), branchController.updateBranch);
router.delete('/:id', authorize('branches', 'delete'), branchController.removeBranch);

module.exports = router;
