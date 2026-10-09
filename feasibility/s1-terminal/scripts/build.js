// Build script for the S1a prototype: esbuild bundles for main (node),
// preload (node/sandbox) and renderer (browser IIFE); static assets copied.
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

async function main() {
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });

  await esbuild.build({
    entryPoints: [path.join(root, 'src', 'main.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: path.join(dist, 'main.js'),
    external: ['electron', 'node-pty'],
    logLevel: 'info',
  });

  await esbuild.build({
    entryPoints: [path.join(root, 'src', 'preload.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: path.join(dist, 'preload.js'),
    external: ['electron'],
    logLevel: 'info',
  });

  await esbuild.build({
    entryPoints: [path.join(root, 'src', 'renderer.ts')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    outfile: path.join(dist, 'renderer.js'),
    logLevel: 'info',
  });

  fs.copyFileSync(path.join(root, 'src', 'index.html'), path.join(dist, 'index.html'));
  fs.copyFileSync(
    path.join(root, 'node_modules', '@xterm', 'xterm', 'css', 'xterm.css'),
    path.join(dist, 'xterm.css'),
  );
  console.log('[build] dist ready');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
