## Sentinel Monitor
Monitors the Sentinel. Ha.<br>
Emails if specific events are found in the sentinel logs.<br>
Runs every 5 minutes.<br>
Looks for config file in same dir. Outputs log file sentinel_monitor.log in same dir.<br>

# Run
1. Edit the sentinel_monitor_config.json : instanceName, events to monitor, email of sender/receiver, etc.
2. Copy the whole sentinel_monitor dir to the prod machine (WHERE?). Ssh into prod machine.
3. Go to the `sentinel_monitor` dir you just created and run `/srv/software/medic-core/v1.6.1/x64/bin/npm install`.
4. Create the cron job : <br>
Edit the crontab :</br>`sudo crontab -e`<br>
Add this line :</br>`*/5 * * * * /srv/software/medic-core/v1.6.1/x64/bin/node <WHERE>/sentinel_monitor/sentinel_monitor.js >> <WHERE>/sentinel_monitor/sentinel_monitor.log 2>&1`
5. Check logs are being output all right, and emails are being sent.
For testing, you can run the job every minute, using `* * * * *`.<br>
You can use dryrun in config to avoid email if necessary.

# Stop
Comment out the line in crontab (with `#`).

# Troubleshooting
 - Check the sentinel_monitor.log. Each run of the monitor should log "End of run" at the end. If not, then it got interrupted by something.
 - Check the cron log : `tail -f -n 100 /srv/storage/system-services/logs/cron.log`. You should see the command you added appear every 5 minutes.
 - Check the cron deamon is running : `sudo ps ax | grep cron`<br>
Stop crond : `sudo /boot/svc-down system-services cron`<br>
Start crond : `sudo /boot/svc-up system-services cron`<br>
