// Builds alex-rivera.docx (FAKE resume, same content as alex-rivera.html) with real
// hyperlinks. A .docx is a zip of XML files; jszip comes with mammoth.
// Run: node tests/fixtures/resumes/make-docx.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const here = dirname(fileURLToPath(import.meta.url));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const links = [];
const run = (text, bold = false) =>
  `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const link = (text, url) => {
  links.push(url);
  return `<w:hyperlink r:id="rLink${links.length}">${run(text)}</w:hyperlink>`;
};
const p = (...runs) => `<w:p>${runs.map((r) => (r.startsWith('<') ? r : run(r))).join('')}</w:p>`;

const body = [
  p(run('Alex J. Rivera', true)),
  p('San Jose, CA 95112, USA · +1 (555) 010-0142 · alex.rivera@example.com'),
  p(
    link('LinkedIn', 'https://www.linkedin.com/in/alex-rivera-example'),
    ' · ',
    link('GitHub', 'https://github.com/alex-rivera-example'),
    ' · ',
    link('Portfolio', 'https://alexrivera.example.com'),
  ),
  p(run('Summary', true)),
  p('Systems engineer with 6 years of experience building high-performance storage and distributed training infrastructure.'),
  p(run('Experience', true)),
  p(run('Senior Software Engineer', true), ', Example Compute Inc. — Santa Clara, CA'),
  p('March 2022 – Present'),
  p('• Led design of a parallel file system cache that cut GPU training data stalls by 40%.'),
  p('• Built NCCL-based collective benchmarks across 512 GPUs.'),
  p(run('Software Engineer', true), ', Sample Storage Systems — Austin, TX'),
  p('June 2019 – February 2022'),
  p('• Maintained Lustre and Ceph clusters serving 20 PB for HPC workloads.'),
  p(run('Education', true)),
  p(run('University of Example', true), ' — M.S. Computer Science, 2017 – 2019, GPA 3.8/4.0'),
  p(run('Sample State University', true), ' — B.S. Computer Engineering, 2013 – 2017'),
  p(run('Skills', true)),
  p('C++, Python, CUDA, NCCL, MPI, Lustre, Ceph, Kubernetes, Linux'),
  p(run('Certifications', true)),
  p('Certified Kubernetes Administrator — CNCF, 2021'),
  p(run('Languages', true)),
  p('English, Spanish'),
].join('');

const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const zip = new JSZip();
zip.file(
  '[Content_Types].xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
);
zip.file(
  '_rels/.rels',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>
</Relationships>`,
);
zip.file(
  'word/_rels/document.xml.rels',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${links.map((url, i) => `<Relationship Id="rLink${i + 1}" Type="${REL}/hyperlink" Target="${esc(url)}" TargetMode="External"/>`).join('\n')}
</Relationships>`,
);
zip.file(
  'word/document.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}"><w:body>${body}</w:body></w:document>`,
);

const out = join(here, 'alex-rivera.docx');
writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('Wrote', out);
