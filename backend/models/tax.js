const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Tax extends Model {
    static associate(models) {}
  }
  Tax.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    rate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false // e.g. 17.00
    },
    applicable_on: {
      type: DataTypes.ENUM('sales', 'purchases', 'both'),
      defaultValue: 'both'
    }
  }, {
    sequelize,
    modelName: 'Tax',
    tableName: 'taxes',
    underscored: true
  });
  return Tax;
};
