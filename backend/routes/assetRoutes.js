const express = require('express');
const router  = express.Router();
const assetController = require('../controllers/assetController');
const documentController = require('../controllers/documentController');
const { authenticate, authorize } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');
const loadOwner = require('../middleware/loadOwner');
const { documentUpload } = require('../utils/documentUploads');

router.use(authenticate);
router.use(auditLog);

router.get('/categories', authorize('assets', 'read'),   assetController.listCategories);
router.get('/',           authorize('assets', 'read'),   assetController.list);
router.get('/:id',        authorize('assets', 'read'),   assetController.get);
router.post('/',          authorize('assets', 'create'), assetController.create);
router.put('/:id',        authorize('assets', 'update'), assetController.update);
router.post('/:id/dispose', authorize('assets', 'update'), assetController.dispose);
router.delete('/:id',     authorize('assets', 'delete'), assetController.remove);

router.get(   '/:id/documents',             authorize('documents', 'read'),   loadOwner('asset'), documentController.listDocuments);
router.post(  '/:id/documents',             authorize('documents', 'create'), loadOwner('asset'), documentUpload.single('file'), documentController.uploadDocument);
router.get(   '/:id/documents/:docId/file', authorize('documents', 'read'),   loadOwner('asset'), documentController.getDocumentFile);
router.delete('/:id/documents/:docId',      authorize('documents', 'delete'), loadOwner('asset'), documentController.deleteDocument);

module.exports = router;
