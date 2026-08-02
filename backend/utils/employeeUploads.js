'use strict';

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

// Files live outside the repo tree at backend/uploads/employees/<shopId>/<employeeId>/
// so a redeploy or `git clean` never touches uploaded documents. On a host with an
// ephemeral filesystem (e.g. Render's default web service) this directory is wiped
// on every deploy/restart — mount a persistent disk at backend/uploads in that case.
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads', 'employees');

class UploadValidationError extends Error {}

function employeeDir(employee) {
  return path.join(UPLOAD_ROOT, String(employee.shop_id), String(employee.id));
}

function safeExt(originalName) {
  const ext = path.extname(originalName || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
  return ext.slice(0, 10);
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DOCUMENT_TYPES = [
  ...IMAGE_TYPES,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

function makeStorage(prefix) {
  return multer.diskStorage({
    destination(req, file, cb) {
      try {
        const dir = employeeDir(req.employee);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (e) {
        cb(e);
      }
    },
    filename(req, file, cb) {
      cb(null, `${prefix}-${uuidv4()}${safeExt(file.originalname)}`);
    },
  });
}

function makeFilter(allowedTypes, label) {
  return (req, file, cb) => {
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new UploadValidationError(`${label} — unsupported file type: ${file.mimetype}`));
    }
    cb(null, true);
  };
}

const employeeUpload = {
  photo: multer({
    storage: makeStorage('photo'),
    fileFilter: makeFilter(IMAGE_TYPES, 'Photo'),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  }),
  cnic: multer({
    storage: makeStorage('cnic'),
    fileFilter: makeFilter(IMAGE_TYPES, 'CNIC image'),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  }),
  documents: multer({
    storage: makeStorage('doc'),
    fileFilter: makeFilter(DOCUMENT_TYPES, 'Document'),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  }),
};

function deleteFileQuiet(absPath) {
  if (!absPath) return;
  fs.promises.unlink(absPath).catch(() => {});
}

// Stored in the DB relative to UPLOAD_ROOT (not absolute, and always with forward
// slashes) so records stay valid across hosts/environments — e.g. written on a
// Windows dev machine but read back on a Linux deploy, where a literal backslash
// wouldn't be treated as a path separator.
function relativeFilePath(employee, filename) {
  return [String(employee.shop_id), String(employee.id), filename].join('/');
}

function absoluteFilePath(relPath) {
  return path.join(UPLOAD_ROOT, ...relPath.split('/'));
}

module.exports = {
  employeeUpload,
  employeeDir,
  deleteFileQuiet,
  relativeFilePath,
  absoluteFilePath,
  UploadValidationError,
  UPLOAD_ROOT,
};
