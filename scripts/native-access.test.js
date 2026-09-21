/**
 * @jest-environment jsdom
 */

const nativeAccess = require('./native-access.js')
const { _desc, _rawGet, _rawSet, _get, _set } = nativeAccess

describe('nativeAccess module', () => {
  it('exports all native access functions in module.exports and on window', () => {
    expect(typeof _desc).toBe('function')
    expect(typeof _rawGet).toBe('function')
    expect(typeof _rawSet).toBe('function')
    expect(typeof _get).toBe('function')
    expect(typeof _set).toBe('function')

    expect(window._vcNativeAccess).toEqual(nativeAccess)
    expect(window._desc).toBe(_desc)
    expect(window._rawGet).toBe(_rawGet)
    expect(window._rawSet).toBe(_rawSet)
    expect(window._get).toBe(_get)
    expect(window._set).toBe(_set)
  })
})

describe('_desc helper', () => {
  it('returns property descriptor for existing prototype properties', () => {
    const desc = _desc('currentTime')
    expect(desc).toBeDefined()
    expect(typeof desc).toBe('object')
  })

  it('returns an empty object when property does not exist', () => {
    const desc = _desc('nonExistentProperty')
    expect(desc).toEqual({})
  })
})

describe('_rawGet and _rawSet helpers', () => {
  const propertyName = 'mockRawProp'
  let origDescriptor

  beforeEach(() => {
    origDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, propertyName)
  })

  afterEach(() => {
    if (origDescriptor) {
      Object.defineProperty(HTMLMediaElement.prototype, propertyName, origDescriptor)
    } else {
      delete HTMLMediaElement.prototype[propertyName]
    }
  })

  it('extracts getter and setter from prototype descriptor', () => {
    const getter = () => 'val'
    const setter = () => {}
    Object.defineProperty(HTMLMediaElement.prototype, propertyName, {
      get: getter,
      set: setter,
      configurable: true,
    })

    expect(_rawGet(propertyName)).toBe(getter)
    expect(_rawSet(propertyName)).toBe(setter)
  })

  it('returns undefined when getter or setter do not exist', () => {
    expect(_rawGet('nonExistentProp')).toBeUndefined()
    expect(_rawSet('nonExistentProp')).toBeUndefined()
  })
})

describe('_get helper', () => {
  let video

  beforeEach(() => {
    video = document.createElement('video')
  })

  it('retrieves property using prototype getter if available', () => {
    video.playbackRate = 2.5
    expect(_get(video, 'playbackRate')).toBe(2.5)
  })

  it('retrieves property directly if no prototype getter exists', () => {
    video.customProperty = 'customValue'
    expect(_get(video, 'customProperty')).toBe('customValue')
  })

  it('falls back to direct property access when prototype getter throws', () => {
    const propertyName = 'throwingGetterProp'
    video[propertyName] = 'fallbackVal'

    const origDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, propertyName)
    Object.defineProperty(HTMLMediaElement.prototype, propertyName, {
      get: () => {
        throw new Error('Getter failed')
      },
      configurable: true,
    })

    try {
      expect(_get(video, propertyName)).toBe('fallbackVal')
    } finally {
      if (origDesc) {
        Object.defineProperty(HTMLMediaElement.prototype, propertyName, origDesc)
      } else {
        delete HTMLMediaElement.prototype[propertyName]
      }
    }
  })
})

describe('_set helper', () => {
  let video

  beforeEach(() => {
    video = document.createElement('video')
  })

  it('uses prototype setter when available', () => {
    const propertyName = 'mockSetterProp'
    let calledWith = null

    const origDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, propertyName)
    Object.defineProperty(HTMLMediaElement.prototype, propertyName, {
      set: (val) => {
        calledWith = val
      },
      configurable: true,
    })

    try {
      _set(video, propertyName, 'testVal')
      expect(calledWith).toBe('testVal')
    } finally {
      if (origDesc) {
        Object.defineProperty(HTMLMediaElement.prototype, propertyName, origDesc)
      } else {
        delete HTMLMediaElement.prototype[propertyName]
      }
    }
  })

  it('falls back to direct property assignment when prototype setter is not available', () => {
    _set(video, 'directProp', 'directVal')
    expect(video.directProp).toBe('directVal')
  })

  it('silently ignores errors thrown by the prototype setter', () => {
    const propertyName = 'errorSetterProp'
    const origDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, propertyName)

    Object.defineProperty(HTMLMediaElement.prototype, propertyName, {
      set: () => {
        throw new Error('Setter exploded')
      },
      configurable: true,
    })

    try {
      expect(() => _set(video, propertyName, 'val')).not.toThrow()
    } finally {
      if (origDesc) {
        Object.defineProperty(HTMLMediaElement.prototype, propertyName, origDesc)
      } else {
        delete HTMLMediaElement.prototype[propertyName]
      }
    }
  })

  it('silently ignores errors during direct assignment', () => {
    Object.preventExtensions(video)
    expect(() => _set(video, 'cannotAdd', 'value')).not.toThrow()
  })
})
