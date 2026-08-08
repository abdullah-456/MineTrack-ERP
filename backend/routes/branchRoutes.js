const express = require('express');
const router  = express.Router();
const branchController = require('../controllers/branchController');
const documentController = require('../controllers/documentController');
const { authenticate, authorize } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');
const loadOwner = require('../middleware/loadOwner');
const { documentUpload } = require('../utils/documentUploads');

router.use(authenticate);
router.use(auditLog);

router.get('/shops', authorize('users', 'read'), branchController.listShopsForPicker);
router.get('/next-code', authorize('branches', 'create'), branchController.getNextMineCode);
router.get('/',     authorize('branches', 'read'),   branchController.listBranches);
router.get('/:id',  authorize('branches', 'read'),   branchController.getBranch);
router.post('/',    authorize('branches', 'create'), branchController.createBranch);
router.put('/:id',  authorize('branches', 'update'), branchController.updateBranch);
router.delete('/:id', authorize('branches', 'delete'), branchController.removeBranch);

router.get(   '/:id/documents',           authorize('documents', 'read'),   loadOwner('branch'), documentController.listDocuments);
router.post(  '/:id/documents',           authorize('documents', 'create'), loadOwner('branch'), documentUpload.single('file'), documentController.uploadDocument);
router.get(   '/:id/documents/:docId/file', authorize('documents', 'read'), loadOwner('branch'), documentController.getDocumentFile);
router.delete('/:id/documents/:docId',    authorize('documents', 'delete'), loadOwner('branch'), documentController.deleteDocument);

module.exports = router;
