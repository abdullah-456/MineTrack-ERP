const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SupplierTransaction extends Model {
    static associate(models) {
      SupplierTransaction.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      SupplierTransaction.belongsTo(models.Supplier, { foreignKey: 'supplier_id' });
      SupplierTransaction.belongsTo(models.PurchaseInvoice, { as: 'StockBatch', foreignKey: 'stock_batch_id' });
      SupplierTransaction.belongsTo(models.User, { as: 'CreatedBy', foreignKey: 'created_by' });
    }
  }
  SupplierTransaction.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    supplier_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('stock_received', 'payment_made', 'opening_balance', 'adjustment'),
      allowNull: false
    },
    total_amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    paid_amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    remaining_amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    method: {
      type: DataTypes.ENUM('cash', 'bank', 'supplier_credit'),
      allowNull: true
    },
    stock_batch_id: {
      type: DataTypes.INTEGER,
      allowNull: true
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
    modelName: 'SupplierTransaction',
    tableName: 'supplier_transactions',
    underscored: true
  });
  return SupplierTransaction;
};
