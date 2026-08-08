const express = require('express');
const router  = express.Router();
const vehicleController = require('../controllers/vehicleController');
const documentController = require('../controllers/documentController');
const { authenticate, authorize } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');
const loadOwner = require('../middleware/loadOwner');
const { documentUpload } = require('../utils/documentUploads');

router.use(authenticate);
router.use(auditLog);

router.get('/',      authorize('vehicles', 'read'),   vehicleController.listVehicles);
router.get('/:id',   authorize('vehicles', 'read'),   vehicleController.getVehicle);
router.post('/',     authorize('vehicles', 'create'), vehicleController.createVehicle);
router.put('/:id',   authorize('vehicles', 'update'), vehicleController.updateVehicle);
router.delete('/:id', authorize('vehicles', 'delete'), vehicleController.removeVehicle);

router.get(   '/:id/documents',           authorize('documents', 'read'),   loadOwner('vehicle'), documentController.listDocuments);
router.post(  '/:id/documents',           authorize('documents', 'create'), loadOwner('vehicle'), documentUpload.single('file'), documentController.uploadDocument);
router.get(   '/:id/documents/:docId/file', authorize('documents', 'read'), loadOwner('vehicle'), documentController.getDocumentFile);
router.delete('/:id/documents/:docId',    authorize('documents', 'delete'), loadOwner('vehicle'), documentController.deleteDocument);

module.exports = router;
