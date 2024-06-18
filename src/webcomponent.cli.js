const {
	generateNgCode,
	validateProject,
	updatePackageJson,
	updateAngularJson,
	updateMainTsFile,
	updateModule,
	updateMainFile,
	updatePrefabFile,
	generateDist
} = require('./update.project');

const { initTemplates } = require('./template.helpers');
const { initMaven } = require('./maven.utils');

const argv = require("yargs")
	.usage("Usage: $0 -t [target wavemaker angular generated project path]")
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
	await generateNgCode(source);
	await validateProject(source);
	await updatePackageJson(source);
	await updateAngularJson(source);
	await updateMainTsFile(source);
	await updateModule(source, source);
	await updateMainFile(source);
	await updatePrefabFile(source);
	await generateDist(source);
};

(async () => {
	if (argv.source) {
		initTemplates();
		await initMaven(argv.source);
		await addNgElementToApp(argv.source);
	}
})();
