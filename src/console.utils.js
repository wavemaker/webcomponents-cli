const chalk = require("chalk");
const figlet = require("figlet");

const CLI = require("clui");
const Spinner = CLI.Spinner;
let countdown = new Spinner('Initialising...  ', ['⣾','⣽','⣻','⢿','⡿','⣟','⣯','⣷']);


const logg = console.log;
const err = console.error;

const green = chalk.green;
const red = chalk.red;
const blue = chalk.blue;
const white = chalk.white;
const progress = chalk.inverse;

const textSync = figlet.textSync;

const {version} = require("../package.json");

const printHeader = () => {
	log(green.bold(textSync("WaveMaker", {horizontalLayout: "fitted"})));
	log(blue.bold(` * A CLI to convert WaveMaker Apps/Prefabs to WebComponents * `));
	log(white.bold(`\n		www.wavemakeronline.com`));
	log(white.bold(`		    version: ${version}\n`));
}

const log = (message) => {
	logg(green(message));
}

const error = (errMsg) => {
	err(red(errMsg));
}

const updateStatus = status => {
	countdown.message(` ${status}`);
};

const initStatus = () => {
	countdown.start("Initialising...");
};

const endStatus = () => {
	countdown.stop();
};

const printSuccess = msg => {
	//printHeader();
	log(blue.bold(`\n# SUCCESS #`));
	log(white(msg));
	log("\n");
};

const printFailure = msg => {
	//printHeader();
	log(red(`\n# FAILED #`));
	log(red(msg));
	log("\n");
};

const printProgress = msg => {
	log(progress(msg));
};

module.exports = {
	printHeader,
	log,
	error,
	updateStatus,
	endStatus,
	initStatus,
	printSuccess,
	printFailure,
	printProgress
}