const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Pit extends Model {
    static associate(models) {
      Pit.belongsTo(models.Shop,   { foreignKey: 'shop_id' });
      Pit.belongsTo(models.Branch, { foreignKey: 'mine_id', as: 'Mine' });
      Pit.hasMany(models.Bench,    { foreignKey: 'pit_id', as: 'Benches' });
      Pit.hasMany(models.ProductionEntry, { foreignKey: 'pit_id', as: 'ProductionEntries' });
    }
  }
  Pit.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    mine_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    area_name: {
      type: DataTypes.STRING(160),
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(30),
      defaultValue: 'active'
    },
    gps_coordinates: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Pit',
    tableName: 'pits',
    underscored: true
  });
  return Pit;
};
