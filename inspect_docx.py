import docx

doc = docx.Document('Project-Proposal(DES-M&S).docx')
for i, p in enumerate(doc.paragraphs):
    if p.text.strip():
        print(f"[{i}] {p.text}")
