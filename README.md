# Secrets

# Getting Started

## Node

### Installation

    npm install priv

### Initialization

The `priv` module exports a function which when called will initialize a secret generator and return it.  A common set up would be to have a `secrets.js` file in your project that is shared by all modules.

    // secrets.js
    var priv = require('priv'),
        secrets = priv();
    module.exports = secrets;

Now you can use this secret generator instance across your project:

    // In a module where you want to use secrets:
    var secrets = require('./secrets'),
        S = secrets.create();

    // ...

(See *Usage* below for more information.)

## Browser

### Basic

Download `Secrets.js` and serve it in a `<script>` tag.  Then initialize a secret generator by calling the `Secrets` function.

    <script type="text/javascript" src="path/to/secrets.js"></script>
    <script type="text/javascript">
        var secrets = Secrets();
    </script>

Inside another script, you can use `secrets.create()` to create a secret coupler (see below).

### AMD

It's also possible to import Secrets as an AMD module.  A common set up would be to define a globally-accessible secret generator instance.

    // In an initialization script...
    define('secrets', [ 'path/to/secrets' ], function(Secrets) {
        return Secrets();
    });

    // In a module where you want to use secrets...
    require([ 'secrets' ], function(secrets) {
        var S = secrets.create();
        // ...
    });

# Usage

Secrets can be used to tie "private" properties to objects in JavaScript.  Use `Secrets.create` to create a **secret coupler**, a function which can be used to attach private properties to an object.

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
