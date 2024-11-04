const {
	generateNgCode,
	validateProject,
	updatePackageJson,
	updateAngularJson,
	updateMainTsFile,
	updateAppModule,
	updateMainFile,
	updateComponentFiles,
	generateDist
} = require('./update.project');
const { printFailure, updateStatus, endStatus, printHeader, initStatus} = require('./console.utils');
const { initTemplates } = require('./template.helpers');
const { initMaven } = require('./maven.utils');
const { logProjectMetadata } = require("./utils");

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
	await updateAppModule(source);
	if(global.WMPropsObj.type === "PREFAB") {
		await updateMainFile(source);
	}
	await updateComponentFiles(source);

	updateStatus(`Generating the dist...`);
	await generateDist(source);
};

(async () => {
	printHeader();
	await logProjectMetadata(argv.source);
	initStatus();
	try {
		if (argv.source) {
			initTemplates();

			updateStatus(`Compiling the java sources...`);
			await initMaven(argv.source);

			updateStatus(`Transpiling the Project...`);
			await addNgElementToApp(argv.source);
		}
	} catch (e) {
		printFailure(e);
	} finally {
		endStatus();
		process.exit(0);
	}
})();
