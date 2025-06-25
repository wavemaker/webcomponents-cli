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
	getWCAppDir, getWCDistDir, getWCZipFile, getTargetDir, getUIResourcesDir, getPagesConfigJson, getPartialsDir,
	copyDirWithExclusionsSync, getSrcDir, isPrefabProject, isPrismProject,
	getAppConfig,
	getWMProjectPropsFile
} = require('./utils');

const { getHandlebarTemplate, safeString } = require('./template.helpers');

const loadCodegenDynamically = async (sourceDir) => {
	let codegenPath = node_path.resolve(node_path.join(`${sourceDir}`, 'node_modules', '@wavemaker', 'angular-codegen')),
		codegenCli = node_path.resolve(node_path.join(`${codegenPath}`,	'src', 'codegen-cli.js'));
	// Use `eval` to prevent Webpack from analyzing the `require` call statically, where as the path is dynamic
	return eval('require')(codegenCli);
}

const generateNgCode = async (sourceDir) => {
	let targetDir = node_path.resolve(`${sourceDir}/${WEB_COMPONENT_APP_DIR}`);
	let wmNgCodegenPkg = `@wavemaker/angular-codegen@${global.appRuntimeVersion}`;
	try {
		fs.mkdirSync(targetDir);
		// log(`Target directory '${targetDir}' created successfully!`);
		await execCommand(`cd ${sourceDir} && npm i --prefix . ${wmNgCodegenPkg} --legacy-peer-deps --no-save --no-package-lock`);
	} catch (err) {
		if (err.code === 'EEXIST') {
			await execCommand(`cd ${sourceDir} && npm i --prefix . ${wmNgCodegenPkg} --legacy-peer-deps --no-save --no-package-lock`);
			//log(`target directory '${targetDir}' already exists.`);
		} else {
			error(`Error creating directory: ${err.message}`);
		}
	}

	let codegenPath = node_path.resolve(node_path.join(`${sourceDir}`, 'node_modules', '@wavemaker', 'angular-codegen'));
	const { generateCodegenAngularApp } = await loadCodegenDynamically(sourceDir);
	let deployUrl = `ng-bundle/`, apiUrl = "./";

	console.log('Generating the angular App...');
	console.log("API-Url - ", apiUrl, " - CDN-Url - ", deployUrl);
	let additionalArgs = !isPrismProject() ? {} : { buildType: 'angular', 'generateOverrideCSS': true, 'runtimeUIVersion': global.appRuntimeVersion };
	await generateCodegenAngularApp(sourceDir, targetDir, deployUrl, false, codegenPath, false, false, apiUrl, additionalArgs);
	console.log('Angular app generated !');
	// await execCommand(`cd ${codegenPath} && node ${codegenCli} -s ${sourceDir} -t ${targetDir} --codegenPath=${codegenPath}/`);
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

	packageJson["dependencies"]["@wavemaker/custom-widgets-m3"] = global.appRuntimeVersion;
	packageJson["dependencies"]["@wavemaker/foundation-css"] = global.appRuntimeVersion;

	await writeFile(packageJsonFile, JSON.stringify(packageJson, null, 4));
};

