// cPanel CloudLinux Passenger Entry Point
// Saranam Ayyappa Backend API
const path = require('path');
const fs = require('fs');

if (fs.existsSync(path.join(__dirname, 'dist', 'main.js'))) {
  require('./dist/main.js');
} else if (fs.existsSync(path.join(__dirname, 'dist', 'src', 'main.js'))) {
  require('./dist/src/main.js');
} else {
  console.error('Cannot find dist/main.js in', __dirname);
}
