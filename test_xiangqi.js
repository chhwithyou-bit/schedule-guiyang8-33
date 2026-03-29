const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  resources: "usable"
});

const window = dom.window;
const document = window.document;

// Simulate loading external JS since JSDOM might not load local files cleanly in some setups
const xiangqiJs = fs.readFileSync('xiangqi.js', 'utf8');
const scriptEl = document.createElement("script");
scriptEl.textContent = xiangqiJs;
document.head.appendChild(scriptEl);

window.onload = () => {
    try {
        console.log("DOM loaded. Current page:", window.currentPage);
        const btn = document.getElementById('nav-xiangqi');
        if (!btn) throw new Error("nav-xiangqi button not found");
        
        console.log("Clicking Xiangqi tab...");
        window.navTo('xiangqi');
        
        setTimeout(() => {
            const pageXiangqi = document.getElementById('page-xiangqi');
            if (!pageXiangqi.classList.contains('active')) {
                console.error("page-xiangqi is not active!");
            } else {
                console.log("page-xiangqi became active.");
            }
            
            const board = document.getElementById('xiangqi-board');
            console.log("Pieces on board:", board.querySelectorAll('.xq-piece').length);
            
            // Check for errors in the console
            console.log("Done checking.");
        }, 100);
    } catch(e) {
        console.error("Error:", e);
    }
};
