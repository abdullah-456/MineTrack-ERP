const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const { requestOrAllowDelete } = require('../utils/deletionRequest');
const { applyTerminationSettlements, loadTerminationPreview } = require('../utils/employeeTermination');
const { assertCnicAvailable, normalizeCnic } = require('../utils/cnic');
const { deleteFileQuiet, relativeFilePath, absoluteFilePath } = require('../utils/employeeUploads');
const { DOCUMENT_CATEGORIES } = require('../utils/documentUploads');
const { nextEmploymentId, reissueEmploymentId } = require('../utils/employmentId');

const employeeIncludes = [
  { model: db.Branch, attributes: ['id', 'name', 'godown_id'], include: [{ model: db.Godown, attributes: ['id', 'name'] }] },
  { model: db.EmployeeDocument, attributes: ['id', 'title', 'file_name', 'mime_type', 'file_size', 'created_at'] },
  { model: db.Designation, as: 'Designation', attributes: ['id', 'name'] },
];

const PROFILE_FIELDS = [
  'father_name', 'gender', 'city', 'cnic_expiry', 'date_of_birth', 'age',
  'place_of_birth', 'marital_status', 'religion', 'language', 'home_tel',
  'emergency_name', 'emergency_relation', 'emergency_cell', 'emergency_residence',
  'education_institute', 'education_degree', 'education_specialization',
  'education_grade', 'education_year', 'experience', 'dependants',
  'remarks', 'hr_remarks', 'allowances', 'shift', 'overtime_rate',
];

