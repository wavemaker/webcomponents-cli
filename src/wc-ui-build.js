const fsp = require('fs').promises;

const createEmptyFolders = async () => {
	let emptyDirs= 'target/ui-build/output-files';

	try {
		await fsp.access(emptyDirs);
	} catch (err) {
		if (err.code === 'ENOENT') {
			try {
				await fsp.mkdir(emptyDirs, { recursive: true });
			} catch (err) {
				if (err.code !== 'EEXIST') {
					throw err;
				}
			}
		} else {
			throw err;
		}
	}
}

const initVoid = async () => {
	//this is just to make the maven build pass
	await createEmptyFolders();

}

initVoid();
