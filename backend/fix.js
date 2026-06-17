const fs = require('fs');
let code = fs.readFileSync('public/js/app.js', 'utf8');
code = code.replace(/\\\`/g, '`').replace(/\\\$/g, '$');
fs.writeFileSync('public/js/app.js', code);
