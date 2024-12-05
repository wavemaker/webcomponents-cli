const node_path = require("path");
const fs = require("fs");
const {log, error} = require("./console.utils");
const {
	getExtensionsDir,
	writeFile,
	copyDirWithExclusionsSync,
	getSrcPagesDir,
	readFileSync,
	getSrcWebappDir,
	updateGlobalProps, getPrefabsDir, getSrcDir, getSrcAppDir, getTargetDir
} = require("./utils");
const xml2js = require('xml2js');
const {getHandlebarTemplate} = require("./template.helpers");
const {join} = require("path");
global._ = require('lodash');


async function copyFomattersFile(sourceDir) {
	let extensionsDir = await getExtensionsDir(sourceDir);
	if (!fs.existsSync(`${extensionsDir}`)) {
		fs.mkdirSync(`${extensionsDir}`);
	}
	const formattersTemplate = getHandlebarTemplate('formatters-js');
	await writeFile(`${extensionsDir}/formatters.js`, formattersTemplate({}));
}

async function updateAppVariables(sourceDir) {
	const variablesTemplate = getHandlebarTemplate('app-variables-json');
	const contents = variablesTemplate({});
	await writeFile(`${getSrcWebappDir(sourceDir)}/app.variables.json`, contents);
}

async function addMainPage(sourceDir) {
	let prefabName = global.WMPropsObj.name, prefabAttrs = '';
	let srcDir = `${node_path.resolve(__dirname, './templates/Main')}`;
	let destDir = `${getSrcPagesDir(sourceDir)}/Main`;

	copyDirWithExclusionsSync(srcDir, destDir, ["main.component.ts.hbs", "main.html.ts.hbs"]);
	const mainHtmlTemplate = getHandlebarTemplate('main-html-ts');
	await writeFile(`${destDir}/Main.html`, mainHtmlTemplate({ prefabName, prefabAttrs }));
}

async function addCommonPage(sourceDir) {
	let srcDir = `${node_path.resolve(__dirname, './templates/Common')}`;
	let destDir = `${getSrcPagesDir(sourceDir)}/Common`;
	copyDirWithExclusionsSync(srcDir, destDir, []);

	//update pages config with common file
	const pagesConfigJsonFile = `${getSrcPagesDir(sourceDir)}/pages-config.json`
	let pagesConfigJson = readFileSync(pagesConfigJsonFile, true);
	let commonPage = global._.find(pagesConfigJson, {name: "Common"});
	let commonPagesConfig = {
		"name" : "Common",
		"type" : "PARTIAL",
		"params" : [ ]
	}
	if(!commonPage) {
		pagesConfigJson.push(commonPagesConfig);
		await writeFile(pagesConfigJsonFile, JSON.stringify(pagesConfigJson, null, 4));
	}
}

async function copyPrefabFiles(sourceDir) {
	let prefabName = global.WMPropsObj.name;
	await copyFile(".wmproject.properties", sourceDir, `${getSrcWebappDir(sourceDir)}/WEB-INF/prefabs/${prefabName}`);

	let srcDir = `${getSrcWebappDir(sourceDir)}`;
	let destDir = `${getSrcWebappDir(sourceDir)}/WEB-INF/prefabs/${prefabName}/webapp`;
	copyDirWithExclusionsSync(srcDir, destDir, ["WEB-INF"]);

	await copyFile("prefabProperties.properties", `${getSrcAppDir(sourceDir)}/main/resources/conf`, `${getSrcWebappDir(sourceDir)}/WEB-INF/prefabs/${prefabName}/config/prefab-conf`);
	await copyFile("prefabPropertiesMetadata.json", `${getSrcAppDir(sourceDir)}/main/resources`, `${getSrcWebappDir(sourceDir)}/WEB-INF/prefabs/${prefabName}/config`);
	await copyFile("project-rest-service.xml", `${getSrcWebappDir(sourceDir)}/WEB-INF`, `${getSrcWebappDir(sourceDir)}/WEB-INF/prefabs/${prefabName}/config`);
	await copyFile(".wmproject.properties", `${sourceDir}`, `${getSrcWebappDir(sourceDir)}/WEB-INF/prefabs/${prefabName}/config`);
	await copyFile(".wmproject.properties", `${sourceDir}`, `${getSrcWebappDir(sourceDir)}/WEB-INF/prefabs/${prefabName}`);
}

async function copyFile(file, srcDir, destDir) {
	if (!fs.existsSync(`${destDir}`)) {
		fs.mkdirSync(`${destDir}`, { recursive: true });
	}
	fs.copyFileSync(`${srcDir}/${file}`, `${destDir}/${file}`);
}

