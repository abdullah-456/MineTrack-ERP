const express = require('express');
const router  = express.Router();
const branchController = require('../controllers/branchController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

router.get('/shops', authorize('users', 'read'), branchController.listShopsForPicker);
router.get('/',     authorize('users', 'read'), branchController.listBranches);

module.exports = router;
