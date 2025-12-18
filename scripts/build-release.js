const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const JavaScriptObfuscator = require('javascript-obfuscator');

const ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const RELEASE_DIR = path.join(ROOT, 'release');
const VIEWS_DIR = path.join(ROOT, 'views');

function clean() {
  console.log('Cleaning directories...');
  if (fs.existsSync(DIST_DIR)) fs.rmSync(DIST_DIR, { recursive: true, force: true });
  if (fs.existsSync(RELEASE_DIR)) fs.rmSync(RELEASE_DIR, { recursive: true, force: true });
}

function build() {
  console.log('Compiling TypeScript...');
  try {
    execSync('npx tsc', { stdio: 'inherit', cwd: ROOT });
  } catch (e) {
    console.error('Build failed.');
    process.exit(1);
  }
}

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

function obfuscate() {
  console.log('Obfuscating code & Removing debug logs...');
  const files = getAllFiles(DIST_DIR);

  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const obfuscationResult = JavaScriptObfuscator.obfuscate(content, {
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.75,
      deadCodeInjection: true,
      deadCodeInjectionThreshold: 0.4,
      debugProtection: false, // Set to true if you want to prevent debugger attachment
      disableConsoleOutput: true, // Removes console.log, console.error etc.
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
  });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  let entries = fs.readdirSync(src, { withFileTypes: true });

  for (let entry of entries) {
    let srcPath = path.join(src, entry.name);
    let destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function packageRelease() {
  console.log('Packaging release...');
  fs.mkdirSync(RELEASE_DIR, { recursive: true });
  
  // Copy Dist
  copyDir(DIST_DIR, path.join(RELEASE_DIR, 'dist'));
  
  // Copy Views
  copyDir(VIEWS_DIR, path.join(RELEASE_DIR, 'views'));

  // Create Package.json
  const originalPackage = require(path.join(ROOT, 'package.json'));
  const prodPackage = {
    name: "market-data-api",
    version: "1.0.0",
    description: "Real-time Market Data API",
    main: "dist/server.js",
    scripts: {
      "start": "node dist/server.js"
    },
    dependencies: {}
  };

  // Filter dependencies (remove @types)
  for (const [key, value] of Object.entries(originalPackage.dependencies)) {
    if (!key.startsWith('@types/')) {
      prodPackage.dependencies[key] = value;
    }
  }

  fs.writeFileSync(
    path.join(RELEASE_DIR, 'package.json'), 
    JSON.stringify(prodPackage, null, 2)
  );

  // Create .gitignore
  fs.writeFileSync(path.join(RELEASE_DIR, '.gitignore'), `
node_modules/
config.json
api_keys.json
.env
`);

  // Create README
  fs.writeFileSync(path.join(RELEASE_DIR, 'README.md'), `
# Market Data API

## Installation

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Start the server:
   \`\`\`bash
   npm start
   \`\`\`

## Configuration

- The server runs on port 3001 by default.
- Access the Admin Panel at \`/admin\` (Default: admin/admin).
- API Documentation is available at \`/docs\`.
`);

  console.log('Release created successfully at ./release');
}

// Run
clean();
build();
obfuscate();
packageRelease();
