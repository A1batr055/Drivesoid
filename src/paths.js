'use strict';
const path = require('path');
const DATA_DIR = process.env.DRIVES_DATA_DIR || path.join(__dirname, '../data');
module.exports = { DATA_DIR };
