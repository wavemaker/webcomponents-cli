const Handlebars = require("handlebars");
const fs = require("fs");
const node_path = require("path");
const templates = new Map();

const  initTemplates = () => {
	const templatePath = node_path.resolve(__dirname, './templates');
	templates.set('interceptor', Handlebars.compile(fs.readFileSync(templatePath+'/interceptor.js.hbs', 'utf-8')))
	templates.set('mount-files', Handlebars.compile(fs.readFileSync(templatePath+'/mount.js.hbs', 'utf-8')))
	templates.set('imports', Handlebars.compile(fs.readFileSync(templatePath+'/imports.js.hbs', 'utf-8')))
	templates.set('main-ts', Handlebars.compile(fs.readFileSync(templatePath+'/main.ts.hbs', 'utf-8')))
	templates.set('main-html-ts', Handlebars.compile(fs.readFileSync(templatePath+'/components/Main/main.html.ts.hbs', 'utf-8')));
	templates.set('main-component-ts', Handlebars.compile(fs.readFileSync(templatePath+'/components/Main/main.component.ts.hbs', 'utf-8')));
	templates.set('wm-project-properties', Handlebars.compile(fs.readFileSync(templatePath+'/wm-project-properties.ts.hbs', 'utf-8')));
	templates.set('wc-post-build', Handlebars.compile(fs.readFileSync(templatePath+'/post-build-ng-element.js.hbs', 'utf-8')))
	templates.set('servicedefs', Handlebars.compile(fs.readFileSync(templatePath+'/servicedefs.hbs', 'utf-8')))
	templates.set('wc-webpack-config', Handlebars.compile(fs.readFileSync(templatePath+'/wc-custom-webpack.config.js.hbs', 'utf-8')))
	templates.set('formatters-js', Handlebars.compile(fs.readFileSync(templatePath+'/formatters.js.hbs', 'utf-8')))
	templates.set('docs-html', Handlebars.compile(fs.readFileSync(templatePath+'/docs/index.html.hbs', 'utf-8')));
	templates.set('bootstrap', Handlebars.compile(fs.readFileSync(templatePath+'/bootstrap/bootstrap.js.hbs', 'utf-8')));
	templates.set('auth-info-json', Handlebars.compile(JSON.stringify(fs.readFileSync(templatePath+'/auth-info.json.hbs'))));
	templates.set('prefab-component-script-js', Handlebars.compile((fs.readFileSync(templatePath+'/prefab/prefab.component.script.js.hbs', 'utf-8'))));
};

const getHandlebarTemplate = templateName => templates.get(templateName);
const safeString = content => new Handlebars.SafeString(content);

module.exports = {
	initTemplates,
	getHandlebarTemplate,
	safeString
}