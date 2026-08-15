const db = require('../models');
const { requireShopId } = require('../utils/shopScope');
const {
  generateWorkshopItemCode,
  generateWorkshopJobNumber,
  receiveWorkshopStock,
  consumeWorkshopStock,
  reverseWorkshopStock,
  round2,
} = require('../utils/workshopHelpers');

const ALLOWED_ITEM_STATUS = ['active', 'inactive'];

async function assertBranchInShop(branchId, shopId, transaction) {
  const branch = await db.Branch.findOne({ where: { id: branchId, shop_id: shopId }, transaction });
  if (!branch) {
    const err = new Error('Mine not found for this shop');
    err.statusCode = 400;
    throw err;
  }
  return branch;
}

async function assertVehicleInShop(vehicleId, shopId, transaction) {
  const vehicle = await db.Vehicle.findOne({ where: { id: vehicleId, shop_id: shopId }, transaction });
  if (!vehicle) {
    const err = new Error('Vehicle not found for this shop');
    err.statusCode = 400;
    throw err;
  }
  return vehicle;
}

// ═══════════════════════════ Workshop Items ═══════════════════════════════

exports.listWorkshopItems = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (!req.query.all) where.status = { [db.Sequelize.Op.ne]: 'inactive' };
    if (req.query.category) where.category = req.query.category;
    if (req.query.search) {
      where[db.Sequelize.Op.or] = [
        { name: { [db.Sequelize.Op.iLike]: `%${req.query.search}%` } },
        { item_code: { [db.Sequelize.Op.iLike]: `%${req.query.search}%` } },
      ];
    }

    const stockInclude = {
      model: db.WorkshopStock,
      attributes: ['id', 'branch_id', 'quantity_on_hand', 'avg_cost'],
      include: [{ model: db.Branch, attributes: ['id', 'name'] }],
      required: false,
    };
    if (req.query.branch_id) stockInclude.where = { branch_id: parseInt(req.query.branch_id, 10) };

    const items = await db.WorkshopItem.findAll({
      where,
      include: [stockInclude],
      order: [['name', 'ASC']],
    });

    return res.json({ items });
  } catch (error) {
    console.error('listWorkshopItems error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getWorkshopItem = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const item = await db.WorkshopItem.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: [{
        model: db.WorkshopStock,
        attributes: ['id', 'branch_id', 'quantity_on_hand', 'avg_cost'],
        include: [{ model: db.Branch, attributes: ['id', 'name'] }],
      }],
    });
    if (!item) return res.status(404).json({ message: 'Workshop item not found' });

    return res.json({ item });
  } catch (error) {
    console.error('getWorkshopItem error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.createWorkshopItem = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await t.rollback(); return; }

    const { name, unit, category, unit_price, remarks } = req.body;
    if (!name?.trim()) { await t.rollback(); return res.status(400).json({ message: 'Item name is required' }); }
    if (!unit?.trim()) { await t.rollback(); return res.status(400).json({ message: 'Unit is required' }); }

    const item_code = await generateWorkshopItemCode(shopId, t);

    const item = await db.WorkshopItem.create({
      shop_id: shopId,
      item_code,
      name: name.trim(),
      unit: unit.trim(),
      category: category || null,
      unit_price: round2(unit_price || 0),
      status: 'active',
      remarks: remarks || null,
    }, { transaction: t });

    await t.commit();
    return res.status(201).json({ item });
  } catch (error) {
    await t.rollback();
    console.error('createWorkshopItem error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateWorkshopItem = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const item = await db.WorkshopItem.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!item) return res.status(404).json({ message: 'Workshop item not found' });

    const { name, unit, category, unit_price, status, remarks } = req.body;

    if (status !== undefined && !ALLOWED_ITEM_STATUS.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${ALLOWED_ITEM_STATUS.join(', ')}` });
    }
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ message: 'Item name is required' });
      item.name = name.trim();
    }
    if (unit !== undefined) {
      if (!unit.trim()) return res.status(400).json({ message: 'Unit is required' });
      item.unit = unit.trim();
    }
    if (category !== undefined) item.category = category || null;
    if (unit_price !== undefined) item.unit_price = round2(unit_price || 0);
    if (status !== undefined) item.status = status;
    if (remarks !== undefined) item.remarks = remarks || null;
    await item.save();

    return res.json({ item });
  } catch (error) {
    console.error('updateWorkshopItem error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.deactivateWorkshopItem = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const item = await db.WorkshopItem.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!item) return res.status(404).json({ message: 'Workshop item not found' });
    if (item.status === 'inactive') return res.status(400).json({ message: 'Item is already inactive' });

    item.status = 'inactive';
    await item.save();

    return res.json({ message: 'Workshop item deactivated', item });
  } catch (error) {
    console.error('deactivateWorkshopItem error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ═══════════════════════════ Workshop Stock ═══════════════════════════════

exports.getWorkshopStockLevels = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = {};
    if (req.query.branch_id) where.branch_id = parseInt(req.query.branch_id, 10);
    if (req.query.workshop_item_id) where.workshop_item_id = parseInt(req.query.workshop_item_id, 10);

    const stock = await db.WorkshopStock.findAll({
      where,
      include: [
        { model: db.WorkshopItem, where: { shop_id: shopId }, attributes: ['id', 'item_code', 'name', 'unit', 'category'] },
        { model: db.Branch, attributes: ['id', 'name'] },
      ],
      order: [[db.WorkshopItem, 'name', 'ASC']],
    });

    return res.json({ stock });
  } catch (error) {
    console.error('getWorkshopStockLevels error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.addWorkshopStock = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await t.rollback(); return; }

    const { workshop_item_id, branch_id, quantity, unit_cost, note } = req.body;
    if (!workshop_item_id || !branch_id) {
      await t.rollback();
      return res.status(400).json({ message: 'workshop_item_id and branch_id are required' });
    }

    const result = await receiveWorkshopStock({
      shopId,
      workshopItemId: parseInt(workshop_item_id, 10),
      branchId: parseInt(branch_id, 10),
      quantity,
      unitCost: unit_cost,
      note,
      userId: req.user.id,
      transaction: t,
    });

    await t.commit();
    return res.status(201).json({ stock: result.stock, movement: result.movement });
  } catch (error) {
    await t.rollback();
    console.error('addWorkshopStock error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getWorkshopStockLedger = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { workshop_item_id, branch_id } = req.query;
    if (!workshop_item_id) return res.status(400).json({ message: 'workshop_item_id is required' });

    const item = await db.WorkshopItem.findOne({ where: { id: workshop_item_id, shop_id: shopId } });
    if (!item) return res.status(404).json({ message: 'Workshop item not found' });

    const where = { workshop_item_id: item.id };
    if (branch_id) where.branch_id = parseInt(branch_id, 10);

    const movements = await db.WorkshopStockMovement.findAll({
      where,
      include: [
        { model: db.Branch, attributes: ['id', 'name'] },
        { model: db.User, attributes: ['id', 'name'] },
      ],
      order: [['id', 'ASC']],
    });

    return res.json({ item, movements });
  } catch (error) {
    console.error('getWorkshopStockLedger error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ═══════════════════════════ Workshop Jobs ═════════════════════════════════

const JOB_INCLUDES = [
  { model: db.Shop, attributes: ['id', 'name', 'owner_name', 'email', 'phone', 'address', 'logo_url'] },
  { model: db.Branch, attributes: ['id', 'name', 'mine_code'] },
  { model: db.Vehicle, attributes: ['id', 'vehicle_number', 'vehicle_type'] },
  { model: db.Employee, attributes: ['id', 'name'] },
  {
    model: db.WorkshopJobItem,
    include: [{ model: db.WorkshopItem, attributes: ['id', 'item_code', 'name', 'unit'] }],
  },
];

exports.listWorkshopJobs = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (req.query.branch_id) where.branch_id = parseInt(req.query.branch_id, 10);
    if (req.query.vehicle_id) where.vehicle_id = parseInt(req.query.vehicle_id, 10);
    if (req.query.status) where.status = req.query.status;
    if (req.query.from || req.query.to) {
      where.date_in = {};
      if (req.query.from) where.date_in[db.Sequelize.Op.gte] = req.query.from;
      if (req.query.to) where.date_in[db.Sequelize.Op.lte] = req.query.to;
    }
    if (req.query.search) {
      where.job_number = { [db.Sequelize.Op.iLike]: `%${req.query.search}%` };
    }

    const jobs = await db.WorkshopJob.findAll({
      where,
      include: [
        { model: db.Branch, attributes: ['id', 'name'] },
        { model: db.Vehicle, attributes: ['id', 'vehicle_number', 'vehicle_type'] },
        { model: db.Employee, attributes: ['id', 'name'] },
      ],
      order: [['id', 'DESC']],
    });

    return res.json({ jobs });
  } catch (error) {
    console.error('listWorkshopJobs error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getWorkshopJob = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const job = await db.WorkshopJob.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: JOB_INCLUDES,
    });
    if (!job) return res.status(404).json({ message: 'Workshop job not found' });

    return res.json({ job });
  } catch (error) {
    console.error('getWorkshopJob error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.createWorkshopJob = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await t.rollback(); return; }

    const {
      branch_id, vehicle_id, employee_id, mechanic_name,
      date_in, odometer_reading, work_description, labor_cost, notes, items,
    } = req.body;

    if (!branch_id) { await t.rollback(); return res.status(400).json({ message: 'Mine is required' }); }
    if (!vehicle_id) { await t.rollback(); return res.status(400).json({ message: 'Vehicle is required' }); }
    if (!date_in) { await t.rollback(); return res.status(400).json({ message: 'Date in is required' }); }

    await assertBranchInShop(branch_id, shopId, t);
    await assertVehicleInShop(vehicle_id, shopId, t);

    const job_number = await generateWorkshopJobNumber(shopId, t);
    const laborCost = round2(labor_cost || 0);

    const job = await db.WorkshopJob.create({
      shop_id: shopId,
      job_number,
      branch_id: parseInt(branch_id, 10),
      vehicle_id: parseInt(vehicle_id, 10),
      employee_id: employee_id ? parseInt(employee_id, 10) : null,
      mechanic_name: mechanic_name || null,
      date_in,
      status: 'in_progress',
      odometer_reading: odometer_reading || null,
      work_description: work_description || null,
      labor_cost: laborCost,
      parts_cost: 0,
      total_cost: laborCost,
      notes: notes || null,
      created_by: req.user.id,
    }, { transaction: t });

    let partsCost = 0;
    if (Array.isArray(items) && items.length > 0) {
      for (const line of items) {
        const result = await consumeWorkshopStock({
          workshopItemId: parseInt(line.workshop_item_id, 10),
          branchId: job.branch_id,
          quantity: line.quantity,
          refId: job.id,
          userId: req.user.id,
          transaction: t,
        });
        await db.WorkshopJobItem.create({
          workshop_job_id: job.id,
          workshop_item_id: parseInt(line.workshop_item_id, 10),
          branch_id: job.branch_id,
          quantity: result.quantity,
          unit_cost: result.unitCost,
          line_total: result.lineTotal,
        }, { transaction: t });
        partsCost = round2(partsCost + result.lineTotal);
      }
      job.parts_cost = partsCost;
      job.total_cost = round2(laborCost + partsCost);
      await job.save({ transaction: t });
    }

    await t.commit();

    const fullJob = await db.WorkshopJob.findOne({ where: { id: job.id }, include: JOB_INCLUDES });
    return res.status(201).json({ job: fullJob });
  } catch (error) {
    await t.rollback();
    console.error('createWorkshopJob error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateWorkshopJob = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const job = await db.WorkshopJob.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!job) return res.status(404).json({ message: 'Workshop job not found' });
    if (job.status !== 'in_progress') {
      return res.status(400).json({ message: `Cannot edit a job that is ${job.status.replace('_', ' ')}` });
    }

    const {
      employee_id, mechanic_name, date_in, odometer_reading,
      work_description, labor_cost, notes,
    } = req.body;

    if (employee_id !== undefined) job.employee_id = employee_id ? parseInt(employee_id, 10) : null;
    if (mechanic_name !== undefined) job.mechanic_name = mechanic_name || null;
    if (date_in !== undefined) job.date_in = date_in;
    if (odometer_reading !== undefined) job.odometer_reading = odometer_reading || null;
    if (work_description !== undefined) job.work_description = work_description || null;
    if (notes !== undefined) job.notes = notes || null;
    if (labor_cost !== undefined) {
      job.labor_cost = round2(labor_cost || 0);
      job.total_cost = round2(job.labor_cost + parseFloat(job.parts_cost || 0));
    }
    await job.save();

    return res.json({ job });
  } catch (error) {
    console.error('updateWorkshopJob error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.addWorkshopJobItem = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await t.rollback(); return; }

    const job = await db.WorkshopJob.findOne({ where: { id: req.params.id, shop_id: shopId }, transaction: t });
    if (!job) { await t.rollback(); return res.status(404).json({ message: 'Workshop job not found' }); }
    if (job.status !== 'in_progress') {
      await t.rollback();
      return res.status(400).json({ message: `Cannot add parts to a job that is ${job.status.replace('_', ' ')}` });
    }

    const { workshop_item_id, quantity } = req.body;
    if (!workshop_item_id || !quantity) {
      await t.rollback();
      return res.status(400).json({ message: 'workshop_item_id and quantity are required' });
    }

    const result = await consumeWorkshopStock({
      workshopItemId: parseInt(workshop_item_id, 10),
      branchId: job.branch_id,
      quantity,
      refId: job.id,
      userId: req.user.id,
      transaction: t,
    });

    const jobItem = await db.WorkshopJobItem.create({
      workshop_job_id: job.id,
      workshop_item_id: parseInt(workshop_item_id, 10),
      branch_id: job.branch_id,
      quantity: result.quantity,
      unit_cost: result.unitCost,
      line_total: result.lineTotal,
    }, { transaction: t });

    job.parts_cost = round2(parseFloat(job.parts_cost || 0) + result.lineTotal);
    job.total_cost = round2(parseFloat(job.labor_cost || 0) + job.parts_cost);
    await job.save({ transaction: t });

    await t.commit();

    const fullJob = await db.WorkshopJob.findOne({ where: { id: job.id }, include: JOB_INCLUDES });
    return res.status(201).json({ jobItem, job: fullJob });
  } catch (error) {
    await t.rollback();
    console.error('addWorkshopJobItem error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.removeWorkshopJobItem = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await t.rollback(); return; }

    const job = await db.WorkshopJob.findOne({ where: { id: req.params.id, shop_id: shopId }, transaction: t });
    if (!job) { await t.rollback(); return res.status(404).json({ message: 'Workshop job not found' }); }
    if (job.status !== 'in_progress') {
      await t.rollback();
      return res.status(400).json({ message: `Cannot remove parts from a job that is ${job.status.replace('_', ' ')}` });
    }

    const jobItem = await db.WorkshopJobItem.findOne({
      where: { id: req.params.itemId, workshop_job_id: job.id },
      transaction: t,
    });
    if (!jobItem) { await t.rollback(); return res.status(404).json({ message: 'Job part line not found' }); }

    await reverseWorkshopStock({
      workshopItemId: jobItem.workshop_item_id,
      branchId: jobItem.branch_id,
      quantity: jobItem.quantity,
      unitCost: jobItem.unit_cost,
      refId: job.id,
      userId: req.user.id,
      transaction: t,
    });

    job.parts_cost = round2(Math.max(0, parseFloat(job.parts_cost || 0) - parseFloat(jobItem.line_total || 0)));
    job.total_cost = round2(parseFloat(job.labor_cost || 0) + job.parts_cost);
    await job.save({ transaction: t });
    await jobItem.destroy({ transaction: t });

    await t.commit();

    const fullJob = await db.WorkshopJob.findOne({ where: { id: job.id }, include: JOB_INCLUDES });
    return res.json({ job: fullJob });
  } catch (error) {
    await t.rollback();
    console.error('removeWorkshopJobItem error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.completeWorkshopJob = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const job = await db.WorkshopJob.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!job) return res.status(404).json({ message: 'Workshop job not found' });
    if (job.status !== 'in_progress') {
      return res.status(400).json({ message: `Job is already ${job.status.replace('_', ' ')}` });
    }

    job.status = 'completed';
    job.date_out = req.body.date_out || new Date().toISOString().slice(0, 10);
    await job.save();

    const fullJob = await db.WorkshopJob.findOne({ where: { id: job.id }, include: JOB_INCLUDES });
    return res.json({ job: fullJob });
  } catch (error) {
    console.error('completeWorkshopJob error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.cancelWorkshopJob = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await t.rollback(); return; }

    const job = await db.WorkshopJob.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: [{ model: db.WorkshopJobItem }],
      transaction: t,
    });
    if (!job) { await t.rollback(); return res.status(404).json({ message: 'Workshop job not found' }); }
    if (job.status !== 'in_progress') {
      await t.rollback();
      return res.status(400).json({ message: `Job is already ${job.status.replace('_', ' ')}` });
    }

    for (const jobItem of job.WorkshopJobItems) {
      await reverseWorkshopStock({
        workshopItemId: jobItem.workshop_item_id,
        branchId: jobItem.branch_id,
        quantity: jobItem.quantity,
        unitCost: jobItem.unit_cost,
        refId: job.id,
        userId: req.user.id,
        transaction: t,
      });
    }

    job.status = 'cancelled';
    await job.save({ transaction: t });

    await t.commit();

    const fullJob = await db.WorkshopJob.findOne({ where: { id: job.id }, include: JOB_INCLUDES });
    return res.json({ job: fullJob });
  } catch (error) {
    await t.rollback();
    console.error('cancelWorkshopJob error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: 'Internal server error' });
  }
};
