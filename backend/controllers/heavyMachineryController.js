const db = require('../models');
const { requireShopId } = require('../utils/shopScope');
const { generateMachineCode } = require('../utils/heavyMachineryHelpers');

const ALLOWED_STATUS = ['active', 'maintenance', 'inactive'];

const MACHINERY_ATTRIBUTES = [
  'id', 'shop_id', 'machine_code', 'name', 'machine_type', 'model', 'manufacturer',
  'capacity', 'fuel_type', 'assigned_branch_id', 'status', 'acquisition_date', 'remarks',
];

async function assertBranchInShop(branchId, shopId, transaction) {
  const branch = await db.Branch.findOne({ where: { id: branchId, shop_id: shopId }, transaction });
  if (!branch) {
    const err = new Error('Mine not found for this shop');
    err.statusCode = 400;
    throw err;
  }
  return branch;
}

// ═══════════════════════════ Machinery Master ══════════════════════════════

exports.listMachinery = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (!req.query.all) where.status = { [db.Sequelize.Op.ne]: 'inactive' };
    if (req.query.branch_id) where.assigned_branch_id = parseInt(req.query.branch_id, 10);
    if (req.query.search) {
      where[db.Sequelize.Op.or] = [
        { name: { [db.Sequelize.Op.iLike]: `%${req.query.search}%` } },
        { machine_code: { [db.Sequelize.Op.iLike]: `%${req.query.search}%` } },
        { machine_type: { [db.Sequelize.Op.iLike]: `%${req.query.search}%` } },
      ];
    }

    const machinery = await db.HeavyMachinery.findAll({
      where,
      attributes: MACHINERY_ATTRIBUTES,
      include: [{ model: db.Branch, as: 'AssignedMine', attributes: ['id', 'name', 'mine_code'] }],
      order: [['name', 'ASC']],
    });

    return res.json({ machinery });
  } catch (error) {
    console.error('listMachinery error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getMachinery = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const machine = await db.HeavyMachinery.findOne({
      where: { id: req.params.id, shop_id: shopId },
      attributes: MACHINERY_ATTRIBUTES,
      include: [{ model: db.Branch, as: 'AssignedMine', attributes: ['id', 'name', 'mine_code'] }],
    });
    if (!machine) return res.status(404).json({ message: 'Machine not found' });

    return res.json({ machine });
  } catch (error) {
    console.error('getMachinery error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.createMachinery = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await t.rollback(); return; }

    const {
      name, machine_type, model, manufacturer, capacity, fuel_type,
      assigned_branch_id, status, acquisition_date, remarks,
    } = req.body;

    if (!name?.trim()) { await t.rollback(); return res.status(400).json({ message: 'Machine name is required' }); }

    const machineStatus = status || 'active';
    if (!ALLOWED_STATUS.includes(machineStatus)) {
      await t.rollback();
      return res.status(400).json({ message: `status must be one of: ${ALLOWED_STATUS.join(', ')}` });
    }

    if (assigned_branch_id) await assertBranchInShop(assigned_branch_id, shopId, t);

    const machine_code = await generateMachineCode(shopId, t);

    const machine = await db.HeavyMachinery.create({
      shop_id: shopId,
      machine_code,
      name: name.trim(),
      machine_type: machine_type || null,
      model: model || null,
      manufacturer: manufacturer || null,
      capacity: capacity || null,
      fuel_type: fuel_type || null,
      assigned_branch_id: assigned_branch_id ? parseInt(assigned_branch_id, 10) : null,
      status: machineStatus,
      acquisition_date: acquisition_date || null,
      remarks: remarks || null,
    }, { transaction: t });

    await t.commit();
    return res.status(201).json({ machine });
  } catch (error) {
    await t.rollback();
    console.error('createMachinery error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateMachinery = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const machine = await db.HeavyMachinery.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!machine) return res.status(404).json({ message: 'Machine not found' });

    const {
      name, machine_type, model, manufacturer, capacity, fuel_type,
      assigned_branch_id, status, acquisition_date, remarks,
    } = req.body;

    if (status !== undefined && !ALLOWED_STATUS.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${ALLOWED_STATUS.join(', ')}` });
    }
    if (assigned_branch_id !== undefined && assigned_branch_id) await assertBranchInShop(assigned_branch_id, shopId);

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ message: 'Machine name is required' });
      machine.name = name.trim();
    }
    if (machine_type !== undefined) machine.machine_type = machine_type || null;
    if (model !== undefined) machine.model = model || null;
    if (manufacturer !== undefined) machine.manufacturer = manufacturer || null;
    if (capacity !== undefined) machine.capacity = capacity || null;
    if (fuel_type !== undefined) machine.fuel_type = fuel_type || null;
    if (assigned_branch_id !== undefined) machine.assigned_branch_id = assigned_branch_id ? parseInt(assigned_branch_id, 10) : null;
    if (status !== undefined) machine.status = status;
    if (acquisition_date !== undefined) machine.acquisition_date = acquisition_date || null;
    if (remarks !== undefined) machine.remarks = remarks || null;
    await machine.save();

    return res.json({ machine });
  } catch (error) {
    console.error('updateMachinery error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.deactivateMachinery = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const machine = await db.HeavyMachinery.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!machine) return res.status(404).json({ message: 'Machine not found' });
    if (machine.status === 'inactive') return res.status(400).json({ message: 'Machine is already inactive' });

    machine.status = 'inactive';
    await machine.save();

    return res.json({ message: 'Machine deactivated', machine });
  } catch (error) {
    console.error('deactivateMachinery error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ═══════════════════════════ Daily Logs ═════════════════════════════════════

const LOG_INCLUDES = [
  { model: db.Branch, attributes: ['id', 'name'] },
  { model: db.Mineral, attributes: ['id', 'name', 'unit'] },
  { model: db.User, attributes: ['id', 'name'] },
];

exports.upsertMachineryLog = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await t.rollback(); return; }

    const machine = await db.HeavyMachinery.findOne({ where: { id: req.params.id, shop_id: shopId }, transaction: t });
    if (!machine) { await t.rollback(); return res.status(404).json({ message: 'Machine not found' }); }

    const {
      log_date, branch_id, working_hours, maintenance_hours,
      fuel_consumed, fuel_cost, mineral_id, production_quantity, production_unit, notes,
    } = req.body;

    if (!log_date) { await t.rollback(); return res.status(400).json({ message: 'log_date is required' }); }

    const resolvedBranchId = branch_id ? parseInt(branch_id, 10) : machine.assigned_branch_id;
    if (!resolvedBranchId) {
      await t.rollback();
      return res.status(400).json({ message: 'This machine has no assigned mine — specify branch_id' });
    }
    await assertBranchInShop(resolvedBranchId, shopId, t);

    let resolvedUnit = production_unit;
    if (mineral_id && !resolvedUnit) {
      const mineral = await db.Mineral.findOne({ where: { id: mineral_id, shop_id: shopId }, transaction: t });
      if (mineral) resolvedUnit = mineral.unit;
    }

    const [log] = await db.HeavyMachineryLog.findOrCreate({
      where: { heavy_machinery_id: machine.id, log_date },
      defaults: {
        shop_id: shopId,
        branch_id: resolvedBranchId,
        working_hours: working_hours || 0,
        maintenance_hours: maintenance_hours || 0,
        fuel_consumed: fuel_consumed || 0,
        fuel_cost: fuel_cost || 0,
        mineral_id: mineral_id || null,
        production_quantity: production_quantity || 0,
        production_unit: resolvedUnit || 'kg',
        notes: notes || null,
        created_by: req.user.id,
      },
      transaction: t,
    });

    log.branch_id = resolvedBranchId;
    if (working_hours !== undefined) log.working_hours = working_hours || 0;
    if (maintenance_hours !== undefined) log.maintenance_hours = maintenance_hours || 0;
    if (fuel_consumed !== undefined) log.fuel_consumed = fuel_consumed || 0;
    if (fuel_cost !== undefined) log.fuel_cost = fuel_cost || 0;
    if (mineral_id !== undefined) log.mineral_id = mineral_id || null;
    if (production_quantity !== undefined) log.production_quantity = production_quantity || 0;
    if (resolvedUnit) log.production_unit = resolvedUnit;
    if (notes !== undefined) log.notes = notes || null;
    await log.save({ transaction: t });

    await t.commit();

    const fullLog = await db.HeavyMachineryLog.findOne({ where: { id: log.id }, include: LOG_INCLUDES });
    return res.status(201).json({ log: fullLog });
  } catch (error) {
    await t.rollback();
    console.error('upsertMachineryLog error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.listMachineryLogs = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const machine = await db.HeavyMachinery.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!machine) return res.status(404).json({ message: 'Machine not found' });

    const where = { heavy_machinery_id: machine.id };
    if (req.query.from || req.query.to) {
      where.log_date = {};
      if (req.query.from) where.log_date[db.Sequelize.Op.gte] = req.query.from;
      if (req.query.to) where.log_date[db.Sequelize.Op.lte] = req.query.to;
    }

    const logs = await db.HeavyMachineryLog.findAll({
      where,
      include: LOG_INCLUDES,
      order: [['log_date', 'DESC']],
    });

    return res.json({ machine, logs });
  } catch (error) {
    console.error('listMachineryLogs error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getMachineryMonthlySummary = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const machine = await db.HeavyMachinery.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!machine) return res.status(404).json({ message: 'Machine not found' });

    const where = { heavy_machinery_id: machine.id };
    if (req.query.year) {
      where.log_date = {
        [db.Sequelize.Op.gte]: `${req.query.year}-01-01`,
        [db.Sequelize.Op.lte]: `${req.query.year}-12-31`,
      };
    }

    const rows = await db.HeavyMachineryLog.findAll({
      where,
      attributes: [
        [db.sequelize.fn('to_char', db.sequelize.col('log_date'), 'YYYY-MM'), 'month'],
        [db.sequelize.fn('SUM', db.sequelize.col('working_hours')), 'working_hours'],
        [db.sequelize.fn('SUM', db.sequelize.col('maintenance_hours')), 'maintenance_hours'],
        [db.sequelize.fn('SUM', db.sequelize.col('fuel_consumed')), 'fuel_consumed'],
        [db.sequelize.fn('SUM', db.sequelize.col('fuel_cost')), 'fuel_cost'],
        [db.sequelize.fn('SUM', db.sequelize.col('production_quantity')), 'production_quantity'],
      ],
      group: [db.sequelize.fn('to_char', db.sequelize.col('log_date'), 'YYYY-MM')],
      order: [[db.sequelize.fn('to_char', db.sequelize.col('log_date'), 'YYYY-MM'), 'DESC']],
      raw: true,
    });

    return res.json({ machine, summary: rows });
  } catch (error) {
    console.error('getMachineryMonthlySummary error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.deleteMachineryLog = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const machine = await db.HeavyMachinery.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!machine) return res.status(404).json({ message: 'Machine not found' });

    const log = await db.HeavyMachineryLog.findOne({ where: { id: req.params.logId, heavy_machinery_id: machine.id } });
    if (!log) return res.status(404).json({ message: 'Log entry not found' });

    await log.destroy();
    return res.json({ message: 'Log entry deleted' });
  } catch (error) {
    console.error('deleteMachineryLog error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.listAllMachineryLogs = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (req.query.branch_id) where.branch_id = parseInt(req.query.branch_id, 10);
    if (req.query.machine_id) where.heavy_machinery_id = parseInt(req.query.machine_id, 10);
    if (req.query.from || req.query.to) {
      where.log_date = {};
      if (req.query.from) where.log_date[db.Sequelize.Op.gte] = req.query.from;
      if (req.query.to) where.log_date[db.Sequelize.Op.lte] = req.query.to;
    }

    const logs = await db.HeavyMachineryLog.findAll({
      where,
      include: [
        { model: db.HeavyMachinery, attributes: ['id', 'machine_code', 'name', 'machine_type'] },
        ...LOG_INCLUDES,
      ],
      order: [['log_date', 'DESC']],
    });

    return res.json({ logs });
  } catch (error) {
    console.error('listAllMachineryLogs error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
