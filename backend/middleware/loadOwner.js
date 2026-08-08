'use strict';

const db = require('../models');
const { requireShopId } = require('../utils/shopScope');

// Maps a document owner_type to the model that owns it. Mine keeps its
// internal 'branch' naming (per the app-wide convention: UI says Mine, code
// says Branch) rather than a UI-facing 'mine' key.
const OWNER_MODELS = {
  branch: 'Branch',
  supplier: 'Supplier',
  customer: 'Customer',
  board_member: 'BoardMember',
  vehicle: 'Vehicle',
};

// Generic version of loadEmployee.js — resolves req.params.id to a
// shop-scoped owner record (or, for 'shop', the shop itself with no :id
// param) and attaches it as req.owner/req.ownerType, so the document
// routes/controller can stay agnostic of which entity they're attaching to.
module.exports = function loadOwner(ownerType) {
  return async (req, res, next) => {
    try {
      const shopId = requireShopId(req, res);
      if (!shopId) return;

      if (ownerType === 'shop') {
        req.owner = { id: shopId, shop_id: shopId };
        req.ownerType = 'shop';
        return next();
      }

      const modelName = OWNER_MODELS[ownerType];
      if (!modelName) return res.status(400).json({ message: `Unknown owner type: ${ownerType}` });

      const owner = await db[modelName].findOne({ where: { id: req.params.id, shop_id: shopId } });
      if (!owner) return res.status(404).json({ message: 'Record not found' });

      req.owner = owner;
      req.ownerType = ownerType;
      next();
    } catch (error) {
      console.error('loadOwner error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
};
