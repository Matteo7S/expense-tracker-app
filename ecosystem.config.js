module.exports = {
  apps: [{
    name: 'expense-tracker-mobile',
    script: 'npm',
    args: 'start',
    env: {
      NODE_ENV: 'development'
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    log_file: './logs/mobile-app.log',
    out_file: './logs/mobile-app-out.log',
    error_file: './logs/mobile-app-error.log',
    log_type: 'json'
  }]
};
