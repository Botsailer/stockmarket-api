const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RELEASE_DIR = path.join(ROOT, 'release');
const DIST_DIR = path.join(ROOT, 'dist');
const VIEWS_DIR = path.join(ROOT, 'views');

// Ensure release dir exists
if (fs.existsSync(RELEASE_DIR)) {
  fs.rmSync(RELEASE_DIR, { recursive: true, force: true });
}
fs.mkdirSync(RELEASE_DIR);

// Copy directories
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

console.log('Copying dist...');
copyDir(DIST_DIR, path.join(RELEASE_DIR, 'dist'));

console.log('Copying views...');
copyDir(VIEWS_DIR, path.join(RELEASE_DIR, 'views'));

// Create production package.json
const originalPackage = require(path.join(ROOT, 'package.json'));
const prodPackage = {
  name: originalPackage.name,
  version: originalPackage.version,
  description: originalPackage.description,
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

// Copy optional config files if they exist, but maybe better to let them generate fresh
// fs.copyFileSync(path.join(ROOT, 'api_keys.json'), path.join(RELEASE_DIR, 'api_keys.json'));

console.log('Release package created at ./release');
console.log('You can zip the "release" folder and send it to the client.');
