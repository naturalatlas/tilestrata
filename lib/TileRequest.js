var path = require('path');

var TileRequest = module.exports = function(x, y, z, layer, filename, headers, method, qs) {
	this.x = x;
	this.y = y;
	this.z = z;
	this.layer = layer;
	this.filename = filename;
	this.headers = headers || {};
	this.method = method || 'GET';
	this.hasFilename = true;
	this.qs = qs;
	this.closed = false;
};

function isInt(number) {
	return !isNaN(number) && number === parseInt(number, 10);
}

TileRequest.parse = function(url, headers, method) {
	if (!url) return;

	// query string
	var qs, index_qs = url.indexOf('?');
	if (index_qs > -1) {
		qs = url.substring(index_qs + 1);
	}

	// strip off query string
	var pos = url.indexOf('?');
	if (pos > -1) url = url.substring(0, pos);

	// strip first slash
	if (url.charAt(0) === '/') url = url.substring(1);

	var parts = url.split('/');
	if (parts.length !== 4 && parts.length !== 5) return;

	var layer = parts[0];
	var z = Number(parts[1]);
	var x = Number(parts[2]);
	var hasFilename = isNaN(Number(parts[3])) ? false : true;

	var y, filename;
	if (hasFilename) {
		y = Number(parts[3]);
		filename = parts[4];
	} else {
		// if the request is in the format of "/0/0/0.png", we set the filename to
		// "t.png" in order to have compatiblity with caches and other plugins that
		// expect a proper filename to present (like from the "/0/0/0/t.png" format).
		var i0 = parts[3].indexOf('.'); // /0/0/0.png
		var i1 = parts[3].indexOf('@'); // /0/0/0@2x.png
		var splitPoint = i0;
		if (i0 > -1 && i1 > -1) {
			splitPoint = Math.min(i0, i1);
		} else if (i1 > -1) {
			splitPoint = i1;
		}
		y = Number(parts[3].substring(0, splitPoint));
		filename = 't' + parts[3].substring(splitPoint);
	}

	if (!isInt(x)) return;
	if (!isInt(y)) return;
	if (!isInt(z)) return;
	if (!filename) return;
	if (!layer) return;

	var req = new TileRequest(x, y, z, layer, filename, headers, method, qs);
	req.hasFilename = hasFilename;
	return req;
};

TileRequest.prototype.clone = function() {
	var headers = {};
	for (var k in this.headers) {
		if (this.headers.hasOwnProperty(k)) {
			headers[k] = this.headers[k];
		}
	}
	var req = new TileRequest(this.x, this.y, this.z, this.layer, this.filename, headers, this.method, this.qs);
	req.hasFilename = this.hasFilename;
	req.parent = this;
	return req;
};

TileRequest.prototype.isClosed = function() {
	if (this.closed) return true;
	if (this.parent) return this.parent.isClosed();
	return false;
}
