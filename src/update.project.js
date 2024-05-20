const fs = require("fs");
const { path, join } = require('path');
const rimraf = require("rimraf");
const ncp = require("ncp");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const readFile = util.promisify(fs.readFile);

const {
	WEB_COMPONENT_APP_DIR,
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
	getNgBundle,
	getPackageJson,
	getPackageLockJson,
	getPrefabsDir,
	getResourceFilesDir,
	getPrefabName,
	convertToCamelCase,
	getWMPropsObject,
	getGenNgDir,
	getComponentName,
	geti18nDir,
	getPagesDir,
	getWCAppDir
} = require('./utils');

const { getHandlebarTemplate, safeString } = require('./template.helpers');
const node_path = require("path");

const generateNgCode = async (sourceDir) => {
	let codegenPath = node_path.resolve(`./node_modules/@wavemaker/angular-codegen`), codegenCli = node_path.resolve(`${codegenPath}/src/codegen-args-cli.js`);
	let targetDir = node_path.resolve(`${sourceDir}/${WEB_COMPONENT_APP_DIR}`);
	await exec(`cd ${codegenPath} && node ${codegenCli} -s ${sourceDir} -t ${targetDir} --codegenPath=${codegenPath}`);


	// await execCommand(`cd ${codegenPath} && node ${codegenCli} -s ${sourceDir} -t ${targetDir} --codegenPath=${codegenPath}/`);
}

