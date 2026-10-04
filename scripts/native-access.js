;(function () {
  'use strict'

  // ══════════════════════════════════════════════════════════════════════════
  // NATIVE PROPERTY ACCESSORS
  //
  // Grabbing the original get/set from HTMLMediaElement.prototype lets us
  // bypass per-instance overrides that some players set via
  // Object.defineProperty(videoElement, 'playbackRate', { set: locked }).
  // ══════════════════════════════════════════════════════════════════════════
  const _proto = typeof HTMLMediaElement !== 'undefined' ? HTMLMediaElement.prototype : {}
  const _descCache = Object.create(null)
  const _desc = (prop) => {
    let desc = _descCache[prop]
    if (!desc) {
      desc = Object.getOwnPropertyDescriptor(_proto, prop) || {}
      // In testing environments we shouldn't cache the descriptors because jest.spyOn
      // dynamically replaces them on the prototype, and caching would cause us to
      // reuse stale mocks or bypass new ones.
      if (typeof jest === 'undefined') {
        _descCache[prop] = desc
      }
    }
    return desc
  }
  const _rawSet = (prop) => _desc(prop).set
  const _rawGet = (prop) => _desc(prop).get

  function _set(video, prop, value) {
    const setter = _rawSet(prop)
    try {
      if (setter) setter.call(video, value)
      else video[prop] = value
    } catch {
      /* silently ignore; the native API should always work */
    }
  }

  function _get(video, prop) {
    const getter = _rawGet(prop)
    try {
      return getter ? getter.call(video) : video[prop]
    } catch {
      try {
        return video[prop]
      } catch {
        return undefined
      }
    }
  }

  const nativeAccess = { _desc, _rawGet, _rawSet, _get, _set }

  if (typeof window !== 'undefined') {
    window._vcNativeAccess = nativeAccess
    window._desc = _desc
    window._rawGet = _rawGet
    window._rawSet = _rawSet
    window._get = _get
    window._set = _set
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = nativeAccess
  }
})()
