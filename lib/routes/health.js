var _ = require('lodash');
var os = require('os');
var humanizeDuration = require('humanize-duration');
var hostname = os.hostname();

module.exports = function(req, res, server) {
	server.checkHealth(function(err, result) {
		var status = 200;
		var host = process.env.TILESTRATA_HIDEHOSTNAME ? '(hidden)' : hostname;
		var data = _.extend({
			ok: true,
			version: server.version,
			host: host,
			uptime: humanizeDuration(server.uptime().duration),
			uptime_s: server.uptime().duration / 1000
		}, result);

		// show connection status w/upstream tilestrata balancer
		if (server.options.balancer) {
			var balancer_status = 'initializing';
			if (server.balancer) {
				if (server.balancer.reconnecting()) {
					balancer_status = 'connecting';
				} else {
					balancer_status = 'connected';
				}
			}
			data.balancer = {status: balancer_status};
		}

		// tell tilestrata the balancer knows this node exists
		var incoming_token = req.headers && req.headers['x-tilestratabalancer-token'];
		if (incoming_token && incoming_token === server.balancer_token) {
			server.handleBalancerPing();
		}

		if (err) {
			status = 500;
			data.ok = false;
			data.message = String(err.message || err);
		}

		var resbuffer = Buffer.from(JSON.stringify(data), 'utf8');
		res.writeHead(status, {'Content-Length': resbuffer.length, 'Content-Type': 'application/json'});
		res.write(resbuffer);
		res.end();
	});
};
