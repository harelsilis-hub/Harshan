const fs = require('fs');
let data = fs.readFileSync('public/js/app.js', 'utf8');
data = data.replace(/\\\`/g, '`');
fs.writeFileSync('public/js/app.js', data);
