var path = require('path');

var TileRequest = module.exports = function(x, y, z, layer, filename) {
	this.x = x;
	this.y = y;
	this.z = z;
	this.layer = layer;
	this.filename = filename;
};

function isInt(number) {
	return !isNaN(number) && number === parseInt(number, 10);
}

TileRequest.parse = function(url) {
	if (!url) return;

	// strip off query string
	var pos = url.indexOf('?');
	if (pos > -1) url = url.substring(0, pos);

	// strip first slash
	if (url.charAt(0) === '/') url = url.substring(1);

	var parts = url.split('/');
	if (parts.length !== 5) return;
	var layer = parts[0];
	var z = Number(parts[1]);
	var x = Number(parts[2]);
	var y = Number(parts[3]);
	var filename = parts[4];

	if (!isInt(x)) return;
	if (!isInt(y)) return;
	if (!isInt(z)) return;
	if (!filename) return;
	if (!layer) return;

	return new TileRequest(x, y, z, layer, filename);
};