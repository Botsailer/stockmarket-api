const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');
const { execSync } = require('child_process');

const DIST_DIR = path.join(__dirname, '../dist');
const SRC_VIEWS = path.join(__dirname, '../views');
const DIST_VIEWS = path.join(DIST_DIR, '../views'); // Keep views in root relative to dist? 
// Actually, if we ship 'dist', we should probably put views inside dist or keep the structure.
// Let's assume we ship the whole folder, but the code is obfuscated.

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      if (file.endsWith('.js')) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });

  return arrayOfFiles;
}

console.log('Cleaning dist...');
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}

console.log('Compiling TypeScript...');
try {
  execSync('npx tsc', { stdio: 'inherit' });
} catch (e) {
  console.error('TypeScript compilation failed.');
  process.exit(1);
}

console.log('Obfuscating code...');
const files = getAllFiles(DIST_DIR);

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const obfuscationResult = JavaScriptObfuscator.obfuscate(content, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    debugProtection: false,
    debugProtectionInterval: 0,
    disableConsoleOutput: false, // Keep console logs for errors? User said "remove comments", didn't say remove logs.
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: true,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 1,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 2,
    stringArrayWrappersType: 'variable',
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
  });

  fs.writeFileSync(file, obfuscationResult.getObfuscatedCode());
  console.log(`Obfuscated: ${path.relative(DIST_DIR, file)}`);
});

console.log('Build complete. Files in ./dist are obfuscated.');
