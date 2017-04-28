var packageUtils = require("../../utils/packageUtils");
var progressBar  = require("../../utils/progressBar");
var npmUtils     = require("../../utils/npmUtils");
var fsUtils      = require("../../utils/fsUtils");
var logger       = require("../../utils/logger");
var async        = require("async");
var path         = require("path");

function execScript(packagesLoc, pkg, name) {
  // prepublish script
  var packageLocation = packageUtils.getPackagePath(packagesLoc, pkg.folder)
  var script = path.join(packageLocation, "scripts", name + ".js");

  // Execute prepublish script if it exists
  if (fsUtils.existsSync(script)) {
    require(script);
  } else {
    logger.log("info", "No " + name + " script found at " + script, true);
  }
}

var execPostpublishScript = logger.logifySync("execPostpublishScript", function (packagesLoc, pkg) {
  execScript(packagesLoc, pkg, "postpublish");
});

var execPrepublishScript = logger.logifySync("execPrepublishScript", function (packagesLoc, pkg) {
  execScript(packagesLoc, pkg, "prepublish");
});

function overwriteError(err) {
  var overwrite = false;
  [
    "publish over existing version",
    "You cannot publish over the previously published version"
  ].forEach(function(message) {
    if (err.indexOf(message) >= 0) {
      overwrite = true;
    }
  });
  return overwrite;
}

module.exports = function npmPublishAsPrerelease(packages, packagesLoc, callback) {

  packages.forEach(function (pkg) {
    execPrepublishScript(packagesLoc, pkg);
  });

  logger.log("info", "Publishing tagged packages...");

  progressBar.init(packages.length);

  async.parallelLimit(packages.map(function (pkg) {
    var retries = 0;

    return function run(done) {
      var loc = packageUtils.getPackagePath(packagesLoc, pkg.folder);

      logger.log("info", "Publishing " + pkg.name + "...", true);

      npmUtils.publishTaggedInDir("lerna-temp", loc, function(err) {
        if (err) {
          err = err.stack || err;

          if (!overwriteError(err)) {
            if (++retries < 5) {
              logger.log("warning", "Attempting to retry publishing " + pkg.name + "...", false, err);
              return run(done);
            } else {
              logger.log("error", "Ran out of retries while publishing " + pkg.name, false, err);
              return done(err);
            }
          } else {
            // publishing over an existing package which is likely due to a timeout or something
            return done();
          }
        }

        progressBar.tick(pkg.name);
        execPostpublishScript(packagesLoc, pkg);
        done();
      });
    };
  }), 4, function(err) {
    progressBar.terminate();
    callback(err);
  });
};
