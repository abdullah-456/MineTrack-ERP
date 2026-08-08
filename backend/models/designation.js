const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Designation extends Model {
    static associate(models) {
      Designation.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      Designation.hasMany(models.Employee, { foreignKey: 'designation_id' });
    }
  }
  Designation.init({
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
      type: DataTypes.STRING(100),
      allowNull: false
    },
  }, {
    sequelize,
    modelName: 'Designation',
    tableName: 'designations',
    underscored: true
  });
  return Designation;
};
