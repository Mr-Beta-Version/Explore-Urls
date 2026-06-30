const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const countEl = document.getElementById('count');
let currentResults = [];

function render(list) {
  currentResults = list;
  countEl.textContent = list.length;
  resultsEl.innerHTML = list.map(u => `<div>${u}</div>`).join('');
}

// This function is injected into the page itself, so fetch() uses the
// page's own origin/cookies and same-origin script files can be read.
function extractFromPage() {
  return new Promise((resolve) => {
    const regex = /(?<=("|%27|`))\/[a-zA-Z0-9_?&=\/\-#.]*(?=("|'|%60))/g;
    const results = new Set();

    function makeFullUrl(path) {
      try {
        return new URL(path, location.origin).href;
      } catch (e) {
        return path;
      }
    }

    const scripts = Array.from(document.getElementsByTagName('script'))
      .map(s => s.src)
      .filter(Boolean);

    const fetches = scripts.map(src =>
      fetch(src)
        .then(res => res.text())
        .then(text => {
          for (const m of text.matchAll(regex)) results.add(makeFullUrl(m[0]));
        })
        .catch(() => {})
    );

    const pageContent = document.documentElement.outerHTML;
    for (const m of pageContent.matchAll(regex)) results.add(makeFullUrl(m[0]));

    Promise.allSettled(fetches).then(() => {
      resolve(Array.from(results).sort());
    });
  });
}

async function runScan() {
  statusEl.textContent = 'Scanning...';
  render([]);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    statusEl.textContent = 'No active tab.';
    return;
  }
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: extractFromPage
    });
    const list = injection.result || [];
    render(list);
    statusEl.textContent = `Done. Scanned ${document.title ? '' : ''}page.`;
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
  }
}

document.getElementById('run').addEventListener('click', runScan);

document.getElementById('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(currentResults.join('\n'));
  statusEl.textContent = 'Copied to clipboard.';
});

document.getElementById('download').addEventListener('click', () => {
  const blob = new Blob([currentResults.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename: 'extracted-urls.txt' });
});

// Auto-run on open
runScan();
