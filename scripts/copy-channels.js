const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src', 'data', 'channels.json');
const target = path.join(root, 'dist', 'data', 'channels.json');

if (fs.existsSync(source)) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  console.log(`Copied ${path.relative(root, source)} to ${path.relative(root, target)}`);
} else {
  console.log('No local src/data/channels.json found; continuing without bundled channels.');
}
