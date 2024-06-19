const fs = require("fs");
const path  = require('path');
const util = require("util");
const exec = util.promisify(require("child_process").exec);

const { spawnSync} = require('child_process');

const acorn = require('acorn');
const es = require('estraverse');
const node_path = require("path");

const stat = util.promisify(fs.stat);
const readDir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);
const { log, error } = require("./console.utils");
const WEB_COMPONENT_APP_DIR = "generated_wc_app";
const CUSTOM_WEBPACK_CONFIG_FILE = "wc-custom-webpack.config.js";

const getWCAppDir = sourceDir => path.resolve(`${sourceDir}/${WEB_COMPONENT_APP_DIR}`);
const getSrcDir = sourceDir => path.resolve(`${getWCAppDir(sourceDir)}/src`);
const getAppDir = sourceDir => path.resolve(`${getSrcDir(sourceDir)}/app`);
const getPagesDir = sourceDir => path.resolve(`${getAppDir(sourceDir)}/pages`);
const getPrefabsDir = sourceDir => path.resolve(`${getAppDir(sourceDir)}/prefabs`);
const getProfilesDir = sourceDir => path.resolve(`${sourceDir}/profiles`);
const getWebappDir = sourceDir => path.resolve(`${getSrcDir(sourceDir)}/main/webapp`);
const getThemesDir = sourceDir => path.resolve(`${getWebappDir(sourceDir)}/themes`);
const getPackageJson = sourceDir => path.resolve(`${getWCAppDir(sourceDir)}/package.json`);
const getPackageLockJson = sourceDir => path.resolve(`${getWCAppDir(sourceDir)}/package-lock.json`);
const getAngularJson = sourceDir => path.resolve(`${getWCAppDir(sourceDir)}/angular.json`);
const getThemesConfigJson = sourceDir => path.resolve(`${sourceDir}/src/main/webapp/themes/themes-config.json`);
const getMainTs = sourceDir => path.resolve(`${getSrcDir(sourceDir)}/main.ts`);
const getMainComponentTemplate = sourceDir => path.resolve(`${getPagesDir(sourceDir)}/Main/Main.component.html`);
const getAppModule = sourceDir => path.resolve(`${getAppDir(sourceDir)}/app.module.ts`);
const getResourceFilesDir = sourceDir => path.resolve(`${getWCAppDir(sourceDir)}/resources/files`);
const getWMProjectPropsFile = sourceDir => path.resolve(`${getAppDir(sourceDir)}/wm-project-properties.ts`);
const geti18nDir = sourceDir => path.resolve(`${sourceDir}/i18n`);
const getGenNgDir = sourceDir => path.resolve(`${getWCAppDir(sourceDir)}`);
const getTargetDir = sourceDir => path.resolve(`${sourceDir}/target`);
const getServiceDefsDir = sourceDir => path.resolve(`${getTargetDir(sourceDir)}/classes/servicedefs`);
const getNgBundle = sourceDir => path.resolve(`${getWCAppDir(sourceDir)}/dist/ng-bundle`);
const getComponentName = name => `${upperFirst(name)}Component`;

const WMPropsObj = {};

const isEmpty = (obj) => Object.keys(obj).length === 0;

const upperFirst = str => {
	if (str.length === 0) {
		return str;
	}
	return str.charAt(0).toUpperCase() + str.slice(1);
}

const writeFile = util.promisify(fs.writeFile);

const readFileSync = (path, isJson) => {
	let rawData = fs.readFileSync(path);
	if(isJson){
		return JSON.parse(rawData);
	}
	return rawData;
};

const validateProject = async (sourceDir) => {
	const filePath = getAngularJson(sourceDir);
	fs.lstat(filePath, (err, stats) => {
		if (err) {
			throw err;
		}
	})
	//add check for prefab project. Should work only with prefab project anything else throw error
};

const execCommand = async (command) => {
	try {
		// await exec(`${command}`);
		const commandProcess = spawnSync(command, { stdio: 'inherit', shell: true });
		if (commandProcess.status === 0) {
			log(`Executed the command - ${command} - successfully!`);
		} else {
			error('Error during command - ', commandProcess.error || commandProcess.stderr);
			process.exit(1);
		}
	} catch (err) {
		error(`Synchronous error - ${err}`);
		throw err;
	}

}

const convertToCamelCase = (inputString) => {
	const words = inputString.split('_');
	const capitalizedWords = words.map(word => {
		return word.charAt(0).toUpperCase() + word.slice(1);
	});
	return capitalizedWords.join('_');
}

const getWMPropsObject = async(sourceDir) => {
	if(!isEmpty(WMPropsObj)) {
		return WMPropsObj;
	} else {
		let wmProps = getWMProjectPropsFile(sourceDir);
		const code = fs.readFileSync(wmProps, 'utf8');
		const ast = acorn.parse(code, { sourceType: "module" });
		es.traverse(ast, {
			enter: (node) => {
				if (node.type === 'VariableDeclarator' && node.id.name === 'properties') {
					node.init.properties.forEach(property => {
						let key;
						if (property.key.type === 'Identifier') {
							key = property.key.name;
						} else if (property.key.type === 'Literal') {
							key = property.key.value;
						}
						WMPropsObj[key] = property.value.value;
					});
				}
			}
		});
		return WMPropsObj;
	}
}

const getPrefabName = async(sourceDir) => {
	let propsObj = await getWMPropsObject(sourceDir);
	return propsObj['name'];
};

module.exports = {
	WEB_COMPONENT_APP_DIR,
	CUSTOM_WEBPACK_CONFIG_FILE,
	readFileSync,
	writeFile,
	execCommand,
	readDir,
	stat,
	getAppModule,
	getMainComponentTemplate,
	getMainTs,
	getPrefabsDir,
	getProfilesDir,
	getResourceFilesDir,
	getWMProjectPropsFile,
	getPackageJson,
	getPackageLockJson,
	getAngularJson,
	getThemesConfigJson,
	geti18nDir,
	getTargetDir,
	getWCAppDir,
	getNgBundle,
	getPagesDir,
	getServiceDefsDir,
	getGenNgDir,
	validateProject,
	getPrefabName,
	getWMPropsObject,
	getComponentName,
	convertToCamelCase
}