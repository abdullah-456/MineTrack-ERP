const express = require('express');
const router = express.Router();
const workshopController = require('../controllers/workshopController');
const { authenticate, authorize } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

router.use(authenticate);
router.use(auditLog);

// Items
router.get('/items', authorize('workshops', 'read'), workshopController.listWorkshopItems);
router.get('/items/:id', authorize('workshops', 'read'), workshopController.getWorkshopItem);
router.post('/items', authorize('workshops', 'create'), workshopController.createWorkshopItem);
router.put('/items/:id', authorize('workshops', 'update'), workshopController.updateWorkshopItem);
router.delete('/items/:id', authorize('workshops', 'delete'), workshopController.deactivateWorkshopItem);

// Stock
router.get('/stock', authorize('workshops', 'read'), workshopController.getWorkshopStockLevels);
router.post('/stock/receive', authorize('workshops', 'create'), workshopController.addWorkshopStock);
router.get('/stock/ledger', authorize('workshops', 'read'), workshopController.getWorkshopStockLedger);

// Jobs
router.get('/jobs', authorize('workshops', 'read'), workshopController.listWorkshopJobs);
router.get('/jobs/:id', authorize('workshops', 'read'), workshopController.getWorkshopJob);
router.post('/jobs', authorize('workshops', 'create'), workshopController.createWorkshopJob);
router.put('/jobs/:id', authorize('workshops', 'update'), workshopController.updateWorkshopJob);
router.post('/jobs/:id/items', authorize('workshops', 'update'), workshopController.addWorkshopJobItem);
router.delete('/jobs/:id/items/:itemId', authorize('workshops', 'update'), workshopController.removeWorkshopJobItem);
router.post('/jobs/:id/complete', authorize('workshops', 'update'), workshopController.completeWorkshopJob);
router.post('/jobs/:id/cancel', authorize('workshops', 'update'), workshopController.cancelWorkshopJob);

module.exports = router;
