const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class GatePassItem extends Model {
    static associate(models) {
      GatePassItem.belongsTo(models.GatePass, { foreignKey: 'gate_pass_id' });
      GatePassItem.belongsTo(models.Product,  { foreignKey: 'product_id' });
    }
  }

  GatePassItem.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    gate_pass_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    product_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    quantity: {
      type: DataTypes.DECIMAL(12, 3),
      allowNull: false
    },
    unit: {
      type: DataTypes.STRING,
      defaultValue: 'kg'
    },
    notes: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'GatePassItem',
    tableName: 'gate_pass_items',
    underscored: true
  });

  return GatePassItem;
};
