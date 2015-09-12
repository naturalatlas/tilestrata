var _ = require('lodash');
var os = require('os');
var hostname = os.hostname();

module.exports = function(req, res, server) {
	server.checkHealth(function(err, result) {
		var status = 200;
		var host = process.env.TILESTRATA_HIDEHOSTNAME ? '(hidden)' : hostname;
		var data = _.extend({ok: true, version: server.version, host: host}, result);
		if (err) {
			status = 500;
			data.ok = false;
			data.message = String(err.message || err);
		}

		var resbuffer = new Buffer(JSON.stringify(data), 'utf8');
		res.writeHead(status, {'Content-Length': resbuffer.length, 'Content-Type': 'application/json'});
		res.write(resbuffer);
		res.end();
	});
};