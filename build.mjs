// Usage: node build.mjs
import { exec } from 'child_process';
import fs from 'fs';
import path, { dirname } from 'path';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import manifest from './module.json' with { type: 'json' };

async function awaitUserInput(msg) {
	return new Promise((resolve) => {
		readline.question(msg + ' ', (answer) => {
			resolve(answer);
		});
	});
}

function parseEnv() {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);

	const envPath = path.resolve(__dirname, '.env');
	const envExamplePath = path.resolve(__dirname, '.env.example');

	if (!fs.existsSync(envPath)) {
		fs.copyFileSync(envExamplePath, envPath);
		console.log('Created .env file');
	}

	const env = {};
	const envFileContent = fs.readFileSync(envPath, 'utf-8');
	envFileContent.split('\n').forEach((line) => {
		let [key, value] = line.split('=');
		if (key && value) {
			value = value.trim();
			if (value.startsWith('"') && value.endsWith('"')) {
				value = value.slice(1, -1);
			}
			env[key.trim()] = value.trim();
		}
	});

	if (Object.keys(env).length === 0) {
		console.error('No .env file found or it is empty');
		process.exit(1);
	}

	return env;
}

function bumpVersion(version) {
	const modes = ['major', 'minor', 'patch'];
	const mode = modes.find((mode) => process.argv.includes(`--${mode}`));
	if (!mode) return version;
	const arr = version.split('.');
	if (mode === 'major') {
		arr[0] = parseInt(arr[0]) + 1;
		arr[1] = 0;
		arr[2] = 0;
	} else if (mode === 'minor') {
		arr[1] = parseInt(arr[1]) + 1;
		arr[2] = 0;
	} else {
		arr[2] = parseInt(arr[2]) + 1;
	}
	return arr.join('.');
}

function updateVersionInManifest() {
	manifest.version = newVersion;
	fs.writeFileSync('./module.json', JSON.stringify(manifest, null, 4).replace(/\n/g, '\r\n'));
}

function createRelease(latest = false) {
	// readme: https://raw.githubusercontent.com/${{ github.repository }}/v${{ steps.get_version.outputs.VERSION_NUMBER }}/README.md
	// manifest: https://github.com/${{ github.repository }}/releases/latest/download/module.json
	// download: https://github.com/${{ github.repository }}/releases/download/v${{ steps.get_version.outputs.VERSION_NUMBER }}/module.zip
	const repository = manifest.url.match(/github\.com\/([^\/]+\/[^\/]+)/)[1];
	return {
		version: `v${newVersion}`,
		manifest: `https://github.com/${repository}/releases/download/v${newVersion}/module.json`,
		compatibility: manifest.compatibility,
		notes: `https://raw.githubusercontent.com/${repository}/refs/heads/master/releases.md`,
	};
}

function updateFoundryRelease(dryRun = true) {
	const release = createRelease(dryRun);
	const parameters = { id: manifest.id, release };
	if (dryRun) {
		parameters['dry-run'] = true;
	}
	return fetch('https://foundryvtt.com/_api/packages/release_version/', {
		headers: {
			'Content-Type': 'application/json',
			Authorization: env.FOUNDRY_PACKAGE_API_KEY,
		},
		method: 'POST',
		body: JSON.stringify(parameters),
	});
}

function execCommandAsPromise(command) {
	return new Promise((resolve, reject) => {
		exec(command, (error, stdout, stderr) => {
			if (error) {
				reject(error);
				return;
			}
			if (stderr) {
				console.log(stderr.trimEnd());
			}
			if (stdout) console.log(stdout.trimEnd());
			resolve(stdout);
		});
	});
}

const env = parseEnv();
const readline = createInterface({
	input: process.stdin,
	output: process.stdout,
});
const newVersion = bumpVersion(manifest.version);
const newRelease = manifest.version !== newVersion;

if (newRelease) {
	console.log(`Building ${manifest.title} \x1b[31mv${manifest.version}\x1b[0m -> \x1b[32mv${newVersion}\x1b[0m`);
} else {
	console.log(`Resending foundry release for ${manifest.title} \x1b[31mv${newVersion}\x1b[0m`);
}

// Do you want to proceed?
const proceed = await awaitUserInput('Do you want to proceed? (y/n)');
if (proceed.toLowerCase() !== 'y') {
	console.log('Aborted');
	process.exit(0);
}

const attemptResponse = await updateFoundryRelease(true);
if (!attemptResponse.ok) {
	console.error('Failed to update Foundry release');
	console.error(await attemptResponse.text());
	process.exit(1);
}

try {
	if (newRelease) {
		updateVersionInManifest();
		console.log('Updated manifest version');
		await execCommandAsPromise('git add module.json');
		console.log('Added module.json to git');
		await execCommandAsPromise(`git commit -m "New release v${newVersion}"`);
		console.log('Committed new release');
		await execCommandAsPromise(`git tag v${newVersion}`);
		console.log('Created new tag');
		await execCommandAsPromise('git push');
		console.log('Pushed changes');
		await execCommandAsPromise('git push --tags');
		console.log('Pushed tags');
	}
	const foundryRelease = !process.argv.includes('--no-foundry');
	if (foundryRelease) {
		const response = await updateFoundryRelease(false);
		if (!response.ok) {
			console.error('Failed to update Foundry release');
			console.error(await response.text());
			throw new Error('Failed to update Foundry release');
		}
		console.log('Updated Foundry release');
		console.log('✅ Build successful');
	}
	process.exit(0);
} catch (error) {
	console.error(error);
	console.error('❌ Build failed');
	process.exit(1);
}
