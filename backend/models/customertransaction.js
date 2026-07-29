const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CustomerTransaction extends Model {
    static associate(models) {
      CustomerTransaction.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      CustomerTransaction.belongsTo(models.Customer, { foreignKey: 'customer_id' });
      CustomerTransaction.belongsTo(models.Sale, { foreignKey: 'related_sale_id' });
      CustomerTransaction.belongsTo(models.User, { as: 'CreatedBy', foreignKey: 'created_by' });
    }
  }
  CustomerTransaction.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    type: {
      // advance_applied = existing store credit consumed by a sale. Recorded for
      // the audit trail only; it does not move the customer's net balance,
      // because the credit was already reflected in it (see SIGN_FOR in
      // controllers/customerLedgerController.js).
      type: DataTypes.ENUM('sale_charge', 'payment_received', 'return_credit', 'opening_balance', 'adjustment', 'advance_applied'),
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    method: {
      type: DataTypes.ENUM('cash', 'bank', 'card', 'mobile_wallet', 'store_credit'),
      allowNull: true
    },
    related_sale_id: {
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
    modelName: 'CustomerTransaction',
    tableName: 'customer_transactions',
    underscored: true
  });
  return CustomerTransaction;
};
