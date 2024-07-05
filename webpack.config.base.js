const path = require(`path`);
const nodeExternals = require(`webpack-node-externals`);
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
	entry: `./src/webcomponent.cli.js`,
	output: {
		path: path.resolve(__dirname,`dist`),
		filename: `webcomponents.cli.bundle.js`
	},
	plugins: [
		new CopyWebpackPlugin({
			patterns: [
				{ from: './src/templates', to: 'templates' }
			],
		}),
	],
	target: `node`,
	externals: [nodeExternals()]
}