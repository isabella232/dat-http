var url = require('url')
var request = require('request')
var datStorage = require('dat-storage')
var LRU = require("lru-cache")

var lruOptions = {
  max: 500 * 1024 * 1024,
  length: function (n, key) { return n.length },
  maxAge: 1000 * 60 * 60
}
var cache = LRU(lruOptions)

module.exports = function (host) {
  return datStorage(function (filename) {
    return HTTPFile(url.resolve(host, filename))
  })
}

function HTTPFile (uri, opts) {
  if (!(this instanceof HTTPFile)) return new HTTPFile(uri, opts)
  if (!opts) opts = {}
  this.uri = uri
  this.pending = 0
}

HTTPFile.prototype.open = function (cb) {
  if (cb) process.nextTick(cb)
}

HTTPFile.prototype.write = function (offset, data, cb) {
  if (cb) process.nextTick(cb)
}

HTTPFile.prototype.read = function (start, len, cb) {
  var self = this
  var end = start + len
  var opts = {
    encoding: null, // Buffer response
    headers: {
      "Range": `bytes=${start}-${end - 1}` // byte requests are inclusive
    }
  }
  
  var key = self.uri + ':' + opts.headers.Range
  var cached = cache.get(key)
  if (cached) {
    process.nextTick(function () {
      cb(null, cached)
    })
    return
  }
  
  this.pending++
  request(this.uri, opts, function (err, resp, body) {
    self.pending--
    if (err || resp.statusCode > 299) {
      return cb(err || new Error('Request Error ' + resp.statusCode + ', ' + self.uri))
    }
    if (body.length < len) return cb(new Error('Response shorter than requested range'))
    var range = resp.headers['content-range']
    if ((resp.statusCode === 206 || range) && range) { // in case server doesnt respond with 206 but sends range
      if (body.length !== len) return cb(new Error(`Response length different than requested length (${body.length}, ${len})`))
      cache.set(key, body)
      return cb(null, body)
    }
    var part = body.slice(offset, offset + len)
    cache.set(key, body)
    cb(null, part)
  })
}

HTTPFile.prototype.del = function (offset, len, cb) {
  throw new Error('del not supported by dat-http')
  if (cb) process.nextTick(cb)
}

HTTPFile.prototype.close = function (cb) {
  if (this.pending) return setTimeout(this.close.bind(this, cb), 100)
  if (cb) process.nextTick(cb)
}

HTTPFile.prototype.destroy = function (cb) {
  if (cb) process.nextTick(cb)
}
