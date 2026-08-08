'use strict';

const { Model } = require('sequelize');

// Polymorphic — owner_type/owner_id point at whichever table the document
// belongs to (branch/supplier/customer/board_member/vehicle/shop), so there's
// no belongsTo association here. Employee documents stay on their own
// employee_documents table/model instead of this one.
module.exports = (sequelize, DataTypes) => {
  class Document extends Model {}
  Document.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    owner_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    owner_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'other',
    },
    title: {
      type: DataTypes.STRING(160),
      allowNull: true,
    },
    file_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    file_path: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    mime_type: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    file_size: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    expiry_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    uploaded_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  }, {
    sequelize,
    modelName: 'Document',
    tableName: 'documents',
    underscored: true,
  });
  return Document;
};
