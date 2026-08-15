const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class WorkshopItem extends Model {
    static associate(models) {
      WorkshopItem.hasMany(models.WorkshopStock, { foreignKey: 'workshop_item_id' });
      WorkshopItem.hasMany(models.WorkshopStockMovement, { foreignKey: 'workshop_item_id' });
      WorkshopItem.hasMany(models.WorkshopJobItem, { foreignKey: 'workshop_item_id' });
    }
  }
  WorkshopItem.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    item_code: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(160),
      allowNull: false,
    },
    unit: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },
    unit_price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active',
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    sequelize,
    modelName: 'WorkshopItem',
    tableName: 'workshop_items',
    underscored: true,
  });
  return WorkshopItem;
};
