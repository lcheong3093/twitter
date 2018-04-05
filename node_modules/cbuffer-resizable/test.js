/**
 * Created by root on 25/08/14.
 */

var buffer = require('./index');

var b = new buffer(4);

b.push(2);
b.push(2);
b.push(2);

console.log(b);

b.push(2);

console.log(b);

b.push(2);
console.log(b);