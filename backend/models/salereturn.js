const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SaleReturn extends Model {
    static associate(models) {
      SaleReturn.belongsTo(models.Shop,     { foreignKey: 'shop_id' });
      SaleReturn.belongsTo(models.Sale,     { foreignKey: 'sale_id' });
      SaleReturn.belongsTo(models.Sale,     { as: 'ExchangeSale', foreignKey: 'exchange_sale_id' });
      SaleReturn.belongsTo(models.Customer, { foreignKey: 'customer_id' });
      SaleReturn.belongsTo(models.Branch,   { foreignKey: 'branch_id' });
      SaleReturn.belongsTo(models.User,     { as: 'ProcessedBy', foreignKey: 'processed_by' });
      SaleReturn.hasMany(models.SaleReturnItem, { foreignKey: 'return_id', as: 'ReturnItems' });
    }
  }
  SaleReturn.init({
    id:                { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    shop_id:           { type: DataTypes.INTEGER, allowNull: false },
    sale_id:           { type: DataTypes.INTEGER, allowNull: false },
    customer_id:       { type: DataTypes.INTEGER, allowNull: true },
    branch_id:         { type: DataTypes.INTEGER, allowNull: false },
    return_number:     { type: DataTypes.STRING,  allowNull: false },
    return_date:       { type: DataTypes.DATE,    allowNull: false },
    return_type:       { type: DataTypes.ENUM('refund', 'exchange'), allowNull: false },
    returned_value:    { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    refund_amount:     { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    exchange_sale_id:  { type: DataTypes.INTEGER, allowNull: true },
    settlement_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    refund_method:     { type: DataTypes.ENUM('cash', 'card', 'bank', 'mobile_wallet', 'store_credit', 'none'), allowNull: false, defaultValue: 'cash' },
    status:            { type: DataTypes.ENUM('completed', 'void'), allowNull: false, defaultValue: 'completed' },
    processed_by:      { type: DataTypes.INTEGER, allowNull: true },
    reason:            { type: DataTypes.STRING,  allowNull: true },
    notes:             { type: DataTypes.TEXT,    allowNull: true },
  }, {
    sequelize,
    modelName: 'SaleReturn',
    tableName: 'sale_returns',
    underscored: true
  });
  return SaleReturn;
};
