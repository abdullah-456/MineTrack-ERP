const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Bench extends Model {
    static associate(models) {
      Bench.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      Bench.belongsTo(models.Pit,  { foreignKey: 'pit_id', as: 'Pit' });
      Bench.hasMany(models.ProductionEntry, { foreignKey: 'bench_id', as: 'ProductionEntries' });
    }
  }
  Bench.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    pit_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    bench_number: {
      type: DataTypes.STRING(40),
      allowNull: false
    },
    elevation: {
      type: DataTypes.STRING(40),
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(30),
      defaultValue: 'active'
    }
  }, {
    sequelize,
    modelName: 'Bench',
    tableName: 'benches',
    underscored: true
  });
  return Bench;
};
