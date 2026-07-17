// Mock chrome API required by popup.js on load
global.chrome = {
  runtime: {
    getManifest: () => ({ version: '1.0.0' }),
    lastError: null
  },
  tabs: {
    query: (queryInfo, callback) => callback([{ id: 1 }]),
    connect: () => ({
      onMessage: { addListener: () => {} },
      onDisconnect: { addListener: () => {} },
      postMessage: () => {}
    })
  }
};

// Mock required DOM elements for popup.js initialization
document.body.innerHTML = `
  <div id="video-list"></div>
  <div id="version"></div>
`;
