const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const { markAttendance } = require('./attendanceController');

function dateRange(start, end) {
  const dates = [];
  const cur = new Date(`${start}T00:00:00.000`);
  const last = new Date(`${end}T00:00:00.000`);
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ── Leave Types ────────────────────────────────────────────────────────────
exports.listTypes = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;
    const leaveTypes = await db.LeaveType.findAll({ where: { shop_id: shopId }, order: [['name', 'ASC']] });
    return res.json({ leave_types: leaveTypes });
  } catch (error) {
    console.error('listLeaveTypes error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.createType = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;
    const { name, is_paid, default_annual_days } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Leave type name is required' });

    const leaveType = await db.LeaveType.create({
      shop_id: shopId,
      name: name.trim(),
      is_paid: is_paid !== undefined ? !!is_paid : true,
      default_annual_days: default_annual_days !== undefined && default_annual_days !== ''
        ? parseInt(default_annual_days, 10) : null,
    });
    return res.status(201).json({ leave_type: leaveType });
  } catch (error) {
    console.error('createLeaveType error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateType = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;
    const leaveType = await db.LeaveType.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!leaveType) return res.status(404).json({ message: 'Leave type not found' });

    const { name, is_paid, default_annual_days } = req.body;
    if (name !== undefined) leaveType.name = name.trim();
    if (is_paid !== undefined) leaveType.is_paid = !!is_paid;
    if (default_annual_days !== undefined) {
      leaveType.default_annual_days = default_annual_days !== '' ? parseInt(default_annual_days, 10) : null;
    }
    await leaveType.save();
    return res.json({ leave_type: leaveType });
  } catch (error) {
    console.error('updateLeaveType error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.removeType = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;
    const leaveType = await db.LeaveType.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!leaveType) return res.status(404).json({ message: 'Leave type not found' });

    const inUse = await db.LeaveRecord.count({ where: { leave_type_id: leaveType.id, shop_id: shopId } });
    if (inUse > 0) return res.status(400).json({ message: 'Cannot delete a leave type with existing leave records' });

    await leaveType.destroy();
    return res.json({ message: 'Leave type deleted' });
  } catch (error) {
    console.error('removeLeaveType error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Leave Records ─────────────────────────────────────────────────────────
exports.listRecords = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const where = { shop_id: shopId };
    if (req.query.employee_id) where.employee_id = parseInt(req.query.employee_id, 10);
    if (req.query.leave_type_id) where.leave_type_id = parseInt(req.query.leave_type_id, 10);
    if (req.query.from) where.end_date = { [Op.gte]: req.query.from };
    if (req.query.to) where.start_date = { [Op.lte]: req.query.to };

    const records = await db.LeaveRecord.findAll({
      where,
      include: [
        { model: db.Employee, attributes: ['id', 'name', 'employment_id'] },
        { model: db.LeaveType, as: 'LeaveType', attributes: ['id', 'name', 'is_paid'] },
        { model: db.User, as: 'CreatedBy', attributes: ['id', 'name'] },
      ],
      order: [['start_date', 'DESC']],
    });
    return res.json({ leave_records: records });
  } catch (error) {
    console.error('listLeaveRecords error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /leave/records — direct HR-recorded, no approval step ─────────────
// Immediately marks every covered date as status:'leave' on Attendance (see
// markAttendance), so Attendance stays the single source of truth for "what
// happened on day X" while this row adds the "why" (leave type) and enables
// balance tracking.
exports.createRecord = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const { employee_id, leave_type_id, start_date, end_date, reason } = req.body;
    if (!employee_id || !leave_type_id || !start_date || !end_date) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Employee, leave type, start date and end date are all required' });
    }
    if (end_date < start_date) {
      await transaction.rollback();
      return res.status(400).json({ message: 'End date cannot be before start date' });
    }

    const employee = await db.Employee.findOne({ where: { id: employee_id, shop_id: shopId }, transaction });
    if (!employee) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Employee not found for this shop' });
    }
    const leaveType = await db.LeaveType.findOne({ where: { id: leave_type_id, shop_id: shopId }, transaction });
    if (!leaveType) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Leave type not found for this shop' });
    }

    // Overlap check: any existing record for this employee whose range
    // intersects [start_date, end_date] at all.
    const overlap = await db.LeaveRecord.findOne({
      where: {
        shop_id: shopId,
        employee_id,
        start_date: { [Op.lte]: end_date },
        end_date: { [Op.gte]: start_date },
      },
      transaction,
    });
    if (overlap) {
      await transaction.rollback();
      return res.status(400).json({ message: 'This employee already has leave recorded that overlaps these dates' });
    }

    const record = await db.LeaveRecord.create({
      shop_id: shopId,
      employee_id: parseInt(employee_id, 10),
      leave_type_id: parseInt(leave_type_id, 10),
      start_date,
      end_date,
      reason: reason?.trim() || null,
      created_by: req.user.id,
    }, { transaction });

    for (const date of dateRange(start_date, end_date)) {
      await markAttendance(shopId, req.user.id, date, [
        { employee_id: parseInt(employee_id, 10), status: 'leave', leave_type_id: parseInt(leave_type_id, 10) },
      ], transaction);
    }

    await transaction.commit();
    return res.status(201).json({ leave_record: record });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('createLeaveRecord error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
  }
};

