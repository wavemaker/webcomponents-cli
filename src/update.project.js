const fs = require("fs");
const { path, join } = require('path');
const rimraf = require("rimraf");
const ncp = require("ncp");
const fsp = require('fs').promises;
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const readFile = util.promisify(fs.readFile);
const archiver = require('archiver');
const node_path = require("path");
const { log, error } = require("./console.utils");
global.pagesList = [];
global.allPagesList = [];

const {
	WEB_COMPONENT_APP_DIR,
	CUSTOM_WEBPACK_CONFIG_FILE,
	readFileSync,
	writeFile,
	execCommand,
	readDir,
	stat,
	validateProject,
	getAngularJson,
	getThemesConfigJson,
	getAppModule,
	getMainComponentTemplate,
	getMainTs,
	getBuildScriptsDir,
	getNgBundle,
	getPackageJson,
	getPackageLockJson,
	getPrefabsDir,
	getResourceFilesDir,
	getAppName,
	convertToCamelCase,
	getWMPropsObject,
	getGenNgDir,
	getComponentName,
	geti18nDir,
	getPagesDir,
	getServiceDefsDir,
	getWCAppDir, getWCDistDir, getWCZipFile, getTargetDir, getPagesConfigJson, getPartialsDir
} = require('./utils');

const { getHandlebarTemplate, safeString } = require('./template.helpers');

const generateNgCode = async (sourceDir) => {
	let targetDir = node_path.resolve(`${sourceDir}/${WEB_COMPONENT_APP_DIR}`);
	let wmNgCodegenPkg = global.WMPropsObj.type === "PREFAB" ? '@wavemaker/angular-codegen@11.5.0-next.141661' : `@wavemaker/angular-codegen@${global.appRuntimeVersion}`;
	try {
		fs.mkdirSync(targetDir);
		// log(`Target directory '${targetDir}' created successfully!`);
		await execCommand(`cd ${sourceDir} && npm i --prefix . ${wmNgCodegenPkg} --no-save --no-package-lock`);
	} catch (err) {
		if (err.code === 'EEXIST') {
			await execCommand(`cd ${sourceDir} && npm i --prefix . ${wmNgCodegenPkg} --no-save --no-package-lock`);
			//log(`target directory '${targetDir}' already exists.`);
		} else {
			error(`Error creating directory: ${err.message}`);
		}
	}
	let codegenPath = node_path.resolve(`${sourceDir}/node_modules/@wavemaker/angular-codegen`), codegenCli = node_path.resolve(`${codegenPath}/src/codegen-args-cli.js`);
	await execCommand(`cd ${codegenPath} && node ${codegenCli} -s ${sourceDir} -t ${targetDir} --codegenPath=${codegenPath}/`);
}

const getUpdatedFileForPublishing = async(sourceDir, packageJson) => {
	let appName = await getAppName(sourceDir);
	appName = appName.toLowerCase();

	packageJson["name"] = `@wavemaker/wm-${appName}`;
	packageJson["private"] = false;
	packageJson["main"] = `dist/ng-bundle/wm-${appName}.js`;
	packageJson["files"] = ["dist/ng-bundle/**/*"];

	return packageJson;
}

const isBuildJsFilePresent = async(sourceDir) => {
	let buildJsFile = `${getBuildScriptsDir(sourceDir)}/build.js`;
	return fs.existsSync(buildJsFile);
}

