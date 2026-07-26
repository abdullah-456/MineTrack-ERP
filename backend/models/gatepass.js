const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class GatePass extends Model {
    static associate(models) {
      GatePass.belongsTo(models.Shop,     { foreignKey: 'shop_id' });
      GatePass.belongsTo(models.Branch,   { foreignKey: 'branch_id' });
      GatePass.belongsTo(models.Sale,     { foreignKey: 'sale_id' });
      GatePass.belongsTo(models.Customer, { foreignKey: 'customer_id' });
      GatePass.belongsTo(models.User,     { as: 'Issuer', foreignKey: 'created_by' });
      GatePass.hasMany(models.GatePassItem, { foreignKey: 'gate_pass_id', as: 'GatePassItems' });
    }
  }

  GatePass.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    branch_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    gate_pass_number: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    sale_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    customer_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    customer_phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    gate_pass_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('sale_dispatch', 'pre_sale', 'transfer', 'return', 'other'),
      defaultValue: 'sale_dispatch'
    },
    vehicle_no: {
      type: DataTypes.STRING,
      allowNull: true
    },
    driver_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    driver_phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'cancelled'),
      defaultValue: 'active'
    }
  }, {
    sequelize,
    modelName: 'GatePass',
    tableName: 'gate_passes',
    underscored: true
  });

  return GatePass;
};
