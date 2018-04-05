var peek = require('./index')
  , test = require('tape')

test('Test basic fetches', function(assert) {
  assert.strictEqual(peek('a')({a: 5}), 5)
  assert.strictEqual(peek('')({'': 6}), 6)

  assert.end()
})

test('Test advanced fetches', function(assert) {
  var find = peek('part.key.attribute')
    , found = find({part: {key: {attribute: 'woop woop'}}})
  assert.strictEqual(found, 'woop woop')

  var not_found = find({}) || find() || find(null)
  assert.strictEqual(not_found, undefined)

  var fetch = peek('foo')
  assert.strictEqual(fetch({foo: 'bar!'}), 'bar!')

  // Having created a second object should not interfere with the first.
  assert.strictEqual(find({part: {key: {attribute: 'beep beep'}}}), 'beep beep')

  assert.end()
})

test('Test example from README', function(assert) {
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
  assert.strictEqual(booty(pirate_ship), '5000 gold')

  assert.end()
})

test('Test exception cases', function(assert) {
  [{}, true, undefined, null, 5, Infinity].forEach(function(bad_type) {
    assert.throws(function() { peek(bad_type) }, TypeError)
  })

  assert.end()
})
