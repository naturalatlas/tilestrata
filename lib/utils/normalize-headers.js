function normalizeHeaders(headers, headerKeysBefore) {
	if (!headers || !headerKeysBefore || !headerKeysBefore.length) return headers;

	var headerKeysBeforeLowercase;
	var keys = Object.keys(headers);
	for (var i = 0, n = keys.length; i < n; ++i) {
		var k = keys[i];
		// if this is a new key, look to see if there's another key
		// with a different case that conflicts and delete the old value
		if (headerKeysBefore.indexOf(k) === -1) {
			if (!headerKeysBeforeLowercase) headerKeysBeforeLowercase = headerKeysBefore.map(v => v.toLowerCase());
			var indexToRemove = headerKeysBeforeLowercase.indexOf(k.toLowerCase());
			if (indexToRemove > -1) {
				var oldKey = headerKeysBefore[indexToRemove];
				delete headers[oldKey];
			}
		}
	}

	return headers;
}

module.exports = normalizeHeaders;
