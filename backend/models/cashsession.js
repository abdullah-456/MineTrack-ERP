const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CashSession extends Model {
    static associate(models) {
      CashSession.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      CashSession.belongsTo(models.User, { as: 'CreatedBy', foreignKey: 'created_by' });
    }
  }
  CashSession.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    session_date: {
      type: DataTypes.DATEONLY,  // 'YYYY-MM-DD' — one per shop per day
      allowNull: false
    },
    opening_cash: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    closing_cash: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true   // null until day is closed
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'CashSession',
    tableName: 'cash_sessions',
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['shop_id', 'session_date']
      }
    ]
  });
  return CashSession;
};
