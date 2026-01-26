console.log('Test script starting...');
console.log('process.versions.electron:', process.versions.electron);
console.log('process.type:', process.type);

// Print module paths
console.log('module.paths:', module.paths);

// Try to resolve electron
try {
    const resolved = require.resolve('electron');
    console.log('resolved electron:', resolved);
} catch (e) {
    console.log('resolve error:', e.message);
}
