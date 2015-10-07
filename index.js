var TileLayer = module.exports.TileLayer = require('./lib/TileLayer.js');
var TileRequest = module.exports.TileRequest = require('./lib/TileRequest.js');
var TileRequestHandler = module.exports.TileRequestHandler = require('./lib/TileRequestHandler.js');
var TileServer = module.exports.TileServer = require('./lib/TileServer.js');

module.exports.createServer = function() {
	return new TileServer();
};

module.exports.middleware = function(options) {
	options = options || {};
	var prefix = (options.prefix || '').replace(/\/$/, '');
	var prefix_len = prefix.length;
	var server = options.server;
	if (!(server instanceof TileServer)) {
		throw new Error('"server" option required, and must be a TileServer instance');
	}

	var pendingRequests = [];
	server.initialize(function(err) {
		if (err) throw err;
		while (pendingRequests.length) {
			var args = pendingRequests.shift();
			handleRequest(args[0], args[1], args[2]);
		}
	});

	function handleRequest(req, res, next) {
		var original_url = req.url;
		if (original_url.substring(0, prefix_len) === prefix) {
			req.url = original_url.substring(prefix_len);
		} else {
			return next();
		}
		server._handleRequest(req, res, function() {
			req.url = original_url;
			next();
		});
	}

	return function(req, res, next) {
		if (!server.initialized) {
			var args = Array.prototype.slice.call(arguments);
			pendingRequests.push(args);
		} else {
			handleRequest(req, res, next);
		}
	};
};