const updatePackageJson = async(sourceDir) => {
	let appName = await getAppName(sourceDir);
	appName = appName.toLowerCase();

	const packageJsonFile = getPackageJson(sourceDir);
	let packageJson = readFileSync(packageJsonFile, true);

	packageJson = await getUpdatedFileForPublishing(sourceDir, packageJson);

	const scriptsConfig = packageJson['scripts'];
	//check for old projects where build.js is not there. Build.js is present in projects with buildonce deploy anywhere feature
	if(await isBuildJsFilePresent(sourceDir)) {
		scriptsConfig["build:wcd"] = "node build-scripts/build.js";
		scriptsConfig["build:wc"] = "node build-scripts/build.js --c=production --output-hashing=none";
	} else {
		scriptsConfig["build:wcd"] = "./node_modules/.bin/ng build";
		scriptsConfig["build:wc"] = "./node_modules/.bin/ng build --c=production --output-hashing=none";
	}
	scriptsConfig["postbuild:wcd"] = scriptsConfig["postbuild:wc"] = `node build-scripts/post-build-ng-element.js --name=${appName}`;

	removeCordovaPlugins(packageJson);

	const dependenciesConfig = packageJson['dependencies'];

	//  gets the latest version always on npm i
	dependenciesConfig["@wavemaker/variables"] = "*";

	if(dependenciesConfig["@angular/elements"]) {
		console.info("Angular Elements package is already added!")
	} else {
		dependenciesConfig["@angular/elements"] = "16.2.12";
	}

	const devDependenciesConfig = packageJson['devDependencies'];
	if(!devDependenciesConfig["fs-extra"]) {
		devDependenciesConfig["fs-extra"] = "^7.0.1";
	}
	if(!devDependenciesConfig["concat"]) {
		devDependenciesConfig["concat"] = "^1.0.3";
	}

	await writeFile(packageJsonFile, JSON.stringify(packageJson, null, 4));
};

const copyWebComponentArtifacts = async( sourceDir ) => {
	return new Promise((resolve, reject) => {
		let distDir = getWCDistDir(sourceDir);
		let zipFile = getWCZipFile(sourceDir);

		const output = fs.createWriteStream(zipFile);
		const archive = archiver('zip', {
			zlib: {level: 9}
		});
		output.on('close', () => {
			console.log(`✅ Archive created successfully: ${zipFile}`);
			console.log(`📦 Total bytes: ${archive.pointer()}`);
			resolve();
		});
		archive.on('error', (err) => {
			reject(err);
		});
		archive.pipe(output);
		archive.directory(distDir, false);
		archive.finalize();
	});
}

const installDeps = async sourceDir => {
	await execCommand(`cd ${getWCAppDir(sourceDir)}`);
	const file = getPackageLockJson(sourceDir);
	rimraf.sync(file);
	await execCommand(`cd ${getWCAppDir(sourceDir)} && npm i`);
}

const buildApp = async sourceDir => {
	await execCommand(`cd ${getWCAppDir(sourceDir)} && npm run build:wc`);
}

const removeScriptsLazyEntries = options =>
	options.map(op => (typeof op === "object" ? op["input"] : op));

const removeStylesLazyEntries = options =>
	options.map(op => (typeof op === "object" && op["input"].indexOf("themes") !== -1 ? op["input"] : op));

const removeCordovaPlugins = (packageJson) => {
	const dependenciesConfig = packageJson['dependencies'];
	for (const key in dependenciesConfig) {
		if (key.startsWith("@awesome-cordova-plugins")) {
			delete dependenciesConfig[key];
		}
	}
}

const updateAngularJson = async(sourceDir) => {
	const angularJsonFile = getAngularJson(sourceDir);
	const ngJson = JSON.parse(fs.readFileSync(angularJsonFile));
	const build = ngJson["projects"]["angular-app"]["architect"]["build"];
	const buildOptions = build["options"];

	buildOptions["scripts"] = removeScriptsLazyEntries(buildOptions["scripts"]);
	buildOptions["styles"] = removeStylesLazyEntries(buildOptions["styles"]);
	buildOptions["customWebpackConfig"]["path"] = `./${CUSTOM_WEBPACK_CONFIG_FILE}`;
	delete buildOptions["indexTransform"];

	//all the backend resources like i18n/en.json/servicedefs are placed here and move them to ng-bundle dir of the final dist
	buildOptions["assets"].push({
		"glob": "**/*",
		"input": "resources/files/",
		"output": "."
	});

	build["configurations"]["production"]["vendorChunk"] = true;
	build["configurations"]["production"]["outputHashing"] = "none";
	build["configurations"]["development"]["vendorChunk"] = true;
	//keep this till it stabilises. if prod required pass it as a param to build script (--c=production)
	build["defaultConfiguration"] = "development";

	ngJson["projects"]["angular-app"]["architect"]["build"]["options"] = buildOptions;
	fs.writeFileSync(angularJsonFile, JSON.stringify(ngJson, null, 4), "utf-8");
};

