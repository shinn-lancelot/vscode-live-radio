const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src', 'data', 'channels.json');
const target = path.join(root, 'dist', 'data', 'channels.json');
const hlsSource = path.join(root, 'node_modules', 'hls.js', 'dist', 'hls.min.js');
const hlsTarget = path.join(root, 'dist', 'vendor', 'hls.min.js');

if (fs.existsSync(source)) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  console.log(`Copied ${path.relative(root, source)} to ${path.relative(root, target)}`);
} else {
  // Bundled channels are optional. The extension can use radio.channels instead.
}

if (fs.existsSync(hlsSource)) {
  try {
    fs.mkdirSync(path.dirname(hlsTarget), { recursive: true });
    fs.copyFileSync(hlsSource, hlsTarget);
    console.log(`Copied hls.js to ${path.relative(root, hlsTarget)}`);
  } catch {
    console.warn('Unable to copy hls.js; continuing without HLS support.');
  }
}
