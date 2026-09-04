/**
 * @jest-environment jsdom
 */

describe('panelTemplate.js', () => {
  beforeEach(() => {
    delete window.createPanelDOM
    jest.resetModules()
  })

  it('exports createPanelDOM to window and module.exports', () => {
    const moduleExports = require('./panelTemplate.js')

    expect(moduleExports).toBeDefined()
    expect(typeof moduleExports.createPanelDOM).toBe('function')

    expect(window.createPanelDOM).toBeDefined()
    expect(typeof window.createPanelDOM).toBe('function')

    expect(moduleExports.createPanelDOM).toBe(window.createPanelDOM)
  })

  it('contains expected DOM structure and IDs', () => {
    const { createPanelDOM } = require('./panelTemplate.js')
    const frag = createPanelDOM()

    const expectedIds = [
      'vc-header',
      'vc-video-sel',
      'vc-play-pause',
      'vc-progress',
      'vc-mute-btn',
      'vc-vol-slider',
      'vc-fullscreen-btn',
      'vc-pip-btn',
      'vc-loop-btn',
    ]

    expectedIds.forEach((id) => {
      // DocumentFragment supports getElementById in modern browsers/jsdom
      // but if not we can use querySelector
      expect(frag.querySelector(`#${id}`)).not.toBeNull()
    })
  })
})
