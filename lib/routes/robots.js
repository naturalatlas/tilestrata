var BUFFER_ROBOTSTXT = new Buffer('User-agent: *\nDisallow: /\n', 'utf8');

module.exports = function(req, res, server) {
	res.writeHead(200, {'Content-Length': BUFFER_ROBOTSTXT.length, 'Content-Type': 'text/plain'});
	res.write(BUFFER_ROBOTSTXT);
	res.end();
};