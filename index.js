module.exports.TileLayer = require('./lib/TileLayer.js');
module.exports.TileRequest = require('./lib/TileRequest.js');
module.exports.TileRequestHandler = require('./lib/TileRequestHandler.js');
module.exports.TileServer = require('./lib/TileServer.js');

module.exports.createServer = function() {
	return new module.exports.TileServer();
};

module.exports.middleware = function(options) {
	return function(req, res, next) {
		// TODO: this
		return next();
	};
};
