const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class InstallmentSchedule extends Model {
    static associate(models) {
      InstallmentSchedule.belongsTo(models.InstallmentPlan, { foreignKey: 'plan_id' });
      InstallmentSchedule.hasMany(models.InstallmentPayment, { foreignKey: 'schedule_id' });
    }
  }
  InstallmentSchedule.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    plan_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    installment_no: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    due_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    due_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'paid', 'overdue'),
      defaultValue: 'pending'
    },
    late_fee: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00
    }
  }, {
    sequelize,
    modelName: 'InstallmentSchedule',
    tableName: 'installment_schedule',
    underscored: true
  });
  return InstallmentSchedule;
};
