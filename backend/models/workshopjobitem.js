const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class WorkshopJobItem extends Model {
    static associate(models) {
      WorkshopJobItem.belongsTo(models.WorkshopJob, { foreignKey: 'workshop_job_id' });
      WorkshopJobItem.belongsTo(models.WorkshopItem, { foreignKey: 'workshop_item_id' });
      WorkshopJobItem.belongsTo(models.Branch, { foreignKey: 'branch_id' });
    }
  }
  WorkshopJobItem.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    workshop_job_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    workshop_item_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    branch_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    quantity: {
      type: DataTypes.DECIMAL(12, 3),
      allowNull: false,
    },
    unit_cost: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    line_total: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
  }, {
    sequelize,
    modelName: 'WorkshopJobItem',
    tableName: 'workshop_job_items',
    underscored: true,
  });
  return WorkshopJobItem;
};
