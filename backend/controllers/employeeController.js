const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const { requestOrAllowDelete } = require('../utils/deletionRequest');

const employeeIncludes = [
  { model: db.Branch, attributes: ['id', 'name'] },
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
        { name: { [Op.like]: `%${req.query.search}%` } },
        { designation: { [Op.like]: `%${req.query.search}%` } },
        { phone: { [Op.like]: `%${req.query.search}%` } },
        { cnic: { [Op.like]: `%${req.query.search}%` } },
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

    const employee = await db.Employee.create({
      shop_id: shopId,
      name,
      designation,
      cnic,
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
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'CNIC already registered' });
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

    const fields = ['name', 'designation', 'cnic', 'phone', 'address', 'basic_salary', 'hire_date', 'branch_id', 'status'];
    fields.forEach(f => { if (req.body[f] !== undefined) employee[f] = req.body[f]; });
    await employee.save();

    const full = await db.Employee.findByPk(employee.id, { include: employeeIncludes });
    return res.json({ employee: full });
  } catch (error) {
    console.error('updateEmployee error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const employee = await db.Employee.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const { pending } = await requestOrAllowDelete({
      req, res, shopId, module: 'employees', entityId: employee.id, entityLabel: employee.name,
    });
    if (pending) return;

    await employee.update({ status: 'terminated' });
    return res.json({ message: 'Employee terminated', employee });
  } catch (error) {
    console.error('removeEmployee error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
