const path = require(`path`);
const nodeExternals = require(`webpack-node-externals`);

module.exports = {
    entry: `./src/webcomponent.cli.js`,
    output: {
        path: path.resolve(__dirname,`dist`),
        filename: `webcomponents.cli.bundle.js`
    },
    target: `node`,
    externals: [nodeExternals()],
    mode: `production`
}