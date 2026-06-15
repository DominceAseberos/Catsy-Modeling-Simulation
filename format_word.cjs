const fs = require('fs');

let content = fs.readFileSync('documentation_for_word.html', 'utf-8');

// Replace markdown's code block for mermaid with an actual image tag
content = content.replace(
    /<pre><code class="language-mermaid">[\s\S]*?<\/code><\/pre>/g, 
    '<br/><img src="process_diagram.png" alt="Process Diagram" style="max-width: 100%; border: 1px solid #ccc; margin: 20px 0;" /><br/>'
);

const html = `<html><head><style>
body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; line-height: 1.5; color: #000; }
h1 { font-size: 18pt; color: #2F5496; }
h2 { font-size: 14pt; color: #2F5496; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
h3 { font-size: 12pt; color: #1F3763; }
li { margin-bottom: 8px; }
strong { color: #000; }
</style></head><body>
${content}
</body></html>`;

fs.writeFileSync('documentation_for_word.html', html, 'utf-8');
console.log('Done!');
