# peek

Access deeply nested object properties using a path string.

### Advantages over literal access

* The expression `obj.foo.bar` will throw a TypeError if `obj.foo` is not an
  object. peeking will yield `undefined`, instead.
* Wacky property names: `obj['the question is']["'doctor who?'"]` is verbose
  compared to peeking with `the question is.'doctor who?'`.

### Other uses for peek

* Accessing variably-nested properties programmatically.
* Accessing the same nested property of multiple objects.

## Usage

```javascript

  var peek = require('peek')

  var booty = peek("lower deck.captain's quarters.secret panel.treasure")
  var pirate_ship = {
    'lower deck': {
      "captain's quarters": {
        'secret panel': {
          treasure: '5000 gold'
        }
      }
    }
  }

  console.log(booty(pirate_ship)) // == "5000 gold"
```

## Limitations

Property names may not contain dots, as all dots are interpreted as object
key separators.

## Running the tests

```
  $ git clone https://github.com/adamdicarlo/peek.git # clone or fork
  $ cd peek
  $ npm install
  $ npm test
```

## License

MIT
