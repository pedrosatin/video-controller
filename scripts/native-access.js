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
  const _desc = (prop) => Object.getOwnPropertyDescriptor(_proto, prop) || {}
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
      return video[prop]
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
