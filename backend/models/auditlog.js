const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AuditLog extends Model {
    static associate(models) {
      AuditLog.belongsTo(models.User, { foreignKey: 'user_id' });
      AuditLog.belongsTo(models.Shop, { foreignKey: 'shop_id' });
    }
  }
  AuditLog.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    // Automatic request-level audit trail (see middleware/auditLog.js) —
    // logs every authenticated mutating request without per-controller work.
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    method: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    path: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    module: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false
    },
    entity_type: {
      type: DataTypes.STRING,
      allowNull: true
    },
    entity_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    status_code: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    details: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    ip_address: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // Pre-existing columns from the original scaffold — reserved for a future
    // manual before/after diff use case, unused by the automatic trail.
    table_affected: {
      type: DataTypes.STRING,
      allowNull: true
    },
    record_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    old_value: {
      type: DataTypes.JSON,
      allowNull: true
    },
    new_value: {
      type: DataTypes.JSON,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'AuditLog',
    tableName: 'audit_logs',
    underscored: true
  });
  return AuditLog;
};
