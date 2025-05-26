// Usage: tsx ./scripts/foundry-release.ts

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createInterface } from 'readline';

const env = parseEnv();
const manifestFile = JSON.parse(fs.readFileSync('./module.json', 'utf-8'));

const { id, title, version, manifest, compatibility, notes } = manifestFile;
const newVersion = bumpVersion(version);

const readline = createInterface({
	input: process.stdin,
	output: process.stdout,
});

async function awaitUserInput(msg: string) {
	return new Promise((resolve) => {
		readline.question(msg + ' ', (answer) => {
			resolve(answer);
		});
	});
}

function parseEnv() {
	const __filename = fileURLToPath(process.env.url);
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

function updateFoundryRelease(dryRun = true) {
	const parameters = {
		id,
		release: {
			version: newVersion,
			manifest,
			notes,
			compatibility,
		},
	};
	if (dryRun) {
		parameters['dry-run'] = true;
	}
	return fetch('https://api.foundryvtt.com/_api/packages/release_version/', {
		headers: {
			'Content-Type': 'application/json',
			Authorization: env.FOUNDRY_PACKAGE_API_KEY,
		},
		method: 'POST',
		body: JSON.stringify(parameters),
	});
}

console.log(`Building ${title} \x1b[31mv${version}\x1b[0m -> \x1b[32mv${newVersion}\x1b[0m`);

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

updateVersionInManifest();
console.log('Updated manifest version');

try {
	const response = await updateFoundryRelease(false);
	if (!response.ok) {
		console.error('Failed to update Foundry release');
		console.error(await response.text());
		throw new Error('Failed to update Foundry release');
	}
	console.log('Updated Foundry release');
	console.log('✅ Build successful');
	process.exit(0);
} catch (error) {
	console.error(error);
	console.error('❌ Build failed');
	process.exit(1);
}
