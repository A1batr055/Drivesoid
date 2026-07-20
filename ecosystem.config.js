// SPDX-License-Identifier: CC-BY-NC-SA-4.0
// Copyright (c) 2026 A1batr055 - https://github.com/A1batr055/Drivesoid
module.exports = {
  apps: [
    {
      name: 'drivesoid',
      script: 'src/server.js',
      watch: false,
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
