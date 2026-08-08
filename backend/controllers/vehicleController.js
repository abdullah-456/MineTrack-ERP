const db = require('../models');
const { requireShopId } = require('../utils/shopScope');

const ALLOWED_STATUS = ['active', 'maintenance', 'inactive'];

const VEHICLE_ATTRIBUTES = [
  'id', 'shop_id', 'vehicle_number', 'vehicle_type', 'owner_name', 'assigned_branch_id',
  'registration_expiry', 'insurance_expiry', 'status', 'remarks',
];

// ── GET /api/vehicles ────────────────────────────────────────────────────────
exports.listVehicles = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (!req.query.all) where.status = { [db.Sequelize.Op.ne]: 'inactive' };
    if (req.query.branch_id) where.assigned_branch_id = parseInt(req.query.branch_id, 10);

    const vehicles = await db.Vehicle.findAll({
      where,
      attributes: VEHICLE_ATTRIBUTES,
      include: [{ model: db.Branch, as: 'AssignedMine', attributes: ['id', 'name', 'mine_code'] }],
      order: [['vehicle_number', 'ASC']],
    });

    return res.json({ vehicles });
  } catch (error) {
    console.error('listVehicles error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/vehicles/:id ────────────────────────────────────────────────────
exports.getVehicle = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const vehicle = await db.Vehicle.findOne({
      where: { id: req.params.id, shop_id: shopId },
      attributes: VEHICLE_ATTRIBUTES,
      include: [{ model: db.Branch, as: 'AssignedMine', attributes: ['id', 'name', 'mine_code'] }],
    });
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });

    return res.json({ vehicle });
  } catch (error) {
    console.error('getVehicle error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// A vehicle's assigned mine must belong to the same shop, same guard pits use
// for their parent mine.
async function assertBranchInShop(branchId, shopId, transaction) {
  const branch = await db.Branch.findOne({ where: { id: branchId, shop_id: shopId }, transaction });
  if (!branch) {
    const err = new Error('Mine not found for this shop');
    err.statusCode = 400;
    throw err;
  }
}

// ── POST /api/vehicles ───────────────────────────────────────────────────────
exports.createVehicle = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const {
      vehicle_number, vehicle_type, owner_name, assigned_branch_id,
      registration_expiry, insurance_expiry, status, remarks,
    } = req.body;

    if (!vehicle_number?.trim()) return res.status(400).json({ message: 'Vehicle number is required' });

    const vehicleStatus = status || 'active';
    if (!ALLOWED_STATUS.includes(vehicleStatus)) {
      return res.status(400).json({ message: `status must be one of: ${ALLOWED_STATUS.join(', ')}` });
    }

    if (assigned_branch_id) await assertBranchInShop(assigned_branch_id, shopId);

    const existing = await db.Vehicle.findOne({ where: { shop_id: shopId, vehicle_number: vehicle_number.trim() } });
    if (existing) return res.status(400).json({ message: 'A vehicle with this number already exists' });

    const vehicle = await db.Vehicle.create({
      shop_id: shopId,
      vehicle_number: vehicle_number.trim(),
      vehicle_type: vehicle_type || null,
      owner_name: owner_name || null,
      assigned_branch_id: assigned_branch_id ? parseInt(assigned_branch_id, 10) : null,
      registration_expiry: registration_expiry || null,
      insurance_expiry: insurance_expiry || null,
      status: vehicleStatus,
      remarks: remarks || null,
    });

    return res.status(201).json({ vehicle });
  } catch (error) {
    console.error('createVehicle error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PUT /api/vehicles/:id ────────────────────────────────────────────────────
exports.updateVehicle = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const vehicle = await db.Vehicle.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });

    const {
      vehicle_number, vehicle_type, owner_name, assigned_branch_id,
      registration_expiry, insurance_expiry, status, remarks,
    } = req.body;

    if (status !== undefined && !ALLOWED_STATUS.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${ALLOWED_STATUS.join(', ')}` });
    }
    if (assigned_branch_id !== undefined && assigned_branch_id) await assertBranchInShop(assigned_branch_id, shopId);

    if (vehicle_number !== undefined) {
      if (!vehicle_number.trim()) return res.status(400).json({ message: 'Vehicle number is required' });
      const existing = await db.Vehicle.findOne({
        where: { shop_id: shopId, vehicle_number: vehicle_number.trim(), id: { [db.Sequelize.Op.ne]: vehicle.id } },
      });
      if (existing) return res.status(400).json({ message: 'A vehicle with this number already exists' });
      vehicle.vehicle_number = vehicle_number.trim();
    }
    if (vehicle_type !== undefined) vehicle.vehicle_type = vehicle_type || null;
    if (owner_name !== undefined) vehicle.owner_name = owner_name || null;
    if (assigned_branch_id !== undefined) vehicle.assigned_branch_id = assigned_branch_id ? parseInt(assigned_branch_id, 10) : null;
    if (registration_expiry !== undefined) vehicle.registration_expiry = registration_expiry || null;
    if (insurance_expiry !== undefined) vehicle.insurance_expiry = insurance_expiry || null;
    if (status !== undefined) vehicle.status = status;
    if (remarks !== undefined) vehicle.remarks = remarks || null;
    await vehicle.save();

    return res.json({ vehicle });
  } catch (error) {
    console.error('updateVehicle error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── DELETE /api/vehicles/:id — Mark inactive (soft delete) ──────────────────
exports.removeVehicle = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const vehicle = await db.Vehicle.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });
    if (vehicle.status === 'inactive') return res.status(400).json({ message: 'Vehicle is already inactive' });

    vehicle.status = 'inactive';
    await vehicle.save();

    return res.json({ message: 'Vehicle deactivated', vehicle });
  } catch (error) {
    console.error('removeVehicle error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
