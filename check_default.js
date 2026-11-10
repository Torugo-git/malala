const fs = require('fs');
const acorn = require('acorn');

const code = fs.readFileSync('index.html', 'utf-8');
const match = code.match(/const defaultProducts = (\[.*?\]);/s);
if (match) {
  try {
    const products = eval(match[1]);
    console.log("Length of defaultProducts:", products.length);
  } catch(e) {
    console.log("Eval error", e);
  }
} else {
  console.log("Not found");
}
