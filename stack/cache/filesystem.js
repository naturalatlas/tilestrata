var fs = require('fs-extra');
var mime = require('mime');

function FileSystemCache(options) {
	this.options = options || {};
};

FileSystemCache.prototype._dir = function(x, y, z) {
	return this.options.dir + '/' + z + '/' + x + '/' + y;
};

FileSystemCache.prototype._file = function(req) {
	return this._dir(req.x, req.y, req.z) + '/' + req.filename;
};

FileSystemCache.prototype.init = function(server, callback) {
	fs.ensureDir(this.options.dir, callback);
};

/**
 * Retrieves a tile from the filesystem.
 *
 * @param {TileServer} server
 * @param {TileRequest} req
 * @param {function} callback(err, buffer, headers)
 * @return {void}
 */
FileSystemCache.prototype.get = function(server, req, callback) {
	var file = this._file(req);
	fs.readFile(file, function(err, buffer) {
		if (err) return callback(err);
		callback(null, buffer, {
			'Content-Type': mime.lookup(file),
			'Content-Length': buffer.length
		});
	});
};

/**
 * Stores a tile on the filesystem.
 *
 * @param {TileServer} server
 * @param {TileRequest} req
 * @param {Buffer} buffer
 * @param {object} headers
 * @param {Function} callback
 */
FileSystemCache.prototype.set = function(server, req, buffer, headers, callback) {
	fs.outputFile(this._file(req), buffer, callback);
};

module.exports = function(options) {
	return new FileSystemCache(options);
};