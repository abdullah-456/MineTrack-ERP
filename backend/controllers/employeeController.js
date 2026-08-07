const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');
const { requestOrAllowDelete } = require('../utils/deletionRequest');
const { applyTerminationSettlements, loadTerminationPreview } = require('../utils/employeeTermination');
const { assertCnicAvailable, normalizeCnic } = require('../utils/cnic');
const { deleteFileQuiet, relativeFilePath, absoluteFilePath } = require('../utils/employeeUploads');

const employeeIncludes = [
  { model: db.Branch, attributes: ['id', 'name', 'godown_id'], include: [{ model: db.Godown, attributes: ['id', 'name'] }] },
  { model: db.EmployeeDocument, attributes: ['id', 'title', 'file_name', 'mime_type', 'file_size', 'created_at'] },
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
  const designation = (body.designation || '').trim();
  const address = (body.address || '').trim();
  const city = (body.city || '').trim();
  const basic_salary = parseFloat(body.basic_salary);
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
  if (isCreate || body.designation !== undefined) {
    if (!designation) throw err(400, 'Designation is required');
  }
  if (!(basic_salary >= 0) || Number.isNaN(basic_salary)) {
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

  return {
    name,
    father_name: father_name || null,
    gender: gender ? gender.toLowerCase() : null,
    designation: designation || null,
    shift: shift || null,
    overtime_rate: overtimeRate,
    phone,
    address: address || null,
    city: city || null,
    basic_salary,
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

async function nextEmploymentId(shopId, transaction) {
  const count = await db.Employee.count({ where: { shop_id: shopId }, transaction });
  let seq = count + 1;
  let code;
  do {
    code = `EMP-${shopId}-${String(seq).padStart(4, '0')}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await db.Employee.findOne({
      where: { shop_id: shopId, employment_id: code },
      transaction,
    });
    if (!exists) return code;
    seq += 1;
  } while (seq < count + 1000);
  return `EMP-${shopId}-${Date.now()}`;
}

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

exports.nextEmploymentId = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;
    const employment_id = await nextEmploymentId(shopId);
    return res.json({ employment_id });
  } catch (error) {
    console.error('nextEmploymentId error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) { await transaction.rollback(); return; }

    const data = await validateEmployeePayload(shopId, req.body, { isCreate: true });
    const employment_id = await nextEmploymentId(shopId, transaction);

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
      designation: req.body.designation !== undefined ? req.body.designation : employee.designation,
      phone: req.body.phone !== undefined ? req.body.phone : employee.phone,
      address: req.body.address !== undefined ? req.body.address : employee.address,
      city: req.body.city !== undefined ? req.body.city : employee.city,
      basic_salary: req.body.basic_salary !== undefined ? req.body.basic_salary : employee.basic_salary,
      branch_id: req.body.branch_id !== undefined ? req.body.branch_id : employee.branch_id,
      hire_date: req.body.hire_date !== undefined ? req.body.hire_date : employee.hire_date,
      cnic: req.body.cnic !== undefined ? req.body.cnic : employee.cnic,
    }, { isCreate: false });

    const assign = [
      'name', 'father_name', 'gender', 'designation', 'phone', 'address', 'city',
      'basic_salary', 'hire_date', 'branch_id', 'status',
      ...PROFILE_FIELDS,
    ];
    assign.forEach((f) => {
      if (data[f] !== undefined) employee[f] = data[f];
    });
    if (req.body.cnic !== undefined) {
      employee.cnic = data.cnic;
      employee.cnic_normalized = data.cnic_normalized;
    }
    if (req.body.termination_notes !== undefined) {
      employee.termination_notes = req.body.termination_notes;
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

    const doc = await db.EmployeeDocument.create({
      employee_id: employee.id,
      shop_id: employee.shop_id,
      title: (req.body.title || '').trim() || req.file.originalname,
      file_name: req.file.originalname,
      file_path: relativeFilePath(employee, req.file.filename),
      mime_type: req.file.mimetype,
      file_size: req.file.size,
    });

    return res.status(201).json({
      message: 'Document uploaded',
      document: {
        id: doc.id, title: doc.title, file_name: doc.file_name,
        mime_type: doc.mime_type, file_size: doc.file_size, created_at: doc.created_at,
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
