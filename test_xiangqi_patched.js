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

const xiangqiJs = fs.readFileSync('public/xiangqi.js', 'utf8');
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
            if(!board) {
                console.error("Board not found");
            } else {
                console.log("Pieces on board:", board.querySelectorAll('.xq-piece').length);
            }
            
            // Output any inner errors
            console.log("xiangqi-container innerHTML snippet:", document.getElementById('xiangqi-container').innerHTML.substring(0, 200));
            console.log("Done checking.");
            process.exit(0);
        }, 500);
    } catch(e) {
        console.error("Error:", e);
        process.exit(1);
    }
};
