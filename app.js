// cPanel CloudLinux Passenger Entry Point
// Saranam Ayyappa Backend API
const fs = require('fs');
if (fs.existsSync('./dist/src/main.js')) {
  require('./dist/src/main.js');
} else {
  require('./dist/main.js');
}