const updateMainTsFile = async(sourceDir) => {
	let appName = await getAppName(sourceDir);
	appName = appName.toLowerCase();

	const mainTs = getMainTs(sourceDir);

	const template = getHandlebarTemplate('mount-files');
	const mountStyles = template({appName});

	const mainTemplate = getHandlebarTemplate('main-ts');
	const mainTsFileContent = mainTemplate({mountStyles});

	try {
		fs.writeFileSync(mainTs, mainTsFileContent);
	} catch (err) {
		console.error('Error appending to file:', err);
	}
};

const getAppPagesList = async (sourceDir) => {
	if(global.pagesList.length) {
		return global.pagesList;
	} else {
		if(global.WMPropsObj.type === "PREFAB") {
			global.pagesList.push('Main')
		} else {
			let pagesConfig = getPagesConfigJson(sourceDir);
			let pagesData = fs.readFileSync(`${pagesConfig}`, 'utf8');
			let pagesConfigList = JSON.parse(pagesData);
			for (const pageObj of pagesConfigList) {
				if (pageObj.type === "PAGE") {
					global.pagesList.push(pageObj.name)
				}
			}
			return global.pagesList;
		}
	}
}

const getAllPagesList = async (sourceDir) => {
	if(global.allPagesList.length) {
		return global.allPagesList;
	} else {
		if(global.WMPropsObj.type === "PREFAB") {
			global.allPagesList.push({
				"name": "Main",
				"type": "PAGE",
				"params" : []
			})
		} else {
			let pagesConfig = getPagesConfigJson(sourceDir);
			let pagesData = fs.readFileSync(`${pagesConfig}`, 'utf8');
			let pagesConfigList = JSON.parse(pagesData);
			for (const pageObj of pagesConfigList) {
				global.allPagesList.push(pageObj)
			}
		}
		return global.allPagesList;
	}
}

const defineWebComponents = async (sourceDir, appName) => {
	let webComponents = `
		const appComp \= createCustomElement(AppComponent, { injector: this.injector });
		customElements.define(\'wm-${appName}\', appComp);
	`;
	let pagesList = [];//await getAppPagesList(sourceDir);
	pagesList.forEach(pageName => {
		let pName = pageName.toLowerCase();
		// pageName = pageName[0].toUpperCase() + pageName.slice(1);
		webComponents += `
			const ${pName}Comp \= createCustomElement(${pageName}Component, { injector: this.injector });
			customElements.define(\'wm-${appName}-${pName}\', ${pName}Comp);
		`;
		//log(`WEBCOMPONENT NAME | wm-${appName}-${pName}`);
	});
	return webComponents;
}

const updateModuleImports = async (sourceDir, appModule) => {
	let moduleImports = `WM_MODULES_FOR_ROOT,
        AppCodeGenModule,`;
	let pagesList = [];//await getAppPagesList(sourceDir);
	pagesList.forEach(pageName => {
		pageName = pageName[0].toUpperCase() + pageName.slice(1);
		moduleImports += `${pageName}Module,
		`;
	});
	let replaceStr = `WM_MODULES_FOR_ROOT,
        AppCodeGenModule,`;
	appModule = appModule.replace(replaceStr, moduleImports);
	return appModule;
}

const updateModuleClass = async (sourceDir, appModule, appName) => {
	let modDecl = `export class AppModule {}`;
	let webComponents = await defineWebComponents(sourceDir, appName);
	const template = getHandlebarTemplate('app-module');
	const modifiedDecl = template({webComponents});
	let updatedModule = appModule.replace(modDecl, modifiedDecl);

	let emptyComp = ``;
	let appComp = `bootstrap: [AppComponent]`;
	//no need for default angular bootstrapping. will use ngDoBootstrap hook to do custom bootstrapping
	updatedModule = updatedModule.replace(appComp, emptyComp);
	return updatedModule;
};

