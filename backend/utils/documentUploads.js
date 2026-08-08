'use strict';

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
// Reuse the same error class the global handler in server.js already checks
// with `instanceof UploadValidationError` — a separately-declared class here
// would silently fall through to the generic 500 handler instead.
const { UploadValidationError } = require('./employeeUploads');

// Generic version of employeeUploads.js for every owner type besides Employee.
// Files live outside the repo tree at backend/uploads/documents/<ownerType>/<shopId>/<ownerId>/
// — same ephemeral-filesystem caveat as employeeUploads.js applies on hosts
// without a persistent disk mount.
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads', 'documents');

const DOCUMENT_CATEGORIES = ['license', 'cnic', 'contract', 'vehicle_papers', 'insurance', 'lease', 'other'];

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DOCUMENT_TYPES = [
  ...IMAGE_TYPES,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

function ownerDir(req) {
  return path.join(UPLOAD_ROOT, req.ownerType, String(req.owner.shop_id), String(req.owner.id));
}

function safeExt(originalName) {
  const ext = path.extname(originalName || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
  return ext.slice(0, 10);
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      const dir = ownerDir(req);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (e) {
      cb(e);
    }
  },
  filename(req, file, cb) {
    const category = DOCUMENT_CATEGORIES.includes(req.body.category) ? req.body.category : 'other';
    cb(null, `${category}-${uuidv4()}${safeExt(file.originalname)}`);
  },
});

function fileFilter(req, file, cb) {
  if (!DOCUMENT_TYPES.includes(file.mimetype)) {
    return cb(new UploadValidationError(`Document — unsupported file type: ${file.mimetype}`));
  }
  cb(null, true);
}

const documentUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

function deleteFileQuiet(absPath) {
  if (!absPath) return;
  fs.promises.unlink(absPath).catch(() => {});
}

// Stored relative to UPLOAD_ROOT with forward slashes, matching
// employeeUploads.js's cross-host rationale.
function relativeFilePath(req, filename) {
  return [req.ownerType, String(req.owner.shop_id), String(req.owner.id), filename].join('/');
}

function absoluteFilePath(relPath) {
  return path.join(UPLOAD_ROOT, ...relPath.split('/'));
}

module.exports = {
  documentUpload,
  deleteFileQuiet,
  relativeFilePath,
  absoluteFilePath,
  DOCUMENT_CATEGORIES,
  UploadValidationError,
  UPLOAD_ROOT,
};
