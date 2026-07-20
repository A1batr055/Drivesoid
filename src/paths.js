// SPDX-License-Identifier: CC-BY-NC-SA-4.0
// Copyright (c) 2026 A1batr055 - https://github.com/A1batr055/Drivesoid
'use strict';
const path = require('path');
const DATA_DIR = process.env.DRIVES_DATA_DIR || path.join(__dirname, '../data');
module.exports = { DATA_DIR };
