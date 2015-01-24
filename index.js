module.exports.TileLayer = require('./lib/TileLayer.js');
module.exports.TileRequest = require('./lib/TileRequest.js');
module.exports.TileRequestHandler = require('./lib/TileRequestHandler.js');
module.exports.TileServer = require('./lib/TileServer.js');

module.exports.createServer = function() {
	return new module.exports.TileServer();
};

module.exports.middleware = function(options) {
	options = options || {};
	var prefix = (options.prefix || '').replace(/\/$/, '');
	var prefix_len = prefix.length;
	var server = options.server;
	if (!(server instanceof module.exports.TileServer)) {
		throw new Error('"server" option required, and must be a TileServer instance');
	}

	return function(req, res, next) {
		var url = req.url;
		if (url.substring(0, prefix_len) === prefix) {
			url = url.substring(prefix_len);
		} else {
			return next();
		}
		server.serve(req.method, url, req.headers, function(status, buffer, headers) {
			if (status === 404) return next();
			res.writeHead(status, headers);
			res.write(buffer);
			res.end();
		});
	};
};
