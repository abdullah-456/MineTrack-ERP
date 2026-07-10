const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class InstallmentPayment extends Model {
    static associate(models) {
      InstallmentPayment.belongsTo(models.InstallmentSchedule, { foreignKey: 'schedule_id' });
      InstallmentPayment.belongsTo(models.Voucher, { foreignKey: 'voucher_id' });
    }
  }
  InstallmentPayment.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    schedule_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    amount_paid: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    payment_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    method: {
      type: DataTypes.ENUM('cash', 'card', 'bank', 'mobile_wallet'),
      allowNull: false
    },
    late_fee_charged: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    voucher_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'InstallmentPayment',
    tableName: 'installment_payments',
    underscored: true
  });
  return InstallmentPayment;
};
