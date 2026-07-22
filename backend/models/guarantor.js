const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Guarantor extends Model {
    static associate(models) {
      Guarantor.belongsTo(models.Customer, { foreignKey: 'customer_id' });
    }
  }
  Guarantor.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    cnic: {
      type: DataTypes.STRING,
      allowNull: false
    },
    cnic_normalized: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    relation: {
      type: DataTypes.STRING,
      allowNull: true
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Guarantor',
    tableName: 'guarantors',
    underscored: true
  });
  return Guarantor;
};
