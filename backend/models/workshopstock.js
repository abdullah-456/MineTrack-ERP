const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class WorkshopStock extends Model {
    static associate(models) {
      WorkshopStock.belongsTo(models.WorkshopItem, { foreignKey: 'workshop_item_id' });
      WorkshopStock.belongsTo(models.Branch, { foreignKey: 'branch_id' });
    }
  }
  WorkshopStock.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    workshop_item_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    branch_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    quantity_on_hand: {
      type: DataTypes.DECIMAL(12, 3),
      allowNull: false,
      defaultValue: 0,
    },
    avg_cost: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
  }, {
    sequelize,
    modelName: 'WorkshopStock',
    tableName: 'workshop_stock',
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['workshop_item_id', 'branch_id'],
      },
    ],
  });
  return WorkshopStock;
};
