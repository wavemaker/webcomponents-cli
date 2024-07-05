const { merge } = require('webpack-merge');
const baseWebpackConfig = require('./webpack.config.base.js');

module.exports = merge(baseWebpackConfig, {
	mode: 'development',
	devtool: 'cheap-module-source-map'
});
