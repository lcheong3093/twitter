module.exports = function(path) {
  if (typeof path !== 'string') {
    throw new TypeError('path must be a string')
  }
  var parts = path.split('.')
  return function(obj) {
    return parts.reduce(function(obj, segment) {
      if(obj === null || typeof obj !== 'object') {
        return undefined
      }
      return obj[segment]
    }, obj)
  }
}
