const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DeletionRequest extends Model {
    static associate(models) {
      DeletionRequest.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      DeletionRequest.belongsTo(models.User, { as: 'Requester', foreignKey: 'requested_by' });
      DeletionRequest.belongsTo(models.User, { as: 'Reviewer', foreignKey: 'reviewed_by' });
    }
  }
  DeletionRequest.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    module: {
      type: DataTypes.STRING,
      allowNull: false
    },
    entity_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    entity_label: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      defaultValue: 'pending'
    },
    request_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    requested_by: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    reviewed_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    review_note: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'DeletionRequest',
    tableName: 'deletion_requests',
    underscored: true
  });
  return DeletionRequest;
};
