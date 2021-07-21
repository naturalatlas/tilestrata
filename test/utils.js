var async = require('async');
var utils = require('../lib/utils.js');
var assert = require('chai').assert;

describe('utils', function() {
	describe('wrapWithMaxConcurrency', function() {
		var wrapWithMaxConcurrency = utils.wrapWithMaxConcurrency;
		it('should limit concurrency', function(done) {
			var active = 0;
			var maxConcurrency = 5;
			var plugin = wrapWithMaxConcurrency([{
				serve: function(server, req, callback) {
					var id = req.id;
					// console.log('Processing #' + id);
					++active;
					if (active > maxConcurrency) {
						throw new Error('Too many active at a time!');
					}
					var finish = (err, body, headers) => {
						--active;
						// console.log('Finished #' + id);
						callback(err, body, headers);
					};
					if (req.shouldFail) {
						return setTimeout(finish, 50, new Error('Failed'));
					}
					setTimeout(finish, 50, null, '#' + req.id, {});
				},
			}], 5);

			var result = [];
			var runner = (taskId, shouldFail) => {
				return callback => {
					plugin[0].serve(null, { id: taskId, shouldFail }, (err, body, headers) => {
						result.push(err ? '#' + taskId + ' failed' : body);
						callback();
					});
				};
			};
			async.parallel([
				runner(1),
				runner(2),
				runner(3),
				runner(4, true),
				runner(5),
				runner(6),
				runner(7),
				runner(8),
			], err => {
				if (err) throw err;
				assert.deepEqual(result, [
					'#1',
					'#2',
					'#3',
					'#4 failed',
					'#5',
					'#6',
					'#7',
					'#8',
				]);
				done();
			});
		});
	});
});
