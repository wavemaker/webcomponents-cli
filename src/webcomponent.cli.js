const {
	generateNgCode,
	validateProject,
	updatePackageJson,
	updateAngularJson,
	updateMainTsFile,
	updateAppConfig,
	updateMainFile,
	updateComponentFiles,
	generateDist,
	generateDummyUIBuildDir,
	updatePrefabScriptFile
} = require('./update.project');
const { printFailure, updateStatus, endStatus, printHeader, initStatus} = require('./console.utils');
const { initTemplates } = require('./template.helpers');
const { logProjectMetadata, generateDocs, isPrefabProject} = require("./utils");

const path = require('path');
const {scaffoldPrefabProject} = require("./scaffold.prefab");
const fs = require("fs");

const argv = require("yargs")
	.usage("Usage: $0 -s [source WaveMaker Prefab project path]")
	.options({
		"source": {
			alias: "s",
			describe: "source project web-app path",
			type: "string"
		}
	})
	.demandOption(["source"], "please provide source project")
	.help()
	.argv;

const addNgElementToApp = async (source) => {
	updateStatus(`Generating Angular code...`);
	await generateNgCode(source);

	updateStatus(`Validating the generated project...`);
	await validateProject(source);

	updateStatus(`Updating the project files...`);
	await updatePackageJson(source);
	await updateAngularJson(source);
	await updateMainTsFile(source);
	await updateAppConfig(source);
	//if(global.WMPropsObj.type === "PREFAB") {
		await updateMainFile(source);
	//}
	if(global.WMPropsObj.type === "PREFAB"){
		await updatePrefabScriptFile(source);
	}
	await updateComponentFiles(source);

	updateStatus(`Generating documentation...`);
	await generateDocs(source);

	updateStatus(`Generating the dist...`);
	await generateDist(source);
	await generateDummyUIBuildDir(source);
};

const convertToAbsolutePath = async (source) => {
	if (path.isAbsolute(source)) {
		return source;
	}
	return path.resolve(source);
}

async function restoreBackUpWMPropsFile(sourceDir) {
	const fileName = ".wmproject.properties"
	const bkFileName = ".wmproject.properties.bk"
	fs.copyFileSync(`${sourceDir}/${bkFileName}`, `${sourceDir}/${fileName}`);
}

(async () => {
	printHeader();
	argv.source = await convertToAbsolutePath(argv.source);
	let sourceDir = argv.source;
	await logProjectMetadata(argv.source);
	initStatus();
	try {
		if (argv.source) {
			initTemplates();

			if(isPrefabProject()) {
				await scaffoldPrefabProject(sourceDir)
			}
			updateStatus(`Transpiling the Project...`);
			await addNgElementToApp(sourceDir);

			if(isPrefabProject()) {
				await restoreBackUpWMPropsFile(sourceDir)
			}
		}
	} catch (e) {
		printFailure(e);
	} finally {
		endStatus();
		process.exit(0);
	}
})();
