Secrets
=======

Secrets can be used to tie "private" properties to objects in JavaScript.  Use `createSecret` to create a **secret generator**, a function which can be used to attach private properties to an object.

    var priv = createSecret();
    
    var obj = { };
    priv(obj).foo = 'bar';
    
    console.log(priv(obj).foo); // => "bar"

If the secret generator is guarded, the properties cannot be read by scripts which don't have access to the function.  Secret generators can be guarded in closures.

    var Point = (function() {
    
        var priv = createSecret();

        function Point(x, y) {
            priv(this).x = x;
            priv(this).y = y;
        }

        Point.prototype.getCoords = function() {
            return priv(this).x + ',' + priv(this).y;
        };

        return function Point;
    
    })();

    var P = new Point(3, 4),
        Q = new Point(-5, 7);

    P.getCoords(); // => "3,4"
    Q.getCoords(); // => "-5,7"

Using secrets in this way allows class-private variables.  This means two instances of the same constructor can access each other's privates (since they share the same secret generator).

    var Point = (function() {
    
        var priv = createSecret();

        function Point(x, y) {
            priv(this).x = x;
            priv(this).y = y;
        }

        Point.prototype.getCoords = function() {
            return priv(this).x + ',' + priv(this).y;
        };

        Point.prototype.add = function(p) {
            priv(this).x += priv(p).x;
            priv(this).y += priv(p).y;
        };

        return function Point;
    
    })();

    var P = new Point(3, 4),
        Q = new Point(-5, 7);

    P.add(Q);
    P.getCoords(); // => "-2,11"
