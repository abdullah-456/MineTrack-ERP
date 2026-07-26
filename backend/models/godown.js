const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Godown extends Model {
    static associate(models) {
      Godown.belongsTo(models.Shop,   { foreignKey: 'shop_id' });
      Godown.hasMany(models.Branch,   { foreignKey: 'godown_id', as: 'Branches' });
    }
  }
  Godown.init({
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
      type: DataTypes.STRING,
      allowNull: false
    },
    code: {
      type: DataTypes.STRING,
      allowNull: true
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'disabled'),
      defaultValue: 'active'
    }
  }, {
    sequelize,
    modelName: 'Godown',
    tableName: 'godowns',
    underscored: true
  });
  return Godown;
};
