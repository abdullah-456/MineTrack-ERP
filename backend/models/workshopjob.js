const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class WorkshopJob extends Model {
    static associate(models) {
      WorkshopJob.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      WorkshopJob.belongsTo(models.Branch, { foreignKey: 'branch_id' });
      WorkshopJob.belongsTo(models.Vehicle, { foreignKey: 'vehicle_id' });
      WorkshopJob.belongsTo(models.Employee, { foreignKey: 'employee_id' });
      WorkshopJob.belongsTo(models.User, { foreignKey: 'created_by' });
      WorkshopJob.hasMany(models.WorkshopJobItem, { foreignKey: 'workshop_job_id' });
    }
  }
  WorkshopJob.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    job_number: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
    branch_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    vehicle_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    employee_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    mechanic_name: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    date_in: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    date_out: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('in_progress', 'completed', 'cancelled'),
      allowNull: false,
      defaultValue: 'in_progress',
    },
    odometer_reading: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    work_description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    labor_cost: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    parts_cost: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    total_cost: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  }, {
    sequelize,
    modelName: 'WorkshopJob',
    tableName: 'workshop_jobs',
    underscored: true,
  });
  return WorkshopJob;
};
