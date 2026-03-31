const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  resources: "usable"
});

const window = dom.window;
const document = window.document;

const xiangqiJs = fs.readFileSync('public/xiangqi.js', 'utf8');
const scriptEl = document.createElement("script");
scriptEl.textContent = xiangqiJs;
document.head.appendChild(scriptEl);

window.onload = () => {
    try {
        console.log("DOM loaded. Clicking Xiangqi tab...");
        window.navTo('xiangqi');
        setTimeout(() => {
            const board = document.getElementById('xiangqi-board');
            console.log("Pieces on board:", board.querySelectorAll('.xq-piece').length);
            console.log("Done");
        }, 100);
    } catch(e) {
        console.error("RUNTIME ERROR:", e);
    }
};

window.addEventListener('error', (event) => {
    console.error("GLOBAL ERROR:", event.error);
});
