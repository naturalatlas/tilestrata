var _enabled = true;
module.exports.enable = function() { _enabled = true; };
module.exports.disable = function() { _enabled = false; };

module.export.request = function(method, req) {
	if (!_enabled) return;
	console.log(method + ' ' + req.layer + '"' + req.filename + '" (' + req.x + ',' + req.y + ', zoom: ' + req.z + ')');
};