const fs = require("fs");
const xml2js = require('xml2js');
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
const WEB_COMPONENT_APP_DIR = "generated-angular-app";
const CUSTOM_WEBPACK_CONFIG_FILE = "wc-custom-webpack.config.js";

const getWCAppDir = sourceDir => path.resolve(`${sourceDir}/${WEB_COMPONENT_APP_DIR}`);
const getWCDistDir = sourceDir => path.resolve(`${getWCAppDir(sourceDir)}/dist/ng-bundle`);
const getSrcDir = sourceDir => path.resolve(`${getWCAppDir(sourceDir)}/src`);
const getBuildScriptsDir = sourceDir => path.resolve(`${getWCAppDir(sourceDir)}/build-scripts`);
const getAppDir = sourceDir => path.resolve(`${getSrcDir(sourceDir)}/app`);
const getPagesDir = sourceDir => path.resolve(`${getAppDir(sourceDir)}/pages`);
const getPartialsDir = sourceDir => path.resolve(`${getAppDir(sourceDir)}/partials`);
const getPagesConfigJson = sourceDir => path.resolve(`${sourceDir}/src/main/webapp/pages/pages-config.json`);
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
const getPOMXml = sourceDir => node_path.resolve(`${sourceDir}/pom.xml`);
const getWMPropertiesXml = sourceDir => node_path.resolve(`${sourceDir}/.wmproject.properties`);
const geti18nDir = sourceDir => path.resolve(`${sourceDir}/i18n`);
const getGenNgDir = sourceDir => path.resolve(`${getWCAppDir(sourceDir)}`);
const getTargetDir = sourceDir => path.resolve(`${sourceDir}/target`);
const getUIResourcesDir = sourceDir => path.resolve(`${getTargetDir(sourceDir)}/ui-resources`);
const getWCZipFile = sourceDir => path.resolve(`${getTargetDir(sourceDir)}/wc-artifact.zip`);
const getServiceDefsDir = sourceDir => path.resolve(`${getTargetDir(sourceDir)}/classes/servicedefs`);
const getNgBundle = sourceDir => path.resolve(`${getWCAppDir(sourceDir)}/dist/ng-bundle`);
const getComponentName = name => `${upperFirst(name)}Component`;

global.WMPropsObj = {};

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
	if(!isEmpty(global.WMPropsObj)) {
		return global.WMPropsObj;
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
						global.WMPropsObj[key] = property.value.value;
					});
				}
			}
		});
		return global.WMPropsObj;
	}
}

const getWMPropsFromXml = async(sourceDir) => {
	if(!isEmpty(global.WMPropsObj)) {
		return global.WMPropsObj;
	} else {
		const parser = new xml2js.Parser();
		let wmPropsXmlFile = getWMPropertiesXml(sourceDir);
		const wmPropsXmlData = fs.readFileSync(wmPropsXmlFile, 'utf-8');
		let wmPropsJsonData = {};
		parser.parseString(wmPropsXmlData, (err, result) => {
			if (err) {
				throw err;
			}
			wmPropsJsonData = result;
		});
		if (wmPropsJsonData.properties.entry) {
			wmPropsJsonData.properties.entry.forEach(entry => {
				const key = entry.$.key;
				const value = entry._ ? entry._.trim() : '';
				global.WMPropsObj[key] = value;
			});
		}
		return global.WMPropsObj;
	}
}

const getAppName = async(sourceDir) => {
	if(global.appName) {
		return global.appName;
	}
	let propsObj = await getWMPropsObject(sourceDir);
	global.appName = propsObj['name'];
	return global.appName;
};

const logAppRuntimeVersion = async(sourceDir) => {
	const pomContent = fs.readFileSync(getPOMXml(sourceDir), "utf8");
	const RUNTIME_TAG_BEGIN = `<wavemaker.app.runtime.ui.version>`;
	const RUNTIME_TAG_END = `</wavemaker.app.runtime.ui.version>`;
	let pVersion = '';
	let vStart = pomContent.indexOf(RUNTIME_TAG_BEGIN),
		vEnd = pomContent.indexOf(RUNTIME_TAG_END);
	if (vStart && vEnd) {
		vStart = vStart + RUNTIME_TAG_BEGIN.length;
		pVersion = pomContent.substr(vStart, vEnd - vStart).trim();
	}
	global.appRuntimeVersion = pVersion;

	log(`App RuntimeVersion : ${global.appRuntimeVersion}`);
}

const logProjectMetadata = async(sourceDir) => {
	let propsObj = await getWMPropsFromXml(sourceDir);
	global.propsObj = propsObj;
	log("*************************************************************");
	log("Project Metadata");
	log("*************************************************************");
	log(`Display Name: ${propsObj['displayName']}`);
	log(`Platform Type: ${propsObj['platformType']}`);
	log(`Application Type: ${propsObj['type']}`);
	log(`Application Version: ${propsObj['version']}`);
	log(`Application HomePage: ${propsObj['homePage']}`);
	await logAppRuntimeVersion(sourceDir);
	log("*************************************************************");
}

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
	getPOMXml,
	getWMPropertiesXml,
	getPackageJson,
	getPackageLockJson,
	getAngularJson,
	getThemesConfigJson,
	geti18nDir,
	getTargetDir,
	getUIResourcesDir,
	getWCAppDir,
	getWCDistDir,
	getWCZipFile,
	getBuildScriptsDir,
	getNgBundle,
	getPagesDir,
	getPartialsDir,
	getPagesConfigJson,
	getServiceDefsDir,
	getGenNgDir,
	validateProject,
	getAppName,
	getWMPropsObject,
	getComponentName,
	convertToCamelCase,
	logProjectMetadata
}