const copyWebComponentArtifacts = async( sourceDir ) => {
	return new Promise((resolve, reject) => {
		let distDir = getWCDistDir(sourceDir);
		distDir = node_path.join(distDir, "ng-bundle");
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
	// const file = getPackageLockJson(sourceDir);
	// rimraf.sync(file);
	await execCommand(`cd ${getWCAppDir(sourceDir)} && npm i`);
	//check this later
	await execCommand(`cd ${getWCAppDir(sourceDir)} && npm i acorn@8.14.0 --save-dev`);
}

const buildApp = async sourceDir => {
	await execCommand(`cd ${getWCAppDir(sourceDir)} && npm run build:wc`);
}

const removeScriptsLazyEntries = options =>
	options.map(op => (typeof op === "object" ? op["input"] : op));

const removeStylesLazyEntries = options => {
	let extractedStyles = options.map(op =>
		(typeof op === "object" && op["input"] ? op["input"] : op)
	);
	// Remove "src/assets/print.css"
	extractedStyles = extractedStyles.filter(style => style !== "src/assets/print.css");
	return extractedStyles;
}

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

	buildOptions["outputPath"] = 'dist/ng-bundle';
	buildOptions["index"]["output"] = '../index.html';
	buildOptions["scripts"] = removeScriptsLazyEntries(buildOptions["scripts"]);
	buildOptions["styles"] = removeStylesLazyEntries(buildOptions["styles"]);
	buildOptions["customWebpackConfig"]["path"] = `./${CUSTOM_WEBPACK_CONFIG_FILE}`;
	delete buildOptions["indexTransform"];

	//all the backend resources like i18n/en.json/servicedefs are placed here and move them to ng-bundle dir of the final dist
	let otherAssets = [
		{
			"glob": "favicon.png",
			"input": "resources/",
			"output": "."
		},
		{
			"glob": "font.config.js",
			"input": "resources/",
			"output": "."
		},
		{
			"glob": "**/*",
			"input": "src/servicedefs/",
			"output": "/servicedefs/"
		},
		{
			"glob": "**/*",
			"input": "resources/bootstrap/",
			"output": "."
		},
		{
			"glob": "**/*",
			"input": "resources/docs/",
			"output": "/docs/"
		},
		{
			"glob": "**/*",
			"input": "resources/i18n/",
			"output": "/i18n/"
		},
		{
			"glob": "**/*",
			"input": "resources/",
			"output": "/resources/",
			"ignore": [
				"**/*.json",
				"**/*.txt",
				"**/*.properties",
				"**/*.xml"
			]
		}
	];
	buildOptions["assets"].push(...otherAssets);

	build["configurations"]["production"]["outputHashing"] = "none";
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
	const mountStyles = template({appName, isWebApp: global.WMPropsObj.type !== "PREFAB"});

	const mainTemplate = getHandlebarTemplate('main-ts');

	const isPrefab = global.WMPropsObj.type === "PREFAB";
	let pagesPathList = isPrefab? ['Main'] : await getAppPagesList(sourceDir);

	let webComponents = await defineWebComponents(sourceDir, appName);

	const mainTsFileContent = mainTemplate({mountStyles, isPrefab: isPrefab, webComponents : webComponents});

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
		if(isPrefabProject()) {
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
		if(isPrefabProject()) {
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
	createApplication(appConfig).then((appRef) => {
		const injector = appRef.injector;
		baseHref = injector.get(APP_BASE_HREF);
		zone = injector.get(NgZone);
		if (!customElements.get('wm-${appName}')) {

            const CustomElement = createCustomElement(AppComponent, { injector }) as any;

			const customConnectedEvent = new Event("${appName}-onConnected");
            const customDisconnectedEvent = new Event("${appName}-onDisconnected");

            class CustomElementWithHooks extends CustomElement {
                constructor(){
                    super();
                }

                connectedCallback() {
                    super.connectedCallback();
                    window.dispatchEvent(customConnectedEvent);
                }

                disconnectedCallback() {
                    super.disconnectedCallback();
					window.dispatchEvent(customDisconnectedEvent);
                }

                connectedMoveCallback() {

                }

                adoptedCallback() {

                }

                attributeChangedCallback(name: string, oldValue: string, newValue: string) {
                    super.attributeChangedCallback(name, oldValue, newValue);
                }

                static get observedAttributes() {
                    return []; 
                }
            }

            customElements.define('wm-${appName}', CustomElementWithHooks as unknown as CustomElementConstructor );
        }

		bootstrap(appRef, baseHref);
	})
	.catch(err => console.error("-----------------------Error creating application:", err))
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

const updateConfigImports = async (sourceDir, data) => {
    // Find the wmModules array and modify it
    const wmModulesRegex = /const wmModules = \[\s*importProvidersFrom\(\s*([\s\S]*?)\)\s*\];/;
    const match = data.match(wmModulesRegex);

    if (match) {
        let wmModulesContent = match[1];

        // Append the required modules if they don't already exist
        if (!wmModulesContent.includes('HttpClientModule')) {
            wmModulesContent += '\n        HttpClientModule';
        }
        if (!wmModulesContent.includes('AppCodeGenModule')) {
            wmModulesContent += ',\n        AppCodeGenModule';
        }

        const updatedWmModules = `const wmModules = [\n    importProvidersFrom(\n${wmModulesContent}\n    )\n];`;

        // Replace the old wmModules definition with the updated one
        data = data.replace(wmModulesRegex, updatedWmModules);
	}

	return data;

};

const updateAppConfigProviders = async (data, appName, sourceDir) => {
	const isPrefab = global.WMPropsObj.type === "PREFAB";
 	let pagesPathList = isPrefab? ['Main'] : await getAppPagesList(sourceDir);

	if(!isPrefab){
		data = data.replace(/^\s*provideRouter\(\s*routes\s*,\s*withHashLocation\(\)\s*,\s*withComponentInputBinding\(\)\s*\),?\s*$/gm, '        provideRouter(routes, withComponentInputBinding()),');
		data = data.replace(/^\s*{ provide: LocationStrategy, useClass: HashLocationStrategy },?\s*$/gm, '');
		data = data.replace(/(?<=providers:\s*\[\s*((?:.|\n)*?))^\s*CanDeactivateNgPageGuard,?\s*$/gm,'        { provide: CanDeactivateNgPageGuard, useClass: CustomCanDeactivateGuard },');
	}

	let wmModulesRegex = /\.\.\.wmModules,?/; // Matches `...wmModules,` or `...wmModules`

	let newProviders = `
        {
            provide: HTTP_INTERCEPTORS, 
            useClass: WMInterceptor, 
            multi: true
        },
        {
            provide: PREFAB_NAME,
            useValue: "${appName}",
        },
        {
            provide: APP_INITIALIZER,
            useFactory: initMetadata,
            deps: [PREFAB_NAME],
            multi: true
        },
        SkipLocationChangeService,
        {
            provide: APP_INITIALIZER,
            useFactory: initializeSkipLocationChange,
            deps: [SkipLocationChangeService],
            multi: true,
        },
		{
			provide: APP_BASE_HREF,
			useFactory: () => {
				if(${isPrefab}){
					return;
				}
				const fullUrl = window.location.href;
				const pathList = ${JSON.stringify(pagesPathList)};
				const url = new URL(fullUrl);
	
				const pathname = url.pathname; 
				const matchedPath = pathList.find(path => pathname.includes(path));
				let baseHref;
				if(matchedPath){
					const index = pathname.indexOf(matchedPath);
					const beforePath = pathname.substring(0, index); 
	
					baseHref = beforePath.endsWith('/') 
										? beforePath.slice(0, -1) 
										: beforePath;
				}else {
					baseHref = pathname.endsWith('/')
										? pathname.slice(0, -1)
										: pathname 
				}

				return baseHref;
			}
		},\n`;

		data = data.replace(wmModulesRegex, `...wmModules,${newProviders}`);
		return data;
};

const getComponentImports = async(sourceDir) => {
	let pagesList = [];//await getAppPagesList(sourceDir);
	let componentImports = '';
	pagesList.forEach(pageName => {
		let capPageName = pageName[0].toUpperCase() + pageName.slice(1);
		if(isPrefabProject()) {
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

const updateInterceptor = async (data, appName, sourceDir) => {
	const template = getHandlebarTemplate('interceptor');
	const isPrefab = global.WMPropsObj.type === 'PREFAB'
	let pagesPathList = isPrefab ? ['Main'] : await getAppPagesList(sourceDir);

	let contents = template({appName, isPrefab: isPrefab});
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

const copyUsedPrefabResources = async (sourceDir) => {
	const prefabDir = node_path.resolve(`${sourceDir}/src/main/webapp/WEB-INF/prefabs`);
	return stat(prefabDir)
		.then(() => {
			return new Promise(async (res, rej) => {
				for (const dir of await readDir(prefabDir)) {
					if ((await stat(join(prefabDir, dir))).isDirectory()) {
						let src = join(prefabDir, dir);
						let dest =  node_path.resolve(`${getWCAppDir(sourceDir)}/resources/${dir}`);
						//copying except resources. Not needed now
						copyDirWithExclusionsSync(src, dest, ["resources", "js", "css"]);
						//copying resources to prefab resources directly
						copyDirWithExclusionsSync(`${src}/webapp/resources`, `${dest}/resources`, ["resources"]);
						copyDirWithExclusionsSync(`${src}/webapp/js`, `${dest}/js`, []);
						copyDirWithExclusionsSync(`${src}/webapp/css`, `${dest}/css`, []);
					}
				}
				if(isPrefabProject()) {
					let src = node_path.resolve(`${sourceDir}/src/main/webapp/resources`);
					let dest =  node_path.resolve(`${getWCAppDir(sourceDir)}/resources/${global.WMPropsObj.name}/resources`);
					copyDirWithExclusionsSync(src, dest, []);
				}
				res();
			});
		}, () => Promise.resolve())
};

const updateAppConfigWithPrefabUrls = async (sourceDir, appName) => {
	let configData = fs.readFileSync(getAppConfig(sourceDir), "utf-8");
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
			let prefabBaseUrl = WM_APPS_META["${appName}"].artifactsUrl;
			let usedPrefabs = ${prefabsStr};
			usedPrefabs.forEach(function(prefabName){
				let prefabConfig = getPrefabConfig(prefabName);
				let prefabUrl = prefabBaseUrl + "resources/" + prefabName;
				prefabConfig.resources.scripts = prefabConfig.resources.scripts.map(script => prefabUrl + script)
				prefabConfig.resources.styles = prefabConfig.resources.styles.map(style => prefabUrl + style)
			});
        }
        `;
		configData = configData.replace(prefabPattern, "$1\n" + prefabUrlsTemplate);
		fs.writeFileSync(`${getAppConfig(sourceDir)}`, configData, "utf-8");
	});
	await copyUsedPrefabResources(sourceDir);
};

const updateAppConfig = async(sourceDir) => {
	const appConfigFile = getAppConfig(sourceDir);
	let appConfig = fs.readFileSync(appConfigFile, 'utf8');

	let appName = await getAppName(sourceDir);
	appName = appName.toLowerCase();
	appConfig = await updateConfigImports(sourceDir, appConfig);
	appConfig = await updateAppConfigProviders(appConfig, appName, sourceDir);
	appConfig = await updateImports(sourceDir, appConfig),
	appConfig = await updateInterceptor(appConfig, appName, sourceDir);
	await fs.writeFileSync(appConfigFile, appConfig);

	await updateAppConfigWithPrefabUrls(sourceDir, appName);
	log(`WEBCOMPONENT NAME | wm-${appName}`);
}

const updatePrefabScriptFile = async(sourceDir) => {

	const prefabName = global.WMPropsObj.name;
	const filePath = `${getWCAppDir(sourceDir)}/src/app/prefabs/${prefabName}/${prefabName}.component.script.js`;
	let fileContent = fs.readFileSync(filePath, 'utf8');

	const prefabScript = getHandlebarTemplate('prefab-component-script-js');
	const prefabScriptContent = prefabScript({});

	fileContent = fileContent.replace(
		/(export\s+const\s+initScript\s*=\s*\(\s*Prefab\s*,\s*App\s*,\s*Utils\s*\)\s*=>\s*\{)/,
		`$1
		${prefabScriptContent}
		`
	);

	fileContent = fileContent.replace(
        /(Prefab\.onReady\s*=\s*function\s*\(\)\s*\{)/,
        `$1\n\t\tconst event = new CustomEvent('init');\n\t\ttargetNode.dispatchEvent(event);\n`
    );

	fs.writeFileSync(filePath, fileContent, 'utf8');
	console.log("prefab comp ts file updated");
}

const updateMainFile = async(sourceDir) => {
	const mainCompTemplate = getMainComponentTemplate(sourceDir);
	let mainHtml = fs.readFileSync(mainCompTemplate, 'utf8');

	mainHtml = mainHtml.replace(`ng-container  *ngIf="compilePageContent"`, `ng-container`);
	await fs.writeFileSync(mainCompTemplate, mainHtml);
};

const updateComponentFiles = async(sourceDir) => {
	let baseDirectories = ["pages", "partials", "prefabs"];

	baseDirectories.forEach((baseDir) => {
		const fullPath = `${getSrcDir(sourceDir)}/app/${baseDir}`;

		if (fs.existsSync(fullPath)) {
			// console.log(`\nSearching in directory: ${fullPath}`);
			traverseDirectories(fullPath);
		} else {
			console.warn(`Directory not found: ${fullPath}`);
		}
	});

	/**
	 * Function to recursively traverse directories and find component files.
	 * @param {string} dir - The directory to traverse.
	 */
	function traverseDirectories(dir) {
		const items = fs.readdirSync(dir, { withFileTypes: true });

		items.forEach((item) => {
			const itemPath = node_path.join(dir, item.name);

			if (item.isDirectory()) {
				traverseDirectories(itemPath);
			} else if (item.isFile() && item.name.endsWith('.component.html')) {
				let content = fs.readFileSync(itemPath, 'utf-8');
				content = content.replace(`scripts-to-load=`, `custom-scripts-to-load=`);
				fs.writeFileSync(itemPath, content);
			}
		});
	}
};

const copyWebComponentBuildFiles = async (sourceDir) => {
	let targetDir = getGenNgDir(sourceDir);
	const template = getHandlebarTemplate('wc-post-build');

	let supportedLanguagesObj = await getSupportedLanguages(sourceDir);
	const supportedLanguages = Object.keys(supportedLanguagesObj['supportedLanguages']).map(key => key + ".js");

	const contents = template({supportedLanguages : JSON.stringify(supportedLanguages)});
	await writeFile(`${targetDir}/build-scripts/post-build-ng-element.js`, contents);
};

const copyWebpackConfigFiles = async (sourceDir) => {
	let targetDir = getGenNgDir(sourceDir);
	const template = getHandlebarTemplate('wc-webpack-config');
	let appName = await getAppName(sourceDir);
	appName = "wm_" + appName.toLowerCase();
	const contents = template({appName});
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

const copyUIResources = async (sourceDir) => {
	let uiResourcesDir = getUIResourcesDir(sourceDir);
	let targetDir = `${getGenNgDir(sourceDir)}/resources`;
	try {
		copyDirWithExclusionsSync(uiResourcesDir, targetDir, ['resources', 'docs']);
		copyDirWithExclusionsSync(`${uiResourcesDir}/resources`, targetDir, []);
		console.log(`Copied ${uiResourcesDir} to ${targetDir}`);
	} catch (err) {
		console.error(`Error copying directory...!!!: ${err}`);
	}
};

const generatePrefabServiceDefs = async (sourceDir) => {
	let serviceDefsDir = getServiceDefsDir(sourceDir);
	let appSerDefs = "app-servicedefs.json";
	let prefabSerDefs = `${global.appName}-prefab-servicedefs.json`;

	//create an empty file for prefab-servicedefs and swap content with app-servicedefs.
	if (!fs.existsSync(`${serviceDefsDir}/${prefabSerDefs}`)) {
		const template = getHandlebarTemplate('servicedefs');
		let contents = template({defs: safeString(JSON.stringify("", undefined, 4))});
		fs.writeFileSync(`${serviceDefsDir}/${prefabSerDefs}`, contents, "utf-8");
	}

	const swapFiles = () => {
		let tempFile = join(serviceDefsDir, "temp.json");
		let files = [
			join(serviceDefsDir, appSerDefs),
			join(serviceDefsDir, prefabSerDefs),
		]
		try {
			fs.renameSync(files[0], tempFile);
			fs.renameSync(files[1], files[0]);
			fs.renameSync(tempFile, files[1]);
			console.log(`Files ${files[0]} and ${files[1]} have been swapped.`);
		} catch (error) {
			console.error('Error swapping files:', error.message);
		}
	};
	swapFiles();

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
		error(`Error - ${err}`);
	}
}

const generateDist = async(sourceDir) => {
	let wmProjectProperties = await getWMPropsObject(sourceDir);
	await generateWmProjectProperties(wmProjectProperties, sourceDir);
	await copyWebComponentBuildFiles(sourceDir);
	await copyWebpackConfigFiles(sourceDir);

	await copyUIResources(sourceDir);
	if(isPrefabProject()){
		await generatePrefabServiceDefs(sourceDir);
	}
	await copyResourceFiles(sourceDir);

	await copyBootstrapScript(sourceDir);
	await installDeps(sourceDir);
	await buildApp(sourceDir);
	await copyWebComponentArtifacts(sourceDir);
};

async function copyBootstrapScript(sourceDir) {
	let appName = (global.appName).toLowerCase();
	const bootstrapTemplate = getHandlebarTemplate('bootstrap');
	const bootstrapContent = bootstrapTemplate({appName});
	try {
		fs.mkdirSync(`${getWCAppDir(sourceDir)}/resources/bootstrap`, { recursive: true });
		fs.writeFileSync(`${getWCAppDir(sourceDir)}/resources/bootstrap/bootstrap-${appName}.js`, bootstrapContent);
	} catch (err) {
		console.error(`Error creating bootstrap file - ${getWCAppDir(sourceDir)}/resources/bootstrap/bootstrap-${appName}.js`, err);
	}
}

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
	updateAppConfig,
	updatePrefabScriptFile,
	updateMainFile,
	updateComponentFiles,
	generateDist,
	generateDummyUIBuildDir
}
