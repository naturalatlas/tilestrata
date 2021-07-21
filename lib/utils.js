var async = require('async');

/**
 * Wraps a provider in a concurrency limiter.
 *
 * .use(wrapWithMaxConcurrency(proxy(...), 5))
 *
 * @param {Object|Array} provider
 * @return {Object}
 */
function wrapWithMaxConcurrency(plugin, maxConcurrency) {
	// multi-function plugin support
	if (Array.isArray(plugin)) {
		for (var i = 0, n = plugin.length; i < n; ++i) {
			if (plugin[i].serve) {
				var arr = plugin.concat([]);
				arr[i] = wrapWithMaxConcurrency(plugin[i], maxConcurrency);
				return arr;
			}
		}
		throw new Error('Only provider plugins are supported by maxConcurrency');
	}

	if (!plugin.serve) throw new Error('Only provider plugins are supported by maxConcurrency');
	var baseServe = plugin.serve;
	var queue = async.queue(function(task, callback) {
		baseServe(task.server, task.req, function(err, result, headers) {
			callback(err, [result, headers]);
		});
	}, maxConcurrency);

	return Object.assign({}, plugin, {
		serve: function(server, req, callback) {
			queue.push({ server, req }, function(err, result) {
				callback(err, result && result[0], result && result[1]);
			});
		},
	});
};

module.exports.wrapWithMaxConcurrency = wrapWithMaxConcurrency;
