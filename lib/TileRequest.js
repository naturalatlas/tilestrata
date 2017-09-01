var path = require('path');

var TileRequest = module.exports = function(x, y, z, layer, filename, headers, method, qs) {
	this.x = x;
	this.y = y;
	this.z = z;
	this.layer = layer;
	this.filename = filename;
	this.headers = headers || {};
	this.method = method || 'GET';
	this.qs = qs;
};

function isInt(number) {
	return !isNaN(number) && number === parseInt(number, 10);
}

TileRequest.parse = function(url, headers, method, noFilename) {
	if (!url) return;

	// query string
	var qs, index_qs = url.indexOf('?');
	if (index_qs > -1) {
		qs = url.substring(index_qs+1);
	}

	// strip off query string
	var pos = url.indexOf('?');
	if (pos > -1) url = url.substring(0, pos);

	// strip first slash
	if (url.charAt(0) === '/') url = url.substring(1);

	var parts = url.split('/');
	if (noFilename && parts.length !== 4) return;
	if (!noFilename && parts.length !== 5) return;
	var layer = parts[0];
	var z = Number(parts[1]);
	var x = Number(parts[2]);
	var y = (noFilename) ? Number(parts[3].split('.')[0]) : Number(parts[3]);
	var filename = (noFilename) ? parts[3].split('.')[1] : parts[4];

	if (!isInt(x)) return;
	if (!isInt(y)) return;
	if (!isInt(z)) return;
	if (!filename) return;
	if (!layer) return;

	return new TileRequest(x, y, z, layer, filename, headers, method, qs);
};

TileRequest.prototype.clone = function() {
	var headers = {};
	for (var k in this.headers) {
		if (this.headers.hasOwnProperty(k)) {
			headers[k] = this.headers[k];
		}
	}
	return new TileRequest(this.x, this.y, this.z, this.layer, this.filename, headers, this.method, this.qs);
};
