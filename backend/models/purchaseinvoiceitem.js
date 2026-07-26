const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PurchaseInvoiceItem extends Model {
    static associate(models) {
      PurchaseInvoiceItem.belongsTo(models.PurchaseInvoice, { foreignKey: 'purchase_invoice_id' });
      PurchaseInvoiceItem.belongsTo(models.Product, { foreignKey: 'product_id' });
    }
  }
  PurchaseInvoiceItem.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    purchase_invoice_id: { type: DataTypes.INTEGER, allowNull: false },
    product_id: { type: DataTypes.INTEGER, allowNull: true },
    description: { type: DataTypes.STRING, allowNull: false },
    quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
    unit_cost: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    line_total: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
  }, {
    sequelize,
    modelName: 'PurchaseInvoiceItem',
    tableName: 'purchase_invoice_items',
    underscored: true,
  });
  return PurchaseInvoiceItem;
};
