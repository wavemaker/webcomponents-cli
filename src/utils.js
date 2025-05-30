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
const {getHandlebarTemplate} = require("./template.helpers");
const WEB_COMPONENT_APP_DIR = "generated-angular-app";
const CUSTOM_WEBPACK_CONFIG_FILE = "wc-custom-webpack.config.js";

const getWCAppDir = sourceDir => path.resolve(`${sourceDir}/${WEB_COMPONENT_APP_DIR}`);
const getWCDistDir = sourceDir => path.resolve(`${getWCAppDir(sourceDir)}/dist`);
const getSrcDir = sourceDir => path.resolve(`${getWCAppDir(sourceDir)}/src`);
const getBuildScriptsDir = sourceDir => path.resolve(`${getWCAppDir(sourceDir)}/build-scripts`);
const getAppDir = sourceDir => path.resolve(`${getSrcDir(sourceDir)}/app`);
const getSrcAppDir = sourceDir => path.resolve(`${sourceDir}/src`);
const getSrcWebappDir = sourceDir => path.resolve(`${sourceDir}/src/main/webapp`);
const getExtensionsDir = sourceDir => path.resolve(`${getSrcWebappDir(sourceDir)}/extensions`);
const getSrcPagesDir = sourceDir => path.resolve(`${getSrcWebappDir(sourceDir)}/pages`);
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
const getAppConfig = sourceDir => path.resolve(`${getAppDir(sourceDir)}/app.config.ts`);
const getResourceFilesDir = sourceDir => path.resolve(`${getWCAppDir(sourceDir)}/resources/files`);
const getWMProjectPropsFile = sourceDir => path.resolve(`${getAppDir(sourceDir)}/wm-project-properties.ts`);
const getPOMXml = sourceDir => node_path.resolve(`${sourceDir}/pom.xml`);
const getWMPropertiesXml = sourceDir => node_path.resolve(`${sourceDir}/.wmproject.properties`);
const geti18nDir = sourceDir => path.resolve(`${sourceDir}/i18n`);
const getGenNgDir = sourceDir => path.resolve(`${getWCAppDir(sourceDir)}`);
const getTargetDir = sourceDir => path.resolve(`${sourceDir}/target`);
const getUIResourcesDir = sourceDir => path.resolve(`${getTargetDir(sourceDir)}/ui-resources`);
const getWCZipFile = sourceDir => path.resolve(`${getTargetDir(sourceDir)}/wc-artifact.zip`);
const getServiceDefsDir = sourceDir => path.resolve(`${getSrcDir(sourceDir)}/servicedefs`);
const getNgBundle = sourceDir => path.resolve(`${getWCAppDir(sourceDir)}/dist/ng-bundle`);
const getComponentName = name => `${upperFirst(name)}Component`;
const getServicesDir = sourceDir => path.resolve(`${sourceDir}/services/securityService/designtime`);
const isPrismProject = () => global.WMPropsObj.template === 'PRISM';

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

/**
 * Recursively copy a directory synchronously with exclusions
 * @param {string} src - The source directory
 * @param {string} dest - The destination directory
 * @param {string[]} exclude - List of directories or files to exclude
 */
const copyDirWithExclusionsSync = (src, dest, exclude = []) => {
	// Create destination directory if it doesn't exist
	if (!fs.existsSync(dest)) {
		fs.mkdirSync(dest, { recursive: true });
	}

	// Read the contents of the source directory
	let entries = [];
	try {
		entries = fs.readdirSync(src, { withFileTypes: true });
	} catch (err) {
		if (err.code === 'ENOENT') {
			//console.log(`Directory "${src}" does not exist. Continuing...`);
		} else {
			throw err; // Re-throw other errors
		}
	}

	for (const entry of entries) {
		const srcPath = node_path.join(src, entry.name);
		const destPath = node_path.join(dest, entry.name);

		// Skip files/directories that are in the exclude list
		if (exclude.includes(entry.name)) {
			//console.log(`Skipping: ${srcPath}`);
			continue;
		}

		if (entry.isDirectory()) {
			// Recursively copy the subdirectory
			copyDirWithExclusionsSync(srcPath, destPath, exclude);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

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
	await updateGlobalProps(sourceDir);
	log("*************************************************************");
	log("Project Metadata");
	log("*************************************************************");
	log(`Display Name: ${propsObj['displayName']}`);
	log(`Platform Type: ${propsObj['platformType']}`);
	log(`Application Type: ${propsObj['type']}`);
	log(`Application Version: ${propsObj['version']}`);
	log(`Application HomePage: ${propsObj['homePage']}`);
	await logAppRuntimeVersion(sourceDir);
	global.actualType = `${propsObj['type']}`;
	log("*************************************************************");
}

const isPrefabProject = () => {
	return global.actualType === "PREFAB";
}

const updateGlobalProps = async(sourceDir) => {
	global.propsObj = await getWMPropsFromXml(sourceDir);
}

const escapeHtml = (htmlString) => {
	//.replace(/&/g, '&amp;')
	return htmlString
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

const generateDocs = async(sourceDir) => {
	let appName = global.WMPropsObj.name;
	let appTag = appName.toLowerCase();
	let codeSnippet = escapeHtml(`<wm-${appTag}></wm-${appTag}>`);
	let script = escapeHtml(`<script src="http[s]://HOST_NAME/bootstrap-${appTag}.js" data-api-url="http[s]://API_HOST_NAME/<>"></script>`);
	let prefabProps = "";
	const isPrefab = isPrefabProject();
	if(isPrefab) {
		prefabProps = fs.readFileSync(`${getTargetDir(sourceDir)}/ui-resources/docs/index.html`, 'utf8');
	}
	const docsTemplate = getHandlebarTemplate('docs-html');
	const docsHtml = docsTemplate({appName, codeSnippet, script, prefabProps, appTag, isPrefab});
	try {
		if (!fs.existsSync(`${getWCAppDir(sourceDir)}/resources/docs`)) {
			fs.mkdirSync(`${getWCAppDir(sourceDir)}/resources/docs`, { recursive: true });
		}
		fs.writeFileSync(`${getWCAppDir(sourceDir)}/resources/docs/index.html`, docsHtml);
	} catch (err) {
		console.error(`Error creating the docs file ${getWCAppDir(sourceDir)}/resources/docs/index.html - `, err);
	}
}

module.exports = {
	WEB_COMPONENT_APP_DIR,
	CUSTOM_WEBPACK_CONFIG_FILE,
	readFileSync,
	writeFile,
	execCommand,
	readDir,
	stat,
	getAppConfig,
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
	getSrcDir,
	getSrcAppDir,
	getWCDistDir,
	getWCZipFile,
	getBuildScriptsDir,
	getNgBundle,
	getExtensionsDir,
	getSrcWebappDir,
	getSrcPagesDir,
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
	logProjectMetadata,
	copyDirWithExclusionsSync,
	updateGlobalProps,
	generateDocs,
	isPrefabProject,
	getServicesDir,
	isPrismProject
}
