'use strict';

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { UploadValidationError } = require('./employeeUploads');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads', 'approvals');

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

function safeExt(originalName) {
  const ext = path.extname(originalName || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
  return ext.slice(0, 10);
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      const shopId = req.body?.shop_id || req.user?.shop_id || 'unknown';
      const dir = path.join(UPLOAD_ROOT, String(shopId));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (e) {
      cb(e);
    }
  },
  filename(req, file, cb) {
    cb(null, `attachment-${uuidv4()}${safeExt(file.originalname)}`);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    return cb(new UploadValidationError(`Unsupported file type: ${file.mimetype}`));
  }
  cb(null, true);
}

const approvalUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

function deleteFileQuiet(absPath) {
  if (!absPath) return;
  fs.promises.unlink(absPath).catch(() => {});
}

function relativeFilePath(shopId, filename) {
  return [String(shopId), filename].join('/');
}

function absoluteFilePath(relPath) {
  return path.join(UPLOAD_ROOT, ...relPath.split('/'));
}

module.exports = {
  approvalUpload,
  deleteFileQuiet,
  relativeFilePath,
  absoluteFilePath,
  UPLOAD_ROOT,
};
