const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Category extends Model {
    static associate(models) {
      Category.belongsTo(models.Category, { as: 'Parent', foreignKey: 'parent_category_id' });
      Category.hasMany(models.Category, { as: 'Subcategories', foreignKey: 'parent_category_id' });
      Category.hasMany(models.Product, { foreignKey: 'category_id' });
    }
  }
  Category.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: true // enforced non-null at the application layer (categoryController)
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    parent_category_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Category',
    tableName: 'categories',
    underscored: true
  });
  return Category;
};
