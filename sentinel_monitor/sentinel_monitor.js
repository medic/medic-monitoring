/**
 * Sentinel monitor script. Looks for restarts in logs, and emails if too many.
 *
 * Will look for a config file in same dir as script, called sentinel_monitor_config.json.
 * Will log its output to a dir called sentinel_monitor_log.
 */

'user strict';

var _ = require('underscore');
var exec = require('child_process').exec;
var fs = require('fs');
var nodemailer = require('nodemailer');
var stripJsonComments = require('strip-json-comments');


var readConfigFromFile = function(file) {
  var config = [];
  try {
    config = JSON.parse(stripJsonComments(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    console.log('Couldnt open config file ' + file + '. Aborting.');
    process.exit();
  }
  checkConfig(config);
  return config;
};

var checkConfig = function(config) {
  var hasErrors = false;
  function checkProperty(propName) {
    if (!config.hasOwnProperty(propName)) {
      console.log('No ' + propName + ' in config. Aborting.');
      hasErrors = true;
    }
  }
  _.each(
    ['instanceName', 'logDir', 'errors', 'sender', 'recipients'],
    checkProperty);

  if (!config.sender.email) {
    console.log('No sender.email in config. Aborting.');
    hasErrors = true;
  }
  if (!config.sender.password) {
    console.log('No sender.password in config. Aborting.');
    hasErrors = true;
  }
  if (config.recipients && config.recipients.length === 0) {
    console.log('sender.recipients is empty. Aborting.');
    hasErrors = true;
  }
  if (config.errors && config.errors.length === 0) {
    console.log('errors is empty. Aborting.');
    hasErrors = true;
  }
  _.each(config.errors, function(errorObj) {
    if (!errorObj.hasOwnProperty('name')) {
      console.log('No name in error obj. Aborting.');
      hasErrors = true;
    }
    if (!errorObj.hasOwnProperty('string')) {
      console.log('No string in error obj. Aborting.');
      hasErrors = true;
    }
    if (!errorObj.hasOwnProperty('maxNumOccurrences')) {
      console.log('No maxNumOccurrences in error obj. Aborting.');
      hasErrors = true;
    }
    if (!errorObj.hasOwnProperty('ageLimitMinutes')) {
      console.log('No ageLimitMinutes in error obj. Aborting.');
      hasErrors = true;
    }
  });

  if (hasErrors) {
    process.exit();
  }
};

var getLogFileNames = function(dir) {
  var fileNames = fs.readdirSync(dir);
  var sentinelFiles = _.filter(fileNames, function(fileName) {
    return fileName.indexOf('sentinel') > -1;
  });
  return _.map(sentinelFiles, function(sentinelFile) {
    return dir + '/' + sentinelFile;
  });
};

var filterRecentFiles = function(logFiles, ageLimitMinutes) {
  var findLastDate = function(logLines) {
    var date = null;
    var i = logLines.length - 1;
    while (!date && i >= 0) {
      date = extractDateFromLine(logLines[i]);
      i--;
    }
    return date;
  };

  return _.filter(logFiles, function(logFile) {
    var logFileContents = fs.readFileSync(logFile, 'utf8');
    var logLines = logFileContents.split('\n');
    var lastDate = findLastDate(logLines);
    return isDateWithinAgeLimit(lastDate, ageLimitMinutes);
  });
};

var findErrorMessage = function(logFiles, errorString) {
  console.log('Finding "' + errorString + '" in ' + logFiles.length + ' files.');
  var findErrorMessageSingleFile = function(logfile, errorString) {
    return grep(errorString, logfile)
      .then(function(loglines) {
        loglines = loglines.split('\n');
        loglines = _.filter(loglines,function(line) {
          return line !== '';
        });
        console.log('Found', loglines.length, 'log lines containing error string.');
        return loglines;
      });
  };
  return Promise.all(_.map(logFiles, _.partial(findErrorMessageSingleFile, _, errorString)))
    .then(_.flatten);
};

var extractDate = function(loglines) {
  if (loglines.length === 0) {
    return [];
  }
  var dates = _.map(loglines, extractDateFromLine);
  return dates;
};

var extractDateFromLine = function(logline) {
  // E.g. 2015-10-17T15:14:32.176Z
  var dateFormat = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;
  var date = dateFormat.exec(logline);
  if (!date) {
    return null;
  }
  return new Date(date[0]);
};

var isDateWithinAgeLimit = function(date, ageLimitMinutes) {
  var ageLimitMillis = ageLimitMinutes * 60 * 1000;
  var now = new Date();
  var limitDateMillis = now.getTime() - ageLimitMillis;
  return date.getTime() > limitDateMillis;
};

var numDatesInAgeLimit = function(dates, ageLimitMinutes) {
  var recent = _.filter(dates, _.partial(isDateWithinAgeLimit, _, ageLimitMinutes));
  return recent.length;
};

var grep = function(string, file) {
  var cmd = 'grep "' + string + '" ' + file;
  return new Promise(function(resolve, reject) {
    exec(cmd, function(error, stdout, stderr) {
      if (error) {
        // grep returns with 1 when nothing is found. That's ok.
        if (error.code !== 1) {
          return reject(error);
        }
      }
      if (stderr) {
        return reject(stderr);
      }
      resolve(stdout);
    });
  });
};

var sendEmail = function(senderEmail, senderPassword, recipients, instanceName, messages, dryrun) {
  var transporter = nodemailer.createTransport(
    'smtps://' + encodeURIComponent(senderEmail) + ':' + encodeURIComponent(senderPassword) + '@smtp.gmail.com');

  var subject = 'Sentinel alert for ' + instanceName + '!';
  var body = 'Bad news. The Sentinel from ' + instanceName + ' is acting weird. We found these problems:';
  var textOnlyBody = body;
  _.each(messages, function(message) {
    body = body + '<p> - ' + message + '</p>';
    textOnlyBody = textOnlyBody + '\n - ' + message;
  });
  textOnlyBody = textOnlyBody + '\n';
  var mailOptions = {
    from: '"Sentinel Monitor" <' + senderEmail + '>',
    to: recipients.join(),
    subject: subject,
    text: 'Hello chickens 🐥,\n' + textOnlyBody,
    html: '<b>Hello chickens 🐥 !</b> <p>' + body + '</p>'
  };
  console.log('Sending email', mailOptions, '\n');
  if (dryrun) {
    console.log('Dryrun! No email sent.');
    return Promise.resolve();
  }
  return new Promise(function(resolve, reject) {
    transporter.sendMail(mailOptions, function(error, info){
      if(error){
        console.log('Error sending message: ' + JSON.stringify(error));
        reject(error);
        return;
      }
      console.log('Message sent: ' + JSON.stringify(info));
      resolve(info);
    });
  });
};

var monitorError = function(errorObj, logFiles, emailMessages) {
  console.log(' - ' + errorObj.name);
  var recentFiles = filterRecentFiles(logFiles, errorObj.ageLimitMinutes);
  console.log('Recent files : ', recentFiles);
  return findErrorMessage(recentFiles, errorObj.string)
    .then(_.partial(extractDate, _, errorObj.string))
    .then(_.partial(numDatesInAgeLimit, _, errorObj.ageLimitMinutes))
    .then(function(numOccurrences) {
      var message = numOccurrences + ' ' + errorObj.name + ' within the last ' + errorObj.ageLimitMinutes +
      ' minutes. Limit is ' + errorObj.maxNumOccurrences + '.';
      console.log(message);
      if (numOccurrences > errorObj.maxNumOccurrences) {
        console.log('NOT OK!!!!\n');
        emailMessages.push(message);
      } else {
        console.log('That\'s cool.');
      }
      return;
    });
};

var monitor = function() {
  var now = new Date();
  console.log('\n---------' + now.toUTCString() + '   (' + now + ')   (' + now.getTime() + ')');

  var config = readConfigFromFile(__dirname + '/sentinel_monitor_config.json');
  // Print out config, without the password.
  var configCopy = JSON.parse(JSON.stringify(config));
  configCopy.sender.password = '***';
  console.log('Config :\n', configCopy, '\n');

  var files = getLogFileNames(config.logDir);

  var emailMessages = [];
  var megaPromise = Promise.resolve();
  _.each(config.errors, function(errorObj) {
    megaPromise = megaPromise.then(function() {
      return monitorError(errorObj, files, emailMessages);
    });
  });
  megaPromise = megaPromise
    .then(function() {
      console.log();
      if (emailMessages.length > 0) {
        console.log('Found problems, sending email.');
        return sendEmail(config.sender.email, config.sender.password, config.recipients, config.instanceName, emailMessages, config.dryrun);
      }
      return console.log('No problems!');
    })
    .then(function() {
      console.log('--- End of run');
    })
    .catch(function(err) {
      console.error('Something went wrong!', err);
    });
};

monitor();
