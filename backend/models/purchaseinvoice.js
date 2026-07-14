const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PurchaseInvoice extends Model {
    static associate(models) {
      PurchaseInvoice.belongsTo(models.Supplier, { foreignKey: 'supplier_id' });
      PurchaseInvoice.belongsTo(models.Voucher, { foreignKey: 'voucher_id' });
    }
  }
  PurchaseInvoice.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    supplier_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    grn_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    invoice_number: {
      type: DataTypes.STRING,
      allowNull: false
    },
    invoice_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    due_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('unpaid', 'partial', 'paid'),
      defaultValue: 'unpaid'
    },
    voucher_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'PurchaseInvoice',
    tableName: 'purchase_invoices',
    underscored: true
  });
  return PurchaseInvoice;
};
