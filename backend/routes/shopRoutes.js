const express = require('express');
const router  = express.Router();
const shopController = require('../controllers/shopController');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

// All shop routes require authentication + SuperAdmin role
router.use(authenticate, requireSuperAdmin);

router.get('/stats',   shopController.getPlatformStats);
router.get('/',        shopController.listShops);
router.get('/:id',     shopController.getShop);
router.post('/',       shopController.createShop);
router.put('/:id',     shopController.updateShop);
router.delete('/:id',  shopController.deleteShop);
router.post('/:id/activate', shopController.activateShop);

module.exports = router;
