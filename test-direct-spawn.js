const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const electronModulePath = path.dirname(require.resolve('electron'));
const pathFile = path.join(electronModulePath, 'path.txt');
const executablePath = fs.readFileSync(pathFile, 'utf-8');
const electronExecPath = path.join(electronModulePath, 'dist', executablePath);

console.log('Spawning:', electronExecPath);
console.log('With entry: .');
console.log('CWD:', path.join(__dirname, 'packages/desktop'));

const ps = spawn(electronExecPath, ['.'], { 
    stdio: 'inherit',
    cwd: path.join(__dirname, 'packages/desktop')
});

ps.on('close', (code) => {
    console.log('Electron exited with code:', code);
    process.exit(code);
});
