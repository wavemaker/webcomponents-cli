const { execCommand, getProfilesDir, readDir, getAppModule} = require("./utils");
const {join} = require("path");
const {promises: fsp} = require("fs");
const node_path = require("path");
const fs = require("fs");
const {getHandlebarTemplate, safeString} = require("./template.helpers");
const { log, error } = require("./console.utils");

/**
 * invoking the maven method
 * @param sourceDir
 * @returns {Promise<void>}
 */
const invokeMaven = async (sourceDir) => {
	let isPublicApp = global.appRuntimeVersion.indexOf("next") === -1;
	let mvnCommand = isPublicApp ? `mvn clean install` : `mvn clean install -Pwavemaker-internal`;
	await execCommand(`cd ${sourceDir} && ${mvnCommand}`);
};

const replaceUIBuildJS = async (sourceDir) => {
	const template = getHandlebarTemplate('wc-ui-build');
	let newUIBuildJs = template({});
	try {
		fs.writeFileSync(`${sourceDir}/ui-build.js`, newUIBuildJs, 'utf8');
		//log(`${sourceDir}/ui-build.js file replaced successfully!`);
	} catch (err) {
		error(`Error replacing file ${sourceDir}/ui-build.js:`, err);
	}

};


/**
 * init method to invoke the maven command
 * @param sourceDir
 * @returns {Promise<void>}
 */
const initMaven = async (sourceDir) => {
	//await updateProfiles(sourceDir);
	if(global.WMPropsObj.type === "PREFAB") {
		await replaceUIBuildJS(sourceDir);
	}
	await invokeMaven(sourceDir);
}

/**
 * to change the ui build type from wm to angular in any of the props file
 * @param sourceDir
 * @returns {Promise<void>}
 */
const updateProfiles = async (sourceDir) => {
	let profilesDir = getProfilesDir(sourceDir);
	try {
		for (const file of await readDir(profilesDir)) {
			const filePath = join(profilesDir, file);
			const stats = await fsp.stat(filePath);
			if (stats.isFile() && node_path.extname(filePath) === '.properties') {
				const properties = await fsp.readFile(filePath, 'utf-8');
				// this is to retain the newlines in the read content.
				// otherwise all the content is dumped back as a single line into the file after writing
				const lines = properties.split(/\r?\n/);
				const replacedLines = lines.map((line) => line.replace(new RegExp("build.ui.mode=wm", 'g'), "build.ui.mode=angular"));
				const updatedProps = replacedLines.join('\n');

				await fsp.writeFile(filePath, updatedProps, 'utf8');
			}
		}
	} catch (err) {
		error(`Error - ${err}`);
	}
}

module.exports = {
	initMaven
}