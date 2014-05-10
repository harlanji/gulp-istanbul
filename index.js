"use strict";

var through = require('through2').obj;
var path = require("path");
var istanbul = require("istanbul");
var gutil = require('gulp-util');
var _ = require('lodash');
var hook = istanbul.hook;
var Report = istanbul.Report;
var Collector = istanbul.Collector;
var PluginError = gutil.PluginError;

var PLUGIN_NAME = 'gulp-istanbul';
var COVERAGE_VARIABLE = '$$cov_' + new Date().getTime() + '$$';


var plugin  = module.exports = function (opts) {
  if (!opts) opts = {};
  if (!opts.coverageVariable) opts.coverageVariable = COVERAGE_VARIABLE;
  var fileMap = {};

  hook.hookRequire(function (path) {
    return !!fileMap[path];
  }, function (code, path) {
    return fileMap[path];
  });

  var instrumenter = new istanbul.Instrumenter({ coverageVariable: opts.coverageVariable });

  return through(function (file, enc, cb) {
    if (!file.contents instanceof Buffer) {
      return cb(new PluginError(PLUGIN_NAME, "streams not supported"), undefined);
    }

    instrumenter.instrument(file.contents.toString(), file.path, function (err, code) {
      if (!err) file.contents = new Buffer(code);

      fileMap[file.path] = file.contents.toString();

      return cb(err, file);
    });
  });
};

plugin.summarizeCoverage = function (opts) {
  if (!opts) opts = {};
  if (!opts.coverageVariable) opts.coverageVariable = COVERAGE_VARIABLE;

  if (!global[opts.coverageVariable]) throw new Error('no coverage data found, run tests then call #summarizeCoverage then call #writeReports');

  var collector = new Collector();
  collector.add(global[opts.coverageVariable]);
  return istanbul.utils.summarizeCoverage(collector.getFinalCoverage());
};

plugin.writeReports = function (opts) {
  if (typeof opts === 'string') opts = { dir: opts };
  if (!opts) opts = {};
  if (!opts.coverageVariable) opts.coverageVariable = COVERAGE_VARIABLE;
  if (!opts.dir) opts.dir = path.join(process.cwd(), "coverage");
  if (!opts.reporters) opts.reporters = [ "lcov", "json", "text", "text-summary" ];
  if (!opts.reportOpts) opts.reportOpts = { dir: opts.dir };

  var validReports = Report.getReportList();
  var invalid = _.difference(opts.reporters, validReports);
  if (invalid.length) {
    // throw before we start -- fail fast
    throw new PluginError(PLUGIN_NAME, 'Invalid reporters: '+invalid.join(', '));
  }

  var reporters = opts.reporters.map(function (r) {
    return Report.create(r, opts.reportOpts);
  });

  var cover = through();

  cover.on('end', function() {
    var collector = new Collector();
    collector.add(global[opts.coverageVariable]);
    reporters.forEach(function (report) { report.writeReport(collector, true); });
    delete global[opts.coverageVariable];

  }).resume();

  return cover;
};