function err(statusCode, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

function digitsOnly(v) {
  return String(v || '').replace(/\D/g, '');
}

function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

function validatePhone(label, value, { required = false } = {}) {
  if (value == null || !String(value).trim()) {
    if (required) throw err(400, `${label} is required`);
    return null;
  }
  const digits = digitsOnly(value);
  if (digits.length < 10 || digits.length > 15) {
    throw err(400, `${label} must be a valid phone number`);
  }
  return String(value).trim();
}

async function validateEmployeePayload(shopId, body, { isCreate }) {
  const name = (body.name || '').trim();
  const father_name = (body.father_name || '').trim();
  const gender = (body.gender || '').trim();
  const designation_id = body.designation_id !== undefined && body.designation_id !== '' && body.designation_id !== null
    ? parseInt(body.designation_id, 10) : null;
  const address = (body.address || '').trim();
  const city = (body.city || '').trim();
  // An employee is EITHER salary-based (fixed monthly basic_salary) OR
  // daily-wage-based (daily_wage × paid days). Exactly one amount is required
  // and the unused one is nulled out, so a switch between the two can never
  // leave a stale figure behind for payroll to pick up.
  const ALLOWED_EMPLOYMENT_TYPE = ['salary', 'daily_wage'];
  const employment_type = (body.employment_type || 'salary').trim().toLowerCase();
  if (!ALLOWED_EMPLOYMENT_TYPE.includes(employment_type)) {
    throw err(400, 'Employment type must be salary or daily_wage');
  }
  const isDailyWage = employment_type === 'daily_wage';
  const basic_salary = isDailyWage ? null : parseFloat(body.basic_salary);
  const daily_wage = isDailyWage ? parseFloat(body.daily_wage) : null;
  const branch_id = body.branch_id ? parseInt(body.branch_id, 10) : null;
  const hire_date = body.hire_date || null;

  if (!name) throw err(400, 'Full name is required');
  if (isCreate || body.father_name !== undefined) {
    if (!father_name) throw err(400, 'Father name is required');
  }
  if (isCreate || body.gender !== undefined) {
    if (!['male', 'female', 'other'].includes(gender.toLowerCase())) {
      throw err(400, 'Gender is required (male / female / other)');
    }
  }
  let designationName = null;
  if (isCreate || body.designation_id !== undefined) {
    if (!designation_id) throw err(400, 'Designation is required');
  }
  if (designation_id) {
    const designationRow = await db.Designation.findOne({ where: { id: designation_id, shop_id: shopId } });
    if (!designationRow) throw err(400, 'Invalid designation');
    designationName = designationRow.name;
  }
  if (isDailyWage) {
    if (!(daily_wage >= 0) || Number.isNaN(daily_wage)) {
      throw err(400, 'Daily wage is required for a daily-wage employee');
    }
  } else if (!(basic_salary >= 0) || Number.isNaN(basic_salary)) {
    throw err(400, 'Salary is required');
  }
  if (!branch_id) throw err(400, 'Location / branch is required');
  if (isCreate && !hire_date) throw err(400, 'Date of joining is required');
  if (isCreate || body.address !== undefined) {
    if (!address) throw err(400, 'Address is required');
  }
  if (isCreate || body.city !== undefined) {
    if (!city) throw err(400, 'City / location is required');
  }

  const branch = await db.Branch.findOne({ where: { id: branch_id, shop_id: shopId } });
  if (!branch) throw err(400, 'Invalid branch');

  const phone = validatePhone('Cell No', body.phone, { required: isCreate || body.phone !== undefined });

  let preparedCnic = { cnic: null, cnic_normalized: null };
  if (isCreate || body.cnic !== undefined) {
    const norm = normalizeCnic(body.cnic);
    if (!norm || norm.length !== 13) throw err(400, 'CNIC No must be 13 digits');
    preparedCnic = await assertCnicAvailable(shopId, body.cnic, body._cnicExclude || {});
  }

  // Only validate CNIC expiry when the client sends that field (avoid blocking
  // unrelated updates when an employee already has a past expiry on file).
  if (body.cnic_expiry && !body._skipCnicExpiryCheck) {
    const exp = new Date(body.cnic_expiry);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (Number.isNaN(exp.getTime()) || exp < today) {
      throw err(400, 'CNIC expiry date must be a future date');
    }
  }

  let experience = body.experience;
  if (experience !== undefined) {
    if (!Array.isArray(experience)) throw err(400, 'Experience must be a list');
    experience = experience.filter(r => r && (r.organization || r.designation));
  }
  let dependants = body.dependants;
  if (dependants !== undefined) {
    if (!Array.isArray(dependants)) throw err(400, 'Dependants must be a list');
    dependants = dependants.filter(r => r && r.name);
  }
  let allowances = body.allowances;
  if (allowances !== undefined) {
    if (!Array.isArray(allowances)) throw err(400, 'Allowances must be a list');
    allowances = allowances
      .filter(r => r && String(r.name || '').trim())
      .map(r => ({ name: String(r.name).trim(), amount: Math.max(0, parseFloat(r.amount) || 0) }));
  }

  let age = body.age !== undefined && body.age !== '' ? parseInt(body.age, 10) : null;
  if ((age == null || Number.isNaN(age)) && body.date_of_birth) {
    age = ageFromDob(body.date_of_birth);
  }

  const ALLOWED_STATUS = ['active', 'suspended', 'terminated'];
  const status = (body.status || 'active').toLowerCase();
  if (!ALLOWED_STATUS.includes(status)) {
    throw err(400, 'Invalid employee status');
  }

  const ALLOWED_SHIFT = ['morning', 'evening', 'night'];
  const shift = (body.shift || '').trim().toLowerCase();
  if (shift && !ALLOWED_SHIFT.includes(shift)) {
    throw err(400, 'Invalid shift');
  }
  const overtimeRate = body.overtime_rate !== undefined && body.overtime_rate !== ''
    ? Math.max(0, parseFloat(body.overtime_rate) || 0) : null;

  // Truck-loading commission defaults. The two bases are independent and both
  // may be on — they stack at calculation time. An amount is only meaningful
  // when its checkbox is ticked, so the other one is nulled out rather than
  // left behind to reappear if the box is ticked again later.
  const commissionDefault = (enabledRaw, amountRaw, label) => {
    const enabled = enabledRaw === true || enabledRaw === 'true' || enabledRaw === 1 || enabledRaw === '1';
    if (!enabled) return { enabled: false, amount: null };
    const amount = parseFloat(amountRaw);
    if (!(amount >= 0) || Number.isNaN(amount)) throw err(400, `${label} amount is required when that commission is enabled`);
    return { enabled: true, amount };
  };
  const truckCommission = commissionDefault(body.commission_per_truck_enabled, body.commission_per_truck, 'Commission per truck');
  const tonCommission = commissionDefault(body.commission_per_ton_enabled, body.commission_per_ton, 'Commission per ton');

  return {
    name,
    father_name: father_name || null,
    gender: gender ? gender.toLowerCase() : null,
    designation_id: designation_id || null,
    designation: designationName,
    shift: shift || null,
    overtime_rate: overtimeRate,
    phone,
    address: address || null,
    city: city || null,
    employment_type,
    basic_salary,
    daily_wage,
    commission_per_truck_enabled: truckCommission.enabled,
    commission_per_truck: truckCommission.amount,
    commission_per_ton_enabled: tonCommission.enabled,
    commission_per_ton: tonCommission.amount,
    hire_date: hire_date || new Date(),
    branch_id,
    status,
    cnic: preparedCnic.cnic,
    cnic_normalized: preparedCnic.cnic_normalized,
    cnic_expiry: body.cnic_expiry || null,
    date_of_birth: body.date_of_birth || null,
    age: Number.isNaN(age) ? null : age,
    place_of_birth: (body.place_of_birth || '').trim() || null,
    marital_status: (body.marital_status || '').trim() || null,
    religion: (body.religion || '').trim() || null,
    language: (body.language || '').trim() || null,
    home_tel: body.home_tel != null && String(body.home_tel).trim()
      ? validatePhone('Home Tel No', body.home_tel) : null,
    emergency_name: (body.emergency_name || '').trim() || null,
    emergency_relation: (body.emergency_relation || '').trim() || null,
    emergency_cell: body.emergency_cell != null && String(body.emergency_cell).trim()
      ? validatePhone('Emergency Cell No', body.emergency_cell) : null,
    emergency_residence: (body.emergency_residence || '').trim() || null,
    education_institute: (body.education_institute || '').trim() || null,
    education_degree: (body.education_degree || '').trim() || null,
    education_specialization: (body.education_specialization || '').trim() || null,
    education_grade: (body.education_grade || '').trim() || null,
    education_year: (body.education_year || '').trim() || null,
    experience: experience !== undefined ? experience : undefined,
    dependants: dependants !== undefined ? dependants : undefined,
    allowances: allowances !== undefined ? allowances : undefined,
    remarks: (body.remarks || '').trim() || null,
    hr_remarks: (body.hr_remarks || '').trim() || null,
  };
}

// Allocation lives in utils/employmentId.js — see the contract documented
// there (abbreviation prefix, single shop-wide sequence).

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
        { employment_id: { [Op.iLike]: `%${req.query.search}%` } },
        { father_name: { [Op.iLike]: `%${req.query.search}%` } },
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

// ── GET /employees/next-employment-id?abbr=KHW ──────────────────────────────
// Read-only preview for the employee form. `abbr` follows whichever mine
// abbreviation the form has selected, so the shown ID updates as the user
// changes it. The value persisted on create is always recomputed server-side
// inside that transaction — this is never trusted back from the client.
exports.nextEmploymentId = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;
    const employment_id = await nextEmploymentId(shopId, req.query.abbr);
    return res.json({ employment_id });
  } catch (error) {
    console.error('nextEmploymentId error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// No separate endpoint lists the available abbreviations: the employee form
// already holds this shop's mines (useShopApi's `branches`, whose payload
// carries location_abbr), so the dropdown is derived from that rather than
// costing a second request for data the page has.

exports.create = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const data = await validateEmployeePayload(shopId, req.body, { isCreate: true });
    // Assigned once, here, and never re-issued afterwards — `update` below
    // deliberately leaves employment_id alone, so transferring an employee to
    // a different mine keeps their ID stable (confirmed with the user). An ID
    // already printed on a payslip must keep matching the record.
    const employment_id = await nextEmploymentId(shopId, req.body.employment_abbr, transaction);

    const employee = await db.Employee.create({
      shop_id: shopId,
      employment_id,
      ...data,
      experience: data.experience || [],
      dependants: data.dependants || [],
      allowances: data.allowances || [],
    }, { transaction });

    await transaction.commit();
    const full = await db.Employee.findByPk(employee.id, { include: employeeIncludes });
    return res.status(201).json({ employee: full });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('createEmployee error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'CNIC or Employment ID already registered' });
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
    if (req.body.status === 'terminated' && !wasTerminated) {
      throw err(400, 'Use Terminate employee to mark as terminated');
    }

    const data = await validateEmployeePayload(shopId, {
      ...employee.toJSON(),
      ...req.body,
      _cnicExclude: { employeeId: employee.id },
      _skipCnicExpiryCheck: req.body.cnic_expiry === undefined,
      // When updating, only re-validate fields present in body for optional groups —
      // merge so required checks still see existing values.
      name: req.body.name !== undefined ? req.body.name : employee.name,
      father_name: req.body.father_name !== undefined ? req.body.father_name : employee.father_name,
      gender: req.body.gender !== undefined ? req.body.gender : employee.gender,
      designation_id: req.body.designation_id !== undefined ? req.body.designation_id : employee.designation_id,
      phone: req.body.phone !== undefined ? req.body.phone : employee.phone,
      address: req.body.address !== undefined ? req.body.address : employee.address,
      city: req.body.city !== undefined ? req.body.city : employee.city,
      employment_type: req.body.employment_type !== undefined ? req.body.employment_type : employee.employment_type,
      basic_salary: req.body.basic_salary !== undefined ? req.body.basic_salary : employee.basic_salary,
      daily_wage: req.body.daily_wage !== undefined ? req.body.daily_wage : employee.daily_wage,
      commission_per_truck_enabled: req.body.commission_per_truck_enabled !== undefined
        ? req.body.commission_per_truck_enabled : employee.commission_per_truck_enabled,
      commission_per_truck: req.body.commission_per_truck !== undefined
        ? req.body.commission_per_truck : employee.commission_per_truck,
      commission_per_ton_enabled: req.body.commission_per_ton_enabled !== undefined
        ? req.body.commission_per_ton_enabled : employee.commission_per_ton_enabled,
      commission_per_ton: req.body.commission_per_ton !== undefined
        ? req.body.commission_per_ton : employee.commission_per_ton,
      branch_id: req.body.branch_id !== undefined ? req.body.branch_id : employee.branch_id,
      hire_date: req.body.hire_date !== undefined ? req.body.hire_date : employee.hire_date,
      cnic: req.body.cnic !== undefined ? req.body.cnic : employee.cnic,
    }, { isCreate: false });

    const assign = [
      'name', 'father_name', 'gender', 'designation_id', 'designation', 'phone', 'address', 'city',
      // employment_type/basic_salary/daily_wage move together: the validator
      // nulls whichever amount the chosen type doesn't use, and assigning that
      // null here is what stops a switched-over employee from keeping a stale
      // salary (or wage) that payroll would otherwise still find.
      'employment_type', 'basic_salary', 'daily_wage', 'hire_date', 'branch_id', 'status',
      'commission_per_truck_enabled', 'commission_per_truck',
      'commission_per_ton_enabled', 'commission_per_ton',
      ...PROFILE_FIELDS,
    ];
    const priorStatus = employee.status;
    assign.forEach((f) => {
      if (data[f] !== undefined) employee[f] = data[f];
    });
    // Same suspended_at stamping as patchStatus — the status can also be
    // changed through a plain edit, and the date has to follow it either way.
    if (employee.status === 'suspended' && priorStatus !== 'suspended') {
      employee.suspended_at = new Date();
    } else if (employee.status === 'active' && priorStatus !== 'active') {
      employee.suspended_at = null;
    }
    if (req.body.cnic !== undefined) {
      employee.cnic = data.cnic;
      employee.cnic_normalized = data.cnic_normalized;
    }
    if (req.body.termination_notes !== undefined) {
      employee.termination_notes = req.body.termination_notes;
    }

    // Re-issuing the ID's location prefix is the ONE thing here that is an
    // explicit, deliberate action rather than a side effect: it is never
    // triggered by a mine transfer on its own (confirmed with the user), only
    // by the abbreviation field actually being sent. The sequence number is
    // carried across unchanged, so this can't disturb the shop-wide ordering.
    if (req.body.employment_abbr !== undefined) {
      employee.employment_id = await reissueEmploymentId(
        shopId, employee.employment_id, req.body.employment_abbr,
      );
    }

    await employee.save();

    const full = await db.Employee.findByPk(employee.id, { include: employeeIncludes });
    return res.json({ employee: full });
  } catch (error) {
    console.error('updateEmployee error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'CNIC already registered for another person' });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.patchStatus = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const { status } = req.body || {};
    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ message: 'Status must be active or suspended' });
    }

    const employee = await db.Employee.findOne({
      where: { id: req.params.id, shop_id: shopId },
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    if (employee.status === 'terminated') {
      return res.status(400).json({ message: 'Cannot change status of a terminated employee' });
    }

    // Mirrors terminated_at: stamped on the transition INTO suspended (not on
    // every save, so re-suspending an already-suspended employee keeps the
    // original date), and cleared on the way back to active so a returning
    // employee doesn't keep showing a suspension date in exports.
    if (status === 'suspended' && employee.status !== 'suspended') {
      employee.suspended_at = new Date();
    } else if (status === 'active') {
      employee.suspended_at = null;
    }
    employee.status = status;
    await employee.save();

    const full = await db.Employee.findByPk(employee.id, { include: employeeIncludes });
    return res.json({ employee: full });
  } catch (error) {
    console.error('patchEmployeeStatus error:', error);
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

// ── Attachments: photo, CNIC image, other documents ────────────────────────
// All routes below run after `loadEmployee` (attaches req.employee) and the
// relevant multer upload middleware (attaches req.file / req.files).

exports.uploadPhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No photo uploaded' });
    const employee = req.employee;
    const oldRelPath = employee.photo_path;

    employee.photo_path = relativeFilePath(employee, req.file.filename);
    await employee.save();
    if (oldRelPath) deleteFileQuiet(absoluteFilePath(oldRelPath));

    return res.json({ message: 'Photo uploaded', employee });
  } catch (error) {
    console.error('uploadEmployeePhoto error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.deletePhoto = async (req, res) => {
  try {
    const employee = req.employee;
    if (!employee.photo_path) return res.status(404).json({ message: 'No photo on file' });

    const oldRelPath = employee.photo_path;
    employee.photo_path = null;
    await employee.save();
    deleteFileQuiet(absoluteFilePath(oldRelPath));

    return res.json({ message: 'Photo removed', employee });
  } catch (error) {
    console.error('deleteEmployeePhoto error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getPhoto = async (req, res) => {
  const employee = req.employee;
  if (!employee.photo_path) return res.status(404).json({ message: 'No photo on file' });
  return res.sendFile(absoluteFilePath(employee.photo_path), (err) => {
    if (err && !res.headersSent) res.status(404).json({ message: 'Photo file not found' });
  });
};

exports.uploadCnicImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No CNIC image uploaded' });
    const employee = req.employee;
    const oldRelPath = employee.cnic_image_path;

    employee.cnic_image_path = relativeFilePath(employee, req.file.filename);
    await employee.save();
    if (oldRelPath) deleteFileQuiet(absoluteFilePath(oldRelPath));

    return res.json({ message: 'CNIC image uploaded', employee });
  } catch (error) {
    console.error('uploadEmployeeCnicImage error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.deleteCnicImage = async (req, res) => {
  try {
    const employee = req.employee;
    if (!employee.cnic_image_path) return res.status(404).json({ message: 'No CNIC image on file' });

    const oldRelPath = employee.cnic_image_path;
    employee.cnic_image_path = null;
    await employee.save();
    deleteFileQuiet(absoluteFilePath(oldRelPath));

    return res.json({ message: 'CNIC image removed', employee });
  } catch (error) {
    console.error('deleteEmployeeCnicImage error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getCnicImage = async (req, res) => {
  const employee = req.employee;
  if (!employee.cnic_image_path) return res.status(404).json({ message: 'No CNIC image on file' });
  return res.sendFile(absoluteFilePath(employee.cnic_image_path), (err) => {
    if (err && !res.headersSent) res.status(404).json({ message: 'CNIC image file not found' });
  });
};

exports.uploadDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const employee = req.employee;

    const category = DOCUMENT_CATEGORIES.includes(req.body.category) ? req.body.category : 'other';
    let expiryDate = null;
    if (req.body.expiry_date) {
      if (Number.isNaN(new Date(req.body.expiry_date).getTime())) {
        deleteFileQuiet(absoluteFilePath(relativeFilePath(employee, req.file.filename)));
        return res.status(400).json({ message: 'Invalid expiry_date' });
      }
      expiryDate = req.body.expiry_date;
    }

    const doc = await db.EmployeeDocument.create({
      employee_id: employee.id,
      shop_id: employee.shop_id,
      title: (req.body.title || '').trim() || req.file.originalname,
      file_name: req.file.originalname,
      file_path: relativeFilePath(employee, req.file.filename),
      mime_type: req.file.mimetype,
      file_size: req.file.size,
      category,
      expiry_date: expiryDate,
    });

    return res.status(201).json({
      message: 'Document uploaded',
      document: {
        id: doc.id, title: doc.title, file_name: doc.file_name, category: doc.category,
        mime_type: doc.mime_type, file_size: doc.file_size, expiry_date: doc.expiry_date, created_at: doc.created_at,
      },
    });
  } catch (error) {
    console.error('uploadEmployeeDocument error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getDocumentFile = async (req, res) => {
  try {
    const employee = req.employee;
    const doc = await db.EmployeeDocument.findOne({
      where: { id: req.params.docId, employee_id: employee.id, shop_id: employee.shop_id },
    });
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    return res.sendFile(absoluteFilePath(doc.file_path), { headers: { 'Content-Type': doc.mime_type || 'application/octet-stream' } }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ message: 'Document file not found' });
    });
  } catch (error) {
    console.error('getEmployeeDocumentFile error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.deleteDocument = async (req, res) => {
  try {
    const employee = req.employee;
    const doc = await db.EmployeeDocument.findOne({
      where: { id: req.params.docId, employee_id: employee.id, shop_id: employee.shop_id },
    });
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const relPath = doc.file_path;
    await doc.destroy();
    deleteFileQuiet(absoluteFilePath(relPath));

    return res.json({ message: 'Document removed' });
  } catch (error) {
    console.error('deleteEmployeeDocument error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
