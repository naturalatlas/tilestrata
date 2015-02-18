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

	return function(req, res, next) {
		var url = req.url;
		if (url.substring(0, prefix_len) === prefix) {
			url = url.substring(prefix_len);
		} else {
			return next();
		}

		var tilereq = TileRequest.parse(url, req.headers, req.method);
		server.serve(tilereq, {req: req, res: res}, function(status, buffer, headers) {
			if (status === 404) return next();
			res.writeHead(status, headers);
			res.write(buffer);
			res.end();
		});
	};
};
