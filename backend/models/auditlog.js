const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AuditLog extends Model {
    static associate(models) {
      AuditLog.belongsTo(models.User, { foreignKey: 'user_id' });
    }
  }
  AuditLog.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false
    },
    table_affected: {
      type: DataTypes.STRING,
      allowNull: false
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
    },
    ip_address: {
      type: DataTypes.STRING,
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
