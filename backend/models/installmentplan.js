const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class InstallmentPlan extends Model {
    static associate(models) {
      InstallmentPlan.belongsTo(models.Sale, { foreignKey: 'sale_id' });
      InstallmentPlan.belongsTo(models.Customer, { foreignKey: 'customer_id' });
      InstallmentPlan.hasMany(models.InstallmentSchedule, { foreignKey: 'plan_id' });
    }
  }
  InstallmentPlan.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    sale_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    total_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    down_payment: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    },
    number_of_installments: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    frequency: {
      type: DataTypes.ENUM('weekly', 'monthly'),
      defaultValue: 'monthly'
    },
    start_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('active', 'closed', 'defaulted'),
      defaultValue: 'active'
    }
  }, {
    sequelize,
    modelName: 'InstallmentPlan',
    tableName: 'installment_plans',
    underscored: true
  });
  return InstallmentPlan;
};
