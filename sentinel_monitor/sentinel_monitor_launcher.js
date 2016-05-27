/**
 * Launcher for sentinel_monitor.js, to run it periodically and pipe its logs to file.
 * Also allows the monitor to be rerun again when crashed (robust!).
 */
'user strict';

console.log('Running sentinel_monitor_launcher.');

var fs = require('fs');
var spawn = require('child_process').spawn;
var sentinel_monitor_dir = '/srv/storage/system-services/home/vm/sentinel_monitor';

// Pipe stderr and stdout to logfile.
var out = fs.openSync(sentinel_monitor_dir + '/sentinel_monitor.log', 'a');
var err = fs.openSync(sentinel_monitor_dir + '/sentinel_monitor.log', 'a');

console.log(sentinel_monitor_dir + '/sentinel_monitor.js');
spawn('/srv/software/medic-core/v1.6.1/x64/bin/node', [sentinel_monitor_dir + '/sentinel_monitor.js'], {
  stdio: [ 'ignore', out, err ]
});
