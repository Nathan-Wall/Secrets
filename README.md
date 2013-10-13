# Secrets

Secrets can be used to tie "private" properties to objects in JavaScript.  Use `Secrets.create` to create a **secret coupler**, a function which can be used to attach private properties to an object.

## Getting Started

### Node

#### Installation

    npm install priv

Then...

    var secrets = require('priv');
    // ...

### Browser

#### Basic

Download `secrets.js` and serve it in a `<script>` tag.

    <script type="text/javascript" src="path/to/secrets.js"></script>

This will export a global `secrets` object.  Inside another script, you can use `secrets.create()` to create a secret coupler (see below).

#### AMD

It's also possible to import Secrets as an AMD module.

    require([ 'path/to/secrets' ], function(secrets) {
        // ...
    });

## Usage

    var S = secrets.create();
    
    var obj = { };
    S(obj).foo = 'bar';
    
    console.log(S(obj).foo); // => "bar"

If the secret coupler is guarded, the properties cannot be read by scripts which don't have access to the function.  Secret couplers can be guarded in closures.

    var Point = (function() {
    
        var S = secrets.create();

        function Point(x, y) {
            S(this).x = x;
            S(this).y = y;
        }

        Point.prototype.getCoords = function() {
            return S(this).x + ',' + S(this).y;
        };

        return Point;
    
    })();

    var P = new Point(3, 4),
        Q = new Point(-5, 7);

    P.getCoords(); // => "3,4"
    Q.getCoords(); // => "-5,7"

Using secrets in this way allows class-private variables.  This means two instances of the same constructor can access each other's privates (since they share the same secret coupler).

    var Point = (function() {
    
        var S = secrets.create();

        function Point(x, y) {
            S(this).x = x;
            S(this).y = y;
        }

        Point.prototype.getCoords = function() {
            return S(this).x + ',' + S(this).y;
        };

        Point.prototype.add = function(p) {
            S(this).x += S(p).x;
            S(this).y += S(p).y;
        };

        return Point;
    
    })();

    var P = new Point(3, 4),
        Q = new Point(-5, 7);

    P.add(Q);
    P.getCoords(); // => "-2,11"

## Advanced Configuration

You may specify configuration options either when you create the secret coupler or by initializing a new secrets generator.

### Configuring the Secret Coupler

There are some configuration options available when creating a secret coupler (`secrets.create`).  The following options are available:

#### inherit

The `inherit` flag determines whether the private data added to objects should be inherited through prototypal inheritance.  By default, `inherit` is `true`.

    var secrets = Secrets();

    var A = secrets.create({ inherit: true }),
        B = secrets.create({ inherit: false });

    var x = Object.create(null),
        // y inherits from x
        y = Object.create(x);

    A(x).foo = 'bar';
    // The foo property is inherited because secretsA is configured to inherit.
    A(y).foo; // => 'bar'

    B(x).baz = 'bar';
    // The baz property is *not* inherited because secretsB is configured to *not* inherit.
    B(y).baz; // => undefined

#### storeGenerator

The `storeGenerator` option is available.  This option is only for very advanced users who have particular needs.  Most people shouldn't need this option, and there's no documentation for how to use this option.  (It would needlessly take up space in this README.)  If you want a little bit of flexibility over how data is stored, see the `storageType` option below.

### Configuring Defaults

You may specify configuration options by initializing a new secret generator and passing in an object of configuration properties.

    var secrets2 = secrets.configure({
        storageType: 'WeakMap',
        inherit: false
    });

    // Later...
    var S = secrets2.create();
    // This secret will use a WeakMap storage type and not inherit

Note that `secrets.configure` does **not** affect the configuration of the `secrets` object it is called on; rather it returns a new secrets object which can be used to create secret couplers using the specified configuration.

#### inherit

Ths option is also available when intializing a secret generator.  In this case, it sets the default, but the default can be overridden by options passed to `secret.create`.

    var secretsA = secrets.configure({ inherit: true }),
        secretsB = secrets.configure({ inherit: false });

    var A = secretsA.create(),
        B = secretsB.create();

    var x = Object.create(null),
        // y inherits from x
        y = Object.create(x);

    A(x).foo = 'bar';
    // The foo property is inherited because secretsA is configured to inherit.
    A(y).foo; // => 'bar'

    B(x).baz = 'bar';
    // The baz property is *not* inherited because secretsB is configured to *not* inherit.
    B(y).baz; // => undefined

#### storageType

There are currently two available storage types: `'WeakKeyedStore'` and `'WeakMap'`.  `'WeakKeyedStore'` is default.  The `'WeakMap'` requires the environment to support ES6 WeakMaps.  There is no discernable difference in the semantics of Secrets between the two storage options.  A WeakMap store may be better performance when it's available, though it may not be.  No performance tests have been run.
