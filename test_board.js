const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  resources: "usable",
  url: "http://localhost/"
});

const window = dom.window;
const document = window.document;

// Mock requestAnimationFrame for JSDOM
window.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// Provide a mock fetch
window.fetch = async (url) => {
    return {
        ok: true,
        json: async () => ({})
    };
};

// Catch any unhandled errors
window.addEventListener('error', (event) => {
    console.error("Browser error:", event.error);
});

const xiangqiJs = fs.readFileSync('public/xiangqi.js', 'utf8');
const scriptEl = document.createElement("script");
scriptEl.textContent = xiangqiJs;
document.head.appendChild(scriptEl);

window.onload = () => {
    try {
        console.log("DOM loaded. Current page:", window.currentPage);
        
        // Wait a bit for async operations if any
        setTimeout(() => {
            const board = document.getElementById('xiangqi-board');
            if(!board) {
                console.error("Board not found");
            } else {
                console.log("Board innerHTML length:", board.innerHTML.length);
                console.log("Grid lines:", board.querySelectorAll('.xq-grid-line').length);
                console.log("Pieces:", board.querySelectorAll('.xq-piece').length);
            }
            process.exit(0);
        }, 100);
    } catch(e) {
        console.error("Test Error:", e);
        process.exit(1);
    }
};
