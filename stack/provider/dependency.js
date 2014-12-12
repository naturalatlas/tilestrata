module.exports = function(layer, filename) {
	return {
		serve: function(server, req, callback) {
			server.getTile(layer, filename, req.x, req.y, req.z, callback);
		}
	};
};