async function updateWMProperties(filePath, key, changeProjectType) {
	try {
		const fileName = ".wmproject.properties"
		let wmPropsXmlFile = node_path.join(filePath, fileName);
		const wmPropsXmlData = fs.readFileSync(wmPropsXmlFile, 'utf-8');

		const parser = new xml2js.Parser();
		let propsParsedData;
		parser.parseString(wmPropsXmlData, (err, parsedData) => {
			if (err) throw new Error('Error parsing XML: ' + err.message);
			propsParsedData = parsedData;
		});

		let xmlData = deleteKeyFromXML(propsParsedData, key);
		if(changeProjectType) {
			xmlData = updateKeyInXML(xmlData, "platformType", "WEB");
			xmlData = updateKeyInXML(xmlData, "type", "APPLICATION");
		}

		const builder = new xml2js.Builder({ headless: false, xmldec: { version: '1.0', encoding: 'UTF-8' } });
		const updatedXml = builder.buildObject(xmlData);

		fs.writeFileSync(wmPropsXmlFile, updatedXml, 'utf-8');
	} catch (err) {
		console.error('Error while parsing the .wmproject.properties file :', err.message);
	}
}

const deleteKeyFromXML = (xmlData, key) => {
	const entries = xmlData.properties.entry;
	if (Array.isArray(entries)) {
		xmlData.properties.entry = entries.filter((entry) => entry.$.key !== key);
	} else if (entries.$.key === key) {
		delete xmlData.properties.entry;
	} else {
		console.info(`Key ${key} not found.`);
	}
	return xmlData;
}

const updateKeyInXML = (xmlData, key, value) => {
	const entries = xmlData.properties.entry;
	const targetEntry = entries.find((entry) => entry.$.key === key);
	if (targetEntry) {
		targetEntry._ = value;
	} else {
		console.error(`Key ${key} not found.`);
		return;
	}
	return xmlData;
}

async function updateDependencies(sourceDir) {
	let dependenciesJsonFile = `${getSrcWebappDir(sourceDir)}/WEB-INF/prefabs/dependencies.json`;
	if (!fs.existsSync(dependenciesJsonFile)) {
		const content = JSON.stringify([]);
		try {
			fs.writeFileSync(dependenciesJsonFile, content);
		} catch (err) {
		}
	}
	let dependenciesJson = readFileSync(dependenciesJsonFile, true);
	let prefabDepConfig = {
		"name" : `${global.WMPropsObj.name}`,
		"version" : `${global.WMPropsObj.version}`,
		"platformVersion" : null,
		"publisherId" : null,
		"publisherName" : null,
		"artifactType" : "PREFAB",
		"artifactDependencyList" : null
	}
	let prefabDep = global._.find(dependenciesJson, {name: `${global.WMPropsObj.name}`});
	if(!prefabDep) {
		dependenciesJson.push(prefabDepConfig);
		await writeFile(dependenciesJsonFile, JSON.stringify(dependenciesJson, null, 4));
	}
}

async function copyServices(sourceDir) {
	const dirsList = fs.readdirSync(`${sourceDir}/services`, { withFileTypes: true });
	const directories = dirsList.filter(dir => dir.isDirectory());
	directories.forEach(dir => {
		const subDirPath = node_path.join(`${sourceDir}/services`, dir.name);
		copyFile(`${dir.name}_apiTarget.json`, `${subDirPath}/src`, `${getSrcWebappDir(sourceDir)}/WEB-INF/prefabs/${global.WMPropsObj.name}/config`)
		copyFile(`service_${dir.name}.spring.xml`, `${subDirPath}/src`, `${getSrcWebappDir(sourceDir)}/WEB-INF/prefabs/${global.WMPropsObj.name}/config/prefab`)
		copyFile(`${dir.name}.properties`, `${subDirPath}/src/conf`, `${getSrcWebappDir(sourceDir)}/WEB-INF/prefabs/${global.WMPropsObj.name}/config/prefab-conf`)
	});
}

async function backUpWMProsFile(sourceDir) {
	const fileName = ".wmproject.properties"
	const bkFileName = ".wmproject.properties.bk"
	fs.copyFileSync(`${sourceDir}/${fileName}`, `${sourceDir}/${bkFileName}`);
}

async function copyServDefs(sourceDir) {
	let prefabName = global.WMPropsObj.name
	copyDirWithExclusionsSync(`${getTargetDir(sourceDir)}/classes/servicedefs`, `${getSrcWebappDir(sourceDir)}/WEB-INF/prefabs/${prefabName}/config/prefab-servicedefs`, []);
}

const scaffoldPrefabProject = async(sourceDir) => {
	await copyPrefabFiles(sourceDir);
	await updateDependencies(sourceDir);
	await copyServices(sourceDir);
	await copyServDefs(sourceDir);

	await backUpWMProsFile(sourceDir);

	await updateWMProperties(sourceDir, "studioPrefabUpgradeVersion", true);
	//this is required as we have changed the prefab to web application
	await updateGlobalProps(sourceDir);
	await updateWMProperties(`${getSrcWebappDir(sourceDir)}/WEB-INF/prefabs/${global.WMPropsObj.name}`, "studioProjectUpgradeVersion", false);

	await copyFomattersFile(sourceDir);
	await updateAppVariables(sourceDir);
	await addMainPage(sourceDir);
	await addCommonPage(sourceDir);
};

module.exports = {
	scaffoldPrefabProject,
}
