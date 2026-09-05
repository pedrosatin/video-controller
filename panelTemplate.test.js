/**
 * @jest-environment jsdom
 */

describe('panelTemplate.js', () => {
  beforeEach(() => {
    delete window.VC_PANEL_TEMPLATE
    jest.resetModules()
  })

  it('exports VC_PANEL_TEMPLATE to window and module.exports', () => {
    const moduleExports = require('./panelTemplate.js')

    expect(moduleExports).toBeDefined()
    expect(typeof moduleExports.VC_PANEL_TEMPLATE).toBe('string')

    expect(window.VC_PANEL_TEMPLATE).toBeDefined()
    expect(typeof window.VC_PANEL_TEMPLATE).toBe('string')

    expect(moduleExports.VC_PANEL_TEMPLATE).toBe(window.VC_PANEL_TEMPLATE)
  })

  it('contains expected HTML structure and IDs', () => {
    const { VC_PANEL_TEMPLATE } = require('./panelTemplate.js')

    const expectedIds = [
      'id="vc-header"',
      'id="vc-video-sel"',
      'id="vc-play-pause"',
      'id="vc-progress"',
      'id="vc-mute-btn"',
      'id="vc-vol-slider"',
      'id="vc-fullscreen-btn"',
      'id="vc-pip-btn"',
      'id="vc-loop-btn"',
    ]

    expectedIds.forEach((id) => {
      expect(VC_PANEL_TEMPLATE).toContain(id)
    })
  })
})
