const fs = require('fs');
const acorn = require('acorn');

function checkFile(filename) {
    const html = fs.readFileSync(filename, 'utf8');

    // Extract script tags
    const scriptRegex = /<script>([\s\S]*?)<\/script>/g;
    let match;
    let hasError = false;

    while ((match = scriptRegex.exec(html)) !== null) {
        const jsCode = match[1];
        try {
            acorn.parse(jsCode, { ecmaVersion: 2020 });
        } catch (e) {
            console.error(`Syntax error in ${filename} at line ${e.loc.line}: ${e.message}`);
            hasError = true;
        }
    }

    if (!hasError) {
        console.log(`${filename} JavaScript syntax is valid.`);
    }
}

try {
    checkFile('index.html');
    checkFile('admin.html');
} catch (e) {
    console.error("Missing acorn module, installing...");
    const execSync = require('child_process').execSync;
    execSync('npm install acorn');
    checkFile('index.html');
    checkFile('admin.html');
}
