var createSecret = (function(Object, String) {

	'use strict';

	// If this is not an ES5 environment, we can't do anything.
	if (
		/* We'll at least need the following functions.
		 * While not exhaustive, this should be a good enough list to make sure
		 * we're in an ES5 environment.
		 */
		!Object.getOwnPropertyNames
		|| !Object.getOwnPropertyDescriptor
		|| !Object.defineProperty
		|| !Object.defineProperties
		|| !Object.keys
		|| !Object.create
		|| !Object.freeze
		|| !Object.isExtensible
	)
		return function NoES5() {
			throw new Error('An ECMAScript 5 environment was not detected.');
		};

	// We capture the built-in functions and methods as they are now and store them as references so that we can
	// maintain some integrity. This is done to prevent scripts which run later from mischievously trying to get
	// details about or alter the secrets stored on an object.
	var lazyBind = Function.prototype.bind.bind(Function.prototype.call),

		// ES5 functions
		create = Object.create,
		getPrototypeOf = Object.getPrototypeOf,
		isExtensible = Object.isExtensible,
		freeze = Object.freeze,
		keys = Object.keys,
		getOwnPropertyNames = Object.getOwnPropertyNames,
		getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor,
		_defineProperty = Object.defineProperty,
		hasOwn = lazyBind(Object.prototype.hasOwnProperty),
		push = lazyBind(Array.prototype.push),
		forEach = lazyBind(Array.prototype.forEach),
		map = lazyBind(Array.prototype.map),
		join = lazyBind(Array.prototype.join),
		splice = lazyBind(Array.prototype.splice),
		ArrayIndexOf = lazyBind(Array.prototype.indexOf),
		fromCharCode = String.fromCharCode,
		apply = lazyBind(Function.prototype.apply),
		bind = lazyBind(Function.prototype.bind),

		// ES Harmony functions
		getPropertyNames = Object.getPropertyNames,

		// ES.next strawman functions
		getPropertyDescriptors = Object.getPropertyDescriptors,
		getOwnPropertyDescriptors = Object.getOwnPropertyDescriptors,

		// ES Harmony constructors
		_Proxy = typeof Proxy == 'undefined' ? undefined : Proxy,

		// Determines whether object[SECRET_KEY] should expose the secret map.
		locked = true,

		random = getRandomGenerator(),
		MIN_PRECISION = -Math.pow(2, 53),
		MAX_PRECISION = -MIN_PRECISION,
		// idNum will ensure identifiers are unique.
		idNum = (function() {
			// Use an Array-like rather than a true array to protect against setters defined on Array.prototype indices.
			var idNum = create(null);
			idNum[0] = MIN_PRECISION;
			idNum.length = 1;
			return idNum;
		})(),
		preIdentifier = randStr(7) + '0',
		SECRET_KEY = '!S:' + getIdentifier(),

		protoIsMutable = (function() {
			// TODO: Keep up-to-date with whether ES6 goes with __proto__ or Reflect.setPrototypeOf.
			var A = create(null),
				A2 = create(null),
				B = create(A);
			B.__proto__ = A2;
			return getPrototypeOf(B) === A2;
		})();

	(function() {
		// Override get(Own)PropertyNames and get(Own)PropertyDescriptors to hide SECRET_KEY.

		var overrides = create(null);

		overrides.getOwnPropertyNames = getOwnPropertyNames
		if (getPropertyNames) overrides.getPropertyNames = getPropertyNames;

		keys(overrides).forEach(function(u) {
			var original = overrides[u];
			_defineProperty(Object, u, {
				value: function(obj) {
					var names = apply(original, this, arguments);
					if (u === 'getOwnPropertyNames' && !hasOwn(obj, SECRET_KEY))
						return names;
					var index = ArrayIndexOf(names, SECRET_KEY);
					if (~index)
						splice(names, index, 1);
					return names;
				},
				enumerable: false,
				writable: true,
				configurable: true
			});
		});

		overrides = create(null);

		if (getPropertyDescriptors) overrides.getPropertyDescriptors = getPropertyDescriptors;
		if (getOwnPropertyDescriptors) overrides.getOwnPropertyDescriptors = getOwnPropertyDescriptors;

		keys(overrides).forEach(function(u) {
			var original = overrides[u];
			_defineProperty(Object, u, {
				value: function(obj) {
					var desc = apply(original, this, arguments);
					delete desc[SECRET_KEY];
					return desc;
				},
				enumerable: false,
				writable: true,
				configurable: true
			});
		});

	})();

	// Override functions which prevent extensions on objects to go ahead and add a secret map first.
	[ 'preventExtensions', 'seal', 'freeze' ].forEach(function(u) {
		var original = Object[u];
		_defineProperty(Object, u, {
			value: function(obj) {
				// Define the secret map.
				Secrets(obj);
				return apply(original, this, arguments);
			}
		});
	});

	if (typeof _Proxy == 'function') {

		Proxy = (function() {
			/* TODO: This works for "direct_proxies", the current ES6 draft; however, some browsers have
			 * support for an old draft (such as FF 17 and below) which uses Proxy.create(). Should this
			 * version be overridden to protect against discovery of SECRET_KEY on these browsers also?
			 */

			var trapBypasses = create(null);
			trapBypasses.defineProperty = _defineProperty;
			trapBypasses.hasOwn = hasOwn;
			trapBypasses.get = function(target, name) { return target[name]; };

			return function Proxy(target, traps) {

				if (!(this instanceof Proxy)) {
					// TODO: The new keyword wasn't used. What should be done?
					return new Proxy(target, traps);
				}

				var _traps = create(traps);

				forEach(keys(trapBypasses), function(trapName) {
					var bypass = trapBypasses[trapName];
					if (typeof traps[trapName] == 'function') {
						// Override traps which could discover SECRET_KEY.
						_traps[trapName] = function(target, name) {
							if (name === SECRET_KEY) {
								// Bypass any user defined trap when name === SECRET_KEY.
								return apply(bypass, null, arguments);
							}
							return apply(traps[trapName], this, arguments);
						};
					}
				});

				return new _Proxy(target, _traps);
			};

		})();

	} else if (_Proxy && _Proxy.create) {

//		Proxy.create = (function() {
//
//			return function create(traps, proto) {
//				// TODO
//			};
//
//		})();

	}
	
	return function createSecret() {

		var id = nextUniqueId();

		return function secret(obj) {
			var secrets = Secrets(obj),
				S, proto, protoS, protoSTest;
			if (secrets) {
				S = secrets[id];
				if (!S) {
					proto = getPrototypeOf(obj);
					secrets[id] = S = create(proto ? secret(proto) : null);
				} else if (protoIsMutable) {
					// TODO: Keep up-to-date with whether ES6 goes with __proto__ or Reflect.setPrototypeOf.
					proto = getPrototypeOf(obj);
					protoS = getPrototypeOf(S);
					protoSTest = proto == null ? null : secret(proto);
					if (protoSTest !== protoS)
						S.__proto__ = protoSTest;
				}
				return S;
			} else
				// The object may have been frozen in another frame.
				throw new Error('This object doesn\'t support secrets.');
		};

	};

	function Secrets(O) {
		// Returns undefined if object doesn't already have Secrets and the object is non-extensible. This should
		// really only happen if an object is passed in from another frame, because in this frame preventExtensions
		// is overridden to add a Secrets property first.

		if (O !== Object(O))
			throw new Error('Not an object: ' + O);

		if (!hasOwn(O, SECRET_KEY)) {
			if (!isExtensible(O)) return;
			defineProperty(O, SECRET_KEY, {

				get: (function() {
					var secretMap = create(null);
					return function getSecret() {
						// The lock protects against retrieval in the event that the SECRET_KEY is discovered.
						if (locked) return;
						locked = true;
						return secretMap;
					};
				})(),

				enumerable: false,
				configurable: false

			});
		}

		locked = false;	
		return O[SECRET_KEY];

	}

	function getIdentifier() {
		return preIdentifier + ':' + join(getRandStrs(8, 11), '/') + ':' + nextUniqueId();
	}

	function nextUniqueId() {
		idNum[0]++;
		for(var i = 0; idNum[i] >= MAX_PRECISION && i < idNum.length; i++) {
			idNum[i] = MIN_PRECISION;
			if (i < idNum.length) idNum[i + 1]++;
			else {
				// Reset and add a digit.
				idNum = map(idNum, function() { return MIN_PRECISION; });
				push(idNum, MIN_PRECISION);
				break;
			}
		}
		return '{' + join(idNum, ',') + '}';
	}

	function encodeStr(num) {
		return fromCharCode(num + 65);
	}

	function getRandStrs(count, length) {
		var r = create(null);
		r.length = 0;
		for(var i = 0; i < count; i++) {
			push(r, randStr(length));
		}
		return r;
	}

	function randStr(length) {
		var s = '';
		for (var i = 0; i < length; i++) {
			s += encodeStr(random() * (125 - 65 + 1));
		}
		return s;
	}

	function getRandomGenerator() {
		var getRandomValues
			= typeof crypto != 'undefined' && crypto != null
				? (function() {
					var f = crypto.random || crypto.getRandomValues;
					if (f) return f.bind(crypto);
					return undefined;
				})()
				: undefined;
		if (getRandomValues) {
			// Firefox (15 & 16) seems to be throwing a weird "not implemented" error on getRandomValues.
			// Not sure why?
			try { getRandomValues(new Uint8Array(4)); }
			catch(x) { getRandomValues = undefined }
		}
		if (typeof getRandomValues == 'function' && typeof Uint8Array == 'function') {
			return (function() {
				var values = new Uint8Array(4), index = 4;
				return function random() {
					if (index >= values.length) {
						getRandomValues(values);
						index = 0;
					}
					return values[index++] / 256;
				};
			})();
		} else return Math.random;
	}

	// We only want to define with own properties of the descriptor.
	function defineProperty(obj, name, desc) {
		if ('value' in desc && !hasOwn(desc, 'value')
			|| 'get' in desc && !hasOwn(desc, 'get')
			|| 'set' in desc && !hasOwn(desc, 'set')
			|| 'writable' in desc && !hasOwn(desc, 'writable'))
			desc = safeDescriptor(desc);
		return _defineProperty(obj, name, desc);
	}

	function safeDescriptor(obj) {
		if (obj == null)
			throw new TypeError('Argument cannot be null or undefined.');
		obj = Object(obj);
		var O = create(null),
			k = keys(obj);
		for (var i = 0, key = k[i]; key = k[i], i < k.length; i++)
			O[key] = obj[key];
		return O;
	}

// We pass in Object and String to ensure that they cannot be changed later to something else.
})(Object, String);

if (typeof exports != 'undefined' && exports != null)
	exports.createSecret = createSecret;