// ── DELETE /leave/records/:id — reverts the covered Attendance rows ────────
// Only removes attendance rows that still show this exact leave (status
// 'leave' + this leave_type_id) — if HR manually changed one of those days to
// something else afterward, that edit is left alone rather than silently
// overwritten by the revert.
exports.removeRecord = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const record = await db.LeaveRecord.findOne({ where: { id: req.params.id, shop_id: shopId }, transaction });
    if (!record) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Leave record not found' });
    }

    await db.Attendance.destroy({
      where: {
        shop_id: shopId,
        employee_id: record.employee_id,
        leave_type_id: record.leave_type_id,
        status: 'leave',
        date: { [Op.between]: [record.start_date, record.end_date] },
      },
      transaction,
    });

    await record.destroy({ transaction });
    await transaction.commit();
    return res.json({ message: 'Leave record deleted' });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('removeLeaveRecord error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /leave/balance?employee_id=&year= ────────────────────────────────────
// entitlement - taken, computed live from leave_records — same "computed, not
// cached" philosophy as attendanceController.getAttendanceSummaryForMonth.
// A leave spanning a year boundary is attributed to its start year.
exports.getBalance = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const employeeId = parseInt(req.query.employee_id, 10);
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    if (!employeeId) return res.status(400).json({ message: 'employee_id is required' });

    const employee = await db.Employee.findOne({ where: { id: employeeId, shop_id: shopId }, attributes: ['id'] });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const [leaveTypes, records] = await Promise.all([
      db.LeaveType.findAll({ where: { shop_id: shopId }, order: [['name', 'ASC']] }),
      db.LeaveRecord.findAll({
        where: {
          shop_id: shopId,
          employee_id: employeeId,
          start_date: { [Op.gte]: `${year}-01-01`, [Op.lte]: `${year}-12-31` },
        },
        raw: true,
      }),
    ]);

    const takenByType = {};
    records.forEach((r) => {
      const days = dateRange(r.start_date, r.end_date).length;
      takenByType[r.leave_type_id] = (takenByType[r.leave_type_id] || 0) + days;
    });

    const balance = leaveTypes.map((lt) => {
      const taken = takenByType[lt.id] || 0;
      const entitlement = lt.default_annual_days;
      return {
        leave_type_id: lt.id,
        leave_type_name: lt.name,
        entitlement,
        taken,
        remaining: entitlement != null ? entitlement - taken : null,
      };
    });

    return res.json({ year, balance });
  } catch (error) {
    console.error('getLeaveBalance error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
