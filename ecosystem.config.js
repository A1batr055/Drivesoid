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
