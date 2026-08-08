'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Vehicle extends Model {
    static associate(models) {
      Vehicle.belongsTo(models.Branch, { foreignKey: 'assigned_branch_id', as: 'AssignedMine' });
    }
  }
  Vehicle.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    vehicle_number: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
    vehicle_type: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    owner_name: {
      type: DataTypes.STRING(160),
      allowNull: true,
    },
    assigned_branch_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    registration_expiry: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    insurance_expiry: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active',
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    sequelize,
    modelName: 'Vehicle',
    tableName: 'vehicles',
    underscored: true,
  });
  return Vehicle;
};