const updatePackageJson = async(sourceDir) => {
	const packageJsonFile = getPackageJson(sourceDir);
	let packageJson = readFileSync(packageJsonFile, true);

	const scriptsConfig = packageJson['scripts'];
	scriptsConfig["build:wcd"] = "node build-scripts/build.js";
	scriptsConfig["build:wc"] = "node build-scripts/build.js --c=production --output-hashing=none";
	scriptsConfig["postbuild:wcd"] = scriptsConfig["postbuild:wc"] = "node build-scripts/post-build-ng-element.js";

	removeCordovaPlugins(packageJson);

	const dependenciesConfig = packageJson['dependencies'];

	//hardcoded for now. get the latest version and use it here
	dependenciesConfig["@wavemaker/variables"] = "11.5.2-next.141102";

	if(dependenciesConfig["@angular/elements"]) {
		console.info("Angular Elements package is already added!")
	} else {
		dependenciesConfig["@angular/elements"] = "15.2.9";
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

const copyWebComponentArtifacts = async projectPath => {
	const wcDistPath = `${projectPath}/dist-wc`;
	rimraf.sync(wcDistPath);

	const bundlePath = getNgBundle(projectPath);
	let distFiles = ["wm-element.js", "main.js"];
	distFiles.forEach(async function(fileName) {
		await ncp(path.resolve(`${projectPath}/dist/ng-bundle/${fileName}`), path.join(wcDistPath, path.basename(fileName)), (err) => {
			if (err) {
				console.error(`Error copying ${projectPath}/dist/ng-bundle/${fileName} to ${wcDistPath}: ${err}`);
			};
		});
	})
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
	delete buildOptions["customWebpackConfig"];
	delete buildOptions["indexTransform"];

	//all the backend resources like i18n/en.json/servicedefs are placed here and move them to ng-bundle dir of the final dist
	buildOptions["assets"].push({
		"glob": "**/*",
		"input": "resources/files/",
		"output": "."
	});

	build["builder"] = "@angular-devkit/build-angular:browser";
	build["configurations"]["production"]["vendorChunk"] = true;
	build["configurations"]["development"]["vendorChunk"] = true;
	//keep this till it stabilises. if prod required pass it as a param to build script (--c=production)
	build["defaultConfiguration"] = "development";

	ngJson["projects"]["angular-app"]["architect"]["build"]["options"] = buildOptions;
	fs.writeFileSync(angularJsonFile, JSON.stringify(ngJson, null, 4), "utf-8");
};

const updateMainTsFile = async(sourceDir) => {
	let prefabName = await getPrefabName(sourceDir);

	const mainTemplate = getMainTs(sourceDir);
	const template = getHandlebarTemplate('mount-files');
	const mountStyles = template({prefabName});

	try {
		fs.appendFileSync(mainTemplate, mountStyles);
		//console.log('String appended to file successfully.');
	} catch (err) {
		console.error('Error appending to file:', err);
	}
};

const updateModuleClass = (appModule, prefabName) => {
	let modDecl = `export class AppModule {}`;
	const template = getHandlebarTemplate('app-module');
	const modifiedDecl = template({prefabName});

	let updatedModule = appModule.replace(modDecl, modifiedDecl);

	let emptyComp = ``;
	let appComp = `bootstrap: [AppComponent]`;
	//no need for default angular bootstraping. will use ngDoBootstrap hook to do custom bootstraping
	updatedModule = updatedModule.replace(appComp, emptyComp);

	return updatedModule;
};

const updateAppModuleProviders = (data, prefabNam) => {
	let provRegex = /providers(\s)*:(\s)*\[/;
	let sInterceptor = `providers: [\n
  {
    provide: HTTP_INTERCEPTORS, 
    useClass:WMInterceptor, 
    multi: true
  },\n
  {
      provide: PREFAB_NAME,
      useValue: "${prefabNam}",
  },\n
  {
   provide: APP_INITIALIZER,
   useFactory: initMetadata,
   deps:[PREFAB_NAME],
   multi: true
  },\n`;
	data = data.replace(provRegex, sInterceptor);
	return data;
};

const updateImports = data => {
	const template = getHandlebarTemplate('imports');
	const contents = template({});
	return `${contents}\n${data}`;
}

const updateInterceptor = (data, prefabName) => {
	const template = getHandlebarTemplate('interceptor');
	const contents = template({prefabName});
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

const updateAppModuleWithPrefabUrls = async (sourceDir, prefabName) => {
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
			let prefabBaseUrl = WM_APPS_META["${prefabName}"].apiUrl + "/app/prefabs";
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

const updateModule = async(sourceDir) => {
	const appModuleFile = getAppModule(sourceDir);
	let appModule = fs.readFileSync(appModuleFile, 'utf8');

	let prefabName = await getPrefabName(sourceDir);

	appModule = updateModuleClass(appModule, prefabName);
	appModule = updateAppModuleProviders(appModule, prefabName);
	appModule = updateImports(appModule);
	appModule = updateInterceptor(appModule, prefabName);
	await fs.writeFileSync(appModuleFile, appModule);

	await updateAppModuleWithPrefabUrls(sourceDir, prefabName);

	console.log(`WEBCOMPONENT NAME | wm-prefab-${prefabName}`);
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

const updatePrefabFile = async(sourceDir) => {
	let prefabName = convertToCamelCase(await getPrefabName(sourceDir));
	const prefabCompTemplate = `${getPrefabsDir(sourceDir)}/${prefabName}/${prefabName}.component.html`;
	let prefabHtml = fs.readFileSync(prefabCompTemplate, 'utf8');

	//just ignore custom scripts. They are already bundles in the scripts.js
	prefabHtml = prefabHtml.replace(`scripts-to-load=`, `custom-scripts-to-load=`);
	await fs.writeFileSync(prefabCompTemplate, prefabHtml);
};

const copyWebComponentBuildFiles = async (sourceDir) => {
	let targetDir = getGenNgDir(sourceDir);
	const template = getHandlebarTemplate('wc-post-build');
	const contents = template({});
	await writeFile(`${targetDir}/build-scripts/post-build-ng-element.js`, contents);
};

const copyResourceFiles = async (sourceDir) => {
	const template = getHandlebarTemplate('locale-json');
	const contents = template({});
	//contents are hardcoded. generate the content and name dynamically
	await writeFile(`${getResourceFilesDir(sourceDir)}/en.json`, contents);
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

const generateDist = async(sourceDir) => {
	let wmProjectProperties = await getWMPropsObject(sourceDir);
	await generateWmProjectProperties(wmProjectProperties, sourceDir);
	await copyWebComponentBuildFiles(sourceDir);
	await copyResourceFiles(sourceDir);
	await installDeps(sourceDir);
	await buildApp(sourceDir);
	// await copyWebComponentArtifacts(sourceDir);
};

module.exports = {
	generateNgCode,
	validateProject,
	updatePackageJson,
	updateAngularJson,
	updateMainTsFile,
	updateModule,
	updateMainFile,
	updatePrefabFile,
	generateDist
}