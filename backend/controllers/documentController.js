'use strict';

const db = require('../models');
const {
  deleteFileQuiet, relativeFilePath, absoluteFilePath, DOCUMENT_CATEGORIES,
} = require('../utils/documentUploads');

// Generic document CRUD shared by every owner type besides Employee (which
// keeps its own employee_documents table/controller). Mirrors
// employeeController.js's uploadDocument/getDocumentFile/deleteDocument
// almost exactly, scoped by owner_type/owner_id instead of employee_id.

exports.listDocuments = async (req, res) => {
  try {
    const documents = await db.Document.findAll({
      where: { owner_type: req.ownerType, owner_id: req.owner.id, shop_id: req.owner.shop_id },
      attributes: ['id', 'category', 'title', 'file_name', 'mime_type', 'file_size', 'expiry_date', 'created_at'],
      order: [['created_at', 'DESC']],
    });
    return res.json({ documents });
  } catch (error) {
    console.error('listDocuments error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.uploadDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const uploadedFilePath = () => absoluteFilePath(relativeFilePath(req, req.file.filename));

    const category = DOCUMENT_CATEGORIES.includes(req.body.category) ? req.body.category : 'other';

    let expiryDate = null;
    if (req.body.expiry_date) {
      if (Number.isNaN(new Date(req.body.expiry_date).getTime())) {
        deleteFileQuiet(uploadedFilePath());
        return res.status(400).json({ message: 'Invalid expiry_date' });
      }
      expiryDate = req.body.expiry_date;
    }

    const doc = await db.Document.create({
      shop_id: req.owner.shop_id,
      owner_type: req.ownerType,
      owner_id: req.owner.id,
      category,
      title: (req.body.title || '').trim() || req.file.originalname,
      file_name: req.file.originalname,
      file_path: relativeFilePath(req, req.file.filename),
      mime_type: req.file.mimetype,
      file_size: req.file.size,
      expiry_date: expiryDate,
      uploaded_by: req.user?.id || null,
    });

    return res.status(201).json({
      message: 'Document uploaded',
      document: {
        id: doc.id, category: doc.category, title: doc.title, file_name: doc.file_name,
        mime_type: doc.mime_type, file_size: doc.file_size, expiry_date: doc.expiry_date, created_at: doc.created_at,
      },
    });
  } catch (error) {
    console.error('uploadDocument error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getDocumentFile = async (req, res) => {
  try {
    const doc = await db.Document.findOne({
      where: { id: req.params.docId, owner_type: req.ownerType, owner_id: req.owner.id, shop_id: req.owner.shop_id },
    });
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    return res.sendFile(absoluteFilePath(doc.file_path), { headers: { 'Content-Type': doc.mime_type || 'application/octet-stream' } }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ message: 'Document file not found' });
    });
  } catch (error) {
    console.error('getDocumentFile error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.deleteDocument = async (req, res) => {
  try {
    const doc = await db.Document.findOne({
      where: { id: req.params.docId, owner_type: req.ownerType, owner_id: req.owner.id, shop_id: req.owner.shop_id },
    });
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const relPath = doc.file_path;
    await doc.destroy();
    deleteFileQuiet(absoluteFilePath(relPath));

    return res.json({ message: 'Document removed' });
  } catch (error) {
    console.error('deleteDocument error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
