const { merge } = require('webpack-merge');
const baseWebpackConfig = require('./webpack.config.base.js');
const TerserPlugin = require("terser-webpack-plugin");

module.exports = merge(baseWebpackConfig, {
    optimization: {
        minimize: true,
        minimizer: [new TerserPlugin()],
    },
    mode: 'production'
});
