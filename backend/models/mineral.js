const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Mineral extends Model {
    static associate(models) {
      Mineral.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      Mineral.hasMany(models.Branch, { foreignKey: 'mineral_id' });
      Mineral.hasMany(models.ProductionEntry, { foreignKey: 'mineral_id', as: 'ProductionEntries' });
    }
  }
  Mineral.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(160),
      allowNull: false
    },
    category: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    unit: {
      type: DataTypes.STRING(30),
      defaultValue: 'kg'
    },
    default_price: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0
    },
    royalty_type: {
      type: DataTypes.STRING(20),
      defaultValue: 'percentage'
    },
    royalty_rate: {
      type: DataTypes.DECIMAL(10, 3),
      defaultValue: 0
    },
    // [{ name, value }] — free-form named specs (e.g. Purity, Moisture, Ash Content).
    quality_parameters: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    }
  }, {
    sequelize,
    modelName: 'Mineral',
    tableName: 'minerals',
    underscored: true
  });
  return Mineral;
};
