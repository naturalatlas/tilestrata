var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var filesize = require('filesize');
var auth = require('basic-auth');
var cssfile = path.resolve(__dirname, '../public/profile.css');

module.exports = function(req, res, server) {
	if (process.env.TILESTRATA_PASSWORD) {
		var credentials = auth(req);
		if (!credentials || credentials.pass !== process.env.TILESTRATA_PASSWORD) {
			res.writeHead(401, {'WWW-Authenticate': 'Basic realm="tilestrata"'});
			res.write('Access denied');
			return res.end();
		}
	}


	var data = server.getProfileData();
	var zooms = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25];
	var stageorder = {
		'reqhook': 1,
		'cache.get': 2,
		'provider': 3,
		'transform': 4,
		'reshook': 5,
		'cache.set': 6
	};

	if (/format=json/.test(req.url)) {
		var buffer = new Buffer(JSON.stringify(data), 'utf8');
		res.writeHead(200, {'Content-Length': buffer.length, 'Content-Type': 'application/json; charset=utf-8'});
		res.write(buffer);
		res.end();
	} else {
		fs.readFile(cssfile, 'utf8', function(err, css) {
			if (err) throw err;
			var html = ['<style type="text/css">'+css+'</style>','<h1>TileStrata Profile Data</h1>'];
			var layers = Object.keys(data);
			layers.sort();

			layers.forEach(function(layer) {
				html.push('<h2>'+layer+'</h2>');
				var routes = Object.keys(data[layer]);
				routes.sort();
				html.push('<table cellspacing="0" cellpadding="0" border="1">');
				routes.forEach(function(route) {
					html.push('<tr class="route-heading"><th colspan="2"><em>'+route+'</em></th>');
					zooms.forEach(function(z) {
						html.push('<td width="40"><em>z'+z+'</em></td>');
					});
					html.push('</tr>');

					var plugins = Object.keys(data[layer][route]);
					plugins.sort(function(a,b) {
						var stage_a = stageorder[a.replace(/#\d+/,'')];
						var stage_b = stageorder[b.replace(/#\d+/,'')];
						return stage_a - stage_b;
					});
					plugins.forEach(function(plugin) {
						var plugin_type = plugin.replace(/#\d+/,'').replace(/\./, '-');
						var fields_available = [];
						Object.keys(data[layer][route][plugin]).forEach(function(z) {
							fields_available = _.union(Object.keys(data[layer][route][plugin][z]));
						});

						fields_available.forEach(function(field, i) {
							html.push('<tr class="plugin ' + plugin_type + (i === 0 ? ' plugin-start' : '') + '">');
							if (i === 0) html.push('<td rowspan="' + fields_available.length + '"><strong><code>'+plugin+'</code></strong></td>');
							html.push('<td class="field"><code>'+field+'</code></td>');
							var strong_start = /avg/.test(field) ? '<strong>' : '';
							var strong_end = /avg/.test(field) ? '</strong>' : '';
							zooms.forEach(function(z) {
								try {
									var class_attr = '';
									var val = Math.round(data[layer][route][plugin]['z'+z][field]*10)/10;
									if (isNaN(val)) throw new Error('Not a number');
									if (/size/.test(field) && !/samples/.test(field)) val = filesize(val).replace(' ', '');
									if (field === 'dur_avg') {
										if (val > 500) class_attr = ' class="warn"';
										if (val > 1000) class_attr = ' class="critical"';
									}
									html.push('<td'+class_attr+'>'+strong_start+val+strong_end+'</td>');
								}
								catch(e) { html.push('<td></td>'); }
							});
							html.push('</tr>');
						});
					});
				});
				html.push('</table>');
			});

			var buffer = new Buffer(html.join(''), 'utf8');
			res.writeHead(200, {'Content-Length': buffer.length, 'Content-Type': 'text/html; charset=utf-8'});
			res.write(buffer);
			res.end();
		});
	}
};
