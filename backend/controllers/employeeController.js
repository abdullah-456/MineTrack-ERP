const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const { requestOrAllowDelete } = require('../utils/deletionRequest');
const { applyTerminationSettlements, loadTerminationPreview } = require('../utils/employeeTermination');
const { assertCnicAvailable } = require('../utils/cnic');

const employeeIncludes = [
  { model: db.Branch, attributes: ['id', 'name', 'godown_id'], include: [{ model: db.Godown, attributes: ['id', 'name'] }] },
];

exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (req.query.status && req.query.status !== 'all') where.status = req.query.status;
    if (req.query.branch_id) where.branch_id = req.query.branch_id;
    if (req.query.search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${req.query.search}%` } },
        { designation: { [Op.iLike]: `%${req.query.search}%` } },
        { phone: { [Op.iLike]: `%${req.query.search}%` } },
        { cnic: { [Op.iLike]: `%${req.query.search}%` } },
      ];
    }

    const employees = await db.Employee.findAll({
      where,
      include: employeeIncludes,
      order: [['created_at', 'DESC']],
    });

    return res.json({ employees });
  } catch (error) {
    console.error('listEmployees error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.get = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const employee = await db.Employee.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: employeeIncludes,
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    return res.json({ employee });
  } catch (error) {
    console.error('getEmployee error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { name, designation, cnic, phone, address, basic_salary, hire_date, branch_id, status } = req.body;
    if (!name || !basic_salary || !branch_id) {
      return res.status(400).json({ message: 'Name, salary and branch are required' });
    }

    const branch = await db.Branch.findOne({ where: { id: branch_id, shop_id: shopId } });
    if (!branch) return res.status(400).json({ message: 'Invalid branch' });

    const preparedCnic = await assertCnicAvailable(shopId, cnic);

    const employee = await db.Employee.create({
      shop_id: shopId,
      name,
      designation,
      cnic: preparedCnic.cnic,
      cnic_normalized: preparedCnic.cnic_normalized,
      phone,
      address,
      basic_salary,
      hire_date: hire_date || new Date(),
      branch_id,
      status: status || 'active',
    });

    const full = await db.Employee.findByPk(employee.id, { include: employeeIncludes });
    return res.status(201).json({ employee: full });
  } catch (error) {
    console.error('createEmployee error:', error);
    if (error.statusCode === 409) return res.status(409).json({ message: error.message });
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'CNIC already registered for another person' });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const employee = await db.Employee.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const wasTerminated = employee.status === 'terminated';
    const fields = ['name', 'designation', 'phone', 'address', 'basic_salary', 'hire_date', 'branch_id', 'status', 'termination_notes'];
    fields.forEach(f => { if (req.body[f] !== undefined) employee[f] = req.body[f]; });

    if (req.body.cnic !== undefined) {
      const preparedCnic = await assertCnicAvailable(shopId, req.body.cnic, { employeeId: employee.id });
      employee.cnic = preparedCnic.cnic;
      employee.cnic_normalized = preparedCnic.cnic_normalized;
    }

    if (req.body.status === 'terminated' && !wasTerminated) {
      employee.terminated_at = new Date();
    }
    await employee.save();

    const full = await db.Employee.findByPk(employee.id, { include: employeeIncludes });
    return res.json({ employee: full });
  } catch (error) {
    console.error('updateEmployee error:', error);
    if (error.statusCode === 409) return res.status(409).json({ message: error.message });
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'CNIC already registered for another person' });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  // Legacy DELETE — forwards to terminate without settlements.
  req.body = { ...(req.body || {}), settlements: null };
  return exports.terminate(req, res);
};

exports.getTerminationPreview = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const employee = await db.Employee.findOne({
      where: { id: req.params.id, shop_id: shopId },
      include: [{ model: db.Branch, attributes: ['id', 'name'] }],
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    if (employee.status === 'terminated') {
      return res.status(400).json({ message: 'Employee is already terminated' });
    }

    const balances = await loadTerminationPreview(employee);
    return res.json({ employee, balances });
  } catch (error) {
    console.error('getTerminationPreview error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.terminate = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const employee = await db.Employee.findOne({
      where: { id: req.params.id, shop_id: shopId },
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    if (employee.status === 'terminated') {
      return res.status(400).json({ message: 'Employee is already terminated' });
    }

    const { termination_notes, settlements } = req.body || {};

    const { pending } = await requestOrAllowDelete({
      req, res, shopId, module: 'employees', entityId: employee.id, entityLabel: employee.name,
    });
    if (pending) return;

    const transaction = await db.sequelize.transaction();
    try {
      const locked = await db.Employee.findOne({
        where: { id: employee.id, shop_id: shopId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (settlements) {
        await applyTerminationSettlements(locked, shopId, settlements, req.user.id, transaction);
      }

      await locked.update({
        status: 'terminated',
        terminated_at: new Date(),
        termination_notes: termination_notes?.trim() || null,
      }, { transaction });

      await transaction.commit();

      const full = await db.Employee.findByPk(employee.id, { include: employeeIncludes });
      return res.json({ message: 'Employee terminated', employee: full });
    } catch (error) {
      if (!transaction.finished) await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('terminateEmployee error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};