const updateAppModuleProviders = (data, appName) => {
	let provRegex = /providers(\s)*:(\s)*\[/;
	let sInterceptor = `providers: [\n
  {
    provide: HTTP_INTERCEPTORS, 
    useClass:WMInterceptor, 
    multi: true
  },\n
  {
      provide: PREFAB_NAME,
      useValue: "${appName}",
  },\n
  {
   provide: APP_INITIALIZER,
   useFactory: initMetadata,
   deps:[PREFAB_NAME],
   multi: true
  },\n
  SkipLocationChangeService,
  {
		provide: APP_INITIALIZER,
		useFactory: initializeSkipLocationChange,
		deps: [SkipLocationChangeService],
		multi: true,
  },\n`;
	data = data.replace(provRegex, sInterceptor);
	return data;
};

const getComponentImports = async(sourceDir) => {
	let pagesList = [];//await getAppPagesList(sourceDir);
	let componentImports = '';
	pagesList.forEach(pageName => {
		let capPageName = pageName[0].toUpperCase() + pageName.slice(1);
		if(global.WMPropsObj.type === "PREFAB") {
			componentImports += `import { ${capPageName}Component } from \"./pages/${pageName}/${pageName}.component\";`;
		} else {
			componentImports += `
				import { ${capPageName}Module } from \'./pages/${pageName}/${pageName}.module\';
				import { ${capPageName}Component } from \"./pages/${pageName}/${pageName}.component\";
			`;
		}
	});
	return componentImports;
}

const updateImports = async (sourceDir, data) => {
	const template = getHandlebarTemplate('imports');
	let componentImports = await getComponentImports(sourceDir);
	const contents = template({componentImports});
	return `${contents}\n${data}`;
}

const updateInterceptor = (data, appName) => {
	const template = getHandlebarTemplate('interceptor');
	const contents = template({appName});
	return `${contents}\n${data}`;
}

const getPrefabsUsedInApp = async (projectPath) => {
	let prefabsUsedInProject = [];
	const path = getPrefabsDir(projectPath);

	return stat(path)
		.then(() => {
			return new Promise(async (res, rej) => {
				for (const dir of await readDir(path)) {
					if ((await stat(join(path, dir))).isDirectory()) {
						prefabsUsedInProject.push(dir);
					}
				}
				res(prefabsUsedInProject);
			});
		}, () => Promise.resolve(prefabsUsedInProject))
};

const updateAppModuleWithPrefabUrls = async (sourceDir, appName) => {
	let moduleData = fs.readFileSync(getAppModule(sourceDir), "utf-8");
	await getPrefabsUsedInApp(sourceDir).then(function(prefabs) {
		if(!prefabs.length) {
			return
		}
		const prefabsStr = `["${prefabs.join('", "')}"]`;
		let prefabPattern = /(export const isPrefabInitialized = initPrefabConfig\(\);)/ig;
		let prefabUrlsTemplate = `
        import { getPrefabConfig } from '../framework/util/page-util';
        export function downloadPrefabsScripts() {
			//@ts-ignore
			let prefabBaseUrl = WM_APPS_META["${appName}"].apiUrl + "/app/prefabs";
			let usedPrefabs = ${prefabsStr};
			usedPrefabs.forEach(function(prefabName){
				let prefabConfig = getPrefabConfig(prefabName);
				let prefabUrl = prefabBaseUrl + "/" + prefabName;
				prefabConfig.resources.scripts = prefabConfig.resources.scripts.map(script => prefabUrl + script)
				prefabConfig.resources.styles = prefabConfig.resources.styles.map(style => prefabUrl + style)
			});
        }
        `;
		moduleData = moduleData.replace(prefabPattern, "$1\n" + prefabUrlsTemplate);
		fs.writeFileSync(`${getAppModule(sourceDir)}`, moduleData, "utf-8");
	});
};

const updateAppModule = async(sourceDir) => {
	const appModuleFile = getAppModule(sourceDir);
	let appModule = fs.readFileSync(appModuleFile, 'utf8');

	let appName = await getAppName(sourceDir);
	appName = appName.toLowerCase();
	appModule = await updateModuleClass(sourceDir, appModule, appName);
	appModule = await updateModuleImports(sourceDir, appModule);
	appModule = updateAppModuleProviders(appModule, appName);
	appModule = await updateImports(sourceDir, appModule);
	appModule = updateInterceptor(appModule, appName);
	await fs.writeFileSync(appModuleFile, appModule);

	await updateAppModuleWithPrefabUrls(sourceDir, appName);

	log(`WEBCOMPONENT NAME | wm-${appName}`);

};


const updateMainFile = async(sourceDir) => {
	let markup, pageName = "Main", wmProjectProperties = getWMPropsObject(sourceDir), prefabName = wmProjectProperties.name;
	const mainComponent = getHandlebarTemplate('main-component-ts');
	markup = mainComponent({
		name: pageName,
		prefabName,
		componentName: getComponentName(pageName),
		enableSpa: false
	});

	await writeFile(`${getPagesDir(sourceDir)}/${pageName}/${pageName}.component.ts`, markup);

	const mainCompTemplate = getMainComponentTemplate(sourceDir);
	let mainHtml = fs.readFileSync(mainCompTemplate, 'utf8');

	mainHtml = mainHtml.replace(`ng-container  *ngIf="compilePageContent"`, `ng-container`);
	await fs.writeFileSync(mainCompTemplate, mainHtml);
};

const updateComponentFiles = async(sourceDir) => {
	let allPagesList = await getAllPagesList(sourceDir);
	allPagesList.forEach(pageObj => {
		let pageName = pageObj.name;
		let pName = pageName.toLowerCase();
		//pageName = pageName[0].toUpperCase() + pageName.slice(1);
		let pagePath = pageObj.type === "PAGE" ? `${getPagesDir(sourceDir)}` : ((pageObj.type === "PARTIAL" || pageObj.type === "HEADER" || pageObj.type === "TOPNAV" || pageObj.type === "FOOTER" || pageObj.type === "RIGHTNAV" || pageObj.type === "LEFTNAV" || pageObj.type === "POPOVER") ? `${getPartialsDir(sourceDir)}` : `${getPrefabsDir(sourceDir)}`);
		//let path = global.WMPropsObj.type === "PREFAB" ? `${getPrefabsDir(sourceDir)}` : `${pagePath}`;
		const pageCompTemplate = `${pagePath}/${pageName}/${pageName}.component.html`;
		let pageHtml = fs.readFileSync(pageCompTemplate, 'utf8');

		//just ignore custom scripts. They are already bundles in the scripts.js
		pageHtml = pageHtml.replace(`scripts-to-load=`, `custom-scripts-to-load=`);
		fs.writeFileSync(pageCompTemplate, pageHtml);
	});
};

const copyWebComponentBuildFiles = async (sourceDir) => {
	let targetDir = getGenNgDir(sourceDir);
	const template = getHandlebarTemplate('wc-post-build');
	const contents = template({});
	await writeFile(`${targetDir}/build-scripts/post-build-ng-element.js`, contents);
};

const copyWebpackConfigFiles = async (sourceDir) => {
	let targetDir = getGenNgDir(sourceDir);
	const template = getHandlebarTemplate('wc-webpack-config');
	const contents = template({});
	await writeFile(`${targetDir}/wc-custom-webpack.config.js`, contents);
};

const copyResourceFiles = async (sourceDir) => {
	let appName = await getAppName(sourceDir);

	let sourceI18nDir = geti18nDir(sourceDir);
	const i18nFiles = fs.readdirSync(sourceI18nDir);
	let destI18nDir = getResourceFilesDir(sourceDir);

	i18nFiles.forEach(i18nFile => {
		const sourcePath = join(sourceI18nDir, i18nFile);
		const destPath = join(destI18nDir, i18nFile);

		try {
			fs.copyFileSync(sourcePath, destPath);
			log(`Copied ${sourcePath} to ${destPath}`);
		} catch (err) {
			error(`Error copying file ${sourcePath}: ${err}`);
		}
	});
};

const getActiveTheme = async (sourceDir) => {
	let themesConfigPath = getThemesConfigJson(sourceDir);
	return JSON.parse(await readFile(`${themesConfigPath}`, 'utf8'));
}

const getPreferredLanguage = async (sourceDir) => {
	// request header "Accept-Language" with value as "en-US,en;q=0.9,te-IN;q=0.8,te;q=0.7"
	let languages = {};
	languages["preferredLanguage"] = "en-US";
	return languages;
}

const getSupportedLanguages = async (sourceDir) => {
	let languageFolder = geti18nDir(sourceDir);
	let languages = {
		"supportedLanguages": {}
	};

	const languageFiles = await readDir(languageFolder);
	for (const langFile of languageFiles) {
		try {
			let langContent = await getLangContent(`${languageFolder}/${langFile}`);
			let lang = {};
			let langName = langFile.split(".json")[0];
			lang[langName] = langContent;
			Object.assign(languages["supportedLanguages"], lang);
		} catch (err) {
			console.error(`Error reading ${langFile}:`, err);
		}
	}
	return languages;
}

const getLangContent = async (filePath) => {
	return JSON.parse(await readFile(filePath, 'utf8')).files;
}

const getAdditionalProps = async (sourceDir) => {
	let additionalProps = {
		"securityEnabled" : false
	};
	let activeThemeObj = await getActiveTheme(sourceDir);
	Object.assign(additionalProps, activeThemeObj);

	let preferredLanguage = await getPreferredLanguage(sourceDir);
	Object.assign(additionalProps, preferredLanguage);

	let supportedLanguages = await getSupportedLanguages(sourceDir);
	Object.assign(additionalProps, supportedLanguages);

	return additionalProps;
}

const generateWmProjectProperties = async (properties, sourceDir) => {
	let targetDir = getGenNgDir(sourceDir);
	const template = getHandlebarTemplate('wm-project-properties');
	const additionalProperties = await getAdditionalProps(sourceDir);
	const contents = template({properties: safeString(JSON.stringify(properties, undefined, 4)), additionalProperties: safeString(JSON.stringify(additionalProperties, undefined, 4))});
	await writeFile(`${targetDir}/src/app/wm-project-properties.ts`, contents);
};

const generateServiceDefs = async (sourceDir) => {
	let targetDir = getGenNgDir(sourceDir);
	const template = getHandlebarTemplate('servicedefs');
	let defs = global.WMPropsObj.type === "PREFAB" ? {} : await getMergedServiceDefs(sourceDir);
	const contents = template({defs: safeString(JSON.stringify(defs, undefined, 4))});
	await writeFile(`${targetDir}/resources/files/servicedefs`, contents);
};

const generateSecurityInfo = async (sourceDir) => {
	let targetDir = getGenNgDir(sourceDir);
	const template = getHandlebarTemplate('security-info');
	const contents = template();
	await writeFile(`${targetDir}/resources/files/info`, contents);
};

const getMergedServiceDefs = async (sourceDir) => {
	let serviceDefsDir = getServiceDefsDir(sourceDir);
	try {
		const serviceDefsObject = {};
		for (const file of await readDir(serviceDefsDir)) {
			const filePath = join(serviceDefsDir, file);
			const stats = await fsp.stat(filePath);
			if (stats.isFile() && node_path.extname(filePath) === '.json') {
				const fileContent = await fsp.readFile(filePath, 'utf-8');
				const jsonData = JSON.parse(fileContent);
				Object.assign(serviceDefsObject, jsonData);
			}
		}
		return serviceDefsObject;
	} catch (err) {
		console.error(`Error - ${err}`);
	}
}

const generateDist = async(sourceDir) => {
	let wmProjectProperties = await getWMPropsObject(sourceDir);
	await generateWmProjectProperties(wmProjectProperties, sourceDir);
	await copyWebComponentBuildFiles(sourceDir);
	await copyWebpackConfigFiles(sourceDir);

	await generateServiceDefs(sourceDir);
	await generateSecurityInfo(sourceDir);
	await copyResourceFiles(sourceDir);

	await installDeps(sourceDir);
	await buildApp(sourceDir);
	await copyWebComponentArtifacts(sourceDir);
};

const generateDummyUIBuildDir = async(sourceDir) => {
	let targetDir = node_path.resolve(`${sourceDir}/target/ui-build/output-files`);
	try {
		fs.mkdirSync(targetDir, { recursive: true });
		log(`Target directory '${targetDir}' created successfully!`);
	} catch (err) {
		if (err.code === 'EEXIST') {
			log(`target directory '${targetDir}' already exists.`);
		} else {
			error(`Error creating directory: ${err.message}`);
		}
	}
};

module.exports = {
	generateNgCode,
	validateProject,
	updatePackageJson,
	updateAngularJson,
	updateMainTsFile,
	updateAppModule,
	updateMainFile,
	updateComponentFiles,
	generateDist,
	generateDummyUIBuildDir
}
