const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProductionEntry extends Model {
    static associate(models) {
      ProductionEntry.belongsTo(models.Shop,     { foreignKey: 'shop_id' });
      ProductionEntry.belongsTo(models.Branch,   { foreignKey: 'mine_id', as: 'Mine' });
      ProductionEntry.belongsTo(models.Pit,      { foreignKey: 'pit_id', as: 'Pit' });
      ProductionEntry.belongsTo(models.Bench,    { foreignKey: 'bench_id', as: 'Bench' });
      ProductionEntry.belongsTo(models.Mineral,  { foreignKey: 'mineral_id', as: 'Mineral' });
      ProductionEntry.belongsTo(models.Employee, { foreignKey: 'supervisor_id', as: 'Supervisor' });
    }
  }
  ProductionEntry.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    mine_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    pit_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    bench_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    shift: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    mineral_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    quantity: {
      type: DataTypes.DECIMAL(15, 3),
      defaultValue: 0
    },
    unit: {
      type: DataTypes.STRING(30),
      defaultValue: 'kg'
    },
    supervisor_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'ProductionEntry',
    tableName: 'production_entries',
    underscored: true
  });
  return ProductionEntry;
};
