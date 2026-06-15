const fs = require('fs');
let content = fs.readFileSync('presentation_script.html', 'utf-8');

const html = `<html><head><style>
body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; line-height: 1.5; color: #000; padding: 20px; max-width: 800px; margin: auto; }
h1 { font-size: 18pt; color: #2F5496; border-bottom: 2px solid #2F5496; padding-bottom: 5px; }
h2 { font-size: 14pt; color: #2F5496; margin-top: 20px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
h3 { font-size: 12pt; color: #1F3763; margin-top: 15px; }
p { margin-bottom: 10px; }
li { margin-bottom: 8px; }
strong { color: #000; }
em { color: #555; background-color: #f9f9f9; padding: 2px 5px; border-radius: 3px; font-style: italic; }
</style></head><body>
${content}
</body></html>`;

fs.writeFileSync('presentation_script.html', html, 'utf-8');
console.log('Presentation HTML wrapped!');
